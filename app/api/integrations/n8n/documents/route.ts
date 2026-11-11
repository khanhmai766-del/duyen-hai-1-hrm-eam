import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parseGoogleDriveTarget } from "@/lib/google-drive-document";
import { parseDocumentDriveSyncRecord, verifyN8nDocumentSyncToken } from "@/lib/document-drive-sync";
import { aiIndexRetryAt, buildDocumentAiIndexVersion, isDocumentAiIndexPaused } from "@/lib/document-ai-index";
import { parseDocumentDriveCandidates } from "@/lib/document-drive-candidates";

import { applyDocumentDriveSync } from "@/lib/server/document-drive-update";
import { invalidateAiKnowledgeCache } from "@/lib/ai-knowledge-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    if (!verifyN8nDocumentSyncToken(req.headers.get("authorization"))) return fail("Không có quyền đồng bộ tài liệu", 401);
    const requestedLimit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Number.isInteger(requestedLimit) ? Math.min(500, Math.max(1, requestedLimit)) : 100;
    const cursor = String(req.nextUrl.searchParams.get("cursor") ?? "").trim();
    const rows = await prisma.digitalDocument.findMany({ where: { category: "PROCEDURE", id: { gt: cursor } },
      orderBy: { id: "asc" }, take: limit + 1 });

    const hasMore = rows.length > limit;
    const nextCursor = hasMore ? String(rows[limit - 1]?.id ?? "") : null;
    const now = Date.now();
    const paused = isDocumentAiIndexPaused();
    const page = rows.slice(0, limit).map((row) => {
      const source = parseGoogleDriveTarget(String(row.documentUrl ?? ""));
      const desiredAiIndexVersion = buildDocumentAiIndexVersion({
        driveChecksum: typeof row.driveChecksum === "string" ? row.driveChecksum : null,
        driveModifiedAt: row.driveModifiedAt instanceof Date ? row.driveModifiedAt : null,
      });
      // Tài liệu nạp LỖI còn trong thời gian chờ (hết hạn mức → ngày mai; lỗi khác → 3 ngày): báo "không cần nạp" bằng cách
      // trả desiredAiIndexVersion = phiên bản hiện có — workflow dh1DocumentAiIndex chỉ chọn dòng lệch phiên bản, nên khỏi
      // sửa workflow mà tài liệu hỏng không chặn cả hàng. aiIndexRetryAt để người xem biết khi nào thử lại.
      const retryAt = aiIndexRetryAt({ aiIndexError: row.aiIndexError as string | null, aiIndexAttemptedAt: row.aiIndexAttemptedAt as Date | null,
        driveModifiedAt: row.driveModifiedAt as Date | null });
      const deferred = retryAt !== null && retryAt.getTime() > now;
      return {
        ...row,
        driveFolderId: row.driveFolderId ?? (source.kind === "FOLDER" ? source.id : null),
        driveCandidateFiles: parseDocumentDriveCandidates(row.driveCandidateFiles),
        legacyTargetKind: source.kind,
        desiredAiIndexVersion: deferred || paused ? row.aiIndexVersion ?? null : desiredAiIndexVersion,
        aiIndexRetryAt: deferred ? retryAt!.toISOString() : null,
      };
    });
    return ok(page, { nextCursor, hasMore, aiIndexPaused: paused });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!verifyN8nDocumentSyncToken(req.headers.get("authorization"))) return fail("Không có quyền đồng bộ tài liệu", 401);
    const body = await req.json().catch(() => null) as { documents?: unknown[] } | null;
    if (!Array.isArray(body?.documents) || body.documents.length === 0) return fail("Danh sách tài liệu đồng bộ đang trống");
    if (body.documents.length > 100) return fail("Mỗi batch chỉ nhận tối đa 100 tài liệu");

    let records;
    try { records = body.documents.map(parseDocumentDriveSyncRecord); }
    catch (error) { return fail(error instanceof Error ? error.message : "Bản ghi đồng bộ không hợp lệ"); }
    const uniqueIds = new Set(records.map((record) => record.documentId));
    if (uniqueIds.size !== records.length) return fail("Batch đồng bộ có documentId bị trùng");

    const updated = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const record of [...records].sort((a, b) => a.documentId.localeCompare(b.documentId))) {
        if (await applyDocumentDriveSync(tx, record)) count++;
      }
      return count;
    });

    invalidateAiKnowledgeCache();
    return ok({ received: records.length, updated, missing: records.length - updated });
  });
}
