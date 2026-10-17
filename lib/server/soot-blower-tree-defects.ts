import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFECT_STATUS, type DefectStatusKey } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { SOOT_BLOWER_TAGS, type SootBlowerDept } from "@/lib/soot-blower-layout";

/*
 * Khiếm khuyết vòi thổi bụi lấy từ SYC (bảng Defect), theo nhánh cây thiết bị
 * "Hệ thống vòi thổi bụi": hành trình dài (IK01–IK24), hành trình ngắn (IR01–IR60), bộ hâm (IKEL01–IKEL10),
 * APH (IKAH01–IKAH04, tag sơ đồ AH01–AH04), và nhánh "Hệ thống thổi bụi SCR" (IKSL-A1…A6, IKSL-B1…B6 — node
 * "Máy thổi bụi SCR nhánh A số 1", KKS 10HSF20AE001…/10HSF30AE001…, 17/10/2026), và 2 vòi GGH của FGD (GGH-TREN,
 * GGH-DUOI — nhánh "Bộ GGH", KKS 10HTB10AA001/002, động cơ vòi 10HTB30AE001/002).
 *
 * Cây vật lý chỉ có MỘT bộ node mã chuẩn DH1.S1.x; phiếu S2 gắn vào cùng node với
 * mappedDeviceUnit = "S2" (xem lib/equipment-units.ts canonicalSeq). Nên tổ máy lấy theo
 * mappedDeviceUnit, thiếu thì theo unit của phiếu.
 *
 * Phần lớn phiếu đồng bộ từ Google Sheet chưa gắn node (deviceSeq null), nên với phiếu
 * chưa gắn thiết bị còn khớp theo tên vòi ("IK07", "IR 21") và KKS của chính node
 * (10HCB21AT007, 10HCB24AT021) trong nội dung phiếu.
 *
 * Loại yêu cầu: Điện → SCĐ, Cơ → SCCN; loại khác bỏ qua.
 */

const REQUEST_DEPT: Record<string, SootBlowerDept> = { "Điện": "SCĐ", "Cơ": "SCCN" };

/**
 * Nhóm vòi lấy từ cây: nhánh cha tìm theo tên (không phụ thuộc mã khi cây được sắp xếp lại),
 * node con có tên kết thúc bằng tag ("Máy thổi bụi hành trình ngắn IR07").
 * Loại vòi mà tên node không theo dạng "<tiền tố><số>" thì khai `tagOfName` (IKSL: "nhánh A số 1" → IKSL-A1).
 */
const TREE_GROUPS: readonly { prefix: string; parentName: string; tagOfName?: (name: string) => string | null }[] = [
  { prefix: "IK", parentName: "hành trình dài" },
  { prefix: "IR", parentName: "hành trình ngắn" },
  // đủ cụm "thổi bụi …": cây còn "Hệ thống bộ hâm", "Bộ hâm" ở nhánh khác
  { prefix: "IKEL", parentName: "thổi bụi bộ hâm" },
  // cây còn nhiều nhánh "APH" khác (Hệ thống APH A/B, van, dầu bôi trơn…) → khớp đủ cụm
  { prefix: "IKAH", parentName: "thổi bụi aph ikah" },
  // đủ cụm "hệ thống …": còn nhánh "Các van cấp hơi thổi bụi SCR", "Van xả đọng thổi bụi SCR"
  { prefix: "IKSL", parentName: "hệ thống thổi bụi scr", tagOfName: (name) => {
    const m = normalizeText(name).match(/nhanh\s*([ab])\s*so\s*0*([1-6])\s*$/);
    return m ? `IKSL-${m[1].toUpperCase()}${m[2]}` : null;
  } },
  // GGH (FGD, 17/10/2026): node "Vòi thổi bụi trên/dưới" + "Động cơ vòi thổi bụi trên/dưới" dưới "Bộ GGH" → 2 vòi.
  // "Bản thể GGH" có node con cũng tên "Bộ GGH" nhưng không có con (lọc childCount > 0).
  { prefix: "GGH", parentName: "bộ ggh", tagOfName: (name) => gghTagOf(normalizeText(name).match(/voi\s+thoi\s+bui\s+(tren|duoi)\s*$/)?.[1]) },
];
type Prefix = string;
const gghTagOf = (side: string | undefined) => (side === "tren" ? "GGH-TREN" : side === "duoi" ? "GGH-DUOI" : null);

/** Dòng khiếm khuyết SYC đã quy về một vòi — cùng dạng SootBlowerDefect để bảng dùng chung. */
export type SootBlowerSycDefect = {
  id: string;
  machine: string;
  tag: string;
  dept: SootBlowerDept;
  description: string;
  reportedBy: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  source: "SYC";
  requestNumber: string | null;
  sycStatus: string;
  /** true nếu phiếu đã gắn node trên cây; false = khớp theo tên/KKS trong nội dung */
  linked: boolean;
};

