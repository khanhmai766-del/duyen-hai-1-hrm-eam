import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import {
  finishN8nDefectRun,
  n8nDefectSyncErrorMessage,
  parseN8nSources,
  verifyN8nDefectToken,
} from "@/lib/defect-n8n-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { runId: string } }) {
  return handle(async () => {
    if (!verifyN8nDefectToken(req.headers.get("authorization"))) {
      return fail("Không có quyền đồng bộ", 401);
    }

    try {
      const body = await req.json();
      const completedSources = parseN8nSources(body?.completedSources);
      const run = await finishN8nDefectRun({ runId: params.runId, completedSources });
      return ok({
        runId: run.id,
        status: run.status,
        finishedAt: run.finishedAt,
        readCount: run.readCount,
        createdCount: run.createdCount,
        updatedCount: run.updatedCount,
        unchangedCount: run.unchangedCount,
        confirmedSkippedCount: run.confirmedSkippedCount,
        missingCount: run.missingCount,
      });
    } catch (error) {
      return fail(n8nDefectSyncErrorMessage(error), 409);
    }
  });
}
