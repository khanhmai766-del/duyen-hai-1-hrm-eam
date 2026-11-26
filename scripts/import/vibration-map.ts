/**
 * Ánh xạ tự động thiết bị đo độ rung → cây thiết bị (không bao giờ ghi đè mục "confirmed").
 *
 *   npx tsx scripts/import/vibration-map.ts [--dry-run] [--samples 15] [--only auto|none]
 *
 * --dry-run: chỉ tính, không ghi DB. --samples N: in N ví dụ (rải đều theo điểm) để người xem đánh giá chất lượng.
 */
import { PrismaClient } from "@prisma/client";
import { runAutoMapping } from "../../lib/vibration/mapping";

const prisma = new PrismaClient();
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const n = Number(arg("--samples") ?? 15);
  const only = arg("--only");
  const stats = await runAutoMapping(prisma, { dryRun });
  console.log(`${dryRun ? "[DRY-RUN] " : ""}Xét: ${stats.considered} | auto: ${stats.auto} | none: ${stats.none} | bỏ qua (đã xác nhận): ${stats.skippedConfirmed}`);
  const pool = stats.samples
    .filter((s) => (only ? s.status === only : s.node))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const step = Math.max(1, Math.floor(pool.length / Math.max(n, 1)));
  for (let i = 0, shown = 0; i < pool.length && shown < n; i += step, shown++) {
    const s = pool[i];
    console.log(`[${s.status}] ${s.score?.toFixed(2)} | ${s.area} / ${s.device}  →  ${s.node} (${s.seq})`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
