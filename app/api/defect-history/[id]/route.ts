import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, requireRole, handle, audit } from "@/lib/api";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR"]);
    await prisma.defectHistory.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_DEFECT_HISTORY", "DefectHistory", params.id);
    return ok({ id: params.id });
  });
}
