import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["manage", "full"], "Không đủ quyền xem trạng thái đồng bộ");
    const runs = await prisma.defectSyncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 5,
    });
    return ok(runs);
  });
}

export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["full"], "Chỉ người có toàn quyền khiếm khuyết được chạy đồng bộ");

    const recent = await prisma.defectSyncRun.findFirst({
      where: {
        startedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      orderBy: { startedAt: "desc" },
      select: { status: true, startedAt: true },
    });
    if (recent?.status === "RUNNING") {
      return fail("Đang có một lượt đồng bộ khiếm khuyết chạy trên n8n", 409);
    }
    if (recent && recent.startedAt.getTime() > Date.now() - 10_000) {
      return fail("Vui lòng chờ 10 giây trước khi yêu cầu đồng bộ lại", 429);
    }

    const webhookUrl = process.env.N8N_DEFECT_MANUAL_WEBHOOK_URL?.trim();
    const token = process.env.N8N_DEFECT_SYNC_TOKEN?.trim();
    if (!webhookUrl || !token) {
      return fail("Chưa cấu hình webhook đồng bộ thủ công của n8n", 503);
    }

    let response: Response;
    try {
      response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expectedSources: ["CO", "DIEN"] }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return fail("Không kết nối được n8n để bắt đầu đồng bộ", 502);
    }

    if (!response.ok) {
      console.error("[manual n8n defect sync]", response.status, await response.text());
      return fail("n8n từ chối yêu cầu đồng bộ", 502);
    }

    await audit(user.id, "TRIGGER_N8N_DEFECT_SYNC", "Defect", undefined, auditDetailWithPosition(user, "Yêu cầu đồng bộ thủ công Cơ và Điện"), {
      actorName: user.name,
    });

    return ok({
      accepted: true,
      message: "Đã gửi yêu cầu đồng bộ đến n8n",
    });
  });
}
