export type GoogleDriveTargetKind = "FOLDER" | "FILE" | "GOOGLE_DOCUMENT" | "UNKNOWN";

export type GoogleDriveTarget = {
  kind: GoogleDriveTargetKind;
  id: string | null;
  canonicalUrl: string | null;
};

const DRIVE_ID = /^[a-zA-Z0-9_-]{10,}$/;

export function normalizeGoogleDriveId(value: string | null | undefined) {
  const id = String(value ?? "").trim();
  return DRIVE_ID.test(id) ? id : null;
}

export function googleDriveFileViewUrl(fileId: string) {
  const id = normalizeGoogleDriveId(fileId);
  if (!id) throw new Error("Google Drive fileId không hợp lệ");
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

export function googleDriveFolderViewUrl(folderId: string) {
  const id = normalizeGoogleDriveId(folderId);
  if (!id) throw new Error("Google Drive folderId không hợp lệ");
  return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
}

/**
 * Chuẩn hoá các kiểu liên kết Drive thường gặp. Hàm chỉ phân tích URL, không gọi
 * Google và không suy đoán file PDF nằm trong một thư mục.
 */
export function parseGoogleDriveTarget(value: string | null | undefined): GoogleDriveTarget {
  const raw = String(value ?? "").trim();
  if (!raw) return { kind: "UNKNOWN", id: null, canonicalUrl: null };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: "UNKNOWN", id: null, canonicalUrl: null };
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (hostname === "drive.google.com") {
    const folderIndex = parts.indexOf("folders");
    const folderId = folderIndex >= 0 ? normalizeGoogleDriveId(parts[folderIndex + 1]) : null;
    if (folderId) return { kind: "FOLDER", id: folderId, canonicalUrl: googleDriveFolderViewUrl(folderId) };

    const fileIndex = parts.findIndex((part, index) => part === "d" && parts[index - 1] === "file");
    const pathFileId = fileIndex >= 0 ? normalizeGoogleDriveId(parts[fileIndex + 1]) : null;
    const queryFileId = normalizeGoogleDriveId(url.searchParams.get("id"));
    const fileId = pathFileId ?? queryFileId;
    if (fileId) return { kind: "FILE", id: fileId, canonicalUrl: googleDriveFileViewUrl(fileId) };
  }

  if (hostname === "docs.google.com") {
    const dIndex = parts.indexOf("d");
    const documentId = dIndex >= 0 ? normalizeGoogleDriveId(parts[dIndex + 1]) : null;
    if (documentId) return { kind: "GOOGLE_DOCUMENT", id: documentId, canonicalUrl: raw };
  }

  return { kind: "UNKNOWN", id: null, canonicalUrl: null };
}
