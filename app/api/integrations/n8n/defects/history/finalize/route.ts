import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { verifyN8nDefectToken } from "@/lib/defect-n8n-sync";
import { finalizePendingDefectHistories } from "@/lib/defect-history-finalizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!verifyN8nDefectToken(req.headers.get("authorization"))) {
      return fail("Không có quyền chốt lịch sử khiếm khuyết", 401);
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = Number(body?.batchSize ?? 50);
    if (!Number.isFinite(batchSize) || batchSize < 1) {
      return fail("batchSize phải là số nguyên dương");
    }

    return ok(await finalizePendingDefectHistories(batchSize));
  });
}
