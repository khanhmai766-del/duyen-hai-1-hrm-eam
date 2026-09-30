import { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { positionCatalogItem } from "@/lib/position-catalog";
import { prisma } from "@/lib/prisma";
import { compareOverhaulCodes, OVERHAUL_SOURCES, type OverhaulItemSnapshot, type OverhaulSource } from "@/lib/work-permit-overhaul";

/*
 * Hạng mục đại tu cho PCT nhà thầu · Đại tu.
 *
 * Nguồn: 4 file Google Sheets tiến độ đại tu (Lò / Turbine / Điện / CI). Mỗi file gắn một web app Apps Script
 * (docs/dai-tu-apps-script.md) trả JSON có mã khoá, giống đồng bộ thẻ nhà thầu (work-permit-people-sync.ts):
 *   <url>?format=json&token=…  → { ok, file, rows: SheetItemRow[] }
 * Dữ liệu CHÉP về DB (WorkPermitOverhaulItem); form cấp phiếu chỉ tra DB — không gọi Google mỗi lần mở form.
 * Tab "<Cương vị> - Cơ" cho PCT Cơ – Nhiệt – Hóa, "<Cương vị> - Điện" cho PCT Điện.
 */

type SheetItemRow = {
  sheet?: unknown; row?: unknown; code?: unknown; device?: unknown; content?: unknown; method?: unknown;
  contractor?: unknown; percent?: unknown; status?: unknown;
};

const SHEET_TIMEOUT_MS = 45_000;
const TAB_PATTERN = /^(.+?)\s*[-–—]\s*(Cơ|Điện)\s*$/i;

const str = (value: unknown, max = 500) => (value === null || value === undefined ? "" : String(value)).trim().slice(0, max);
/** Chữ một dòng (tên, mã) — gộp khoảng trắng. Nội dung/biện pháp giữ xuống dòng để in phụ lục. */
const line = (value: unknown, max = 500) => str(value, max).replace(/\s+/g, " ");
const multiline = (value: unknown, max = 8000) => str(value, max).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");

function sourceConfig(source: OverhaulSource) {
  return process.env[`OVERHAUL_SHEET_URL_${source}`]?.trim() || "";
}

function sheetToken() {
  const token = process.env.OVERHAUL_SHEET_TOKEN?.trim();
  if (!token) throw fail("Chưa cấu hình mã khoá đồng bộ tiến độ đại tu (OVERHAUL_SHEET_TOKEN). Liên hệ quản trị.", 503);
  return token;
}

async function fetchSource(source: OverhaulSource, url: string, token: string) {
  const target = `${url}${url.includes("?") ? "&" : "?"}${new URLSearchParams({ format: "json", token })}`;
  let res: Response;
  let text: string;
  try {
    res = await fetch(target, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(SHEET_TIMEOUT_MS) });
    text = await res.text();
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new Error(`Google Sheets không phản hồi sau ${SHEET_TIMEOUT_MS / 1000} giây`);
    throw new Error("Không kết nối được Google Sheets (lỗi mạng)");
  }
  let json: { ok?: boolean; error?: string; rows?: SheetItemRow[] };
  try { json = JSON.parse(text); } catch {
    throw new Error(`Web app chưa trả JSON — kiểm tra đã dán Apps Script và triển khai lại chưa (HTTP ${res.status})`);
  }
  if (!json.ok) throw new Error(json.error === "token" ? "Mã khoá không khớp OVERHAUL_SHEET_TOKEN" : `Apps Script báo lỗi: ${json.error ?? "không rõ"}`);
  if (!Array.isArray(json.rows)) throw new Error("Dữ liệu trả về thiếu danh sách hàng");
  return json.rows;
}

export type OverhaulSourceResult = {
  source: OverhaulSource;
  label: string;
  configured: boolean;
  rows: number;
  created: number;
  updated: number;
  deactivated: number;
  /** Tab có đuôi "- Cơ/- Điện" nhưng tên cương vị không khớp danh mục — hạng mục vẫn lưu, chỉ không lọc theo cương vị được. */
  unmatchedTabs: string[];
  error?: string;
};

