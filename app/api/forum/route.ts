import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { ensureForumPostLikeTable } from "@/lib/forum-likes";
import { requirePermissionLevel } from "@/lib/rbac-guard";

const AUTHOR_SELECT = `
  json_build_object(
    'id', u.id,
    'name', u.name,
    'position', u.position,
    'avatarUrl', u."avatarUrl"
  )
`;

const REPLIES_SELECT = `
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', r.id,
        'content', r.content,
        'attachments', r.attachments,
        'createdAt', r."createdAt",
        'author', json_build_object(
          'id', ru.id,
          'name', ru.name,
          'position', ru.position,
          'avatarUrl', ru."avatarUrl"
        )
      )
      ORDER BY r."createdAt" ASC
    )
    FROM "ForumReply" r
    JOIN "User" ru ON ru.id = r."authorId"
    WHERE r."postId" = p.id
  ), '[]'::json)
`;

function likesSelect(currentUserParam: number) {
  return `
    (
      SELECT COUNT(*)::int
      FROM "ForumPostLike" l
      WHERE l."postId" = p.id
    ) AS "likeCount",
    EXISTS (
      SELECT 1
      FROM "ForumPostLike" ml
      WHERE ml."postId" = p.id AND ml."userId" = $${currentUserParam}
    ) AS "likedByMe"
  `;
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await ensureForumPostLikeTable();
    const sp = req.nextUrl.searchParams;
    const category = sp.get("category")?.trim();
    const q = sp.get("q")?.trim();
    const where: string[] = [];
    const params: unknown[] = [];

    if (category && category !== "ALL") {
      params.push(category);
      where.push(`p.category = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(p.title ILIKE $${params.length} OR p.content ILIKE $${params.length} OR EXISTS (SELECT 1 FROM unnest(p.tags) tag WHERE tag ILIKE $${params.length}))`);
    }

    const currentUserParam = params.length + 1;
    params.push(user.id);

    const sql = `
      SELECT
        p.id,
        p.title,
        p.content,
        p.category,
        p.tags,
        p.attachments,
        p."isPinned",
        p."createdAt",
        p."updatedAt",
        ${AUTHOR_SELECT} AS author,
        ${REPLIES_SELECT} AS replies,
        ${likesSelect(currentUserParam)}
      FROM "ForumPost" p
      JOIN "User" u ON u.id = p."authorId"
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY p."isPinned" DESC, p."updatedAt" DESC
      LIMIT 100
    `;
    const posts = await prisma.$queryRawUnsafe(sql, ...params);
    return ok(posts);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "forum-write", ["create", "manage", "full"], "Không đủ quyền tạo chủ đề forum");
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const content = String(body.content ?? "").trim();
    const category = String(body.category ?? "DISCUSSION").trim() || "DISCUSSION";
    const tags = normalizeList(body.tags, 8);
    const attachments = normalizeList(body.attachments, 8);

    if (!title) return fail("Vui lòng nhập tiêu đề chủ đề");
    if (!content) return fail("Vui lòng nhập nội dung trao đổi");

    const id = randomUUID();
    // updatedAt là @updatedAt trong Prisma (NOT NULL, KHÔNG có default ở DB). Vì đây là
    // raw INSERT (bỏ qua Prisma) nên phải tự điền, không sẽ lỗi 23502 NOT NULL.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ForumPost" (id, title, content, category, tags, attachments, "authorId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      id,
      title,
      content,
      category,
      tags,
      attachments,
      user.id
    );
    await audit(user.id, "CREATE_FORUM_POST", "ForumPost", id, title);
    return ok({ id });
  });
}

function normalizeList(value: unknown, max: number) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean).slice(0, max);
  }
  if (typeof value === "string") {
    return value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean).slice(0, max);
  }
  return [];
}
