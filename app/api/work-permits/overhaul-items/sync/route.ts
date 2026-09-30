import { audit, ok, requireUser } from "@/lib/api";
import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { permitHandle } from "@/lib/server/work-permits";
import { syncOverhaulItems } from "@/lib/server/work-permit-overhaul";
export const dynamic = "force-dynamic";

/** POST /api/work-permits/overhaul-items/sync — chép hạng mục từ 4 file Google Sheets tiến độ đại tu về DB. */
export async function POST() {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const result = await syncOverhaulItems();
    const summary = result.sources
      .filter(s => s.configured)
      .map(s => s.error ? `${s.label}: lỗi (${s.error})` : `${s.label}: ${s.rows} hạng mục (${s.created} mới, ${s.updated} cập nhật, ${s.deactivated} ngừng)`)
      .join("; ");
    await audit(user.id, "SYNC_WORK_PERMIT_OVERHAUL_ITEMS", "WorkPermitOverhaulItem", undefined, `Đồng bộ tiến độ đại tu — ${summary}`.slice(0, 2000));
    return ok(result);
  });
}
