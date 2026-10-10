import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { positionCodeOf } from "@/lib/position-catalog";
import { defectResultStatusOf } from "@/lib/defect-result-status";
import { statusOf, unitOf } from "@/lib/defect-source-sync";
import { statusLabel } from "@/lib/defect-sheet-write-plan";
import { N8N_DEFECT_SOURCE_SPREADSHEET_IDS, type N8nDefectSource } from "@/lib/defect-n8n-sync";

/** Lỗi đọc/ghi Sheet (qua n8n) — route đổi thành phản hồi có thông điệp tiếng Việt. */
class SheetProxyError extends Error {
  constructor(message: string, readonly status = 502) { super(message); this.name = "SheetProxyError"; }
}

/*
 * MỤC TẠM — gỡ sau khi rà xong (10/10/2026). n8n bỏ các dòng trống cột STT (1) — phần lớn là dòng nhắc lại cũ — nên web
 * không thấy chúng. Ở đây web nhờ workflow n8n "Dòng chưa số — đọc/ghi" (docs/n8n-defect-sync/workflow-unnumbered-proxy.json)
 * đọc/ghi Sheet bằng tài khoản Google n8n đang dùng (service account không được chia sẻ Sheet), CHỈ để rà cột 14 (Ghi chú KQ sửa chữa VH1) so với
 * "Kết quả thực hiện (SCCN)" rồi ghi cột 14 ngược lên đúng dòng. Không cấp số, không tạo Defect, không đụng logic nhắc lại;
 * ai điền STT cho dòng nào trên Sheet thì dòng đó tự rời danh sách và đi luồng đồng bộ n8n như thường.
 *
 * Khoá dòng = băm nội dung (KHÔNG gồm số dòng — chèn dòng làm xô). Trước khi ghi luôn đọc lại cả tab và tìm lại dòng theo
 * khoá, nên ghi không bao giờ rơi nhầm sang dòng đã xô hay dòng vừa được điền số.
 */

export const UNNUMBERED_SOURCES: Record<N8nDefectSource, { tab: string; label: string }> = {
  CO: { tab: "DH1", label: "Sheet Cơ - Hóa" },
  DIEN: { tab: "DH1", label: "Sheet Điện" },
};
export const UNNUMBERED_STATUSES = ["CHUA_XU_LY", "CO_PCT", "CHO_VAT_TU", "CHO_NGUNG_MAY", "DA_XU_LY"] as const;
export type UnnumberedStatus = (typeof UNNUMBERED_STATUSES)[number];

const START_ROW = 6; // vùng đọc A6:AA — giống n8n
/** Workflow n8n chỉ cho ghi đúng cột này (cột 14). Sheet chèn cột thì web báo lỗi thay vì ghi lệch. */
const STATUS_COLUMN_LETTER = "N";
const STATUS_COLUMN_INDEX = 13;

/** Cùng webhook + mã với nút "Đồng bộ" (N8N_DEFECT_MANUAL_WEBHOOK_URL), chỉ khác đường dẫn. */
function proxyUrl() {
  const own = process.env.N8N_DEFECT_UNNUMBERED_WEBHOOK_URL?.trim();
  if (own) return own;
  const manual = process.env.N8N_DEFECT_MANUAL_WEBHOOK_URL?.trim();
  return manual ? manual.replace(/[^/]+\/?$/, "defects-unnumbered-dh1") : null;
}

async function callProxy<T>(body: object): Promise<T> {
  const url = proxyUrl();
  const token = process.env.N8N_DEFECT_SYNC_TOKEN?.trim();
  if (!url || !token) throw new SheetProxyError("Chưa cấu hình webhook n8n để đọc/ghi Sheet", 503);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new SheetProxyError("Không kết nối được n8n để đọc/ghi Sheet. Thử lại sau.", 502);
  }
  const json = await response.json().catch(() => null) as { ok?: boolean; error?: string } & T | null;
  if (response.status === 404) throw new SheetProxyError("Workflow n8n “Dòng chưa số — đọc/ghi” chưa bật.", 503);
  if (!response.ok || !json || json.ok !== true) throw new SheetProxyError(`n8n báo lỗi khi đọc/ghi Sheet: ${json?.error ?? response.status}`, 502);
  return json;
}

