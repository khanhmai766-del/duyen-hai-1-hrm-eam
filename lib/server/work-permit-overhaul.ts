import { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { positionCatalogItem } from "@/lib/position-catalog";
import { prisma } from "@/lib/prisma";
import { a1Tab, batchGetValues, columnLetter, getSpreadsheet, GoogleSheetsError, spreadsheetIdFromUrl, type SheetTab } from "@/lib/server/google-sheets";
import { overhaulScheduleLinks } from "@/lib/server/overhaul-schedules";
import { formatPermitNumber } from "@/lib/work-permits";
import { compareOverhaulCodes, isOverhaulPaperPermit, OVERHAUL_HOLDING_STATUSES, OVERHAUL_SOURCE_DEFAULT_KIND, OVERHAUL_SOURCES, overhaulItemKey, overhaulItemProgressOf, overhaulItemsOf, type OverhaulItemProgress, type OverhaulItemSnapshot, type OverhaulItemUsage, type OverhaulSource } from "@/lib/work-permit-overhaul";

/*
 * Hạng mục đại tu cho PCT nhà thầu · Đại tu.
 *
 * NGUỒN = link dòng 1–4 của bảng "Tiến độ đại tu" (Lò hơi / Turbine / Máy phát / C&I), đọc bằng service account
 * (lib/server/google-sheets.ts, docs/dai-tu-google-sheets.md). Dữ liệu CHÉP về DB (WorkPermitOverhaulItem); form cấp
 * phiếu chỉ tra DB. Đồng bộ: nút bấm + systemd 06:00 (scripts/import/sync-overhaul-items.ts).
 *
 * QUY TẮC ĐỌC (theo cấu trúc file thật, 01/10/2026):
 *  - Chỉ đọc tab có hàng tiêu đề chứa ô "Mã hạng mục" + "Nội dung công việc" (trong 30 hàng đầu); bỏ tab
 *    "Tiến độ …" (tổng hợp), README; tab "Chi tiết 1–4" tự rơi vì không có tiêu đề đó.
 *  - Cương vị: cột "Cương vị" của TỪNG DÒNG; tab không có cột này (vd "CI", file Máy phát từ 03/10/2026 đã bỏ cột) → lấy
 *    theo tên tab. Tên tab trùng nguyên một cương vị ("Trực chính điện") thì lấy cả tên, không cắt đuôi "điện". Tên trong
 *    Sheet khác danh mục app thì ánh xạ ở POSITION_ALIASES ("Lò hơi" = Lò phó theo quyết định người dùng).
 *  - IGNORED_TABS: tab bảng nháp đã được tách sang tab cương vị (Máy phát "Điện_1") — không đọc, kẻo một hạng mục nằm hai nơi.
 *  - Loại PCT: đuôi tên tab "- Cơ" / "-Điện" / "_Cơ"…; không có đuôi → mặc định của file (Máy phát, C&I = Điện),
 *    file Lò/Turbine mà tab không có đuôi thì bỏ tab và báo.
 *  - Dòng không có Nhà thầu bị bỏ (vd tab "Điện_1" chưa phân chia) — không gợi ý được cho ai.
 *  - Một hạng mục = (nguồn, loại PCT, mã, cương vị). Tab nguồn ("Lò- Cơ") và tab cương vị ("Lò phó - Cơ") cùng chứa
 *    một mã → gộp; vị trí lưu ưu tiên tab có cột "Ngày n" (đợt 2 ghi kết quả ngày vào đó).
 */

/** Tên cương vị trong Sheet → nhãn danh mục app (so không dấu, không hoa thường). */
const POSITION_ALIASES: Record<string, string> = {
  "lo hoi": "Lò phó",
  "ci": "C&I",
};

/** Tab không đọc (so không dấu). "Điện_1" = danh sách chưa phân chia, 46 mục đã tách sang "Máy Phó-Điện" / "Trợ thủ-Điện". */
const IGNORED_TABS: Partial<Record<OverhaulSource, string[]>> = { GENERATOR: ["dien_1"] };

const HEADER_SCAN_ROWS = 30;
const MAX_ROWS_PER_TAB = 5000;
const TAB_KIND = /[\s_\-–—]+(cơ|co|điện|dien)\s*$/i;

const str = (value: unknown, max = 500) => (value === null || value === undefined ? "" : String(value)).trim().slice(0, max);
/** Chữ một dòng (tên, mã) — gộp khoảng trắng. Nội dung/biện pháp giữ xuống dòng để in phụ lục. */
const line = (value: unknown, max = 500) => str(value, max).replace(/\s+/g, " ");
const multiline = (value: unknown, max = 8000) => str(value, max).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");

type Columns = { code: number; device: number; content: number; method: number; position: number; contractor: number; percent: number; status: number };

/** Hàng tiêu đề + vị trí các cột cần đọc; null nếu tab không phải bảng hạng mục. */
export function findHeader(rows: string[][]) {
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r++) {
    const cells = rows[r].map(cell => normalizeText(cell).replace(/\s+/g, " "));
    const at = (test: (cell: string) => boolean) => cells.findIndex(test);
    const code = at(c => c === "ma hang muc");
    const content = at(c => c.startsWith("noi dung cong viec"));
    if (code < 0 || content < 0) continue;
    const columns: Columns = {
      code, content,
      device: at(c => c.startsWith("ten thiet bi")),
      method: at(c => c.startsWith("bien phap")),
      position: at(c => c === "cuong vi"),
      contractor: at(c => c === "nha thau"),
      percent: at(c => c.includes("hoan thanh")),
      status: at(c => c.startsWith("trang thai")),
    };
    return { row: r, columns, hasDayColumns: cells.some(c => /^ngay \d+/.test(c)) };
  }
  return null;
}

