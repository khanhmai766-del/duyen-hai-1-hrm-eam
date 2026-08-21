import { Prisma } from "@prisma/client";

/**
 * Cầu nối Decimal ⇄ number cho module Tồn kho hóa chất.
 *
 * Đây là nhóm model đầu tiên của repo dùng `Decimal`. Prisma trả về object
 * `Prisma.Decimal`, KHÔNG phải số nguyên thủy — trả thẳng ra API rồi truyền sang
 * Client Component thì Next 14 ném "Only plain objects can be passed to Client
 * Components". Vì vậy MỌI giá trị Decimal phải đi qua `toNumber()` trước khi vào
 * `ok()`.
 *
 * Chọn `number` (float64) làm contract của API: chính xác tới ~15 chữ số có nghĩa,
 * dư sức cho con số lớn nhất của sổ hóa chất (3.403.542,000 kg ⇒ 10 chữ số).
 * DB vẫn giữ DECIMAL(18,4) để phép cộng dồn không bị sai số tích lũy.
 */

/** Decimal (hoặc null) → number (hoặc null). Không bao giờ ném lỗi. */
export function toNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : value.toNumber();
  return Number.isFinite(n) ? n : null;
}

/** Như `toNumber` nhưng dành cho cột NOT NULL — thiếu giá trị là lỗi lập trình. */
export function toNumberRequired(value: Prisma.Decimal | number): number {
  const n = toNumber(value);
  if (n === null) throw new Error("Giá trị Decimal bắt buộc nhưng lại rỗng hoặc không hợp lệ");
  return n;
}

/**
 * number → Decimal để ghi xuống DB.
 * Trả `null` cho giá trị rỗng; ném lỗi với NaN/Infinity để không ghi rác vào sổ.
 */
export function toDecimal(value: number | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) {
    throw new Error(`Không ghi được giá trị không hữu hạn vào sổ hóa chất: ${value}`);
  }
  return new Prisma.Decimal(value);
}

/**
 * Cộng một dãy giá trị theo kiểu Decimal rồi mới đổi sang number.
 *
 * Dùng cho các phép cộng dồn nhiều dòng (tổng tồn theo cương vị, tổng nhập tháng,
 * tổng năm): cộng bằng float trước rồi mới làm tròn sẽ tích lũy sai số đúng ở chỗ
 * cần đối soát với hợp đồng.
 *
 * `null` được BỎ QUA chứ không coi là 0 — sổ phân biệt "chưa đọc" với "đọc và bằng 0".
 */
export function sumDecimals(values: Array<Prisma.Decimal | number | null | undefined>): number | null {
  const present = values.filter((v): v is Prisma.Decimal | number => v !== null && v !== undefined);
  if (present.length === 0) return null;
  let total = new Prisma.Decimal(0);
  for (const value of present) {
    total = total.plus(value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value));
  }
  return total.toNumber();
}
