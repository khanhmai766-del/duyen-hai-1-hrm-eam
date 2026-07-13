import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import {
  buildEquipmentTreeIndex,
  getNormalizedEquipmentNodes,
  type NormalizedEquipmentNode,
} from "@/lib/equipment-tree";
import { assertSeqEditable, assertSeqViewable } from "@/lib/server-access";
import { maybeUploadDataUrl } from "@/lib/s3";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";
import { invalidateEquipmentNodeCache } from "@/lib/equipment-node-cache";
import { hasPermissionLevel, requirePermissionLevel } from "@/lib/rbac-guard";
import { ensureRepairMachineColumn } from "@/lib/repair-machine";
import { ensureDeviceQrCardTable } from "@/lib/device-qr-card-table";

export const dynamic = "force-dynamic";

function parentSeqOf(seq: string) {
  const parts = seq.split(".");
  parts.pop();
  return parts.length ? parts.join(".") : null;
}

function publicEquipmentUrl(seq: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${base}/public/equipment/${encodeURIComponent(seq)}`;
}

function toDeviceRecord(node: NormalizedEquipmentNode, parent: NormalizedEquipmentNode | null) {
  return {
    id: node.seq,
    code: node.seq,
    name: node.name,
    system: parent?.name ?? null,
    systemSeq: parent?.seq ?? null,
    managingPosition: null,
    images: node.imageUrl ? [node.imageUrl] : [],
    attachedInfo: node.attachedInfo ?? null,
    documentUrl: node.documentUrl ?? null,
    qrCodeData: publicEquipmentUrl(node.seq),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    repairLogs: [],
    materials: [],
    _count: { repairLogs: 0 },
  };
}

async function findEquipmentRecord(seq: string) {
  await Promise.all([ensureRepairMachineColumn(), ensureDeviceQrCardTable()]);
  const nodes = await getNormalizedEquipmentNodes(prisma);
  const index = buildEquipmentTreeIndex(nodes);
  const node = index.bySeq.get(seq);
  if (!node) return null;
  const parentSeq = index.parentOf.get(node.seq) ?? node.parentSeq ?? null;
  const parent = parentSeq ? index.bySeq.get(parentSeq) ?? null : null;
  const [repairLogs, materials, materialDeclarations, replacementUsage, qrCard, currentDefects, defectHistory] = await Promise.all([
    prisma.repairLog.findMany({
      where: { deviceSeq: node.seq },
      orderBy: { startedAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.equipmentMaterial.findMany({
      where: { deviceSeq: node.seq },
      orderBy: { usedAt: "desc" },
      include: { material: true },
    }),
    prisma.materialReplacement.findMany({
      where: { deviceSeq: node.seq, isActive: false },
      orderBy: { createdAt: "desc" },
      include: {
        material: { select: { id: true, name: true, unit: true, machine: true, category: true } },
      },
    }),
    prisma.materialReplacementLog.findMany({
      where: { replacement: { deviceSeq: node.seq } },
      orderBy: { replacedAt: "desc" },
      include: {
        replacement: {
          select: {
            location: true,
            system: true,
            material: { select: { id: true, name: true, unit: true, machine: true, category: true } },
          },
        },
      },
    }),
    prisma.deviceQrCard.findUnique({ where: { deviceSeq: node.seq }, select: { id: true, createdAt: true } }),
    prisma.defect.findMany({
      where: { deviceSeq: node.seq, status: { not: "DA_XU_LY" } },
      orderBy: [{ severity: "asc" }, { detectedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        unit: true,
        severity: true,
        content: true,
        status: true,
        requestType: true,
        requestNumber: true,
        detectedAt: true,
        note: true,
      },
      take: 50,
    }),
    prisma.defectHistory.findMany({
      where: { deviceSeq: node.seq },
      orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        unit: true,
        content: true,
        result: true,
        requestType: true,
        requestNumber: true,
        workOrderNumber: true,
        performedAt: true,
        createdBy: { select: { id: true, name: true } },
      },
      take: 20,
    }),
  ]);
  return {
    ...toDeviceRecord(node, parent),
    repairLogs,
    materials,
    materialDeclarations,
    materialUsage: replacementUsage,
    hasQrCard: Boolean(qrCard),
    qrCardCreatedAt: qrCard?.createdAt ?? null,
    currentDefects,
    defectHistory,
    _count: { repairLogs: repairLogs.length },
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const seq = decodeURIComponent(params.id);
    await assertSeqViewable(user, seq);
    const device = await findEquipmentRecord(seq);
    if (!device) return fail("Không tìm thấy thiết bị", 404);
    return ok(device);
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "device-manage", ["manage", "full"], "Không đủ quyền cập nhật thiết bị");
    const currentSeq = decodeURIComponent(params.id);
    await assertSeqEditable(user, currentSeq);
    const body = await req.json();
    const current = await prisma.equipmentNode.findUnique({ where: { seq: currentSeq } });
    if (!current) return fail("Không tìm thấy thiết bị", 404);

    const nextSeq = typeof body.code === "string" ? body.code.trim() : currentSeq;
    const name = typeof body.name === "string" ? body.name.trim() : current.name;
    if (!nextSeq || !name) return fail("Số thứ tự và tên thiết bị không được để trống");
    if (nextSeq !== currentSeq && !(await hasPermissionLevel(user, "device-code", ["full"]))) {
      return fail("Chỉ Quản trị viên được chỉnh sửa số thứ tự thiết bị", 403);
    }
    if (nextSeq !== currentSeq) {
      const exists = await prisma.equipmentNode.findUnique({ where: { seq: nextSeq } });
      if (exists) return fail("Số thứ tự thiết bị đã tồn tại");
    }

    const images = Array.isArray(body.images) ? body.images.filter(Boolean) : [];
    const imageUrl =
      body.images !== undefined
        ? await maybeUploadDataUrl({ value: images[0] ?? null, folder: "equipment/images", preset: "image" })
        : undefined;
    const parentSeq = typeof body.systemSeq === "string" && body.systemSeq.trim()
      ? body.systemSeq.trim()
      : parentSeqOf(nextSeq);
    const node = await prisma.equipmentNode.update({
      where: { seq: currentSeq },
      data: {
        seq: nextSeq,
        code: nextSeq,
        name,
        parentSeq,
        depth: nextSeq.split(".").length,
        attachedInfo: body.attachedInfo !== undefined ? String(body.attachedInfo || "").trim() || null : undefined,
        documentUrl:
          body.documentUrl !== undefined
            ? await maybeUploadDataUrl({
                value: String(body.documentUrl || "").trim() || null,
                folder: "equipment/documents",
                preset: "document-image",
              })
            : undefined,
        imageUrl,
      },
    });

    await audit(user.id, "UPDATE_EQUIPMENT_NODE", "EquipmentNode", node.id, node.seq);
    invalidateEquipmentNodeCache();
    invalidateDeviceListCache();
    const device = await findEquipmentRecord(node.seq);
    return ok(device);
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "device-delete", ["full"], "Không đủ quyền xoá thiết bị");
    const seq = decodeURIComponent(params.id);
    const node = await prisma.equipmentNode.findUnique({ where: { seq } });
    if (!node) return fail("Không tìm thấy thiết bị", 404);
    const childCount = await prisma.equipmentNode.count({ where: { parentSeq: seq } });
    if (childCount > 0) return fail("Không thể xóa thư mục/hệ thống đang có thiết bị con", 400);
    await prisma.equipmentNode.delete({ where: { seq } });
    await audit(user.id, "DELETE_EQUIPMENT_NODE", "EquipmentNode", node.id, node.seq);
    invalidateEquipmentNodeCache();
    invalidateDeviceListCache();
    return ok({ id: seq, code: seq });
  });
}
