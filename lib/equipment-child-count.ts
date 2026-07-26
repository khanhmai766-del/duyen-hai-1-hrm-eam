import type { Prisma, PrismaClient } from "@prisma/client";

type EquipmentDb = PrismaClient | Prisma.TransactionClient;

/**
 * Tính lại childCount (denormalize) cho các thư mục cha sau khi thêm / xóa / di chuyển node con.
 * Cây thiết bị LAZY dựa vào childCount để biết một nút là THƯ MỤC (có mũi tên bung, badge số con)
 * hay LÁ (thiết bị). Không cập nhật giá trị này sau khi thêm/xóa sẽ khiến thư mục cha bị vẽ sai
 * (vd. thêm thiết bị con nhưng cha vẫn hiện là thiết bị lá, không bung được).
 */
export async function recomputeChildCount(
  db: EquipmentDb,
  parentSeqs: Array<string | null | undefined>
) {
  const seqs = [...new Set(parentSeqs.filter((seq): seq is string => !!seq))];
  for (const parentSeq of seqs) {
    const childCount = await db.equipmentNode.count({ where: { parentSeq } });
    await db.equipmentNode.updateMany({ where: { seq: parentSeq }, data: { childCount } });
  }
}
