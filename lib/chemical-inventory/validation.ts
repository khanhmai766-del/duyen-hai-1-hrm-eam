import { MAX_VEHICLE_NUMBER_LENGTH } from "./constants";
import { normalizeInventoryPeriod } from "./normalize";

/**
 * Kiểm tra dữ liệu vào của module Tồn kho hóa chất.
 *
 * Cố ý KHÔNG import `lib/api` để dùng lại được từ script kiểm chứng: các hàm ở đây
 * trả về kết quả, route handler tự đổi thành `fail(...)`. Thông báo lỗi viết sẵn
 * bằng tiếng Việt và nêu rõ giá trị sai, để người dùng biết phải sửa ô nào.
 *
 * Nguyên tắc: KHÔNG BAO GIỜ tin trường dẫn xuất do client gửi lên —
 * `acceptedWeight`, `periodKey`, tồn đầu, tổng nhập, lượng sử dụng đều tính lại
 * ở server. Ở đây chỉ nhận các trường nguyên liệu.
 */

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/**
 * Số khối lượng: bắt buộc hữu hạn và không âm.
 * Chặn `NaN`/`Infinity` — JSON.parse cho qua chuỗi "Infinity" thành số vô hạn và
 * nó sẽ lan vào mọi tổng sau đó.
 */
export function parseQuantity(
  raw: unknown,
  fieldLabel: string,
  options: { allowNull?: boolean; allowNegative?: boolean } = {}
): ValidationResult<number | null> {
  if (raw === null || raw === undefined || raw === "") {
    if (options.allowNull) return { ok: true, value: null };
    return fail(`${fieldLabel} không được để trống`);
  }

  const value = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(value)) return fail(`${fieldLabel} phải là số hợp lệ`);
  if (!options.allowNegative && value < 0) return fail(`${fieldLabel} không được âm`);
  if (Math.abs(value) >= 1e14) return fail(`${fieldLabel} vượt quá giới hạn cho phép`);

  return { ok: true, value };
}

/** Kỳ dạng "YYYY-MM". */
export function parsePeriodKey(raw: unknown): ValidationResult<string> {
  const parsed = normalizeInventoryPeriod(raw);
  if (!parsed.ok) return fail(parsed.reason);
  return { ok: true, value: parsed.periodKey };
}

/** Ngày dạng "YYYY-MM-DD". Chỉ giữ phần ngày — sổ hóa chất không quan tâm giờ. */
export function parseDateOnly(raw: unknown, fieldLabel = "Ngày"): ValidationResult<Date> {
  const text = String(raw ?? "").trim();
  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!matched) return fail(`${fieldLabel} phải theo định dạng YYYY-MM-DD`);

  const [year, month, day] = [Number(matched[1]), Number(matched[2]), Number(matched[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return fail(`${fieldLabel} không tồn tại trên lịch: ${text}`);
  }
  return { ok: true, value: date };
}

/**
 * Chuẩn hóa biển số xe nhập hàng.
 *
 * Bỏ hết gạch, chấm, khoảng trắng rồi viết hoa: "51C-214.77" và "51c21477" cùng ra
 * "51C21477". Nhờ vậy khóa chống trùng `(mặt hàng + ngày + biển số)` không bị hai
 * cách gõ khác nhau qua mặt. Tối đa 8 ký tự — đúng độ dài một biển số Việt Nam khi
 * bỏ dấu phân cách.
 */
export function normalizeVehicleNumber(raw: unknown): string | null {
  const text = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!text) return null;
  return text.slice(0, MAX_VEHICLE_NUMBER_LENGTH);
}

/** Như trên nhưng báo lỗi thay vì cắt bớt — dùng cho dữ liệu người dùng gõ vào. */
export function parseVehicleNumber(raw: unknown): ValidationResult<string | null> {
  const text = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!text) return { ok: true, value: null };
  if (text.length > MAX_VEHICLE_NUMBER_LENGTH) {
    return fail(`Biển số tối đa ${MAX_VEHICLE_NUMBER_LENGTH} ký tự (không tính dấu gạch và dấu chấm)`);
  }
  return { ok: true, value: text };
}

export type ReceiptInput = {
  itemId: string;
  receivedAt: Date;
  vehicleNumber: string | null;
  plantWeight: number | null;
  contractorWeight: number | null;
  note: string | null;
  receivingPosition: string | null;
};

