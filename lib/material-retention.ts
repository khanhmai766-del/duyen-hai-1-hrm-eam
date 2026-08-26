import type { Prisma, PrismaClient } from "@prisma/client";
import { vietnamCalendarParts } from "@/lib/hc-retention";
import { deleteUsagePhotos } from "@/lib/material-usage-photo";
import { invalidateMaterialAnnualPlanCache } from "@/lib/material-annual-plan-cache";

/**
 * Quy tắc lưu trữ và xoá tự động của mục Quản lý vật tư.
 *
 * KHÔNG có cron trong hệ thống này. Mọi đợt xoá chạy KÉ khi có người mở một trang vật tư,
 * cùng cách nhật ký hoạt động đang làm (app/api/audit/route.ts). Vì vậy mọi quy tắc dưới đây
 * đều viết theo kiểu ĐUỔI KỊP: tính ra "những gì lẽ ra đã phải xoá tính đến hôm nay" chứ không
 * phải "xoá đúng vào ngày X". Bỏ lỡ một tháng không ai truy cập thì lần mở kế tiếp vẫn dọn đủ.
 *
 * Mốc lịch luôn theo giờ Việt Nam — cùng quy ước chốt kỳ với `periodKeyOf` của sổ hóa chất.
 *
 * BẢNG KHÔNG BAO GIỜ BỊ XOÁ THEO LỊCH (cố ý):
 *   - `MaterialReplacementLog`  — lịch sử thay thế, hồ sơ gốc, giữ vĩnh viễn.
 *   - `MaterialReplacement`     — điểm theo dõi tự làm mới: quyết toán xong thì đóng chu kỳ cũ
 *                                 và mở chu kỳ mới (lib/material-ticket-replacement-settlement.ts),
 *                                 còn số điểm đang mở bị chặn không vượt `deviceCount`.
 *   - `Material` / `ErpMaterial` — danh mục, sống theo vòng đời thiết bị.
 *   - `MaterialStockLot`        — lô còn tồn là tài sản thật, xem chú thích ở `purgeMaterialTickets`.
 */

type Db = PrismaClient;

/** Mốc lịch hôm nay theo giờ Việt Nam, tháng đánh số 1..12. */
function vietnamToday(now = new Date()) {
  const parts = vietnamCalendarParts(now);
  return { year: parts.year, month: parts.month + 1, day: parts.day };
}

function periodKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * 1 & 3. Xoá theo năm, GIỮ LẠI THÁNG 12
 * ------------------------------------------------------------------ */

/**
 * Điều kiện chọn kỳ đã hết hạn lưu của sổ hóa chất và nhu cầu vật tư tháng.
 *
 * Sang năm mới thì xoá tháng 01..11 của mọi năm cũ, GIỮ tháng 12. Tháng 12 phải ở lại vì tồn
 * cuối tháng 12 chính là tồn đầu tháng 01 năm sau — bỏ đi là cả năm mới không tính được tiêu hao.
 * Đây cũng đúng vai trò "kỳ mồi" mà `ChemicalInventoryPeriod.isSeed` đã mô tả sẵn.
 *
 * Viết bằng so sánh chuỗi trên `periodKey` ("YYYY-MM") nên dùng được thẳng index.
 */
export function expiredPeriodKeyWhere(now = new Date()): Prisma.StringFilter {
  const { year } = vietnamToday(now);
  return { lt: periodKey(year, 1) };
}

/**
 * Các kỳ đã quá hạn lưu, lọc từ danh sách kỳ đang có thật trong DB.
 *
 * Chỉ tháng 12 của NĂM LIỀN TRƯỚC mới được giữ, vì chỉ nó mới tiếp giáp tháng 01 của năm đang
 * chạy. Tháng 12 của các năm xa hơn đã hết vai trò tồn đầu kỳ ngay khi năm sau nó bị dọn, nên
 * cũng phải đi — không thì mỗi năm bỏ lại một tháng 12 mồ côi, tích mãi.
 */
export function expiredKeysOf(keys: string[], now = new Date()) {
  const year = vietnamToday(now).year;
  const boundary = periodKey(year, 1);
  const keptDecember = periodKey(year - 1, 12);
  return keys.filter((key) => key < boundary && key !== keptDecember);
}

/* ------------------------------------------------------------------ *
 * 5. Xoá phiếu theo quý, trễ 2 tháng sau khi quý đóng
 * ------------------------------------------------------------------ */

