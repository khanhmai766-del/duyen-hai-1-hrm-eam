import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { canManageMaterialCatalog } from "@/lib/constants";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 365;

/** Danh sách mẫu dầu Không Đạt đã đồng bộ từ LIMS.
 *  Mọi cương vị đều được XEM; chỉ nhóm quản lý mới được bấm đồng bộ (xem route import). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();

    const params = req.nextUrl.searchParams;
    const requestedDays = Number(params.get("days"));
    const days = Number.isFinite(requestedDays) && requestedDays > 0
      ? Math.min(Math.trunc(requestedDays), MAX_DAYS)
      : DEFAULT_DAYS;
    const khuVuc = params.get("khuVuc")?.trim();
    const donVi = params.get("donVi")?.trim();

    // LIMS lọc theo NGÀY TRẢ KẾT QUẢ (không phải ngày lấy mẫu) — giữ đúng ngữ nghĩa đó.
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const where: Prisma.OilAnalysisFailureWhereInput = {
      ...(khuVuc ? { khuVuc } : {}),
      ...(donVi ? { donVi } : {}),
      OR: [{ ngayTraKq: { gte: since } }, { ngayTraKq: null }],
    };

    const items = await prisma.oilAnalysisFailure.findMany({
      where,
      orderBy: [{ ngayTraKq: "desc" }, { soPhieu: "desc" }],
    });

    return ok(
      items.map((item) => ({
        id: item.id,
        limsId: item.limsId,
        soPhieu: item.soPhieu,
        khuVuc: item.khuVuc,
        donVi: item.donVi,
        tenMau: item.tenMau,
        ngayLayMau: item.ngayLayMau?.toISOString() ?? null,
        danhGia: item.danhGia,
        ykienPkt: item.ykienPkt,
        ykienQlvh: item.ykienQlvh,
        ngayTraKq: item.ngayTraKq?.toISOString() ?? null,
        firstSeenAt: item.firstSeenAt.toISOString(),
        syncedAt: item.syncedAt.toISOString(),
      })),
      {
        days,
        canSync: canManageMaterialCatalog(user),
        // Phiếu PKT đã có ý kiến nhưng QLVH chưa phản hồi — phần cần theo dõi.
        pendingQlvhCount: items.filter((item) => !item.ykienQlvh).length,
      }
    );
  });
}
