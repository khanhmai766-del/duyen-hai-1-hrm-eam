import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);

    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "ForumReply" WHERE id = $1`,
      params.id
    );
    if (!deleted) return fail("Không tìm thấy phản hồi Forum", 404);

    await audit(user.id, "DELETE_FORUM_REPLY", "ForumReply", params.id);
    return ok({ id: params.id });
  });
}
