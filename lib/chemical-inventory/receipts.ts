import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { RECONCILE_EPSILON, type WarningCode } from "./constants";
import { calculateAcceptedWeight, convertUnit, inspectTruck, nearlyEqual } from "./calculations";
import { periodKeyOf } from "./normalize";
import { formatPeriod, recomputeMonthEnd, requireEditablePeriod } from "./readings";
import { toDecimal, toNumber } from "./serialize";
import type { ReceiptInput } from "./validation";

/**
 * Ghi phiếu nhập (một chuyến xe).
 *
 * Một chuyến xe có thể được ghi từ HAI CỬA — nhật ký ngày và bước xác nhận lãnh của
 * phiếu vật tư. Đây là chỗ chặn cộng đôi: trước khi tạo dòng mới, luôn tìm xem
 * chuyến đó đã được ghi chưa.
 */

type Tx = Prisma.TransactionClient;

export type ReceiptSource = "MANUAL" | "SHEET_IMPORT" | "MATERIAL_TICKET" | "DAILY_LOG";

/**
 * Tìm phiếu đã có cho cùng một chuyến xe.
 *
 * Ưu tiên khớp BIỂN SỐ trong cùng ngày. Nếu không có biển số, hoặc biển số không
 * khớp, thì thử khớp theo KHỐI LƯỢNG — sổ Excel ghi biển số tắt còn nhật ký ghi đủ
 * nên hai chuỗi thường khác nhau, trong khi cặp (ngày + khối lượng) khớp tuyệt đối.
 */
