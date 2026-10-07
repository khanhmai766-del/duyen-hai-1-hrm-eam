import { Prisma, type OverhaulSheetOutbox, type WorkPermit, type WorkPermitSession } from "@prisma/client";
import { normalizeText } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import { a1Tab, batchGetValues, batchUpdateSpreadsheet, batchUpdateValues, columnLetter, getProtectedRanges, getSheetFormatting, getSpreadsheet, getValidationGrid, GoogleSheetsError, serviceAccountEmail, spreadsheetIdFromUrl, type ConditionalFormat, type GridRange, type SheetTab } from "@/lib/server/google-sheets";
import { overhaulScheduleLinks } from "@/lib/server/overhaul-schedules";
import { findHeader, overhaulItemUsage, repairDateCode } from "@/lib/server/work-permit-overhaul";
import { overhaulJournalText, overhaulRank } from "@/lib/overhaul-progress-grid";
import { isOverhaulExtraCode, OVERHAUL_CODE_PATTERN, OVERHAUL_DAY_STATUSES, OVERHAUL_HOLDING_STATUSES, OVERHAUL_SOURCES, overhaulItemKey, overhaulItemsOf, type OverhaulItemProgress, type OverhaulSource } from "@/lib/work-permit-overhaul";

/*
 * Đợt 2 đại tu — ghi kết quả ngày của PCT về Google Sheets tiến độ (web là nguồn, Sheet theo web).
 *
 * Thao tác trên phiếu chỉ GHI HÀNG ĐỢI (OverhaulSheetOutbox) trong cùng transaction; việc gọi Google chạy sau, nên Google
 * lỗi/chậm không chặn người dùng kết thúc ngày. Hàng đợi được đẩy: ngay sau thao tác (after()), timer 15 phút và job 16:00.
 *
 * QUY TẮC GHI (theo cấu trúc file thật, 02/10/2026 — xem docs/dai-tu-google-sheets.md):
 *  - Mỗi hạng mục = 2 hàng gộp: hàng trên có Mã, "% Hoàn thành", "Trạng thái hiện tại" và ô trạng thái từng ngày;
 *    hàng dưới là "Nhật ký ngày". Hàng tìm theo MÃ ở mỗi lần ghi (người dùng có thể chèn/xoá hàng).
 *  - Cột ngày tìm theo "dd/mm" trong tiêu đề "Ngày n\ndd/mm"; cột %/trạng thái theo tên tiêu đề (vị trí khác nhau giữa tab).
 *  - Không tìm thấy tab/mã/cột ngày → báo lỗi rõ, KHÔNG đoán ghi sang chỗ khác. Mã trùng hai lần trong tab cũng báo lỗi.
 *  - Nhật ký ngày: mỗi PCT có cập nhật trong ngày một đoạn "PCT <số>/<năm>" + xuống dòng + nội dung lần cập nhật mới nhất
 *    của PCT đó (hạng mục phối hợp: PCT Cơ + PCT Điện cùng giữ → hai đoạn; PCT không cập nhật ngày đó không có đoạn).
 *    Cả ô được dựng lại mỗi lần ghi — chữ người khác gõ tay trong ô ngày đó sẽ bị thay.
 *  - Ô "Trạng thái hiện tại" bị ghi đè bằng giá trị (bỏ công thức cũ) — chỉ khi đây là kết quả mới nhất. Ô "% Hoàn thành"
 *    là lũy kế CHUNG của hạng mục: chỉ ghi khi bằng/cao hơn số đã ghi, không bao giờ kéo lùi (hai PCT kết thúc gần nhau).
 */

const MAX_ATTEMPTS = 8;
const BASE_RETRY_MS = 15 * 60_000;
const MAX_RETRY_MS = 24 * 3600_000;
const STALE_CLAIM_MS = 10 * 60_000;
const BATCH_LIMIT = 500;
/** Google báo vượt hạn mức/phút (429): hạn mức tính theo phút, chờ hơn 1 phút rồi gọi lại — không tính là một lần lỗi. */
const RATE_LIMIT_RETRY_MS = 70_000;
/** Một tiến trình đẩy tại một thời điểm (khoá tư vấn Postgres) — người đến sau chờ tối đa ngần này rồi tự nhận lượt. */
const LOCK_WAIT_MS = 90_000;
const LOCK_POLL_MS = 3_000;
/** Chờ ngắn trước lô đầu để gom các lần kết thúc bấm gần nhau thành một lượt gọi Google. */
const GATHER_MS = 2_000;
/** Một lượt giữ khoá đẩy tối đa chừng này (kể cả chờ hạn mức) rồi nhả cho timer. */
const DRAIN_MS = 10 * 60_000;
const VN_OFFSET_MS = 7 * 3600_000;

/** Ngày Việt Nam yyyy-mm-dd của một thời điểm. */
export function vnDay(at: Date) {
  return new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}
