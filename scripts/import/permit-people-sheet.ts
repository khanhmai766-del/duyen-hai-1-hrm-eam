/**
 * Đồng bộ danh bạ nhân sự nhà thầu từ Google Sheets thẻ ra vào cổng — bản chạy nền cho timer
 * `dh1-permit-people-sync` (scripts/systemd, 00:00 hằng đêm). Cùng nghiệp vụ với nút "Đồng bộ từ Google Sheets":
 * lấy danh sách (tên tab = Mã đơn vị), rồi tải ảnh mới/đổi theo từng nhóm.
 *
 *   npm run import:permit-people                     # bảng Đại tu + bảng SCTX (nếu .env đã có PERMIT_CARD_SHEET_SCTX_*)
 *   npm run import:permit-people -- --source SCTX    # chỉ một bảng (OVERHAUL | SCTX)
 *
 * Idempotent: không có gì đổi thì chỉ tốn một lượt gọi danh sách (~7 giây) mỗi bảng. Ảnh chỉ tải lần đầu hoặc
 * khi ảnh trong sheet đổi. Một bảng lỗi không chặn bảng kia; thoát 1 khi có lỗi để systemctl hiện "failed".
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const PHOTO_BATCH = 6;

async function main() {
  const { PEOPLE_SYNC_SOURCES, parsePeopleSyncSource, syncPeopleList, syncPeoplePhotos } = await import("../../lib/server/work-permit-people-sync");
  const { prisma } = await import("../../lib/prisma");
  const args = process.argv.slice(2);
  const only = args.includes("--source") ? args[args.indexOf("--source") + 1] : undefined;
  // Mặc định: bảng Đại tu luôn chạy; bảng SCTX chỉ khi server đã cấu hình (chưa có thì bỏ qua, không báo lỗi).
  const sources = only ? [parsePeopleSyncSource(only)]
    : (Object.keys(PEOPLE_SYNC_SOURCES) as Array<keyof typeof PEOPLE_SYNC_SOURCES>)
      .filter(source => source === "OVERHAUL" || (process.env[PEOPLE_SYNC_SOURCES[source].urlEnv]?.trim() && process.env[PEOPLE_SYNC_SOURCES[source].tokenEnv]?.trim()));
  try {
    for (const source of sources) {
      const label = PEOPLE_SYNC_SOURCES[source].label;
      const started = Date.now();
      try {
        const list = await syncPeopleList(source);
        let ok = 0;
        const failed: string[] = [];
        for (let i = 0; i < list.photos.length; i += PHOTO_BATCH) {
          const { results } = await syncPeoplePhotos(list.photos.slice(i, i + PHOTO_BATCH));
          for (const r of results) r.ok ? ok++ : failed.push(`${r.code}: ${r.error}`);
        }
        console.log(`Đồng bộ thẻ nhà thầu (${label}): ${list.total} người (${list.created} mới, ${list.updated} cập nhật, ${list.skipped} dòng lỗi)`
          + `${list.conflictCount ? ` · ${list.conflictCount} số thẻ trùng người nhóm khác (không ghi đè)` : ""}`
          + ` · ảnh ${ok}/${list.photos.length}${failed.length ? ` · ${failed.length} ảnh lỗi` : ""}`
          + `${list.movedCount ? ` · ${list.movedCount} người chuyển đơn vị` : ""} · ${Math.round((Date.now() - started) / 1000)}s`);
        if (list.skippedTabs.length) console.log(`Tab bỏ qua (không trùng Mã đơn vị): ${list.skippedTabs.map(t => `${t.tab} (${t.rows})`).join(", ")}`);
        for (const line of [...list.conflicts, ...list.skippedSamples, ...failed]) console.log(`  - ${line}`);
      } catch (error) {
        const message = error instanceof Response ? (await error.json().catch(() => null))?.error : error instanceof Error ? error.message : String(error);
        console.error(`Đồng bộ thẻ nhà thầu (${label}) THẤT BẠI: ${message}`);
        process.exitCode = 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
