import type { DigitalDocument, Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { maybeUploadDataUrlList, publicUserRef } from "@/lib/s3";
import { parseDocumentDriveCandidates } from "@/lib/document-drive-candidates";
import { normalizeExternalDocumentUrl } from "@/lib/google-drive-document";
import { normalizeText } from "@/lib/nav";

export function procedureIdentity(row: { title: string; decisionNumber: string | null; documentUrl: string }) {
  return JSON.stringify([normalizeText(row.title), normalizeText(row.decisionNumber || ""), normalizeExternalDocumentUrl(row.documentUrl)]);
}

const CATEGORIES = new Set(["PROCEDURE", "PID", "ARCHIVE", "GRID_SEPARATION", "STARTUP_DATA", "BOILER_CALIBRATION", "OIL_GUN_DATA"]);
export function documentCategory(value: unknown) {
  const category = String(value ?? "").trim().toUpperCase();
  if (!CATEGORIES.has(category)) throw fail("Danh mục tài liệu không hợp lệ");
  return category;
}

export function parseDocumentInput(body: Record<string, unknown>, category: string) {
  const text = (key: string) => String(body[key] ?? "").trim();
  const title = text("title"), documentUrl = text("documentUrl"), date = text("issueDate");
  if (!title) throw fail("Vui lòng nhập tên tài liệu");
  if (!["GRID_SEPARATION", "STARTUP_DATA"].includes(category) && !documentUrl) throw fail("Vui lòng nhập nội dung hoặc link tài liệu");
  if (["PROCEDURE", "PID"].includes(category) && !normalizeExternalDocumentUrl(documentUrl)) throw fail("Link tài liệu phải bắt đầu bằng http:// hoặc https://");
  const issueDate = date ? new Date(date) : null;
  if (issueDate && (Number.isNaN(issueDate.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || issueDate.toISOString().slice(0, 10) !== date)) throw fail("Ngày ban hành không hợp lệ");
  const attachmentUrls = Array.isArray(body.attachmentUrls) ? body.attachmentUrls.map(String).map(v => v.trim())
    .filter(v => v.startsWith("data:image/") || /^https?:\/\//i.test(v)).slice(0, 2) : [];
  return { title, documentUrl, issueDate, decisionNumber: text("decisionNumber") || null,
    managingPosition: text("managingPosition") || null, managementBlock: text("managementBlock") || null,
    procedureType: text("procedureType") || null, reason: text("reason") || null,
    progress: text("progress") || null, timelineJson: text("timelineJson") || null, note: text("note") || null, attachmentUrls };
}

export async function documentWriteData(input: ReturnType<typeof parseDocumentInput>) {
  return { ...input, attachmentUrls: JSON.stringify(await maybeUploadDataUrlList(input.attachmentUrls, "digital-documents/attachments", "document-image")) };
}

function attachmentList(raw: string | null) {
  try { const value: unknown = JSON.parse(raw || "[]"); return Array.isArray(value) ? value.filter(v => typeof v === "string") : []; }
  catch { return []; }
}

/** Không thêm quan hệ Prisma vào bảng đang có: tra hai người cập nhật bằng một truy vấn. */
export async function publicDigitalDocuments(db: Prisma.TransactionClient, rows: DigitalDocument[]) {
  const ids = [...new Set(rows.flatMap(row => [row.createdById, row.updatedById]).filter((id): id is string => !!id))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } }) : [];
  const byId = new Map(users.map(user => [user.id, publicUserRef(user)]));
  return rows.map(row => ({ ...row, attachmentUrls: attachmentList(row.attachmentUrls),
    driveCandidateFiles: parseDocumentDriveCandidates(row.driveCandidateFiles),
    createdBy: row.createdById ? byId.get(row.createdById) ?? null : null,
    updatedBy: row.updatedById ? byId.get(row.updatedById) ?? null : null }));
}
