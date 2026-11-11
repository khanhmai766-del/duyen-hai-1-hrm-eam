import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, handle, ok, requireUser } from "@/lib/api";
import { forumReplyInput, lockForumReply, requireForumOwner } from "@/lib/server/forum";

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(), { id } = await props.params, data = forumReplyInput(await req.json());
    await prisma.$transaction(async tx => {
      const reply = await lockForumReply(tx, id);
      await requireForumOwner(user, reply.authorId);
      await tx.forumReply.update({ where: { id }, data });
    });
    await audit(user.id, "UPDATE_FORUM_REPLY", "ForumReply", id);
    return ok({ id });
  });
}
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(), { id } = await props.params;
    await prisma.$transaction(async tx => {
      const reply = await lockForumReply(tx, id);
      await requireForumOwner(user, reply.authorId);
      await tx.forumReply.delete({ where: { id } });
    });
    await audit(user.id, "DELETE_FORUM_REPLY", "ForumReply", id);
    return ok({ id });
  });
}
