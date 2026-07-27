import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import {
  failN8nDefectRunByExternalId,
  n8nDefectSyncErrorMessage,
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
      const run = await failN8nDefectRunByExternalId({
        externalRunId: String(body?.externalRunId ?? ""),
        message: String(body?.message ?? ""),
      });
      return ok(
        run
          ? { runId: run.id, status: run.status, finishedAt: run.finishedAt }
          : { runId: null, status: "NOT_FOUND", finishedAt: null }
      );
    } catch (error) {
      return fail(n8nDefectSyncErrorMessage(error), 409);
    }
  });
}
