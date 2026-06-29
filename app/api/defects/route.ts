import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { assertSeqEditable, resolveEquipmentAccessForUser } from "@/lib/server-access";
import {
  ensureDefectImpactColumns,
  normalizeImpactValue,
  readDefectImpactFields,
  updateDefectImpactFields,
} from "@/lib/defect-impact-fields";

export const dynamic = "force-dynamic";

const INCLUDE = { createdBy: { select: { id: true, name: true, position: true, avatarUrl: true } } };

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    await ensureDefectImpactColumns(prisma);
    // Ẩn các phiếu đã xử lý quá 2 tuần khỏi danh sách (lịch sử vẫn giữ riêng).
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const defects = await prisma.defect.findMany({
      where: { NOT: { AND: [{ status: "DA_XU_LY" }, { completedAt: { lt: cutoff } }] } },
      orderBy: { createdAt: "desc" },
      include: INCLUDE,
    });
    const impactById = await readDefectImpactFields(prisma, defects.map((defect) => defect.id));
    const data = defects
      .filter((defect) => !access.hasExplicitScopes || access.canViewDeviceLike({ device: defect.device, system: defect.system }))
      .map((defect) => ({ ...defect, ...impactById.get(defect.id) }));
    return ok(data, { total: data.length });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json();

    if (!body.unit) return fail("Vui lòng chọn tổ máy");
    if (body.device) await assertSeqEditable(user, String(body.device));
    await ensureDefectImpactColumns(prisma);
    const impactFields = {
      fireSafetyImpact: normalizeImpactValue(body.fireSafetyImpact),
      environmentSafetyImpact: normalizeImpactValue(body.environmentSafetyImpact),
    };

    const defect = await prisma.defect.create({
      data: {
        unit: body.unit,
        device: body.device || null,
        system: body.system || null,
        severity: body.severity || null,
        condition: body.condition || null,
        requestType: body.requestType || null,
        requestNumber: body.requestNumber?.trim() || null,
        content: body.content?.trim() || null,
        status: body.status || "CHUA_XU_LY",
        detectedAt: body.detectedAt ? new Date(body.detectedAt) : null,
        note: body.note?.trim() || null,
        createdById: user.id,
      },
      include: INCLUDE,
    });
    await updateDefectImpactFields(prisma, defect.id, impactFields);
    await audit(user.id, "CREATE_DEFECT", "Defect", defect.id);
    return ok({ ...defect, ...impactFields });
  });
}