/**
 * Mã hạng mục bị Google Sheets tự đổi thành NGÀY khi gõ/dán vào ô không để định dạng văn bản: "9.1.1" → 9/1/2001,
 * hiển thị "9.1.2001" (gặp 01/10/2026 ở tab "ESP - Cơ" và các tab "Chi tiết"). Mã thật không có đoạn 4 chữ số 20xx,
 * nên "d.m.20yy" (yy 1–31) được trả về "d.m.yy" — gợi ý vẫn đúng và gộp được với tab nguồn dù Sheet chưa sửa.
 */
export function repairDateCode(code: string) {
  const match = /^(\d{1,2})\.(\d{1,2})\.20(\d{2})$/.exec(code);
  if (!match) return code;
  const last = Number(match[3]);
  return last >= 1 && last <= 31 ? `${Number(match[1])}.${Number(match[2])}.${last}` : code;
}

function tabKind(title: string, source: OverhaulSource) {
  // "Trực chính điện" là tên cương vị, không phải "<cương vị> - Điện": file có loại PCT mặc định thì giữ nguyên tên.
  const fallback = OVERHAUL_SOURCE_DEFAULT_KIND[source];
  if (fallback && positionCatalogItem(title.trim())) return { kind: fallback, positionPart: title.trim() };
  const match = TAB_KIND.exec(title);
  if (match) return { kind: normalizeText(match[1]) === "co" ? "MECHANICAL" : "ELECTRICAL", positionPart: title.slice(0, match.index).trim() };
  return fallback ? { kind: fallback, positionPart: title.trim() } : null;
}

function resolvePosition(label: string) {
  const alias = POSITION_ALIASES[normalizeText(label).replace(/\s+/g, " ")];
  const item = positionCatalogItem(alias ?? label);
  return { title: item?.label ?? line(label, 120), code: item?.code ?? "" };
}

/** Ô "Cương vị" ghi nhiều cương vị ("Máy Phó, Trợ Thủ" hoặc xuống dòng) → mỗi cương vị một bản hạng mục. */
function resolvePositions(label: string) {
  const parts = label.split(/[,;/+\n]+/).map(part => line(part, 120)).filter(Boolean);
  if (parts.length <= 1) return [resolvePosition(line(label, 120))];
  const seen = new Set<string>();
  return parts.map(resolvePosition).filter(position => !seen.has(position.title) && !!seen.add(position.title));
}

