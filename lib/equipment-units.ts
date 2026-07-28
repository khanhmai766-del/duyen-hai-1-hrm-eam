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

// ------------------------------------------------------------------ PHẠM VI CÂY
// Cây thiết bị được tách làm 3 PHẠM VI hiển thị trên cùng MỘT bộ node vật lý:
// S1 và S2 là hai hình chiếu của nhánh 1,2,3,7; COMMON là nhánh 5,6.
// `seq` trên đường truyền LUÔN là mã chuẩn DH1.S1.x cho cả 3 phạm vi — chỉ mã hiển
// thị và KKS đổi theo phạm vi, nên các API nghiệp vụ (khiếm khuyết/sửa chữa/vật tư/QR)
// vốn nhận deviceSeq + cột machine riêng không phải sửa gì.

export type TreeScope = EquipmentMachine;

export const TREE_SCOPES = [
  { key: "S1", label: "Tổ máy S1", short: "S1" },
  { key: "S2", label: "Tổ máy S2", short: "S2" },
  { key: "COMMON", label: "Dùng chung", short: "Chung" },
] as const;

/** Ép một giá trị bất kỳ về phạm vi hợp lệ; mặc định S1. */
export function parseScope(value: unknown): TreeScope {
  const v = String(value ?? "").trim().toUpperCase();
  return v === "S2" || v === "COMMON" ? v : "S1";
}

/**
 * Như parseScope nhưng trả null khi KHÔNG truyền tham số — dùng cho API cây: không có
 * `scope` nghĩa là "cả cây, không tách phạm vi" (bộ chọn thư mục khi cấu hình phân quyền
 * cần thấy đủ 6 nhánh, kể cả nhánh dùng chung).
 */
export function parseScopeParam(value: string | null | undefined): TreeScope | null {
  const v = (value ?? "").trim().toUpperCase();
  if (!v) return null;
  return v === "S2" || v === "COMMON" ? v : "S1";
}

/** Phạm vi mặc định của một seq: nhánh 5,6 → COMMON, còn lại → S1. */
export function defaultScopeOf(seq: string): TreeScope {
  return machinesOf(seq)[0] === "COMMON" ? "COMMON" : "S1";
}

/** Node có thuộc phạm vi đang xem không (nhánh 5,6 chỉ ở COMMON và ngược lại). */
export function seqInScope(seq: string, scope: TreeScope): boolean {
  const isCommon = machinesOf(seq)[0] === "COMMON";
  return scope === "COMMON" ? isCommon : !isCommon;
}

/** Mã thiết bị đầy đủ theo phạm vi (chỉ S2 khác: DH1.S1.x → DH1.S2.x). */
export function scopeCode(seq: string, scope: TreeScope): string {
  return scope === "S2" ? s2Code(seq) : seq;
}

/** KKS theo phạm vi (chỉ S2 khác: ký tự đầu 1 → 2). */
export function scopeKks(kks: string | null, scope: TreeScope): string | null {
  return scope === "S2" ? s2Kks(kks) : kks;
}
