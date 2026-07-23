import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import {
  buildEquipmentTreeIndex,
  type NormalizedEquipmentNode,
} from "@/lib/equipment-tree";
import { assertSeqEditable, assertSeqViewable, managingPositionsForEquipmentSeq } from "@/lib/server-access";
import { maybeUploadDataUrl } from "@/lib/s3";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";
import { getCachedEquipmentNodeFull, invalidateEquipmentNodeCache,  getEquipmentTreeIndexFor } from "@/lib/equipment-node-cache";
import { hasPermissionLevel, requirePermissionLevel } from "@/lib/rbac-guard";
import { ensureRepairMachineColumn } from "@/lib/repair-machine";
import { ensureDeviceQrCardTable } from "@/lib/device-qr-card-table";
import { normalizeText } from "@/lib/nav";
import { machinesOf, s2Code, s2Kks, type EquipmentMachine } from "@/lib/equipment-units";

export const dynamic = "force-dynamic";

function parentSeqOf(seq: string) {
  const parts = seq.split(".");
  parts.pop();
  return parts.length ? parts.join(".") : null;
}

const MAX_EQUIPMENT_DEPTH = 16; // số đoạn của mã đầy đủ (gồm DH1.S1) — giới hạn kỹ thuật

// Mã thiết bị đầy đủ (fullCode) sau re-key: DH1.S1 + các cấp số nguyên dương.
function validateEquipmentSeq(seq: string) {
  if (!/^DH1\.S1(?:\.[1-9]\d*)*$/.test(seq)) {
    return "Mã thiết bị phải bắt đầu bằng DH1.S1, các cấp sau là số nguyên dương phân cách bằng dấu chấm (vd DH1.S1.1.2.3)";
  }
  if (seq.split(".").length > MAX_EQUIPMENT_DEPTH) return `Cây thiết bị chỉ hỗ trợ tối đa ${MAX_EQUIPMENT_DEPTH} cấp`;
  return null;
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
    kks: node.kks ?? null,
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

async function findEquipmentRecord(seq: string, requestedMachine?: string | null) {
  await Promise.all([ensureRepairMachineColumn(), ensureDeviceQrCardTable()]);
  const nodes = await getCachedEquipmentNodeFull();
  const index = getEquipmentTreeIndexFor(nodes);
  const node = index.bySeq.get(seq);
  if (!node) return null;
  const allowedMachines = machinesOf(node.seq);
  const normalizedMachine = requestedMachine?.toUpperCase() as EquipmentMachine | undefined;
  const machine = normalizedMachine && allowedMachines.includes(normalizedMachine)
    ? normalizedMachine
    : allowedMachines[0];
  const parentSeq = index.parentOf.get(node.seq) ?? node.parentSeq ?? null;
  const parent = parentSeq ? index.bySeq.get(parentSeq) ?? null : null;
  const [repairLogs, materials, materialDeclarations, replacementUsage, qrCard, currentDefects, defectHistory, managingPositions, profile, parentProfile] = await Promise.all([
    prisma.repairLog.findMany({
      where: { deviceSeq: node.seq, machine },
      orderBy: { startedAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.equipmentMaterial.findMany({
      where: { deviceSeq: node.seq, material: { machine } },
      orderBy: { usedAt: "desc" },
      include: { material: true },
    }),
    prisma.materialReplacement.findMany({
      where: { deviceSeq: node.seq, machine, isActive: false },
      orderBy: { createdAt: "desc" },
      include: {
        material: { select: { id: true, name: true, unit: true, machine: true, category: true } },
      },
    }),
    prisma.materialReplacementLog.findMany({
      where: { replacement: { deviceSeq: node.seq, machine } },
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
    prisma.deviceQrCard.findFirst({ where: { deviceSeq: node.seq, machine }, select: { id: true, createdAt: true } }),
    prisma.defect.findMany({
      where: { deviceSeq: node.seq, unit: machine, status: { not: "DA_XU_LY" } },
      orderBy: [{ severity: "asc" }, { detectedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        unit: true,
        severity: true,
        severityCriteria: true,
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
      where: { deviceSeq: node.seq, unit: machine },
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
    managingPositionsForEquipmentSeq(node.seq, nodes),
    prisma.equipmentProfile.findUnique({ where: { nodeSeq_machine: { nodeSeq: node.seq, machine } } }),
    parent
      ? prisma.equipmentProfile.findUnique({ where: { nodeSeq_machine: { nodeSeq: parent.seq, machine } } })
      : Promise.resolve(null),
  ]);
  const base = toDeviceRecord(node, parent);
  const profileCode = machine === "S2" ? s2Code(node.seq) : node.seq;
  const profileKks = profile?.kks ?? (machine === "S2" ? s2Kks(node.kks ?? null) : node.kks ?? null);
  const isSecondary = machine === "S2";
  return {
    ...base,
    machine,
    code: profileCode,
    name: profile?.name ?? node.name,
    kks: profileKks,
    system: parentProfile?.name ?? parent?.name ?? null,
    images: profile?.imageUrl ? [profile.imageUrl] : (isSecondary ? [] : base.images),
    attachedInfo: profile?.attachedInfo ?? (isSecondary ? null : base.attachedInfo),
    documentUrl: profile?.documentUrl ?? (isSecondary ? null : base.documentUrl),
    qrCodeData: publicEquipmentUrl(node.seq),
    managingPosition: managingPositions[0] ?? null,
    managingPositions,
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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const seq = decodeURIComponent(params.id);
    await assertSeqViewable(user, seq);
    const device = await findEquipmentRecord(seq, req.nextUrl.searchParams.get("machine"));
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
    const kks = body.kks !== undefined ? String(body.kks ?? "").trim() || null : current.kks;
    if (!nextSeq || !name) return fail("Số thứ tự và tên thiết bị không được để trống");
    if (name.length > 200) return fail("Tên thiết bị không được vượt quá 200 ký tự");
    const seqError = validateEquipmentSeq(nextSeq);
    if (seqError) return fail(seqError);
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
    if (parentSeq) {
      // Dùng cây chuẩn hoá giống API cây thiết bị; một số thư mục hệ thống tổng
      // hợp có trên giao diện nhưng không có dòng vật lý riêng trong DB.
      const normalizedNodes = await getCachedEquipmentNodeFull();
      const parent = normalizedNodes.find((item) => item.seq === parentSeq);
      if (!parent) return fail("Không tìm thấy thư mục hoặc thiết bị cha đã chọn");
      if (parent.seq === currentSeq) return fail("Thiết bị không thể là thư mục cha của chính nó");
      if (parent.seq.split(".").length >= MAX_EQUIPMENT_DEPTH) return fail(`Không thể đặt thiết bị con dưới cấp ${MAX_EQUIPMENT_DEPTH}`);
      if (parentSeqOf(nextSeq) !== parentSeq) return fail(`Số thứ tự thiết bị phải nằm ngay dưới thư mục cha ${parentSeq}`);
    }
    const node = await prisma.equipmentNode.update({
      where: { seq: currentSeq },
      data: {
        seq: nextSeq,
        code: nextSeq,
        name,
        kks,
        searchText: normalizeText(`${name} ${kks ?? ""} ${nextSeq.replace(/^DH1\.S1\.?/, "")} ${nextSeq}`),
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
