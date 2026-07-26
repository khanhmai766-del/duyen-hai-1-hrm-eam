import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import {
  failN8nDefectRun,
  n8nDefectSyncErrorMessage,
  verifyN8nDefectToken,
} from "@/lib/defect-n8n-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { runId: string } }) {
  return handle(async () => {
    if (!verifyN8nDefectToken(req.headers.get("authorization"))) {
      return fail("Không có quyền đồng bộ", 401);
    }

    try {
      const body = await req.json().catch(() => ({}));
      const run = await failN8nDefectRun({
        runId: params.runId,
        message: String(body?.message ?? ""),
      });
      return ok({ runId: run.id, status: run.status, finishedAt: run.finishedAt });
    } catch (error) {
      return fail(n8nDefectSyncErrorMessage(error), 409);
    }
  });
}
