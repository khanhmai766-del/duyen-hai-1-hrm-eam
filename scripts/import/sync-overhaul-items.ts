/**
 * Đồng bộ hạng mục đại tu từ 4 file Google Sheets tiến độ (link dòng 1–4 bảng "Tiến độ đại tu" trên sổ PCT) —
 * bản chạy nền cho timer `dh1-overhaul-items-sync` (scripts/systemd, 06:00 giờ VN). Cùng nghiệp vụ với nút
 * "Đồng bộ hạng mục" trên web. Đọc bằng service account (GOOGLE_SA_KEY_FILE) — docs/dai-tu-google-sheets.md.
 *
 *   npm run import:overhaul-items
 *
 * Idempotent; chỉ ĐỌC Google Sheets. Thoát 1 khi lỗi để systemctl hiện "failed".
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { syncOverhaulItems } = await import("../../lib/server/work-permit-overhaul");
  const { prisma } = await import("../../lib/prisma");
  const started = Date.now();
  try {
    const { sources } = await syncOverhaulItems();
    let failed = 0;
    for (const s of sources) {
      if (!s.configured) { console.log(`${s.label}: chưa có link`); continue; }
      if (s.error) { failed++; console.error(`${s.label}: LỖI — ${s.error}`); continue; }
      console.log(`${s.label}: ${s.rows} hạng mục (${s.mechanical} Cơ · ${s.electrical} Điện) · mới ${s.created} · cập nhật ${s.updated} · ngừng ${s.deactivated}`);
      if (s.unknownContractors.length) console.log(`  nhà thầu chưa có trong danh bạ: ${s.unknownContractors.join(", ")}`);
      if (s.unmatchedPositions.length) console.log(`  cương vị chưa khớp: ${s.unmatchedPositions.join(", ")}`);
      if (s.skippedTabs.length) console.log(`  tab bỏ (không rõ Cơ/Điện): ${s.skippedTabs.join(", ")}`);
    }
    console.log(`Xong sau ${Math.round((Date.now() - started) / 1000)}s`);
    if (failed) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Response ? (await error.json().catch(() => null))?.error : error instanceof Error ? error.message : String(error);
    console.error(`Đồng bộ hạng mục đại tu THẤT BẠI: ${message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
