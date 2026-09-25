import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import { uploadS3Object } from "@/lib/s3";
import { normalizeCardCode } from "@/lib/work-permit-card";

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
export type PhotoJob = { code: string; source: string };

const PHOTO_WIDTH = 360;
const PHOTO_HEIGHT = 480;
const PHOTO_QUALITY = 72;
const MAX_PHOTO_BATCH = 8;

function sheetConfig() {
  const url = process.env.PERMIT_CARD_SHEET_URL?.trim();
  const token = process.env.PERMIT_CARD_SHEET_TOKEN?.trim();
  if (!url || !token) throw fail("Chưa cấu hình đồng bộ Google Sheets (PERMIT_CARD_SHEET_URL, PERMIT_CARD_SHEET_TOKEN). Liên hệ quản trị.", 503);
  return { url, token };
}

async function callSheet<T>(params: Record<string, string>, timeoutMs: number): Promise<T> {
  const { url, token } = sheetConfig();
  const target = `${url}${url.includes("?") ? "&" : "?"}${new URLSearchParams({ ...params, token })}`;
  let res: Response;
  try {
    res = await fetch(target, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw fail("Không kết nối được Google Sheets (quá thời gian hoặc mất mạng). Thử lại sau.", 502);
  }
  const text = await res.text();
  let json: { ok?: boolean; error?: string } & T;
  try { json = JSON.parse(text); } catch {
    // Web app chưa thêm chế độ JSON (trả trang HTML thẻ) hoặc chưa cấp quyền "Anyone".
    throw fail("Google Sheets không trả dữ liệu JSON. Kiểm tra đã thêm đoạn code đồng bộ vào Apps Script và triển khai lại web app.", 502);
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

export async function syncPeopleList() {
  const { rows } = await callSheet<{ rows: SheetRow[] }>({ format: "json" }, 90_000);
  if (!Array.isArray(rows)) throw fail("Dữ liệu Google Sheets không đúng định dạng (thiếu rows)", 502);
  const unitOf = await unitByTab();
  const skipped: string[] = [];
  const skippedTabs = new Map<string, number>();
  const byCode = new Map<string, Prisma.WorkPermitPersonCreateInput & { photoRef: string; tab: string }>();
  for (const row of rows) {
    const tab = str(row.sheet);
    const code = normalizeCardCode(str(row.soThe, 80));
    const name = str(row.hoTen);
    if (!code && !name) continue;
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
  const existing = new Map((await prisma.workPermitPerson.findMany({ where: { code: { in: [...byCode.keys()] } }, select: { code: true, phone: true, company: true, photoKey: true, photoSource: true } })).map(p => [p.code, p]));
  let created = 0, updated = 0;
  const moved: string[] = [];
  const photos: PhotoJob[] = [];
  const entries = [...byCode.values()];
  for (let i = 0; i < entries.length; i += 100) {
    await prisma.$transaction(entries.slice(i, i + 100).map(({ photoRef, tab, ...data }) => {
      const before = existing.get(data.code);
      if (before && before.company !== data.company) moved.push(`${data.name} (${data.code}): ${before.company} → ${data.company} (tab ${tab})`);
      if (photoRef && (!before?.photoKey || before.photoSource !== photoRef)) photos.push({ code: data.code, source: photoRef });
      if (!before) { created++; return prisma.workPermitPerson.create({ data: { ...data, canCommand: false, isActive: true } }); }
      updated++;
      // Sheet để trống SĐT thì giữ SĐT đã nhập trên sổ; vai trò CHTT/"đang hoạt động" không đụng tới.
      const phone = data.phone || before.phone;
      return prisma.workPermitPerson.update({ where: { code: data.code }, data: {
        ...data, phone, searchText: normalizeText([data.code, data.name, data.company, phone].join(" ")), version: { increment: 1 },
      } });
    }));
  }
  return {
    total: byCode.size, created, updated, skipped: skipped.length, skippedSamples: skipped.slice(0, 20),
    skippedTabs: [...skippedTabs].map(([tab, rows]) => ({ tab, rows })).sort((a, b) => a.tab.localeCompare(b.tab, "vi")),
    moved: moved.slice(0, 50), movedCount: moved.length, photos,
  };
}

const photoKeyOf = (code: string) => `work-permit-people/photos/${code.replace(/[^\p{L}\p{N}._-]+/gu, "_")}.webp`;

/** Tải + nén ảnh một nhóm người (≤ MAX_PHOTO_BATCH). Lỗi từng người không làm hỏng cả nhóm. */
export async function syncPeoplePhotos(jobs: PhotoJob[]) {
  if (!Array.isArray(jobs) || jobs.length > MAX_PHOTO_BATCH) throw fail(`Mỗi đợt tải tối đa ${MAX_PHOTO_BATCH} ảnh`);
  const results = await Promise.all(jobs.map(async job => {
    const code = normalizeCardCode(str(job?.code, 80));
    try {
      const photo = await callSheet<{ contentType?: string; base64?: string }>({ format: "photo", id: code }, 45_000);
      if (!photo.base64) throw new Error("Sheet không có ảnh cho số thẻ này");
      // Ảnh 3x4 để so mặt: thu về tối đa 360x480, WebP q72 (~20–50 KB), xoay theo EXIF.
      const body = await sharp(Buffer.from(photo.base64, "base64")).rotate()
        .resize({ width: PHOTO_WIDTH, height: PHOTO_HEIGHT, fit: "inside", withoutEnlargement: true })
        .webp({ quality: PHOTO_QUALITY }).toBuffer();
      const key = await uploadS3Object({ key: photoKeyOf(code), body, contentType: "image/webp", originalName: `${code}.webp` });
      await prisma.workPermitPerson.update({ where: { code }, data: { photoKey: key, photoSource: str(job.source, 2000) } });
      return { code, ok: true as const, size: body.length };
    } catch (error) {
      const message = error instanceof Response ? ((await error.json().catch(() => null))?.error ?? "Lỗi tải ảnh") : error instanceof Error ? error.message : "Lỗi tải ảnh";
      return { code, ok: false as const, error: message };
    }
  }));
  return { results };
}
