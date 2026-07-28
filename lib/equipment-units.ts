// Quy tắc tổ máy trên CÂY THIẾT BỊ DÙNG CHUNG (phương án S2 — nguồn cấu trúc duy nhất là S1):
// - Nhánh 5, 6  → COMMON (một hồ sơ chung, không tách S1/S2).
// - Nhánh khác  → thiết bị theo tổ máy: hồ sơ S1 (mặc định) + S2 (tạo dần).
// - Mã S2 và KKS S2 là DẪN XUẤT thuần túy từ node — không lưu trùng 16k bản ghi.

export type EquipmentMachine = "S1" | "S2" | "COMMON";

/** Các nhánh dùng chung 2 tổ máy (theo phương án đã chốt). */
export const COMMON_BRANCHES = new Set(["5", "6"]);

/** Số nhánh hệ thống của một seq (DH1.S1.5.1.1 → "5"); null nếu là nút gốc DH1.S1. */
export function branchOf(seq: string): string | null {
  const m = seq.match(/^DH1\.S1\.(\d+)/);
  return m ? m[1] : null;
}

/** Danh sách hồ sơ tổ máy áp dụng cho một node: ["COMMON"] hoặc ["S1","S2"]. */
export function machinesOf(seq: string): EquipmentMachine[] {
  const b = branchOf(seq);
  if (b !== null && COMMON_BRANCHES.has(b)) return ["COMMON"];
  return ["S1", "S2"];
}

/** Mã thiết bị S2 dẫn xuất: DH1.S1.1.2.3 → DH1.S2.1.2.3. */
export function s2Code(seq: string): string {
  return seq.replace(/^DH1\.S1/, "DH1.S2");
}

/**
 * KKS S2 dẫn xuất: CHỈ đổi KÝ TỰ ĐẦU TIÊN "1" thành "2", phần còn lại giữ nguyên
 * (10BJA01E → 20BJA01E, 11XAX10CP403 → 21XAX10CP403, 1QFK01 → 2QFK01, 101MK01 → 201MK01).
 * KKS bắt đầu bằng ký tự khác (X0…, A0…, "BOP - DH1", "N/A", "Không có KKS") và số 1
 * nằm giữa chuỗi (X0ABC10AA001) giữ nguyên.
 */
export function s2Kks(kks: string | null): string | null {
  if (!kks) return kks;
  return kks.startsWith("1") ? `2${kks.slice(1)}` : kks;
}
