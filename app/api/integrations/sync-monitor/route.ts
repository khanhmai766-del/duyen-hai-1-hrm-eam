import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { reportSyncMonitor, SYNC_MONITOR_STATUSES, type SyncMonitorStatus } from "@/lib/sync-monitor";
import { verifyBearerToken } from "@/lib/server-token";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!verifyBearerToken(req.headers.get("authorization"), process.env.SYNC_MONITOR_REPORT_TOKEN)) {
      return fail("Không có quyền báo trạng thái đồng bộ", 401);
    }
    const body = await req.json().catch(() => null);
    const status = String(body?.status ?? "").trim().toUpperCase() as SyncMonitorStatus;
    if (!SYNC_MONITOR_STATUSES.includes(status)) return fail("Trạng thái đồng bộ không hợp lệ");
    try {
      const monitor = await reportSyncMonitor({
        key: body?.key,
        name: body?.name,
        status,
        error: body?.error,
        occurredAt: body?.occurredAt ? new Date(body.occurredAt) : undefined,
        expectedIntervalMinutes: body?.expectedIntervalMinutes,
        alertAfterMinutes: body?.alertAfterMinutes,
      });
      return ok(monitor);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Dữ liệu trạng thái đồng bộ không hợp lệ");
    }
  });
}
