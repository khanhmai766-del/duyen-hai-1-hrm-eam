import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PEOPLE_SYNC_SOURCES, syncPeopleList, syncPeoplePhotos, type PeopleSyncSource } from "@/lib/server/work-permit-people-sync";

/*
 * Đồng bộ danh bạ nhân sự nhà thầu CHẠY NỀN (16/10/2026). Mỗi lượt một dòng WorkPermitPeopleSyncRun: nút "Đồng bộ" tạo
 * lượt rồi chạy sau khi đã trả lời (next/server after), hẹn giờ trên server chạy thẳng; hộp đồng bộ chỉ đọc dòng này để
 * hiện tiến độ. App chạy nhiều tiến trình pm2 → trạng thái phải nằm trong DB, không giữ trong bộ nhớ.
 * Mỗi bảng nguồn chỉ một lượt đang chạy; lượt RUNNING quá STALE_MS coi như tiến trình đã chết (được mở lượt mới).
 */

const PHOTO_BATCH = 6;
const STALE_MS = 30 * 60_000;
export type PeopleSyncTrigger = "MANUAL" | "TIMER";

const message = async (error: unknown) => error instanceof Response
  ? ((await error.clone().json().catch(() => null))?.error ?? `Lỗi ${error.status}`)
  : error instanceof Error ? error.message : String(error);

/** Mở một lượt mới; đang có lượt chạy dở của bảng đó thì trả lượt ấy (started = false), không mở trùng. */
export async function startPeopleSyncRun(source: PeopleSyncSource, actor: { id?: string; name?: string | null }, trigger: PeopleSyncTrigger) {
  return prisma.$transaction(async tx => {
    // Khoá theo bảng nguồn: hai người bấm cùng lúc (hai tiến trình) không mở hai lượt.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`people-sync:${source}`}))`;
    const running = await tx.workPermitPeopleSyncRun.findFirst({ where: { source, state: "RUNNING", startedAt: { gt: new Date(Date.now() - STALE_MS) } }, orderBy: { startedAt: "desc" } });
    if (running) return { run: running, started: false };
    await tx.workPermitPeopleSyncRun.updateMany({ where: { source, state: "RUNNING" }, data: { state: "FAILED", finishedAt: new Date(), error: "Lượt trước bị gián đoạn (máy chủ khởi động lại?)" } });
    const run = await tx.workPermitPeopleSyncRun.create({ data: { source, trigger, startedById: actor.id ?? null, startedByName: actor.name ?? "" } });
    return { run, started: true };
  });
}

/** Chạy trọn một lượt: danh sách (Sheets API) rồi ảnh theo lô; ghi tiến độ sau mỗi lô. Không ném lỗi — ghi vào dòng lượt. */
export async function executePeopleSyncRun(id: string) {
  const run = await prisma.workPermitPeopleSyncRun.findUniqueOrThrow({ where: { id } });
  const source = run.source as PeopleSyncSource;
  try {
    const { photos, ...summary } = await syncPeopleList(source);
    await prisma.workPermitPeopleSyncRun.update({ where: { id }, data: { summary: summary as unknown as Prisma.InputJsonValue, photosTotal: photos.length } });
    const errors: Array<{ code: string; error?: string }> = [];
    let done = 0;
    for (let i = 0; i < photos.length; i += PHOTO_BATCH) {
      const { results } = await syncPeoplePhotos(photos.slice(i, i + PHOTO_BATCH));
      done += results.length;
      errors.push(...results.filter(result => !result.ok).map(result => ({ code: result.code, error: result.error })));
      await prisma.workPermitPeopleSyncRun.update({ where: { id }, data: { photosDone: done, photoErrors: errors.slice(0, 50) as unknown as Prisma.InputJsonValue } });
    }
    return await prisma.workPermitPeopleSyncRun.update({ where: { id }, data: { state: "DONE", finishedAt: new Date() } });
  } catch (error) {
    return prisma.workPermitPeopleSyncRun.update({ where: { id }, data: { state: "FAILED", finishedAt: new Date(), error: (await message(error)).slice(0, 1000) } });
  }
}

/** Lượt gần nhất của mỗi bảng nguồn (hộp đồng bộ). */
export async function latestPeopleSyncRuns() {
  const sources = Object.keys(PEOPLE_SYNC_SOURCES) as PeopleSyncSource[];
  const rows = await Promise.all(sources.map(source => prisma.workPermitPeopleSyncRun.findFirst({ where: { source }, orderBy: { startedAt: "desc" } })));
  return Object.fromEntries(sources.map((source, i) => [source, rows[i]]));
}
