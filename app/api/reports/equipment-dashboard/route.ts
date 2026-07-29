import type { NextRequest } from "next/server";
import { handle, ok, requireUser } from "@/lib/api";
import { requireDeviceView } from "@/lib/device-permissions";
import { getEquipmentDashboard } from "@/lib/equipment-dashboard-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const startedAt = performance.now();
    const user = await requireUser();
    await requireDeviceView(user);
    const params = req.nextUrl.searchParams;
    const result = await getEquipmentDashboard(user, {
      from: params.get("from")?.trim() || undefined,
      to: params.get("to")?.trim() || undefined,
    });
    const durationMs = Math.round(performance.now() - startedAt);
    const response = ok(result.data, {
      cache: result.cache,
      durationMs,
      generatedAt: result.generatedAt,
    });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set(
      "Server-Timing",
      `equipment-dashboard;dur=${durationMs};desc="${result.cache}"`
    );
    return response;
  });
}
