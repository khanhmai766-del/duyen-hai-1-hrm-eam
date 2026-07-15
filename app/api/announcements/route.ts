import type { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { deleteFromS3 } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAnnouncementManager(user: { id?: string; role: string }) {
  await requirePermissionLevel(user, "announcement-manage", ["manage", "full"], "Không đủ quyền quản lý mệnh lệnh");
}

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

// Giờ Việt Nam (UTC+7, không có DST) — mốc năm tính theo giờ nhà máy.
const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function vnYearStart(year: number) {
  return new Date(Date.UTC(year, 0, 1) - VN_UTC_OFFSET_MS);
}

function parseNullableDate(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** GET /api/announcements?year=YYYY — bảng tin nội bộ. Mọi người đăng nhập đều xem được.
 * Không truyền year (hoặc year không hợp lệ) → trả toàn bộ. meta.years liệt kê các năm có dữ liệu. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const yearParam = req.nextUrl.searchParams.get("year");
    const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
    // Lọc theo ngày ra mệnh lệnh (issuedAt), rơi về ngày tạo nếu thiếu — khớp cách hiển thị ở client.
    const where = year
      ? {
          OR: [
            { issuedAt: { gte: vnYearStart(year), lt: vnYearStart(year + 1) } },
            { issuedAt: null, createdAt: { gte: vnYearStart(year), lt: vnYearStart(year + 1) } },
          ],
        }
      : undefined;
    const [items, yearRows] = await Promise.all([
      prisma.announcement.findMany({
        where,
        orderBy: [{ pinned: "desc" }, { issuedAt: "desc" }, { createdAt: "desc" }],
        include: {
          createdBy: { select: { name: true } },
          // Chỉ trả userId + readAt; tên/chức vụ người đọc client tự map từ danh sách user đã cache.
          reads: { select: { userId: true, readAt: true } },
        },
      }),
      prisma.$queryRaw<Array<{ year: number }>>`
        SELECT DISTINCT EXTRACT(YEAR FROM (COALESCE("issuedAt", "createdAt") + interval '7 hours'))::int AS year
        FROM "Announcement"
        ORDER BY year DESC
      `,
    ]);
    return ok(items, { years: yearRows.map((row) => row.year) });
  });
}

/** POST /api/announcements — đăng bài (Quản trị / Quản lý có quyền). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireAnnouncementManager(user);
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
    await audit(user.id, "CREATE_ANNOUNCEMENT", "Announcement", item.id, title.trim());
    return ok(item);
  });
}

/** PUT /api/announcements — sửa bài (Quản trị / Quản lý có quyền). */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireAnnouncementManager(user);
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

/** DELETE /api/announcements?id= — xoá bài (Quản trị / Quản lý có quyền). */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireAnnouncementManager(user);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail("Thiếu id bài đăng");
    const prev = await prisma.announcement.findUnique({ where: { id }, select: { fileUrl: true } });
    await prisma.announcement.delete({ where: { id } });
    await removeAttachment(prev?.fileUrl);
    await audit(user.id, "DELETE_ANNOUNCEMENT", "Announcement", id, "Xoá bài đăng");
    return ok({ id });
  });
}
