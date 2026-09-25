/**
 * Đồng bộ danh bạ nhân sự nhà thầu từ Google Sheets thẻ ra vào cổng — bản chạy nền cho timer
 * `dh1-permit-people-sync` (scripts/systemd, 00:00 hằng đêm). Cùng nghiệp vụ với nút "Đồng bộ từ Google Sheets":
 * lấy danh sách (tên tab = Mã đơn vị), rồi tải ảnh mới/đổi theo từng nhóm.
 *
 *   npm run import:permit-people
 *
 * Idempotent: không có gì đổi thì chỉ tốn một lượt gọi danh sách (~7 giây). Ảnh chỉ tải lần đầu hoặc
 * khi ảnh trong sheet đổi. Thoát 1 khi lỗi để systemctl hiện "failed".
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const PHOTO_BATCH = 6;

async function main() {
  const { syncPeopleList, syncPeoplePhotos } = await import("../../lib/server/work-permit-people-sync");
  const { prisma } = await import("../../lib/prisma");
  const started = Date.now();
  try {
    const list = await syncPeopleList();
    let ok = 0;
    const failed: string[] = [];
    for (let i = 0; i < list.photos.length; i += PHOTO_BATCH) {
      const { results } = await syncPeoplePhotos(list.photos.slice(i, i + PHOTO_BATCH));
      for (const r of results) r.ok ? ok++ : failed.push(`${r.code}: ${r.error}`);
    }
    console.log(`Đồng bộ thẻ nhà thầu: ${list.total} người (${list.created} mới, ${list.updated} cập nhật, ${list.skipped} dòng lỗi)`
      + ` · ảnh ${ok}/${list.photos.length}${failed.length ? ` · ${failed.length} ảnh lỗi` : ""}`
      + `${list.movedCount ? ` · ${list.movedCount} người chuyển đơn vị` : ""} · ${Math.round((Date.now() - started) / 1000)}s`);
    if (list.skippedTabs.length) console.log(`Tab bỏ qua (không trùng Mã đơn vị): ${list.skippedTabs.map(t => `${t.tab} (${t.rows})`).join(", ")}`);
    for (const line of [...list.skippedSamples, ...failed]) console.log(`  - ${line}`);
  } catch (error) {
    const message = error instanceof Response ? (await error.json().catch(() => null))?.error : error instanceof Error ? error.message : String(error);
    console.error(`Đồng bộ thẻ nhà thầu THẤT BẠI: ${message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
