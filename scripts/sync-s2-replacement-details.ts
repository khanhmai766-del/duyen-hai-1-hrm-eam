import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.slice(2).includes("--apply");
const REPORT_LIMIT = 50;

const CONFIG_FIELDS = [
  "system",
  "location",
  "quantity",
  "deviceCount",
  "managingPosition",
  "intervalMonths",
  "intervalNote",
  "note",
] as const;

type ConfigField = (typeof CONFIG_FIELDS)[number];
type ReplacementWithMaterial = Prisma.MaterialReplacementGetPayload<{
  include: {
    material: {
      select: {
        id: true;
        code: true;
        name: true;
        machine: true;
      };
    };
  };
}>;

type SyncUpdate = {
  source: ReplacementWithMaterial;
  target: ReplacementWithMaterial;
  changedFields: ConfigField[];
};

type SyncCreate = {
  source: ReplacementWithMaterial;
  targetMaterialId: string;
};

function normalizedCode(value: string) {
  return value.trim().toLocaleUpperCase("vi");
}

function pointKey(materialId: string, deviceSeq: string) {
  return `${materialId}|${deviceSeq}`;
}

function sourceKey(row: ReplacementWithMaterial) {
  return `${normalizedCode(row.material.code)}|${row.deviceSeq ?? ""}`;
}

function sameValue(left: unknown, right: unknown) {
  return (left ?? null) === (right ?? null);
}

function configData(source: ReplacementWithMaterial) {
  return {
    system: source.system,
    location: source.location,
    quantity: source.quantity,
    deviceCount: source.deviceCount,
    managingPosition: source.managingPosition,
    intervalMonths: source.intervalMonths,
    intervalNote: source.intervalNote,
    note: source.note,
  };
}

function addMonths(base: Date, months: number) {
  const value = new Date(base);
  value.setMonth(value.getMonth() + Math.max(0, months));
  return value;
}