export type OverhaulSourceResult = {
  source: OverhaulSource;
  label: string;
  configured: boolean;
  /** Tên file Google Sheets (đọc được). */
  file?: string;
  rows: number;
  mechanical: number;
  electrical: number;
  created: number;
  updated: number;
  deactivated: number;
  /** Tab đã đọc (có bảng hạng mục). */
  tabs: string[];
  /** Tab có bảng hạng mục nhưng không rõ Cơ/Điện (file Lò/Turbine thiếu đuôi tên) — bỏ qua. */
  skippedTabs: string[];
  /** Tên cương vị không khớp danh mục — hạng mục vẫn lưu, chỉ hiện khi chọn "Tất cả cương vị". */
  unmatchedPositions: string[];
  /** Mã nhà thầu trong Sheet chưa có đơn vị nào trong danh bạ nhà thầu mang mã đó — sẽ không được gợi ý. */
  unknownContractors: string[];
  /** Số dòng có mã nhưng chưa ghi nhà thầu (bỏ qua). */
  missingContractor: number;
  error?: string;
};

type ParsedItem = Prisma.WorkPermitOverhaulItemCreateManyInput & { hasDayColumns: boolean };

/** Đọc một file: chỉ 2 lượt gọi API (30 hàng đầu mọi tab → toàn bộ các tab có bảng hạng mục). */
async function readSource(source: OverhaulSource, spreadsheetId: string, now: Date, result: OverhaulSourceResult) {
  const meta = await getSpreadsheet(spreadsheetId);
  result.file = meta.title;
  const candidates = meta.tabs.filter(tab => {
    const name = normalizeText(tab.title);
    return !name.startsWith("tien do") && name !== "readme" && tab.rowCount > 0 && !(IGNORED_TABS[source] ?? []).includes(name.trim());
  });
  const heads = await batchGetValues(spreadsheetId, candidates.map(tab => `${a1Tab(tab.title)}!A1:${columnLetter(Math.min(tab.columnCount, 40) - 1)}${HEADER_SCAN_ROWS}`));
  const tables: Array<{ tab: SheetTab; header: NonNullable<ReturnType<typeof findHeader>>; kind: string; positionPart: string }> = [];
  candidates.forEach((tab, i) => {
    const header = findHeader(heads[i] ?? []);
    if (!header) return;
    const kind = tabKind(tab.title, source);
    if (!kind) { result.skippedTabs.push(tab.title); return; }
    tables.push({ tab, header, ...kind });
  });
  result.tabs = tables.map(t => t.tab.title);

  const bodies = await batchGetValues(spreadsheetId, tables.map(({ tab, header }) => {
    const lastColumn = Math.max(...Object.values(header.columns));
    return `${a1Tab(tab.title)}!A${header.row + 2}:${columnLetter(lastColumn)}${Math.min(tab.rowCount, header.row + 1 + MAX_ROWS_PER_TAB)}`;
  }));

  const items = new Map<string, ParsedItem>();
  const unmatched = new Set<string>();
  tables.forEach(({ tab, header, kind, positionPart }, t) => {
    const { columns } = header;
    const cell = (row: string[], index: number) => (index >= 0 ? row[index] ?? "" : "");
    (bodies[t] ?? []).forEach((row, i) => {
      const code = repairDateCode(line(cell(row, columns.code), 60));
      // Hàng tiêu đề mục ("I. PHẦN CƠ"), hàng "Nhật ký ngày" (ô mã trống/gộp) → bỏ.
      if (!code || !/^\d+(\.\d+)*$/.test(code)) return;
      const contractor = line(cell(row, columns.contractor), 120);
      if (!contractor) { result.missingContractor++; return; }
      for (const position of resolvePositions(str(cell(row, columns.position), 240) || positionPart)) {
        if (!position.code) unmatched.add(position.title);
        const key = `${kind}\u0000${code}\u0000${normalizeText(position.title)}`;
        const parsed: ParsedItem = {
          source, kind, code,
          sheet: tab.title,
          sheetRow: header.row + 2 + i,
          positionTitle: position.title,
          positionCode: position.code,
          device: line(cell(row, columns.device), 300),
          content: multiline(cell(row, columns.content), 4000),
          method: multiline(cell(row, columns.method), 8000),
          contractor,
          contractorCode: normalizeText(contractor),
          percent: line(cell(row, columns.percent), 20),
          status: line(cell(row, columns.status), 120),
          isActive: true,
          syncedAt: now,
          hasDayColumns: header.hasDayColumns,
        };
        const existing = items.get(key);
        if (!existing) { items.set(key, parsed); continue; }
        // Gộp tab nguồn + tab cương vị: điền chỗ trống, vị trí lấy tab có cột ngày.
        for (const field of ["device", "content", "method", "percent", "status"] as const) {
          if (!existing[field] && parsed[field]) existing[field] = parsed[field];
        }
        if (!existing.hasDayColumns && parsed.hasDayColumns) {
          existing.sheet = parsed.sheet; existing.sheetRow = parsed.sheetRow; existing.hasDayColumns = true;
        }
      }
    });
  });
  result.unmatchedPositions = [...unmatched].sort();
  return [...items.values()].map(({ hasDayColumns: _hasDayColumns, ...item }) => item);
}

