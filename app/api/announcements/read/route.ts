import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle } from "@/lib/api";
import { mustConfirmAnnouncementRead } from "@/lib/announcement-read";

export const dynamic = "force-dynamic";

/** POST /api/announcements/read { announcementId } — xác nhận đã đọc (mọi user). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { announcementId } = (await req.json()) as { announcementId?: string };
    if (!announcementId) return fail("Thiếu id thông báo");
    const announcement = await prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { classification: true },
    });
    if (!announcement) return fail("Không tìm thấy mệnh lệnh", 404);
    if (!mustConfirmAnnouncementRead(announcement.classification, user.position)) {
      return ok({ announcementId, userId: user.id, exempt: true });
    }

    await prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId, userId: user.id } },
      create: { announcementId, userId: user.id },
      update: {},
    });
    return ok({ announcementId, userId: user.id });
  });
}
