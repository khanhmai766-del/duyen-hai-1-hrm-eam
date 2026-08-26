/**
 * Chạy thử quy tắc lưu trữ vật tư — CHỈ ĐẾM, KHÔNG XOÁ.
 *
 *   npx tsx scripts/check-material-retention.ts [YYYY-MM-DD]
 *
 * Truyền ngày để xem trước một mốc tương lai, ví dụ `2027-02-01` để biết đợt xoá quý 4 sẽ
 * đụng vào những gì. Không truyền thì lấy hôm nay.
 */
import { PrismaClient } from "@prisma/client";
import {
  expiredKeysOf,
  expiredPeriodKeyWhere,
  isTicketMonthExpired,
  MATERIAL_RETENTION_RULES,
} from "../lib/material-retention";

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2];
  const now = arg ? new Date(`${arg}T05:00:00.000Z`) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Ngày không hợp lệ: ${arg}`);
  console.log(`Mốc tính: ${now.toISOString().slice(0, 10)} (giờ VN)\n`);

  console.log("--- Quy tắc đang áp ---");
  for (const row of MATERIAL_RETENTION_RULES) console.log(`  ${row.tab.padEnd(24)} ${row.rule}`);

  console.log("\n--- Sẽ xoá nếu chạy ngay bây giờ ---");

  const periodRows = await prisma.chemicalInventoryPeriod.findMany({
    where: { periodKey: expiredPeriodKeyWhere(now) },
    select: { periodKey: true },
  });
  const periodKeys = expiredKeysOf(periodRows.map((r) => r.periodKey), now);
  const readings = periodKeys.length
    ? await prisma.chemicalStockReading.count({ where: { periodKey: { in: periodKeys } } })
    : 0;
  const receiptRows = await prisma.chemicalReceipt.findMany({
    where: { periodKey: expiredPeriodKeyWhere(now) },
    select: { periodKey: true },
    distinct: ["periodKey"],
  });
  const receiptKeys = expiredKeysOf(receiptRows.map((r) => r.periodKey), now);
  const receipts = receiptKeys.length
    ? await prisma.chemicalReceipt.count({ where: { periodKey: { in: receiptKeys } } })
    : 0;
  console.log(`  Tịnh kho hóa chất : ${periodKeys.length} kỳ, ${readings} dòng tồn, ${receipts} phiếu nhập`);
  if (periodKeys.length) console.log(`      kỳ: ${periodKeys.join(", ")}`);

  const keepFrom = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric" }).format(now)) - 1;
  const plans = await prisma.materialAnnualPlan.count({ where: { year: { lt: keepFrom } } });
  console.log(`  Kế hoạch vật tư năm: ${plans} dòng (giữ từ năm ${keepFrom})`);

  const monthlyRows = await prisma.materialMonthlyRequest.findMany({
    where: { periodKey: expiredPeriodKeyWhere(now) },
    select: { periodKey: true },
    distinct: ["periodKey"],
  });
  const monthlyKeys = expiredKeysOf(monthlyRows.map((r) => r.periodKey), now);
  const monthly = monthlyKeys.length
    ? await prisma.materialMonthlyRequest.count({ where: { periodKey: { in: monthlyKeys } } })
    : 0;
  console.log(`  Nhu cầu vật tư tháng: ${monthly} dòng${monthlyKeys.length ? ` (kỳ: ${monthlyKeys.join(", ")})` : ""}`);

  const months = await prisma.materialTicket.findMany({ select: { sequenceMonth: true }, distinct: ["sequenceMonth"] });
  const expired = months.map((r) => r.sequenceMonth).filter((m) => isTicketMonthExpired(m, now)).sort();
  const settled = expired.length
    ? await prisma.materialTicket.count({ where: { sequenceMonth: { in: expired }, settledAt: { not: null } } })
    : 0;
  const pending = expired.length
    ? await prisma.materialTicket.count({ where: { sequenceMonth: { in: expired }, settledAt: null } })
    : 0;
  console.log(`  Theo dõi vật tư    : ${settled} phiếu đã quyết toán sẽ xoá, ${pending} phiếu dở dang GIỮ LẠI`);
  if (expired.length) console.log(`      kỳ hết hạn: ${expired.join(", ")}`);

  const kept = await prisma.materialReplacementLog.count();
  console.log(`\n  (Lịch sử thay thế giữ nguyên: ${kept} dòng — không đợt nào đụng tới)`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