const emptyResult = (source: OverhaulSource, configured: boolean): OverhaulSourceResult => ({
  source, label: OVERHAUL_SOURCES[source], configured, rows: 0, mechanical: 0, electrical: 0, created: 0, updated: 0,
  deactivated: 0, tabs: [], skippedTabs: [], unmatchedPositions: [], unknownContractors: [], missingContractor: 0,
});

/** Đồng bộ một file: upsert theo (nguồn, loại PCT, mã, cương vị); hạng mục biến mất → isActive=false (không xoá). */
async function syncSource(source: OverhaulSource, url: string, now: Date, companyCodes: Set<string>): Promise<OverhaulSourceResult> {
  const result = emptyResult(source, true);
  const spreadsheetId = spreadsheetIdFromUrl(url);
  if (!spreadsheetId) return { ...result, error: "Link sheet không đúng dạng https://docs.google.com/spreadsheets/d/…" };
  let items: Prisma.WorkPermitOverhaulItemCreateManyInput[];
  try {
    items = await readSource(source, spreadsheetId, now, result);
  } catch (error) {
    if (error instanceof GoogleSheetsError && error.status === 503) throw error; // thiếu cấu hình máy chủ: báo chung
    return { ...result, error: error instanceof Error ? error.message : String(error) };
  }
  result.rows = items.length;
  result.mechanical = items.filter(item => item.kind === "MECHANICAL").length;
  result.electrical = result.rows - result.mechanical;
  result.unknownContractors = [...new Set(items.map(item => item.contractor!).filter(name => !companyCodes.has(normalizeText(name))))].sort();

  const keyOf = (item: { kind: string; code: string; positionTitle?: string | null }) => `${item.kind}\u0000${item.code}\u0000${normalizeText(item.positionTitle ?? "")}`;
  await prisma.$transaction(async tx => {
    const existing = await tx.workPermitOverhaulItem.findMany({ where: { source }, select: { id: true, kind: true, code: true, positionTitle: true } });
    const byKey = new Map(existing.map(item => [keyOf(item), item.id]));
    const seen = new Set<string>();
    const toCreate: Prisma.WorkPermitOverhaulItemCreateManyInput[] = [];
    for (const item of items) {
      const key = keyOf(item);
      seen.add(key);
      const id = byKey.get(key);
      if (id) {
        const { source: _source, kind: _kind, code: _code, positionTitle: _positionTitle, ...changes } = item;
        await tx.workPermitOverhaulItem.update({ where: { id }, data: changes });
        result.updated++;
      } else toCreate.push(item);
    }
    if (toCreate.length) result.created = (await tx.workPermitOverhaulItem.createMany({ data: toCreate, skipDuplicates: true })).count;
    const gone = existing.filter(item => !seen.has(keyOf(item))).map(item => item.id);
    if (gone.length) result.deactivated = (await tx.workPermitOverhaulItem.updateMany({ where: { id: { in: gone }, isActive: true }, data: { isActive: false, syncedAt: now } })).count;
  }, { timeout: 120_000 });
  return result;
}

