import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { hasAssignedPermissionLevel } from "@/lib/rbac-permissions";

export const dynamic = "force-dynamic";

async function allowed(user: { id?: string; role?: string }) {
  return hasAssignedPermissionLevel(user, "ai-chat", ["read", "personal", "manage", "full"]);
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    if (!(await allowed(user))) return fail("Bạn chưa được phân quyền sử dụng trợ lý AI", 403);
    const { id } = await context.params;
    const conversation = await prisma.aiConversation.findFirst({
      where: { id, userId: user.id, expiresAt: { gt: new Date() } },
      select: {
        id: true, title: true, createdAt: true, updatedAt: true, expiresAt: true,
        messages: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, citations: true, createdAt: true } },
      },
    });
    if (!conversation) return fail("Không tìm thấy cuộc hội thoại hoặc hội thoại đã hết hạn", 404);
    return ok(conversation);
  });
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    if (!(await allowed(user))) return fail("Bạn chưa được phân quyền sử dụng trợ lý AI", 403);
    const { id } = await context.params;
    const result = await prisma.aiConversation.deleteMany({ where: { id, userId: user.id } });
    if (!result.count) return fail("Không tìm thấy cuộc hội thoại", 404);
    return ok({ id });
  });
}
