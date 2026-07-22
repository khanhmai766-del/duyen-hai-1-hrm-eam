import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireUser, handle } from "@/lib/api";
import { hcRetentionStartInput } from "@/lib/hc-retention";
import { canViewHcRegistrationArchive } from "@/lib/hc-registration-access";
import { userWithSignedMedia } from "@/lib/s3";
import { parseDateInput } from "@/lib/utils";
import { HC_REGISTRATION_CONTENTS } from "@/lib/hc-period";

export const dynamic = "force-dynamic";

let hcHandlingColumnsReady = false;

async function ensureHcHandlingColumns() {
  if (hcHandlingColumnsReady) return;
  await prisma.$executeRawUnsafe('ALTER TABLE "HcCheckIn" ADD COLUMN IF NOT EXISTS "handledById" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE "HcCheckIn" ADD COLUMN IF NOT EXISTS "handledByName" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE "HcCheckIn" ADD COLUMN IF NOT EXISTS "handledAt" TIMESTAMP(3)');
  hcHandlingColumnsReady = true;
}

function dayStart(date: string | null) {
  const d = parseDateInput(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayEnd(date: string | null) {
  const d = parseDateInput(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** GET /api/hc-registrations?from=YYYY-MM-DD&to=YYYY-MM-DD — đăng ký HC trong khoảng ngày. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await ensureHcHandlingColumns();
    const isArchiveRequest = req.nextUrl.searchParams.get("scope") === "archive";
    if (isArchiveRequest && !canViewHcRegistrationArchive(user)) {
      throw fail("Không đủ quyền xem kho lưu trữ đăng ký đi hành chính", 403);
    }

    const retentionStart = dayStart(hcRetentionStartInput());
    await prisma.hcGroup.deleteMany({ where: { date: { lt: retentionStart } } });
    const requestedFrom = dayStart(req.nextUrl.searchParams.get("from"));
    const from = requestedFrom < retentionStart ? retentionStart : requestedFrom;
    const toParam = req.nextUrl.searchParams.get("to");
    const to = toParam ? dayEnd(toParam) : null;

    const registrations = await prisma.hcCheckIn.findMany({
      where: {
        isRegistered: true,
        // Timeline chung: mọi user đều thấy đăng ký đang hoạt động. Các bản ghi
        // đã từ chối/hủy chỉ hiển thị cho chính chủ để giữ luồng gửi lại.
        ...(isArchiveRequest
          ? {}
          : {
              OR: [
                { registrationStatus: { in: ["PENDING", "APPROVED"] } },
                { userId: user.id },
              ],
            }),
        group: {
          date: { gte: from, ...(to ? { lte: to } : {}) },
          content: { in: HC_REGISTRATION_CONTENTS },
        },
      },
      include: {
        user: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true, phone: true } },
        group: {
          select: {
            id: true,
            date: true,
            content: true,
            hours: true,
            period: true,
            unit: true,
            createdById: true,
            createdBy: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { group: { date: "asc" } },
        { createdAt: "asc" },
      ],
    });

    const hydratedRegistrations = await Promise.all(
      registrations.map(async (registration) => ({
        ...registration,
        user: await userWithSignedMedia(registration.user),
      }))
    );

    return ok(hydratedRegistrations);
  });
}
