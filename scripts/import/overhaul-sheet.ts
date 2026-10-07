/**
 * Đợt 2 đại tu — ghi kết quả ngày của PCT về Google Sheets tiến độ (lib/server/overhaul-sheet-writer.ts,
 * docs/dai-tu-google-sheets.md). Ghi bằng service account (GOOGLE_SA_KEY_FILE).
 *
 *   npm run overhaul:sheet                         # đẩy hàng đợi còn tồn (timer dh1-overhaul-sheet-push, 15 phút)
 *   npm run overhaul:sheet -- --daily              # 16:00: "Không mở ngày thực hiện" cho hôm nay rồi đẩy (dh1-overhaul-daily-status)
 *   npm run overhaul:sheet -- --daily --day 2026-10-06   # chạy bù một ngày đã qua
 *   npm run overhaul:sheet -- --status             # chỉ xem hàng đợi (không ghi gì)
 *   npm run overhaul:sheet -- --dry                # đọc Sheet, in các ô SẼ ghi cho hàng đợi hiện tại (không ghi gì)
 *   npm run overhaul:sheet -- --setup              # xem trước việc đổi danh sách trạng thái ô ngày (không ghi)
 *   npm run overhaul:sheet -- --setup --apply      # GHI: đổi danh sách thả xuống ô ngày sang bộ trạng thái mới
 *   npm run overhaul:sheet -- --unprotect [--apply]                # gỡ MỌI vùng khoá do web tạo (cột %, Trạng thái, ô ngày) — 06/10/2026
 *   npm run overhaul:sheet -- --protect --editor a@gmail.com           # xem trước khoá cột %, Trạng thái (đang khoá từ 06/10/2026)
 *   npm run overhaul:sheet -- --protect --editor a@gmail.com --apply   # GHI: khoá (chỉ tài khoản dịch vụ + --editor sửa được);
 *                                                  chạy lại sau khi thêm/bớt hạng mục để khoá đúng hàng
 *
 * Chỉ ghi Sheet khi .env có OVERHAUL_SHEET_WRITE=1 (máy dev dùng chung link file thật — mặc định KHÔNG ghi).
 * Chạy lại an toàn (hàng đợi chống ghi đôi). Thoát 1 khi còn lỗi để systemctl hiện "failed".
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

async function main() {
  const writer = await import("../../lib/server/overhaul-sheet-writer");
  const { prisma } = await import("../../lib/prisma");
  try {
    if (flag("--status")) {
      const groups = await prisma.overhaulSheetOutbox.groupBy({ by: ["state"], _count: true });
      console.log(groups.map(group => `${group.state}: ${group._count}`).join(" · ") || "Hàng đợi trống");
      const failed = await prisma.overhaulSheetOutbox.findMany({ where: { state: { in: ["FAILED", "PENDING"] }, lastError: { not: null } }, orderBy: { updatedAt: "desc" }, take: 10 });
      for (const row of failed) console.log(`  [${row.state} · lần ${row.attemptCount}] ${row.sheet} · ${row.code} · ${row.day}: ${row.lastError}`);
      return;
    }
    if (flag("--dry")) {
      const result = await writer.pushOverhaulSheetOutbox({ dryRun: true });
      for (const cell of result.planned ?? []) console.log(`${cell.range} ← ${JSON.stringify(cell.value)}`);
      for (const error of result.errors) console.error(`  LỖI — ${error}`);
      console.log(`Xem trước: ${result.claimed} dòng chờ · ${result.written} dòng định vị được · ${result.planned?.length ?? 0} ô sẽ ghi`);
      return;
    }
    if (flag("--unprotect") || flag("--unprotect-days")) {
      const apply = flag("--apply");
      for (const line of await writer.unprotectOverhaulSheets(apply)) console.log(line);
      console.log(apply ? "Đã gỡ các vùng khoá do web tạo." : "Chỉ xem trước — thêm --apply để gỡ khoá trên Sheet.");
      return;
    }
    if (flag("--protect")) {
      const editors = args.flatMap((arg, i) => arg === "--editor" && args[i + 1] ? [args[i + 1]] : []);
      const apply = flag("--apply");
      const report = await writer.protectOverhaulSheets(apply, editors);
      for (const line of report) console.log(line);
      console.log(apply ? "Đã khoá các ô web ghi." : "Chỉ xem trước — thêm --apply để khoá trên Sheet.");
      return;
    }
    if (flag("--setup")) {
      const apply = flag("--apply");
      const report = await writer.setupOverhaulSheets(apply);
      for (const line of report) console.log(line);
      console.log(apply ? "Đã đổi danh sách trạng thái ô ngày." : "Chỉ xem trước — thêm --apply để ghi lên Sheet.");
      return;
    }
    if (flag("--daily")) {
      const day = option("--day") ?? writer.vnDay(new Date());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("--day phải dạng yyyy-mm-dd");
      // Hôm nay chỉ chốt từ 16:00 giờ VN — trước đó PCT còn có thể mở trong ngày.
      const vnHour = new Date(Date.now() + 7 * 3600_000).getUTCHours();
      if (!option("--day") && vnHour < 16) throw new Error("Chưa tới 16:00 giờ Việt Nam — dùng --day yyyy-mm-dd để chạy cho ngày đã qua");
      const queued = await writer.enqueueOverhaulNoSessionDay(day);
      console.log(`${day}: ${queued.permits} PCT không mở ngày thực hiện · ${queued.rows} ô xếp hàng`);
    }
    if (!writer.overhaulSheetWriteEnabled()) {
      console.log("Chưa bật ghi Sheet (OVERHAUL_SHEET_WRITE=1 trong .env) — hàng đợi giữ nguyên.");
      return;
    }
    // Một tiến trình đẩy tại một thời điểm: web đang đẩy thì chờ tới lượt (hàng đợi khi đó thường đã sạch).
    const result = await writer.drainOverhaulSheetOutbox({ waitForLock: true });
    if (result.busy) console.log("Tiến trình khác đang đẩy lâu — để lượt timer sau.");
    console.log(`Đã ghi ${result.written} dòng hạng mục lên Sheet${result.rateLimited ? " · có lúc chạm hạn mức Google, đã chờ rồi ghi tiếp" : ""}${result.errors.length ? ` · ${result.errors.length} lỗi` : ""}`);
    for (const error of result.errors) console.error(`  LỖI — ${error}`);
    if (result.errors.some(error => !/giới hạn số lần gọi/.test(error))) process.exitCode = 1;
  } catch (error) {
    console.error(`Ghi Sheet tiến độ đại tu THẤT BẠI: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
