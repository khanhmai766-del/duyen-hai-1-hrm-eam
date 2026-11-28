import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { isLubricantSupervisor } from "@/lib/lubricant-access";
import { materialCategoryMatches } from "@/lib/constants";
import { expandSourceRows } from "@/lib/lubricant-link-targets";
import { isRowLinkMode, type RowLinkOverride } from "@/lib/lubricant-row-links";
import groups from "@/app/(dashboard)/replacements/lubricant-statistics.json";

export const dynamic = "force-dynamic";
const permission = "replacement-manage";
const sourceKeys = new Set(expandSourceRows(groups).map((row) => row.key));

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!isLubricantSupervisor(user)) await requirePermissionLevel(user, permission, ["read", "personal", "manage", "full"], "Không đủ quyền xem liên kết dầu mỡ");
    const rows = await prisma.lubricantRowLink.findMany();
    return ok(Object.fromEntries(rows.map((row): [string, RowLinkOverride] => [row.sourceKey, {
      sourceKey: row.sourceKey,
      replacementId: row.replacementId,
      mode: isRowLinkMode(row.mode) ? row.mode : "none",
      updatedByName: row.updatedByName,
      updatedAt: row.updatedAt.toISOString(),
    }])));
  });
}

/** PUT { sourceKey, mode: "point" | "excel" | "none" | "auto", replacementId? } — "auto" xoá quyết định tay. */
export async function PUT(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!isLubricantSupervisor(user)) await requirePermissionLevel(user, permission, ["manage", "full"], "Không đủ quyền sửa liên kết dầu mỡ");
    const body = (await req.json().catch(() => null)) as { sourceKey?: unknown; mode?: unknown; replacementId?: unknown } | null;
    const sourceKey = typeof body?.sourceKey === "string" ? body.sourceKey : "";
    if (!sourceKeys.has(sourceKey)) return fail("Không tìm thấy dòng Excel", 404);

    if (body?.mode === "auto") {
      await prisma.lubricantRowLink.deleteMany({ where: { sourceKey } });
      await audit(user.id, "RESET_LUBRICANT_ROW_LINK", "LubricantRowLink", sourceKey);
      return ok({ sourceKey, mode: "auto" });
    }
    if (!isRowLinkMode(body?.mode)) return fail("Kiểu liên kết không hợp lệ");
    const mode = body.mode;
    let replacementId: string | null = null;
    if (mode === "point") {
      const id = typeof body?.replacementId === "string" ? body.replacementId : "";
      const point = id
        ? await prisma.materialReplacement.findUnique({ where: { id }, select: { id: true, isActive: true, material: { select: { category: true } } } })
        : null;
      if (!point || !point.isActive) return fail("Không tìm thấy điểm theo dõi đang hoạt động", 404);
      if (!materialCategoryMatches(point.material.category, "Dầu bôi trơn")) return fail("Chỉ liên kết với điểm dầu bôi trơn");
      replacementId = point.id;
    }
    const data = { replacementId, mode, updatedById: user.id, updatedByName: user.name ?? user.email ?? user.id };
    const saved = await prisma.lubricantRowLink.upsert({ where: { sourceKey }, create: { sourceKey, ...data }, update: data });
    await audit(user.id, "UPDATE_LUBRICANT_ROW_LINK", "LubricantRowLink", sourceKey, JSON.stringify({ mode, replacementId }));
    return ok({ sourceKey, mode, replacementId, updatedByName: saved.updatedByName, updatedAt: saved.updatedAt.toISOString() });
  });
}
