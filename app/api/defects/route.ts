import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { assertSeqEditable, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { normalizeImpactValue } from "@/lib/defect-impact-fields";
import { maybeUploadDataUrl } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

const INCLUDE = { createdBy: { select: { id: true, name: true, position: true, avatarUrl: true } } };

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    // Ẩn các phiếu đã xử lý quá 2 tuần khỏi danh sách (lịch sử vẫn giữ riêng).
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const defects = await prisma.defect.findMany({
      where: { NOT: { AND: [{ status: "DA_XU_LY" }, { completedAt: { lt: cutoff } }] } },
      orderBy: { createdAt: "desc" },
      include: INCLUDE,
    });
    // Cột fireSafetyImpact/environmentSafetyImpact đã thuộc model Defect nên có sẵn trong kết quả.
    const data = defects.filter(
      (defect) => !access.hasExplicitScopes || access.canViewDeviceLike({ device: defect.device, system: defect.system })
    );
    return ok(data, { total: data.length });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["create", "manage", "full"], "Không đủ quyền ghi nhận khiếm khuyết");
    const body = await req.json();

    if (!body.unit) return fail("Vui lòng chọn tổ máy");
    if (body.device) await assertSeqEditable(user, String(body.device));
    const imageUrl = await maybeUploadDataUrl({ value: body.imageUrl || null, folder: "defects/images", preset: "image" });

    // Khóa liên kết chuẩn với cây: chỉ gán khi "device" là seq có thật (FK không chặn giá trị lạ).
    const deviceSeq = body.device
      ? (await prisma.equipmentNode.findUnique({ where: { seq: String(body.device) }, select: { seq: true } }))?.seq ?? null
      : null;

    const defect = await prisma.defect.create({
      data: {
        unit: body.unit,
        device: body.device || null,
        deviceSeq,
        system: body.system || null,
        severity: body.severity || null,
        condition: body.condition || null,
        requestType: body.requestType || null,
        requestNumber: body.requestNumber?.trim() || null,
        content: body.content?.trim() || null,
        status: body.status || "CHUA_XU_LY",
        detectedAt: body.detectedAt ? new Date(body.detectedAt) : null,
        note: body.note?.trim() || null,
        imageUrl,
        fireSafetyImpact: normalizeImpactValue(body.fireSafetyImpact),
        environmentSafetyImpact: normalizeImpactValue(body.environmentSafetyImpact),
        createdById: user.id,
      },
      include: INCLUDE,
    });
    await audit(user.id, "CREATE_DEFECT", "Defect", defect.id);
    return ok(defect);
  });
}
