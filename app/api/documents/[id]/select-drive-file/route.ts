import type { NextRequest } from "next/server";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { parseDocumentDriveCandidates } from "@/lib/document-drive-candidates";
import { googleDriveFileViewUrl, normalizeGoogleDriveId } from "@/lib/google-drive-document";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";

import { EMPTY_DOCUMENT_AI, lockDigitalDocument, removeDocumentKnowledge } from "@/lib/server/document-lifecycle";
import { invalidateAiKnowledgeCache } from "@/lib/ai-knowledge-store";
import { buildDocumentAiIndexVersion } from "@/lib/document-ai-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const selected = await prisma.$transaction(async tx => {
      const document = await lockDigitalDocument(tx, id);
      if (!document || document.category !== "PROCEDURE") throw fail("Không tìm thấy quy trình", 404);
      const candidate = parseDocumentDriveCandidates(document.driveCandidateFiles).find(row => row.id === fileId);
      if (!candidate) throw fail("PDF đã chọn không còn nằm trong danh sách vừa đồng bộ. Vui lòng tải lại danh sách.", 409);
      const modifiedAt = candidate.modifiedTime ? new Date(candidate.modifiedTime) : null;
      const changed = document.driveFileId !== candidate.id || buildDocumentAiIndexVersion(document)
        !== buildDocumentAiIndexVersion({ driveChecksum: candidate.md5Checksum, driveModifiedAt: modifiedAt });
      if (changed) await removeDocumentKnowledge(tx, id);
      await tx.digitalDocument.update({ where: { id }, data: {
        driveManualFileId: candidate.id, driveFileId: candidate.id, driveFileName: candidate.name,
        driveMimeType: candidate.mimeType, driveModifiedAt: modifiedAt,
        driveWebViewLink: googleDriveFileViewUrl(candidate.id), driveChecksum: candidate.md5Checksum,
        driveSyncStatus: "SYNCED", driveSyncError: null, driveLastSyncedAt: new Date(),
        ...(changed ? EMPTY_DOCUMENT_AI : {}), updatedById: user.id, updatedAt: new Date(),
      } });
      return { ...candidate, title: document.title };
    });
    invalidateAiKnowledgeCache();

    await audit(
      user.id,
      "SELECT_DOCUMENT_DRIVE_FILE",
      "DigitalDocument",
      id,
      `${selected.title} · PDF chính: ${selected.name}`,
    );

    return ok({
      documentId: id,
      driveFileId: selected.id,
      driveFileName: selected.name,
      driveSyncStatus: "SYNCED",
    });
  });
}
