import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import {
  ingestN8nDefectBatch,
  n8nDefectSyncErrorMessage,
  parseN8nDefectRecords,
  parseN8nSource,
  verifyN8nDefectToken,
} from "@/lib/defect-n8n-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ runId: string }> }) {
  const params = await props.params;
  return handle(async () => {
    if (!verifyN8nDefectToken(req.headers.get("authorization"))) {
      return fail("Không có quyền đồng bộ", 401);
    }

    try {
      const body = await req.json();
      const source = parseN8nSource(body?.source);
      const warnings: string[] = [];
      const records = parseN8nDefectRecords(body?.records, source, warnings);
      // Ô quá dài đã bị cắt — batch vẫn nhận; ghi log để người quản lý Sheet sửa lại ô gốc.
      if (warnings.length) console.warn(`[n8n defect sync] ${source} batch ${body?.batchNumber}: ${warnings.join("; ")}`);
      const result = await ingestN8nDefectBatch({
        runId: params.runId,
        source,
        batchNumber: Number(body?.batchNumber),
        records,
      });
      return ok({
        runId: params.runId,
        source,
        batchNumber: result.batchNumber,
        status: result.status,
        recordCount: result.recordCount,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        unchangedCount: result.unchangedCount,
        confirmedSkippedCount: result.confirmedSkippedCount,
        warnings,
      });
    } catch (error) {
      return fail(n8nDefectSyncErrorMessage(error), 409);
    }
  });
}