type TreeNode = { seq: string; tag: string; kksKey: string | null };

const pad2 = (n: number) => String(n).padStart(2, "0");
const compact = (s: string) => s.toUpperCase().replace(/\s+/g, "");
/**
 * Tag trên sơ đồ có thể khác tên vòi: IKAH lưu là AH01–AH04 (lib/soot-blower-layout.ts). Chỉ khớp
 * "IKAH" trong nội dung, không khớp "AH0…" trơn — chuỗi đó có trong KKS AHU/chiller (A0SAC60AH004).
 */
const TAG_PREFIX: Partial<Record<Prefix, string>> = { IKAH: "AH" };
const tagOf = (prefix: Prefix, n: string | number) => `${TAG_PREFIX[prefix] ?? prefix}${pad2(Number(n))}`;

/** Node vòi của mọi nhóm trong TREE_GROUPS (24 IK + 60 IR + 10 IKEL + 4 IKAH + 12 IKSL + 2 GGH). */
async function loadTreeNodes(): Promise<TreeNode[]> {
  const parents = await prisma.equipmentNode.findMany({
    where: { OR: TREE_GROUPS.map((g) => ({ name: { contains: g.parentName, mode: "insensitive" as const } })), childCount: { gt: 0 } },
    select: { seq: true, name: true },
  });
  const prefixOfParent = new Map<string, Prefix>();
  for (const p of parents) {
    const name = p.name.toLowerCase();
    const group = TREE_GROUPS.find((g) => name.includes(g.parentName));
    if (group) prefixOfParent.set(p.seq, group.prefix);
  }
  if (prefixOfParent.size === 0) return [];
  const nodes = await prisma.equipmentNode.findMany({
    where: { parentSeq: { in: [...prefixOfParent.keys()] } },
    select: { seq: true, name: true, kks: true, parentSeq: true },
  });
  const out: TreeNode[] = [];
  for (const n of nodes) {
    const prefix = prefixOfParent.get(n.parentSeq ?? "");
    if (!prefix) continue;
    const byName = TREE_GROUPS.find((g) => g.prefix === prefix)?.tagOfName;
    const m = byName ? null : n.name.trim().match(new RegExp(`\\b${prefix}\\s*0*(\\d{1,2})\\s*$`, "i"));
    const tag = byName ? byName(n.name) : m ? tagOf(prefix, m[1]) : null;
    if (!tag || !SOOT_BLOWER_TAGS.has(tag)) continue;
    // KKS "10HCB21AT007": bỏ 2 số đầu (tổ máy) để khớp được cả phiếu S2 ("20HCB21AT007").
    const kks = n.kks ? compact(n.kks) : "";
    out.push({ seq: n.seq, tag, kksKey: /^\d{2}[A-Z]/.test(kks) ? kks.slice(2) : null });
  }
  return out;
}

/**
 * Tag nhắc trong nội dung: "IK07", "IR 21", "VTB IK10", cả dạng liệt kê "IK05,11,21",
 * "IR 22,24,04", "IKEL03,07", "ik17 và 20". Tiền tố IK không bắt nhầm IKEL/IKSL/IKAH; số sau dấu cách mà dính
 * chữ ("IK 21 10HCB…") không tính là vòi.
 */
const NUMBERED_GROUPS = TREE_GROUPS.filter((g) => !g.tagOfName);
const LIST_RE: Record<Prefix, RegExp> = Object.fromEntries(
  NUMBERED_GROUPS.map(({ prefix }) => [
    prefix,
    new RegExp(`(?<![A-Z0-9])${prefix}\\s?(\\d{1,2})(?!\\d)((?:\\s*(?:[,;&/]|và)\\s*(?:${prefix}\\s?)?\\d{1,2}(?![\\dA-Z]))*)`, "gi"),
  ])
) as Record<Prefix, RegExp>;
/**
 * IKSL trong nội dung (đã bỏ dấu, chữ thường). Hiện trường gọi các vòi này là "IKSL" kèm nhánh: "IKSL05 nhánh A",
 * "IKSL 01,06 (A)", "IK SL 02 nhánh A" — chỉ nhận khi có nhánh ngay sau (IKSL trơn hay dùng chỉ vị trí: "dưới IKSL06").
 * Ngoài ra: tag "IKSL-A1" / "IKSL A1" (cả "IKSH-A1" — tên app dùng 17/10/2026 trước khi đổi sang IKSL), và "vòi thổi bụi SCR #3 nhánh B", "thổi bụi SCR nhánh A số 2" (dạng này chỉ
 * tính khi phiếu có cả "thổi bụi" lẫn "SCR").
 */
