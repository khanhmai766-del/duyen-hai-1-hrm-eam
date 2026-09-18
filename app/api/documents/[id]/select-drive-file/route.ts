import type { NextRequest } from "next/server";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { parseDocumentDriveCandidates } from "@/lib/document-drive-candidates";
import { googleDriveFileViewUrl, normalizeGoogleDriveId } from "@/lib/google-drive-document";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProcedureDriveSelection = {
  id: string;
  title: string;
  driveCandidateFiles: string | null;
};

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      "document-procedure",
      ["manage", "full"],
      "Bạn không có quyền chọn PDF chính cho quy trình",
    );

    const { id } = await props.params;
    const body = await req.json().catch(() => null) as { fileId?: unknown } | null;
    const fileId = normalizeGoogleDriveId(String(body?.fileId ?? "").trim());
    if (!id || id.length > 100 || !fileId) return fail("Thiếu tài liệu hoặc file PDF hợp lệ");

    const rows = await prisma.$queryRawUnsafe<ProcedureDriveSelection[]>(`
      SELECT id, title, "driveCandidateFiles"
      FROM "DigitalDocument"
      WHERE id = $1 AND category = 'PROCEDURE'
      LIMIT 1
    `, id);
    const document = rows[0];
    if (!document) return fail("Không tìm thấy quy trình", 404);

    const candidates = parseDocumentDriveCandidates(document.driveCandidateFiles);
    const selected = candidates.find((candidate) => candidate.id === fileId);
    if (!selected) {
      return fail("PDF đã chọn không còn nằm trong danh sách vừa đồng bộ. Vui lòng tải lại danh sách.", 409);
    }

    const modifiedAt = selected.modifiedTime ? new Date(selected.modifiedTime) : null;
    const webViewLink = googleDriveFileViewUrl(selected.id);
    await prisma.$executeRaw`
      UPDATE "DigitalDocument"
      SET "driveManualFileId" = ${selected.id},
          "driveFileId" = ${selected.id},
          "driveFileName" = ${selected.name},
          "driveMimeType" = ${selected.mimeType},
          "driveModifiedAt" = ${modifiedAt},
          "driveWebViewLink" = ${webViewLink},
          "driveChecksum" = ${selected.md5Checksum},
          "driveSyncStatus" = 'SYNCED',
          "driveSyncError" = NULL,
          "driveLastSyncedAt" = CURRENT_TIMESTAMP,
          "aiIndexedAt" = NULL,
          "aiIndexVersion" = NULL,
          "aiIndexError" = NULL,
          "updatedById" = ${user.id},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${document.id} AND category = 'PROCEDURE'
    `;

    await audit(
      user.id,
      "SELECT_DOCUMENT_DRIVE_FILE",
      "DigitalDocument",
      document.id,
      `${document.title} · PDF chính: ${selected.name}`,
    );

    return ok({
      documentId: document.id,
      driveFileId: selected.id,
      driveFileName: selected.name,
      driveSyncStatus: "SYNCED",
    });
  });
}
