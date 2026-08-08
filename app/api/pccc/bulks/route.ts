import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  PCCC_PERMISSION,
  pcccViewScopeMeta,
  pcccWriteScopeOf,
  resolvePcccViewScope,
  resolvePeriod,
  scopeWhere,
  signaturesOf,
} from "@/lib/pccc-service";
import { FCD_THRESHOLDS, FM200_THRESHOLDS } from "@/lib/pccc-summary";

export const dynamic = "force-dynamic";

// GET /api/pccc/bulks?period= -> FOAM/CO2/DIESEL + các bảng FM200 của kỳ
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const sp = req.nextUrl.searchParams;
    const period = await resolvePeriod(sp.get("period"));
    // Phạm vi XEM chặn ngay ở câu truy vấn — không phải lọc ở client (xem lib/pccc-service.ts)
    const viewScope = await resolvePcccViewScope(user);
    const scope = scopeWhere(sp.get("cuongVi"), sp.get("machine"), viewScope);
    const [bulks, panels, bulkSignatures, panelSignatures, writeScope] = await Promise.all([
      prisma.pcccBulk.findMany({ where: { periodId: period.id, ...scope }, orderBy: [{ stt: "asc" }, { ten: "asc" }] }),
      prisma.pcccFm200Panel.findMany({ where: { periodId: period.id, ...scope }, orderBy: { panelKey: "asc" } }),
      signaturesOf(period.id, "BULK"),
      signaturesOf(period.id, "FM200_PANEL"),
      // Phạm vi GHI của người đang xem — UI khoá sẵn dòng ngoài phạm vi (xem lib/pccc-service.ts)
      pcccWriteScopeOf(user),
    ]);

    return ok(
      {
        bulks: bulks.map((b) => ({ ...b, signature: bulkSignatures.get(b.id) ?? null })),
        panels: panels.map((p) => ({ ...p, signature: panelSignatures.get(p.id) ?? null })),
      },
      {
        period,
        thresholds: { fcd: FCD_THRESHOLDS, fm200: FM200_THRESHOLDS },
        writeScope,
        viewScope: pcccViewScopeMeta(viewScope),
      }
    );
  });
}
