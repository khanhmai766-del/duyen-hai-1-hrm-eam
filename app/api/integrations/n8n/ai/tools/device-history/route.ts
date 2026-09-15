import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireAiToolUser } from "@/lib/ai-auth";
import { aiGetDeviceHistory, readAiToolInput, runAiTool } from "@/lib/ai-tools";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireAiToolUser(req);
    const input = await readAiToolInput(req);
    return ok(await runAiTool(user, "device-history", () => aiGetDeviceHistory(user, input)));
  });
}
