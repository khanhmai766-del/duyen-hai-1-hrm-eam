import { fail, ok, requireUser } from "@/lib/api";
import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { permitHandle } from "@/lib/server/work-permits";
import { listOverhaulItems } from "@/lib/server/work-permit-overhaul";
import { OPERATION_POSITION_TITLES } from "@/lib/positions";
import { PERMIT_KINDS } from "@/lib/work-permits";
export const dynamic = "force-dynamic";

/**
 * GET /api/work-permits/overhaul-items?kind=&company=&position=
 * Hạng mục đại tu gợi ý cho form cấp PCT nhà thầu · Đại tu: lọc theo loại PCT (Cơ / Điện), mã nhà thầu của đơn vị
 * công tác và cương vị (bỏ trống = mọi cương vị). Dữ liệu đã đồng bộ từ Google Sheets (xem …/sync).
 */
export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const p = new URL(req.url).searchParams;
    const kind = p.get("kind") || "";
    if (!Object.hasOwn(PERMIT_KINDS, kind)) return fail("Loại PCT không hợp lệ");
    const position = p.get("position") || "";
    if (position && !OPERATION_POSITION_TITLES.some(value => value === position)) return fail("Cương vị không hợp lệ");
    const company = (p.get("company") || "").slice(0, 200);
    return ok(await listOverhaulItems({ kind, company, position }));
  });
}