/** Không đọc lại Sheet nếu lượt trước chưa quá chừng này (đỡ dồn lượt gọi Google qua n8n). */
const MIN_REFRESH_MS = 30_000;

type Layout = { numberedIndex: number; col: Map<number, number>; repairResult: number | null };
export type ParsedUnnumberedRow = {
  identityHash: string; sourceRow: number; unit: string; unitRaw: string; deviceRaw: string; positionRaw: string;
  positionCode: string | null; system: string | null; content: string; detectedAtRaw: string; reminderRaw: string;
  sheetStatusRaw: string; sheetStatus: UnnumberedStatus; repairResultRaw: string; suggestedStatus: UnnumberedStatus | null; mismatch: boolean;
};

const text = (value: unknown) => String(value ?? "").trim();

/** Dòng đánh số "(1) (2) … (n)" ngay dưới tiêu đề: cột theo số — không cố định chữ cột vì Sheet hay chèn cột. */
function layoutOf(rows: string[][]): Layout | string {
  const numberedIndex = rows.slice(0, 15).findIndex(row => row.filter(cell => /^\(\d{1,2}\)$/.test(text(cell))).length >= 5);
  if (numberedIndex < 0) return "không thấy dòng đánh số cột (1) (2) … dưới tiêu đề";
  const col = new Map<number, number>();
  rows[numberedIndex].forEach((cell, index) => {
    const match = text(cell).match(/^\((\d{1,2})\)$/);
    if (match && !col.has(Number(match[1]))) col.set(Number(match[1]), index);
  });
  for (const n of [1, 5, 14]) if (!col.has(n)) return `không thấy cột (${n})`;
  // "Kết quả thực hiện (SCCN)" không có số cột — tìm theo tiêu đề (gộp các dòng tiêu đề phía trên dòng đánh số).
  const width = Math.max(...rows.slice(0, numberedIndex + 1).map(row => row.length));
  const headers = Array.from({ length: width }, (_, index) => normalizeText(rows.slice(0, numberedIndex).map(row => text(row[index])).join(" ")));
  const pick = (test: (header: string) => boolean) => { const index = headers.findIndex(test); return index < 0 ? null : index; };
  const repairResult = pick(h => h.includes("ket qua thuc hien") && /sccn|dtd/.test(h)) ?? pick(h => h.includes("ket qua thuc hien"));
  return { numberedIndex, col, repairResult };
}

function asStatus(value: string): UnnumberedStatus {
  return statusOf(value) as UnnumberedStatus;
}

export function parseUnnumberedRows(spreadsheetId: string, tab: string, rows: string[][]) {
  const layout = layoutOf(rows);
  if (typeof layout === "string") throw new SheetProxyError(`${tab}: ${layout}`, 422);
  if (layout.col.get(14) !== STATUS_COLUMN_INDEX) throw new SheetProxyError(`${tab}: cột 14 không còn ở cột ${STATUS_COLUMN_LETTER} — Sheet đã chèn/xoá cột, cần sửa lại mục này.`, 422);
  const cell = (row: string[], n: number) => { const index = layout.col.get(n); return index === undefined ? "" : text(row[index]); };
  const seen = new Map<string, number>();
  const items: ParsedUnnumberedRow[] = [];
  for (let index = layout.numberedIndex + 1; index < rows.length; index++) {
    const row = rows[index] ?? [];
    const content = cell(row, 5);
    if (cell(row, 1) || !content || /^\(\d{1,2}\)$/.test(content)) continue;
    const [unitRaw, deviceRaw, positionRaw, detectedAtRaw] = [cell(row, 2), cell(row, 3), cell(row, 4), cell(row, 6)];
    const base = createHash("sha256").update(JSON.stringify([spreadsheetId, tab, ...[content, detectedAtRaw, positionRaw, unitRaw, deviceRaw].map(normalizeText)])).digest("hex");
    // Hai dòng giống hệt nhau: phân biệt theo thứ tự xuất hiện (ghi vào dòng nào cũng cùng một nội dung).
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    const sheetStatusRaw = cell(row, 14);
    const repairResultRaw = layout.repairResult === null ? "" : text(row[layout.repairResult]);
    const sheetStatus = asStatus(sheetStatusRaw);
    const suggestedStatus = defectResultStatusOf(repairResultRaw);
    items.push({
      identityHash: `${base}:${occurrence}`, sourceRow: START_ROW + index, unit: unitOf(unitRaw), unitRaw, deviceRaw, positionRaw,
      positionCode: positionCodeOf(positionRaw), system: positionRaw.replace(/^\d+\.\s*/, "") || null, content, detectedAtRaw,
      reminderRaw: cell(row, 8), sheetStatusRaw, sheetStatus, repairResultRaw, suggestedStatus,
      mismatch: suggestedStatus !== null && suggestedStatus !== sheetStatus,
    });
  }
  return { items, statusColumn: layout.col.get(14)! };
}

