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

const WATER_TREATMENT_ROOT = {
  seq: "1.1",
  parentSeq: "1.0",
  name: "HỆ THỐNG XỬ LÝ NƯỚC",
  drawing: "F4281Z",
  depth: 2,
} satisfies NormalizedEquipmentNode;

const COMMON_ROOT = {
  seq: "1.0",
  parentSeq: null,
  name: "HỆ THỐNG COMMON",
  drawing: null,
  depth: 2,
} satisfies NormalizedEquipmentNode;

const RENAMED_ROOTS = new Map<string, string>([
  ["1.3", "HỆ THỐNG PHỤ TRỢ"],
]);

const COMMON_CHILD_SEQS = new Set(["1.1", "1.3"]);

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

export function normalizeEquipmentNodes(nodes: NormalizedEquipmentNode[]) {
  const normalizedNodes = nodes.map((node) => {
    const renamed = RENAMED_ROOTS.get(node.seq);
    const name = normalizeEquipmentNodeName(node.seq, renamed ?? node.name);
    const baseNode = {
      ...node,
      name,
      ...(COMMON_CHILD_SEQS.has(node.seq) ? { parentSeq: COMMON_ROOT.seq } : {}),
    };
    return node.seq === WATER_TREATMENT_ROOT.seq ? { ...baseNode, ...WATER_TREATMENT_ROOT } : baseNode;
  });

  if (!normalizedNodes.some((node) => node.seq === COMMON_ROOT.seq)) {
    normalizedNodes.push(COMMON_ROOT);
  }

  if (!normalizedNodes.some((node) => node.seq === WATER_TREATMENT_ROOT.seq)) {
    normalizedNodes.push(WATER_TREATMENT_ROOT);
  }

  return normalizedNodes.sort((a, b) => compareEquipmentSeq(a.seq, b.seq));
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
