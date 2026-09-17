import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireAiToolUser } from "@/lib/ai-auth";
import { readAiToolInput, runAiTool } from "@/lib/ai-tools";
import { aiChemicalInventory } from "@/lib/ai-tools-ops";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireAiToolUser(req);
    const input = await readAiToolInput(req);
    return ok(await runAiTool(user, "chemical-inventory", () => aiChemicalInventory(user, input)));
  });
}
