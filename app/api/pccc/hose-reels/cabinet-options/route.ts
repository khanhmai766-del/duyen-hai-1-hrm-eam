import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import {
  assertPeriodWritable,
  resolvePcccWriteScope,
  resolvePeriod,
  scopeWhere,
} from "@/lib/pccc-service";

export const dynamic = "force-dynamic";

const OPTION_LIMIT = 40;

/**
 * Danh sách NHẸ dùng riêng cho hộp thoại thêm cuộn vòi.
 *
 * Không tái sử dụng GET /cabinets vì route đó còn tải toàn bộ linh kiện, chữ ký và
 * metadata của bảng. Khi nhiều người cùng mở hộp thoại, tải 200–500 tủ đầy đủ vừa tốn
 * DB vừa tạo payload lớn không cần thiết.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const writeScope = await resolvePcccWriteScope(user, "Không đủ quyền thêm cuộn vòi", "HOSE_REEL");
    const sp = req.nextUrl.searchParams;
    const period = await resolvePeriod(sp.get("period"));
    assertPeriodWritable(period);

    const q = sp.get("q")?.trim().slice(0, 100);
    const where: Prisma.PcccCabinetWhereInput = {
      periodId: period.id,
      // `scopeWhere` giao cắt cương vị đang chọn trên trang với cương vị làm việc hiện
      // tại của tài khoản. Chọn ngoài phạm vi sẽ trả danh sách rỗng, không nới quyền.
      ...scopeWhere(sp.get("cuongVi"), sp.get("machine"), writeScope),
      ...(q
        ? {
            OR: [
              { ma: { contains: q, mode: "insensitive" } },
              { ten: { contains: q, mode: "insensitive" } },
              { viTri: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    // Lấy dư đúng một dòng để báo còn kết quả mà không phải chạy thêm COUNT(*).
    const rows = await prisma.pcccCabinet.findMany({
      where,
      orderBy: [{ ma: "asc" }, { stt: "asc" }],
      take: OPTION_LIMIT + 1,
      select: {
        id: true,
        ma: true,
        ten: true,
        viTri: true,
        cuongVi: true,
        cuongViCode: true,
        machine: true,
        _count: { select: { hoseReels: true } },
      },
    });

    return ok(
      rows.slice(0, OPTION_LIMIT).map(({ _count, ...row }) => ({
        ...row,
        hoseReelCount: _count.hoseReels,
      })),
      { limit: OPTION_LIMIT, hasMore: rows.length > OPTION_LIMIT }
    );
  });
}
