import { handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { isLubricantSupervisor } from "@/lib/lubricant-access";
import { materialCategoryMatches } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Danh sách dầu mỡ trong Danh mục vật tư để chọn khi thêm/sửa điểm theo dõi (không cần quyền quản lý vật tư). */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!isLubricantSupervisor(user)) await requirePermissionLevel(user, "replacement-manage", ["personal", "manage", "full"], "Không đủ quyền xem danh mục dầu mỡ");
    const materials = await prisma.material.findMany({
      where: { category: { not: null } },
      select: { id: true, code: true, name: true, unit: true, machine: true, system: true, category: true },
      orderBy: { name: "asc" },
    });
    return ok(materials.filter((material) => materialCategoryMatches(material.category, "Dầu bôi trơn"))
      .map(({ category: _category, ...rest }) => rest));
  });
}
