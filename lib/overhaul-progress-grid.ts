// Tiến độ đại tu dạng bảng như 4 file Sheet — phần dùng chung server/client (không import prisma).
// Bộ ghi Sheet (lib/server/overhaul-sheet-writer.ts) và trang /tien-ich/tien-do-dai-tu dùng CÙNG các quy tắc ở đây
// nên web và Sheet luôn hiện giống nhau.
import { OVERHAUL_DAY_STATUSES } from "@/lib/work-permit-overhaul";

/**
 * Mức ưu tiên trong CÙNG một ngày (hai PCT có thể cùng giữ một hạng mục): "Không mở ngày thực hiện" < "Không thực hiện"
 * < có làm / kết thúc — phiếu không làm không đè phiếu có làm.
 */
export const overhaulStatusPriority = (status: string) => status === OVERHAUL_DAY_STATUSES.NOT_OPENED ? 0 : status === OVERHAUL_DAY_STATUSES.SKIPPED ? 1 : 2;

/** Hạng của một kết quả = "yyyy-mm-dd|ưu tiên|ms" (so chuỗi đúng thứ tự): ngày sau thắng, rồi ưu tiên, rồi lúc xếp hàng. */
export const overhaulRank = (day: string, at: Date, status: string) => `${day}|${overhaulStatusPriority(status)}|${String(at.getTime()).padStart(15, "0")}`;

/** Dòng chốt phiếu (kết thúc / huỷ) — nối SAU nội dung làm việc của PCT, không thay nó. */
const FINAL_NOTE_KINDS = new Set(["CLOSE", "CANCEL"]);

/**
 * Nội dung ô Nhật ký ngày của MỘT hạng mục trong MỘT ngày: mỗi PCT một đoạn (nội dung làm việc mới nhất của PCT đó, rồi
 * dòng kết thúc / huỷ phiếu nếu có), đoạn xếp theo lần đầu PCT cập nhật trong ngày, cách nhau một dòng trống. Hạng mục
 * phối hợp → PCT Cơ và PCT Điện mỗi bên một đoạn; PCT không cập nhật ngày đó không có đoạn.
 */
export function overhaulJournalText(notes: Array<{ permitId: string; kind: string; note: string; createdAt: Date }>, permitNumbers: Map<string, string>) {
  type Entry = { first: number; work?: { at: number; note: string }; final?: { at: number; note: string } };
  const byPermit = new Map<string, Entry>();
  for (const note of notes) {
    if (!note.note) continue;
    const at = note.createdAt.getTime();
    const entry = byPermit.get(note.permitId) ?? { first: at };
    entry.first = Math.min(entry.first, at);
    const slot = FINAL_NOTE_KINDS.has(note.kind) ? "final" : "work";
    if (!entry[slot] || at >= entry[slot]!.at) entry[slot] = { at, note: note.note };
    byPermit.set(note.permitId, entry);
  }
  return [...byPermit].sort((a, b) => a[1].first - b[1].first).map(([permitId, entry]) => {
    const number = permitNumbers.get(permitId);
    // Nội dung từ form mới đã mở đầu bằng "PCT <số> - <nội dung>" → không thêm dòng số PCT lần nữa.
    const headed = entry.work?.note.startsWith("PCT ") ?? false;
    return [number && !headed ? `PCT ${number}` : "", entry.work?.note ?? "", entry.final?.note ?? ""].filter(Boolean).join("\n");
  }).join("\n\n");
}

/** Một lần web ghi kết quả cho hạng mục (dòng hàng đợi ghi Sheet). */
export type OverhaulProgressRow = { code: string; permitId: string; kind: string; day: string; status: string; percent: number | null; note: string; createdAt: Date };
/** Dòng chỉ dùng để tính "Trạng thái hiện tại" / "% Hoàn thành" trên toàn đợt — không cần nội dung nhật ký. */
export type OverhaulSummaryRow = Pick<OverhaulProgressRow, "code" | "day" | "status" | "percent" | "createdAt">;
export type OverhaulGridItem = {
  code: string; device: string; content: string; contractor: string; positionTitle: string;
  /** % đọc từ cột "% Hoàn thành" trên Sheet ở lần đồng bộ gần nhất — dùng khi web chưa ghi % cho hạng mục. */
  sheetPercent?: number | null;
};