/** Quý của một tháng (1..12) → 1..4. */
function quarterOf(month: number) {
  return Math.ceil(month / 3);
}

/**
 * Tháng mà một kỳ phiếu trở nên hết hạn lưu: hết quý rồi cộng thêm 2 tháng.
 *
 *   Quý 1 (tháng 1-3)   → 1/5 cùng năm
 *   Quý 2 (tháng 4-6)   → 1/8 cùng năm
 *   Quý 3 (tháng 7-9)   → 1/11 cùng năm
 *   Quý 4 (tháng 10-12) → 1/2 NĂM SAU
 */
function ticketExpiryMonth(year: number, month: number) {
  const endOfQuarter = quarterOf(month) * 3;
  const raw = endOfQuarter + 2;
  return raw > 12 ? { year: year + 1, month: raw - 12 } : { year, month: raw };
}

/** Kỳ phiếu này đã hết hạn lưu tính đến `now` chưa. */
export function isTicketMonthExpired(sequenceMonth: string, now = new Date()) {
  const [year, month] = sequenceMonth.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return false;
  const expiry = ticketExpiryMonth(year, month);
  const today = vietnamToday(now);
  return today.year > expiry.year || (today.year === expiry.year && today.month >= expiry.month);
}

/* ------------------------------------------------------------------ *
 * Các đợt xoá
 * ------------------------------------------------------------------ */

export type PurgeCounts = Record<string, number>;

/** 1. Sổ tồn kho hóa chất: xoá kỳ + số đọc tồn + phiếu nhập của tháng 01..11 các năm cũ. */
export async function purgeChemicalInventory(prisma: Db, now = new Date()): Promise<PurgeCounts> {
  const periods = await prisma.chemicalInventoryPeriod.findMany({
    where: { periodKey: expiredPeriodKeyWhere(now) },
    select: { periodKey: true },
  });
  const keys = expiredKeysOf(periods.map((row) => row.periodKey), now);
  // Phiếu nhập có thể tồn tại ở kỳ chưa từng lập bảng tồn, nên quét riêng chứ không dựa vào `keys`.
  const receiptPeriods = await prisma.chemicalReceipt.findMany({
    where: { periodKey: expiredPeriodKeyWhere(now) },
    select: { periodKey: true },
    distinct: ["periodKey"],
  });
  const receiptKeys = expiredKeysOf(receiptPeriods.map((row) => row.periodKey), now);
  if (!keys.length && !receiptKeys.length) return {};

  // `ChemicalStockReading.period` là quan hệ Cascade nên số đọc tồn đi theo kỳ, không cần xoá tay.
  // `ChemicalContract` KHÔNG xoá: mỗi năm chỉ một dòng cho mỗi mặt hàng, giữ lại để còn tra
  // sản lượng hợp đồng cũ; phần "đã nhận" của năm đó đương nhiên không còn ý nghĩa sau khi
  // phiếu nhập bị dọn.
  const receipts = receiptKeys.length
    ? await prisma.chemicalReceipt.deleteMany({ where: { periodKey: { in: receiptKeys } } })
    : { count: 0 };
  const removed = keys.length
    ? await prisma.chemicalInventoryPeriod.deleteMany({ where: { periodKey: { in: keys } } })
    : { count: 0 };
  return { chemicalPeriods: removed.count, chemicalReceipts: receipts.count };
}

/**
 * 2. Kế hoạch vật tư năm: giữ năm hiện tại VÀ một năm liền trước.
 *
 * Không xoá thẳng mọi năm cũ vì `getMaterialAnnualForecast(N)` lấy kế hoạch năm N-1 làm gốc tính
 * (lib/material-annual-forecast.ts) — dọn năm N-1 ngay ngày 1/1 là tự tay bỏ đầu vào của dự toán
 * năm đang chạy. Dôi thêm một năm dữ liệu, đổi lại dự toán luôn có gốc.
 */
export async function purgeMaterialAnnualPlans(prisma: Db, now = new Date()): Promise<PurgeCounts> {
  const keepFrom = vietnamToday(now).year - 1;
  const removed = await prisma.materialAnnualPlan.deleteMany({ where: { year: { lt: keepFrom } } });
  if (removed.count > 0) invalidateMaterialAnnualPlanCache();
  return { annualPlans: removed.count };
}

