import { PrismaClient } from "@prisma/client";
import {
  isPositionAllowedForDefectUnit,
  isSelectableManagingPosition,
} from "../lib/constants";
import { normalizeText } from "../lib/nav";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const CLEAN = process.argv.includes("--clean");

const DEMO_ROOTS = {
  S1: {
    seq: "DH1.S1.7.900",
    name: "[DEMO] THIẾT BỊ THEO CƯƠNG VỊ — S1/S2",
    sort: 970_000,
  },
  COMMON: {
    seq: "DH1.S1.5.900",
    name: "[DEMO] THIẾT BỊ THEO CƯƠNG VỊ — DÙNG CHUNG",
    sort: 950_000,
  },
} as const;

const DEVICE_TEMPLATES = [
  { name: "Bơm vận hành", suffix: "P001" },
  { name: "Van điều khiển", suffix: "V001" },
  { name: "Tủ điều khiển", suffix: "C001" },
] as const;

function searchText(...values: Array<string | null | undefined>) {
  return normalizeText(values.filter(Boolean).join(" "));
}

function nodeData(input: {
  seq: string;
  parentSeq: string | null;
  name: string;
  kks?: string | null;
  sort: number;
}) {
  return {
    seq: input.seq,
    parentSeq: input.parentSeq,
    code: input.seq,
    name: input.name,
    kks: input.kks ?? null,
    depth: input.seq.split(".").length,
    sort: input.sort,
    searchText: searchText(input.name, input.kks, input.seq),
    deviceSynced: false,
  };
}

function scopesForPosition(position: string) {
  const normalized = normalizeText(position);
  const scopes = new Set<keyof typeof DEMO_ROOTS>();
  if (isPositionAllowedForDefectUnit("S1", position)) scopes.add("S1");
  if (isPositionAllowedForDefectUnit("COMMON", position)) scopes.add("COMMON");

  // Các nhãn tài khoản thực tế dùng dạng viết tắt/tiền tố khác danh sách nghiệp vụ.
  if (normalized.includes("truong kip lo may")) {
    scopes.add("S1");
    scopes.add("COMMON");
  }
  if (normalized === "tk dien" || normalized.includes("truong kip dien")) {
    scopes.add("S1");
    scopes.add("COMMON");
  }
  if (normalized.includes("xln thai")) scopes.add("COMMON");
  return Array.from(scopes);
}

async function clean() {
  const prefixes = Object.values(DEMO_ROOTS).map((root) => root.seq);
  const nodes = await prisma.equipmentNode.findMany({
    where: { OR: prefixes.map((prefix) => ({ seq: { startsWith: prefix } })) },
    select: { seq: true },
  });
  const seqs = nodes.map((node) => node.seq);
  if (!seqs.length) {
    console.log("Không có thiết bị demo theo cương vị để xóa.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.positionSystemScope.deleteMany({ where: { systemSeq: { in: seqs } } });
    await tx.equipmentNode.deleteMany({ where: { seq: { in: seqs } } });
    await tx.$executeRaw`
      UPDATE "EquipmentNode" p
      SET "childCount" = (
        SELECT COUNT(*)::int FROM "EquipmentNode" c WHERE c."parentSeq" = p.seq
      )
    `;
  });
  console.log(`Đã xóa ${seqs.length} node demo theo cương vị.`);
}

async function seed() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      position: true,
      secondaryPosition: true,
      secondaryPosition2: true,
      currentPosition: true,
    },
  });
  const positions = Array.from(new Set(
    users.flatMap((user) => [
      user.position,
      user.secondaryPosition,
      user.secondaryPosition2,
      user.currentPosition,
    ])
      .filter((value): value is string => Boolean(value?.trim()))
      .filter(isSelectableManagingPosition)
  )).sort((a, b) => a.localeCompare(b, "vi"));

  const assignments = positions.flatMap((position) => {
    return scopesForPosition(position).map((scope) => ({ position, scope }));
  });

  console.log(`Cương vị vận hành tìm thấy: ${positions.length}`);
  console.log(`Nhánh demo sẽ tạo/gán: ${assignments.length}`);
  for (const assignment of assignments) {
    console.log(`- ${assignment.position} → ${assignment.scope}`);
  }
  if (!APPLY) {
    console.log("Đang ở chế độ xem trước. Chạy lại với --apply để ghi vào localhost.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const root of Object.values(DEMO_ROOTS)) {
      const data = nodeData({
        seq: root.seq,
        parentSeq: null,
        name: root.name,
        sort: root.sort,
      });
      await tx.equipmentNode.upsert({
        where: { seq: root.seq },
        update: data,
        create: data,
      });
    }

    let assignmentIndex = 0;
    for (const { position, scope } of assignments) {
      assignmentIndex += 1;
      const root = DEMO_ROOTS[scope];
      const systemSeq = `${root.seq}.${assignmentIndex}`;
      const systemName = `[DEMO] ${position} — ${scope === "COMMON" ? "Dùng chung" : "S1/S2"}`;
      const systemData = nodeData({
        seq: systemSeq,
        parentSeq: root.seq,
        name: systemName,
        sort: root.sort + assignmentIndex * 10,
      });
      await tx.equipmentNode.upsert({
        where: { seq: systemSeq },
        update: systemData,
        create: systemData,
      });

      await tx.positionSystemScope.upsert({
        where: { position_systemSeq: { position, systemSeq } },
        update: { access: "edit" },
        create: { position, systemSeq, access: "edit" },
      });

      for (const [deviceIndex, template] of DEVICE_TEMPLATES.entries()) {
        const number = deviceIndex + 1;
        const seq = `${systemSeq}.${number}`;
        const kks = `DEMO-${scope}-${String(assignmentIndex).padStart(2, "0")}-${template.suffix}`;
        const name = `${template.name} — ${position} (${scope === "COMMON" ? "Dùng chung" : "S1/S2"})`;
        const data = nodeData({
          seq,
          parentSeq: systemSeq,
          name,
          kks,
          sort: systemData.sort + number,
        });
        await tx.equipmentNode.upsert({
          where: { seq },
          update: data,
          create: data,
        });
      }
    }

    await tx.$executeRaw`
      UPDATE "EquipmentNode" p
      SET "childCount" = (
        SELECT COUNT(*)::int FROM "EquipmentNode" c WHERE c."parentSeq" = p.seq
      )
    `;
  }, { maxWait: 10_000, timeout: 30_000 });

  console.log(
    `Đã tạo ${assignments.length} nhánh và ${assignments.length * DEVICE_TEMPLATES.length} thiết bị demo.`
  );
}

async function main() {
  if (CLEAN) await clean();
  else await seed();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
