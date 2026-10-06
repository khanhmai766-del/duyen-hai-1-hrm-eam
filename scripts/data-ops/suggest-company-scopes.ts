/**
 * Gợi ý phân loại SCTX / Đại tu cho đơn vị nhà thầu CHƯA phân loại (nghiệp vụ 06/10/2026). Chỉ dựa trên dữ liệu có sẵn:
 *  - Đại tu: mã đơn vị có trong cột "Nhà thầu" của 4 file tiến độ đại tu (hạng mục đã đồng bộ), hoặc đã có PCT Đại tu;
 *  - SCTX:   đã có PCT nhà thầu nhóm SCTX (kể cả phiếu cũ chưa ghi nhóm).
 * Đơn vị đã tick tay giữ nguyên. Đơn vị không có dấu hiệu nào giữ "Chưa phân loại" (vẫn chọn được ở cả hai nhóm).
 *
 *   npx tsx scripts/data-ops/suggest-company-scopes.ts            # xem trước, không ghi
 *   npx tsx scripts/data-ops/suggest-company-scopes.ts --commit   # ghi
 *
 * Production: `cd /var/www/dh1-app && set -a && . ./.env && set +a && npx tsx scripts/data-ops/suggest-company-scopes.ts`
 * (cần đã áp prisma/manual/work-permit-company-scopes.sql).
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { normalizeText } from "../../lib/nav";

loadEnvConfig(process.cwd());
const commit = process.argv.includes("--commit");
const prisma = new PrismaClient();

async function main() {
  const [table, people, items, permits] = await Promise.all([
    prisma.workPermitCompany.findMany({ select: { name: true, code: true, sctx: true, overhaul: true } }),
    prisma.workPermitPerson.findMany({ where: { company: { not: "" } }, distinct: ["company"], select: { company: true } }),
    prisma.workPermitOverhaulItem.findMany({ where: { isActive: true }, distinct: ["contractorCode"], select: { contractorCode: true } }),
    prisma.workPermit.findMany({ where: { teamType: "CONTRACTOR", teamName: { not: "" } }, distinct: ["teamName", "contractorScope"], select: { teamName: true, contractorScope: true } }),
  ]);
  const overhaulCodes = new Set(items.map(item => item.contractorCode).filter(Boolean));
  const sctxNames = new Set(permits.filter(p => p.contractorScope !== "OVERHAUL").map(p => p.teamName.trim()));
  const overhaulNames = new Set(permits.filter(p => p.contractorScope === "OVERHAUL").map(p => p.teamName.trim()));
  const byName = new Map(table.map(row => [row.name, row]));
  const names = [...new Set([...table.map(row => row.name), ...people.map(row => row.company.trim())])].filter(Boolean).sort((a, b) => a.localeCompare(b, "vi"));

  const plan: Array<{ name: string; sctx: boolean; overhaul: boolean; why: string[] }> = [];
  let kept = 0, none = 0;
  for (const name of names) {
    const row = byName.get(name);
    if (row && (row.sctx || row.overhaul)) { kept++; continue; }
    const why: string[] = [];
    const byCode = Boolean(row?.code && overhaulCodes.has(normalizeText(row.code)));
    if (byCode) why.push(`mã ${row!.code} có trong file tiến độ đại tu`);
    if (overhaulNames.has(name)) why.push("đã có PCT Đại tu");
    if (sctxNames.has(name)) why.push("đã có PCT SCTX");
    const overhaul = byCode || overhaulNames.has(name), sctx = sctxNames.has(name);
    if (!overhaul && !sctx) { none++; continue; }
    plan.push({ name, sctx, overhaul, why });
  }

  console.log(`DB: ${new URL(process.env.DATABASE_URL ?? "http://invalid").hostname} · ${commit ? "GHI" : "XEM TRƯỚC (thêm --commit để ghi)"}`);
  console.log(`Tổng ${names.length} đơn vị · đã phân loại tay (giữ nguyên): ${kept} · không đủ dấu hiệu (giữ Chưa phân loại): ${none}`);
  console.log(`Gợi ý phân loại ${plan.length} đơn vị:`);
  for (const item of plan) console.log(`  ${[item.sctx && "SCTX", item.overhaul && "Đại tu"].filter(Boolean).join(" + ").padEnd(14)} ${item.name}  (${item.why.join("; ")})`);
  if (!commit || !plan.length) return;
  await prisma.$transaction(plan.map(item => prisma.workPermitCompany.upsert({
    where: { name: item.name }, update: { sctx: item.sctx, overhaul: item.overhaul }, create: { name: item.name, sctx: item.sctx, overhaul: item.overhaul },
  })));
  console.log(`✓ Đã phân loại ${plan.length} đơn vị.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