/** Đồng bộ một file: upsert theo (source, sheet, code), hàng biến mất thì tắt isActive (không xoá). */
async function syncSource(source: OverhaulSource, url: string, token: string, now: Date): Promise<OverhaulSourceResult> {
  const result: OverhaulSourceResult = { source, label: OVERHAUL_SOURCES[source], configured: true, rows: 0, created: 0, updated: 0, deactivated: 0, unmatchedTabs: [] };
  let rows: SheetItemRow[];
  try { rows = await fetchSource(source, url, token); } catch (error) {
    return { ...result, error: error instanceof Error ? error.message : String(error) };
  }

  const items = new Map<string, Prisma.WorkPermitOverhaulItemCreateManyInput>();
  const unmatched = new Set<string>();
  for (const row of rows) {
    const sheet = line(row.sheet, 120);
    const code = line(row.code, 60);
    const tab = TAB_PATTERN.exec(sheet);
    if (!tab || !code || !/\d/.test(code)) continue;
    const position = positionCatalogItem(tab[1]);
    if (!position) unmatched.add(sheet);
    const contractor = line(row.contractor, 120);
    // Cùng mã lặp lại trong một tab (hàng gộp bị trả hai lần) → giữ hàng đầu tiên.
    const key = `${sheet}\u0000${code}`;
    if (items.has(key)) continue;
    items.set(key, {
      source, sheet, code,
      sheetRow: Number.isInteger(Number(row.row)) ? Number(row.row) : 0,
      kind: normalizeText(tab[2]) === "dien" ? "ELECTRICAL" : "MECHANICAL",
      positionTitle: position?.label ?? line(tab[1], 120),
      positionCode: position?.code ?? "",
      device: line(row.device, 300),
      content: multiline(row.content, 4000),
      method: multiline(row.method, 8000),
      contractor,
      contractorCode: normalizeText(contractor),
      percent: line(row.percent, 20),
      status: line(row.status, 120),
      isActive: true,
      syncedAt: now,
    });
  }
  result.rows = items.size;
  result.unmatchedTabs = [...unmatched].sort();

  await prisma.$transaction(async tx => {
    const existing = await tx.workPermitOverhaulItem.findMany({ where: { source }, select: { id: true, sheet: true, code: true } });
    const byKey = new Map(existing.map(item => [`${item.sheet}\u0000${item.code}`, item.id]));
    const toCreate: Prisma.WorkPermitOverhaulItemCreateManyInput[] = [];
    for (const [key, item] of items) {
      const id = byKey.get(key);
      if (id) {
        const { source: _source, sheet: _sheet, code: _code, ...changes } = item;
        await tx.workPermitOverhaulItem.update({ where: { id }, data: changes });
        result.updated++;
      } else toCreate.push(item);
    }
    if (toCreate.length) result.created = (await tx.workPermitOverhaulItem.createMany({ data: toCreate })).count;
    const gone = existing.filter(item => !items.has(`${item.sheet}\u0000${item.code}`)).map(item => item.id);
    if (gone.length) result.deactivated = (await tx.workPermitOverhaulItem.updateMany({ where: { id: { in: gone }, isActive: true }, data: { isActive: false, syncedAt: now } })).count;
  }, { timeout: 60_000 });
  return result;
}

/** Đồng bộ cả 4 file. File chưa cấu hình URL bị bỏ qua; một file lỗi không chặn các file còn lại. */
export async function syncOverhaulItems() {
  const token = sheetToken();
  const configured = (Object.keys(OVERHAUL_SOURCES) as OverhaulSource[]).map(source => ({ source, url: sourceConfig(source) }));
  if (!configured.some(item => item.url)) {
    throw fail("Chưa cấu hình URL web app của file tiến độ đại tu nào (OVERHAUL_SHEET_URL_LO/TURBINE/DIEN/CI). Liên hệ quản trị.", 503);
  }
  const now = new Date();
  const results = await Promise.all(configured.map(({ source, url }) => url
    ? syncSource(source, url, token, now)
    : Promise.resolve<OverhaulSourceResult>({ source, label: OVERHAUL_SOURCES[source], configured: false, rows: 0, created: 0, updated: 0, deactivated: 0, unmatchedTabs: [] })));
  return { sources: results, syncedAt: now.toISOString() };
}

/**
 * Hạng mục gợi ý cho form: lọc theo loại PCT, mã nhà thầu của đơn vị công tác (WorkPermitCompany.code) và
 * cương vị (bỏ trống = mọi cương vị). Đơn vị chưa khai mã → không có gợi ý (trả kèm lý do để form nói rõ).
 */
export async function listOverhaulItems(params: { kind: string; company: string; position: string }) {
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
  const items = await prisma.workPermitOverhaulItem.findMany({
    where: { isActive: true, kind: params.kind, contractorCode, ...(positionCode ? { positionCode } : {}) },
    select: { id: true, source: true, sheet: true, positionTitle: true, code: true, device: true, content: true, method: true, percent: true, status: true },
  });
  items.sort((a, b) => compareOverhaulCodes(a.code, b.code) || a.sheet.localeCompare(b.sheet, "vi"));
  return { items, syncedAt, contractorCode: row?.code ?? null, reason: null };
}

const MAX_PERMIT_OVERHAUL_ITEMS = 100;

/**
 * Hạng mục ghi trên phiếu (ảnh chụp lúc cấp). `undefined` = request không gửi trường này (giữ nguyên khi sửa).
 * Chỉ phiếu nhà thầu · Đại tu mới có; phiếu khác luôn về DbNull.
 */
export function parseOverhaulItems(value: unknown, permit: { teamType: string; contractorScope: string | null }): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (permit.teamType !== "CONTRACTOR" || permit.contractorScope !== "OVERHAUL" || value === null) return Prisma.DbNull;
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
