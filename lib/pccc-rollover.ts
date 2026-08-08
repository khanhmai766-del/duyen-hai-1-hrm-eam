/**
 * TỰ ĐỘNG CHUYỂN KỲ PCCC (bước F).
 *
 * Vòng đời một tháng, không cần ai bấm nút:
 *   ngày cuối tháng  → xuất Excel kỳ hiện tại lên S3 rồi CHỐT (chuyển chỉ đọc)
 *   ngày 1 tháng sau → sinh kỳ mới, bê nguyên số liệu kỳ vừa chốt, xoá ngày/người kiểm
 *                      tra và chữ ký để tháng mới ký lại
 *   sau khi chốt     → DB chỉ giữ 6 KỲ GẦN NHẤT, kỳ cũ hơn bị xoá (file vẫn còn trên S3)
 *
 * BỐN ĐIỀU KIỆN AN TOÀN, vi phạm cái nào cũng là mất dữ liệu thật:
 *
 *  1. **Không chốt khi chưa upload xong.** Upload trước, ghi `archiveKey` rồi mới đặt
 *     `isClosed`. Upload lỗi → dừng cả lượt, kỳ vẫn mở, lần chạy sau làm lại.
 *  2. **Không xoá kỳ chưa có bản lưu trữ.** Bộ dọn chỉ đụng kỳ đã `isClosed` và có
 *     `archiveKey`; kỳ nào thiếu thì giữ lại dù đã quá 6 kỳ, và báo ra ngoài.
 *  3. **Chạy chồng nhau vẫn đúng.** Trang PCCC gọi job này mỗi lần tải danh sách kỳ nên
 *     nhiều người vào cùng lúc là chạy song song, chưa kể bộ hẹn giờ chạy ở tiến trình
 *     khác. Thay vì đi khoá (advisory lock của Postgres bám theo KẾT NỐI, mà Prisma dùng
 *     pool nên lệnh mở khoá dễ rơi vào kết nối khác và treo khoá vĩnh viễn), mọi bước
 *     đều được viết để chỉ MỘT bên thắng: chốt bằng `updateMany` có điều kiện
 *     `isClosed: false`, sinh kỳ dựa vào ràng buộc UNIQUE của nhãn kỳ, xoá bằng
 *     `deleteMany`. Bên thua không hỏng gì, chỉ không có việc để làm.
 *  4. **Chạy lại được và tự bù.** Bỏ lỡ vài tháng (máy chủ tắt) thì lần chạy kế tiếp
 *     chốt lần lượt từng kỳ còn mở và sinh bù cho tới tháng hiện tại.
 *
 * Mốc thời gian tính theo GIỜ VIỆT NAM, không theo giờ máy chủ: máy chủ chạy UTC thì
 * 23:30 ngày 31/08 giờ VN vẫn đang là 16:30 ngày 31/08 UTC — lệch múi giờ ở đây là
 * chốt nhầm tháng.
 */
import { prisma } from "@/lib/prisma";
import { createNextPeriodFrom } from "@/lib/pccc-service";
import { uploadPeriodArchive } from "@/lib/pccc-archive";
import { monthIndex, periodLabelOf, vietnamClock } from "@/lib/pccc-clock";

/** Số kỳ giữ lại trong DB sau mỗi lần chốt (đã chốt với nghiệp vụ: 6 kỳ gần nhất). */
export const PCCC_DB_KEEP_PERIODS = 6;

// Mốc thời gian nằm ở lib/pccc-clock.ts để lớp nghiệp vụ dùng chung mà không tạo vòng import.
export { isLastDayOfMonth, periodLabelOf, vietnamClock, type PcccClock } from "@/lib/pccc-clock";

export type RolloverResult = {
  closed: { label: string; archiveKey: string; bytes: number }[];
  created: string[];
  deleted: string[];
  /** Kỳ quá 6 kỳ nhưng CHƯA có bản lưu trữ nên không dám xoá — cần người xem lại. */
  keptWithoutArchive: string[];
  /** Chuyện bất thường nhưng không phải lỗi — vd kỳ tháng này đã tồn tại sẵn từ trước. */
  warnings: string[];
  errors: string[];
};