/** 3. Nhu cầu vật tư tháng: xoá tháng 01..11 các năm cũ, giữ tháng 12. */
export async function purgeMaterialMonthlyRequests(prisma: Db, now = new Date()): Promise<PurgeCounts> {
  const rows = await prisma.materialMonthlyRequest.findMany({
    where: { periodKey: expiredPeriodKeyWhere(now) },
    select: { periodKey: true },
    distinct: ["periodKey"],
  });
  const keys = expiredKeysOf(rows.map((row) => row.periodKey), now);
  if (!keys.length) return {};
  const removed = await prisma.materialMonthlyRequest.deleteMany({ where: { periodKey: { in: keys } } });
  if (removed.count > 0) invalidateMaterialAnnualPlanCache();
  return { monthlyRequests: removed.count };
}

/** Số phiếu tối đa dọn trong một lượt — giữ cho request đang phục vụ người dùng không bị kéo dài. */
const TICKET_PURGE_BATCH = 200;

/**
 * 5. Theo dõi vật tư: xoá phiếu theo quý, trễ 2 tháng (xem `ticketExpiryMonth`).
 *
 * KHÁC HẲN nút "Xoá phiếu" của người dùng (app/api/material-tickets/[id]/route.ts) ở bốn điểm,
 * vì hai việc có ý nghĩa ngược nhau — nút kia xoá phiếu LẬP NHẦM, còn đây dọn phiếu ĐÃ XONG:
 *
 *   1. KHÔNG hoàn kho. Vật tư đã tiêu thụ thật; gọi `reverseTicketStock` ở đây là bơm khống
 *      tồn kho lên mỗi quý một lần.
 *   2. KHÔNG phát tombstone `MaterialTicketSyncDeletion`. Phát là n8n xoá luôn dòng tương ứng
 *      trên Google Sheet — mà Sheet mới là nơi giữ hồ sơ dài hạn sau khi website đã dọn.
 *   3. KHÔNG dồn lại STT. Dồn số của một tháng đang bị xoá cả cụm là việc thừa, lại còn làm
 *      lệch số hiệu đã in trên biên bản giấy.
 *   4. Phiếu nhập hóa chất chỉ THÁO liên kết, không xoá — kể cả dòng do phiếu vật tư sinh ra.
 *      Sổ hóa chất có nhịp lưu trữ riêng (theo năm, giữ tháng 12); xoá chuyến hàng của quý 1
 *      vào tháng 5 là thủng số liệu của chính năm đang chạy.
 *
 * Phiếu CHƯA quyết toán được bỏ qua và ở lại chờ đợt sau, nên không bao giờ mất việc dở dang.
 *
 * `MaterialStockLot`, `MaterialLotUsage` và `MaterialReplacementLog` trỏ tới phiếu bằng cột
 * `ticketId` THƯỜNG, không phải khóa ngoại — cố ý, giống cách `DefectHistory` sống sót khi phiếu
 * khiếm khuyết bị xoá. Lô còn tồn vẫn là tài sản thật và phải ở lại kho; dòng lịch sử thay thế
 * đã chép sẵn tên thiết bị, số biên bản, số đề xuất nên vẫn đọc được sau khi phiếu biến mất.
 */
