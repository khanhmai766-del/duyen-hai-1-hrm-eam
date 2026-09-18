import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parseGoogleDriveTarget } from "@/lib/google-drive-document";
import { parseDocumentDriveSyncRecord, verifyN8nDocumentSyncToken } from "@/lib/document-drive-sync";
import { buildDocumentAiIndexVersion } from "@/lib/document-ai-index";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    if (!verifyN8nDocumentSyncToken(req.headers.get("authorization"))) return fail("Không có quyền đồng bộ tài liệu", 401);
    const requestedLimit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Number.isInteger(requestedLimit) ? Math.min(500, Math.max(1, requestedLimit)) : 100;
    const cursor = String(req.nextUrl.searchParams.get("cursor") ?? "").trim();
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT id, title, "decisionNumber", "documentUrl", "driveFolderId", "driveFileId",
             "driveFileName", "driveMimeType", "driveModifiedAt", "driveChecksum",
             "driveSyncStatus", "driveSyncError", "driveLastSyncedAt",
             "aiIndexedAt", "aiIndexVersion", "aiIndexError"
      FROM "DigitalDocument"
      WHERE category = 'PROCEDURE' AND id > $1
      ORDER BY id ASC
      LIMIT $2
    `, cursor, limit + 1);

    const hasMore = rows.length > limit;
    const nextCursor = hasMore ? String(rows[limit - 1]?.id ?? "") : null;
    const page = rows.slice(0, limit).map((row) => {
      const source = parseGoogleDriveTarget(String(row.documentUrl ?? ""));
      return {
        ...row,
        driveFolderId: row.driveFolderId ?? (source.kind === "FOLDER" ? source.id : null),
        legacyTargetKind: source.kind,
        desiredAiIndexVersion: buildDocumentAiIndexVersion({
          driveChecksum: typeof row.driveChecksum === "string" ? row.driveChecksum : null,
          driveModifiedAt: row.driveModifiedAt instanceof Date ? row.driveModifiedAt : null,
        }),
      };
    });
    return ok(page, { nextCursor, hasMore });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!verifyN8nDocumentSyncToken(req.headers.get("authorization"))) return fail("Không có quyền đồng bộ tài liệu", 401);
    const body = await req.json().catch(() => null) as { documents?: unknown[] } | null;
    if (!Array.isArray(body?.documents) || body.documents.length === 0) return fail("Danh sách tài liệu đồng bộ đang trống");
    if (body.documents.length > 100) return fail("Mỗi batch chỉ nhận tối đa 100 tài liệu");

    const records = body.documents.map(parseDocumentDriveSyncRecord);
    const uniqueIds = new Set(records.map((record) => record.documentId));
    if (uniqueIds.size !== records.length) return fail("Batch đồng bộ có documentId bị trùng");

    const updated = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const record of records) {
        const changed = await tx.$executeRaw`
          UPDATE "DigitalDocument"
          SET "driveFolderId" = ${record.driveFolderId},
              "driveFileId" = CASE WHEN ${record.driveSyncStatus} = 'ERROR' THEN "driveFileId" ELSE ${record.driveFileId} END,
              "driveFileName" = CASE WHEN ${record.driveSyncStatus} = 'ERROR' THEN "driveFileName" ELSE ${record.driveFileName} END,
              "driveMimeType" = CASE WHEN ${record.driveSyncStatus} = 'ERROR' THEN "driveMimeType" ELSE ${record.driveMimeType} END,
              "driveModifiedAt" = CASE WHEN ${record.driveSyncStatus} = 'ERROR' THEN "driveModifiedAt" ELSE ${record.driveModifiedAt} END,
              "driveWebViewLink" = CASE WHEN ${record.driveSyncStatus} = 'ERROR' THEN "driveWebViewLink" ELSE ${record.driveWebViewLink} END,
              "driveChecksum" = CASE WHEN ${record.driveSyncStatus} = 'ERROR' THEN "driveChecksum" ELSE ${record.driveChecksum} END,
              "driveSyncStatus" = ${record.driveSyncStatus},
              "driveSyncError" = ${record.driveSyncError},
              "driveLastSyncedAt" = CURRENT_TIMESTAMP
          WHERE id = ${record.documentId} AND category = 'PROCEDURE'
        `;
        count += changed;
      }
      return count;
    });

    return ok({ received: records.length, updated, missing: records.length - updated });
  });
}