const IKSL_TAG_RE = /(?<![a-z0-9])iks[hl]\s*-?\s*([ab])\s*-?\s*0?([1-6])(?!\d)/g;
const IKSL_RE = /(?<![a-z0-9])ik\s?sl\s*0?([1-6])(?!\d)((?:\s*(?:[,;&/]|va)\s*0?[1-6](?!\d))*)(?=([^.;\n]{0,25}))/g;
// nhánh ngay sau số, cho phép chen một cặp ngoặc KKS: "IKSL03 (10HSF20AE003) nhánh A"
const IKSL_BRANCH_RE = /^\s*(?:\([^)]{0,20}\)\s*)?(?:nhanh\s*([ab])(?![a-z])|\(\s*(?:nhanh\s*)?([ab])\s*\))/;
const SCR_BRANCH_RE = /nhanh\s*([ab])\s*(?:so|#)?\s*0?([1-6])(?!\d)|(?:so|#)\s*0?([1-6])\s*,?\s*nhanh\s*([ab])(?![a-z])/g;
function ikslInText(content: string, out: Set<string>) {
  const text = normalizeText(content);
  const add = (branch: string, n: string) => { const tag = `IKSL-${branch.toUpperCase()}${Number(n)}`; if (SOOT_BLOWER_TAGS.has(tag)) out.add(tag); };
  for (const m of text.matchAll(IKSL_TAG_RE)) add(m[1], m[2]);
  for (const m of text.matchAll(IKSL_RE)) {
    const branch = m[3].match(IKSL_BRANCH_RE);
    if (branch) for (const n of [m[1], ...(m[2].match(/[1-6]/g) ?? [])]) add(branch[1] ?? branch[2], n);
  }
  if (text.includes("thoi bui") && text.includes("scr")) for (const m of text.matchAll(SCR_BRANCH_RE)) add(m[1] ?? m[4], m[2] ?? m[3]);
}

/**
 * GGH trong nội dung (bỏ dấu): "vòi thổi bụi trên GGH", "động cơ vòi thổi bụi dưới", "rửa cao áp vòi trên/dưới GGH"
 * (rửa nước dùng chung cần vòi) — chỉ khi phiếu có ngữ cảnh GGH (chữ "GGH" hoặc KKS HTB…). "đầu vào vòi thổi bụi GGH"
 * (không nói trên/dưới) không quy về vòi nào.
 */
const GGH_PANEL_RE = /htb10gs101\s*-?\s*(top|bot)(?:\s*\/\s*(top|bot))?(?![a-z])/g;
const GGH_SIDE_RE = /voi\s+(?:thoi\s+bui\s+)?(tren|duoi)(?:\s*(?:\/|va|,)\s*(tren|duoi))?(?![a-z])/g;
function gghInText(content: string, out: Set<string>) {
  const text = normalizeText(content);
  if (!/(?<![a-z])ggh(?![a-z])|htb\d/.test(text)) return;
  for (const m of text.matchAll(GGH_SIDE_RE)) for (const side of [m[1], m[2]]) { const tag = gghTagOf(side); if (tag) out.add(tag); }
  // KKS tủ tại chỗ của cần vòi hiện trường hay ghi: "10HTB10GS101-TOP" (vòi trên) / "-BOT" (vòi dưới), cả "-top/bot"
  for (const m of text.matchAll(GGH_PANEL_RE)) for (const side of [m[1], m[2]]) { const tag = gghTagOf(side === "top" ? "tren" : side === "bot" ? "duoi" : undefined); if (tag) out.add(tag); }
}

export function tagsInText(content: string): Set<string> {
  const out = new Set<string>();
  ikslInText(content, out);
  gghInText(content, out);
  for (const { prefix } of NUMBERED_GROUPS) {
    for (const m of content.matchAll(LIST_RE[prefix])) {
      for (const n of [m[1], ...(m[2].match(/\d{1,2}/g) ?? [])]) {
        const tag = tagOf(prefix, n);
        if (SOOT_BLOWER_TAGS.has(tag)) out.add(tag);
      }
    }
  }
  return out;
}

/**
 * Vòi được nhắc trong phiếu chưa gắn cây. Tên vòi và KKS thường đi cặp; nếu hai bên cùng số
 * lượng mà lệch nhau thì coi KKS là gõ nhầm ("IK03 (10HCB21AT001)") và tin tên vòi.
 * Khác số lượng thì gộp, vì phiếu hay viết gọn "IK09,04 (…AT009;…AT004)".
 */
function tagsInContent(content: string, kksToTag: Map<string, string>): Set<string> {
  const byName = tagsInText(content);
  const text = compact(content);
  const byKks = new Set<string>();
  for (const [key, tag] of kksToTag) if (text.includes(key)) byKks.add(tag);
  // Vòi SCR: phiếu ghi nhánh bằng chữ mà KKS kèm theo hay lệch nhánh ("IKSL05 nhánh A (10HSF30AE005)" — trên cây HSF30
  // là nhánh B). Phiếu gắn node trên prod đều chọn node theo CHỮ "nhánh" → chữ đã chỉ ra vòi SCR thì bỏ phần đoán theo KKS.
  if ([...byName].some((t) => t.startsWith("IKSL"))) for (const t of byKks) if (t.startsWith("IKSL")) byKks.delete(t);
  if (byName.size > 0 && byName.size === byKks.size && [...byKks].some((t) => !byName.has(t))) return byName;
  return new Set([...byName, ...byKks]);
}

const SELECT = {
  id: true,
  unit: true,
  mappedDeviceUnit: true,
  deviceSeq: true,
  requestType: true,
  requestNumber: true,
  status: true,
  content: true,
  system: true,
  detectedAt: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  sourceCompletedAt: true,
  relatedDevices: { select: { deviceSeq: true, mappedUnit: true } },
} satisfies Prisma.DefectSelect;

type Row = Prisma.DefectGetPayload<{ select: typeof SELECT }>;

/** Khiếm khuyết SYC của các vòi lấy từ cây (IK, IR, IKEL, IKAH, IKSL, GGH) một tổ máy — cả đang mở lẫn đã xử lý (lịch sử). */
export async function loadSootBlowerSycDefects(machine: string): Promise<SootBlowerSycDefect[]> {
  const nodes = await loadTreeNodes();
  if (nodes.length === 0) return [];
  const seqToTag = new Map(nodes.map((n) => [n.seq, n.tag]));
  const kksToTag = new Map(nodes.filter((n) => n.kksKey).map((n) => [n.kksKey as string, n.tag]));
  const seqs = [...seqToTag.keys()];

  const base: Prisma.DefectWhereInput = { cancelledAt: null, requestType: { in: Object.keys(REQUEST_DEPT) } };
  const [linked, unlinked] = await Promise.all([
    prisma.defect.findMany({
      where: {
        ...base,
        OR: [
          { deviceSeq: { in: seqs }, OR: [{ mappedDeviceUnit: machine }, { mappedDeviceUnit: null, unit: machine }] },
          { relatedDevices: { some: { deviceSeq: { in: seqs }, mappedUnit: machine } } },
          { unit: machine, relatedDevices: { some: { deviceSeq: { in: seqs }, mappedUnit: null } } },
        ],
      },
      select: SELECT,
    }),
    // Lọc thô bằng SQL (tiền tố vòi hoặc "HCB" của KKS), khớp chính xác bằng regex bên dưới.
    prisma.defect.findMany({
      where: {
        ...base,
        unit: machine,
        deviceSeq: null,
        relatedDevices: { none: {} },
        OR: [...TREE_GROUPS.map((g) => g.prefix), "HCB", "HSF", "SCR", "HTB"].map((t) => ({ content: { contains: t, mode: "insensitive" as const } })),
      },
      select: SELECT,
    }),
  ]);

  const out: SootBlowerSycDefect[] = [];
  const emit = (d: Row, tags: Iterable<string>, isLinked: boolean) => {
    const dept = REQUEST_DEPT[d.requestType ?? ""];
    if (!dept) return;
    const done = d.status === "DA_XU_LY";
    for (const tag of tags) {
      out.push({
        id: `syc:${d.id}:${tag}`,
        machine,
        tag,
        dept,
        description: d.content?.trim() || "(Không có nội dung)",
        reportedBy: d.system ?? null,
        createdAt: d.detectedAt ?? d.createdAt,
        resolvedAt: done ? d.completedAt ?? d.sourceCompletedAt ?? d.updatedAt : null,
        resolvedBy: null,
        source: "SYC",
        requestNumber: d.requestNumber ?? null,
        sycStatus: DEFECT_STATUS[d.status as DefectStatusKey]?.label ?? d.status,
        linked: isLinked,
      });
    }
  };

  for (const d of linked) {
    const tags = new Set<string>();
    const main = d.deviceSeq ? seqToTag.get(d.deviceSeq) : undefined;
    if (main && (d.mappedDeviceUnit ?? d.unit) === machine) tags.add(main);
    for (const r of d.relatedDevices) {
      const tag = seqToTag.get(r.deviceSeq);
      if (tag && (r.mappedUnit ?? d.unit) === machine) tags.add(tag);
    }
    emit(d, tags, true);
  }
  for (const d of unlinked) emit(d, tagsInContent(d.content ?? "", kksToTag), false);

  return out;
}
