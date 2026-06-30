import type { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { isAnnouncementReadExemptPosition } from "@/lib/announcement-read";
import { deleteFromS3 } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ONLY = ["ADMIN"];

/** Best-effort removal of an announcement attachment. */
async function removeAttachment(fileUrl: string | null | undefined) {
  if (!fileUrl) return;
  try {
    if (fileUrl.startsWith("/uploads/announcements/")) {
      await fs.rm(path.join(process.cwd(), "public", fileUrl), { force: true });
      return;
    }
    await deleteFromS3(fileUrl);
  } catch {
    // non-fatal
  }
}

/** GET /api/announcements — bảng tin nội bộ. Mọi người đăng nhập đều xem được. */
export async function GET() {
  return handle(async () => {
    await requireUser();
    const items = await prisma.announcement.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
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
    const body = await req.json();
    const { title, body: content, pinned, category, classification, stt, orderedBy, linkUrl, fileUrl, fileName } = body as {
      title?: string; body?: string; pinned?: boolean; category?: string; classification?: string | null; stt?: string | null; orderedBy?: string | null; linkUrl?: string | null; fileUrl?: string | null; fileName?: string | null;
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
        linkUrl: linkUrl?.trim() || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        createdById: user.id,
      },
    });
    // Người đăng chỉ được ghi nhận đã đọc nếu thuộc nhóm phải xác nhận đọc.
    if (!isAnnouncementReadExemptPosition(user.position)) {
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
    const body = await req.json();
    const { id, title, body: content, pinned, category, classification, stt, orderedBy, linkUrl, fileUrl, fileName } = body as {
      id?: string; title?: string; body?: string; pinned?: boolean; category?: string; classification?: string | null; stt?: string | null; orderedBy?: string | null; linkUrl?: string | null; fileUrl?: string | null; fileName?: string | null;
    };
    if (!id) return fail("Thiếu id bài đăng");

    // If the attachment changed, drop the old file to avoid orphans.
    if (fileUrl !== undefined) {
      const prev = await prisma.announcement.findUnique({ where: { id }, select: { fileUrl: true } });
      if (prev?.fileUrl && prev.fileUrl !== fileUrl) await removeAttachment(prev.fileUrl);
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
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail("Thiếu id bài đăng");
    const prev = await prisma.announcement.findUnique({ where: { id }, select: { fileUrl: true } });
    await prisma.announcement.delete({ where: { id } });
    await removeAttachment(prev?.fileUrl);
    await audit(user.id, "DELETE_ANNOUNCEMENT", "Announcement", id, "Xoá bài đăng");
    return ok({ id });
  });
}
