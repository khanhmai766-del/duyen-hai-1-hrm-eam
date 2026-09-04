/**
 * Chuyển kỳ sổ TBYCNN — mở kỳ tháng mới và chốt kỳ tháng cũ.
 *
 * Dựng theo đúng khuôn `lib/pccc-rollover.ts`, hai khác biệt có chủ ý:
 *
 *   1. KHÔNG xuất bản lưu trữ S3. `TbycnnPeriod` chưa có cột `archiveKey`, mà PCCC lấy
 *      "đã có bản lưu trữ" làm điều kiện an toàn để được xoá kỳ khỏi DB. Không có bản
 *      lưu trữ thì cũng KHÔNG dọn DB — giữ đủ mọi kỳ còn hơn xoá một kỳ không lấy lại được.
 *
 *   2. Sang kỳ mới chỉ XOÁ CHỮ KÝ, giữ nguyên số liệu thiết bị (nghiệp vụ chốt 2026-09-04).
 *      Thiết bị hỏng tháng trước vẫn hiện là hỏng cho tới khi có người sửa; chỉ việc ký
 *      xác nhận là phải làm lại mỗi tháng. Chữ ký nằm ở bảng riêng nên "xoá" ở đây đơn
 *      giản là không nhân bản sang.
 *
 * Mọi mốc thời gian tính theo GIỜ VIỆT NAM (`vietnamClock`), không theo giờ máy chủ —
 * production chạy UTC nên 23:30 ngày 30/09 giờ VN vẫn đang là 16:30 ngày 30/09 UTC.
 * Lưu ý `periodLabelOf` trong lib/tbycnn.ts dùng giờ máy chủ; ở đây cố ý không dùng nó.
 */
import { prisma } from "@/lib/prisma";
import { monthIndex, vietnamClock } from "@/lib/pccc-clock";

export { isLastDayOfMonth, vietnamClock, type PcccClock as TbycnnClock } from "@/lib/pccc-clock";

/** Nhãn kỳ TBYCNN là "2026-09" — khác PCCC ("T09.2026"), nên không dùng chung hàm. */
export function tbycnnPeriodLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export type TbycnnRolloverResult = {
  closed: string[];
  created: string[];
  warnings: string[];
  errors: string[];
};

export type TbycnnRolloverOptions = {
  now?: Date;
  /**
   * Chốt luôn kỳ của THÁNG HIỆN TẠI. Chỉ bộ hẹn giờ chạy tối ngày cuối tháng mới bật.
   * Đường tự động lúc người dùng vào trang thì KHÔNG — nếu không, giữa tháng có người
   * mở trang là kỳ đang làm dở bị khoá.
   */
  closeCurrentPeriod?: boolean;
  actor?: string;
};

/**
 * Nhân bản toàn bộ thiết bị của một kỳ sang kỳ kế tiếp.
 *
 * Chữ ký KHÔNG được nhân bản: sang tháng mới phải ký xác nhận lại. Số liệu thiết bị
 * (số khả dụng, khiếm khuyết, ghi chú, hạn kiểm định) mang nguyên sang.
 */
export async function createNextTbycnnPeriodFrom(sourceLabel: string) {
  const source = await prisma.tbycnnPeriod.findUnique({ where: { label: sourceLabel } });
  if (!source) throw new Error(`Không có kỳ ${sourceLabel}`);

  const nextMonth = source.monthNo === 12 ? 1 : source.monthNo + 1;
  const nextYear = source.monthNo === 12 ? source.year + 1 : source.year;
  const label = tbycnnPeriodLabel(nextYear, nextMonth);
  if (await prisma.tbycnnPeriod.findUnique({ where: { label } })) {
    throw new Error(`Kỳ ${label} đã tồn tại`);
  }

  const equipments = await prisma.tbycnnEquipment.findMany({ where: { periodId: source.id } });

  return prisma.$transaction(async (tx) => {
    const period = await tx.tbycnnPeriod.create({
      data: { label, year: nextYear, monthNo: nextMonth },
    });
    if (equipments.length > 0) {
      await tx.tbycnnEquipment.createMany({
        // Bỏ id/periodId/mốc thời gian; phần còn lại chép nguyên.
        data: equipments.map(({ id, periodId, createdAt, updatedAt, ...rest }) => ({
          ...rest,
          periodId: period.id,
        })),
      });
    }
    return period;
  });
}

/**
 * Chạy toàn bộ vòng đời. Idempotent: không có gì để làm thì trả kết quả rỗng, gọi bao
 * nhiêu lần cũng không sinh thêm kỳ.
 */
