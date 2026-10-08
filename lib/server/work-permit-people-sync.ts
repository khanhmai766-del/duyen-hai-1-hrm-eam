import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import { uploadS3Object } from "@/lib/s3";
import { normalizeCardCode, cardlessCode, isCardlessCode } from "@/lib/work-permit-card";

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
 */

export type SheetRow = {
  sheet?: string; soThe?: unknown; hoTen?: unknown; namSinh?: unknown; sdt?: unknown; donVi?: unknown; goiThau?: unknown;
  chucVu?: unknown; viTri?: unknown; khuVuc?: unknown; ketQuaHL?: unknown; ngayHL?: unknown; ngayCap?: unknown; ngayHetHan?: unknown; photo?: unknown;
};
/**
 * Một ảnh cần tải, do bước list tạo và KÝ; trình duyệt chỉ chuyển nguyên văn sang bước photos. `source` là dấu
 * vết ảnh trong sheet (lưu vào photoSource để lần sau biết ảnh có đổi không), `exp` là hạn chữ ký (ms).
 */
export type PhotoJob = { code: string; source: string; exp: number; sig: string };

const PHOTO_WIDTH = 360;
const PHOTO_HEIGHT = 480;
const PHOTO_QUALITY = 72;
const MAX_PHOTO_BATCH = 8;
/** Chữ ký sống đủ cho một lượt đồng bộ vài trăm ảnh; hết hạn thì bấm đồng bộ lại. */
const PHOTO_JOB_TTL_MS = 60 * 60_000;

function photoJobSignature(code: string, source: string, exp: number) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw fail("Máy chủ chưa cấu hình AUTH_SECRET", 503);
  return createHmac("sha256", secret).update(`work-permit-photo
${code}
${source}
${exp}`).digest("base64url");
}
function signPhotoJob(code: string, source: string, exp: number): PhotoJob {
  return { code, source, exp, sig: photoJobSignature(code, source, exp) };
}
function photoJobValid(job: PhotoJob) {
  if (typeof job.sig !== "string" || !Number.isFinite(job.exp) || job.exp < Date.now()) return false;
  const expected = Buffer.from(photoJobSignature(job.code, job.source, job.exp));
  const received = Buffer.from(job.sig);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function sheetConfig() {
  const url = process.env.PERMIT_CARD_SHEET_URL?.trim();
  const token = process.env.PERMIT_CARD_SHEET_TOKEN?.trim();
  if (!url || !token) throw fail("Chưa cấu hình đồng bộ Google Sheets (PERMIT_CARD_SHEET_URL, PERMIT_CARD_SHEET_TOKEN). Liên hệ quản trị.", 503);
  return { url, token };
}

/**
 * `notJson`: thông báo khi web app trả thứ không phải JSON. Lấy danh sách lỗi kiểu này thường là web app chưa có
 * chế độ JSON; còn lấy ảnh thì danh sách đã chạy được nên đó là trang lỗi tạm thời của Google.
 */
async function callSheet<T>(params: Record<string, string>, timeoutMs: number, notJson: string): Promise<T> {
  const { url, token } = sheetConfig();
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
  if (!json.ok) throw fail(json.error === "token" ? "Mã khoá đồng bộ Google Sheets không khớp (PERMIT_CARD_SHEET_TOKEN)." : `Google Sheets báo lỗi: ${json.error ?? "không rõ"}`, 502);
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
  const companies = await prisma.workPermitCompany.findMany({ where: { code: { not: "" } }, select: { name: true, code: true } });
  const byCode = new Map(companies.map(c => [normalizeText(c.code), c.name]));
  return (tab: string) => byCode.get(normalizeText(tab)) ?? null;
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

export async function syncPeopleList() {
  // Apps Script có lúc trả cả danh sách chậm hơn 60s. Phải nhỏ hơn proxy_read_timeout 180s của khối nginx riêng
  // `location = /api/work-permits/people/sync` (thêm 07/10/2026) để người dùng thấy câu báo lỗi của app thay vì 504 trơn.
  const { rows } = await callSheet<{ rows: SheetRow[] }>({ format: "json" }, 150_000,
    "Google Sheets không trả dữ liệu JSON. Kiểm tra đã thêm đoạn code đồng bộ vào Apps Script và triển khai lại web app");
  if (!Array.isArray(rows)) throw fail("Dữ liệu Google Sheets không đúng định dạng (thiếu rows)", 502);
  const unitOf = await unitByTab();
  const skipped: string[] = [];
  const skippedTabs = new Map<string, number>();
  const byCode = new Map<string, Prisma.WorkPermitPersonCreateInput & { photoRef: string; tab: string }>();
  for (const row of rows) {
    const tab = str(row.sheet);
    const card = normalizeCardCode(str(row.soThe, 80));
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
  const existingRows = await prisma.workPermitPerson.findMany({ where: { code: { in: [...byCode.keys(), ...upgrades.keys()] } }, select: { code: true, phone: true, company: true, photoKey: true, photoSource: true } });
  const existing = new Map(existingRows.map(p => [p.code, p]));
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
      if (photoRef && photoNeedsFetch(before, photoRef)) photos.push(signPhotoJob(data.code, photoRef, photoExp));
      if (!before) { created++; return prisma.workPermitPerson.create({ data: { ...data, canCommand: false, isActive: true, scope: "OVERHAUL" } }); }
      updated++;
      // Sheet để trống SĐT thì giữ SĐT đã nhập trên sổ; vai trò CHTT/"đang hoạt động" không đụng tới.
      const phone = data.phone || before.phone;
      return prisma.workPermitPerson.update({ where: { code: fromCode }, data: {
        ...data, phone, searchText: normalizeText([data.code, data.name, data.company, phone].join(" ")), version: { increment: 1 },
      } });
    }));
  }
  return {
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
    return { code: str(job.code, 80), source: str(job.source, 2000), exp: Number(job.exp), sig: String(job.sig ?? "") };
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
      const photo = await callSheet<{ contentType?: string; base64?: string }>({ format: "photo", id: isCardlessCode(code) ? name : code }, 45_000,
        "Google tạm thời trả trang lỗi thay cho ảnh. Đồng bộ lại sau để tải tiếp");
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
