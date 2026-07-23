import type { PrismaClient } from "@prisma/client";

export interface NormalizedEquipmentNode {
  seq: string;
  parentSeq: string | null;
  name: string;
  kks?: string | null;
  drawing: string | null;
  depth: number;
  deviceId?: string | null;
  attachedInfo?: string | null;
  documentUrl?: string | null;
  imageUrl?: string | null;
}

export function compareEquipmentSeq(a: string, b: string) {
  const pa = a.split(".");
  const pb = b.split(".");
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = i < pa.length ? Number(pa[i]) : -1;
    const y = i < pb.length ? Number(pb[i]) : -1;
    if (x !== y) return x - y;
  }
  return 0;
}

function normalizeDuplicateText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type DedupedEquipmentLeaf<T extends { seq: string; name: string }> = T & {
  duplicateSeqs: string[];
  duplicateCount: number;
};

export function dedupeEquipmentLeafNodes<
  T extends { seq: string; name: string; parentSeq?: string | null; drawing?: string | null; deviceId?: string | null },
>(
  nodes: T[]
): DedupedEquipmentLeaf<T>[] {
  const grouped = new Map<string, DedupedEquipmentLeaf<T>>();

  for (const node of nodes) {
    const key = [node.parentSeq ?? "", normalizeDuplicateText(node.name) || node.seq].join("|");
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        ...node,
        duplicateSeqs: [node.seq],
        duplicateCount: 1,
      });
      continue;
    }

    existing.duplicateSeqs.push(node.seq);
    existing.duplicateCount += 1;
    if (!existing.drawing && node.drawing) existing.drawing = node.drawing;
    if (!existing.deviceId && node.deviceId) existing.deviceId = node.deviceId;
  }

  return Array.from(grouped.values()).sort((a, b) => compareEquipmentSeq(a.seq, b.seq));
}

export function normalizeEquipmentNodeName(seq: string, name: string) {
  if (
    seq.startsWith("1.4.11.") &&
    /bunker\s*than/i.test(name) &&
    /than\s*nguyên|than\s*nguyen/i.test(name)
  ) {
    return "Bunker than nguyên";
  }

  return name;
}

// Cây mới (fullCode DH1.S1.x) đọc THẲNG từ danh mục — không còn chèn node ảo/đổi tên
// của cây cũ ("1.0 HỆ THỐNG COMMON", "1.1", "1.3"...). COMMON giờ là nhánh DH1.S1.5/6
// (xem lib/equipment-units.ts).
export function normalizeEquipmentNodes(nodes: NormalizedEquipmentNode[]) {
  return nodes
    .map((node) => ({ ...node, name: normalizeEquipmentNodeName(node.seq, node.name) }))
    .sort((a, b) => compareEquipmentSeq(a.seq, b.seq));
}

export async function getNormalizedEquipmentNodes(prisma: PrismaClient) {
  const nodes = await prisma.equipmentNode.findMany({
    orderBy: { sort: "asc" },
    select: { seq: true, parentSeq: true, name: true, kks: true, drawing: true, depth: true, attachedInfo: true, documentUrl: true, imageUrl: true },
  });
  return normalizeEquipmentNodes(nodes);
}

export async function getNormalizedEquipmentNodeList(prisma: PrismaClient) {
  const nodes = await prisma.equipmentNode.findMany({
    orderBy: { sort: "asc" },
    select: { seq: true, parentSeq: true, name: true, drawing: true, depth: true },
  });
  return normalizeEquipmentNodes(nodes);
}

export function buildEquipmentTreeIndex(nodes: NormalizedEquipmentNode[]) {
  const bySeq = new Map<string, NormalizedEquipmentNode>();
  nodes.forEach((node) => bySeq.set(node.seq, node));

  const parentOf = new Map<string, string | null>();
  const childrenOf = new Map<string, NormalizedEquipmentNode[]>();
  const roots: NormalizedEquipmentNode[] = [];

  for (const node of nodes) {
    let parent: string | null = node.parentSeq && bySeq.has(node.parentSeq) ? node.parentSeq : null;
    if (!parent) {
      const parts = node.seq.split(".");
      parts.pop();
      while (parts.length) {
        const p = parts.join(".");
        if (bySeq.has(p)) {
          parent = p;
          break;
        }
        parts.pop();
      }
    }

    parentOf.set(node.seq, parent);
    if (parent) {
      const children = childrenOf.get(parent) ?? [];
      children.push(node);
      childrenOf.set(parent, children);
    } else {
      roots.push(node);
    }
  }

  for (const children of childrenOf.values()) {
    children.sort((a, b) => compareEquipmentSeq(a.seq, b.seq));
  }
  roots.sort((a, b) => compareEquipmentSeq(a.seq, b.seq));

  return { bySeq, parentOf, childrenOf, roots };
}

export function getEquipmentDescendantSeqs(nodes: NormalizedEquipmentNode[], rootSeq: string) {
  const { childrenOf } = buildEquipmentTreeIndex(nodes);
  const result = new Set<string>([rootSeq]);
  const queue = [...(childrenOf.get(rootSeq) ?? [])];
  while (queue.length) {
    const node = queue.shift()!;
    if (result.has(node.seq)) continue;
    result.add(node.seq);
    queue.push(...(childrenOf.get(node.seq) ?? []));
  }
  return result;
}