/** Đồng bộ 4 file theo link trong bảng Tiến độ đại tu. File chưa có link bị bỏ qua; một file lỗi không chặn file khác. */
export async function syncOverhaulItems() {
  const links = await overhaulScheduleLinks();
  const sources = (Object.keys(OVERHAUL_SOURCES) as OverhaulSource[]).map(source => ({ source, url: links.find(link => link.id === source)?.url ?? "" }));
  if (!sources.some(item => item.url)) throw fail("Bảng Tiến độ đại tu chưa có link sheet nào (dòng 1–4). Quản trị dán link rồi đồng bộ lại.", 400);
  const companies = await prisma.workPermitCompany.findMany({ where: { code: { not: "" } }, select: { code: true } });
  const companyCodes = new Set(companies.map(company => normalizeText(company.code)));
  const now = new Date();
  try {
    // Tuần tự: tránh vượt hạn mức đọc/phút của Google khi 4 file cùng lớn.
    const results: OverhaulSourceResult[] = [];
    for (const { source, url } of sources) results.push(url ? await syncSource(source, url, now, companyCodes) : emptyResult(source, false));
    return { sources: results, syncedAt: now.toISOString() };
  } catch (error) {
    if (error instanceof GoogleSheetsError) throw fail(error.message, error.status);
    throw error;
  }
}

/**
 * Hạng mục gợi ý cho form: trả cả hạng mục Cơ lẫn Điện (phiếu Cơ và phiếu Điện thấy hạng mục của nhau), hạng mục
 * cùng loại với phiếu xếp trước; lọc theo mã nhà thầu của đơn vị công tác (WorkPermitCompany.code) và
 * cương vị (bỏ trống = mọi cương vị). Đơn vị chưa khai mã → không có gợi ý (trả kèm lý do để form nói rõ).
 */
export async function listOverhaulItems(params: { kind: string; company: string; position: string; excludePermitId?: string }) {
  const lastSync = await prisma.workPermitOverhaulItem.aggregate({ _max: { syncedAt: true } });
  const syncedAt = lastSync._max.syncedAt?.toISOString() ?? null;
  const company = params.company.trim();
  if (!company) return { items: [], syncedAt, contractorCode: null, reason: "company" as const };
  const row = await prisma.workPermitCompany.findFirst({
    where: { OR: [{ name: company }, { code: { equals: company, mode: "insensitive" } }] },
    select: { code: true },
  });
  const contractorCode = normalizeText(row?.code ?? "");
  if (!contractorCode) return { items: [], syncedAt, contractorCode: null, reason: "companyCode" as const };
  const positionCode = params.position ? positionCatalogItem(params.position)?.code ?? null : null;
  // Cương vị chỉ lọc hạng mục CÙNG loại phiếu: hạng mục phối hợp (cùng nhà thầu, chia phần cơ/điện) nằm ở tab loại kia và
  // mang cương vị bên kia — lọc theo cương vị của phiếu thì PCT Điện không bao giờ thấy hạng mục tab Cơ và ngược lại.
  const items = await prisma.workPermitOverhaulItem.findMany({
    where: { isActive: true, contractorCode, ...(positionCode ? { OR: [{ kind: { not: params.kind } }, { positionCode }] } : {}) },
    select: { id: true, kind: true, source: true, sheet: true, positionTitle: true, code: true, device: true, content: true, method: true, percent: true, status: true },
  });
  const otherKind = (item: { kind: string }) => item.kind === params.kind ? 0 : 1;
  items.sort((a, b) => otherKind(a) - otherKind(b) || compareOverhaulCodes(a.code, b.code) || a.sheet.localeCompare(b.sheet, "vi"));
  const usage = await overhaulItemUsage(prisma, params.excludePermitId);
  return {
    items: items.map(item => ({ ...item, usedBy: usage.held.get(overhaulItemKey(item)) ?? [], draftIn: usage.drafts.get(overhaulItemKey(item)) ?? [] })),
    syncedAt, contractorCode: row?.code ?? null, reason: null,
  };
}

/**
 * Hạng mục đang nằm trên phiếu nào. `held`: các phiếu đã cấp chưa huỷ / kết thúc phiếu (chọn lại phải xác nhận).
 * `drafts`: phiếu nháp (chỉ để biết). Đọc mọi PCT nhà thầu · Đại tu còn mở — vài trăm phiếu mỗi đợt, trải JSON trong Node.
 */
