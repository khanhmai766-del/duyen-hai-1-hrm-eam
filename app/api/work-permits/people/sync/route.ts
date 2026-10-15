import { after as afterResponse } from "next/server";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { permitBody, permitHandle } from "@/lib/server/work-permits";
import { PEOPLE_SYNC_SOURCES, parsePeopleSyncSource, syncPeopleList, syncPeoplePhotos } from "@/lib/server/work-permit-people-sync";
import { executePeopleSyncRun, latestPeopleSyncRuns, startPeopleSyncRun } from "@/lib/server/work-permit-people-sync-runs";
export const dynamic = "force-dynamic";

/** GET — lượt đồng bộ gần nhất của mỗi bảng nguồn (hộp đồng bộ hỏi lại mỗi 2 giây khi đang chạy). */
export async function GET() {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    return ok(await latestPeopleSyncRuns());
  });
}

/**
 * Đồng bộ danh bạ nhân sự nhà thầu từ Google Sheets.
 *  - `step: "start"` (16/10/2026): mở một lượt CHẠY NỀN (danh sách + ảnh) rồi trả lời ngay; tiến độ đọc qua GET.
 *    Đang có lượt chạy của bảng đó thì trả lượt ấy, không mở trùng.
 *  - `step: "list"` / `"photos"`: cách cũ do trình duyệt điều khiển — giữ cho tương thích.
 * `source`: "OVERHAUL" (bảng thẻ nhà thầu Đại tu, mặc định) hoặc "SCTX" (bảng nhân sự SCTX).
 */
export async function POST(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const body = await permitBody(req);
    if (body.step === "start") {
      const source = parsePeopleSyncSource(body.source);
      const { run, started } = await startPeopleSyncRun(source, { id: user.id, name: user.name }, "MANUAL");
      if (started) {
        await audit(user.id, "SYNC_WORK_PERMIT_PEOPLE", "WorkPermitPerson", run.id, `Bắt đầu đồng bộ Google Sheets (${PEOPLE_SYNC_SOURCES[source].label}) — chạy nền`);
        afterResponse(() => executePeopleSyncRun(run.id));
      }
      return ok({ run, started });
    }
    if (body.step === "list") {
      const result = await syncPeopleList(parsePeopleSyncSource(body.source));
      await audit(user.id, "SYNC_WORK_PERMIT_PEOPLE", "WorkPermitPerson", undefined,
        `Đồng bộ Google Sheets (${result.sourceLabel}): ${result.total} người (${result.created} mới, ${result.updated} cập nhật, ${result.skipped} bỏ qua, ${result.conflictCount} trùng số thẻ nhóm khác), ${result.photos.length} ảnh cần tải`);
      return ok(result);
    }
    if (body.step === "photos") return ok(await syncPeoplePhotos(body.jobs));
    return fail("Bước đồng bộ không hợp lệ");
  });
}
