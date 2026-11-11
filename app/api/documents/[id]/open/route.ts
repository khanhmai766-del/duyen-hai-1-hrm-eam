import type { NextRequest } from "next/server";
import { fail, handle, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { googleDriveFileViewUrl, parseGoogleDriveTarget } from "@/lib/google-drive-document";
import { requireDigitalDocumentReadPermission } from "@/lib/document-read-access";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await props.params;
    const document = await prisma.digitalDocument.findUnique({ where: { id },
      select: { id: true, category: true, documentUrl: true, driveFileId: true, driveSyncStatus: true } });
    if (!document) return fail("Không tìm thấy tài liệu", 404);
    await requireDigitalDocumentReadPermission(user, document.category);

    const legacy = parseGoogleDriveTarget(document.documentUrl);
    const fileId = document.driveSyncStatus === "SYNCED" && document.driveFileId
      ? document.driveFileId
      : legacy.kind === "FILE" || legacy.kind === "GOOGLE_DOCUMENT"
        ? legacy.id
        : null;
    if (!fileId) return fail("Tài liệu này chưa xác định được file PDF chính", 409);
    return Response.redirect(googleDriveFileViewUrl(fileId), 307);
  });
}