export async function purgeMaterialTickets(prisma: Db, now = new Date()): Promise<PurgeCounts> {
  const months = await prisma.materialTicket.findMany({
    select: { sequenceMonth: true },
    distinct: ["sequenceMonth"],
  });
  const expired = months.map((row) => row.sequenceMonth).filter((month) => isTicketMonthExpired(month, now));
  if (!expired.length) return {};

  const pending = await prisma.materialTicket.count({
    where: { sequenceMonth: { in: expired }, settledAt: null },
  });
  const tickets = await prisma.materialTicket.findMany({
    where: { sequenceMonth: { in: expired }, settledAt: { not: null } },
    select: {
      id: true,
      chemicalReceiptIds: true,
      usagePhotoBeforeKey: true,
      usagePhotoAfterKey: true,
      usagePhotoSpecKey: true,
    },
    take: TICKET_PURGE_BATCH,
  });
  if (!tickets.length) return pending > 0 ? { ticketsPending: pending } : {};

  const receiptIds = [...new Set(tickets.flatMap((ticket) => ticket.chemicalReceiptIds))];
  await prisma.$transaction(async (tx) => {
    if (receiptIds.length) {
      await tx.chemicalReceipt.updateMany({
        where: { id: { in: receiptIds } },
        data: { materialTicketId: null },
      });
    }
    // Cascade tự dọn `MaterialTicketItem` và `MaterialTicketReplacement`.
    await tx.materialTicket.deleteMany({ where: { id: { in: tickets.map((ticket) => ticket.id) } } });
  });

  // Ngoài giao dịch: xoá tệp trên S3 không hoàn tác được, mà giao dịch thì có thể rollback.
  // Ảnh liên 3 của LÔ không đụng tới — lô sống lâu hơn phiếu, `purgeSettledLotPhotos` lo phần đó.
  const photosRemoved = await deleteUsagePhotos(
    tickets.flatMap((ticket) => [ticket.usagePhotoBeforeKey, ticket.usagePhotoAfterKey, ticket.usagePhotoSpecKey]),
  ).catch(() => 0);

  return {
    tickets: tickets.length,
    ticketPhotos: photosRemoved,
    ...(pending > 0 ? { ticketsPending: pending } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Bộ điều phối
 * ------------------------------------------------------------------ */

const RUN_INTERVAL_MS = 60 * 60 * 1000;
let lastRunAt = 0;
let inFlight: Promise<PurgeCounts> | null = null;

/**
 * Chạy đủ bốn đợt xoá, nhiều nhất một lượt mỗi giờ.
 *
 * Gọi từ các route ĐỌC của mục vật tư và bọc sẵn try/catch: dọn dẹp hỏng thì tuyệt đối không
 * được chặn người dùng xem dữ liệu. Giữ mốc trong RAM tiến trình nên chỉ đúng khi app chạy một
 * tiến trình (pm2 1 instance) — cùng giả định với `lib/material-annual-plan-cache.ts`.
 */
export function runMaterialRetention(prisma: Db, now = new Date()): Promise<PurgeCounts> {
  if (inFlight) return inFlight;
  if (Date.now() - lastRunAt < RUN_INTERVAL_MS) return Promise.resolve({});
  lastRunAt = Date.now();

  const run = (async () => {
    const counts: PurgeCounts = {};
    for (const step of [
      purgeChemicalInventory,
      purgeMaterialAnnualPlans,
      purgeMaterialMonthlyRequests,
      purgeMaterialTickets,
    ]) {
      try {
        Object.assign(counts, await step(prisma, now));
      } catch (error) {
        // Một đợt hỏng không được kéo theo ba đợt còn lại; lượt sau thử lại.
        console.error(`[luu-tru-vat-tu] ${step.name} lỗi:`, error);
      }
    }
    // Chỉ ghi khi thực sự có xoá. `AuditLog` không dùng được ở đây vì đợt dọn không thuộc về
    // người dùng nào — ghi vào đó là gán nhầm hành vi cho người vô tình mở trang.
    if (Object.keys(counts).length > 0) console.info("[luu-tru-vat-tu] đã dọn:", counts);
    return counts;
  })();

  inFlight = run;
  run.finally(() => {
    inFlight = null;
  });
  return run;
}

/** Nhãn mô tả quy tắc, dùng cho giao diện và tài liệu. */
export const MATERIAL_RETENTION_RULES = [
  { tab: "Tịnh kho hóa chất", rule: "Sang năm mới xoá tháng 01–11 của năm cũ, giữ tháng 12 làm tồn đầu kỳ." },
  { tab: "Kế hoạch vật tư năm", rule: "Giữ năm hiện tại và một năm liền trước (năm liền trước là gốc tính dự toán)." },
  { tab: "Nhu cầu vật tư tháng", rule: "Sang năm mới xoá tháng 01–11 của năm cũ, giữ tháng 12." },
  { tab: "Lịch thay thế vật tư", rule: "Không xoá theo lịch: điểm theo dõi tự gia hạn sau mỗi lần quyết toán." },
  { tab: "Theo dõi vật tư", rule: "Xoá phiếu đã quyết toán theo quý, trễ 2 tháng: tháng 5 xoá quý 1, tháng 8 xoá quý 2, tháng 11 xoá quý 3, tháng 2 năm sau xoá quý 4." },
  { tab: "Lịch sử thay thế", rule: "Giữ vĩnh viễn." },
] as const;
