/**
 * Dời bộ mốc SCL S2 (PL2) ĐÃ NẠP trong DB theo ngày đại tu 1 mới trong `lib/overhaul-milestones-source.ts`
 * (05/10/2026: 07/10 → 06/10, tức mọi mốc sớm 1 ngày).
 *
 * Chỉ dời mốc còn ĐÚNG ngày cũ của file (chưa ai sửa tay trên web); mốc đã sửa tay / đã xoá mềm / đã đúng ngày mới
 * để nguyên và liệt kê ra. Mốc thêm tay (`manual:`) không đụng. Chạy lại vô hại.
 *
 *   npx tsx scripts/data-ops/shift-overhaul-milestones.ts            # xem trước, không ghi
 *   npx tsx scripts/data-ops/shift-overhaul-milestones.ts --commit   # ghi
 *
 * Production: `cd /var/www/dh1-app && set -a && . ./.env && set +a && npx tsx scripts/data-ops/shift-overhaul-milestones.ts`
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { S2_MILESTONES_SOURCE } from "../../lib/overhaul-milestones-source";
import { OVERHAUL_CAMPAIGN } from "../../lib/overhaul-milestones";

loadEnvConfig(process.cwd());
const commit = process.argv.includes("--commit");
/** Ngày đại tu 1 cũ (07/10) − mới (06/10): mốc cũ = mốc mới + 1 ngày. */
const SHIFT_DAYS = 1;
const prisma = new PrismaClient();
const iso = (date: Date | null) => date ? date.toISOString().slice(0, 10) : null;
const plus = (date: string | null, days: number) => date ? new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10) : null;
const asDate = (date: string | null) => date ? new Date(`${date}T00:00:00Z`) : null;

async function main() {
  const rows = await prisma.overhaulMilestone.findMany({ where: { campaign: OVERHAUL_CAMPAIGN, sourceKey: { in: S2_MILESTONES_SOURCE.map((row) => row.sourceKey) } } });
  const byKey = new Map(rows.map((row) => [row.sourceKey, row]));
  const shift: Array<{ id: string; title: string; from: string; to: string; startDate: string; endDate: string | null }> = [];
  const report = { done: 0, missing: [] as string[], deleted: [] as string[], edited: [] as string[] };
  for (const source of S2_MILESTONES_SOURCE) {
    const row = byKey.get(source.sourceKey);
    if (!row) { report.missing.push(source.title); continue; }
    const now = { start: iso(row.startDate)!, end: iso(row.endDate) };
    const label = `${source.title} (${now.start}${now.end ? ` → ${now.end}` : ""})`;
    if (row.deletedAt) { report.deleted.push(label); continue; }
    if (now.start === source.startDate && now.end === source.endDate) { report.done++; continue; }
    if (now.start === plus(source.startDate, SHIFT_DAYS) && now.end === plus(source.endDate, SHIFT_DAYS)) {
      shift.push({ id: row.id, title: source.title, from: `${now.start}${now.end ? ` → ${now.end}` : ""}`, to: `${source.startDate}${source.endDate ? ` → ${source.endDate}` : ""}`, startDate: source.startDate, endDate: source.endDate });
      continue;
    }
    report.edited.push(label);
  }

  console.log(`DB: ${new URL(process.env.DATABASE_URL ?? "http://invalid").hostname} · ${commit ? "GHI" : "XEM TRƯỚC (thêm --commit để ghi)"}`);
  console.log(`Dời ${shift.length} mốc sớm ${SHIFT_DAYS} ngày:`);
  for (const item of shift) console.log(`  ${item.from}  ⇒  ${item.to}   ${item.title}`);
  console.log(`Đã đúng ngày mới: ${report.done}`);
  if (report.edited.length) console.log(`Đã sửa tay trên web — để nguyên (${report.edited.length}):\n  ${report.edited.join("\n  ")}`);
  if (report.deleted.length) console.log(`Đã xoá trên web — để nguyên (${report.deleted.length}):\n  ${report.deleted.join("\n  ")}`);
  if (report.missing.length) console.log(`Chưa nạp vào DB (${report.missing.length}): ${report.missing.join("; ")}`);
  if (!commit || !shift.length) return;
  await prisma.$transaction(shift.map((item) => prisma.overhaulMilestone.update({
    where: { id: item.id }, data: { startDate: asDate(item.startDate)!, endDate: asDate(item.endDate) },
  })));
  console.log(`✓ Đã dời ${shift.length} mốc.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
