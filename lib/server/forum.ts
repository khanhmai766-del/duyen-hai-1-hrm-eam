import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { normalizeForumTargetPositions } from "@/lib/forum-targets";
import { publicUserRef } from "@/lib/s3";

export const FORUM_AUTHOR = { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } as const;
export async function forumNow(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT LOCALTIMESTAMP AS now`;
  return rows[0].now;
}
export function forumList(value: unknown, max: number) {
  return (Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [])
    .map(v => String(v).trim()).filter(Boolean).slice(0, max);
}
export function forumPostInput(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim(), content = String(body.content ?? "").trim();
  if (!title) throw fail("Vui lòng nhập tiêu đề chủ đề");
  if (!content) throw fail("Vui lòng nhập nội dung trao đổi");
  return { title, content, category: String(body.category ?? "DISCUSSION").trim() || "DISCUSSION",
    tags: forumList(body.tags, 8), attachments: forumList(body.attachments, 8), targetPositions: normalizeForumTargetPositions(body.targetPositions) };
}
export function forumReplyInput(body: Record<string, unknown>) {
  const content = String(body.content ?? "").trim();
  if (!content) throw fail("Vui lòng nhập nội dung phản hồi");
  return { content, attachments: forumList(body.attachments, 5) };
}
export async function lockForumPost(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "ForumPost" WHERE "id" = ${id} FOR UPDATE`;
  const post = await tx.forumPost.findUnique({ where: { id } });
  if (!post) throw fail("Không tìm thấy chủ đề Forum", 404);
  return post;
}
export function requireOpenForumPost(post: { closedAt: Date | null }) {
  if (post.closedAt) throw fail("Chủ đề đã kết thúc, không thể thay đổi nội dung hoặc phản hồi", 409);
}
export async function requireForumOwner(user: { id: string; role?: string }, authorId: string) {
  if (user.id !== authorId && !(await hasPermissionLevel(user, "forum-moderate", ["manage", "full"]))) throw fail("Bạn không có quyền thay đổi nội dung này", 403);
}
export async function lockForumReply(tx: Prisma.TransactionClient, id: string) {
  const target = await tx.forumReply.findUnique({ where: { id }, select: { postId: true } });
  if (!target) throw fail("Không tìm thấy phản hồi Forum", 404);
  const post = await lockForumPost(tx, target.postId);
  const reply = await tx.forumReply.findUnique({ where: { id } });
  if (!reply) throw fail("Không tìm thấy phản hồi Forum", 404);
  requireOpenForumPost(post);
  return reply;
}
// SQL cũ trả timestamp không múi giờ kèm +07:00; giữ hợp đồng ngày giờ của forum.
export const forumTime = (date: Date | null) => date ? date.toISOString().replace("Z", "+07:00") : null;
export function publicForumReply<T extends { createdAt: Date; author: Parameters<typeof publicUserRef>[0] }>(reply: T) {
  return { ...reply, createdAt: forumTime(reply.createdAt), author: publicUserRef(reply.author) };
}