/** [đầu ngày, đầu ngày hôm sau) theo giờ Việt Nam, dạng UTC. */
export function vnDayRange(day: string) {
  const start = new Date(`${day}T00:00:00+07:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}
const vnTime = (at: Date) => new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(11, 16);

type OutboxInput = Omit<Prisma.OverhaulSheetOutboxCreateManyInput, "id" | "state" | "attemptCount" | "nextAttemptAt" | "createdAt" | "updatedAt">;

async function enqueue(tx: Prisma.TransactionClient, rows: OutboxInput[]) {
  if (rows.length) await tx.overhaulSheetOutbox.createMany({ data: rows, skipDuplicates: true });
}

const itemTail = (item: { source: string; sheet: string; code: string }) => `${item.source}:${item.sheet}:${item.code}`;

/** Dòng Nhật ký ngày: ghi chú của hạng mục, trống thì lấy ghi chú chung của lần làm việc. */
const journalLine = (at: Date, commander: string, item: OverhaulItemProgress, generalNote: string) =>
  `${vnTime(at)} · ${commander}: ${item.note.trim() || generalNote.trim() || "Có thực hiện"} (${item.percent ?? 0}%)`;

/**
 * Kết thúc lần làm việc: mục có thực hiện → Đang thực hiện + % + nhật ký; mục không thực hiện → Không thực hiện.
 * `doneToday`: mục đã "Cập nhật tiến độ" trong chính lần làm việc này, cùng ngày kết thúc — không tick lại lúc kết
 * thúc vẫn là Đang thực hiện (không ghi thêm % / nhật ký).
 */
export async function enqueueOverhaulSessionEnd(tx: Prisma.TransactionClient, permit: Pick<WorkPermit, "id">, session: Pick<WorkPermitSession, "id" | "commanderName">, endedAt: Date, items: OverhaulItemProgress[], generalNote = "", doneToday: Set<string> = new Set()) {
  const day = vnDay(endedAt);
  await enqueue(tx, items.map(item => ({
    dedupeKey: `S:${session.id}:${itemTail(item)}`,
    permitId: permit.id, sessionId: session.id, kind: "SESSION_END",
    source: item.source, sheet: item.sheet, code: item.code, day,
    status: item.done || doneToday.has(itemTail(item)) ? OVERHAUL_DAY_STATUSES.IN_PROGRESS : OVERHAUL_DAY_STATUSES.SKIPPED,
    percent: item.done ? item.percent : null,
    note: item.done ? journalLine(endedAt, session.commanderName, item, generalNote) : "",
  })));
}

/** Cập nhật tiến độ giữa chừng (lần làm việc còn mở): chỉ mục có tick → Đang thực hiện + % + nhật ký của ngày cập nhật. */
export async function enqueueOverhaulProgressUpdate(tx: Prisma.TransactionClient, permit: Pick<WorkPermit, "id">, session: Pick<WorkPermitSession, "id" | "commanderName">, at: Date, items: OverhaulItemProgress[], generalNote = "") {
  const day = vnDay(at);
  await enqueue(tx, items.filter(item => item.done).map(item => ({
    dedupeKey: `U:${session.id}:${at.getTime()}:${itemTail(item)}`,
    permitId: permit.id, sessionId: session.id, kind: "PROGRESS",
    source: item.source, sheet: item.sheet, code: item.code, day,
    status: OVERHAUL_DAY_STATUSES.IN_PROGRESS, percent: item.percent,
    note: journalLine(at, session.commanderName, item, generalNote),
  })));
}

/**
 * Cập nhật tiến độ NGOÀI lần làm việc (phiếu đã cấp / chờ làm tiếp / đã kết thúc): mục có tick → trạng thái người cập nhật
 * chọn (Đang thực hiện / Kết thúc công tác) + % + nhật ký ở ngày cập nhật. Không có lần làm việc nên % lũy kế đọc lại từ
 * chính các dòng này (sharedOverhaulPercents).
 */
export async function enqueueOverhaulManualProgress(tx: Prisma.TransactionClient, permit: Pick<WorkPermit, "id">, actorName: string, at: Date, items: OverhaulItemProgress[], generalNote: string, status: string) {
  const day = vnDay(at);
  await enqueue(tx, items.filter(item => item.done).map(item => ({
    dedupeKey: `M:${permit.id}:${at.getTime()}:${itemTail(item)}`,
    permitId: permit.id, kind: "MANUAL",
    source: item.source, sheet: item.sheet, code: item.code, day,
    status, percent: item.percent,
    note: journalLine(at, actorName, item, generalNote),
  })));
}

/** Khoá so hạng mục giữa itemProgress và hàng đợi. */
export const overhaulProgressKey = itemTail;

/**
 * Kết thúc phiếu → "Kết thúc công tác" ở ngày đóng phiếu; % giữ số lần gần nhất. Hạng mục còn nằm trong PCT khác đang
 * hiệu lực (hạng mục phối hợp Cơ + Điện) thì bỏ qua — phần việc bên kia chưa xong; PCT giữ cuối cùng kết thúc mới ghi.
 */
export async function enqueueOverhaulClose(tx: Prisma.TransactionClient, permit: Pick<WorkPermit, "id" | "overhaulItems" | "contractorScope" | "teamType">, closedAt: Date) {
  if (permit.teamType !== "CONTRACTOR" || permit.contractorScope !== "OVERHAUL") return;
  const day = vnDay(closedAt);
  const { held } = await overhaulItemUsage(tx, permit.id);
  await enqueue(tx, overhaulItemsOf(permit.overhaulItems).filter(item => !held.get(overhaulItemKey(item))?.length).map(item => ({
    dedupeKey: `C:${permit.id}:${itemTail(item)}`,
    permitId: permit.id, kind: "CLOSE", source: item.source, sheet: item.sheet, code: item.code, day,
    status: OVERHAUL_DAY_STATUSES.CLOSED, percent: null, note: `${vnTime(closedAt)} · Kết thúc phiếu`,
  })));
}

/**
 * Huỷ PCT đã cấp (nghiệp vụ 05/10/2026): hạng mục mà PCT này là phiếu giữ CUỐI CÙNG → chốt kết quả cuối đã ghi nhận như kết
 * thúc phiếu ("Kết thúc công tác", % giữ số lần gần nhất) kèm nhật ký "PCT hủy do <lý do>". Hạng mục còn PCT khác giữ → bỏ
 * qua (bên kia chốt khi kết thúc). Hạng mục chưa từng ghi gì lên Sheet → bỏ qua, Sheet giữ "Chưa thực hiện".
 */
export async function enqueueOverhaulCancel(tx: Prisma.TransactionClient, before: Pick<WorkPermit, "status">, permit: Pick<WorkPermit, "id" | "overhaulItems" | "contractorScope" | "teamType">, cancelledAt: Date, reason: string) {
  if (permit.teamType !== "CONTRACTOR" || permit.contractorScope !== "OVERHAUL") return false;
  if (!(OVERHAUL_HOLDING_STATUSES as readonly string[]).includes(before.status)) return false;
  const { held } = await overhaulItemUsage(tx, permit.id);
  const items = overhaulItemsOf(permit.overhaulItems).filter(item => !held.get(overhaulItemKey(item))?.length);
  if (!items.length) return false;
  const recorded = new Set((await tx.overhaulSheetOutbox.findMany({
    where: { OR: items.map(item => ({ source: item.source, sheet: item.sheet, code: item.code })) },
    distinct: ["source", "sheet", "code"], select: { source: true, sheet: true, code: true },
  })).map(itemTail));
  const day = vnDay(cancelledAt);
  const rows = items.filter(item => recorded.has(itemTail(item))).map(item => ({
    dedupeKey: `X:${permit.id}:${itemTail(item)}`,
    permitId: permit.id, kind: "CANCEL", source: item.source, sheet: item.sheet, code: item.code, day,
    status: OVERHAUL_DAY_STATUSES.CLOSED, percent: null, note: `${vnTime(cancelledAt)} · PCT hủy do ${reason.replace(/\s+/g, " ").trim()}`,
  }));
  await enqueue(tx, rows);
  return rows.length > 0;
}

/**
 * Job 16:00: PCT đại tu còn hiệu lực mà trong ngày không có lần làm việc nào → "Không mở ngày thực hiện" cho mọi hạng
 * mục. Bỏ phiếu chưa tới ngày bắt đầu dự kiến hoặc đã quá hạn (quá hạn phải kết thúc phiếu). Chạy lại không ghi đôi.
 */
export async function enqueueOverhaulNoSessionDay(day: string) {
  const { start, end } = vnDayRange(day);
  const permits = await prisma.workPermit.findMany({
    where: {
      teamType: "CONTRACTOR", contractorScope: "OVERHAUL", status: { in: [...OVERHAUL_HOLDING_STATUSES] },
      issuedAt: { lt: end },
      AND: [
        { OR: [{ plannedStartAt: null }, { plannedStartAt: { lt: end } }] },
        { OR: [{ plannedEndAt: null }, { plannedEndAt: { gte: start } }] },
      ],
      sessions: { none: { openedAt: { lt: end }, OR: [{ endedAt: null }, { endedAt: { gte: start } }] } },
    },
    select: { id: true, overhaulItems: true },
  });
  const rows = permits.flatMap(permit => overhaulItemsOf(permit.overhaulItems).map(item => ({
    dedupeKey: `N:${permit.id}:${day}:${itemTail(item)}`,
    permitId: permit.id, kind: "NO_SESSION", source: item.source, sheet: item.sheet, code: item.code, day,
    status: OVERHAUL_DAY_STATUSES.NOT_OPENED, percent: null, note: "",
  })));
  await prisma.$transaction(tx => enqueue(tx, rows));
  return { permits: permits.length, rows: rows.length };
}

// ───────────────────────────── Đọc vị trí trên Sheet ─────────────────────────────

type TabLayout = {
  codeRow: Map<string, number>;
  duplicateCodes: Set<string>;
  /** "dd/mm" → chỉ số cột */
  dayColumn: Map<string, number>;
  /** "dd/mm" xuất hiện ở hai cột (tiêu đề chép nhầm) — không ghi vào ngày đó cho tới khi sửa. */
  duplicateDays: Set<string>;
  /** Mọi cột "Ngày n" theo thứ tự trái → phải. */
  dayColumns: number[];
  headerRow: number;
  percentColumn: number;
  statusColumn: number;
  codeColumn: number;
  rows: string[][];
};

const dayKey = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

function layoutOf(rows: string[][]): TabLayout | string {
  const header = findHeader(rows);
  if (!header) return "không thấy hàng tiêu đề có ô “Mã hạng mục”";
  const dayColumn = new Map<string, number>();
  const duplicateDays = new Set<string>();
  const dayColumns: number[] = [];
  rows[header.row].forEach((cell, index) => {
    if (!/^ngay \d+/.test(normalizeText(cell).trim())) return;
    dayColumns.push(index);
    const match = /(\d{1,2})\s*\/\s*(\d{1,2})/.exec(cell);
    if (!match) return;
    const key = `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}`;
    if (dayColumn.has(key)) duplicateDays.add(key); else dayColumn.set(key, index);
  });
  if (!dayColumn.size) return "tab không có cột “Ngày n”";
  const codeRow = new Map<string, number>();
  const duplicateCodes = new Set<string>();
  for (let r = header.row + 1; r < rows.length; r++) {
    const code = repairDateCode((rows[r][header.columns.code] ?? "").replace(/\s+/g, " ").trim()).toUpperCase();
    if (!code || !OVERHAUL_CODE_PATTERN.test(code)) continue;
    if (codeRow.has(code)) duplicateCodes.add(code); else codeRow.set(code, r);
  }
  return { codeRow, duplicateCodes, dayColumn, duplicateDays, dayColumns, headerRow: header.row, percentColumn: header.columns.percent, statusColumn: header.columns.status, codeColumn: header.columns.code, rows };
}

/** Một hàng đợi → các ô cần ghi, hoặc câu lỗi. */
function locate(layout: TabLayout, row: OverhaulSheetOutbox) {
  if (layout.duplicateCodes.has(row.code)) return `mã ${row.code} xuất hiện nhiều lần trong tab “${row.sheet}”`;
  const r = layout.codeRow.get(row.code);
  if (r === undefined) return `không tìm thấy mã ${row.code} trong tab “${row.sheet}”`;
  if (layout.duplicateDays.has(dayKey(row.day))) return `tab “${row.sheet}” có hai cột cùng ngày ${dayKey(row.day)} (tiêu đề chép nhầm) — chạy “npm run overhaul:sheet -- --setup --apply” để chuẩn hoá`;
  const column = layout.dayColumn.get(dayKey(row.day));
  if (column === undefined) return `tab “${row.sheet}” không có cột ngày ${dayKey(row.day)}`;
  const journalRow = r + 1;
  // Hàng nhật ký = hàng ngay dưới, ô mã trống (gộp với hàng trên). Có mã = tab không theo cặp 2 hàng → bỏ nhật ký.
  const journalOk = !(layout.rows[journalRow]?.[layout.codeColumn] ?? "").trim();
  return { r, column, journalRow: journalOk ? journalRow : null };
}

// ───────────────────────────── Đẩy hàng đợi ─────────────────────────────

/** Nhãn mô tả của vùng bảo vệ do app tạo — chạy lại thì xoá đúng các vùng mang nhãn này rồi dựng lại theo hàng hiện tại. */
const PROTECT_TAG = "[dh1-web] Ô do web ghi";

/**
 * Trạng thái hiện tại (07/10/2026): CHỈ KHOÁ cột G "Trạng thái hiện tại" mọi tab hạng mục (chủ file khanh.mdk.tpcduyenhai@gmail.com
 * + tài khoản dịch vụ), khoá A:E của người soạn file giữ nguyên; cột F "% Hoàn thành" và cột ngày từ H để mở cho mọi người
 * (F mở từ 07/10/2026: 20 vùng chung "Khoá F:G" trên 4 file đã đổi thành vùng chỉ cột G, nhãn "· Trạng thái hiện tại").
 * Chạy lại: `--protect --editor <email> --apply` (chỉ khoá G).
 * Khoá các ô web ghi đè (nghiệp vụ 04/10/2026): cột "% Hoàn thành", "Trạng thái hiện tại" (vùng dữ liệu). Từ 06/10/2026
 * KHÔNG khoá ô trạng thái từng ngày nữa (cột "Ngày 1…60", từ cột H) — người dùng nhập tay được; web vẫn ghi đè ô của ngày
 * có PCT cập nhật. Hàng "Nhật ký ngày" để mở như trước.
 * Chỉ tài khoản dịch vụ + `editorEmails` (chủ file luôn sửa được) ghi được vùng khoá.
 * Vùng gắn theo SỐ HÀNG: thêm/bớt hạng mục → chạy lại để khoá đúng chỗ.
 * Không đụng vùng bảo vệ do người khác tạo (chỉ liệt kê trong báo cáo). Mặc định chỉ báo; apply=true mới ghi.
 */
export async function protectOverhaulSheets(apply: boolean, editorEmails: string[]) {
  const sa = serviceAccountEmail();
  if (!sa) throw new GoogleSheetsError("Máy chủ chưa cấu hình tài khoản dịch vụ Google (GOOGLE_SA_KEY_FILE).", 503);
  const editors = [...new Set([sa, ...editorEmails].map(email => email.trim().toLowerCase()).filter(Boolean))];
  const links = await overhaulScheduleLinks();
  const report: string[] = [`Người được sửa vùng khoá: ${editors.join(", ")} (+ chủ file)`];
  for (const source of Object.keys(OVERHAUL_SOURCES) as OverhaulSource[]) {
    const spreadsheetId = spreadsheetIdFromUrl(links.find(link => link.id === source)?.url ?? "");
    if (!spreadsheetId) continue;
    const meta = await getSpreadsheet(spreadsheetId);
    const candidates = meta.tabs.filter(tab => tab.rowCount > 0);
    const values = await batchGetValues(spreadsheetId, candidates.map(tab => `${a1Tab(tab.title)}!A1:${columnLetter(tab.columnCount - 1)}${tab.rowCount}`));
    const existing = await getProtectedRanges(spreadsheetId);
    const requests: object[] = [];
    report.push(`${OVERHAUL_SOURCES[source]} · ${meta.title}`);
    candidates.forEach((tab, i) => {
      const ours = (existing.get(tab.title) ?? []).filter(item => item.description?.startsWith(PROTECT_TAG));
      const others = (existing.get(tab.title) ?? []).filter(item => !item.description?.startsWith(PROTECT_TAG));
      for (const item of ours) requests.push({ deleteProtectedRange: { protectedRangeId: item.protectedRangeId } });
      // Tab nháp "Điện_1" (Máy phát) web không đọc/ghi — không khoá.
      const layout = source === "GENERATOR" && normalizeText(tab.title).trim() === "dien_1" ? "tab nháp" : layoutOf(values[i] ?? []);
      if (typeof layout === "string" || !layout.codeRow.size) {
        if (ours.length) report.push(`  “${tab.title}”: không còn bố cục hạng mục — gỡ ${ours.length} vùng khoá cũ`);
        return;
      }
      const add = (range: GridRange, what: string) => requests.push({ addProtectedRange: { protectedRange: {
        range: { sheetId: tab.sheetId, ...range }, description: `${PROTECT_TAG} · ${what}`, warningOnly: false, editors: { users: editors },
      } } });
      const dataStart = layout.headerRow + 1;
      let count = 0;
      // Cột "% Hoàn thành" KHÔNG khoá nữa (nghiệp vụ 07/10/2026): mọi người nhập % trên Sheet được.
      for (const [column, what] of [[layout.statusColumn, "Trạng thái hiện tại"]] as const) {
        if (column < 0) continue;
        // Không giới hạn hàng cuối: hàng PHÁT SINH chèn thêm sau này vẫn nằm trong vùng khoá.
        add({ startRowIndex: dataStart, startColumnIndex: column, endColumnIndex: column + 1 }, what);
        count++;
      }
      // Ô trạng thái từng ngày (cột "Ngày 1…60") KHÔNG khoá nữa (nghiệp vụ 06/10/2026): người dùng nhập tay được.
      report.push(`  “${tab.title}”: ${layout.codeRow.size} hạng mục → ${count} vùng khoá (${columnLetter(layout.statusColumn)}; cột % ${columnLetter(layout.percentColumn)} và cột ngày để mở)${ours.length ? ` · thay ${ours.length} vùng cũ` : ""}${others.length ? ` · giữ ${others.length} vùng khoá có sẵn của người khác: ${others.map(item => item.description || `#${item.protectedRangeId}`).join("; ")}` : ""}`);
    });
    if (apply) for (let k = 0; k < requests.length; k += 500) await batchUpdateSpreadsheet(spreadsheetId, requests.slice(k, k + 500));
  }
  return report;
}

