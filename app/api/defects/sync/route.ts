import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { runGoogleDefectSync } from "@/lib/defect-google-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["manage", "full"], "Không đủ quyền xem trạng thái đồng bộ");
    const runs = await prisma.defectSyncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
    });
    return ok(runs);
  });
}

export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["full"], "Chỉ người có toàn quyền khiếm khuyết được chạy đồng bộ");
    const result = await runGoogleDefectSync({
      trigger: "MANUAL",
      user: { id: user.id, name: user.name },
      force: true,
    });
    await audit(
      user.id,
      "SYNC_GOOGLE_DEFECTS",
      "Defect",
      undefined,
      auditDetailWithPosition(user, `Tạo ${result.createdCount} · cập nhật ${result.updatedCount}`)
    );
    return ok(result);
  });
}
