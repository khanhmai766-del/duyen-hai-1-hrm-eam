import { Prisma } from "@prisma/client";

export type DefectRequestNumberAllocation = {
  requestNumber: string;
  reusedCancelledDefectId: string | null;
};

const REQUEST_NUMBER_REUSE_WINDOW_HOURS = 6;

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

/**
 * Ưu tiên nhận lại STT của phiếu được hủy trong vòng 6 giờ kể từ lúc tạo và đã
 * được Google Sheet ACK. Cửa sổ trượt này bám theo thời gian thao tác thực tế
 * trong một ca, không bị đứt tại 00:00 và không đưa phiếu cũ vào kho. Khóa
 * advisory theo năm/loại giữ cho hai transaction tạo đồng thời không thể nhận
 * cùng một STT. Nếu kho trống thì tiếp tục dùng bộ đếm tăng dần hiện có.
 */
export async function allocateDefectRequestNumber(
  tx: Prisma.TransactionClient,
  year: number,
  requestType: string
): Promise<DefectRequestNumberAllocation> {
  const sequenceType = requestType.trim();
  if (!Number.isInteger(year) || year < 2000 || year > 9999 || !sequenceType) {
    throw new Error("Thông tin cấp số yêu cầu không hợp lệ");
  }

  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`defect-request-number:${year}:${sequenceType}`}, 0))
  `;

  const isEnvironment = sequenceType === "Môi Trường";
  const requestPattern = isEnvironment ? "^QT[0-9]+/[0-9]{4}$" : "^[0-9]+/[0-9]{4}$";
  const numberExpressionPrefix = isEnvironment ? "^QT" : "^";
  const now = new Date();
  const reuseCutoff = new Date(now.getTime() - REQUEST_NUMBER_REUSE_WINDOW_HOURS * 60 * 60 * 1000);
  const released = await tx.$queryRaw<Array<{ id: string; requestNumber: string }>>`
    SELECT "id", "requestNumber"
    FROM "Defect"
    WHERE "cancelledAt" IS NOT NULL
      AND "syncState" = 'CONFIRMED'
      AND "requestNumberReleasedAt" IS NOT NULL
      AND "requestNumberReusedAt" IS NULL
      AND "createdAt" >= ${reuseCutoff}
      AND "createdAt" <= ${now}
      AND "cancelledAt" <= "createdAt" + INTERVAL '6 hours'
      AND "requestType" = ${sequenceType}
      AND "requestNumber" ~* ${requestPattern}
      AND split_part("requestNumber", '/', 2)::int = ${year}
    ORDER BY regexp_replace(split_part("requestNumber", '/', 1), ${numberExpressionPrefix}, '')::int ASC,
      "requestNumberReleasedAt" ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `;
  const candidate = released[0];
  if (candidate) {
    await tx.defect.update({
      where: { id: candidate.id },
      data: { requestNumberReusedAt: new Date() },
    });
    return {
      requestNumber: candidate.requestNumber,
      reusedCancelledDefectId: candidate.id,
    };
  }

  return {
    requestNumber: await nextDefectRequestNumber(tx, year, sequenceType),
    reusedCancelledDefectId: null,
  };
}
