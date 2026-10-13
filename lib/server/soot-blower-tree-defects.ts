import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFECT_STATUS, type DefectStatusKey } from "@/lib/constants";
import { SOOT_BLOWER_TAGS, type SootBlowerDept } from "@/lib/soot-blower-layout";

/*
 * Khiếm khuyết vòi thổi bụi IK lấy từ SYC (bảng Defect), theo nhánh cây thiết bị
 * "Hệ thống vòi thổi bụi › Thổi bụi hành trình dài" (IK01–IK24).
 *
 * Cây vật lý chỉ có MỘT bộ node mã chuẩn DH1.S1.x; phiếu S2 gắn vào cùng node với
 * mappedDeviceUnit = "S2" (xem lib/equipment-units.ts canonicalSeq). Nên tổ máy lấy theo
 * mappedDeviceUnit, thiếu thì theo unit của phiếu.
 *
 * Phần lớn phiếu đồng bộ từ Google Sheet chưa gắn node (deviceSeq null), nên với phiếu
 * chưa gắn thiết bị còn khớp theo tên vòi ("IK07", "IK 21") và KKS của chính node
 * (10HCB21AT007) trong nội dung phiếu.
 *
 * Loại yêu cầu: Điện → SCĐ, Cơ → SCCN; loại khác bỏ qua.
 */

const REQUEST_DEPT: Record<string, SootBlowerDept> = { "Điện": "SCĐ", "Cơ": "SCCN" };

/** Nhánh cha trong cây — tìm theo tên để không phụ thuộc mã khi cây được sắp xếp lại. */
const PARENT_NAME = "hành trình dài";
const NODE_TAG_RE = /\bIK\s*0*(\d{1,2})\s*$/i;

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

type IkNode = { seq: string; tag: string; kksKey: string | null };

const pad2 = (n: number) => String(n).padStart(2, "0");
const compact = (s: string) => s.toUpperCase().replace(/\s+/g, "");

/** 24 node IK dưới nhánh "Thổi bụi hành trình dài". Tên node kết thúc bằng tag: "… IK07". */
async function loadIkNodes(): Promise<IkNode[]> {
  const parents = await prisma.equipmentNode.findMany({
    where: { name: { contains: PARENT_NAME, mode: "insensitive" }, childCount: { gt: 0 } },
    select: { seq: true },
  });
  if (parents.length === 0) return [];
  const nodes = await prisma.equipmentNode.findMany({
    where: { parentSeq: { in: parents.map((p) => p.seq) } },
    select: { seq: true, name: true, kks: true },
  });
  const out: IkNode[] = [];
  for (const n of nodes) {
    const m = n.name.trim().match(NODE_TAG_RE);
    if (!m) continue;
    const tag = `IK${pad2(Number(m[1]))}`;
    if (!SOOT_BLOWER_TAGS.has(tag)) continue;
    // KKS "10HCB21AT007": bỏ 2 số đầu (tổ máy) để khớp được cả phiếu S2 ("20HCB21AT007").
    const kks = n.kks ? compact(n.kks) : "";
    out.push({ seq: n.seq, tag, kksKey: /^\d{2}[A-Z]/.test(kks) ? kks.slice(2) : null });
  }
  return out;
}

/**
 * Tag IK nhắc trong nội dung: "IK07", "IK 21", "VTB IK10", cả dạng liệt kê "IK05,11,21",
 * "IK 01, 03, 05", "ik17 và 20". Không bắt IKEL/IKSH/IKSL/IKAH; số ngay sau dấu cách mà dính
 * chữ ("IK 21 10HCB…") không tính là vòi.
 */
const IK_LIST_RE = /(?<![A-Z0-9])IK\s?(\d{1,2})(?!\d)((?:\s*(?:[,;&/]|và)\s*(?:IK\s?)?\d{1,2}(?![\dA-Z]))*)/gi;
function tagsInText(content: string): Set<string> {
  const out = new Set<string>();
  for (const m of content.matchAll(IK_LIST_RE)) {
    for (const n of [m[1], ...(m[2].match(/\d{1,2}/g) ?? [])]) {
      const tag = `IK${pad2(Number(n))}`;
      if (SOOT_BLOWER_TAGS.has(tag)) out.add(tag);
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

/** Khiếm khuyết SYC của 24 vòi IK một tổ máy — cả đang mở lẫn đã xử lý (lịch sử). */
export async function loadSootBlowerSycDefects(machine: string): Promise<SootBlowerSycDefect[]> {
  const nodes = await loadIkNodes();
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
    // Lọc thô bằng SQL ("IK" hoặc "HCB"), khớp chính xác bằng regex bên dưới.
    prisma.defect.findMany({
      where: {
        ...base,
        unit: machine,
        deviceSeq: null,
        relatedDevices: { none: {} },
        OR: [{ content: { contains: "IK", mode: "insensitive" } }, { content: { contains: "HCB", mode: "insensitive" } }],
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