/**
 * Gỡ MỌI vùng khoá do web tạo (nhãn "[dh1-web] Ô do web ghi …") trên 4 file — nghiệp vụ 06/10/2026: mở cột "% Hoàn thành",
 * "Trạng thái hiện tại" và ô trạng thái ngày cho mọi người nhập tiến độ trên Sheet (đã chạy production 06/10: gỡ 1.821 vùng
 * ô ngày, rồi 38 vùng cột %/Trạng thái). Giữ mọi vùng khoá của người khác (vd A:E — chỉ liệt kê).
 * `only`: chỉ gỡ vùng có nhãn cột đó (vd "% Hoàn thành" — mở cột F ngày 07/10/2026), các vùng web khác giữ nguyên.
 * Không cần danh sách người sửa. Mặc định chỉ báo; apply=true mới ghi. Chạy lại vô hại.
 */
export async function unprotectOverhaulSheets(apply: boolean, only?: string) {
  const mine = (description?: string) => Boolean(description?.startsWith(PROTECT_TAG)) && (!only || description === `${PROTECT_TAG} · ${only}`);
  const links = await overhaulScheduleLinks();
  const report: string[] = [];
  for (const source of Object.keys(OVERHAUL_SOURCES) as OverhaulSource[]) {
    const spreadsheetId = spreadsheetIdFromUrl(links.find(link => link.id === source)?.url ?? "");
    if (!spreadsheetId) { report.push(`${OVERHAUL_SOURCES[source]}: chưa có link — bỏ qua`); continue; }
    const meta = await getSpreadsheet(spreadsheetId);
    const existing = await getProtectedRanges(spreadsheetId);
    const requests: object[] = [];
    report.push(`${OVERHAUL_SOURCES[source]} · ${meta.title}`);
    for (const [title, ranges] of existing) {
      const ours = ranges.filter(item => mine(item.description));
      const keep = ranges.filter(item => !mine(item.description));
      for (const item of ours) requests.push({ deleteProtectedRange: { protectedRangeId: item.protectedRangeId } });
      if (!ours.length && !keep.length) continue;
      report.push(`  “${title}”: gỡ ${ours.length} vùng khoá ${only ? `“${only}”` : "do web tạo"}${keep.length ? ` · giữ ${keep.length}: ${keep.map(item => item.description || `#${item.protectedRangeId}`).join("; ")}` : ""}`);
    }
    if (apply) for (let k = 0; k < requests.length; k += 500) await batchUpdateSpreadsheet(spreadsheetId, requests.slice(k, k + 500));
  }
  return report;
}

/**
 * Mốc giờ cho SQL viết tay. Cột Prisma là `timestamp(3)` KHÔNG múi giờ, lưu giờ UTC; Prisma gửi tham số Date dạng
 * timestamptz nên Postgres đổi theo múi giờ của phiên (DB dev = Asia/Bangkok) → lệch 7 tiếng. Ép về UTC tường minh.
 */