export async function overhaulItemUsage(db: Prisma.TransactionClient | typeof prisma, excludePermitId?: string) {
  const permits = await db.workPermit.findMany({
    where: { teamType: "CONTRACTOR", contractorScope: "OVERHAUL", status: { in: ["DRAFT", ...OVERHAUL_HOLDING_STATUSES] }, overhaulItems: { not: Prisma.DbNull }, ...(excludePermitId ? { id: { not: excludePermitId } } : {}) },
    select: { id: true, number: true, year: true, status: true, overhaulItems: true },
    orderBy: { createdAt: "asc" },
  });
  const held = new Map<string, OverhaulItemUsage[]>();
  const drafts = new Map<string, string[]>();
  for (const permit of permits) {
    const number = permit.number.trim() ? formatPermitNumber(permit) : "chưa có số";
    for (const item of overhaulItemsOf(permit.overhaulItems)) {
      const key = overhaulItemKey(item);
      if (permit.status === "DRAFT") drafts.set(key, [...(drafts.get(key) ?? []), number]);
      else held.set(key, [...(held.get(key) ?? []), { permitId: permit.id, number, status: permit.status }]);
    }
  }
  return { held, drafts };
}

/**
 * Hạng mục MỚI thêm vào phiếu (so với bản đã lưu) mà đang nằm trong PCT khác còn hiệu lực: được phép — hai phiếu cùng
 * giữ một hạng mục — nhưng người cấp phải đã xác nhận trong hộp chọn (`confirmedShared` trên từng mục của request).
 * Thiếu xác nhận (gọi API thẳng, form cũ) → 409 nêu số PCT đang giữ.
 */
export async function assertOverhaulItemsConfirmed(tx: Prisma.TransactionClient, requested: unknown, before: unknown, permitId?: string) {
  const existing = new Set(overhaulItemsOf(before).map(overhaulItemKey));
  const fresh = overhaulItemsOf(requested).filter(item => !existing.has(overhaulItemKey(item)) && item.confirmedShared !== true);
  if (!fresh.length) return;
  const { held } = await overhaulItemUsage(tx, permitId);
  const taken = fresh.map(item => ({ item, usage: held.get(overhaulItemKey(item)) ?? [] })).filter(entry => entry.usage.length);
  if (!taken.length) return;
  const detail = taken.slice(0, 5).map(({ item, usage }) => `${item.code} (PCT ${usage.map(u => u.number).join(", ")})`).join(", ");
  throw fail(`Hạng mục đang nằm trong PCT khác còn hiệu lực: ${detail}${taken.length > 5 ? "…" : ""}. Mở lại “Chọn hạng mục đại tu” và xác nhận nếu vẫn đưa vào phiếu này.`, 409);
}

/**
 * % lũy kế CHUNG của từng hạng mục: hạng mục phối hợp nằm trong cả PCT Cơ lẫn PCT Điện (cùng nhà thầu, chia phần cơ/điện)
 * nhưng Sheet chỉ có một ô "% Hoàn thành" — nên % là một con số chung, lấy số cao nhất đã ghi ở mọi lần làm việc (kể cả lần
 * đang mở đã "Cập nhật tiến độ") của mọi PCT đại tu có hạng mục đó, kể cả phiếu đã kết thúc / huỷ sau khi đã ghi.
 */
export async function sharedOverhaulPercents(db: Prisma.TransactionClient | typeof prisma, items: OverhaulItemSnapshot[]) {
  const latest = new Map<string, number>();
  if (!items.length) return latest;
  const keys = new Set(items.map(overhaulItemKey));
  const permits = await db.workPermit.findMany({
    where: { teamType: "CONTRACTOR", contractorScope: "OVERHAUL", OR: items.map(item => ({ overhaulItems: { array_contains: [{ source: item.source, sheet: item.sheet, code: item.code }] } })) },
    select: { id: true },
  });
  if (!permits.length) return latest;
  const sessions = await db.workPermitSession.findMany({ where: { permitId: { in: permits.map(permit => permit.id) } }, select: { itemProgress: true } });
  for (const session of sessions) {
    for (const item of overhaulItemProgressOf(session.itemProgress)) {
      const key = overhaulItemKey(item);
      if (!keys.has(key) || typeof item.percent !== "number") continue;
      latest.set(key, Math.max(latest.get(key) ?? 0, item.percent));
    }
  }
  return latest;
}

