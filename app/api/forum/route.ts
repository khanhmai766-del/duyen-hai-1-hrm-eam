import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { publicUserRef } from "@/lib/s3";
import { forumNow, FORUM_AUTHOR, forumPostInput, forumTime, publicForumReply } from "@/lib/server/forum";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(), sp = req.nextUrl.searchParams;
    const category = sp.get("category")?.trim(), q = sp.get("q")?.trim();
    const closed = sp.get("status")?.trim().toUpperCase() === "CLOSED", withReplyMeta = sp.get("replyMeta") === "1";
    // Prisma không hỗ trợ tìm một phần tử mảng theo ILIKE; chỉ giữ SQL cho phần tìm tag.
    const tagMatches = q ? await prisma.$queryRaw<Array<{ id: string }>>
      `SELECT id FROM "ForumPost" WHERE EXISTS (SELECT 1 FROM unnest(tags) tag WHERE tag ILIKE ${'%'+q+'%'})` : [];
    const posts = await prisma.forumPost.findMany({
      where: { closedAt: closed ? { not: null } : null, ...(category && category !== "ALL" ? { category } : {}),
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }, { id: { in: tagMatches.map(row => row.id) } }] } : {}) },
      orderBy: [{ isPinned: "desc" }, closed ? { closedAt: "desc" } : { updatedAt: "desc" }], take: 100,
      select: { id: true, title: true, content: true, category: true, tags: true, attachments: true, targetPositions: true,
        isPinned: true, closeSummary: true, closedAt: true, closedById: true, createdAt: true, updatedAt: true,
        author: { select: FORUM_AUTHOR }, _count: { select: { replies: true, likes: true } },
        likes: { where: { userId: user.id }, select: { id: true } },
        replies: { orderBy: { createdAt: "desc" }, take: withReplyMeta ? 1 : 0,
          select: { id: true, postId: true, content: true, attachments: true, createdAt: true, author: { select: FORUM_AUTHOR } } } },
    });
    const ids = [...new Set(posts.map(row => row.closedById).filter((id): id is string => !!id))];
    const closedBy = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: FORUM_AUTHOR }) : []).map(user => [user.id, publicUserRef(user)]));
    const authors = withReplyMeta ? await prisma.forumReply.findMany({ where: { postId: { in: posts.map(row => row.id) } },
      select: { postId: true, authorId: true }, distinct: ["postId", "authorId"] }) : [];
    return ok(posts.map(({ _count, likes, closedById, replies, author, ...post }) => ({ ...post,
      createdAt: forumTime(post.createdAt), updatedAt: forumTime(post.updatedAt), closedAt: forumTime(post.closedAt),
      author: publicUserRef(author), closedBy: closedById ? closedBy.get(closedById) ?? null : null,
      replyCount: _count.replies, likeCount: _count.likes, likedByMe: likes.length > 0,
      ...(withReplyMeta ? { replyAuthorIds: authors.filter(row => row.postId === post.id).map(row => row.authorId),
        latestReply: replies?.[0] ? publicForumReply(replies[0]) : null } : {}) })));
  });
}
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "forum-write", ["personal", "manage", "full"], "Không đủ quyền tạo chủ đề forum");
    const data = forumPostInput(await req.json()), now = await forumNow(prisma);
    const post = await prisma.forumPost.create({ data: { ...data, authorId: user.id, createdAt: now, updatedAt: now } });
    await audit(user.id, "CREATE_FORUM_POST", "ForumPost", post.id, post.title);
    return ok({ id: post.id });
  });
}
