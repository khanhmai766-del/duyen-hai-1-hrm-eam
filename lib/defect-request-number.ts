import { Prisma } from "@prisma/client";

/**
 * Cấp số yêu cầu nguyên tử theo năm phát hiện. Hàm phải chạy trong cùng
 * transaction tạo Defect để hai yêu cầu mới trên website không thể nhận cùng số.
 *
 * Mỗi loại phiếu có bộ đếm riêng theo năm: Cơ và Điện không dùng chung dãy STT;
 * sang năm mới từng dãy bắt đầu lại từ 1. Dữ liệu Sheet lịch sử có STT trùng nên
 * không đặt unique toàn bảng.
 */
export async function nextDefectRequestNumber(
  tx: Prisma.TransactionClient,
  year: number,
  requestType: string
): Promise<string> {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error("Năm phát hiện không hợp lệ để cấp số yêu cầu");
  }
  const sequenceType = requestType.trim();
  if (!sequenceType) throw new Error("Loại phiếu không hợp lệ để cấp số yêu cầu");

  const isEnvironment = sequenceType === "Môi Trường";
  const requestPattern = isEnvironment ? "^QT[0-9]+/[0-9]{4}$" : "^[0-9]+/[0-9]{4}$";
  const numberExpressionPrefix = isEnvironment ? "^QT" : "^";

  const rows = await tx.$queryRaw<Array<{ currentValue: number }>>`
    INSERT INTO "DefectRequestSequence" ("year", "requestType", "currentValue", "updatedAt")
    VALUES (
      ${year},
      ${sequenceType},
      COALESCE((
        SELECT MAX(regexp_replace(split_part("requestNumber", '/', 1), ${numberExpressionPrefix}, '')::int)
        FROM "Defect"
        WHERE "requestNumber" ~* ${requestPattern}
          AND split_part("requestNumber", '/', 2)::int = ${year}
          AND "requestType" = ${sequenceType}
      ), 0) + 1,
      NOW()
    )
    ON CONFLICT ("year", "requestType") DO UPDATE
    SET "currentValue" = GREATEST(
          "DefectRequestSequence"."currentValue" + 1,
          COALESCE((
            SELECT MAX(regexp_replace(split_part("requestNumber", '/', 1), ${numberExpressionPrefix}, '')::int)
            FROM "Defect"
            WHERE "requestNumber" ~* ${requestPattern}
              AND split_part("requestNumber", '/', 2)::int = ${year}
              AND "requestType" = ${sequenceType}
          ), 0) + 1
        ),
        "updatedAt" = NOW()
    RETURNING "currentValue"
  `;

  const sequence = rows[0]?.currentValue;
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Không thể cấp số yêu cầu");
  }
  return `${isEnvironment ? `QT${String(sequence).padStart(2, "0")}` : sequence}/${year}`;
}
