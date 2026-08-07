import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { PCCC_PERMISSION, createNextPeriodFrom } from "@/lib/pccc-service";

export const dynamic = "force-dynamic";

// GET /api/pccc/periods -> danh sách kỳ kiểm tra, mới nhất trước
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);
    const periods = await prisma.pcccPeriod.findMany({
      orderBy: [{ year: "desc" }, { monthNo: "desc" }],
      select: {
        id: true,
        label: true,
        year: true,
        monthNo: true,
        isClosed: true,
        closedAt: true,
        _count: { select: { extinguishers: true, cabinets: true, bulks: true, fm200Panels: true, signatures: true } },
      },
    });
    return ok(periods);
  });
}

// POST /api/pccc/periods { fromLabel } -> sinh kỳ mới từ kỳ trước
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.manage, ["manage", "full"], "Không đủ quyền sinh kỳ mới");
    const body = (await req.json().catch(() => ({}))) as { fromLabel?: string };
    const source =
      body.fromLabel ??
      (await prisma.pcccPeriod.findFirst({ orderBy: [{ year: "desc" }, { monthNo: "desc" }], select: { label: true } }))
        ?.label;
    if (!source) throw new Error("Chưa có kỳ nào để sao chép");
    const period = await createNextPeriodFrom(source);
    await audit(
      user.id,
      "CREATE_PCCC_PERIOD",
      "PcccPeriod",
      period.id,
      auditDetailWithPosition(user, `Sinh kỳ ${period.label} từ ${source}`)
    );
    return ok(period);
  });
}