function groupByKey<T>(rows: T[], keyOf: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

async function main() {
  console.log(
    APPLY
      ? "ĐỒNG BỘ S2 THEO S1 — CHẾ ĐỘ GHI DỮ LIỆU"
      : "ĐỐI CHIẾU S2 THEO S1 — DRY-RUN (thêm --apply để ghi dữ liệu)"
  );

  const [sources, targets, materials] = await Promise.all([
    prisma.materialReplacement.findMany({
      where: { machine: "S1", isActive: true, deviceSeq: { not: null } },
      include: {
        material: {
          select: { id: true, code: true, name: true, machine: true },
        },
      },
      orderBy: [{ materialId: "asc" }, { deviceSeq: "asc" }, { createdAt: "asc" }],
    }),
    prisma.materialReplacement.findMany({
      where: { machine: "S2", isActive: true, deviceSeq: { not: null } },
      include: {
        material: {
          select: { id: true, code: true, name: true, machine: true },
        },
      },
      orderBy: [{ materialId: "asc" }, { deviceSeq: "asc" }, { createdAt: "asc" }],
    }),
    prisma.material.findMany({
      where: { machine: { in: ["S2", "COMMON"] } },
      select: { id: true, code: true, machine: true },
    }),
  ]);

  const s2MaterialByCode = new Map(
    materials
      .filter((material) => material.machine === "S2")
      .map((material) => [normalizedCode(material.code), material])
  );
  const commonMaterialByCode = new Map(
    materials
      .filter((material) => material.machine === "COMMON")
      .map((material) => [normalizedCode(material.code), material])
  );

  const sourceGroups = groupByKey(sources, sourceKey);
  const duplicateSources = [...sourceGroups.entries()].filter(([, rows]) => rows.length > 1);
  const uniqueSources = [...sourceGroups.values()]
    .filter((rows) => rows.length === 1)
    .map(([row]) => row);

  const targetGroups = groupByKey(targets, (row) =>
    pointKey(row.materialId, row.deviceSeq as string)
  );

  const updates: SyncUpdate[] = [];
  const creates: SyncCreate[] = [];
  const missingMaterials: ReplacementWithMaterial[] = [];
  const duplicateTargets: Array<{
    source: ReplacementWithMaterial;
    count: number;
  }> = [];

  for (const source of uniqueSources) {
    const code = normalizedCode(source.material.code);
    const targetMaterial =
      source.material.machine === "COMMON"
        ? commonMaterialByCode.get(code)
        : s2MaterialByCode.get(code);

    if (!targetMaterial) {
      missingMaterials.push(source);
      continue;
    }

    const key = pointKey(targetMaterial.id, source.deviceSeq as string);
    const matchingTargets = targetGroups.get(key) ?? [];
    if (matchingTargets.length > 1) {
      duplicateTargets.push({ source, count: matchingTargets.length });
      continue;
    }
    if (matchingTargets.length === 0) {
      creates.push({ source, targetMaterialId: targetMaterial.id });
      continue;
    }

    const target = matchingTargets[0];
    const changedFields = CONFIG_FIELDS.filter(
      (field) => !sameValue(source[field], target[field])
    );
    if (changedFields.length) updates.push({ source, target, changedFields });
  }

  const matchedCount =
    uniqueSources.length -
    creates.length -
    missingMaterials.length -
    duplicateTargets.length;
  const unchangedCount = matchedCount - updates.length;
  const sourceKeys = new Set(uniqueSources.map(sourceKey));
  const extraTargets = targets.filter(
    (target) => !sourceKeys.has(sourceKey(target))
  );

  console.log(`Nguồn S1 gắn thiết bị: ${sources.length}`);
  console.log(`Điểm S2 gắn thiết bị: ${targets.length}`);
  console.log(`Khớp S1–S2: ${matchedCount}`);
  console.log(`  Không thay đổi: ${unchangedCount}`);
  console.log(`  Cần cập nhật cấu hình: ${updates.length}`);
  console.log(`Cần tạo mới ở S2: ${creates.length}`);
  console.log(`Thiếu vật tư tương ứng trong danh mục S2: ${missingMaterials.length}`);
  console.log(`Trùng điểm nguồn S1 (bỏ qua an toàn): ${duplicateSources.length}`);
  console.log(`Trùng điểm đích S2 (bỏ qua an toàn): ${duplicateTargets.length}`);
  console.log(`Điểm riêng của S2, không có nguồn S1 (giữ nguyên): ${extraTargets.length}`);

  if (updates.length) {
    console.log("\nCác điểm cần cập nhật:");
    for (const item of updates.slice(0, REPORT_LIMIT)) {
      console.log(
        `- ${item.source.material.code} · ${item.source.deviceSeq} · ${item.source.material.name}: ${item.changedFields.join(", ")}`
      );
    }
    if (updates.length > REPORT_LIMIT) {
      console.log(`  ... và ${updates.length - REPORT_LIMIT} điểm khác`);
    }
  }

  if (creates.length) {
    console.log("\nCác điểm cần tạo ở S2:");
    for (const item of creates.slice(0, REPORT_LIMIT)) {
      console.log(
        `- ${item.source.material.code} · ${item.source.deviceSeq} · ${item.source.material.name}`
      );
    }
    if (creates.length > REPORT_LIMIT) {
      console.log(`  ... và ${creates.length - REPORT_LIMIT} điểm khác`);
    }
  }

  if (missingMaterials.length) {
    console.log("\nCác mã chưa có vật tư tương ứng trong danh mục S2:");
    for (const source of missingMaterials.slice(0, REPORT_LIMIT)) {
      console.log(`- ${source.material.code} · ${source.material.name}`);
    }
  }

  if (duplicateSources.length || duplicateTargets.length) {
    console.log(
      "\nCó dữ liệu trùng nên tác vụ đã bỏ qua các điểm đó. Hãy xử lý trùng trước khi chạy lại."
    );
  }

  if (!APPLY) return;
  if (!updates.length && !creates.length) {
    console.log("\nKhông có dữ liệu hợp lệ cần ghi.");
    return;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const item of updates) {
      await tx.materialReplacement.update({
        where: { id: item.target.id },
        data: configData(item.source),
      });
    }

    for (const item of creates) {
      await tx.materialReplacement.create({
        data: {
          materialId: item.targetMaterialId,
          deviceSeq: item.source.deviceSeq,
          machine: "S2",
          ...configData(item.source),
          lastReplacedAt: null,
          nextDueAt: addMonths(now, item.source.intervalMonths),
          isActive: true,
          createdById: item.source.createdById,
        },
      });
    }
  });

  console.log(
    `\nĐã đồng bộ S2: cập nhật ${updates.length} điểm, tạo mới ${creates.length} điểm.`
  );
  console.log(
    "Lịch sử thay thế, lần thay gần nhất và ngày đến hạn hiện có của S2 được giữ nguyên."
  );
}

main()
  .catch((error) => {
    console.error("Đồng bộ thất bại:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