/** Ô "% Hoàn thành" của Sheet (giá trị hiển thị: "35%", "35,5%", "0.35", "35") → số 0–100; trống/không đọc được → null. */
export function parseSheetPercent(value: string | null | undefined) {
  const text = (value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (!text) return null;
  const number = Number(text.replace(/%$/, ""));
  if (!Number.isFinite(number)) return null;
  const percent = text.endsWith("%") ? number : number <= 1 ? number * 100 : number;
  return Math.min(100, Math.max(0, Math.round(percent * 10) / 10));
}

/**
 * 4 thẻ tổng hợp đầu tab — CÙNG công thức với hàng tổng hợp trên Sheet (lib/server/overhaul-sheet-writer.ts normaliseTab):
 *  - Tổng số hạng mục  = số hạng mục của tab;
 *  - Đã hoàn thành     = COUNTIF(% ≥ 100%);
 *  - Đang thực hiện    = COUNTIFS(% > 0, % < 100%);
 *  - % Tiến độ         = SUM(%) / Tổng (hạng mục chưa có % tính 0).
 */
export function overhaulKpis(rows: Array<Pick<OverhaulGridRow, "percent">>) {
  const total = rows.length;
  const percents = rows.map(row => row.percent ?? 0);
  return {
    total,
    done: percents.filter(percent => percent >= 100).length,
    inProgress: percents.filter(percent => percent > 0 && percent < 100).length,
    progress: total ? percents.reduce((sum, percent) => sum + percent, 0) / total : 0,
  };
}
/** `more` = nhật ký đã cắt gọn cho bảng; bấm ô mới tải bản đầy đủ. */
export type OverhaulGridDay = { status: string; journal: string; more?: boolean };
/**
 * Độ dài nhật ký gửi kèm bảng (bản đầy đủ tải riêng khi bấm ô) — giữ dữ liệu tải về nhỏ khi nhật ký ngày càng nhiều.
 * Ô nhật ký trên bảng chỉ hiện 4 dòng ≈ 80 ký tự.
 */
export const OVERHAUL_JOURNAL_PREVIEW = 80;
export type OverhaulGridRow = OverhaulGridItem & {
  /** % lũy kế chung (số cao nhất web đã ghi); web chưa ghi → % trên Sheet lúc đồng bộ; không có cả hai → null. */
  percent: number | null;
  status: string;
  /** Hạng mục đã từng có PCT ghi kết quả. */
  hasPermit: boolean;
  days: Record<string, OverhaulGridDay>;
};

/** Ô ngày của một hạng mục từ mọi dòng của đúng ngày đó: trạng thái thắng theo `overhaulRank` + nhật ký từng PCT. */
export function overhaulDayCell(dayRows: OverhaulProgressRow[], permitNumbers: Map<string, string>): OverhaulGridDay {
  const winner = dayRows.reduce((a, b) => overhaulRank(b.day, b.createdAt, b.status) >= overhaulRank(a.day, a.createdAt, a.status) ? b : a);
  return { status: winner.status, journal: overhaulJournalText(dayRows, permitNumbers) };
}

/**
 * Bảng tiến độ của một tab: mỗi hạng mục → ô từng ngày (trạng thái thắng theo `overhaulRank` + nhật ký từng PCT),
 * "Trạng thái hiện tại" = kết quả hạng cao nhất mọi ngày, "% Hoàn thành" = số cao nhất. Hạng mục chưa có dòng nào →
 * "Chưa thực hiện".
 *
 * Tải nhẹ khi nhật ký nhiều lên: `rows` chỉ cần các ngày đang xem (cửa sổ ngày); `summaryRows` = mọi ngày nhưng không cần
 * nhật ký (mặc định = `rows`); `previewLength` cắt gọn nhật ký trong bảng (`more` = còn nữa, bấm ô để tải đủ).
 */
export function buildOverhaulGrid(items: OverhaulGridItem[], rows: OverhaulProgressRow[], permitNumbers: Map<string, string>,
  options: { summaryRows?: OverhaulSummaryRow[]; previewLength?: number } = {}): OverhaulGridRow[] {
  const group = <T extends { code: string }>(list: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of list) { const bucket = map.get(row.code); if (bucket) bucket.push(row); else map.set(row.code, [row]); }
    return map;
  };
  const byCode = group(rows), summaryByCode = options.summaryRows ? group(options.summaryRows) : byCode;
  return items.map(item => {
    let best = "", status: string = OVERHAUL_DAY_STATUSES.NOT_STARTED, percent: number | null = null;
    const summary = summaryByCode.get(item.code) ?? [];
    for (const row of summary) {
      const rank = overhaulRank(row.day, row.createdAt, row.status);
      if (rank >= best) { best = rank; status = row.status; }
      if (row.percent !== null) percent = Math.max(percent ?? 0, row.percent);
    }
    const byDay = new Map<string, OverhaulProgressRow[]>();
    for (const row of byCode.get(item.code) ?? []) { const bucket = byDay.get(row.day); if (bucket) bucket.push(row); else byDay.set(row.day, [row]); }
    const days: Record<string, OverhaulGridDay> = {};
    for (const [day, dayRows] of byDay) {
      const cell = overhaulDayCell(dayRows, permitNumbers);
      const limit = options.previewLength;
      days[day] = limit && cell.journal.length > limit ? { ...cell, journal: `${cell.journal.slice(0, limit).trimEnd()}…`, more: true } : cell;
    }
    // Web chưa ghi % → giữ đúng số đang có trên Sheet, để thẻ tổng hợp web và hàng tổng hợp Sheet ra cùng con số.
    return { ...item, percent: percent ?? item.sheetPercent ?? null, status, hasPermit: summary.length > 0, days };
  });
}
