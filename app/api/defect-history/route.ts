import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { assertSeqEditable, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { maybeUploadDataUrlList, publicUserRef } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

// Tầng 4: avatar trong list đi qua publicUserRef (proxy theo key) — không chở base64.
const INCLUDE = { createdBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } } };
// Tầng 4: bảng lịch sử phình theo năm tháng — GET luôn có trần, không findMany không giới hạn.
const HISTORY_TAKE = 300;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    const { searchParams } = new URL(req.url);
    const system = searchParams.get("system");
    const unit = searchParams.get("unit");
    const workOrderNumber = searchParams.get("workOrderNumber");
    const device = searchParams.get("device");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};
    if (system) where.system = system;
    if (unit) where.unit = unit;
    if (workOrderNumber) where.workOrderNumber = { contains: workOrderNumber, mode: "insensitive" };
    if (device) where.device = { contains: device, mode: "insensitive" };
    if (from || to) {
      where.performedAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
      };
    }

    const history = await prisma.defectHistory.findMany({
      where,
      orderBy: { performedAt: "desc" },
      include: INCLUDE,
      take: HISTORY_TAKE,
    });
    const data = history
      .filter(
        (item) => !access.hasExplicitScopes || access.canViewDeviceLike({ device: item.device, system: item.system })
      )
      .map((item) => ({ ...item, createdBy: publicUserRef(item.createdBy) }));
    return ok(data, { total: data.length, capped: history.length === HISTORY_TAKE });
  });
}

/** Thêm mới một bản ghi lịch sử khiếm khuyết thủ công (không qua phiếu khiếm khuyết). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["create", "manage", "full"], "Không đủ quyền thêm lịch sử khiếm khuyết");
    const body = await req.json();

    if (!body.unit) return fail("Vui lòng chọn tổ máy");
    if (body.device) await assertSeqEditable(user, String(body.device));

    const images = await maybeUploadDataUrlList(
      Array.isArray(body.images) ? body.images.filter(Boolean).slice(0, 3) : [],
      "defect-history/images",
      "image"
    );
    const history = await prisma.defectHistory.create({
      data: {
        unit: body.unit,
        device: body.device?.trim() || null,
        system: body.system?.trim() || null,
        requestType: body.requestType?.trim() || null,
        workOrderNumber: body.workOrderNumber?.trim() || null,
        performedAt: body.performedAt ? new Date(body.performedAt) : new Date(),
        result: body.result?.trim() || null,
        content: body.content?.trim() || null,
        requestNumber: body.requestNumber?.trim() || null,
        images,
        createdById: user.id,
      },
      include: INCLUDE,
    });
    await audit(user.id, "CREATE_DEFECT_HISTORY", "DefectHistory", history.id);
    return ok({ ...history, createdBy: publicUserRef(history.createdBy) });
  });
}
