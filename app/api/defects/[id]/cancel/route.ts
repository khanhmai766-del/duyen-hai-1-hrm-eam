import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { enqueueDefectSyncEvent } from "@/lib/defect-sync-outbox";
import { publicUserRef } from "@/lib/s3";
import { isDefectSyncFeatureEnabled } from "@/lib/defect-two-way-sync";
import { defectAuditReference } from "@/lib/defect-audit";
import {
  detachMaterialTicketsFromDefect,
  moTaGoPhieuVatTu,
  revertMaterialRequestReplacements,
} from "@/lib/defect-material-request";

const INCLUDE = {
  createdBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } },
  node: { select: { seq: true, name: true } },
  relatedDevices: {
    select: { deviceSeq: true, mappedUnit: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  pendingHistory: { select: { startedAt: true, finalizeAt: true } },
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      "defect-manage",
      ["manage", "full"],
      "Không đủ quyền hủy phiếu khiếm khuyết"
    );
    if (!(await isDefectSyncFeatureEnabled("UPDATE"))) {
      return fail("Tính năng cập nhật Vận hành từ website đang tạm khóa", 503);
    }
    const body = await req.json().catch(() => ({}));
    const note = String(body.note ?? "").trim();
    if (!note) return fail("Vui lòng nhập ghi chú khi hủy phiếu");

    const existing = await prisma.defect.findUnique({
      where: { id: params.id },
      include: { pendingHistory: { select: { id: true } } },
    });
    if (!existing) return fail("Không tìm thấy phiếu khiếm khuyết", 404);
    if (existing.cancelledAt) return fail("Phiếu khiếm khuyết đã được hủy trước đó", 409);
    if (existing.pendingHistory || existing.syncState === "CONFIRMED") {
      return fail("Phiếu đã xác nhận lịch sử, không thể hủy", 409);
    }
    if (existing.status === "DA_XU_LY") {
      return fail("Phiếu đã xử lý, không thể chuyển sang trạng thái hủy", 409);
    }

    const access = await resolveEquipmentAccessForUser(user);
    if (access.hasExplicitScopes && !access.canEditDeviceLike({ device: existing.device, system: existing.system })) {
      return fail("Cương vị của bạn không có quyền hủy phiếu khiếm khuyết này", 403);
    }

    const cancelledAt = new Date();
    // Kết quả gỡ phiếu vật tư — gán trong giao dịch, dùng lại khi ghi AuditLog bên dưới.
    let goPhieu = { daLui: [] as string[], giuNguyenBuoc: [] as string[], tong: 0 };
    const defect = await prisma.$transaction(async (tx) => {
      // SYC thay thế bị huỷ thì mọi dấu vết nó để lại bên vật tư phải được hoàn tác:
      // dòng lịch sử thay thế dự phòng, và liên kết trên phiếu vật tư. Thiếu bước này
      // thì phiếu vật tư vẫn khoe một số SYC đã huỷ và vẫn đứng sau cổng SYC.
      if (existing.isMaterialRequest) {
        await revertMaterialRequestReplacements(tx, { defectId: existing.id });
        goPhieu = await detachMaterialTicketsFromDefect(tx, { defectId: existing.id });
      }
      const updated = await tx.defect.update({
        where: { id: existing.id },
        data: {
          createdById: user.id,
          status: "DA_XU_LY",
          completedAt: cancelledAt,
          note,
          cancelledAt,
          cancelledById: user.id,
          cancelledByName: user.name,
          postRepairAwaitingMaterial: false,
          // Giữ phiếu trong Tồn đọng cho đến khi n8n ACK việc ghi ngược lên Sheet.
          syncState: "ACTIVE",
        },
      });
      const event = existing.sourceType === "GOOGLE_SHEETS" || existing.websiteCreated
        ? await enqueueDefectSyncEvent(tx, {
            defect: updated,
            eventType: "UPDATE",
            extra: {
              cancellation: true,
              requestNumberReuseEligible: true,
              ...(existing.sourceType === "GOOGLE_SHEETS" && !existing.websiteCreated
                ? { writeScope: "SHEET_ORIGIN_LIMITED" }
                : {}),
            },
          })
        : null;
      if (event) {
        return tx.defect.findUniqueOrThrow({
          where: { id: updated.id },
          include: INCLUDE,
        });
      }
      // Không có sự kiện đồng bộ (hai chiều đang tắt hoặc phiếu cục bộ) thì
      // có thể ẩn ngay; nếu có, ACK sẽ chuyển sang CONFIRMED sau khi Sheet ghi xong.
      return tx.defect.update({
        where: { id: updated.id },
        data: {
          syncState: "CONFIRMED",
          requestNumberReleasedAt: cancelledAt,
          requestNumberReuseEligible: true,
        },
        include: INCLUDE,
      });
    });

    await audit(
      user.id,
      "CANCEL_DEFECT",
      "Defect",
      defect.id,
      auditDetailWithPosition(
        user,
        [
          defectAuditReference("Hủy phiếu", existing),
          `Lý do: ${note}`,
          goPhieu.tong > 0 ? `Phiếu vật tư: ${moTaGoPhieuVatTu(goPhieu)}` : "",
        ].filter(Boolean).join(" · ")
      )
    );
    return ok({ ...defect, createdBy: publicUserRef(defect.createdBy) });
  });
}
