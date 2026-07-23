// Lõi nhập cây thiết bị từ Excel danh mục (dùng chung client parse + server validate/commit).
// Nguồn chuẩn: Assetid (định danh) · AssetidParent (quan hệ) · Mã thiết bị (fullCode = khóa/path).

import { normalizeText } from "@/lib/nav";

export const S1_PREFIX = "DH1.S1";
export const MAX_DEPTH = 16; // giới hạn kỹ thuật (số đoạn của fullCode, gồm DH1.S1)

export type ImportMode = "ADD" | "SYNC" | "REPLACE";

/** Dòng thô đã tách từ Excel (client gửi lên). */
export interface RawImportRow {
  assetId: string;
  assetParentId: string;
  fullCode: string; // Mã thiết bị đầy đủ, vd DH1.S1.5.1.1
  name: string;
  kks: string | null;
  drawing: string | null;
  dept?: string; // Bộ phận quản lý (VH/VH3/trống/NL/…)
}

/** Bộ lọc bộ phận CHUẨN đã chốt: VH + VH3 + ô trống (thiết bị vận hành thật). */
export function filterCanonicalDept(rows: RawImportRow[]): RawImportRow[] {
  return rows.filter((r) => ["VH", "VH3", ""].includes((r.dept ?? "").toUpperCase()));
}

/** Bản ghi đã chuẩn hóa, sẵn sàng ghi DB. */
export interface BuiltNode {
  seq: string;
  externalId: string;
  parentSeq: string | null;
  code: string;
  name: string;
  kks: string | null;
  drawing: string | null;
  depth: number;
  sort: number;
  searchText: string;
  childCount: number;
}

export interface ImportIssue {
  line: number; // số dòng (1-based trong batch)
  code: string;
  reason: string;
}

export interface ImportPreview {
  system: string;
  valid: number;
  parents: number;
  leaves: number;
  toCreate: number;
  toUpdate: number;
  unchanged: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  builtCount: number;
}

const clean = (v: unknown): string => String(v ?? "").trim();
const cleanNull = (v: unknown): string | null => {
  const t = clean(v);
  return t === "" || t.toUpperCase() === "N/A" ? null : t;
};

/** KKS: giá trị GHI CHÚ ("Không có KKS", "N/A", "(N/A)") không phải mã → null. */
const cleanKks = (v: unknown): string | null => {
  const t = cleanNull(v);
  if (!t) return null;
  if (/^không có/i.test(t) || /^\(?n\/a\)?$/i.test(t)) return null;
  return t;
};

export function displayCode(fullCode: string): string {
  return fullCode.replace(/^DH1\.S1\.?/, "") || fullCode;
}

/** So sánh theo TỪNG ĐOẠN SỐ của Mã (5.1.10 sau 5.1.2 — không coi là số thập phân). */
export function compareFullCode(a: string, b: string): number {
  const pa = a.split("."), pb = b.split(".");
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const nx = Number(pa[i]), ny = Number(pb[i]);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) { if (nx !== ny) return nx - ny; }
    else if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** Khớp cột Excel danh mục (không phân biệt hoa/thường & dấu) → RawImportRow[]. */
export function parseDanhmucRows(raw: Record<string, unknown>[]): RawImportRow[] {
  if (!raw.length) return [];
  const keys = Object.keys(raw[0]);
  const find = (cands: string[]) => keys.find((k) => cands.includes(normalizeText(k)));
  const kAsset = find(["assetid"]);
  const kParent = find(["assetidparent"]);
  const kCode = find(["ma thiet bi", "ma", "code"]);
  const kName = find(["ten thiet bi", "ten", "name"]);
  const kKks = find(["ma kks", "kks"]);
  const kDraw = find(["ban ve lien quan", "ban ve", "drawing"]);
  const kDept = find(["bo phan quan ly", "bo phan"]);
  if (!kAsset || !kCode) return [];
  return raw
    .map((r) => ({
      assetId: clean(r[kAsset]),
      assetParentId: kParent ? clean(r[kParent]) : "",
      fullCode: clean(r[kCode]),
      name: kName ? clean(r[kName]) : "",
      kks: kKks ? cleanKks(r[kKks]) : null,
      drawing: kDraw ? cleanNull(r[kDraw]) : null,
      dept: kDept ? clean(r[kDept]) : "",
    }))
    .filter((r) => r.assetId || r.fullCode);
}

/** Lọc dòng thuộc một hệ thống (vd "5" → mã bắt đầu DH1.S1.5). */
export function filterSystem(rows: RawImportRow[], system: string): RawImportRow[] {
  const s = clean(system);
  if (!s) return rows;
  const prefix = `${S1_PREFIX}.${s}`;
  return rows.filter((r) => r.fullCode === prefix || r.fullCode.startsWith(`${prefix}.`));
}

export interface ExistingIndex {
  /** externalId(Assetid) → seq hiện có trong DB */
  byAsset: Map<string, string>;
  /** tập seq(fullCode) đang tồn tại trong DB (mọi hệ thống) */
  seqs: Set<string>;
  /** seq → {name,kks,code} để xác định "không đổi" khi đồng bộ */
  detail: Map<string, { name: string; kks: string | null }>;
}

/**
 * Kiểm tra + dựng bản ghi. errors chứa lỗi CHẶN (không cho ghi). Trả cả danh sách BuiltNode
 * hợp lệ (đã tính parentSeq theo AssetidParent hoặc tiền tố Mã, sort số học, childCount).
 */
