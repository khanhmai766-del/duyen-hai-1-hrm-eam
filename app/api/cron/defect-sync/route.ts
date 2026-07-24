import type { NextRequest } from "next/server";
import { handle, fail, ok } from "@/lib/api";
import { runGoogleDefectSync } from "@/lib/defect-google-sync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const expected = process.env.CRON_SECRET?.trim();
    const received = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!expected || received !== expected) return fail("Không có quyền chạy đồng bộ", 401);

    const result = await runGoogleDefectSync({ trigger: "CRON" });
    return ok(result);
  });
}
