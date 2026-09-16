import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok } from "@/lib/api";
import { verifyN8nAiToolToken } from "@/lib/ai-auth";
import { cleanupExpiredAiTurnLogs } from "@/lib/ai-chat";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!verifyN8nAiToolToken(req.headers.get("authorization"))) {
      return fail("Token công cụ AI không hợp lệ", 401);
    }
    const [conversations, turnLogs] = await Promise.all([
      prisma.aiConversation.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      // Số liệu sống lâu hơn hội thoại (180 ngày) nhưng vẫn phải có hạn, kẻo bảng phình mãi.
      cleanupExpiredAiTurnLogs(),
    ]);
    return ok({ deleted: conversations.count, turnLogsDeleted: turnLogs.count });
  });
}