export function validateAndBuild(
  rows: RawImportRow[],
  system: string,
  existing: ExistingIndex,
  mode: ImportMode
): { preview: ImportPreview; nodes: BuiltNode[] } {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const sysPrefix = `${S1_PREFIX}.${clean(system)}`;

  // Chỉ mục trong batch
  const inBatchByAsset = new Map<string, RawImportRow>();
  const inBatchCodes = new Set<string>();
  const seenAsset = new Set<string>();
  const seenCode = new Set<string>();

  rows.forEach((r, i) => {
    const line = i + 1;
    if (!r.assetId) errors.push({ line, code: r.fullCode, reason: "Thiếu Assetid" });
    else if (seenAsset.has(r.assetId)) errors.push({ line, code: r.fullCode, reason: `Trùng Assetid ${r.assetId}` });
    else seenAsset.add(r.assetId);

    if (!r.fullCode) errors.push({ line, code: r.assetId, reason: "Thiếu Mã thiết bị" });
    else if (seenCode.has(r.fullCode)) errors.push({ line, code: r.fullCode, reason: "Trùng Mã thiết bị trong cùng cây" });
    else seenCode.add(r.fullCode);

    if (!r.name) errors.push({ line, code: r.fullCode, reason: "Thiếu tên thiết bị" });
    if (r.fullCode && !r.fullCode.startsWith(S1_PREFIX)) errors.push({ line, code: r.fullCode, reason: "Mã không bắt đầu bằng DH1.S1" });
    if (clean(system) && r.fullCode && r.fullCode !== sysPrefix && !r.fullCode.startsWith(`${sysPrefix}.`))
      errors.push({ line, code: r.fullCode, reason: `Dòng thuộc sai hệ thống (không thuộc ${sysPrefix})` });
    if (r.fullCode && r.fullCode.split(".").length > MAX_DEPTH)
      errors.push({ line, code: r.fullCode, reason: `Vượt giới hạn ${MAX_DEPTH} cấp` });

    if (r.assetId) inBatchByAsset.set(r.assetId, r);
    if (r.fullCode) inBatchCodes.add(r.fullCode);
  });

  // Cha = fullCode của AssetidParent (trong batch hoặc DB); nếu không → tổ tiên gần nhất theo
  // tiền tố Mã (trong batch ∪ DB). null nếu là gốc (DH1.S1).
  const allCodes = new Set<string>([...inBatchCodes, ...existing.seqs]);
  const nearestByPrefix = (code: string): string | null => {
    const parts = code.split(".");
    parts.pop();
    while (parts.length) {
      const p = parts.join(".");
      if (allCodes.has(p)) return p;
      parts.pop();
    }
    return null;
  };
  const parentCodeOf = (r: RawImportRow): string | null => {
    if (r.assetParentId) {
      const p = inBatchByAsset.get(r.assetParentId);
      if (p) return p.fullCode;
      const dbSeq = existing.byAsset.get(r.assetParentId);
      if (dbSeq) return dbSeq;
    }
    return nearestByPrefix(r.fullCode);
  };

  const valid = rows.filter((r) => r.assetId && r.fullCode && r.name && r.fullCode.startsWith(S1_PREFIX));
  valid.sort((a, b) => compareFullCode(a.fullCode, b.fullCode));

  const nodes: BuiltNode[] = [];
  let toCreate = 0, toUpdate = 0, unchanged = 0;
  valid.forEach((r, i) => {
    const parentSeq = parentCodeOf(r);
    if (parentSeq && !r.fullCode.startsWith(`${parentSeq}.`)) {
      errors.push({ line: i + 1, code: r.fullCode, reason: `Mã con không bắt đầu bằng mã cha (${parentSeq})` });
    }
    if (r.fullCode !== `${S1_PREFIX}` && parentSeq === null) {
      warnings.push({ line: i + 1, code: r.fullCode, reason: "Không tìm thấy cha — sẽ thành nút gốc" });
    }
    const stripped = displayCode(r.fullCode);
    const isExisting = existing.byAsset.has(r.assetId);
    if (isExisting) {
      const seq = existing.byAsset.get(r.assetId)!;
      const d = existing.detail.get(seq);
      if (d && d.name === r.name && (d.kks ?? null) === (r.kks ?? null)) unchanged++;
      else toUpdate++;
    } else toCreate++;
    nodes.push({
      seq: r.fullCode,
      externalId: r.assetId,
      parentSeq,
      code: r.fullCode,
      name: r.name,
      kks: r.kks,
      drawing: r.drawing,
      depth: r.fullCode.split(".").length,
      sort: i + 1,
      searchText: normalizeText(`${r.name} ${r.kks ?? ""} ${stripped} ${r.fullCode}`),
      childCount: 0,
    });
  });

  // childCount trong phạm vi batch (gần đúng cho preview; commit sẽ tính lại chính xác toàn cây)
  const cc = new Map<string, number>();
  for (const n of nodes) if (n.parentSeq) cc.set(n.parentSeq, (cc.get(n.parentSeq) ?? 0) + 1);
  for (const n of nodes) n.childCount = cc.get(n.seq) ?? 0;

  const preview: ImportPreview = {
    system: clean(system),
    valid: valid.length,
    parents: nodes.filter((n) => n.childCount > 0).length,
    leaves: nodes.filter((n) => n.childCount === 0).length,
    toCreate: mode === "ADD" ? toCreate : toCreate,
    toUpdate: mode === "ADD" ? 0 : toUpdate,
    unchanged,
    errors,
    warnings,
    builtCount: nodes.length,
  };
  return { preview, nodes };
}
