import type { NextRequest } from "next/server";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { DEFECT_STATUS } from "@/lib/constants";
import { revertMaterialRequestReplacements } from "@/lib/defect-material-request";
import { enqueueDefectSyncEvent } from "@/lib/defect-sync-outbox";
import { isDefectSyncFeatureEnabled } from "@/lib/defect-two-way-sync";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";

const REOPEN_STATUSES = ["CHUA_XU_LY", "CO_PCT", "CHO_VAT_TU", "CHO_NGUNG_MAY"] as const;
type ReopenStatus = (typeof REOPEN_STATUSES)[number];

function isReopenStatus(value: string): value is ReopenStatus {
  return REOPEN_STATUSES.some((status) => status === value);
}

/** Rút một phiếu khỏi hàng chờ chốt và đưa lại về danh sách Khiếm khuyết. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      "defect-close",
      ["manage", "full"],
      "Không đủ quyền rút xác nhận chờ chốt"
    );

    const body = await req.json().catch(() => ({}));
    const targetStatus = String(body.status ?? "");
    if (!isReopenStatus(targetStatus)) {
      return fail("Trạng thái đưa về không hợp lệ");
    }

    const defect = await prisma.defect.findUnique({
      where: { id: params.id },
      include: { pendingHistory: { select: { id: true } } },
    });
    if (!defect) return fail("Không tìm thấy phiếu khiếm khuyết", 404);
    if (!defect.pendingHistory || defect.syncState === "CONFIRMED") {
      return fail("Phiếu không còn ở trạng thái chờ chốt lịch sử", 409);
    }

    const access = await resolveEquipmentAccessForUser(user);
    if (access.hasExplicitScopes && !access.canEditDeviceLike({ device: defect.device, system: defect.system })) {
      return fail("Cương vị của bạn không có quyền thao tác trên phiếu khiếm khuyết này", 403);
    }
    if (!(await isDefectSyncFeatureEnabled("UPDATE"))) {
      return fail("Tính năng cập nhật Vận hành từ website đang tạm khóa; chưa thể đưa phiếu trở lại Tồn đọng", 503);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Dùng cùng khóa với tiến trình chốt để không thể vừa chốt vừa rút một bản nháp.
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${defect.pendingHistory!.id}))::text AS "lock"
      `;
      const current = await tx.defectHistoryPending.findUnique({
        where: { id: defect.pendingHistory!.id },
        select: { id: true },
      });
      if (!current) return null;

      const updated = await tx.defect.update({
        where: { id: defect.id },
        data: {
          status: targetStatus,
          completedAt: null,
          postRepairAwaitingMaterial: false,
          confirmedAt: null,
          confirmedById: null,
          confirmedByName: null,
          confirmedHistoryId: null,
          syncState: "ACTIVE",
          createdById: user.id,
        },
      });
      await tx.defectHistoryPending.delete({ where: { id: current.id } });

      const materialReversal = updated.isMaterialRequest
        ? await revertMaterialRequestReplacements(tx, { defectId: updated.id })
        : null;
      const syncEvent = await enqueueDefectSyncEvent(tx, {
        defect: updated,
        eventType: "UPDATE",
        extra: { writeScope: "SHEET_ORIGIN_LIMITED" },
      });
      if (!syncEvent) throw new Error("DEFECT_REOPEN_SYNC_NOT_QUEUED");
      return { updated, materialReversal, syncQueued: Boolean(syncEvent) };
    }).catch((error) => {
      if (error instanceof Error && error.message === "DEFECT_REOPEN_SYNC_NOT_QUEUED") {
        throw fail("Không tạo được tác vụ cập nhật Google Sheet; phiếu vẫn được giữ ở trạng thái chờ chốt", 503);
      }
      throw error;
    });

    if (!result) return fail("Phiếu vừa được chốt bởi một thao tác khác; vui lòng tải lại trang", 409);

    await audit(
      user.id,
      "REOPEN_DEFECT_PENDING_HISTORY",
      "Defect",
      defect.id,
      auditDetailWithPosition(
        user,
        `${defect.requestNumber ?? "Không có số yêu cầu"} · Đưa về ${DEFECT_STATUS[targetStatus].label}`
      )
    );

    return ok({
      id: result.updated.id,
      status: result.updated.status,
      syncQueued: result.syncQueued,
      materialReversal: result.materialReversal,
    });
  });
}
