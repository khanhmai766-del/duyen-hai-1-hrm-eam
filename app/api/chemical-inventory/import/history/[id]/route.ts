import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { MANAGE_LEVELS } from "@/lib/chemical-inventory/permissions";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/chemical-inventory/import/history/[id] — xóa MỘT dòng lịch sử đồng bộ để giảm dung lượng.
 *
 * Chỉ xóa bản ghi nhật ký cùng `detail` (thống kê theo tab + danh sách ô lệch — phần nặng nhất).
 * Số liệu đã ghi (phiếu nhập, số đọc tồn, hợp đồng) KHÔNG tham chiếu tới bảng này nên giữ nguyên;
 * nhập lại cùng tệp cũng không sinh trùng vì chống trùng dựa `sourceKey` trên từng phiếu, không dựa
 * lịch sử.
 *
 * Cùng mức quyền với xem lịch sử (manage/full). Audit chỉ ghi TÓM TẮT, cố ý không chép `detail`
 * sang AuditLog — chép sang là dời dung lượng đi chỗ khác chứ không giảm.
 */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...MANAGE_LEVELS], "Không đủ quyền xóa lịch sử đồng bộ");

    const batch = await prisma.chemicalImportBatch.findUnique({
      where: { id: params.id },
      select: {
        id: true, fileName: true, fileHash: true, status: true,
        importedRows: true, updatedRows: true, skippedRows: true, errorRows: true, createdAt: true,
      },
    });
    if (!batch) throw fail("Không tìm thấy lần đồng bộ này — có thể đã bị xóa", 404);

    // deleteMany thay cho delete: hai người cùng bấm xóa thì người sau nhận 404 rõ ràng, không phải 500.
    const { count } = await prisma.chemicalImportBatch.deleteMany({ where: { id: batch.id } });
    if (count === 0) throw fail("Không tìm thấy lần đồng bộ này — có thể đã bị xóa", 404);

    await audit(
      user.id,
      "DELETE_CHEMICAL_IMPORT_BATCH",
      "ChemicalImportBatch",
      batch.id,
      auditDetailWithPosition(
        user,
        `Tệp ${batch.fileName} (${batch.fileHash}), trạng thái ${batch.status}, đồng bộ lúc ${batch.createdAt.toISOString()}: ` +
          `ghi mới ${batch.importedRows}, cập nhật ${batch.updatedRows}, bỏ qua ${batch.skippedRows}, lỗi ${batch.errorRows}`
      )
    );

    return ok({ id: batch.id });
  });
}
