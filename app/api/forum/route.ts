import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { ensureForumPostLikeTable } from "@/lib/forum-likes";
import { normalizeForumTargetPositions } from "@/lib/forum-targets";
import { ensureForumLifecycleColumns } from "@/lib/forum-targets-server";
import { requirePermissionLevel } from "@/lib/rbac-guard";

const AUTHOR_SELECT = `
  json_build_object(
    'id', u.id,
    'name', u.name,
    'position', u.position,
    'avatarUrl', u."avatarUrl"
  )
`;

const REPLY_COUNT_SELECT = `
  (
    SELECT COUNT(*)::int
    FROM "ForumReply" r
    WHERE r."postId" = p.id
  ) AS "replyCount"
`;

const viTime = (column: string) => `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.MS') || '+07:00'`;

const REPLY_AUTHOR_IDS_SELECT = `
  COALESCE(
    (
      SELECT array_agg(DISTINCT r."authorId")
      FROM "ForumReply" r
      WHERE r."postId" = p.id
    ),
    ARRAY[]::TEXT[]
  ) AS "replyAuthorIds"
`;

const LATEST_REPLY_SELECT = `
  (
    SELECT json_build_object(
      'id', r.id,
      'postId', r."postId",
      'content', r.content,
      'attachments', r.attachments,
      'createdAt', ${viTime('r."createdAt"')},
      'author', json_build_object(
        'id', ru.id,
        'name', ru.name,
        'position', ru.position,
        'avatarUrl', ru."avatarUrl"
      )
    )
    FROM "ForumReply" r
    JOIN "User" ru ON ru.id = r."authorId"
    WHERE r."postId" = p.id
    ORDER BY r."createdAt" DESC
    LIMIT 1
  ) AS "latestReply"
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
    await ensureForumLifecycleColumns();
    const sp = req.nextUrl.searchParams;
    const category = sp.get("category")?.trim();
    const q = sp.get("q")?.trim();
    const status = sp.get("status")?.trim().toUpperCase();
    const where: string[] = [];
    const params: unknown[] = [];

    if (status === "CLOSED") {
      where.push(`p."closedAt" IS NOT NULL`);
    } else {
      where.push(`p."closedAt" IS NULL`);
    }
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
        p."targetPositions",
        p."isPinned",
        p."closeSummary",
        ${viTime('p."closedAt"')} AS "closedAt",
        CASE
          WHEN cb.id IS NULL THEN NULL
          ELSE json_build_object(
            'id', cb.id,
            'name', cb.name,
            'position', cb.position,
            'avatarUrl', cb."avatarUrl"
          )
        END AS "closedBy",
        ${viTime('p."createdAt"')} AS "createdAt",
        ${viTime('p."updatedAt"')} AS "updatedAt",
        ${AUTHOR_SELECT} AS author,
        ${REPLY_COUNT_SELECT},
        ${REPLY_AUTHOR_IDS_SELECT},
        ${LATEST_REPLY_SELECT},
        ${likesSelect(currentUserParam)}
      FROM "ForumPost" p
      JOIN "User" u ON u.id = p."authorId"
      LEFT JOIN "User" cb ON cb.id = p."closedById"
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY p."isPinned" DESC, COALESCE(p."closedAt", p."updatedAt") DESC
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
    await ensureForumLifecycleColumns();
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const content = String(body.content ?? "").trim();
    const category = String(body.category ?? "DISCUSSION").trim() || "DISCUSSION";
    const tags = normalizeList(body.tags, 8);
    const attachments = normalizeList(body.attachments, 8);
    const targetPositions = normalizeForumTargetPositions(body.targetPositions);

    if (!title) return fail("Vui lòng nhập tiêu đề chủ đề");
    if (!content) return fail("Vui lòng nhập nội dung trao đổi");

    const id = randomUUID();
    // updatedAt là @updatedAt trong Prisma (NOT NULL, KHÔNG có default ở DB). Vì đây là
    // raw INSERT (bỏ qua Prisma) nên phải tự điền, không sẽ lỗi 23502 NOT NULL.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ForumPost" (id, title, content, category, tags, attachments, "targetPositions", "authorId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
      id,
      title,
      content,
      category,
      tags,
      attachments,
      targetPositions,
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
