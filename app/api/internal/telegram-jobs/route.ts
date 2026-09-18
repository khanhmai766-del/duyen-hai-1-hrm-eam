import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { runLevelOneDefectDigest, runShiftDefectDigest, runWeeklyDefectDigest } from "@/lib/defect-telegram-digest";
import { verifyBearerToken } from "@/lib/server-token";
import { runSyncMonitorJob } from "@/lib/sync-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOBS = ["monitor", "shift", "level-one", "weekly"] as const;
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
    const result = job === "shift"
      ? await runShiftDefectDigest({ dryRun })
      : job === "level-one"
        ? await runLevelOneDefectDigest({ dryRun })
        : job === "weekly"
          ? await runWeeklyDefectDigest({ dryRun })
          : await runSyncMonitorJob({ dryRun });
    return ok({ job, dryRun, result });
  });
}
