import { googleDriveFileViewUrl, normalizeGoogleDriveId } from "@/lib/google-drive-document";

export type DocumentDriveCandidate = {
  id: string;
  name: string;
  mimeType: "application/pdf";
  modifiedTime: string | null;
  md5Checksum: string | null;
  webViewLink: string;
  size: number | null;
};

const MAX_CANDIDATES = 100;

function text(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function isoDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function fileSize(value: unknown) {
  const size = Number(value);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}

/** Chuẩn hóa danh sách PDF do Google Drive trả về trước khi lưu hoặc đưa ra giao diện. */
export function parseDocumentDriveCandidates(value: unknown): DocumentDriveCandidate[] {
  let input = value;
  if (typeof value === "string") {
    try {
      input = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const result: DocumentDriveCandidate[] = [];
  for (const raw of input.slice(0, MAX_CANDIDATES)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const id = normalizeGoogleDriveId(text(item.id, 200));
    const name = text(item.name, 500);
    if (!id || !name || seen.has(id) || item.mimeType !== "application/pdf") continue;
    seen.add(id);
    result.push({
      id,
      name,
      mimeType: "application/pdf",
      modifiedTime: isoDate(item.modifiedTime),
      md5Checksum: text(item.md5Checksum, 200) || null,
      webViewLink: googleDriveFileViewUrl(id),
      size: fileSize(item.size),
    });
  }
  return result;
}
