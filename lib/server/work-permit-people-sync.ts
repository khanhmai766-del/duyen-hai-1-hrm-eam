import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import { uploadS3Object } from "@/lib/s3";
import { normalizeCardCode, cardlessCode, cardNumberOf, isCardlessCode, sctxCardCode } from "@/lib/work-permit-card";
import { a1Tab, batchGetValues, getSpreadsheet, GoogleSheetsError } from "@/lib/server/google-sheets";
import { PERMIT_CONTRACTOR_SCOPES, type PermitCompanyScopes, type PermitContractorScope } from "@/lib/work-permits";

/*
 * Đồng bộ danh bạ nhân sự nhà thầu từ Google Sheets "thẻ ra vào cổng & ATVSLĐ" (phương án B).
 *
 * Nguồn là web app Apps Script của chính bảng đó, thêm chế độ JSON có mã khoá (docs/the-nha-thau-apps-script.md):
 *   ?format=json&token=…          → { ok, rows: SheetRow[] }            — một lần cho cả danh sách
 *   ?format=photo&id=<số thẻ>&token=… → { ok, contentType, base64 }     — ảnh của MỘT người
 * Không gọi sheet mỗi lần quét thẻ (chậm 1–3 giây, phụ thuộc Google): quét chỉ tra DB đã đồng bộ.
 *
 * Chạy theo hai đợt do trình duyệt điều khiển để không đụng giới hạn thời gian chờ của proxy khi có vài
 * trăm người: `syncPeopleList` (nhanh, chỉ chữ) rồi lặp `syncPeoplePhotos` từng nhóm nhỏ.
 * Sheet là nguồn chuẩn cho họ tên / thông tin thẻ; ĐƠN VỊ lấy theo tên tab = Mã đơn vị (unitByTab).
 * Vai trò CHTT và "đang hoạt động" vẫn do sổ quản.
 *
 * HAI NGUỒN (14/10/2026): bảng thẻ nhà thầu Đại tu (PERMIT_CARD_SHEET_*) và bảng nhân sự SCTX
 * (PERMIT_CARD_SHEET_SCTX_*) — mỗi bảng một web app Apps Script riêng. Người MỚI nhận nhóm theo nguồn; người đã có
 * giữ nhóm trên sổ. Số thẻ là khoá chung của danh bạ: số thẻ đã thuộc người KHÁC (khác họ tên) của nhóm kia thì
 * không ghi đè mà báo xung đột (bảng SCTX từng đánh lại SGIDC/01–14 trùng 14 người Đại tu).
 *
 * ĐỌC DANH SÁCH BẰNG SHEETS API (16/10/2026): web app Apps Script trả danh sách mất 60–170 s hoặc treo (gọi getContentUrl
 * cho từng ảnh chèn ô; đường tới script.googleusercontent.com chập chờn) → đồng bộ báo lỗi liên tục. Nay danh sách đọc
 * thẳng bằng tài khoản dịch vụ (file chia sẻ quyền Xem, ~2–3 s cho 1.000+ người, tự thử lại khi lỗi mạng); Apps Script
 * chỉ còn dùng để TẢI ẢNH người chưa có ảnh. File chưa chia sẻ / không đọc được → quay về Apps Script như cũ.
 */

export type SheetRow = {
  sheet?: string; soThe?: unknown; hoTen?: unknown; namSinh?: unknown; sdt?: unknown; donVi?: unknown; goiThau?: unknown;
  chucVu?: unknown; viTri?: unknown; khuVuc?: unknown; ketQuaHL?: unknown; ngayHL?: unknown; ngayCap?: unknown; ngayHetHan?: unknown; photo?: unknown;
};
/**
 * Một ảnh cần tải, do bước list tạo và KÝ; trình duyệt chỉ chuyển nguyên văn sang bước photos. `source` là dấu
 * vết ảnh trong sheet (lưu vào photoSource để lần sau biết ảnh có đổi không), `exp` là hạn chữ ký (ms).
 */
export type PhotoJob = { code: string; source: string; exp: number; sig: string; src: PeopleSyncSource };

