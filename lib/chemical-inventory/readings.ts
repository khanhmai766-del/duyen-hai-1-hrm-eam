import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { lastDateOfPeriod } from "./normalize";
import { toDecimal } from "./serialize";

/**
 * Ghi bản đọc tồn.
 *
 * Hai loại bản đọc dùng chung một bảng:
 *   MONTH_END — ô trên lưới tồn kho tháng
 *   DAILY     — một dòng nhật ký ngày (hiện chỉ NH3)
 *
 * Với mặt hàng theo dõi hằng ngày, MONTH_END KHÔNG do người dùng gõ: nó được sinh
 * lại từ bản đọc của ngày cuối cùng theo lịch mỗi khi bản đọc đó thay đổi. Đây chính
 * là công đoạn mà sổ giấy đang phải chép tay từ nhật ký sang bảng tháng.
 */

type Tx = Prisma.TransactionClient;

/** Kỳ phải được mở trước khi ghi, và kỳ đã khóa thì không ai sửa được nữa. */
export async function requireEditablePeriod(tx: Tx, periodKey: string) {
  const period = await tx.chemicalInventoryPeriod.findUnique({ where: { periodKey } });
  if (!period) {
    throw fail(`Kỳ ${formatPeriod(periodKey)} chưa được mở — bấm "Mở kỳ" trước khi nhập số liệu`, 409);
  }
  if (period.status === "LOCKED") {
    throw fail(`Kỳ ${formatPeriod(periodKey)} đã khóa sổ, không sửa được số liệu`, 409);
  }
  return period;
}

export function formatPeriod(periodKey: string) {
  const [year, month] = periodKey.split("-");
  return `${month}/${year}`;
}

export type ReadingWrite = {
  itemId: string;
  positionCode: string;
  quantity: number | null;
  note: string | null;
};

/** Ghi các ô tồn cuối tháng của lưới. Ô để trống nghĩa là CHƯA ĐỌC, không phải 0. */
export async function saveMonthEndReadings(
  tx: Tx,
  periodKey: string,
  inputs: ReadingWrite[],
  userId: string
) {
  const period = await requireEditablePeriod(tx, periodKey);
  const readDate = lastDateOfPeriod(periodKey);
  let written = 0;

  for (const input of inputs) {
    const item = await tx.chemicalInventoryItem.findUnique({ where: { id: input.itemId } });
    if (!item) throw fail("Mặt hàng không tồn tại", 404);
    if (item.trackingMode === "DAILY") {
      throw fail(
        `${item.name} theo dõi hằng ngày — tồn cuối tháng do hệ thống tính từ nhật ký ngày, không nhập tay được`,
        409
      );
    }

    await tx.chemicalStockReading.upsert({
      where: {
        itemId_positionCode_readDate_kind: {
          itemId: input.itemId,
          positionCode: input.positionCode,
          readDate,
          kind: "MONTH_END",
        },
      },
      update: {
        quantity: toDecimal(input.quantity),
        note: input.note,
        // Người dùng sửa tay thì bản ghi không còn là "nhập từ Excel" nữa.
        source: "MANUAL",
        rawText: null,
        updatedById: userId,
        periodId: period.id,
        periodKey,
      },
      create: {
        periodId: period.id,
        periodKey,
        itemId: input.itemId,
        positionCode: input.positionCode,
        readDate,
        kind: "MONTH_END",
        quantity: toDecimal(input.quantity),
        note: input.note,
        source: "MANUAL",
        updatedById: userId,
      },
    });
    written += 1;
  }

  return written;
}

/**
 * Ghi tồn 24h của một ngày trong nhật ký, rồi sinh lại tồn cuối tháng nếu ngày đó
 * là ngày cuối cùng theo lịch.
 */
export async function saveDailyReading(
  tx: Tx,
  input: { itemId: string; periodKey: string; readDate: Date; positionCode: string; quantity: number | null; note: string | null },
  userId: string
) {
  const period = await requireEditablePeriod(tx, input.periodKey);

  const item = await tx.chemicalInventoryItem.findUnique({ where: { id: input.itemId } });
  if (!item) throw fail("Mặt hàng không tồn tại", 404);
  if (item.trackingMode !== "DAILY") {
    throw fail(`${item.name} không theo dõi hằng ngày`, 409);
  }

  const reading = await tx.chemicalStockReading.upsert({
    where: {
      itemId_positionCode_readDate_kind: {
        itemId: input.itemId,
        positionCode: input.positionCode,
        readDate: input.readDate,
        kind: "DAILY",
      },
    },
    update: { quantity: toDecimal(input.quantity), note: input.note, updatedById: userId, source: "MANUAL" },
    create: {
      periodId: period.id,
      periodKey: input.periodKey,
      itemId: input.itemId,
      positionCode: input.positionCode,
      readDate: input.readDate,
      kind: "DAILY",
      quantity: toDecimal(input.quantity),
      note: input.note,
      source: "MANUAL",
      updatedById: userId,
    },
  });

  await recomputeMonthEnd(tx, input.itemId, input.positionCode, input.periodKey);
  return reading;
}

/**
 * Sinh lại ô tồn cuối tháng từ bản đọc ngày CUỐI CÙNG THEO LỊCH.
 *
 * Cố ý KHÔNG lấy bản đọc gần nhất giữa tháng: giữa tháng mà điền vào ô "tồn cuối
 * tháng" là bịa ra một con số quyết toán chưa tồn tại. Chưa có bản đọc ngày cuối
 * thì để trống và giao diện hiện "nhật ký mới tới ngày N".
 */
export async function recomputeMonthEnd(tx: Tx, itemId: string, positionCode: string, periodKey: string) {
  const period = await tx.chemicalInventoryPeriod.findUnique({ where: { periodKey } });
  if (!period) return null;

  const readDate = lastDateOfPeriod(periodKey);
  const lastDaily = await tx.chemicalStockReading.findUnique({
    where: {
      itemId_positionCode_readDate_kind: { itemId, positionCode, readDate, kind: "DAILY" },
    },
  });

  return tx.chemicalStockReading.upsert({
    where: {
      itemId_positionCode_readDate_kind: { itemId, positionCode, readDate, kind: "MONTH_END" },
    },
    update: {
      quantity: lastDaily?.quantity ?? null,
      source: "DERIVED",
      note: "Tự động từ bản đọc ngày cuối tháng",
    },
    create: {
      periodId: period.id,
      periodKey,
      itemId,
      positionCode,
      readDate,
      kind: "MONTH_END",
      quantity: lastDaily?.quantity ?? null,
      source: "DERIVED",
      note: "Tự động từ bản đọc ngày cuối tháng",
    },
  });
}
