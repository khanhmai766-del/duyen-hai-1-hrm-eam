import { audit, fail, ok, requireUser } from "@/lib/api";
import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { permitBody, permitHandle } from "@/lib/server/work-permits";
import { syncPeopleList, syncPeoplePhotos, type PhotoJob } from "@/lib/server/work-permit-people-sync";
export const dynamic = "force-dynamic";

/**
 * Đồng bộ danh bạ nhân sự nhà thầu từ Google Sheets. Trình duyệt gọi `step: "list"` một lần rồi lặp
 * `step: "photos"` theo từng nhóm ảnh mà bước list trả về — mỗi lượt gọi ngắn, không vượt thời gian chờ.
 */
export async function POST(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const body = await permitBody(req);
    if (body.step === "list") {
      const result = await syncPeopleList();
      await audit(user.id, "SYNC_WORK_PERMIT_PEOPLE", "WorkPermitPerson", undefined,
        `Đồng bộ Google Sheets: ${result.total} người (${result.created} mới, ${result.updated} cập nhật, ${result.skipped} bỏ qua), ${result.photos.length} ảnh cần tải`);
      return ok(result);
    }
    if (body.step === "photos") return ok(await syncPeoplePhotos(body.jobs as PhotoJob[]));
    return fail("Bước đồng bộ không hợp lệ");
  });
}