/** Hai bảng nguồn — khoá cũng là nhóm (scope) gán cho người MỚI của bảng đó. */
export const PEOPLE_SYNC_SOURCES = {
  OVERHAUL: { label: "Đại tu", urlEnv: "PERMIT_CARD_SHEET_URL", tokenEnv: "PERMIT_CARD_SHEET_TOKEN",
    // "CẤP MÃ QR-NHÂN SỰ ĐẠI TU S2-DH1" — ghi đè được bằng PERMIT_CARD_SHEET_ID.
    sheetIdEnv: "PERMIT_CARD_SHEET_ID", sheetId: "1I-vS8FRox70vI5teSQrbWIpZb0x5DQyr7vDBOt9g12I" },
  SCTX: { label: "SCTX", urlEnv: "PERMIT_CARD_SHEET_SCTX_URL", tokenEnv: "PERMIT_CARD_SHEET_SCTX_TOKEN",
    // "CẤP MÃ QR CHO NHÀ THẦU LÀM VIỆC SXKD".
    sheetIdEnv: "PERMIT_CARD_SHEET_SCTX_ID", sheetId: "1ME5QE9ukDZBvugPk0_UvVIlVxviSxUOegctJKrnJUTY" },
} as const;
export type PeopleSyncSource = keyof typeof PEOPLE_SYNC_SOURCES;
export function parsePeopleSyncSource(value: unknown): PeopleSyncSource {
  if (value === undefined || value === null || value === "") return "OVERHAUL";
  if (typeof value === "string" && Object.hasOwn(PEOPLE_SYNC_SOURCES, value)) return value as PeopleSyncSource;
  throw fail("Nguồn đồng bộ không hợp lệ", 400);
}

/**
 * Số thẻ trên sheet đã có hồ sơ thuộc NHÓM KHÁC: cùng họ tên → coi là cùng người (cập nhật, giữ nhóm trên sổ);
 * khác họ tên → hai người dùng chung một số thẻ, KHÔNG ghi đè (trả câu báo).
 */
export function cardConflict(before: { name: string; scope: string | null } | undefined, incoming: { name: string; code: string; tab: string }, source: PeopleSyncSource, accepted?: PermitContractorScope) {
  if (!before || !before.scope || before.scope === source || before.scope === accepted) return null;
  if (normalizeText(before.name).trim() === normalizeText(incoming.name).trim()) return null;
  const owner = PERMIT_CONTRACTOR_SCOPES[before.scope as PermitContractorScope] ?? before.scope;
  return `${incoming.tab}: ${incoming.name} · số thẻ ${incoming.code} đã là của ${before.name} (nhóm ${owner}) — đánh số thẻ riêng trên bảng ${PEOPLE_SYNC_SOURCES[source].label}`;
}

const PHOTO_WIDTH = 360;
const PHOTO_HEIGHT = 480;
const PHOTO_QUALITY = 72;
const MAX_PHOTO_BATCH = 8;
/** Chữ ký sống đủ cho một lượt đồng bộ vài trăm ảnh; hết hạn thì bấm đồng bộ lại. */
const PHOTO_JOB_TTL_MS = 60 * 60_000;