/**
 * Kết quả từng hạng mục khi kết thúc lần làm việc của PCT đại tu. Phải đủ mọi mã trên phiếu; mục có thực hiện cần
 * % lũy kế 0–100 không thấp hơn % chung đã ghi (`previous` — xem sharedOverhaulPercents); mục không thực hiện giữ % cũ.
 * Trả kèm % chung của phiếu (trung bình).
 */
export function parseSessionItemProgress(value: unknown, permitItems: OverhaulItemSnapshot[], previous: Map<string, number>) {
  if (!Array.isArray(value)) throw fail("Vui lòng đánh giá tiến độ từng hạng mục đại tu của phiếu");
  const sent = new Map<string, Record<string, unknown>>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") throw fail("Tiến độ hạng mục không hợp lệ");
    const item = raw as Record<string, unknown>;
    sent.set(overhaulItemKey({ source: line(item.source, 20), sheet: line(item.sheet, 120), code: line(item.code, 60) }), item);
  }
  const items: OverhaulItemProgress[] = permitItems.map(snapshot => {
    const key = overhaulItemKey(snapshot);
    const raw = sent.get(key);
    if (!raw) throw fail(`Thiếu đánh giá hạng mục ${snapshot.code}. Tải lại phiếu rồi thử lại.`);
    const done = raw.done === true;
    const note = str(raw.note, 1000);
    if (!done) return { code: snapshot.code, sheet: snapshot.sheet, source: snapshot.source, done, percent: null, note: "" };
    const percent = Number(raw.percent);
    if (raw.percent === null || raw.percent === "" || !Number.isInteger(percent) || percent < 0 || percent > 100) throw fail(`Tiến độ hạng mục ${snapshot.code} phải là số nguyên từ 0 đến 100%`);
    const before = previous.get(key);
    if (before !== undefined && percent < before) throw fail(`Tiến độ hạng mục ${snapshot.code} là lũy kế chung (cả PCT Cơ lẫn PCT Điện cùng giữ hạng mục) — không thấp hơn ${before}% đã ghi`);
    return { code: snapshot.code, sheet: snapshot.sheet, source: snapshot.source, done, percent, note };
  });
  if (sent.size !== items.length) throw fail("Danh sách hạng mục đã thay đổi. Tải lại phiếu rồi thử lại.", 409);
  const percents = items.map(item => item.percent ?? previous.get(overhaulItemKey(item)) ?? 0);
  return { items, progress: Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length) };
}

const MAX_PERMIT_OVERHAUL_ITEMS = 100;

/**
 * Hạng mục ghi trên phiếu (ảnh chụp lúc cấp). `undefined` = request không gửi trường này (giữ nguyên khi sửa).
 * Chỉ PCT giấy nhà thầu · Đại tu mới có; phiếu khác luôn về DbNull.
 */
export function parseOverhaulItems(value: unknown, permit: { teamType: string; contractorScope: string | null; format?: string | null }): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (!isOverhaulPaperPermit(permit) || value === null) return Prisma.DbNull;
  if (!Array.isArray(value)) throw fail("Danh sách hạng mục đại tu không hợp lệ");
  if (value.length > MAX_PERMIT_OVERHAUL_ITEMS) throw fail(`Mỗi phiếu chọn tối đa ${MAX_PERMIT_OVERHAUL_ITEMS} hạng mục đại tu`);
  const seen = new Set<string>();
  const items: OverhaulItemSnapshot[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") throw fail("Hạng mục đại tu không hợp lệ");
    const item = raw as Record<string, unknown>;
    const code = line(item.code, 60);
    if (!code) throw fail("Hạng mục đại tu thiếu mã");
    const key = `${line(item.sheet, 120)}\u0000${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      code,
      device: line(item.device, 300),
      content: multiline(item.content, 4000),
      method: multiline(item.method, 8000),
      source: line(item.source, 20),
      sheet: line(item.sheet, 120),
    });
  }
  if (!items.length) return Prisma.DbNull;
  items.sort((a, b) => compareOverhaulCodes(a.code, b.code));
  return items as unknown as Prisma.InputJsonValue;
}
