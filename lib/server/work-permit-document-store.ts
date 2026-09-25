import type { WorkPermit } from "@prisma/client";
import { deleteS3ObjectByKey, uploadS3Object } from "@/lib/s3";
import { effectivePermitFormat, formatPermitNumber } from "@/lib/work-permits";
import { createWorkPermitDocument } from "@/lib/server/work-permit-document";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
type PermitKey = Pick<WorkPermit, "kind" | "year" | "number">;

/** Tên file PCT (không đuôi) — dùng chung cho nút "Tải Word" và key lưu trên S3. */
export function permitDocumentBaseName(row: PermitKey) {
  return `PCT-${row.kind === "MECHANICAL" ? "Co" : "Dien"}-${row.year}-${row.number.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/**
 * MỘT key cố định cho mỗi phiếu (số PCT là duy nhất trong loại + năm): mỗi lần lưu phiếu ghi ĐÈ
 * lên file cũ, không sinh file mới.
 */
export function permitDocumentKey(row: PermitKey) {
  return `work-permits/${row.year}/${row.kind === "MECHANICAL" ? "Co" : "Dien"}/${permitDocumentBaseName(row)}.docx`;
}

const storedPaper = (row: WorkPermit) => effectivePermitFormat(row) === "PAPER" && row.status !== "DRAFT";

/**
 * Đồng bộ file Word của PCT giấy lên S3 sau khi phiếu được ghi:
 * - Phiếu giấy đã cấp: điền lại mẫu và ghi đè key cố định của phiếu.
 * - Phiếu hủy: giữ nguyên file cuối cùng (không điền lại).
 * - Đổi số/loại/năm hoặc chuyển sang phiếu điện tử: xoá file theo key cũ để không còn file mồ côi.
 * Lỗi S3 không làm hỏng thao tác lưu phiếu (phiếu đã ghi DB); chỉ ghi log để quản trị kiểm tra.
 */
export async function syncPermitDocument(after: WorkPermit | null, before?: WorkPermit | null) {
  try {
    const newKey = after && storedPaper(after) ? permitDocumentKey(after) : null;
    if (after && newKey && after.status !== "CANCELLED") {
      await uploadS3Object({ key: newKey, body: await createWorkPermitDocument(after), contentType: DOCX, originalName: `${permitDocumentBaseName(after)}.docx` });
    }
    const oldKey = before && storedPaper(before) ? permitDocumentKey(before) : null;
    if (oldKey && oldKey !== newKey) await deleteS3ObjectByKey(oldKey);
  } catch (error) {
    const row = after ?? before;
    console.error(`Không lưu được file PCT ${row ? formatPermitNumber(row) : ""} lên S3:`, error);
  }
}
