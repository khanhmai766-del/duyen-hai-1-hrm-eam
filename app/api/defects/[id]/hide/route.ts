import { Prisma } from "@prisma/client";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { defectAuditReference } from "@/lib/defect-audit";
import { HIDDEN_DEFECT_SYNC_STATE } from "@/lib/defect-visibility";
import { invalidateDefectListCache } from "@/lib/defect-list-cache";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { hideMissingDefect, HideMissingDefectError } from "@/lib/server/defect-hide";

export const dynamic = "force-dynamic";

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-delete", ["full"], "Không đủ quyền ẩn phiếu khiếm khuyết");
    const { id } = await props.params;
    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 1000) return fail("Vui lòng nhập lý do ẩn từ 5 đến 1.000 ký tự");
    const updatedAt = new Date(typeof body?.updatedAt === "string" ? body.updatedAt : "");
    if (!Number.isFinite(updatedAt.getTime())) return fail("Thiếu phiên bản phiếu; vui lòng tải lại danh sách");
    const access = await resolveEquipmentAccessForUser(user);
    try {
      const existing = await prisma.$transaction(
        (tx) => hideMissingDefect(tx, {
          id,
          updatedAt,
          canEdit: (defect) => !access.hasExplicitScopes || access.canEditDeviceLike(defect),
        }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      // Xóa cache sau COMMIT, kể cả khi một lượt đọc cũ chạy trong transaction.
      invalidateDefectListCache();
      await audit(user.id, "HIDE_MISSING_DEFECT", "Defect", id, auditDetailWithPosition(user,
        `${defectAuditReference("Ẩn phiếu mất nguồn", existing)} · Lý do: ${reason}`,
      ), {
        beforeData: { syncState: existing.syncState },
        afterData: { syncState: HIDDEN_DEFECT_SYNC_STATE, reason },
        changedFields: ["syncState"],
        saveToAuditLog: true,
      });
      return ok({ id, syncState: HIDDEN_DEFECT_SYNC_STATE });
    } catch (error) {
      if (error instanceof HideMissingDefectError) return fail(error.message, error.status);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        return fail("Phiếu đang được cập nhật hoặc đồng bộ; vui lòng tải lại danh sách rồi thử lại", 409);
      }
      throw error;
    }
  });
}
