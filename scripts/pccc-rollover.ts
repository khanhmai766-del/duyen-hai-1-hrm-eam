/**
 * Chuyển kỳ PCCC cho BỘ HẸN GIỜ (Task Scheduler / cron / n8n).
 *
 *   npm run pccc:rollover -- --close-now   # chạy 23:xx ngày CUỐI tháng: xuất S3 + chốt kỳ
 *   npm run pccc:rollover                  # chạy 00:xx ngày 01: sinh kỳ mới + dọn DB
 *   npm run pccc:rollover -- --dry-run     # chỉ in ra sẽ làm gì
 *
 * Không bắt buộc phải cài: trang PCCC tự gọi cùng một job khi có người vào (xem
 * `ensurePcccRollover`). Cài bộ hẹn giờ chỉ để việc chốt rơi ĐÚNG đêm cuối tháng thay vì
 * lần đầu có người mở trang của tháng mới.
 *
 * `--close-now` cố tình chỉ chạy được vào ngày cuối tháng: gõ nhầm giữa tháng là khoá
 * mất bảng đang dùng của cả phân xưởng.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { describeRollover, isLastDayOfMonth, runPcccRollover, vietnamClock, PCCC_DB_KEEP_PERIODS } = await import(
    "../lib/pccc-rollover"
  );
  const { prisma } = await import("../lib/prisma");

  const closeNow = process.argv.includes("--close-now");
  const dryRun = process.argv.includes("--dry-run");
  const clock = vietnamClock();
  const today = `${String(clock.day).padStart(2, "0")}/${String(clock.month).padStart(2, "0")}/${clock.year}`;

  if (closeNow && !isLastDayOfMonth(clock)) {
    console.error(`Hôm nay ${today} chưa phải ngày cuối tháng (${clock.lastDayOfMonth}) — bỏ qua --close-now.`);
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    const periods = await prisma.pcccPeriod.findMany({
      orderBy: [{ year: "desc" }, { monthNo: "desc" }],
      select: { label: true, isClosed: true, archiveKey: true },
    });
    console.log(`Hôm nay ${today} (giờ VN) · giữ ${PCCC_DB_KEEP_PERIODS} kỳ gần nhất trong DB`);
    periods.forEach((p, i) => {
      const state = p.isClosed ? "đã chốt" : "đang mở";
      const archive = p.archiveKey ? "có bản lưu trữ" : "CHƯA có bản lưu trữ";
      const fate = i < PCCC_DB_KEEP_PERIODS ? "giữ" : p.isClosed && p.archiveKey ? "SẼ XOÁ khỏi DB" : "giữ (thiếu bản lưu trữ)";
      console.log(`  ${p.label}  ${state} · ${archive} → ${fate}`);
    });
    await prisma.$disconnect();
    return;
  }

  const result = await runPcccRollover({ closeCurrentPeriod: closeNow, actor: "Bộ hẹn giờ" });
  console.log(`[${today}] ${describeRollover(result)}`);
  for (const closed of result.closed) {
    console.log(`  ↳ ${closed.label}: ${closed.archiveKey} (${(closed.bytes / 1024).toFixed(0)} KB)`);
  }
  if (result.keptWithoutArchive.length > 0) {
    console.warn(`  ⚠ Quá hạn giữ nhưng chưa có bản lưu trữ, KHÔNG xoá: ${result.keptWithoutArchive.join(", ")}`);
  }
  // Thoát khác 0 để bộ hẹn giờ báo động thay vì âm thầm nuốt lỗi.
  if (result.errors.length > 0) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
