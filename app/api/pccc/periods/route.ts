import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { PCCC_PERMISSION, createNextPeriodFrom } from "@/lib/pccc-service";
import { PCCC_DB_KEEP_PERIODS, ensurePcccRollover } from "@/lib/pccc-rollover";
import { isLastDayOfMonth, isRolloverWindow, monthIndex, periodLabelOf, vietnamClock } from "@/lib/pccc-clock";

// Đường tự động chuyển kỳ có gọi exceljs + S3 → bắt buộc Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/pccc/periods -> danh sách kỳ kiểm tra, mới nhất trước
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    // Móc TỰ ĐỘNG CHUYỂN KỲ vào đây: đây là lượt gọi mở màn của trang PCCC, nên sang
    // tháng mới thì người đầu tiên mở trang đã thấy kỳ mới. Nhờ vậy hệ thống vẫn đúng kỳ
    // ngay cả khi chưa ai cài bộ hẹn giờ; có bộ hẹn giờ rồi thì hàm này gần như luôn trả
    // về ngay vì chẳng còn việc. Lỗi ở đây KHÔNG được làm hỏng lượt xem dữ liệu.
    await ensurePcccRollover().catch((e) => console.error("[pccc] tự động chuyển kỳ lỗi:", e));

    const periods = await prisma.pcccPeriod.findMany({
      orderBy: [{ year: "desc" }, { monthNo: "desc" }],
      select: {
        id: true,
        label: true,
        year: true,
        monthNo: true,
        isClosed: true,
        closedAt: true,
        archiveKey: true,
        archivedAt: true,
        _count: { select: { extinguishers: true, cabinets: true, bulks: true, fm200Panels: true, fireControlCabinets: true, signatures: true } },
      },
    });

    // Mốc thời gian tính Ở SERVER theo giờ VN: máy người dùng có thể lệch múi giờ hoặc
    // sai đồng hồ, mà "hôm nay có phải ngày cuối tháng không" quyết định nút chuyển kỳ
    // làm gì.
    const clock = vietnamClock();
    return ok(periods, {
      clock: {
        today: `${String(clock.day).padStart(2, "0")}/${String(clock.month).padStart(2, "0")}/${clock.year}`,
        currentLabel: periodLabelOf(clock.year, clock.month),
        isLastDayOfMonth: isLastDayOfMonth(clock),
        // Nút "Chuyển kỳ" chỉ hiện trong cửa sổ cuối tháng — xem lib/pccc-clock.ts.
        rolloverWindow: isRolloverWindow(clock),
        keepPeriods: PCCC_DB_KEEP_PERIODS,
      },
    });
  });
}

// POST /api/pccc/periods { fromLabel } -> sinh kỳ mới từ kỳ trước
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.manage, ["manage", "full"], "Không đủ quyền sinh kỳ mới");
    const body = (await req.json().catch(() => ({}))) as { fromLabel?: string };
    const source =
      body.fromLabel ??
      (await prisma.pcccPeriod.findFirst({ orderBy: [{ year: "desc" }, { monthNo: "desc" }], select: { label: true } }))
        ?.label;
    if (!source) throw new Error("Chưa có kỳ nào để sao chép");

    // KHÔNG cho sinh kỳ của tháng chưa tới. Đây chính là lỗ hổng đã đẻ ra kỳ T09.2026
    // trong khi mới đầu tháng 8: nút "Sinh kỳ mới" ngày trước cứ lấy kỳ mới nhất +1
    // tháng, bấm bao nhiêu lần thì chạy trước bấy nhiêu tháng. Kỳ sinh sớm khiến cả
    // trang mặc định vào tháng chưa bắt đầu và người dùng ghi nhầm vào đó.
    const clock = vietnamClock();
    const [srcYear, srcMonth] = [Number(source.slice(4)), Number(source.slice(1, 3))];
    const nextIndex = monthIndex(srcYear, srcMonth) + 1;
    if (nextIndex > monthIndex(clock.year, clock.month)) {
      return fail(
        `Không sinh trước được kỳ sau ${source}: tháng đó chưa tới. Kỳ mới được mở tự động vào ngày 1 hằng tháng.`,
        409
      );
    }

    const period = await createNextPeriodFrom(source);
    await audit(
      user.id,
      "CREATE_PCCC_PERIOD",
      "PcccPeriod",
      period.id,
      auditDetailWithPosition(user, `Sinh kỳ ${period.label} từ ${source}`)
    );
    return ok(period);
  });
}
