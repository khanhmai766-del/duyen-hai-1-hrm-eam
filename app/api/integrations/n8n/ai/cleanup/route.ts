import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok } from "@/lib/api";
import { verifyN8nAiToolToken } from "@/lib/ai-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!verifyN8nAiToolToken(req.headers.get("authorization"))) {
      return fail("Token công cụ AI không hợp lệ", 401);
    }
    const result = await prisma.aiConversation.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return ok({ deleted: result.count });
  });
}
