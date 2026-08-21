import { PrismaClient } from "@prisma/client";
import { SEED_ITEMS } from "../lib/chemical-inventory/constants";

/**
 * Seed danh mục 16 mặt hàng của sổ tồn kho hóa chất.
 *
 * Chạy:  npx tsx scripts/seed-chemical-inventory.ts
 *
 * CỐ Ý tách khỏi `prisma/seed.ts`: file đó là seed demo và mở đầu bằng một loạt
 * `deleteMany()` xoá sạch User/Material/Shift. Gắn danh mục hóa chất vào đó thì
 * mỗi lần ai chạy `npm run db:seed` là mất dữ liệu thật.
 *
 * Idempotent: upsert theo `code`, chạy lại bao nhiêu lần cũng ra cùng kết quả và
 * không đụng tới bản đọc tồn / phiếu nhập đã có.
 */

const prisma = new PrismaClient();

async function main() {
  console.log("🧪 Seed danh mục tồn kho hóa chất…\n");

  let created = 0;
  let updated = 0;

  for (const item of SEED_ITEMS) {
    const data = {
      name: item.name,
      concentration: item.concentration ?? null,
      itemType: item.itemType,
      baseUnit: item.baseUnit,
      displayUnit: item.displayUnit ?? null,
      trackingMode: item.trackingMode,
      sheetRow: item.sheetRow,
      receiptSheet: item.receiptSheet,
      defaultPosition: item.defaultPosition ?? null,
      tankCapacity: item.tankCapacity ?? null,
      lowStockThreshold: item.lowStockThreshold ?? null,
      // Giữ đúng thứ tự dòng 6..21 của sheet để lưới tháng hiện giống sổ giấy.
      sortOrder: item.sheetRow,
      isActive: true,
    };

    const existing = await prisma.chemicalInventoryItem.findUnique({
      where: { code: item.code },
      select: { id: true },
    });

    await prisma.chemicalInventoryItem.upsert({
      where: { code: item.code },
      // KHÔNG đụng materialCode khi cập nhật: giá trị đó đến từ tab Hợp đồng lúc
      // import, ghi đè bằng null ở đây là xoá mất liên kết sang danh mục ERP.
      update: data,
      create: { code: item.code, ...data },
    });

    if (existing) updated += 1;
    else created += 1;
  }

  const total = await prisma.chemicalInventoryItem.count();
  console.log(`   Thêm mới : ${created}`);
  console.log(`   Cập nhật : ${updated}`);
  console.log(`   Tổng danh mục trong DB: ${total} mặt hàng\n`);
}

main()
  .catch((e) => {
    console.error("❌ Seed thất bại:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
