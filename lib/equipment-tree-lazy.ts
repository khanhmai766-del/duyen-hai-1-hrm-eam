// Trường + hình dạng dữ liệu dùng chung cho các API cây thiết bị LAZY (roots/children/search).
// Cây chỉ trả trường nhẹ; ảnh/tài liệu/lịch sử/vật tư/khiếm khuyết chỉ tải khi mở 1 thiết bị.

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

/** Mã hiển thị = Mã thiết bị đã bỏ tiền tố "DH1.S1." (vd DH1.S1.5.1.1 → 5.1.1). */
export function displayCode(fullCode: string) {
  return fullCode.replace(/^DH1\.S1\.?/, "") || fullCode;
}

export function toTreeNode(n: TreeNodeRow) {
  return {
    seq: n.seq, // Mã thiết bị đầy đủ (fullCode) — khóa + định tuyến
    parentSeq: n.parentSeq,
    code: displayCode(n.seq), // mã hiển thị ngắn gọn trên cây
    name: n.name,
    kks: n.kks,
    depth: n.depth,
    childCount: n.childCount,
    hasChildren: n.childCount > 0,
  };
}