export async function runTbycnnRollover(
  options: TbycnnRolloverOptions = {}
): Promise<TbycnnRolloverResult> {
  const clock = vietnamClock(options.now);
  const currentIndex = monthIndex(clock.year, clock.month);
  const result: TbycnnRolloverResult = { closed: [], created: [], warnings: [], errors: [] };

  const periods = await prisma.tbycnnPeriod.findMany({ orderBy: [{ year: "asc" }, { monthNo: "asc" }] });
  if (periods.length === 0) return result; // chưa nạp dữ liệu lần nào — không tự bịa kỳ

  // ---- 1) Chốt mọi kỳ còn mở của tháng đã qua (và tháng này nếu bộ hẹn giờ yêu cầu)
  const toClose = periods.filter((p) => {
    if (p.isClosed) return false;
    const idx = monthIndex(p.year, p.monthNo);
    return idx < currentIndex || (idx === currentIndex && options.closeCurrentPeriod === true);
  });

  for (const period of toClose) {
    try {
      // `isClosed: false` trong điều kiện = chốt đúng một lần dù hai tiến trình chạy song song.
      const claimed = await prisma.tbycnnPeriod.updateMany({
        where: { id: period.id, isClosed: false },
        data: { isClosed: true, closedAt: new Date(), closedById: null },
      });
      if (claimed.count > 0) result.closed.push(period.label);
    } catch (e) {
      // Dừng ở kỳ hỏng, không nhảy cóc: thứ tự chốt phải liền mạch.
      result.errors.push(`Chốt kỳ ${period.label} thất bại: ${(e as Error).message}`);
      return result;
    }
  }

  // ---- 2) Sinh bù cho tới tháng hiện tại
  //
  // Bộ hẹn giờ chạy đêm cuối tháng chỉ CHỐT, không sinh kỳ của tháng sau: lúc đó tháng
  // sau chưa tới. Lượt chạy 00:0x ngày 1 mới sinh.
  if (!options.closeCurrentPeriod) {
    const currentLabel = tbycnnPeriodLabel(clock.year, clock.month);
    const existingCurrent = await prisma.tbycnnPeriod.findUnique({ where: { label: currentLabel } });
    if (existingCurrent && result.closed.length > 0) {
      // Kỳ tháng này có sẵn từ trước khi kỳ trước được chốt → nội dung của nó KHÔNG mang
      // theo các sửa đổi cuối cùng của kỳ vừa chốt. Phải nói ra, đừng để lặng lẽ.
      result.warnings.push(
        `Kỳ ${currentLabel} đã tồn tại sẵn nên không được sinh lại từ ${result.closed[result.closed.length - 1]} — `
        + "số liệu trong đó là bản có từ trước, hãy đối chiếu lại"
      );
    }

    // Mốc là kỳ mới nhất ĐÃ TỚI, không phải kỳ mới nhất trong bảng: dữ liệu có thể còn
    // kỳ sinh sớm, lấy nó làm mốc thì tưởng đã đủ và không bao giờ sinh kỳ tháng này.
    let latest = await prisma.tbycnnPeriod.findFirst({
      where: { OR: [{ year: { lt: clock.year } }, { year: clock.year, monthNo: { lte: clock.month } }] },
      orderBy: [{ year: "desc" }, { monthNo: "desc" }],
    });
    let guard = 0;
    while (latest && monthIndex(latest.year, latest.monthNo) < currentIndex && guard++ < 24) {
      const nextLabel = tbycnnPeriodLabel(
        latest.monthNo === 12 ? latest.year + 1 : latest.year,
        latest.monthNo === 12 ? 1 : latest.monthNo + 1
      );
      try {
        latest = await createNextTbycnnPeriodFrom(latest.label);
        result.created.push(latest.label);
      } catch (e) {
        // Có thể tiến trình khác vừa sinh đúng kỳ này (ràng buộc UNIQUE chặn lại) — đi
        // tiếp từ kỳ đó, không coi là lỗi.
        const existing = await prisma.tbycnnPeriod.findUnique({ where: { label: nextLabel } });
        if (!existing) {
          result.errors.push(`Sinh kỳ ${nextLabel} từ ${latest.label} thất bại: ${(e as Error).message}`);
          break;
        }
        latest = existing;
      }
    }
  }

  // ---- 3) KHÔNG dọn DB. Xem chú thích đầu tệp: chưa có bản lưu trữ thì không xoá kỳ nào.
  return result;
}

/**
 * Đường chạy TỰ ĐỘNG gắn vào lượt tải trang. Nhờ vậy sổ vẫn sang kỳ đúng hạn kể cả khi
 * bộ hẹn giờ chết — chỉ khác là thời điểm chốt rơi vào lần đầu có người vào trang của
 * tháng mới thay vì đêm cuối tháng.
 *
 * Chặn tần suất trong tiến trình để mỗi lượt tải trang không phải hỏi DB.
 */
let lastCheckedAt = 0;
let inFlight: Promise<TbycnnRolloverResult> | null = null;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export async function ensureTbycnnRollover(): Promise<TbycnnRolloverResult | null> {
  if (inFlight) return inFlight;
  if (Date.now() - lastCheckedAt < CHECK_INTERVAL_MS) return null;
  lastCheckedAt = Date.now();

  const clock = vietnamClock();
  const currentLabel = tbycnnPeriodLabel(clock.year, clock.month);
  // Đường nhanh: đã có kỳ tháng này và không còn kỳ cũ nào bỏ ngỏ → khỏi chạy.
  const [current, stale] = await Promise.all([
    prisma.tbycnnPeriod.findUnique({ where: { label: currentLabel }, select: { id: true } }),
    prisma.tbycnnPeriod.count({
      where: {
        isClosed: false,
        OR: [{ year: { lt: clock.year } }, { year: clock.year, monthNo: { lt: clock.month } }],
      },
    }),
  ]);
  if (current && stale === 0) return null;

  inFlight = runTbycnnRollover({ actor: "Hệ thống (tự động)" });
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Tóm tắt một dòng để ghi nhật ký. */
export function describeTbycnnRollover(result: TbycnnRolloverResult) {
  const parts = [
    result.closed.length ? `chốt ${result.closed.join(", ")}` : null,
    result.created.length ? `sinh ${result.created.join(", ")}` : null,
    result.warnings.length ? `lưu ý: ${result.warnings.join(" · ")}` : null,
    result.errors.length ? `lỗi: ${result.errors.join(" · ")}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Không có gì để làm";
}