const utc = (at: Date) => Prisma.sql`(${at.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

async function claim(limit: number) {
  const now = new Date();
  const ids = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "OverhaulSheetOutbox" SET "state" = 'PROCESSING', "claimedAt" = ${utc(now)}, "updatedAt" = ${utc(now)}
    WHERE "id" IN (
      SELECT "id" FROM "OverhaulSheetOutbox"
      WHERE ("state" = 'PENDING' AND "nextAttemptAt" <= ${utc(now)})
         OR ("state" = 'PROCESSING' AND "claimedAt" < ${utc(new Date(now.getTime() - STALE_CLAIM_MS))})
      ORDER BY "createdAt" ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
    ) RETURNING "id"`;
  if (!ids.length) return [];
  return prisma.overhaulSheetOutbox.findMany({ where: { id: { in: ids.map(item => item.id) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

async function retryLater(rows: OverhaulSheetOutbox[], error: string) {
  for (const row of rows) {
    const attemptCount = row.attemptCount + 1;
    const failed = attemptCount >= MAX_ATTEMPTS;
    await prisma.overhaulSheetOutbox.update({ where: { id: row.id }, data: {
      state: failed ? "FAILED" : "PENDING", attemptCount, claimedAt: null, lastError: error.slice(0, 1000),
      nextAttemptAt: new Date(Date.now() + Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** (attemptCount - 1))),
    } });
  }
}

/** Hoãn vì hạn mức Google: trả về hàng chờ, KHÔNG tăng số lần thử (hạn mức không phải lỗi dữ liệu). */
async function postpone(rows: OverhaulSheetOutbox[], error: string) {
  if (!rows.length) return;
  await prisma.overhaulSheetOutbox.updateMany({ where: { id: { in: rows.map(row => row.id) } }, data: {
    state: "PENDING", claimedAt: null, lastError: error.slice(0, 1000), nextAttemptAt: new Date(Date.now() + RATE_LIMIT_RETRY_MS),
  } });
}

export type OverhaulPushResult = { claimed: number; written: number; retried: number; failed: number; errors: string[]; disabled?: boolean; rateLimited?: boolean; busy?: boolean; planned?: Array<{ range: string; value: string | number }> };

/**
 * Công tắc ghi: chỉ khi OVERHAUL_SHEET_WRITE=1 (đặt trong .env production khi Sheet đã sẵn sàng). Máy dev dùng chung link
 * 4 file THẬT với production — thiếu công tắc thì hàng đợi vẫn xếp nhưng không ai ghi lên Sheet.
 */
export const overhaulSheetWriteEnabled = () => process.env.OVERHAUL_SHEET_WRITE === "1";

/**
 * Đẩy một lô hàng đợi lên Sheet: mỗi file đọc 1 lần, ghi 1 lần. Lỗi một file không chặn file khác.
 * `dryRun`: chỉ đọc Sheet + tính ô sẽ ghi (trả trong `planned`), không ghi, không đổi trạng thái hàng đợi.
 */
export async function pushOverhaulSheetOutbox(options: { limit?: number; dryRun?: boolean } = {}): Promise<OverhaulPushResult> {
  const { limit = BATCH_LIMIT, dryRun = false } = options;
  const result: OverhaulPushResult = { claimed: 0, written: 0, retried: 0, failed: 0, errors: [], planned: [] };
  if (!dryRun && !overhaulSheetWriteEnabled()) return { ...result, disabled: true };
  const rows = dryRun
    ? await prisma.overhaulSheetOutbox.findMany({ where: { state: "PENDING" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit })
    : await claim(limit);
  result.claimed = rows.length;
  if (!rows.length) return result;
  const links = await overhaulScheduleLinks();
  const bySource = new Map<string, OverhaulSheetOutbox[]>();
  for (const row of rows) bySource.set(row.source, [...(bySource.get(row.source) ?? []), row]);

  const groups = [...bySource];
  for (let g = 0; g < groups.length; g++) {
    const [source, sourceRows] = groups[g];
    const label = OVERHAUL_SOURCES[source as OverhaulSource] ?? source;
    const fail = async (error: string, list = sourceRows) => {
      result.errors.push(`${label}: ${error}${dryRun ? ` (${list.length} dòng)` : ""}`);
      if (dryRun) return;
      await retryLater(list, error);
      for (const row of list) if (row.attemptCount + 1 >= MAX_ATTEMPTS) result.failed++; else result.retried++;
    };
    const spreadsheetId = spreadsheetIdFromUrl(links.find(link => link.id === source)?.url ?? "");
    if (!spreadsheetId) { await fail("bảng Tiến độ đại tu chưa có link file này"); continue; }
    try {
      const meta = await getSpreadsheet(spreadsheetId);
      const tabNames = [...new Set(sourceRows.map(row => row.sheet))];
      const tabs = tabNames.map(name => meta.tabs.find(tab => tab.title === name));
      const present = tabs.filter((tab): tab is SheetTab => Boolean(tab));
      const values = await batchGetValues(spreadsheetId, present.map(tab => `${a1Tab(tab.title)}!A1:${columnLetter(tab.columnCount - 1)}${tab.rowCount}`));
      const layouts = new Map<string, TabLayout | string>();
      tabNames.forEach(name => layouts.set(name, "không còn tab này trong file"));
      present.forEach((tab, i) => layouts.set(tab.title, layoutOf(values[i] ?? [])));

      // Kết quả mới nhất đã ghi — xếp theo NGÀY, rồi MỨC ƯU TIÊN, rồi lúc xếp hàng (overhaulRank, dùng chung với trang
      // /tien-ich/tien-do-dai-tu): job 16:00 chạy bù cho ngày cũ, hay một hàng thử lại muộn, không được đè trạng thái / %
      // của ngày sau; trong cùng ngày phiếu không làm không đè phiếu có làm.
      const rank = overhaulRank;
      const itemKey = (sheet: string, code: string) => `${sheet}\u0000${code}`;
      const bestDay = new Map<string, string>(), bestStatus = new Map<string, string>();
      const keep = (map: Map<string, string>, key: string, value: string) => { if (value >= (map.get(key) ?? "")) { map.set(key, value); return true; } return false; };
      for (const item of await prisma.overhaulSheetOutbox.groupBy({
        by: ["sheet", "code", "day", "status"], where: { source, state: "SUCCESS", sheet: { in: tabNames } }, _max: { createdAt: true },
      })) {
        const value = rank(item.day, item._max.createdAt ?? new Date(0), item.status);
        keep(bestStatus, itemKey(item.sheet, item.code), value);
        keep(bestDay, `${itemKey(item.sheet, item.code)}\u0000${item.day}`, value);
      }
      // % lũy kế chung: số cao nhất đã ghi của hạng mục (mọi PCT) — lô này chỉ ghi khi bằng hoặc vượt lên.
      const bestPercent = new Map((await prisma.overhaulSheetOutbox.groupBy({
        by: ["sheet", "code"], where: { source, state: "SUCCESS", sheet: { in: tabNames }, percent: { not: null } }, _max: { percent: true },
      })).map(item => [itemKey(item.sheet, item.code), item._max.percent ?? 0]));

      const cells = new Map<string, string | number>();
      /** Ô Nhật ký ngày cần dựng lại → hạng mục + ngày. */
      const journalCells = new Map<string, { sheet: string; code: string; day: string }>();
      const ok: OverhaulSheetOutbox[] = [];
      const bad = new Map<string, OverhaulSheetOutbox[]>();
      const ordered = [...sourceRows].sort((a, b) => rank(a.day, a.createdAt, a.status).localeCompare(rank(b.day, b.createdAt, b.status)));
      for (const row of ordered) {
        const layout = layouts.get(row.sheet)!;
        const place = typeof layout === "string" ? `tab “${row.sheet}”: ${layout}` : locate(layout, row);
        if (typeof place === "string" || typeof layout === "string") { const key = String(place); bad.set(key, [...(bad.get(key) ?? []), row]); continue; }
        const value = rank(row.day, row.createdAt, row.status);
        const key = itemKey(row.sheet, row.code);
        const ref = (r: number, c: number) => `${a1Tab(row.sheet)}!${columnLetter(c)}${r + 1}`;
        if (keep(bestDay, `${key}\u0000${row.day}`, value)) cells.set(ref(place.r, place.column), row.status);
        if (keep(bestStatus, key, value) && layout.statusColumn >= 0) cells.set(ref(place.r, layout.statusColumn), row.status);
        if (row.percent !== null && row.percent >= (bestPercent.get(key) ?? 0) && layout.percentColumn >= 0) {
          bestPercent.set(key, row.percent);
          cells.set(ref(place.r, layout.percentColumn), row.percent / 100);
        }
        if (row.note && place.journalRow !== null) journalCells.set(ref(place.journalRow, place.column), { sheet: row.sheet, code: row.code, day: row.day });
        ok.push(row);
      }
      for (const [error, list] of bad) await fail(error, list);
      if (!ok.length) continue;
      // Nhật ký ngày (nghiệp vụ 05/10/2026): dựng lại cả ô từ mọi cập nhật của hạng mục trong ngày — đã ghi + lô này —
      // mỗi PCT một đoạn nội dung mới nhất của PCT đó. Hàng thử lại muộn không đè nội dung mới hơn của cùng PCT.
      if (journalCells.size) {
        const targets = [...journalCells.values()];
        const notes = await prisma.overhaulSheetOutbox.findMany({
          where: {
            source, note: { not: "" }, OR: [{ state: "SUCCESS" }, { id: { in: ok.filter(row => row.note).map(row => row.id) } }],
            sheet: { in: [...new Set(targets.map(t => t.sheet))] }, code: { in: [...new Set(targets.map(t => t.code))] }, day: { in: [...new Set(targets.map(t => t.day))] },
          },
          select: { permitId: true, kind: true, sheet: true, code: true, day: true, note: true, createdAt: true },
        });
        // Dòng đầu mỗi đoạn = "PCT <số>/<năm>" (gọn, bỏ đuôi /VH1-NĐDH cho ô hẹp).
        const permitNumbers = new Map((await prisma.workPermit.findMany({
          where: { id: { in: [...new Set(notes.map(note => note.permitId))] } }, select: { id: true, number: true, year: true },
        })).map(permit => [permit.id, `${permit.number.trim()}/${permit.year}`]));
        for (const [range, target] of journalCells) {
          const text = overhaulJournalText(notes.filter(note => note.sheet === target.sheet && note.code === target.code && note.day === target.day), permitNumbers);
          if (text) cells.set(range, text);
        }
      }
      if (dryRun) { result.planned!.push(...[...cells].map(([range, value]) => ({ range, value }))); result.written += ok.length; continue; }
      await batchUpdateValues(spreadsheetId, [...cells].map(([range, value]) => ({ range, value })));
      await prisma.overhaulSheetOutbox.updateMany({ where: { id: { in: ok.map(row => row.id) } }, data: { state: "SUCCESS", completedAt: new Date(), claimedAt: null, lastError: null } });
      result.written += ok.length;
    } catch (error) {
      const message = error instanceof GoogleSheetsError || error instanceof Error ? error.message : String(error);
      if (error instanceof GoogleSheetsError && error.status === 429) {
        // Hạn mức tính chung cho cả service account: các file còn lại trong lô cũng sẽ bị từ chối — hoãn hết, dừng lô.
        result.rateLimited = true;
        result.errors.push(`${label}: ${message}`);
        if (!dryRun) await postpone(groups.slice(g).flatMap(([, list]) => list), message);
        break;
      }
      // Ô trạng thái còn danh sách thả xuống cũ (Chưa làm/Đang làm/Hoàn thành) và chặn giá trị mới.
      await fail(/validation/i.test(message) ? `${message} — ô ngày còn danh sách trạng thái cũ, chạy “npm run overhaul:sheet -- --setup --apply”` : message);
    }
  }
  return result;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ───────────────────────────── Hạng mục phát sinh (PS.1.x) ─────────────────────────────

export type OverhaulExtraRow = { code: string; device: string; content: string; method: string; contractor: string; positionTitle: string };
const EXTRA_HEADING = "PHÁT SINH";

/**
 * Chèn các hạng mục phát sinh còn thiếu vào CUỐI một tab, dưới hàng tiêu đề "PHÁT SINH" (tạo nếu chưa có) — nghiệp vụ
 * 06/10/2026. Mỗi hạng mục 2 hàng (hàng mã + hàng "Nhật ký ngày") chép nguyên định dạng, ô gộp, danh sách thả xuống từ cặp
 * hàng hạng mục đầu tiên của tab, rồi ghi giá trị mới (ô ngày để trống, % = 0, "Chưa thực hiện"). Mã đã có trên tab thì
 * không chèn lại. Trả vị trí hàng (1-based) của từng mã. `rows` = giá trị hiện tại của tab (A1 → cột cuối).
 */
export async function insertOverhaulExtraRows(spreadsheetId: string, tab: SheetTab, rows: string[][], items: OverhaulExtraRow[]) {
  const layout = layoutOf(rows);
  const header = findHeader(rows);
  if (typeof layout === "string" || !header) throw new GoogleSheetsError(`tab “${tab.title}”: ${typeof layout === "string" ? layout : "không thấy tiêu đề"}`, 422);
  const positions = new Map<string, number>();
  for (const item of items) { const r = layout.codeRow.get(item.code); if (r !== undefined) positions.set(item.code, r + 1); }
  const missing = items.filter(item => !positions.has(item.code));
  if (!missing.length) return positions;

  const { columns } = header;
  const template = Math.min(...[...layout.codeRow].filter(([code]) => !isOverhaulExtraCode(code)).map(([, r]) => r));
  if (!Number.isFinite(template)) throw new GoogleSheetsError(`tab “${tab.title}” chưa có hạng mục nào để làm mẫu`, 422);
  const lastColumn = Math.max(...layout.dayColumns, ...Object.values(columns));
  let lastUsed = layout.headerRow;
  rows.forEach((row, r) => { if (r > layout.headerRow && row.slice(0, lastColumn + 1).some(cell => String(cell ?? "").trim())) lastUsed = r; });
  const hasHeading = rows.some((row, r) => r > layout.headerRow && normalizeText(row[columns.code] ?? "").trim() === normalizeText(EXTRA_HEADING));
  const insertAt = Math.max(lastUsed + 1, template + 2);
  const count = (hasHeading ? 0 : 1) + missing.length * 2;

  const requests: object[] = insertAt < tab.rowCount
    ? [{ insertDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: insertAt, endIndex: insertAt + count }, inheritFromBefore: true } }]
    : [{ appendDimension: { sheetId: tab.sheetId, dimension: "ROWS", length: insertAt + count - tab.rowCount } }];
  const full = (start: number, end: number) => ({ sheetId: tab.sheetId, startRowIndex: start, endRowIndex: end, startColumnIndex: 0, endColumnIndex: lastColumn + 1 });
  const first = insertAt + (hasHeading ? 0 : 1);
  if (!hasHeading) requests.push({ repeatCell: { range: full(insertAt, insertAt + 1), cell: { userEnteredFormat: {
    backgroundColor: { red: 1, green: 0.95, blue: 0.8 }, textFormat: { bold: true }, verticalAlignment: "MIDDLE",
  } }, fields: "userEnteredFormat(backgroundColor,textFormat.bold,verticalAlignment)" } });
  missing.forEach((_, k) => requests.push({ copyPaste: { source: full(template, template + 2), destination: full(first + 2 * k, first + 2 * k + 2), pasteType: "PASTE_NORMAL" } }));
  await batchUpdateSpreadsheet(spreadsheetId, requests);

  const ref = (r: number, c: number) => `${a1Tab(tab.title)}!${columnLetter(c)}${r + 1}`;
  const cells: Array<{ range: string; value: string | number }> = [];
  if (!hasHeading) {
    cells.push({ range: ref(insertAt, columns.code), value: EXTRA_HEADING });
    if (columns.device >= 0) cells.push({ range: ref(insertAt, columns.device), value: "Hạng mục phát sinh (web thêm khi cấp PCT Đại tu)" });
  }
  missing.forEach((item, k) => {
    const r = first + 2 * k;
    for (let c = 0; c <= lastColumn; c++) { cells.push({ range: ref(r, c), value: "" }); cells.push({ range: ref(r + 1, c), value: "" }); }
    const set = (column: number, value: string | number) => { if (column >= 0) cells.push({ range: ref(r, column), value }); };
    set(columns.code, item.code); set(columns.device, item.device); set(columns.content, item.content); set(columns.method, item.method);
    set(columns.contractor, item.contractor); set(columns.position, item.positionTitle); set(columns.percent, 0);
    set(columns.status, OVERHAUL_DAY_STATUSES.NOT_STARTED);
    if (columns.status >= 0) cells.push({ range: ref(r + 1, columns.status), value: "Nhật ký ngày" });
    positions.set(item.code, r + 1);
  });
  // Ô cuối cùng ghi đè ô trống cùng chỗ (Map giữ lần ghi sau cùng).
  await batchUpdateValues(spreadsheetId, [...new Map(cells.map(cell => [cell.range, cell])).values()]);
  return positions;
}

/**
 * Chèn lên Sheet mọi hạng mục phát sinh web đã tạo mà chưa có hàng (sheetRow 0), rồi ghi lại vị trí hàng. Chạy đầu mỗi
 * lượt đẩy hàng đợi (drainOverhaulSheetOutbox, dưới khoá đẩy) — kết quả ngày của hạng mục ghi ngay sau đó. Lỗi một tab
 * không chặn tab khác; lượt sau (sau khi cấp phiếu, timer 15 phút) thử lại.
 */
export async function insertPendingOverhaulExtras() {
  const result = { inserted: 0, errors: [] as string[] };
  const pending = await prisma.workPermitOverhaulItem.findMany({
    where: { isActive: true, sheetRow: 0, code: { startsWith: "PS." } },
    select: { id: true, source: true, sheet: true, code: true, device: true, content: true, method: true, contractor: true, positionTitle: true },
  });
  if (!pending.length) return result;
  const links = await overhaulScheduleLinks();
  for (const source of [...new Set(pending.map(item => item.source))]) {
    const label = OVERHAUL_SOURCES[source as OverhaulSource] ?? source;
    const spreadsheetId = spreadsheetIdFromUrl(links.find(link => link.id === source)?.url ?? "");
    if (!spreadsheetId) { result.errors.push(`${label}: bảng Tiến độ đại tu chưa có link file này`); continue; }
    try {
      const meta = await getSpreadsheet(spreadsheetId);
      for (const sheet of [...new Set(pending.filter(item => item.source === source).map(item => item.sheet))]) {
        const tab = meta.tabs.find(item => item.title === sheet);
        if (!tab) { result.errors.push(`${label}: không còn tab “${sheet}”`); continue; }
        const items = pending.filter(item => item.source === source && item.sheet === sheet);
        const [rows] = await batchGetValues(spreadsheetId, [`${a1Tab(tab.title)}!A1:${columnLetter(tab.columnCount - 1)}${tab.rowCount}`]);
        const unique = [...new Map(items.map(item => [item.code, item])).values()];
        const positions = await insertOverhaulExtraRows(spreadsheetId, tab, rows ?? [], unique);
        for (const item of items) {
          const row = positions.get(item.code);
          if (row) await prisma.workPermitOverhaulItem.update({ where: { id: item.id }, data: { sheetRow: row } });
        }
        result.inserted += unique.length;
      }
    } catch (error) {
      result.errors.push(`${label}: chèn hạng mục phát sinh — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

/**
 * Đẩy HẾT hàng đợi, mỗi thời điểm chỉ MỘT tiến trình (khoá tư vấn Postgres theo transaction — tự nhả khi xong hoặc khi
 * tiến trình chết). Nhiều người bấm Kết thúc cùng lúc: người giữ khoá gom các dòng mới đến thành lô kế tiếp, nên số lượt
 * gọi Google ≈ số lô × số file, không nhân theo số người. Người không lấy được khoá:
 *  - `waitForLock` (sau thao tác trên web): chờ rồi thử lại — tới lượt mà hàng đợi đã sạch thì không gọi Google lần nào;
 *  - không chờ (timer): bỏ qua, trả `busy`.
 * Gặp hạn mức (429): dòng được hoãn ~70 giây, người giữ khoá ngủ qua phút đó rồi đẩy tiếp — không phải đợi timer.
 */
export async function drainOverhaulSheetOutbox(options: { waitForLock?: boolean; gatherMs?: number } = {}): Promise<OverhaulPushResult> {
  const total: OverhaulPushResult = { claimed: 0, written: 0, retried: 0, failed: 0, errors: [] };
  if (!overhaulSheetWriteEnabled()) return { ...total, disabled: true };
  const waitUntil = Date.now() + (options.waitForLock ? LOCK_WAIT_MS : 0);
  for (;;) {
    const ran = await prisma.$transaction(async tx => {
      const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('overhaul-sheet-push')) AS locked`;
      if (!locked) return false;
      if (options.gatherMs) await sleep(options.gatherMs);
      // Hạng mục phát sinh mới cấp phải có hàng trên Sheet TRƯỚC khi ghi kết quả ngày của nó.
      try {
        const extras = await insertPendingOverhaulExtras();
        total.errors.push(...extras.errors);
      } catch (error) {
        total.errors.push(`Chèn hạng mục phát sinh: ${error instanceof Error ? error.message : String(error)}`);
      }
      const deadline = Date.now() + DRAIN_MS;
      while (Date.now() < deadline) {
        const batch = await pushOverhaulSheetOutbox();
        total.claimed += batch.claimed; total.written += batch.written; total.retried += batch.retried; total.failed += batch.failed;
        total.errors.push(...batch.errors);
        if (batch.rateLimited) { total.rateLimited = true; await sleep(RATE_LIMIT_RETRY_MS + 1_000); continue; }
        if (!batch.claimed) break;
      }
      return true;
    }, { maxWait: 10_000, timeout: DRAIN_MS + 3 * 60_000 });
    if (ran) return total;
    if (Date.now() >= waitUntil) return { ...total, busy: true };
    await sleep(LOCK_POLL_MS);
  }
}

/** Gọi sau khi trả lời người dùng: lỗi chỉ ghi log, hàng đợi còn nguyên để timer thử lại. */
export async function pushOverhaulSheetOutboxQuietly() {
  try {
    const result = await drainOverhaulSheetOutbox({ waitForLock: true, gatherMs: GATHER_MS });
    if (result.errors.length) console.warn("[overhaul-sheet] ", result.errors.join(" | "));
  } catch (error) {
    console.warn("[overhaul-sheet] ", error instanceof Error ? error.message : error);
  }
}

// ───────────────────────────── Cấu hình Sheet một lần ─────────────────────────────

const OLD_STATUS_WORDS = ["Chưa làm", "Đang làm", "Hoàn thành"];
/** Ô ngày còn chữ cũ: đổi sang trạng thái mới tương ứng; "Chưa làm" = mặc định → để trống. */
const OLD_DAY_WORD: Record<string, string> = { "Chưa làm": "", "Đang làm": OVERHAUL_DAY_STATUSES.IN_PROGRESS, "Hoàn thành": OVERHAUL_DAY_STATUSES.IN_PROGRESS };
const OLD_FORMULA = /"(Hoàn thành|Đang làm|Chưa làm|Đang thực hiện)"/;

/** Đổi chữ cột trong vùng A1 ("$G$7:$G$92") từ cột trạng thái sang cột % — giữ nguyên dấu $ và số hàng. */
function swapColumn(range: string, from: string, to: string) {
  return range.replace(new RegExp(`(\\$?)${from}(\\$?\\d+)`, "g"), `$1${to}$2`);
}

/**
 * Công thức tổng hợp đầu tab (hàng trên tiêu đề) theo logic web: ĐÃ HOÀN THÀNH = số hạng mục 100%; ĐANG THỰC HIỆN = số
 * hạng mục 1–99%; TỔNG đếm theo chữ cũ → số hàng có trạng thái; % TIẾN ĐỘ = trung bình % các hạng mục. null = giữ nguyên.
 */
function summaryFormula(formula: string, statusLetter: string, percentLetter: string, statusRange: string | null) {
  if (!formula.startsWith("=")) return null;
  const percentRange = statusRange ? swapColumn(statusRange, statusLetter, percentLetter) : null;
  const single = /^=COUNTIF\(([^;()]+);\s*"(Hoàn thành|Đang làm|Đang thực hiện)"\)$/.exec(formula.replace(/\s+/g, " ").trim());
  if (single) {
    const range = swapColumn(single[1].trim(), statusLetter, percentLetter);
    return single[2] === "Hoàn thành" ? `=COUNTIF(${range};">=1")` : `=COUNTIFS(${range};">0";${range};"<1")`;
  }
  // Tổng = Chưa làm + Đang làm + Hoàn thành (tab Turbine) → tổng số hạng mục theo 5 trạng thái mới (cột này còn chữ
  // "Nhật ký ngày" ở hàng nhật ký nên không đếm "ô khác trống").
  if (/COUNTIF\([^)]*"Chưa làm"\)/.test(formula) && statusRange) return `=${Object.values(OVERHAUL_DAY_STATUSES).map(status => `COUNTIF(${statusRange};"${status}")`).join("+")}`;
  // % tiến độ = C3/B3 (tỷ lệ hạng mục xong) → trung bình % hạng mục.
  const ratio = /^=IF\(B(\d+)\s*(>|=)\s*0;\s*(C\d+\/B\d+|0);\s*(C\d+\/B\d+|0)\)$/.exec(formula.replace(/\s+/g, " ").trim());
  if (ratio && percentRange) return `=IF(B${ratio[1]}>0;SUM(${percentRange})/B${ratio[1]};0)`;
  return null;
}

const rgb = (hex: string) => ({ red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 });
/** Bộ màu chung cho 5 trạng thái (cột "Trạng thái hiện tại" + ô ngày) và nhãn "Nhật ký ngày". */
// Mỗi trạng thái một sắc rõ (nền đậm vừa + chữ đậm) — API không cho tô màu từng lựa chọn trong menu thả xuống, nên tô cả ô.
const STATUS_COLORS: Array<[string, string, string]> = [
  [OVERHAUL_DAY_STATUSES.NOT_STARTED, "#e2e8f0", "#334155"], // xám
  [OVERHAUL_DAY_STATUSES.IN_PROGRESS, "#bfdbfe", "#1e3a8a"], // xanh dương
  [OVERHAUL_DAY_STATUSES.SKIPPED, "#fde68a", "#78350f"], // vàng
  [OVERHAUL_DAY_STATUSES.NOT_OPENED, "#fecaca", "#991b1b"], // đỏ
  [OVERHAUL_DAY_STATUSES.CLOSED, "#bbf7d0", "#14532d"], // xanh lá
];
const JOURNAL_LABEL = "Nhật ký ngày";
const JOURNAL_COLOR: [string, string] = ["#fdefd6", "#af590c"];
const STATUS_RULE_WORDS = new Set([...OLD_STATUS_WORDS, ...Object.values(OVERHAUL_DAY_STATUSES), JOURNAL_LABEL]);
const SUMMARY_LABELS = { row2: ["TỔNG SỐ HẠNG MỤC", "ĐÃ HOÀN THÀNH", "ĐANG THỰC HIỆN", "% TIẾN ĐỘ"], start: "Ngày bắt đầu đại tu:", row4: ["Hạng mục xong", "Đang xử lý", "Tiến độ chung"] };
const compact = (formula: string) => formula.replace(/\s+/g, "");
const hex = (color: unknown) => { const c = (color ?? {}) as { red?: number; green?: number; blue?: number }; return [c.red, c.green, c.blue].map(v => Math.round((v ?? 0) * 255)).join(","); };
const ruleSignature = (rules: ConditionalFormat[]) => rules.map(rule => `${rule.booleanRule?.condition?.values?.[0]?.userEnteredValue}:${hex(rule.booleanRule?.format?.backgroundColor)}:${hex(rule.booleanRule?.format?.textFormat?.foregroundColor)}:${(rule.ranges ?? []).map(r => `${r.startRowIndex}-${r.startColumnIndex}-${r.endColumnIndex}`).join(",")}`).sort().join("|");
const covers = (merge: GridRange, row: number, column: number) => (merge.startRowIndex ?? 0) <= row && row < (merge.endRowIndex ?? Infinity) && (merge.startColumnIndex ?? 0) <= column && column < (merge.endColumnIndex ?? Infinity);

/**
 * Chuẩn hoá một tab cho giống mọi tab khác (để web đồng bộ như nhau): tiêu đề "Ngày n" liền mạch theo ô ngày bắt đầu,
 * hàng tổng hợp 2–4 cùng nhãn + công thức (vùng mở "G7:G" — tab dài thêm vẫn đếm đủ), hàng nhật ký đủ nhãn + ô
 * gộp như hàng trên, ô ngày tự xuống dòng, cột % chữ tĩnh → công thức, cùng bộ màu trạng thái. Trả yêu cầu batchUpdate +
 * ô cần ghi (USER_ENTERED) + dòng báo cáo. Chỉ thêm / sửa — không xoá dữ liệu người dùng (ô gộp chỉ khi hàng dưới trống).
 */
function normaliseTab(tab: SheetTab, layout: TabLayout, raw: string[][], formatting: { merges: GridRange[]; conditionalFormats: ConditionalFormat[] } | undefined, title: string) {
  const requests: object[] = [];
  const cells: Array<{ range: string; value: string }> = [];
  const notes: string[] = [];
  const at = (r: number, c: number) => String(raw[r]?.[c] ?? "");
  const ref = (r: number, c: number) => `${a1Tab(tab.title)}!${columnLetter(c)}${r + 1}`;
  const set = (r: number, c: number, value: string, same = (a: string) => a === value) => { if (!same(at(r, c))) cells.push({ range: ref(r, c), value }); };
  const S = columnLetter(layout.statusColumn), P = columnLetter(layout.percentColumn);
  const firstData = layout.headerRow + 2; // số hàng (1-based) của hạng mục đầu tiên

  // Ô ngày bắt đầu: ô ngay sau nhãn "Ngày bắt đầu…" phía trên tiêu đề.
  let startCell: [number, number] | null = null;
  for (let r = 0; r < layout.headerRow && !startCell; r++) (raw[r] ?? []).forEach((cell, c) => { if (!startCell && /^ngay bat dau/.test(normalizeText(String(cell)))) startCell = [r, c + 1]; });
  if (!startCell) notes.push("không thấy ô “Ngày bắt đầu” — bỏ qua tiêu đề ngày + tổng hợp");
  else {
    const [sr, sc] = startCell as [number, number];
    const start = `$${columnLetter(sc)}$${sr + 1}`;
    // Ô ngày bắt đầu luôn là NGÀY (có file gõ dạng chữ "2026-10-01") — tiêu đề "Ngày n" cộng ngày từ ô này.
    requests.push({ repeatCell: { range: { sheetId: tab.sheetId, startRowIndex: sr, endRowIndex: sr + 1, startColumnIndex: sc, endColumnIndex: sc + 1 }, cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } } }, fields: "userEnteredFormat.numberFormat" } });
    // 1. Tiêu đề "Ngày n" theo thứ tự cột.
    let headers = 0;
    layout.dayColumns.forEach((c, k) => {
      const value = `="Ngày ${k + 1}"&CHAR(10)&TEXT(${start}${k ? `+${k}` : ""};"dd/mm")`;
      if (compact(at(layout.headerRow, c)) !== compact(value)) { headers++; cells.push({ range: ref(layout.headerRow, c), value }); }
    });
    if (headers) notes.push(`${headers} tiêu đề ngày`);
    // 2. Hàng tổng hợp (cột B–E hàng start-1…start+1 khi ô ngày bắt đầu ở hàng 2, cạnh nhãn ở F).
    if (sr === 1 && sc === 6) {
      const statusRange = `${S}${firstData}:${S}`, percentRange = `${P}${firstData}:${P}`;
      const row3 = [
        `=${Object.values(OVERHAUL_DAY_STATUSES).map(status => `COUNTIF(${statusRange};"${status}")`).join("+")}`,
        `=COUNTIF(${percentRange};">=1")`,
        `=COUNTIFS(${percentRange};">0";${percentRange};"<1")`,
        `=IF(B3>0;SUM(${percentRange})/B3;0)`,
      ];
      let changed = 0;
      SUMMARY_LABELS.row2.forEach((label, i) => { if (at(1, 1 + i) !== label) { changed++; set(1, 1 + i, label); } });
      if (at(1, 5) !== SUMMARY_LABELS.start) { changed++; set(1, 5, SUMMARY_LABELS.start); }
      row3.forEach((formula, i) => { if (compact(at(2, 1 + i)) !== compact(formula)) { changed++; cells.push({ range: ref(2, 1 + i), value: formula }); } });
      const b4 = at(3, 1);
      if (/toan bo cuong vi/.test(normalizeText(b4))) { changed++; set(3, 1, `Phần ${/[-_\s](co|cơ)\s*$/i.test(title) ? "cơ" : "điện"} ${title.replace(/[\s_\-–—]+(cơ|co|điện|dien)\s*$/i, "").trim()}`); }
      SUMMARY_LABELS.row4.forEach((label, i) => { if (at(3, 2 + i) !== label) { changed++; set(3, 2 + i, label); } });
      requests.push({ repeatCell: { range: { sheetId: tab.sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 4, endColumnIndex: 5 }, cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.0%" } } }, fields: "userEnteredFormat.numberFormat" } });
      if (changed) notes.push(`${changed} ô tổng hợp`);
    } else notes.push(`ô ngày bắt đầu ở ${columnLetter(sc)}${sr + 1} (không phải G2) — bỏ qua tổng hợp`);
  }

  // 3. Hàng nhật ký: nhãn + ô gộp như hàng trên; 4. cột % chữ tĩnh 0 → công thức.
  let labels = 0, merges = 0, percents = 0;
  for (const r of layout.codeRow.values()) {
    const j = r + 1;
    if (!at(j, layout.statusColumn).trim()) { labels++; cells.push({ range: ref(j, layout.statusColumn), value: JOURNAL_LABEL }); }
    for (let c = Math.min(layout.codeColumn, layout.percentColumn); c <= Math.max(layout.codeColumn, layout.percentColumn); c++) {
      if ((formatting?.merges ?? []).some(m => covers(m, r, c) || covers(m, j, c)) || at(j, c).trim()) continue;
      merges++;
      requests.push({ mergeCells: { range: { sheetId: tab.sheetId, startRowIndex: r, endRowIndex: r + 2, startColumnIndex: c, endColumnIndex: c + 1 }, mergeType: "MERGE_ALL" } });
    }
    if (layout.percentColumn >= 0 && at(r, layout.percentColumn).trim() === "0") { percents++; cells.push({ range: ref(r, layout.percentColumn), value: `=IF(${columnLetter(layout.codeColumn)}${r + 1}="";"";0)` }); }
  }
  if (labels) notes.push(`${labels} nhãn nhật ký`);
  if (merges) notes.push(`${merges} ô gộp`);
  if (percents) notes.push(`${percents} ô % tĩnh → công thức`);

  // 5. Ô ngày tự xuống dòng (nhật ký nhiều dòng) — áp cả khối, chạy lại vô hại.
  const firstDay = Math.min(...layout.dayColumns), lastDay = Math.max(...layout.dayColumns);
  requests.push({ repeatCell: { range: { sheetId: tab.sheetId, startRowIndex: layout.headerRow + 1, endRowIndex: tab.rowCount, startColumnIndex: firstDay, endColumnIndex: lastDay + 1 }, cell: { userEnteredFormat: { wrapStrategy: "WRAP", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment" } });
  // Mọi ô vùng hạng mục canh dọc GIỮA (nghiệp vụ 04/10/2026) — kể cả cột mã/nội dung/%/trạng thái bên trái cột ngày.
  if (firstDay > 0) requests.push({ repeatCell: { range: { sheetId: tab.sheetId, startRowIndex: layout.headerRow + 1, endRowIndex: tab.rowCount, startColumnIndex: 0, endColumnIndex: firstDay }, cell: { userEnteredFormat: { verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat.verticalAlignment" } });

  // 6. Màu trạng thái: bỏ quy tắc chữ trạng thái cũ, thêm bộ chung (cột trạng thái + ô ngày).
  const rules = formatting?.conditionalFormats ?? [];
  const statusArea = { sheetId: tab.sheetId, startRowIndex: layout.headerRow + 1, endRowIndex: tab.rowCount, startColumnIndex: layout.statusColumn, endColumnIndex: layout.statusColumn + 1 };
  const dayArea = { sheetId: tab.sheetId, startRowIndex: layout.headerRow + 1, endRowIndex: tab.rowCount, startColumnIndex: firstDay, endColumnIndex: lastDay + 1 };
  const wanted: ConditionalFormat[] = [
    ...STATUS_COLORS.map(([word, bg, fg]) => ({ ranges: [statusArea, dayArea], booleanRule: { condition: { type: "TEXT_EQ", values: [{ userEnteredValue: word }] }, format: { backgroundColor: rgb(bg), textFormat: { foregroundColor: rgb(fg), bold: true } } } })),
    { ranges: [statusArea], booleanRule: { condition: { type: "TEXT_EQ", values: [{ userEnteredValue: JOURNAL_LABEL }] }, format: { backgroundColor: rgb(JOURNAL_COLOR[0]), textFormat: { foregroundColor: rgb(JOURNAL_COLOR[1]) } } } },
  ];
  const ours = rules.map((rule, index) => ({ rule, index })).filter(({ rule }) => rule.booleanRule?.condition?.type === "TEXT_EQ" && STATUS_RULE_WORDS.has(rule.booleanRule.condition.values?.[0]?.userEnteredValue ?? ""));
  if (ruleSignature(ours.map(item => item.rule)) !== ruleSignature(wanted)) {
    for (const { index } of [...ours].sort((a, b) => b.index - a.index)) requests.push({ deleteConditionalFormatRule: { sheetId: tab.sheetId, index } });
    wanted.forEach(rule => requests.push({ addConditionalFormatRule: { rule, index: 0 } }));
    notes.push(`màu trạng thái (${ours.length} quy tắc cũ → ${wanted.length})`);
  }
  return { requests, cells, notes };
}

/**
 * Chuẩn bị Sheet cho đợt 2 (chạy MỘT lần; chạy lại an toàn — ô đã đúng thì bỏ qua). Mỗi tab có cột "Ngày n":
 *  1. Danh sách thả xuống ô ngày → 5 trạng thái mới; ô ngày còn chữ cũ đổi sang chữ mới.
 *  2. Từng hàng hạng mục còn công thức cũ ở "% Hoàn thành" / "Trạng thái hiện tại" → công thức mới: % = 0 (app ghi số
 *     thật khi có PCT); trạng thái = ô ngày gần nhất có chữ, trống thì "Chưa thực hiện". Hàng app đã ghi giá trị: giữ.
 *  3. Công thức tổng hợp đầu tab theo logic web (summaryFormula).
 * Mặc định chỉ BÁO (dry-run); apply=true mới ghi.
 */
export async function setupOverhaulSheets(apply: boolean) {
  const links = await overhaulScheduleLinks();
  const report: string[] = [];
  for (const source of Object.keys(OVERHAUL_SOURCES) as OverhaulSource[]) {
    const spreadsheetId = spreadsheetIdFromUrl(links.find(link => link.id === source)?.url ?? "");
    if (!spreadsheetId) continue;
    const meta = await getSpreadsheet(spreadsheetId);
    const candidates = meta.tabs.filter(tab => tab.rowCount > 0);
    const ranges = candidates.map(tab => `${a1Tab(tab.title)}!A1:${columnLetter(tab.columnCount - 1)}${tab.rowCount}`);
    const values = await batchGetValues(spreadsheetId, ranges);
    const formulas = await batchGetValues(spreadsheetId, ranges, "FORMULA");
    const formatting = await getSheetFormatting(spreadsheetId);
    // Danh sách thả xuống hiện có của MỌI ô từ cột "Trạng thái hiện tại" tới cột ngày cuối — ô đã đúng thì không đặt lại
    // (giữ màu chip tự chỉnh). Trước 04/10/2026 chỉ xét cột ngày đầu, nên cột Trạng thái còn danh sách cũ (Chưa làm /
    // Đang làm / Hoàn thành) và báo "Không hợp lệ" khi web ghi "Đang thực hiện".
    const preLayouts = candidates.map((tab, i) => ({ tab, layout: layoutOf(values[i] ?? []) }));
    const withDays = preLayouts.filter((x): x is { tab: SheetTab; layout: TabLayout } => typeof x.layout !== "string");
    const gridStart = (layout: TabLayout) => Math.min(...layout.dayColumns, ...(layout.statusColumn >= 0 ? [layout.statusColumn] : []));
    const grids = await getValidationGrid(spreadsheetId, withDays.map(({ tab, layout }) => `${a1Tab(tab.title)}!${columnLetter(gridStart(layout))}1:${columnLetter(Math.max(...layout.dayColumns))}${tab.rowCount}`));
    const gridOf = new Map(withDays.map(({ tab, layout }, k) => [tab.title, { start: gridStart(layout), rows: grids[k] ?? [] }]));
    const wantedList = Object.values(OVERHAUL_DAY_STATUSES).join("|");
    const statusRule = { condition: { type: "ONE_OF_LIST", values: Object.values(OVERHAUL_DAY_STATUSES).map(userEnteredValue => ({ userEnteredValue })) }, strict: true, showCustomUi: true };
    const requests: object[] = [];
    const cells: Array<{ range: string; value: string }> = [];
    candidates.forEach((tab, i) => {
      const layout = layoutOf(values[i] ?? []);
      if (typeof layout === "string") return;
      const raw = formulas[i] ?? [];
      const at = (r: number, c: number) => String(raw[r]?.[c] ?? "");
      const ref = (r: number, c: number) => `${a1Tab(tab.title)}!${columnLetter(c)}${r + 1}`;
      const columns = [...layout.dayColumn.values()];
      const first = Math.min(...columns), last = Math.max(...columns);
      const dayRange = (r: number) => `${columnLetter(first)}${r + 1}:${columnLetter(last)}${r + 1}`;
      const code = (r: number) => `${columnLetter(layout.codeColumn)}${r + 1}`;
      let dayWords = 0, rowFormulas = 0, fixedLists = 0, clearedLists = 0;
      const grid = gridOf.get(tab.title);
      const listAt = (r: number, c: number) => grid ? grid.rows[r]?.[c - grid.start] ?? "" : "";
      for (const r of layout.codeRow.values()) {
        for (let c = first; c <= last; c++) {
          const word = (layout.rows[r]?.[c] ?? "").trim();
          if (OLD_STATUS_WORDS.includes(word)) { dayWords++; cells.push({ range: ref(r, c), value: OLD_DAY_WORD[word] }); }
        }
        // Hàng hạng mục: ô ngày + ô "Trạng thái hiện tại" dùng đúng bộ trạng thái của web.
        let dayWrong = false;
        for (let c = first; c <= last; c++) if (listAt(r, c) !== wantedList) dayWrong = true;
        if (dayWrong) { fixedLists++; requests.push({ setDataValidation: {
          range: { sheetId: tab.sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: first, endColumnIndex: last + 1 }, rule: statusRule,
        } }); }
        if (layout.statusColumn >= 0 && listAt(r, layout.statusColumn) !== wantedList) { fixedLists++; requests.push({ setDataValidation: {
          range: { sheetId: tab.sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: layout.statusColumn, endColumnIndex: layout.statusColumn + 1 }, rule: statusRule,
        } }); }
        // Hàng "Nhật ký ngày" ngay dưới (ô mã trống): chữ tự do — gỡ mọi danh sách thả xuống còn dính ở cột Trạng thái / ngày.
        const journal = r + 1;
        if (!(layout.rows[journal]?.[layout.codeColumn] ?? "").trim() && grid) {
          for (let c = grid.start; c <= last; c++) {
            if (!listAt(journal, c)) continue;
            clearedLists++;
            requests.push({ setDataValidation: { range: { sheetId: tab.sheetId, startRowIndex: journal, endRowIndex: journal + 1, startColumnIndex: c, endColumnIndex: c + 1 } } });
          }
        }
        if (layout.percentColumn >= 0 && OLD_FORMULA.test(at(r, layout.percentColumn))) {
          rowFormulas++;
          cells.push({ range: ref(r, layout.percentColumn), value: `=IF(${code(r)}="";"";0)` });
        }
        // Công thức cũ, hoặc chữ tĩnh cũ (tab Turbine ghi sẵn "Chưa làm") → công thức theo ô ngày.
        if (layout.statusColumn >= 0 && (OLD_FORMULA.test(at(r, layout.statusColumn)) || OLD_STATUS_WORDS.includes(at(r, layout.statusColumn).trim()))) {
          rowFormulas++;
          const days = dayRange(r);
          cells.push({ range: ref(r, layout.statusColumn), value: `=IF(${code(r)}="";"";IFERROR(INDEX(FILTER(${days};${days}<>"");COUNTA(FILTER(${days};${days}<>"")));"${OVERHAUL_DAY_STATUSES.NOT_STARTED}"))` });
        }
      }
      // Tổng hợp đầu tab: vùng cột trạng thái lấy từ COUNTIF có sẵn (vd "$G$7:$G$92", "H7:H606").
      const statusLetter = columnLetter(layout.statusColumn), percentLetter = columnLetter(layout.percentColumn);
      const headerRow = Math.min(...layout.codeRow.values()) - 1;
      let statusRange: string | null = null;
      for (let r = 0; r < headerRow; r++) for (const cell of raw[r] ?? []) {
        const match = new RegExp(`COUNTIF\\((\\$?${statusLetter}\\$?\\d+:\\$?${statusLetter}\\$?\\d+);`).exec(String(cell));
        if (match && !statusRange) statusRange = match[1];
      }
      const summary: string[] = [];
      if (layout.statusColumn >= 0 && layout.percentColumn >= 0) for (let r = 0; r < headerRow; r++) (raw[r] ?? []).forEach((cell, c) => {
        const before = String(cell);
        if (!OLD_FORMULA.test(before) && !/C\d+\/B\d+/.test(before)) return;
        const after = summaryFormula(before, statusLetter, percentLetter, statusRange);
        if (!after || after === before) { if (OLD_FORMULA.test(before)) summary.push(`${columnLetter(c)}${r + 1} GIỮ (không nhận dạng): ${before}`); return; }
        cells.push({ range: ref(r, c), value: after });
        summary.push(`${columnLetter(c)}${r + 1}: ${before}  →  ${after}`);
      });
      // 4. Chuẩn hoá cho mọi tab giống nhau (tiêu đề ngày, tổng hợp, nhật ký, màu…).
      const normal = normaliseTab(tab, layout, raw, formatting.get(tab.title), tab.title);
      requests.push(...normal.requests);
      cells.push(...normal.cells);
      const duplicates = layout.duplicateCodes.size ? ` · MÃ TRÙNG (app không ghi được): ${[...layout.duplicateCodes].slice(0, 10).join(", ")}` : "";
      report.push(`${OVERHAUL_SOURCES[source]} · “${tab.title}”: ${layout.codeRow.size} hạng mục, cột ngày ${columnLetter(first)}–${columnLetter(last)} · ${rowFormulas} ô công thức hàng${dayWords ? ` · ${dayWords} ô ngày chữ cũ` : ""}${duplicates}${layout.duplicateDays.size ? ` · CỘT TRÙNG NGÀY ${[...layout.duplicateDays].join(", ")}` : ""}${fixedLists ? ` · đặt lại ${fixedLists} danh sách trạng thái` : ""}${clearedLists ? ` · gỡ ${clearedLists} danh sách ở hàng nhật ký` : ""}${normal.notes.length ? ` · chuẩn hoá: ${normal.notes.join(", ")}` : ""}`);
      for (const line of summary) report.push(`    ${line}`);
    });
    if (apply) {
      // Đổi danh sách thả xuống trước, rồi mới ghi chữ / công thức mới (chữ mới hợp lệ với danh sách mới).
      if (requests.length) await batchUpdateSpreadsheet(spreadsheetId, requests);
      for (let i = 0; i < cells.length; i += 2000) await batchUpdateValues(spreadsheetId, cells.slice(i, i + 2000), "USER_ENTERED");
    }
  }
  return report;
}
