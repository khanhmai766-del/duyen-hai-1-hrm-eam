/**
 * TẠO LÔ "TỒN ĐẦU KỲ" CHO TỒN CŨ CHƯA CÓ LÔ.
 *
 * Từ khi tồn kho được theo dõi theo số phiếu giao hàng (lib/material-stock-lot.ts), mọi lần
 * sử dụng đều trừ qua bảng MaterialStockLot. Nhưng số tồn có TRƯỚC ngày bật tính năng chỉ
 * nằm ở cột `Material.quantity`, không có lô nào tương ứng — nên bước "Sử dụng vật tư" của
 * các vật tư đó luôn chết với "Số lượng hiện có không đủ, còn thiếu N" dù màn hình vẫn báo
 * còn hàng. Script này dựng một lô mở đầu (deliveryNote = null, receivedAt = null → xếp đầu
 * hàng đợi FIFO) cho phần tồn đó.
 *
 * CHẠY LẠI AN TOÀN: chỉ đụng tới mã vật tư CHƯA có lô nào. Mã đã có lô được bỏ qua nguyên
 * vẹn — không cộng bù, không san lại, vì lúc đó `Material.quantity` đã do các lô làm chủ.
 *
 * Kho dùng chung theo `Material.code` (một mã có thể có 3 dòng S1/S2/COMMON) nên gom theo mã
 * và lấy tồn LỚN NHẤT trong nhóm: các câu lệnh cộng/trừ tồn cũ ghi đồng loạt cùng một con số
 * cho cả nhóm, nên cộng dồn lại sẽ thổi tồn lên gấp ba.
 *
 *   node scripts/backfill-opening-stock-lots.mjs           # xem trước, không ghi
 *   node scripts/backfill-opening-stock-lots.mjs --apply   # ghi thật
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

/** @param {PrismaClient} prisma */
export async function planOpeningLots(prisma) {
  const materials = await prisma.material.findMany({
    where: { quantity: { gt: 0 } },
    select: { code: true, name: true, unit: true, quantity: true },
  });
  const withLots = new Set(
    (await prisma.materialStockLot.findMany({ select: { materialCode: true } })).map((lot) => lot.materialCode)
  );

  /** @type {Map<string, { code: string; name: string; unit: string; quantity: number }>} */
  const byCode = new Map();
  for (const material of materials) {
    if (withLots.has(material.code)) continue;
    const current = byCode.get(material.code);
    if (!current || material.quantity > current.quantity) byCode.set(material.code, material);
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** @param {PrismaClient} prisma */
export async function backfillOpeningLots(prisma) {
  const plan = await planOpeningLots(prisma);
  for (const material of plan) {
    await prisma.materialStockLot.create({
      data: {
        materialCode: material.code,
        deliveryNote: null,
        erpCode: null,
        receivedAt: null,
        quantityIn: material.quantity,
        quantityLeft: material.quantity,
        note: "Tồn đầu kỳ dựng lại khi bật theo dõi tồn theo phiếu giao hàng",
      },
    });
  }
  return plan;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const prisma = new PrismaClient();
  try {
    const plan = apply ? await backfillOpeningLots(prisma) : await planOpeningLots(prisma);
    if (!plan.length) {
      console.log("Không có mã vật tư nào cần dựng lô tồn đầu kỳ.");
      return;
    }
    console.log(`${apply ? "Đã tạo" : "Sẽ tạo"} ${plan.length} lô tồn đầu kỳ:`);
    for (const material of plan) console.log(`  ${material.code.padEnd(24)} ${material.quantity} ${material.unit}  ${material.name}`);
    if (!apply) console.log("\nChạy lại với --apply để ghi vào cơ sở dữ liệu.");
  } finally {
    await prisma.$disconnect();
  }
}

// So khớp qua pathToFileURL, đừng nối chuỗi "file://" + đường dẫn: trên Windows đường dẫn
// có ổ đĩa nên chuỗi nối ra `file://C:/…` còn import.meta.url là `file:///C:/…` — không bao
// giờ bằng nhau, và script chạy trực tiếp sẽ im lặng không làm gì.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
