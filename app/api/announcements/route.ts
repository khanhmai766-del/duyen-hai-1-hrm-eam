import type { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { isAnnouncementReadExemptPosition } from "@/lib/announcement-read";
import { isAnnouncementTargetForPosition } from "@/lib/announcement-targets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ONLY = ["ADMIN"];
const INVALID_RETENTION_DAYS = 15;

/** Best-effort removal of a locally-stored announcement attachment. */
async function removeLocalFile(fileUrl: string | null | undefined) {
  if (!fileUrl?.startsWith("/uploads/announcements/")) return;
  try {
    await fs.rm(path.join(process.cwd(), "public", fileUrl), { force: true });
  } catch {
    // non-fatal
  }
}

async function ensureAnnouncementLifecycleColumns() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Announcement"
    ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "invalidatedAt" TIMESTAMP(3)
  `);
}

async function purgeExpiredInvalidAnnouncements() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INVALID_RETENTION_DAYS);
  const expired = await prisma.announcement.findMany({
    where: { invalidatedAt: { lt: cutoff } },
    select: { id: true, fileUrl: true },
  });
  for (const item of expired) {
    await prisma.announcement.delete({ where: { id: item.id } });
    await removeLocalFile(item.fileUrl);
  }
}

function parseNullableDate(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** GET /api/announcements — bảng tin nội bộ. Mọi người đăng nhập đều xem được. */
export async function GET() {
  return handle(async () => {
    await ensureAnnouncementLifecycleColumns();
    await purgeExpiredInvalidAnnouncements();
    await requireUser();
    const items = await prisma.announcement.findMany({
      orderBy: [{ pinned: "desc" }, { issuedAt: "desc" }, { createdAt: "desc" }],
      include: {
        createdBy: { select: { name: true } },
        reads: {
          select: { userId: true, readAt: true, user: { select: { name: true, position: true, avatarUrl: true } } },
        },
      },
    });
    return ok(items);
  });
}

/** POST /api/announcements — đăng bài (chỉ ADMIN). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ADMIN_ONLY);
    await ensureAnnouncementLifecycleColumns();
    const body = await req.json();
    const { title, body: content, pinned, category, classification, stt, orderedBy, issuedAt, linkUrl, fileUrl, fileName } = body as {
      title?: string; body?: string; pinned?: boolean; category?: string; classification?: string | null; stt?: string | null; orderedBy?: string | null; issuedAt?: string | null; linkUrl?: string | null; fileUrl?: string | null; fileName?: string | null;
    };
    if (!title?.trim() || !content?.trim()) return fail("Nhập tiêu đề và nội dung");

    const item = await prisma.announcement.create({
      data: {
        category: category === "ORDER" ? "ORDER" : "BULLETIN",
        classification: classification?.trim() || null,
        stt: stt?.trim() || null,
        title: title.trim(),
        body: content.trim(),
        pinned: !!pinned,
        orderedBy: orderedBy?.trim() || null,
        issuedAt: parseNullableDate(issuedAt),
        linkUrl: linkUrl?.trim() || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        createdById: user.id,
      },
    });
    // Người đăng chỉ được ghi nhận đã đọc nếu thuộc nhóm phải xác nhận đọc.
    if (!isAnnouncementReadExemptPosition(user.position) && isAnnouncementTargetForPosition(item.classification, user.position)) {
      await prisma.announcementRead.create({ data: { announcementId: item.id, userId: user.id } });
    }
    await audit(user.id, "CREATE_ANNOUNCEMENT", "Announcement", item.id, title.trim());
    return ok(item);
  });
}

/** PUT /api/announcements — sửa bài (chỉ ADMIN). */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ADMIN_ONLY);
    await ensureAnnouncementLifecycleColumns();
    const body = await req.json();
    const { id, title, body: content, pinned, category, classification, stt, orderedBy, issuedAt, invalidatedAt, action, linkUrl, fileUrl, fileName } = body as {
      id?: string; title?: string; body?: string; pinned?: boolean; category?: string; classification?: string | null; stt?: string | null; orderedBy?: string | null; issuedAt?: string | null; invalidatedAt?: string | null; action?: "INVALIDATE" | "RESTORE"; linkUrl?: string | null; fileUrl?: string | null; fileName?: string | null;
    };
    if (!id) return fail("Thiếu id bài đăng");

    if (action === "INVALIDATE" || action === "RESTORE") {
      const item = await prisma.announcement.update({
        where: { id },
        data: { invalidatedAt: action === "INVALIDATE" ? new Date() : null },
      });
      await audit(
        user.id,
        action === "INVALIDATE" ? "INVALIDATE_ANNOUNCEMENT" : "RESTORE_ANNOUNCEMENT",
        "Announcement",
        id,
        action === "INVALIDATE" ? "Đánh dấu mệnh lệnh không còn hiệu lực" : "Khôi phục hiệu lực mệnh lệnh"
      );
      return ok(item);
    }

    // If the attachment changed, drop the old file to avoid orphans.
    if (fileUrl !== undefined) {
      const prev = await prisma.announcement.findUnique({ where: { id }, select: { fileUrl: true } });
      if (prev?.fileUrl && prev.fileUrl !== fileUrl) await removeLocalFile(prev.fileUrl);
    }

    const item = await prisma.announcement.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(content !== undefined ? { body: content.trim() } : {}),
        ...(pinned !== undefined ? { pinned: !!pinned } : {}),
        ...(category !== undefined ? { category: category === "ORDER" ? "ORDER" : "BULLETIN" } : {}),
        ...(classification !== undefined ? { classification: classification?.trim() || null } : {}),
        ...(stt !== undefined ? { stt: stt?.trim() || null } : {}),
        ...(orderedBy !== undefined ? { orderedBy: orderedBy?.trim() || null } : {}),
        ...(issuedAt !== undefined ? { issuedAt: parseNullableDate(issuedAt) } : {}),
        ...(invalidatedAt !== undefined ? { invalidatedAt: parseNullableDate(invalidatedAt) } : {}),
        ...(linkUrl !== undefined ? { linkUrl: linkUrl?.trim() || null } : {}),
        ...(fileUrl !== undefined ? { fileUrl: fileUrl || null } : {}),
        ...(fileName !== undefined ? { fileName: fileName || null } : {}),
      },
    });
    await audit(user.id, "UPDATE_ANNOUNCEMENT", "Announcement", id, "Sửa bài đăng");
    return ok(item);
  });
}

/** DELETE /api/announcements?id= — xoá bài (chỉ ADMIN). */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ADMIN_ONLY);
    await ensureAnnouncementLifecycleColumns();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail("Thiếu id bài đăng");
    const prev = await prisma.announcement.findUnique({ where: { id }, select: { fileUrl: true } });
    await prisma.announcement.delete({ where: { id } });
    await removeLocalFile(prev?.fileUrl);
    await audit(user.id, "DELETE_ANNOUNCEMENT", "Announcement", id, "Xoá bài đăng");
    return ok({ id });
  });
}