/** Lỗi đọc/ghi → phản hồi có thông điệp tiếng Việt thay vì 500 chung chung. */
async function sheets<T>(fn: () => Promise<T>) {
  try { return await fn(); } catch (error) {
    if (error instanceof SheetProxyError) throw fail(error.message, error.status);
    throw error;
  }
}

async function readSource(source: N8nDefectSource) {
  const spreadsheetId = N8N_DEFECT_SOURCE_SPREADSHEET_IDS[source];
  const { tab } = UNNUMBERED_SOURCES[source];
  return sheets(async () => {
    const { values } = await callProxy<{ values?: unknown[][] }>({ action: "read", source });
    const rows = (values ?? []).map(row => (Array.isArray(row) ? row : []).map(cell => (cell === null || cell === undefined ? "" : String(cell))));
    return { spreadsheetId, tab, ...parseUnnumberedRows(spreadsheetId, tab, rows) };
  });
}

export async function lastUnnumberedReadAt(source: N8nDefectSource) {
  const row = await prisma.defectUnnumberedRow.findFirst({ where: { source }, orderBy: { lastReadAt: "desc" }, select: { lastReadAt: true } });
  return row?.lastReadAt ?? null;
}

/** Đọc lại tab, thay toàn bộ ảnh chụp của nguồn đó. Dòng không còn thấy (đã điền số / bị xoá) thì xoá khỏi bảng. */
export async function refreshUnnumberedRows(source: N8nDefectSource, { force = false } = {}) {
  const last = await lastUnnumberedReadAt(source);
  if (!force && last && Date.now() - last.getTime() < MIN_REFRESH_MS) return { skipped: true, count: null };
  const { spreadsheetId, tab, items } = await readSource(source);
  const now = new Date();
  await prisma.$transaction(async tx => {
    await tx.defectUnnumberedRow.deleteMany({ where: { source, identityHash: { notIn: items.map(item => item.identityHash) } } });
    for (const item of items) {
      const data = { ...item, source, spreadsheetId, sheetName: tab, lastReadAt: now };
      await tx.defectUnnumberedRow.upsert({ where: { identityHash: item.identityHash }, create: data, update: data });
    }
  }, { timeout: 60_000 });
  return { skipped: false, count: items.length };
}

/**
 * Ghi cột 14 cho các dòng đã chọn. Đọc lại cả tab rồi tìm lại từng dòng theo khoá: không thấy (dòng đã sửa nội dung, đã điền
 * STT hoặc bị xoá) thì từ chối cả lượt — người dùng bấm Đọc lại rồi làm lại. Nhãn ghi đúng nhãn outbox vẫn ghi vào cột này
 * (trùng danh sách thả xuống của Sheet: "Đã xử lý xong", "Đang xử lý"…).
 */
export async function writeUnnumberedStatuses(source: N8nDefectSource, changes: Array<{ id: string; identityHash: string; status: UnnumberedStatus }>) {
  if (!changes.length) return [];
  const { items } = await readSource(source);
  const byHash = new Map(items.map(item => [item.identityHash, item]));
  const targets = changes.map(change => ({ change, current: byHash.get(change.identityHash) }));
  const lost = targets.filter(target => !target.current).length;
  if (lost) throw fail(`${lost} dòng đã thay đổi trên Sheet (sửa nội dung, đã điền STT hoặc bị xoá) — bấm “Đọc lại từ Sheet” rồi làm lại.`, 409);
  const data = targets.map(({ change, current }) => ({ row: current!.sourceRow, value: statusLabel(change.status) }));
  await sheets(() => callProxy({ action: "write", source, column: STATUS_COLUMN_LETTER, cells: data }));
  return targets.map(({ change, current }, index) => ({ ...change, sourceRow: current!.sourceRow, label: data[index].value, previous: current!.sheetStatusRaw }));
}
