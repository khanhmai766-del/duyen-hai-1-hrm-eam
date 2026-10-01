import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

/*
 * Google Sheets API bằng service account — dùng chung cho đọc hạng mục đại tu và (đợt 2) ghi kết quả ngày.
 *
 * Khoá JSON của service account nằm NGOÀI repo (server: /root/.config/dh1-google-sa.json, quyền 600), .env chỉ trỏ
 * đường dẫn: GOOGLE_SA_KEY_FILE. Mỗi file Sheets phải được chia sẻ cho email của service account (Người chỉnh sửa).
 * Không thêm thư viện: JWT RS256 ký bằng node:crypto, gọi REST trực tiếp. Xem docs/dai-tu-google-sheets.md.
 */

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TIMEOUT_MS = 45_000;

type ServiceAccountKey = { client_email: string; private_key: string; private_key_id?: string };

export class GoogleSheetsError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "GoogleSheetsError";
  }
}

let cachedKey: ServiceAccountKey | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

function serviceAccount(): ServiceAccountKey {
  if (cachedKey) return cachedKey;
  const path = process.env.GOOGLE_SA_KEY_FILE?.trim();
  if (!path) throw new GoogleSheetsError("Máy chủ chưa cấu hình tài khoản dịch vụ Google (GOOGLE_SA_KEY_FILE). Liên hệ quản trị.", 503);
  let key: ServiceAccountKey;
  try {
    key = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new GoogleSheetsError("Không đọc được tệp khoá tài khoản dịch vụ Google trên máy chủ. Liên hệ quản trị.", 503);
  }
  if (!key.client_email || !key.private_key) throw new GoogleSheetsError("Tệp khoá tài khoản dịch vụ Google không hợp lệ.", 503);
  cachedKey = key;
  return key;
}

/** Email cần được chia sẻ quyền trên mỗi file — hiện trong thông báo lỗi để người dùng tự xử lý. */
export function serviceAccountEmail() {
  try { return serviceAccount().client_email; } catch { return null; }
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const key = serviceAccount();
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "RS256", typ: "JWT", ...(key.private_key_id ? { kid: key.private_key_id } : {}) })}.${b64({
    iss: key.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const assertion = `${body}.${createSign("RSA-SHA256").update(body).sign(key.private_key, "base64url")}`;
  const res = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const json = await res.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new GoogleSheetsError(`Google từ chối khoá tài khoản dịch vụ: ${json.error_description ?? res.status}`, 502);
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

async function request(url: string, init: RequestInit) {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new GoogleSheetsError(`Google Sheets không phản hồi sau ${TIMEOUT_MS / 1000} giây. Thử lại sau.`, 504);
    throw new GoogleSheetsError("Không kết nối được Google Sheets (lỗi mạng). Thử lại sau.", 502);
  }
}

async function sheetsApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await request(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${await accessToken()}` },
  });
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (res.ok) return json;
  const email = serviceAccountEmail();
  if (res.status === 403) throw new GoogleSheetsError(`File chưa được chia sẻ cho tài khoản dịch vụ${email ? ` ${email}` : ""} (cần quyền Người chỉnh sửa).`, 403);
  if (res.status === 404) throw new GoogleSheetsError("Không tìm thấy file — kiểm tra lại link sheet tiến độ.", 404);
  throw new GoogleSheetsError(`Google Sheets báo lỗi ${res.status}: ${json.error?.message ?? "không rõ"}`, 502);
}

/** Mã file từ link chia sẻ (https://docs.google.com/spreadsheets/d/<id>/edit…). */
export function spreadsheetIdFromUrl(url: string) {
  return /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(url)?.[1] ?? null;
}

export type SheetTab = { title: string; sheetId: number; rowCount: number; columnCount: number };

export async function getSpreadsheet(id: string) {
  const json = await sheetsApi<{ properties: { title: string }; sheets: Array<{ properties: { title: string; sheetId: number; gridProperties?: { rowCount?: number; columnCount?: number } } }> }>(
    `${encodeURIComponent(id)}?fields=${encodeURIComponent("properties.title,sheets.properties(title,sheetId,gridProperties(rowCount,columnCount))")}`
  );
  return {
    title: json.properties.title,
    tabs: json.sheets.map((sheet): SheetTab => ({
      title: sheet.properties.title,
      sheetId: sheet.properties.sheetId,
      rowCount: sheet.properties.gridProperties?.rowCount ?? 0,
      columnCount: sheet.properties.gridProperties?.columnCount ?? 0,
    })),
  };
}

/** Đọc nhiều vùng một lần (giá trị hiển thị, như người dùng thấy). Trả mảng theo đúng thứ tự `ranges`. */
export async function batchGetValues(id: string, ranges: string[]) {
  if (!ranges.length) return [] as string[][][];
  const query = ranges.map(range => `ranges=${encodeURIComponent(range)}`).join("&");
  const json = await sheetsApi<{ valueRanges?: Array<{ values?: unknown[][] }> }>(
    `${encodeURIComponent(id)}/values:batchGet?${query}&valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`
  );
  return (json.valueRanges ?? []).map(range => (range.values ?? []).map(row => row.map(cell => (cell === null || cell === undefined ? "" : String(cell)))));
}

/** Tên tab trong ký hiệu vùng A1 ('Lò- Cơ'!A1:F10) — nháy đơn trong tên phải nhân đôi. */
export function a1Tab(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

/** Chỉ số cột (0 = A) → chữ cột. */
export function columnLetter(index: number) {
  let n = index + 1, letters = "";
  while (n > 0) { const r = (n - 1) % 26; letters = String.fromCharCode(65 + r) + letters; n = Math.floor((n - 1) / 26); }
  return letters;
}
