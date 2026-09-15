import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { cleanupExpiredAiConversations } from "@/lib/ai-chat";
import { hasAssignedPermissionLevel } from "@/lib/rbac-permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!(await hasAssignedPermissionLevel(user, "ai-chat", ["read", "personal", "manage", "full"]))) {
      return fail("Bạn chưa được phân quyền sử dụng trợ lý AI", 403);
    }
    cleanupExpiredAiConversations();
    const conversations = await prisma.aiConversation.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: {
        id: true, title: true, createdAt: true, updatedAt: true, expiresAt: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { role: true, content: true, createdAt: true },
        },
      },
    });
    return ok(conversations);
  });
}