export async function findExistingTruck(
  tx: Tx,
  itemId: string,
  receivedAt: Date,
  vehicleNumber: string | null,
  acceptedWeight: number,
  excludeId?: string
) {
  const sameDay = await tx.chemicalReceipt.findMany({
    where: { itemId, receivedAt, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
  });
  if (sameDay.length === 0) return null;

  if (vehicleNumber) {
    const byPlate = sameDay.find(
      (row) =>
        row.vehicleNumber === vehicleNumber ||
        (row.vehicleNumber && (row.vehicleNumber.endsWith(vehicleNumber) || vehicleNumber.endsWith(row.vehicleNumber)))
    );
    if (byPlate) return byPlate;
  }

  return (
    sameDay.find((row) => nearlyEqual(toNumber(row.acceptedWeight) ?? 0, acceptedWeight, RECONCILE_EPSILON)) ?? null
  );
}

function truckWarnings(
  item: { baseUnit: string },
  input: { plantWeight: number | null; contractorWeight: number | null; vehicleNumber: string | null },
  acceptedWeight: number,
  source: ReceiptSource
): WarningCode[] {
  const warnings: WarningCode[] = [];
  // MISSING_WEIGHT nghĩa là "không đối chứng được hai số cân". Với chuyến xe ghi từ
  // PHIẾU VẬT TƯ thì vốn dĩ chỉ có một tờ phiếu cân của nhà máy — không thiếu gì cả,
  // gắn cờ ở đây chỉ tạo ra một cảnh báo luôn bật mà không ai xử lý được.
  if (source !== "MATERIAL_TICKET" && (input.plantWeight === null || input.contractorWeight === null)) {
    warnings.push("MISSING_WEIGHT");
  }
  if (!input.vehicleNumber) warnings.push("MISSING_VEHICLE");

  // Dải 15–25 tấn là cho xe bồn hóa chất; quy về tấn trước khi so.
  if (item.baseUnit === "KG" || item.baseUnit === "TON") {
    const ton = convertUnit(acceptedWeight, item.baseUnit as "KG" | "TON", "TON");
    warnings.push(...inspectTruck(ton));
  }
  return warnings;
}

export type CreateReceiptResult =
  | { status: "created"; id: string }
  | { status: "linked"; id: string; message: string };

/**
 * Tạo phiếu nhập. Nếu chuyến xe đã được ghi từ cửa khác thì BỔ SUNG vào dòng đó và
 * báo lại cho người dùng, chứ không tạo dòng thứ hai.
 */
export async function createReceipt(
  tx: Tx,
  input: ReceiptInput,
  options: { source: ReceiptSource; userId: string; materialTicketId?: string | null }
): Promise<CreateReceiptResult> {
  const item = await tx.chemicalInventoryItem.findUnique({ where: { id: input.itemId } });
  if (!item) throw fail("Mặt hàng không tồn tại", 404);

  const periodKey = periodKeyOf(input.receivedAt);
  await requireEditablePeriod(tx, periodKey);

  const accepted = calculateAcceptedWeight(input.plantWeight, input.contractorWeight);
  if (accepted.value === null) throw fail("Không xác định được khối lượng được công nhận", 400);

  const existing = await findExistingTruck(tx, item.id, input.receivedAt, input.vehicleNumber, accepted.value);
  const warnings = truckWarnings(item, { ...input, vehicleNumber: input.vehicleNumber }, accepted.value, options.source);

  if (existing) {
    const existingAccepted = toNumber(existing.acceptedWeight) ?? 0;
    const conflict = !nearlyEqual(existingAccepted, accepted.value, RECONCILE_EPSILON);
    if (conflict) warnings.push("WEIGHT_CONFLICT");

    await tx.chemicalReceipt.update({
      where: { id: existing.id },
      data: {
        // Bổ sung thông tin còn thiếu, KHÔNG ghi đè bằng giá trị rỗng.
        vehicleNumber: existing.vehicleNumber ?? input.vehicleNumber,
        plantWeight: toDecimal(input.plantWeight) ?? existing.plantWeight,
        contractorWeight: toDecimal(input.contractorWeight) ?? existing.contractorWeight,
        receivingPosition: existing.receivingPosition ?? input.receivingPosition,
        note: input.note ?? existing.note,
        materialTicketId: options.materialTicketId ?? existing.materialTicketId,
        warnings: [...new Set([...existing.warnings, ...warnings])],
      },
    });

    return {
      status: "linked",
      id: existing.id,
      message: conflict
        ? `Chuyến xe ngày ${input.receivedAt.toISOString().slice(0, 10)} đã được ghi trước đó với khối lượng khác (${existingAccepted}). Đã gắn vào phiếu cũ và đánh dấu cần đối chiếu.`
        : `Chuyến xe ngày ${input.receivedAt.toISOString().slice(0, 10)} đã được ghi trước đó — đã bổ sung thông tin vào phiếu cũ thay vì tạo phiếu mới.`,
    };
  }

  const created = await tx.chemicalReceipt.create({
    data: {
      itemId: item.id,
      receivedAt: input.receivedAt,
      periodKey,
      vehicleNumber: input.vehicleNumber,
      plantWeight: toDecimal(input.plantWeight),
      contractorWeight: toDecimal(input.contractorWeight),
      acceptedWeight: toDecimal(accepted.value)!,
      receivingPosition: input.receivingPosition,
      note: input.note,
      source: options.source,
      materialTicketId: options.materialTicketId ?? null,
      warnings,
      createdById: options.userId,
    },
  });

  return { status: "created", id: created.id };
}

export async function updateReceipt(tx: Tx, id: string, input: ReceiptInput, userId: string) {
  const existing = await tx.chemicalReceipt.findUnique({ where: { id }, include: { item: true } });
  if (!existing) throw fail("Không tìm thấy phiếu nhập", 404);

  await requireEditablePeriod(tx, existing.periodKey);
  const newPeriodKey = periodKeyOf(input.receivedAt);
  if (newPeriodKey !== existing.periodKey) {
    // Đổi ngày sang tháng khác là chuyển phiếu sang kỳ khác — kỳ đích cũng phải mở.
    await requireEditablePeriod(tx, newPeriodKey);
  }

  const accepted = calculateAcceptedWeight(input.plantWeight, input.contractorWeight);
  if (accepted.value === null) throw fail("Không xác định được khối lượng được công nhận", 400);

  const clash = await findExistingTruck(tx, input.itemId, input.receivedAt, input.vehicleNumber, accepted.value, id);
  if (clash && input.vehicleNumber && clash.vehicleNumber === input.vehicleNumber) {
    throw fail(
      `Đã có phiếu khác cùng biển số ${input.vehicleNumber} trong ngày ${input.receivedAt.toISOString().slice(0, 10)}`,
      409
    );
  }

  const updated = await tx.chemicalReceipt.update({
    where: { id },
    data: {
      itemId: input.itemId,
      receivedAt: input.receivedAt,
      periodKey: newPeriodKey,
      vehicleNumber: input.vehicleNumber,
      plantWeight: toDecimal(input.plantWeight),
      contractorWeight: toDecimal(input.contractorWeight),
      acceptedWeight: toDecimal(accepted.value)!,
      receivingPosition: input.receivingPosition,
      note: input.note,
      warnings: truckWarnings(existing.item, input, accepted.value, existing.source as ReceiptSource),
    },
  });

  // Sửa phiếu không đụng tồn, nhưng nếu mặt hàng theo dõi ngày thì ô tồn cuối tháng
  // suy từ nhật ký — chạy lại cho chắc khi phiếu nhảy kỳ.
  if (existing.item.trackingMode === "DAILY" && existing.receivingPosition) {
    await recomputeMonthEnd(tx, existing.itemId, existing.receivingPosition, newPeriodKey);
  }

  return updated;
}

export async function deleteReceipt(tx: Tx, id: string) {
  const existing = await tx.chemicalReceipt.findUnique({ where: { id } });
  if (!existing) throw fail("Không tìm thấy phiếu nhập", 404);

  if (existing.materialTicketId) {
    throw fail(
      "Phiếu này sinh từ phiếu vật tư — muốn xóa phải hủy phiếu vật tư gốc, nếu không phiếu đó sẽ trỏ vào khoảng trống",
      409
    );
  }

  await requireEditablePeriod(tx, existing.periodKey);
  await tx.chemicalReceipt.delete({ where: { id } });
  return existing;
}

export { formatPeriod };
