import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { runEveningDefectDigest, runMorningDefectDigest } from "@/lib/defect-telegram-digest";
import { verifyBearerToken } from "@/lib/server-token";
import { runSyncMonitorJob } from "@/lib/sync-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOBS = ["monitor", "morning", "evening"] as const;
type TelegramJob = (typeof JOBS)[number];

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!verifyBearerToken(req.headers.get("authorization"), process.env.TELEGRAM_JOB_TOKEN)) {
      return fail("Không có quyền chạy tác vụ Telegram", 401);
    }
    const body = await req.json().catch(() => null);
    const job = String(body?.job ?? "").trim().toLowerCase() as TelegramJob;
    if (!JOBS.includes(job)) return fail("Tác vụ Telegram không hợp lệ");
    const dryRun = body?.dryRun === true;
    const result = job === "morning"
      ? await runMorningDefectDigest({ dryRun })
      : job === "evening"
        ? await runEveningDefectDigest({ dryRun })
        : await runSyncMonitorJob({ dryRun });
    return ok({ job, dryRun, result });
  });
}
