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
  // Ô nằm trong vùng bảo vệ: Google trả 400/403 kèm câu "protected" — khác hẳn lỗi chưa chia sẻ file.
  if (/protected/i.test(json.error?.message ?? "")) throw new GoogleSheetsError(`Ô cần ghi nằm trong vùng bị khoá (bảo vệ) của Sheet — cấp quyền sửa vùng đó cho${email ? ` ${email}` : " tài khoản dịch vụ"}.`, 403);
  // Vượt hạn mức gọi/phút (60 đọc + 60 ghi mỗi phút cho một service account): không phải lỗi thật, chờ rồi gọi lại.
  if (res.status === 429) throw new GoogleSheetsError("Google Sheets đang giới hạn số lần gọi mỗi phút — sẽ tự ghi lại sau ít phút.", 429);
  if (res.status === 403) throw new GoogleSheetsError(`File chưa được chia sẻ cho tài khoản dịch vụ${email ? ` ${email}` : ""} (cần quyền Người chỉnh sửa).`, 403);
  if (res.status === 404) throw new GoogleSheetsError("Không tìm thấy file — kiểm tra lại link sheet tiến độ.", 404);
  throw new GoogleSheetsError(`Google Sheets báo lỗi ${res.status}: ${json.error?.message ?? "không rõ"}`, 502);
}

/** Mã file từ link chia sẻ (https://docs.google.com/spreadsheets/d/<id>/edit…). */
export function spreadsheetIdFromUrl(url: string) {
  return /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(url)?.[1] ?? null;
}

export type SheetTab = { title: string; sheetId: number; rowCount: number; columnCount: number };
export type GridRange = { sheetId?: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number };
export type ConditionalFormat = {
  ranges?: GridRange[];
  booleanRule?: { condition?: { type?: string; values?: Array<{ userEnteredValue?: string }> }; format?: { backgroundColor?: object; textFormat?: { foregroundColor?: object } } };
};

/**
 * Danh sách thả xuống (ONE_OF_LIST) của từng ô trong mỗi vùng — mỗi vùng trả mảng theo hàng, mỗi hàng là các lựa chọn nối
 * bằng "|" ("" = không có). Dùng để không đặt lại danh sách đã đúng (đặt lại sẽ xoá màu chip người dùng tự chỉnh).
 */
export async function getValidationLists(id: string, ranges: string[]) {
  if (!ranges.length) return [] as string[][];
  const query = ranges.map(range => `ranges=${encodeURIComponent(range)}`).join("&");
  const json = await sheetsApi<{ sheets: Array<{ data?: Array<{ rowData?: Array<{ values?: Array<{ dataValidation?: { condition?: { values?: Array<{ userEnteredValue?: string }> } } }> }> }> }> }>(
    `${encodeURIComponent(id)}?${query}&fields=${encodeURIComponent("sheets(data(rowData(values(dataValidation(condition(values(userEnteredValue)))))))")}`
  );
  // spreadsheets.get gom theo tab: mỗi vùng là một phần tử `data` của đúng tab đó, theo thứ tự vùng trong cùng tab.
  return json.sheets.flatMap(sheet => (sheet.data ?? []).map(block => (block.rowData ?? []).map(row => (row.values?.[0]?.dataValidation?.condition?.values ?? []).map(v => v.userEnteredValue ?? "").join("|"))));
}

/** Ô gộp + định dạng có điều kiện của từng tab (dùng cho bước chuẩn hoá Sheet). */
export async function getSheetFormatting(id: string) {
  const json = await sheetsApi<{ sheets: Array<{ properties: { title: string; sheetId: number }; merges?: GridRange[]; conditionalFormats?: ConditionalFormat[] }> }>(
    `${encodeURIComponent(id)}?fields=${encodeURIComponent("sheets(properties(title,sheetId),merges,conditionalFormats)")}`
  );
  return new Map(json.sheets.map(sheet => [sheet.properties.title, { sheetId: sheet.properties.sheetId, merges: sheet.merges ?? [], conditionalFormats: sheet.conditionalFormats ?? [] }]));
}

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

/**
 * Đọc nhiều vùng một lần (mặc định giá trị hiển thị, như người dùng thấy; "FORMULA" = công thức gốc). Trả mảng theo
 * đúng thứ tự `ranges`.
 */
export async function batchGetValues(id: string, ranges: string[], render: "FORMATTED_VALUE" | "FORMULA" = "FORMATTED_VALUE") {
  if (!ranges.length) return [] as string[][][];
  const query = ranges.map(range => `ranges=${encodeURIComponent(range)}`).join("&");
  const json = await sheetsApi<{ valueRanges?: Array<{ values?: unknown[][] }> }>(
    `${encodeURIComponent(id)}/values:batchGet?${query}&valueRenderOption=${render}&majorDimension=ROWS`
  );
  return (json.valueRanges ?? []).map(range => (range.values ?? []).map(row => row.map(cell => (cell === null || cell === undefined ? "" : String(cell)))));
}

/**
 * Ghi nhiều ô một lần (một lượt gọi = tất cả cùng thành công hoặc cùng lỗi). RAW: chữ ghi nguyên văn, số ghi dạng số
 * (định dạng % của ô giữ nguyên). Ghi giá trị vào ô đang có công thức sẽ thay công thức đó.
 */
export async function batchUpdateValues(id: string, data: Array<{ range: string; value: string | number }>, input: "RAW" | "USER_ENTERED" = "RAW") {
  if (!data.length) return;
  await sheetsApi(`${encodeURIComponent(id)}/values:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // USER_ENTERED: chuỗi "=…" thành công thức, theo locale của file (vi_VN: dấu ";").
    body: JSON.stringify({ valueInputOption: input, data: data.map(item => ({ range: item.range, majorDimension: "ROWS", values: [[item.value]] })) }),
  });
}

/** spreadsheets.batchUpdate (đổi data validation…). */
export async function batchUpdateSpreadsheet(id: string, requests: object[]) {
  if (!requests.length) return;
  await sheetsApi(`${encodeURIComponent(id)}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
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
