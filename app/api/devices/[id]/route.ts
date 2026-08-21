import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import {
  buildEquipmentTreeIndex,
  getEquipmentSeqsWithinDepth,
  type NormalizedEquipmentNode,
} from "@/lib/equipment-tree";
import { assertSeqEditable, assertSeqViewable, managingPositionsForEquipmentSeq } from "@/lib/server-access";
import { maybeUploadDataUrl } from "@/lib/s3";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";
import { getCachedEquipmentNodeList, invalidateEquipmentNodeCache, getEquipmentTreeIndexFor } from "@/lib/equipment-node-cache";
import { recomputeChildCount } from "@/lib/equipment-child-count";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { requireDeviceDelete, requireDeviceManage, requireDeviceView } from "@/lib/device-permissions";
import { ensureRepairMachineColumn } from "@/lib/repair-machine";
import { ensureDeviceQrCardTable } from "@/lib/device-qr-card-table";
import { normalizeText } from "@/lib/nav";
import { MAX_EQUIPMENT_DEPTH, canonicalSeq, machinesOf, s2Code, s2Kks, type EquipmentMachine, validateEquipmentSeq } from "@/lib/equipment-units";
import { deviceQrValue } from "@/lib/device-qr";

export const dynamic = "force-dynamic";

function parentSeqOf(seq: string) {
  const parts = seq.split(".");
  parts.pop();
  return parts.length ? parts.join(".") : null;
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
    qrCodeData: deviceQrValue(node.seq),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    repairLogs: [],
    materials: [],
    _count: { repairLogs: 0 },
  };
}

