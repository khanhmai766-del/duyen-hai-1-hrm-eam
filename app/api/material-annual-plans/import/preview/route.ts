import type { NextRequest } from "next/server";
import { audit, auditDetailWithPosition, handle, ok, requireUser } from "@/lib/api";
import { buildAnnualPlanImportPreview } from "@/lib/material-annual-plan-import";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { readAnnualPlanWorkbook } from "../shared";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["manage", "full"], "Không đủ quyền nhập kế hoạch vật tư");
    const { buffer, fileName, sheetName } = await readAnnualPlanWorkbook(req);
    const preview = await buildAnnualPlanImportPreview(prisma, buffer, fileName, sheetName);
    await audit(
      user.id,
      "PREVIEW_MATERIAL_ANNUAL_PLAN",
      "MaterialAnnualPlan",
      preview.fileHash,
      auditDetailWithPosition(user, `Đối chiếu ${fileName} · ${preview.selectedSheet}`),
    );
    return ok(preview);
  });
}
