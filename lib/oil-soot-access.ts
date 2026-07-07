import { normalizePositionScopeKey } from "@/lib/position-system-scopes";

// Hai danh mục vòi đốt / vòi thổi bụi chỉ dành cho các chức vụ dưới đây (+ ADMIN).
// Dùng chung cho client (ẩn tab) và server (chặn API).
export const OIL_SOOT_GATED_CATEGORIES = new Set<string>(["OIL_GUN_DATA", "SOOT_BLOWER_DATA"]);

// Khớp diacritic-insensitive, tự bỏ hậu tố tổ máy (S1/S2). "KTV" là alias của "Kỹ thuật viên".
export const OIL_SOOT_ALLOWED_POSITIONS = [
  "Quản đốc",
  "Phó quản đốc",
  "Kỹ thuật viên",
  "KTV",
  "Trưởng ca",
  "TK Lò máy",
  "Lò trưởng",
  "Lò phó",
];

const ALLOWED_KEYS = new Set(OIL_SOOT_ALLOWED_POSITIONS.map(normalizePositionScopeKey));

/** Có ít nhất một chức vụ (chính/phụ) thuộc danh sách được phép? */
export function positionAllowsOilSoot(positions: Array<string | null | undefined>): boolean {
  return positions.some((p) => !!p && ALLOWED_KEYS.has(normalizePositionScopeKey(p)));
}
