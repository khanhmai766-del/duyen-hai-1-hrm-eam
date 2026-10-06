/**
 * Thêm vào DB các mốc SCL S2 có trong `lib/overhaul-milestones-source.ts` mà DB CHƯA có (theo mã nguồn) — ví dụ 2 mốc
 * Cắt điện / Đóng điện MBA chính bổ sung 06/10/2026. Không sửa, không phục hồi mốc đã có / đã sửa / đã xoá mềm trên web.
 * Chạy lại vô hại.
 *
 *   npx tsx scripts/data-ops/add-overhaul-milestones.ts            # xem trước, không ghi
 *   npx tsx scripts/data-ops/add-overhaul-milestones.ts --commit   # ghi
 *
 * Production: `cd /var/www/dh1-app && set -a && . ./.env && set +a && npx tsx scripts/data-ops/add-overhaul-milestones.ts`
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { OVERHAUL_CAMPAIGN } from "../../lib/overhaul-milestones";
import { S2_MILESTONES_SOURCE } from "../../lib/overhaul-milestones-source";

loadEnvConfig(process.cwd());
const commit = process.argv.includes("--commit");
const prisma = new PrismaClient();
const asDate = (date: string | null) => date ? new Date(`${date}T00:00:00Z`) : null;

async function main() {
  const existing = new Set((await prisma.overhaulMilestone.findMany({
    where: { campaign: OVERHAUL_CAMPAIGN, sourceKey: { in: S2_MILESTONES_SOURCE.map(row => row.sourceKey) } }, select: { sourceKey: true },
  })).map(row => row.sourceKey));
  const missing = S2_MILESTONES_SOURCE.filter(row => !existing.has(row.sourceKey));
  console.log(`DB: ${new URL(process.env.DATABASE_URL ?? "http://invalid").hostname} · ${commit ? "GHI" : "XEM TRƯỚC (thêm --commit để ghi)"}`);
  console.log(`Bộ nguồn ${S2_MILESTONES_SOURCE.length} mốc · DB đã có ${existing.size} · sẽ thêm ${missing.length}:`);
  for (const row of missing) console.log(`  ${row.startDate}${row.endDate ? ` → ${row.endDate}` : ""}   ${row.title}`);
  if (!commit || !missing.length) return;
  const result = await prisma.overhaulMilestone.createMany({
    data: missing.map(row => ({ ...row, startDate: asDate(row.startDate)!, endDate: asDate(row.endDate) })), skipDuplicates: true,
  });
  console.log(`✓ Đã thêm ${result.count} mốc.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