export type RolloverOptions = {
  now?: Date;
  /**
   * Chốt luôn KỲ CỦA THÁNG HIỆN TẠI. Chỉ bộ hẹn giờ chạy tối ngày cuối tháng mới bật;
   * đường chạy tự động lúc người dùng vào trang thì KHÔNG, nếu không giữa tháng vào
   * trang là kỳ đang làm dở bị khoá.
   */
  closeCurrentPeriod?: boolean;
  /** Ghi vào sheet "CHỐT KỲ" và nhật ký — ai/cái gì đã chốt. */
  actor?: string;
};

/**
 * Chạy toàn bộ vòng đời. Idempotent: không có gì để làm thì trả về kết quả rỗng, gọi
 * bao nhiêu lần cũng không sinh thêm kỳ hay upload lại file.
 */
export async function runPcccRollover(options: RolloverOptions = {}): Promise<RolloverResult> {
  const clock = vietnamClock(options.now);
  const actor = options.actor ?? "Hệ thống (tự động)";
  const currentIndex = monthIndex(clock.year, clock.month);
  const result: RolloverResult = { closed: [], created: [], deleted: [], keptWithoutArchive: [], warnings: [], errors: [] };

  const periods = await prisma.pcccPeriod.findMany({ orderBy: [{ year: "asc" }, { monthNo: "asc" }] });
  if (periods.length === 0) return result; // chưa nạp dữ liệu lần nào — không tự bịa kỳ

  // ---- 1) Chốt: mọi kỳ còn mở của tháng đã qua, cũ trước mới sau
  const toClose = periods.filter((p) => {
    if (p.isClosed) return false;
    const idx = monthIndex(p.year, p.monthNo);
    return idx < currentIndex || (idx === currentIndex && options.closeCurrentPeriod === true);
  });

  for (const period of toClose) {
    const closedAt = new Date();
    try {
      // Upload TRƯỚC, chốt SAU — điều kiện an toàn số 1.
      const { key, bytes } = await uploadPeriodArchive(period.id, period.label, { closedAt, closedBy: actor });
      // `isClosed: false` trong điều kiện = chốt một lần duy nhất dù chạy song song.
      const claimed = await prisma.pcccPeriod.updateMany({
        where: { id: period.id, isClosed: false },
        data: { isClosed: true, closedAt, closedById: null, archiveKey: key, archivedAt: closedAt, archiveBytes: bytes },
      });
      if (claimed.count > 0) result.closed.push({ label: period.label, archiveKey: key, bytes });
    } catch (e) {
      // Dừng ở kỳ hỏng, không nhảy cóc sang kỳ sau: thứ tự chốt phải liền mạch.
      result.errors.push(`Chốt kỳ ${period.label} thất bại: ${(e as Error).message}`);
      return result;
    }
  }

  // ---- 2) Sinh bù cho tới tháng hiện tại
  //
  // Mốc so sánh là kỳ mới nhất ĐÃ TỚI, không phải kỳ mới nhất trong bảng: dữ liệu cũ có
  // thể còn kỳ sinh sớm (vd đang tháng 8 mà đã có T09) — lấy nó làm mốc thì tưởng đã đủ
  // và không bao giờ sinh kỳ của tháng hiện tại.
  if (!options.closeCurrentPeriod) {
    const currentLabel = periodLabelOf(clock.year, clock.month);
    const existingCurrent = await prisma.pcccPeriod.findUnique({ where: { label: currentLabel } });
    if (existingCurrent && result.closed.length > 0) {
      // Kỳ tháng này có sẵn từ trước khi kỳ trước được chốt → nội dung của nó KHÔNG mang
      // theo các sửa đổi cuối cùng của kỳ vừa chốt. Phải nói ra, đừng để lặng lẽ.
      result.warnings.push(
        `Kỳ ${currentLabel} đã tồn tại sẵn nên không được sinh lại từ ${result.closed[result.closed.length - 1].label} — ` +
          `số liệu trong đó là bản có từ trước, hãy đối chiếu lại`
      );
    }

    let latest = (await prisma.pcccPeriod.findFirst({
      where: { OR: [{ year: { lt: clock.year } }, { year: clock.year, monthNo: { lte: clock.month } }] },
      orderBy: [{ year: "desc" }, { monthNo: "desc" }],
    }))!;
    let guard = 0;
    while (latest && monthIndex(latest.year, latest.monthNo) < currentIndex && guard++ < 24) {
      const nextLabel = periodLabelOf(
        latest.monthNo === 12 ? latest.year + 1 : latest.year,
        latest.monthNo === 12 ? 1 : latest.monthNo + 1
      );
      try {
        latest = await createNextPeriodFrom(latest.label);
        result.created.push(latest.label);
      } catch (e) {
        // Có thể là tiến trình khác vừa sinh đúng kỳ này (ràng buộc UNIQUE của nhãn kỳ
        // chặn lại) — vậy thì cứ đi tiếp từ kỳ đó, không coi là lỗi.
        const existing = await prisma.pcccPeriod.findUnique({ where: { label: nextLabel } });
        if (!existing) {
          result.errors.push(`Sinh kỳ ${nextLabel} từ ${latest.label} thất bại: ${(e as Error).message}`);
          break;
        }
        latest = existing;
      }
    }
  }

  // ---- 3) Dọn DB: giữ 6 kỳ gần nhất, chỉ xoá kỳ ĐÃ chốt VÀ ĐÃ có bản lưu trữ
  //
  // Kỳ của tháng CHƯA TỚI không tính vào 6 kỳ: dữ liệu cũ còn sót kỳ sinh sớm, để nó
  // chiếm chỗ thì mỗi kỳ tương lai lại đẩy một tháng thật ra khỏi DB sớm một tháng.
  const remaining = (
    await prisma.pcccPeriod.findMany({
      orderBy: [{ year: "desc" }, { monthNo: "desc" }],
      select: { id: true, label: true, year: true, monthNo: true, isClosed: true, archiveKey: true },
    })
  ).filter((p) => monthIndex(p.year, p.monthNo) <= currentIndex);

  for (const period of remaining.slice(PCCC_DB_KEEP_PERIODS)) {
    if (!period.isClosed || !period.archiveKey) {
      result.keptWithoutArchive.push(period.label);
      continue;
    }
    // deleteMany: tiến trình khác vừa xoá xong thì đây chỉ là 0 dòng, không phải lỗi.
    const removed = await prisma.pcccPeriod.deleteMany({ where: { id: period.id } }); // bảng con xoá theo cascade
    if (removed.count > 0) result.deleted.push(period.label);
  }

  return result;
}

