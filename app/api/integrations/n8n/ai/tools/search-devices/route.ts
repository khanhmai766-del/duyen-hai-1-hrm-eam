import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireAiToolUser } from "@/lib/ai-auth";
import { aiSearchDevices, sealAiToolResult } from "@/lib/ai-tools";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireAiToolUser(req);
    return ok(sealAiToolResult(user, await aiSearchDevices(user, await req.json())));
  });
}
