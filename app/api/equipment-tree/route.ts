import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

const WATER_TREATMENT_ROOT = {
  seq: "1.1",
  parentSeq: "1.0",
  name: "HỆ THỐNG XỬ LÝ NƯỚC",
  drawing: "F4281Z",
  depth: 2,
};

const COMMON_ROOT = {
  seq: "1.0",
  parentSeq: null,
  name: "HỆ THỐNG COMMON",
  drawing: null,
  depth: 2,
};

const RENAMED_ROOTS = new Map<string, string>([
  ["1.3", "HỆ THỐNG PHỤ TRỢ"],
]);

const COMMON_CHILD_SEQS = new Set(["1.1", "1.3"]);

function normalizeEquipmentNodeName(seq: string, name: string) {
  if (
    seq.startsWith("1.4.11.") &&
    /bunker\s*than/i.test(name) &&
    /than\s*nguyên|than\s*nguyen/i.test(name)
  ) {
    return "Bunker than nguyên";
  }

  return name;
}

// Toàn bộ cây danh mục thiết bị (phẳng) — client tự dựng cây từ seq/parentSeq.
export async function GET() {
  return handle(async () => {
    await requireUser();
    const nodes = await prisma.equipmentNode.findMany({
      orderBy: { sort: "asc" },
      select: { seq: true, parentSeq: true, name: true, drawing: true, depth: true },
    });
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

    return ok(normalizedNodes);
  });
}
