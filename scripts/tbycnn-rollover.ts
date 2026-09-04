/**
 * Chuyển kỳ sổ TBYCNN cho BỘ HẸN GIỜ (cron / Task Scheduler / n8n).
 *
 *   npm run tbycnn:rollover -- --close-now   # 23:4x ngày CUỐI tháng: chốt kỳ tháng này
 *   npm run tbycnn:rollover                  # 00:0x ngày 01: sinh kỳ tháng mới
 *   npm run tbycnn:rollover -- --dry-run     # chỉ in ra sẽ làm gì
 *
 * Không bắt buộc phải cài: trang TBYCNN tự gọi cùng một job khi có người vào (xem
 * `ensureTbycnnRollover`). Cài bộ hẹn giờ chỉ để việc chốt rơi ĐÚNG đêm cuối tháng thay
 * vì lần đầu có người mở trang của tháng mới.
 *
 * `--close-now` cố tình CHỈ chạy được vào ngày cuối tháng: gõ nhầm giữa tháng là khoá
 * mất sổ đang dùng của cả phân xưởng.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { describeTbycnnRollover, isLastDayOfMonth, runTbycnnRollover, vietnamClock } = await import(
    "../lib/tbycnn-rollover"
  );
  const { prisma } = await import("../lib/prisma");

  const closeNow = process.argv.includes("--close-now");
  const dryRun = process.argv.includes("--dry-run");
  const clock = vietnamClock();
  const today = `${String(clock.day).padStart(2, "0")}/${String(clock.month).padStart(2, "0")}/${clock.year}`;

  if (closeNow && !isLastDayOfMonth(clock)) {
    console.error(
      `Hôm nay ${today} chưa phải ngày cuối tháng (${clock.lastDayOfMonth}) — bỏ qua --close-now.`
    );
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    const periods = await prisma.tbycnnPeriod.findMany({
      orderBy: [{ year: "desc" }, { monthNo: "desc" }],
      select: { label: true, isClosed: true, _count: { select: { equipments: true } } },
    });
    console.log(`Hôm nay ${today} (giờ VN) · chế độ: ${closeNow ? "--close-now" : "sinh kỳ"}`);
    console.log("Các kỳ hiện có:");
    for (const p of periods) {
      console.log(`  ${p.label}  ${p.isClosed ? "đã chốt" : "đang mở "}  ${p._count.equipments} thiết bị`);
    }
    console.log("\n(chạy khô — chưa ghi gì)");
    await prisma.$disconnect();
    return;
  }

  const result = await runTbycnnRollover({
    closeCurrentPeriod: closeNow,
    actor: "Bộ hẹn giờ",
  });
  console.log(`[tbycnn-rollover] ${today} · ${describeTbycnnRollover(result)}`);
  if (result.errors.length > 0) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
