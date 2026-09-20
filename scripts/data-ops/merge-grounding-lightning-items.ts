/** Gộp các dòng trùng Cương vị + Tổ máy + Khu vực/thiết bị, giữ toàn bộ ảnh và lịch sử. */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueLines(values: Array<string | null>) {
  const seen = new Set<string>();
  return values.flatMap((value) => (value ?? "").split(/\r?\n/)).map((value) => value.replace(/\s+/g, " ").trim()).filter((value) => {
    const key = normalized(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const items = await prisma.groundingLightningItem.findMany({
    include: { points: { include: { attachments: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = `${item.positionCode ?? ""}|${item.machine}|${normalized(item.areaEquipment)}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  let mergedGroups = 0;
  let removedItems = 0;
  for (const group of groups.values()) {
    if (group.length < 2) {
      await prisma.groundingLightningItem.update({ where: { id: group[0].id }, data: { stt: null } });
      continue;
    }
    const survivor = group[0];
    const duplicateIds = group.slice(1).map((item) => item.id);
    await prisma.$transaction(async (tx) => {
      for (const type of ["LIGHTNING", "GROUNDING"]) {
        const candidates = group.flatMap((item) => item.points.filter((point) => point.type === type));
        if (!candidates.length) continue;
        const target = candidates.find((point) => point.itemId === survivor.id) ?? candidates[0];
        if (target.itemId !== survivor.id) {
          await tx.groundingLightningPoint.update({ where: { id: target.id }, data: { itemId: survivor.id } });
        }
        const redundant = candidates.filter((point) => point.id !== target.id);
        for (const point of redundant) {
          await tx.groundingLightningAttachment.updateMany({ where: { pointId: point.id }, data: { pointId: target.id } });
          await tx.groundingLightningPoint.delete({ where: { id: point.id } });
        }
        const status = candidates.some((point) => point.status === "DEFECT")
          ? "DEFECT"
          : candidates.some((point) => point.status === "NORMAL") ? "NORMAL" : "UNCHECKED";
        const descriptions = uniqueLines(candidates.map((point) => point.defectDescription));
        await tx.groundingLightningPoint.update({
          where: { id: target.id },
          data: { status, defectDescription: status === "DEFECT" ? descriptions.join("\n") || null : null },
        });
      }
      await tx.groundingLightningInspection.updateMany({ where: { itemId: { in: duplicateIds } }, data: { itemId: survivor.id } });
      await tx.groundingLightningItem.deleteMany({ where: { id: { in: duplicateIds } } });
      await tx.groundingLightningItem.update({
        where: { id: survivor.id },
        data: { stt: null, note: uniqueLines(group.map((item) => item.note)).join("\n") || null },
      });
    });
    mergedGroups += 1;
    removedItems += duplicateIds.length;
  }
  const remaining = await prisma.groundingLightningItem.count();
  console.log(`Đã gộp ${mergedGroups} nhóm, loại ${removedItems} dòng trùng; còn ${remaining} thiết bị.`);
}

main().finally(() => prisma.$disconnect());
