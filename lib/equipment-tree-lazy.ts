// Trường + hình dạng dữ liệu dùng chung cho các API cây thiết bị LAZY (roots/children/search).
// Cây chỉ trả trường nhẹ; ảnh/tài liệu/lịch sử/vật tư/khiếm khuyết chỉ tải khi mở 1 thiết bị.

import { scopeCode, scopeKks, type TreeScope } from "@/lib/equipment-units";

export const TREE_SELECT = {
  seq: true,
  parentSeq: true,
  code: true,
  name: true,
  kks: true,
  depth: true,
  childCount: true,
} as const;

export type TreeNodeRow = {
  seq: string;
  parentSeq: string | null;
  code: string;
  name: string;
  kks: string | null;
  depth: number;
  childCount: number;
};

/** Mã hiển thị = Mã thiết bị đã bỏ tiền tố tổ máy (vd DH1.S1.5.1.1 → 5.1.1). */
export function displayCode(fullCode: string) {
  return fullCode.replace(/^DH1\.S\d+\.?/, "") || fullCode;
}

/**
 * Chiếu một dòng node sang phạm vi cây đang xem. `seq` GIỮ NGUYÊN mã chuẩn DH1.S1.x
 * (khóa nghiệp vụ dùng chung cho cả 3 phạm vi); chỉ `fullCode`/`code`/`kks` đổi theo
 * phạm vi. `override` là hồ sơ tổ máy do người dùng đặt khác (hiếm — xem
 * lib/equipment-profile-cache.ts).
 */
export function toTreeNode(
  n: TreeNodeRow,
  scope: TreeScope = "S1",
  override?: { name?: string | null; kks?: string | null }
) {
  const fullCode = scopeCode(n.seq, scope);
  return {
    seq: n.seq, // Mã thiết bị chuẩn (S1) — khóa + định tuyến + tham chiếu nghiệp vụ
    parentSeq: n.parentSeq,
    machine: scope,
    fullCode, // mã đầy đủ theo tổ máy đang xem (S2 → DH1.S2.x)
    code: displayCode(fullCode), // mã hiển thị ngắn gọn trên cây
    name: override?.name ?? n.name,
    kks: override?.kks ?? scopeKks(n.kks, scope),
    depth: n.depth,
    childCount: n.childCount,
    hasChildren: n.childCount > 0,
  };
}