/**
 * Kiểm tra một dòng xe trước khi ghi.
 *
 * Cố tình KHÔNG nhận `acceptedWeight` và `periodKey` từ client — hai giá trị đó
 * server tự tính từ hai số cân và từ `receivedAt`.
 */
export function validateReceiptInput(payload: Record<string, unknown>): ValidationResult<ReceiptInput> {
  const itemId = String(payload.itemId ?? "").trim();
  if (!itemId) return fail("Chưa chọn mặt hàng");

  const receivedAt = parseDateOnly(payload.receivedAt, "Ngày nhập");
  if (!receivedAt.ok) return receivedAt;

  const plant = parseQuantity(payload.plantWeight, "Khối lượng cân nhà máy", { allowNull: true });
  if (!plant.ok) return plant;

  const contractor = parseQuantity(payload.contractorWeight, "Khối lượng cân nhà thầu", { allowNull: true });
  if (!contractor.ok) return contractor;

  if (plant.value === null && contractor.value === null) {
    return fail("Phải có ít nhất một trong hai số cân");
  }

  const vehicle = parseVehicleNumber(payload.vehicleNumber);
  if (!vehicle.ok) return vehicle;

  const note = String(payload.note ?? "").trim() || null;
  // Chỉ một số cân thì khối lượng công nhận không đối chứng được — bắt ghi chú lý do.
  if ((plant.value === null) !== (contractor.value === null) && !note) {
    return fail("Chỉ có một số cân — phải ghi chú lý do trước khi lưu");
  }

  return {
    ok: true,
    value: {
      itemId,
      receivedAt: receivedAt.value,
      vehicleNumber: vehicle.value,
      plantWeight: plant.value,
      contractorWeight: contractor.value,
      note,
      receivingPosition: String(payload.receivingPosition ?? "").trim() || null,
    },
  };
}

export type ReadingInput = {
  itemId: string;
  positionCode: string;
  quantity: number | null;
  note: string | null;
};

/** Một ô trên lưới tồn kho tháng, hoặc một dòng nhật ký ngày. */
export function validateReadingInput(payload: Record<string, unknown>): ValidationResult<ReadingInput> {
  const itemId = String(payload.itemId ?? "").trim();
  if (!itemId) return fail("Thiếu mặt hàng");

  const positionCode = String(payload.positionCode ?? "").trim();
  if (!positionCode) return fail("Thiếu cương vị");

  // Tồn cuối để trống là hợp lệ và mang nghĩa "chưa đọc" — khác hẳn số 0.
  const quantity = parseQuantity(payload.quantity, "Tồn cuối", { allowNull: true });
  if (!quantity.ok) return quantity;

  return {
    ok: true,
    value: {
      itemId,
      positionCode,
      quantity: quantity.value,
      note: String(payload.note ?? "").trim() || null,
    },
  };
}

export type ContractInput = {
  year: number;
  itemId: string;
  materialCode: string | null;
  supplier: string | null;
  origin: string | null;
  contractQuantity: number;
  forecastDemand: number;
  note: string | null;
};

export function validateContractInput(payload: Record<string, unknown>): ValidationResult<ContractInput> {
  const year = Number(payload.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return fail("Năm hợp đồng không hợp lệ");
  }

  const itemId = String(payload.itemId ?? "").trim();
  if (!itemId) return fail("Chưa chọn mặt hàng");

  const contractQuantity = parseQuantity(payload.contractQuantity, "Khối lượng hợp đồng");
  if (!contractQuantity.ok) return contractQuantity;

  const forecastDemand = parseQuantity(payload.forecastDemand ?? 0, "Nhu cầu dự kiến");
  if (!forecastDemand.ok) return forecastDemand;

  return {
    ok: true,
    value: {
      year,
      itemId,
      materialCode: String(payload.materialCode ?? "").trim() || null,
      supplier: String(payload.supplier ?? "").trim() || null,
      origin: String(payload.origin ?? "").trim() || null,
      contractQuantity: contractQuantity.value as number,
      forecastDemand: forecastDemand.value as number,
      note: String(payload.note ?? "").trim() || null,
    },
  };
}

/** Sản lượng điện S1+S2 của kỳ, dùng để tính suất hao đầu cực. */
export function validateGenerationInput(payload: Record<string, unknown>): ValidationResult<number | null> {
  return parseQuantity(payload.generationMwh, "Sản lượng điện S1+S2", { allowNull: true });
}
