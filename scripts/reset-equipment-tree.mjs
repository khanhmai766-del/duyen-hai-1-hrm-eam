// Xóa toàn bộ cây thiết bị (và dữ liệu phụ thuộc theo mã cây) — DÙNG MỘT LẦN trước khi nạp mới.
//
//   node scripts/reset-equipment-tree.mjs            # chỉ XEM TRƯỚC (không xóa)
//   node scripts/reset-equipment-tree.mjs --confirm  # thực sự xóa (transaction)
//
// KHÔNG tác động nhân sự, tài khoản, ca trực. Chạy trong 1 transaction; kiểm tra bảng rỗng sau xóa.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

async function counts() {
  const [nodes, repair, mat, qr, defects, repl, hist] = await Promise.all([
    prisma.equipmentNode.count(),
    prisma.repairLog.count().catch(() => 0),
    prisma.equipmentMaterial.count().catch(() => 0),
    prisma.deviceQrCard.count().catch(() => 0),
    prisma.defect.count().catch(() => 0),
    prisma.materialReplacement.count().catch(() => 0),
    prisma.defectHistory.count().catch(() => 0),
  ]);
  return { nodes, repair, mat, qr, defects, repl, hist };
}

async function main() {
  const before = await counts();
  console.log("📊 Dữ liệu hiện có:");
  console.log(`   EquipmentNode: ${before.nodes}`);
  console.log(`   RepairLog: ${before.repair} | EquipmentMaterial: ${before.mat} | DeviceQrCard: ${before.qr} (cascade khi xóa node)`);
  console.log(`   Defect: ${before.defects} | MaterialReplacement: ${before.repl} | DefectHistory: ${before.hist} (deviceSeq → NULL khi xóa node)`);

  if (!CONFIRM) {
    console.log("\nℹ️  Chế độ XEM TRƯỚC. Thêm --confirm để thực sự xóa.");
    return;
  }

  console.log("\n🗑️  Đang xóa (transaction) ...");
  await prisma.$transaction(async (tx) => {
    // Xóa EquipmentNode → cascade RepairLog/EquipmentMaterial/DeviceQrCard; SetNull Defect/…
    const del = await tx.equipmentNode.deleteMany({});
    console.log(`   Đã xóa ${del.count} EquipmentNode (kèm dữ liệu cascade).`);
    // Xóa phạm vi quản lý gắn mã cây cũ (không FK) — nếu bảng tồn tại.
    try {
      const scope = await tx.$executeRawUnsafe(`DELETE FROM "PositionSystemScope"`);
      console.log(`   Đã xóa ${scope} PositionSystemScope (phạm vi theo mã cây cũ).`);
    } catch {
      console.log("   (Bỏ qua PositionSystemScope — không có bảng)");
    }
  });

  const after = await counts();
  if (after.nodes !== 0) throw new Error(`EquipmentNode vẫn còn ${after.nodes} — xóa chưa sạch`);
  console.log("✅ Đã xóa sạch cây thiết bị. Nhân sự/tài khoản/ca trực KHÔNG bị ảnh hưởng.");
}

main()
  .catch((e) => {
    console.error("❌ Lỗi:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
