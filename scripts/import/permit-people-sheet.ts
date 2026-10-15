/**
 * Đồng bộ danh bạ nhân sự nhà thầu từ Google Sheets thẻ ra vào cổng — bản chạy nền cho timer
 * `dh1-permit-people-sync` (scripts/systemd: 00:00 và 07–17 giờ mỗi 2 giờ, giờ VN). Cùng nghiệp vụ với nút "Đồng bộ":
 * mỗi bảng một lượt WorkPermitPeopleSyncRun (hộp đồng bộ trên web thấy cả lượt hẹn giờ) — danh sách đọc bằng Sheets API,
 * rồi tải ảnh người mới/đổi theo lô.
 *
 *   npm run import:permit-people                     # bảng Đại tu + bảng SCTX
 *   npm run import:permit-people -- --source SCTX    # chỉ một bảng (OVERHAUL | SCTX)
 *
 * Idempotent: không có gì đổi thì mỗi bảng chỉ tốn vài giây. Đang có lượt chạy dở (vd người vừa bấm nút) thì bỏ qua bảng
 * đó. Một bảng lỗi không chặn bảng kia; thoát 1 khi có lỗi để systemctl hiện "failed".
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { PEOPLE_SYNC_SOURCES, parsePeopleSyncSource } = await import("../../lib/server/work-permit-people-sync");
  const { executePeopleSyncRun, startPeopleSyncRun } = await import("../../lib/server/work-permit-people-sync-runs");
  const { prisma } = await import("../../lib/prisma");
  const args = process.argv.slice(2);
  const only = args.includes("--source") ? args[args.indexOf("--source") + 1] : undefined;
  const sources = only ? [parsePeopleSyncSource(only)] : (Object.keys(PEOPLE_SYNC_SOURCES) as Array<keyof typeof PEOPLE_SYNC_SOURCES>);
  try {
    for (const source of sources) {
      const label = PEOPLE_SYNC_SOURCES[source].label;
      const started = Date.now();
      const { run, started: fresh } = await startPeopleSyncRun(source, { name: "Hẹn giờ" }, "TIMER");
      if (!fresh) { console.log(`Đồng bộ thẻ nhà thầu (${label}): đang có lượt chạy từ ${run.startedAt.toISOString()} — bỏ qua`); continue; }
      const done = await executePeopleSyncRun(run.id);
      if (done.state === "FAILED") { console.error(`Đồng bộ thẻ nhà thầu (${label}) THẤT BẠI: ${done.error}`); process.exitCode = 1; continue; }
      const list = done.summary as { via?: string; total: number; created: number; updated: number; skipped: number; conflictCount: number; movedCount: number;
        skippedTabs: Array<{ tab: string; rows: number }>; conflicts: string[]; skippedSamples: string[] };
      const errors = (done.photoErrors ?? []) as Array<{ code: string; error?: string }>;
      console.log(`Đồng bộ thẻ nhà thầu (${label}, đọc qua ${list.via === "api" ? "Sheets API" : "Apps Script"}): ${list.total} người (${list.created} mới, ${list.updated} cập nhật, ${list.skipped} dòng lỗi)`
        + `${list.conflictCount ? ` · ${list.conflictCount} số thẻ trùng người nhóm khác (không ghi đè)` : ""}`
        + ` · ảnh ${done.photosDone - errors.length}/${done.photosTotal}${errors.length ? ` · ${errors.length} ảnh lỗi` : ""}`
        + `${list.movedCount ? ` · ${list.movedCount} người chuyển đơn vị` : ""} · ${Math.round((Date.now() - started) / 1000)}s`);
      if (list.skippedTabs.length) console.log(`Tab bỏ qua (không trùng Mã đơn vị): ${list.skippedTabs.map(t => `${t.tab} (${t.rows})`).join(", ")}`);
      for (const line of [...list.conflicts, ...list.skippedSamples, ...errors.map(e => `${e.code}: ${e.error}`)]) console.log(`  - ${line}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
