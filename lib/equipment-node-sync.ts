import type { PrismaClient } from "@prisma/client";

function parentOf(seq: string) {
  const parts = seq.split(".");
  parts.pop();
  return parts.length ? parts.join(".") : null;
}

export async function syncDeviceEquipmentNode(
  prisma: PrismaClient,
  input: {
    seq: string;
    previousSeq?: string | null;
    parentSeq?: string | null;
    name: string;
  }
) {
  const seq = input.seq.trim();
  if (!seq || !input.name.trim()) return;

  const parentSeq = input.parentSeq?.trim() || parentOf(seq);
  const data = {
    seq,
    parentSeq,
    code: seq,
    name: input.name.trim(),
    depth: seq.split(".").length,
  };

  if (input.previousSeq && input.previousSeq !== seq) {
    const previous = await prisma.equipmentNode.findUnique({ where: { seq: input.previousSeq } });
    const target = await prisma.equipmentNode.findUnique({ where: { seq } });
    if (previous && !target) {
      await prisma.equipmentNode.update({
        where: { seq: input.previousSeq },
        data,
      });
      return;
    }
  }

  // update KHÔNG đụng deviceSynced: node danh mục gốc (đã có sẵn) vẫn giữ deviceSynced=false,
  // chỉ node được sinh ra lần đầu mới được đánh dấu là do đồng bộ thiết bị tạo.
  await prisma.equipmentNode.upsert({
    where: { seq },
    update: data,
    create: {
      ...data,
      drawing: null,
      kks: null,
      sort: 999999,
      deviceSynced: true,
    },
  });
}
