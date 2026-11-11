import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { forumNow, forumPostInput, lockForumPost, requireForumOwner, requireOpenForumPost } from "@/lib/server/forum";

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(), { id } = await props.params, body = await req.json();
    const action = typeof body.isPinned === "boolean" ? "PIN_FORUM_POST" : body.action === "CLOSE" ? "CLOSE_FORUM_POST" : "UPDATE_FORUM_POST";
    await prisma.$transaction(async tx => {
      const post = await lockForumPost(tx, id);
      if (action === "PIN_FORUM_POST") {
        await requirePermissionLevel(user, "forum-moderate", ["manage", "full"], "Không đủ quyền ghim chủ đề");
        await tx.forumPost.update({ where: { id }, data: { isPinned: body.isPinned, updatedAt: post.updatedAt } });
        return;
      }
      await requireForumOwner(user, post.authorId);
      requireOpenForumPost(post);
      if (action === "CLOSE_FORUM_POST") {
        const closeSummary = String(body.closeSummary ?? "").trim();
        if (!closeSummary) throw fail("Vui lòng nhập tóm tắt, kết luận trước khi đóng chủ đề");
        const now = await forumNow(tx);
        await tx.forumPost.update({ where: { id }, data: { closeSummary, closedAt: now, updatedAt: now, closedById: user.id } });
      } else await tx.forumPost.update({ where: { id }, data: { ...forumPostInput(body), updatedAt: await forumNow(tx) } });
    });
    await audit(user.id, action, "ForumPost", id, action === "PIN_FORUM_POST" ? String(body.isPinned) : body.closeSummary || body.title);
    return ok({ id, ...(action === "PIN_FORUM_POST" ? { isPinned: body.isPinned } : {}) });
  });
}
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(), { id } = await props.params;
    await prisma.$transaction(async tx => {
      const post = await lockForumPost(tx, id);
      await requireForumOwner(user, post.authorId);
      await tx.forumPost.delete({ where: { id } });
    });
    await audit(user.id, "DELETE_FORUM_POST", "ForumPost", id);
    return ok({ id });
  });
}