function photoJobSignature(code: string, source: string, exp: number, src: PeopleSyncSource) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw fail("Máy chủ chưa cấu hình AUTH_SECRET", 503);
  return createHmac("sha256", secret).update(`work-permit-photo
${src}
${code}
${source}
${exp}`).digest("base64url");
}
function signPhotoJob(code: string, source: string, exp: number, src: PeopleSyncSource): PhotoJob {
  return { code, source, exp, src, sig: photoJobSignature(code, source, exp, src) };
}
function photoJobValid(job: PhotoJob) {
  if (typeof job.sig !== "string" || !Number.isFinite(job.exp) || job.exp < Date.now() || !Object.hasOwn(PEOPLE_SYNC_SOURCES, job.src)) return false;
  const expected = Buffer.from(photoJobSignature(job.code, job.source, job.exp, job.src));
  const received = Buffer.from(job.sig);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function sheetConfig(source: PeopleSyncSource) {
  const { label, urlEnv, tokenEnv } = PEOPLE_SYNC_SOURCES[source];
  const url = process.env[urlEnv]?.trim();
  const token = process.env[tokenEnv]?.trim();
  if (!url || !token) throw fail(`Chưa cấu hình đồng bộ bảng nhân sự ${label} (${urlEnv}, ${tokenEnv}). Liên hệ quản trị.`, 503);
  return { url, token, tokenEnv };
}

/**
 * `notJson`: thông báo khi web app trả thứ không phải JSON. Lấy danh sách lỗi kiểu này thường là web app chưa có
 * chế độ JSON; còn lấy ảnh thì danh sách đã chạy được nên đó là trang lỗi tạm thời của Google.
 */
async function callSheet<T>(source: PeopleSyncSource, params: Record<string, string>, timeoutMs: number, notJson: string): Promise<T> {
  const { url, token, tokenEnv } = sheetConfig(source);
  const target = `${url}${url.includes("?") ? "&" : "?"}${new URLSearchParams({ ...params, token })}`;
  let res: Response;
  let text: string;
  try {
    res = await fetch(target, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    text = await res.text();
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw fail(`Google Sheets không phản hồi sau ${Math.round(timeoutMs / 1000)} giây (Google đang chậm). Thử lại sau.`, 504);
    }
    throw fail("Không kết nối được Google Sheets (lỗi mạng). Thử lại sau.", 502);
  }
  let json: { ok?: boolean; error?: string } & T;
  try { json = JSON.parse(text); } catch {
    throw fail(`${notJson} (HTTP ${res.status})`, 502);
  }
  if (!json.ok) throw fail(json.error === "token" ? `Mã khoá đồng bộ Google Sheets không khớp (${tokenEnv}).` : `Google Sheets báo lỗi: ${json.error ?? "không rõ"}`, 502);
  return json;
}

const str = (value: unknown, max = 200) => (value === null || value === undefined ? "" : String(value)).replace(/\s+/g, " ").trim().slice(0, max);
/** Ngày trong sheet: "yyyy-MM-dd" (Apps Script đã định dạng) hoặc "dd/MM/yyyy" gõ tay → 00:00 giờ Việt Nam. */
function sheetDate(value: unknown) {
  const text = str(value, 40);
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00+07:00`);
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return new Date(`${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}T00:00:00+07:00`);
  return null;
}
function sheetPhone(value: unknown) {
  const phone = str(value, 40);
  return /^[+()\d][\d\s.()-]{5,39}$/.test(phone) ? phone : "";
}

/**
 * KHOÁ GÀI đơn vị: TÊN TAB trong sheet phải trùng MÃ ĐƠN VỊ (tên gọi tắt) của một đơn vị trên sổ — so không
 * phân biệt hoa thường/dấu ("SINH LỘC" = "sinh loc"). Nhân sự của tab được gán ĐÚNG tên đơn vị trên sổ.
 * Tab không khớp mã nào (Dashboard, MẪU, đơn vị chưa đặt mã…) bị BỎ QUA cả tab, không tự tạo đơn vị mới.
 * Cột F "Đơn vị" trong sheet không dùng để gán đơn vị — gõ tay dễ lệch tên.
 */
async function unitByTab() {
  const companies = await prisma.workPermitCompany.findMany({ where: { code: { not: "" } }, select: { name: true, code: true, sctx: true, overhaul: true, investment: true } });
  const byCode = new Map(companies.map(c => [normalizeText(c.code), c.name]));
  const flags = new Map(companies.map(c => [c.name, c]));
  return { unitOf: (tab: string) => byCode.get(normalizeText(tab)) ?? null, flagsOf: (company: string) => flags.get(company) };
}

/**
 * Nhóm gán cho người MỚI của một đơn vị: mặc định theo bảng nguồn; đơn vị đã tick Đầu tư mà KHÔNG tick nhóm của
 * bảng nguồn (vd NARIME nằm trong bảng thẻ Đại tu nhưng là dự án đầu tư, 14/10/2026) → nhóm Đầu tư.
 */
export function newPersonScope(company: PermitCompanyScopes | undefined, source: PeopleSyncSource): PermitContractorScope {
  if (!company?.investment) return source;
  return (source === "OVERHAUL" ? company.overhaul : company.sctx) ? source : "INVESTMENT";
}

/**
 * Ảnh chèn trong ô: Apps Script chỉ trả được content URL `…googleusercontent.com/sheetsz/…` (hoặc "cell"), mà Google
 * cấp lại URL này sau vài giờ dù ảnh không đổi (đo 29/09: 83/83 dấu vết lệch so với lượt đồng bộ sáng cùng ngày) →
 * so dấu vết thì lượt nào cũng tải lại cả trăm ảnh. Nên người ĐÃ CÓ ẢNH thì bỏ qua ảnh chèn trong ô; link cố định
 * (Drive / http gõ vào ô) vẫn so dấu vết để thay ảnh khi link đổi.
 */
const isRotatingPhotoRef = (ref: string) => ref === "cell" || /googleusercontent\.com\/sheetsz\//.test(ref);
function photoNeedsFetch(before: { photoKey: string | null; photoSource: string } | undefined, ref: string) {
  if (!before?.photoKey) return true;
  return !isRotatingPhotoRef(ref) && before.photoSource !== ref;
}

/** Apps Script của bảng nguồn đã cấu hình chưa (cần để tải ảnh; danh sách đọc bằng Sheets API). */
const appsScriptReady = (source: PeopleSyncSource) => Boolean(process.env[PEOPLE_SYNC_SOURCES[source].urlEnv]?.trim() && process.env[PEOPLE_SYNC_SOURCES[source].tokenEnv]?.trim());

/**
 * Cột như web app Apps Script (syncListRows_): B kết quả HL, C họ tên, D năm sinh, E SĐT, F đơn vị, G gói thầu, H chức vụ,
 * I vị trí, J khu vực, K ngày HL, L số thẻ, M ngày cấp, N ngày hết hạn, O ảnh. Cùng điều kiện: có họ tên VÀ (ngày HL hoặc
 * số thẻ); bỏ hàng tiêu đề. Ngày lấy chữ đã định dạng ("28/09/2026") — sheetDate đọc được dd/MM/yyyy.
 */
export function peopleRowsFromValues(tab: string, values: string[][]): SheetRow[] {
  const out: SheetRow[] = [];
  for (const r of values) {
    const cell = (i: number) => String(r[i] ?? "").trim();
    const hoTen = cell(2), ngayHL = cell(10), soThe = cell(11);
    if (!hoTen || hoTen.includes("Họ tên") || soThe.includes("Số thẻ") || (!ngayHL && !soThe)) continue;
    const photo = cell(14);
    out.push({ sheet: tab, ketQuaHL: cell(1), hoTen, namSinh: cell(3), sdt: cell(4), donVi: cell(5), goiThau: cell(6), chucVu: cell(7),
      viTri: cell(8), khuVuc: cell(9), ngayHL, soThe, ngayCap: cell(12), ngayHetHan: cell(13), photo: /^https?:\/\//.test(photo) ? photo : "" });
  }
  return out;
}

async function readPeopleRows(source: PeopleSyncSource): Promise<{ rows: SheetRow[]; via: "api" | "apps-script" }> {
  const config = PEOPLE_SYNC_SOURCES[source];
  const id = process.env[config.sheetIdEnv]?.trim() || config.sheetId;
  try {
    const meta = await getSpreadsheet(id);
    const values = await batchGetValues(id, meta.tabs.map(tab => `${a1Tab(tab.title)}!A1:O${tab.rowCount}`));
    return { rows: meta.tabs.flatMap((tab, i) => peopleRowsFromValues(tab.title, values[i] ?? [])), via: "api" };
  } catch (error) {
    // Chưa chia sẻ / sai mã file → thử web app Apps Script (cách cũ). Lỗi mạng sau 3 lần thử: báo luôn, Apps Script còn chậm hơn.
    const fallback = error instanceof GoogleSheetsError && [403, 404].includes(error.status) && appsScriptReady(source);
    if (!fallback) throw error instanceof GoogleSheetsError ? fail(error.message, error.status) : error;
    // Phải nhỏ hơn proxy_read_timeout 180s của khối nginx riêng `location = /api/work-permits/people/sync`.
    const { rows } = await callSheet<{ rows: SheetRow[] }>(source, { format: "json" }, 150_000,
      "Google Sheets không trả dữ liệu JSON. Kiểm tra đã thêm đoạn code đồng bộ vào Apps Script và triển khai lại web app");
    if (!Array.isArray(rows)) throw fail("Dữ liệu Google Sheets không đúng định dạng (thiếu rows)", 502);
    return { rows, via: "apps-script" };
  }
}

/** Ngày Việt Nam yyyy-mm-dd — đánh dấu "đã thử tải ảnh hôm nay, sheet không có ảnh" (photoSource = none:<ngày>). */
const vnDay = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const NO_PHOTO = "none:";

export async function syncPeopleList(source: PeopleSyncSource = "OVERHAUL") {
  const { rows, via } = await readPeopleRows(source);
  const canFetchPhotos = appsScriptReady(source);
  const { unitOf, flagsOf } = await unitByTab();
  const skipped: string[] = [];
  const skippedTabs = new Map<string, number>();
  const byCode = new Map<string, Prisma.WorkPermitPersonCreateInput & { photoRef: string; tab: string }>();
  for (const row of rows) {
    const tab = str(row.sheet);
    // Bảng SCTX: số thẻ lưu kèm "/SXKD" (trùng dãy số với thẻ Đại tu nhưng là người khác — SCTX_CARD_SUFFIX).
    const sheetCard = normalizeCardCode(str(row.soThe, 80));
    const card = source === "SCTX" ? sctxCardCode(sheetCard) : sheetCard;
    const name = str(row.hoTen);
    if (!card && !name) continue;
    // Chưa có số thẻ (mới huấn luyện, cột K) → mã tạm theo họ tên, như QR bảng thẻ đang in (?id=<họ tên>).
    const code = card || cardlessCode(name);
    const company = unitOf(tab);
    if (!company) { skippedTabs.set(tab || "(không tên)", (skippedTabs.get(tab || "(không tên)") ?? 0) + 1); continue; }
    if (!/^[\p{L}\p{N}][\p{L}\p{N}\/._-]{0,79}$/u.test(code) || !name) {
      skipped.push(`${tab}: ${name || "(không tên)"} · số thẻ "${code}" không hợp lệ`);
      continue;
    }
    // Một số thẻ nằm ở hai tab (hai nhà thầu) → giữ tab gặp trước, báo để sửa sheet.
    const seen = byCode.get(code);
    if (seen) { skipped.push(`${tab}: ${name} · số thẻ ${code} trùng với tab ${seen.tab} (giữ tab ${seen.tab})`); continue; }
    const phone = sheetPhone(row.sdt);
    byCode.set(code, {
      code, name, company, phone, tab,
      birthYear: str(row.namSinh, 20), jobTitle: str(row.chucVu), workPackage: str(row.goiThau, 300),
      workPosition: str(row.viTri, 300), workArea: str(row.khuVuc, 300), trainingResult: str(row.ketQuaHL),
      trainedAt: sheetDate(row.ngayHL), cardIssuedAt: sheetDate(row.ngayCap), cardExpiresAt: sheetDate(row.ngayHetHan),
      searchText: normalizeText([code, name, company, phone].join(" ")), sheetSyncedAt: new Date(),
      photoRef: str(row.photo, 2000),
    });
  }
  // Người vừa được cấp thẻ: hồ sơ cũ mang mã tạm HL-… theo họ tên → đổi mã sang số thẻ trên CHÍNH hồ sơ đó
  // (giữ lịch sử lần làm việc, vai trò CHTT), chỉ khi cùng đơn vị và số thẻ chưa có hồ sơ riêng.
  const upgrades = new Map([...byCode.values()].filter(p => !isCardlessCode(p.code)).map(p => [cardlessCode(p.name), p.code]));
  const existingRows = await prisma.workPermitPerson.findMany({ where: { code: { in: [...byCode.keys(), ...upgrades.keys()] } }, select: { code: true, name: true, scope: true, phone: true, company: true, photoKey: true, photoSource: true } });
  const existing = new Map(existingRows.map(p => [p.code, p]));
  // Số thẻ đã là của người khác bên nhóm kia → bỏ dòng sheet, không ghi đè hồ sơ đó.
  const conflicts: string[] = [];
  for (const [code, data] of byCode) {
    const conflict = cardConflict(existing.get(code), { name: data.name, code, tab: data.tab }, source, newPersonScope(flagsOf(data.company), source));
    if (conflict) { conflicts.push(conflict); byCode.delete(code); }
  }
  const renameFrom = new Map<string, string>();
  for (const [temp, real] of upgrades) {
    const old = existing.get(temp);
    if (old && !existing.has(real) && !byCode.has(temp) && old.company === byCode.get(real)?.company) { renameFrom.set(real, temp); existing.set(real, old); }
  }
  let created = 0, updated = 0;
  const moved: string[] = [];
  // Thống kê theo đơn vị (08/10/2026): hộp đồng bộ hiện mỗi đơn vị có bao nhiêu người MỚI (kèm tên) trên tổng số trên sheet.
  const units = new Map<string, { code: string; company: string; total: number; created: number; createdNames: string[] }>();
  const photos: PhotoJob[] = [];
  const photoExp = Date.now() + PHOTO_JOB_TTL_MS;
  const entries = [...byCode.values()];
  for (let i = 0; i < entries.length; i += 100) {
    await prisma.$transaction(entries.slice(i, i + 100).map(({ photoRef, tab, ...data }) => {
      const before = existing.get(data.code);
      const unit = units.get(data.company) ?? { code: tab, company: data.company, total: 0, created: 0, createdNames: [] };
      unit.total++;
      if (!before) { unit.created++; if (unit.createdNames.length < 30) unit.createdNames.push(`${data.name} (${data.code})`); }
      units.set(data.company, unit);
      const fromCode = renameFrom.get(data.code) ?? data.code;
      if (before && before.company !== data.company) moved.push(`${data.name} (${data.code}): ${before.company} → ${data.company} (tab ${tab})`);
      // Sheets API không thấy ảnh chèn trong ô (chỉ thấy link) → người CHƯA có ảnh thì vẫn thử tải qua Apps Script ("cell");
      // sheet không có ảnh thì đánh dấu none:<ngày> và hôm đó không thử lại.
      const ref = photoRef || (before?.photoKey ? "" : "cell");
      const triedToday = !before?.photoKey && before?.photoSource === `${NO_PHOTO}${vnDay()}`;
      if (canFetchPhotos && ref && !triedToday && photoNeedsFetch(before, ref)) photos.push(signPhotoJob(data.code, ref, photoExp, source));
      // Người mới nhận nhóm theo bảng nguồn (đơn vị Đầu tư → Đầu tư); người đã có giữ nhóm trên sổ (sổ có thể đã chuyển nhóm tay).
      if (!before) { created++; return prisma.workPermitPerson.create({ data: { ...data, canCommand: false, isActive: true, scope: newPersonScope(flagsOf(data.company), source) } }); }
      updated++;
      // Sheet để trống SĐT thì giữ SĐT đã nhập trên sổ; vai trò CHTT/"đang hoạt động" không đụng tới.
      const phone = data.phone || before.phone;
      return prisma.workPermitPerson.update({ where: { code: fromCode }, data: {
        ...data, phone, searchText: normalizeText([data.code, data.name, data.company, phone].join(" ")), version: { increment: 1 },
      } });
    }));
  }
  return {
    source, sourceLabel: PEOPLE_SYNC_SOURCES[source].label, via, photosEnabled: canFetchPhotos, conflicts: conflicts.slice(0, 50), conflictCount: conflicts.length,
    total: byCode.size, created, updated, skipped: skipped.length, skippedSamples: skipped.slice(0, 20),
    skippedTabs: [...skippedTabs].map(([tab, rows]) => ({ tab, rows })).sort((a, b) => a.tab.localeCompare(b.tab, "vi")),
    moved: moved.slice(0, 50), movedCount: moved.length, photos,
    // Đơn vị có người mới lên đầu (nhiều nhất trước), còn lại theo mã.
    units: [...units.values()].sort((a, b) => b.created - a.created || a.code.localeCompare(b.code, "vi")),
  };
}

const photoKeyOf = (code: string) => `work-permit-people/photos/${code.replace(/[^\p{L}\p{N}._-]+/gu, "_")}.webp`;

/**
 * Tải + nén ảnh một nhóm người (≤ MAX_PHOTO_BATCH). Lỗi từng người không làm hỏng cả nhóm.
 * Chỉ nhận việc do bước list ký (không sửa được số thẻ / dấu vết ảnh), rồi TỰ TRA hồ sơ theo số thẻ trong DB
 * để quyết định hỏi Apps Script bằng gì — ảnh luôn thuộc đúng người, trình duyệt không chỉ định được.
 */
export async function syncPeoplePhotos(input: unknown) {
  if (!Array.isArray(input) || input.length > MAX_PHOTO_BATCH) throw fail(`Mỗi đợt tải tối đa ${MAX_PHOTO_BATCH} ảnh`);
  const jobs = input.map(item => {
    const job = item && typeof item === "object" ? item as Partial<PhotoJob> : {};
    return { code: str(job.code, 80), source: str(job.source, 2000), exp: Number(job.exp), sig: String(job.sig ?? ""), src: String(job.src ?? "") as PeopleSyncSource };
  });
  if (jobs.some(job => !photoJobValid(job))) throw fail("Danh sách ảnh không hợp lệ hoặc đã hết hạn. Bấm đồng bộ lại.", 400);
  const people = await prisma.workPermitPerson.findMany({ where: { code: { in: jobs.map(job => job.code) } }, select: { code: true, name: true } });
  const nameOf = new Map(people.map(person => [person.code, person.name]));
  const results = await Promise.all(jobs.map(async job => {
    const code = job.code;
    try {
      const name = nameOf.get(code);
      if (name === undefined) throw new Error("Không còn hồ sơ của số thẻ này trên sổ");
      // Người chưa có thẻ (mã tạm HL-…): Apps Script tìm ảnh theo họ tên ở cột C; còn lại theo số thẻ.
      const ask = () => callSheet<{ contentType?: string; base64?: string }>(job.src, { format: "photo", id: isCardlessCode(code) ? name : cardNumberOf(code) }, 45_000,
        "Google tạm thời trả trang lỗi thay cho ảnh. Đồng bộ lại sau để tải tiếp");
      // Lỗi mạng (502) thử lại một lần sau 2 s; quá giờ / Apps Script báo lỗi thì không (đã tốn tới 45 s).
      const photo = await ask().catch(async error => {
        if (!(error instanceof Response) || error.status !== 502 || !/lỗi mạng/.test((await error.clone().json().catch(() => null))?.error ?? "")) throw error;
        await new Promise(resolve => setTimeout(resolve, 2_000));
        return ask();
      }).catch(async error => {
        const message = error instanceof Response ? (await error.clone().json().catch(() => null))?.error ?? "" : "";
        if (/Không có ảnh/.test(message)) await prisma.workPermitPerson.update({ where: { code }, data: { photoSource: `${NO_PHOTO}${vnDay()}` } }).catch(() => null);
        throw error;
      });
      if (!photo.base64) throw new Error("Sheet không có ảnh cho số thẻ này");
      // Ảnh 3x4 để so mặt: thu về tối đa 360x480, WebP q72 (~20–50 KB), xoay theo EXIF.
      const body = await sharp(Buffer.from(photo.base64, "base64")).rotate()
        .resize({ width: PHOTO_WIDTH, height: PHOTO_HEIGHT, fit: "inside", withoutEnlargement: true })
        .webp({ quality: PHOTO_QUALITY }).toBuffer();
      const key = await uploadS3Object({ key: photoKeyOf(code), body, contentType: "image/webp", originalName: `${code}.webp` });
      await prisma.workPermitPerson.update({ where: { code }, data: { photoKey: key, photoSource: job.source } });
      return { code, ok: true as const, size: body.length };
    } catch (error) {
      const message = error instanceof Response ? ((await error.json().catch(() => null))?.error ?? "Lỗi tải ảnh") : error instanceof Error ? error.message : "Lỗi tải ảnh";
      return { code, ok: false as const, error: message };
    }
  }));
  return { results };
}
