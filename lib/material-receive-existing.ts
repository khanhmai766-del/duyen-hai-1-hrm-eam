/** Luồng Hiện có chỉ trừ tồn khi xác nhận sử dụng; sửa số lãnh không điều chỉnh kho. */
export function existingReceiptEditError({ quantity, previous, used, available, unit }: {
  quantity: number;
  previous: number;
  used: number;
  available: number;
  unit: string;
}): string | null {
  if (!Number.isInteger(quantity) || quantity <= 0) return "Khối lượng lãnh phải là số nguyên lớn hơn 0";
  if (quantity < used) return `Không thể giảm khối lượng lãnh thấp hơn khối lượng đã sử dụng (${used} ${unit})`;
  if (quantity > previous && quantity > available + used) {
    return `Không đủ vật tư Hiện có để tăng khối lượng lãnh (tối đa ${available + used} ${unit})`;
  }
  return null;
}
