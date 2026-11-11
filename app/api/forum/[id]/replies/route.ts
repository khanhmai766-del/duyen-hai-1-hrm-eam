import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { forumNow, FORUM_AUTHOR, forumReplyInput, lockForumPost, publicForumReply, requireOpenForumPost } from "@/lib/server/forum";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(), { id } = await props.params;
    if (!(await prisma.forumPost.findUnique({ where: { id }, select: { id: true } }))) return fail("Không tìm thấy chủ đề", 404);
    const replies = await prisma.forumReply.findMany({ where: { postId: id }, orderBy: { createdAt: "asc" },
      select: { id: true, postId: true, parentReplyId: true, content: true, attachments: true, createdAt: true,
        author: { select: FORUM_AUTHOR }, _count: { select: { likes: true } },
        likes: { where: { userId: user.id }, select: { id: true } },
        parentReply: { select: { id: true, content: true, createdAt: true, author: { select: FORUM_AUTHOR } } } } });
    return ok(replies.map(({ _count, likes, parentReply, ...reply }) => ({ ...publicForumReply(reply),
      likeCount: _count.likes, likedByMe: likes.length > 0, parentReply: parentReply ? publicForumReply(parentReply) : null })));
  });
}
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(), { id: postId } = await props.params;
    await requirePermissionLevel(user, "forum-write", ["personal", "manage", "full"], "Không đủ quyền phản hồi forum");
    const body = await req.json(), data = forumReplyInput(body);
    const parentReplyId = typeof body.parentReplyId === "string" ? body.parentReplyId.trim() || null : null;
    const reply = await prisma.$transaction(async tx => {
      requireOpenForumPost(await lockForumPost(tx, postId));
      if (parentReplyId && !(await tx.forumReply.findFirst({ where: { id: parentReplyId, postId }, select: { id: true } }))) throw fail("Không tìm thấy phản hồi cần trả lời trong chủ đề này", 404);
      const now = await forumNow(tx);
      const created = await tx.forumReply.create({ data: { ...data, postId, parentReplyId, authorId: user.id, createdAt: now } });
      await tx.forumPost.update({ where: { id: postId }, data: { updatedAt: now } });
      return created;
    });
    await audit(user.id, "CREATE_FORUM_REPLY", "ForumReply", reply.id, postId);
    return ok({ id: reply.id });
  });
}
