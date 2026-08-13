import type { NextRequest } from "next/server";
import { ok, requireUser, handle } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { PCCC_PERMISSION, pcccPositionCodesOf, pcccWriteScopeOf, resolvePeriod } from "@/lib/pccc-service";
import { bookPositionOf, bookStatusOf } from "@/lib/pccc-so-theo-doi";
import { fcdStatusOf } from "@/lib/pccc-fcd-report";

export const dynamic = "force-dynamic";

/**
 * GET /api/pccc/so-theo-doi?period=&cuongVi=
 * Trạng thái nút "Xuất PDF" (Sổ theo dõi Mẫu số 01) của người đang đăng nhập.
 *
 * Điều kiện mở nút tính Ở SERVER chứ không đếm ở client: client chỉ có một trang dữ
 * liệu (25 dòng), đếm trên đó thì cương vị nào cũng "ký đủ" ngay trang đầu.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const sp = req.nextUrl.searchParams;
    const period = await resolvePeriod(sp.get("period"));

    // Tab Foam·CO2·Diesel·FM200 in MỘT bản cho cả kỳ (tài sản dùng chung của phân
    // xưởng), không cắt theo cương vị — nên điều kiện mở nút cũng khác hẳn.
    if (sp.get("tab") === "FCD") {
      const fcd = await fcdStatusOf(period.id);
      return ok(
        {
          positionCode: "FCD",
          positionLabel: "Foam · CO2 · Diesel · FM200",
          bcc: { total: fcd.bulks.total, signed: fcd.bulks.signed },
          tcc: { total: fcd.panels.total, signed: fcd.panels.signed },
          ready: fcd.ready,
          reason: fcd.reason,
        },
        { period }
      );
    }
    // Phạm vi GHI quyết định cương vị được xuất: xuất sổ là việc của người ký, không
    // phải của người chỉ được xem.
    const scope = await pcccWriteScopeOf(user);
    const positionCode = bookPositionOf(scope, sp.get("cuongVi"), pcccPositionCodesOf(user)[0]);
    const status = await bookStatusOf(period.id, positionCode);
    return ok(status, { period });
  });
}