/**
 * Đường chạy TỰ ĐỘNG gắn vào lượt tải trang (route danh sách kỳ gọi hàm này).
 * Nhờ vậy hệ thống vẫn sang kỳ đúng hạn kể cả khi chưa ai cài bộ hẹn giờ — chỉ khác là
 * thời điểm chốt rơi vào lần đầu có người vào trang của tháng mới thay vì 23:xx đêm cuối tháng.
 *
 * Có chặn tần suất trong tiến trình để mỗi lượt tải trang không phải hỏi DB: hằng ngày
 * chỉ một lần chạm tới job, còn lại trả về ngay.
 */
let lastCheckedAt = 0;
let inFlight: Promise<RolloverResult> | null = null;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export async function ensurePcccRollover(): Promise<RolloverResult | null> {
  if (inFlight) return inFlight;
  if (Date.now() - lastCheckedAt < CHECK_INTERVAL_MS) return null;
  lastCheckedAt = Date.now();

  const clock = vietnamClock();
  const currentLabel = periodLabelOf(clock.year, clock.month);
  // Đường nhanh: đã có kỳ của tháng này và không còn kỳ cũ nào bỏ ngỏ → khỏi khoá, khỏi chạy.
  const [current, stale] = await Promise.all([
    prisma.pcccPeriod.findUnique({ where: { label: currentLabel }, select: { id: true } }),
    prisma.pcccPeriod.count({
      where: {
        isClosed: false,
        OR: [{ year: { lt: clock.year } }, { year: clock.year, monthNo: { lt: clock.month } }],
      },
    }),
  ]);
  if (current && stale === 0) return null;

  inFlight = runPcccRollover({ actor: "Hệ thống (tự động)" });
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Tóm tắt một dòng để ghi nhật ký/audit. */
export function describeRollover(result: RolloverResult) {
  const parts = [
    result.closed.length ? `chốt ${result.closed.map((c) => c.label).join(", ")}` : null,
    result.created.length ? `sinh ${result.created.join(", ")}` : null,
    result.deleted.length ? `xoá khỏi DB ${result.deleted.join(", ")}` : null,
    result.keptWithoutArchive.length ? `giữ lại (chưa có bản lưu trữ) ${result.keptWithoutArchive.join(", ")}` : null,
    result.warnings.length ? `lưu ý: ${result.warnings.join(" · ")}` : null,
    result.errors.length ? `lỗi: ${result.errors.join(" · ")}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Không có gì để làm";
}
