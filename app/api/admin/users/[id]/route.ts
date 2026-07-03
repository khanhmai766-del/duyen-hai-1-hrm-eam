import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { userWithSignedMedia } from "@/lib/s3";
import { requireUserAdminReadAccess } from "@/lib/user-admin-access";

export const dynamic = "force-dynamic";

async function safeUser<T extends { passwordHash?: string; avatarUrl?: string | null; signatureUrl?: string | null; avatarKey?: string | null; signatureKey?: string | null }>(user: T) {
  const { passwordHash, ...safe } = user;
  return userWithSignedMedia(safe);
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requireUserAdminReadAccess(user);

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return fail("Không tìm thấy người dùng", 404);
    return ok(await safeUser(target));
  });
}