async function findEquipmentRecord(seq: string, requestedMachine?: string | null, requestedDescendantDepth?: string | null) {
  await Promise.all([ensureRepairMachineColumn(), ensureDeviceQrCardTable()]);
  // Cây nhẹ đủ để tính cha/con và phạm vi tổng hợp. Dữ liệu nặng (đặc biệt ảnh
  // base64) chỉ đọc cho đúng thiết bị đang mở, không kéo ảnh của toàn bộ cây.
  const nodes = await getCachedEquipmentNodeList();
  const index = getEquipmentTreeIndexFor(nodes);
  const lightNode = index.bySeq.get(seq);
  if (!lightNode) return null;
  const detail = await prisma.equipmentNode.findUnique({
    where: { seq },
    select: { kks: true, attachedInfo: true, documentUrl: true, imageUrl: true },
  });
  if (!detail) return null;
  const node: NormalizedEquipmentNode = { ...lightNode, ...detail };
  const allowedMachines = machinesOf(node.seq);
  const normalizedMachine = requestedMachine?.toUpperCase() as EquipmentMachine | undefined;
  const machine = normalizedMachine && allowedMachines.includes(normalizedMachine)
    ? normalizedMachine
    : allowedMachines[0];
  const descendantDepth = Math.min(
    3,
    Math.max(0, Number.parseInt(requestedDescendantDepth ?? "2", 10) || 0)
  );
  const profileSeqs = [...getEquipmentSeqsWithinDepth(nodes, node.seq, descendantDepth)];
  const includesDescendants = profileSeqs.length > 1;
  // Thiết bị COMMON dùng chung một deviceSeq cho cả phiếu S1, S2 và COMMON.
  // Khi xem lịch sử của thiết bị dùng chung, không lọc theo unit để tránh bỏ sót
  // các phiếu đã chốt từ từng tổ máy. Thiết bị thường vẫn giữ đúng hồ sơ S1/S2.
  const mappedDeviceWhere = machine === "COMMON"
    ? {
        OR: [
          { deviceSeq: { in: profileSeqs } },
          { relatedDevices: { some: { deviceSeq: { in: profileSeqs } } } },
        ],
      }
    : {
        OR: [
          { deviceSeq: { in: profileSeqs }, mappedDeviceUnit: machine },
          { deviceSeq: { in: profileSeqs }, mappedDeviceUnit: null, unit: machine },
          { relatedDevices: { some: { deviceSeq: { in: profileSeqs }, mappedUnit: machine } } },
          { relatedDevices: { some: { deviceSeq: { in: profileSeqs }, mappedUnit: null } }, unit: machine },
        ],
      };
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
      where: { deviceSeq: { in: profileSeqs }, material: { machine } },
      orderBy: { usedAt: "desc" },
      include: { material: true, device: { select: { seq: true, name: true } } },
    }),
    prisma.materialReplacement.findMany({
      where: { deviceSeq: { in: profileSeqs }, machine, isActive: false },
      orderBy: { createdAt: "desc" },
      include: {
        material: { select: { id: true, code: true, name: true, unit: true, machine: true, category: true } },
        device: { select: { seq: true, name: true } },
        _count: { select: { logs: true, defectRequests: true } },
      },
    }),
    prisma.materialReplacementLog.findMany({
      where: { replacement: { deviceSeq: { in: profileSeqs }, machine } },
      orderBy: { replacedAt: "desc" },
      include: {
        replacement: {
          select: {
            deviceSeq: true,
            location: true,
            system: true,
            device: { select: { seq: true, name: true } },
            material: { select: { id: true, name: true, unit: true, machine: true, category: true } },
          },
        },
      },
    }),
    prisma.deviceQrCard.findFirst({ where: { deviceSeq: node.seq, machine }, select: { id: true, createdAt: true } }),
    prisma.defect.findMany({
      where: {
        status: { not: "DA_XU_LY" },
        ...mappedDeviceWhere,
      },
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
        node: { select: { seq: true, name: true } },
        relatedDevices: {
          select: { deviceSeq: true, device: { select: { seq: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      take: 50,
    }),
    prisma.defectHistory.findMany({
      where: {
        ...mappedDeviceWhere,
      },
      orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        unit: true,
        defectContent: true,
        content: true,
        result: true,
        requestType: true,
        requestNumber: true,
        workOrderNumber: true,
        performedAt: true,
        createdBy: { select: { id: true, name: true } },
        node: { select: { seq: true, name: true } },
        relatedDevices: {
          select: { deviceSeq: true, device: { select: { seq: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
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
    qrCodeData: deviceQrValue(node.seq, machine),
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
    includesDescendants,
    includedDeviceCount: profileSeqs.length,
    includedDescendantDepth: descendantDepth,
    _count: { repairLogs: repairLogs.length },
  };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceView(user);
    const seq = decodeURIComponent(params.id);
    await assertSeqViewable(user, seq);
    const device = await findEquipmentRecord(
      seq,
      req.nextUrl.searchParams.get("machine"),
      req.nextUrl.searchParams.get("includeDescendants")
    );
    if (!device) return fail("Không tìm thấy thiết bị", 404);
    return ok(device);
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceManage(user, "Bạn không có quyền cập nhật thiết bị");
    const currentSeq = decodeURIComponent(params.id);
    await assertSeqEditable(user, currentSeq);
    const body = await req.json();
    const current = await prisma.equipmentNode.findUnique({ where: { seq: currentSeq } });
    if (!current) return fail("Không tìm thấy thiết bị", 404);

    // Mã gửi lên có thể theo tổ máy đang xem (DH1.S2.…) — quy về mã chuẩn trước khi dùng.
    const nextSeq = typeof body.code === "string" ? canonicalSeq(body.code.trim()) : currentSeq;
    const name = typeof body.name === "string" ? body.name.trim() : current.name;
    const kks = body.kks !== undefined ? String(body.kks ?? "").trim() || null : current.kks;
    if (!nextSeq || !name) return fail("Số thứ tự và tên thiết bị không được để trống");
    if (name.length > 200) return fail("Tên thiết bị không được vượt quá 200 ký tự");
    if (kks && kks.length > 100) return fail("Mã KKS không được vượt quá 100 ký tự");
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
      ? canonicalSeq(body.systemSeq.trim())
      : parentSeqOf(nextSeq);
    if (parentSeq) {
      // Dùng cây chuẩn hoá giống API cây thiết bị; một số thư mục hệ thống tổng
      // hợp có trên giao diện nhưng không có dòng vật lý riêng trong DB.
      const normalizedNodes = await getCachedEquipmentNodeList();
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
    await requireDeviceDelete(user);
    const seq = decodeURIComponent(params.id);
    await assertSeqEditable(user, seq);
    const node = await prisma.equipmentNode.findUnique({ where: { seq } });
    if (!node) return fail("Không tìm thấy thiết bị", 404);
    if (node.parentSeq === null) return fail("Không thể xóa hệ thống gốc", 400);
    const childCount = await prisma.equipmentNode.count({ where: { parentSeq: seq } });
    if (childCount > 0) return fail("Không thể xóa thư mục/hệ thống đang có thiết bị con", 400);
    await prisma.equipmentNode.delete({ where: { seq } });
    // Cập nhật lại childCount của thư mục cha (nếu xóa hết con, cha sẽ tự về dạng lá).
    await recomputeChildCount(prisma, [node.parentSeq]);
    await audit(user.id, "DELETE_EQUIPMENT_NODE", "EquipmentNode", node.id, node.seq);
    invalidateEquipmentNodeCache();
    invalidateDeviceListCache();
    return ok({ id: seq, code: seq });
  });
}
