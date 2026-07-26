import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import {
  n8nDefectSyncErrorMessage,
  parseN8nSources,
  startN8nDefectRun,
  verifyN8nDefectToken,
} from "@/lib/defect-n8n-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!verifyN8nDefectToken(req.headers.get("authorization"))) {
      return fail("Không có quyền đồng bộ", 401);
    }

    try {
      const body = await req.json();
      const expectedSources = parseN8nSources(body?.expectedSources);
      const run = await startN8nDefectRun({
        externalRunId: String(body?.externalRunId ?? ""),
        expectedSources,
      });
      return ok({
        runId: run.id,
        externalRunId: run.externalRunId,
        status: run.status,
        expectedSources: run.expectedSources,
        startedAt: run.startedAt,
      });
    } catch (error) {
      return fail(n8nDefectSyncErrorMessage(error), 409);
    }
  });
}
