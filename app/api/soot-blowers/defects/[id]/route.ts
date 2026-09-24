import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { assertOilSootAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

// PATCH /api/soot-blowers/defects/[id] -> đánh dấu đã xử lý (chuyển sang lịch sử)
export async function PATCH(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handle(async () => {
    const user = await requireUser();
    await assertOilSootAccess(user);
    await requirePermissionLevel(user, "archive-oil-gun-data", ["manage", "full"], "Không đủ quyền cập nhật khiếm khuyết vòi thổi bụi");

    const existing = await prisma.sootBlowerDefect.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy khiếm khuyết", 404);
    if (existing.resolvedAt) return fail("Khiếm khuyết này đã được xử lý");

    const defect = await prisma.sootBlowerDefect.update({
      where: { id: params.id },
      data: { resolvedAt: new Date(), resolvedBy: user.name ?? null },
    });
    await audit(user.id, "RESOLVE_SOOT_BLOWER_DEFECT", "SootBlowerDefect", defect.id, `${defect.machine}/${defect.tag} [${defect.dept}]`);
    return ok(defect);
  });
}
