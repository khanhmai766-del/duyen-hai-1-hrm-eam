import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import {
  compareEquipmentSeq,
  normalizeEquipmentNodeName,
  type NormalizedEquipmentNode,
} from "@/lib/equipment-tree";
import { getCachedEquipmentNodeList, getEquipmentTreeIndexFor } from "@/lib/equipment-node-cache";
import { assertSeqEditable, filterEquipmentNodesForUser } from "@/lib/server-access";
import { requireDeviceCreate, requireDeviceManage, requireDeviceView } from "@/lib/device-permissions";
import { ensureDeviceQrCardTable } from "@/lib/device-qr-card-table";
import { ensureRepairMachineColumn } from "@/lib/repair-machine";
import { deviceQrValue, normalizeQrMachine } from "@/lib/device-qr";
import { defaultScopeOf, machinesOf, scopeCode } from "@/lib/equipment-units";

export const dynamic = "force-dynamic";

// Cùng shape với /api/devices để tab "Thẻ" tái dùng nguyên lưới thẻ hiện có.
function toCardRecord(
  node: NormalizedEquipmentNode,
  parent: NormalizedEquipmentNode | null,
  machine: "S1" | "S2" | "COMMON",
  stats?: { repairCount: number; latestRepairAt: Date | null }
) {
  return {
    id: node.seq,
    qrCardKey: `${node.seq}:${machine}`,
    code: scopeCode(node.seq, machine),
    machine,
    name: node.name,
    kks: node.kks ?? null,
    system: parent?.name ?? null,
    systemSeq: parent?.seq ?? null,
    managingPosition: null,
    images: node.imageUrl ? [node.imageUrl] : [],
    attachedInfo: node.attachedInfo ?? null,
    documentUrl: node.documentUrl ?? null,
    qrCodeData: deviceQrValue(node.seq, machine),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    repairLogs: stats?.latestRepairAt ? [{ startedAt: stats.latestRepairAt.toISOString() }] : [],
    materials: [],
    _count: { repairLogs: stats?.repairCount ?? 0 },
  };
}

/** GET /api/device-qr-cards — chỉ các thiết bị ĐÃ ĐƯỢC CHỌN tạo thẻ QR. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceView(user);
    await Promise.all([ensureDeviceQrCardTable(), ensureRepairMachineColumn()]);
    const cards = await prisma.deviceQrCard.findMany({ select: { deviceSeq: true, machine: true } });
    if (!cards.length) return ok([], { total: 0 });

    const cardSeqs = new Set(cards.map((c) => c.deviceSeq));
    // Chỉ dùng bản cây nhẹ để tính quyền và quan hệ cha. Ảnh/base64 cùng thông tin
    // đính kèm chỉ được đọc cho đúng các thiết bị đã có thẻ, không kéo cả cây vào RAM.
    const nodes = await getCachedEquipmentNodeList();
    const visibleNodes = await filterEquipmentNodesForUser(user, nodes);
    const visibleSeqs = new Set(visibleNodes.map((node) => node.seq));
    const index = getEquipmentTreeIndexFor(nodes);

    const seqs = [...cardSeqs].filter((seq) => visibleSeqs.has(seq) && index.bySeq.has(seq));
    const [repairStats, cardDetails] = seqs.length
      ? await Promise.all([prisma.repairLog.groupBy({
          by: ["deviceSeq"],
          where: { deviceSeq: { in: seqs } },
          _count: { _all: true },
          _max: { startedAt: true },
        }), prisma.equipmentNode.findMany({
          where: { seq: { in: seqs } },
          select: { seq: true, name: true, kks: true, attachedInfo: true, documentUrl: true, imageUrl: true },
        })])
      : [[], []];
    const statsBySeq = new Map(
      repairStats.map((item) => [item.deviceSeq, { repairCount: item._count._all, latestRepairAt: item._max.startedAt }])
    );
    const detailBySeq = new Map(cardDetails.map((item) => [item.seq, item]));

    const data = cards
      .filter((card) => visibleSeqs.has(card.deviceSeq) && index.bySeq.has(card.deviceSeq))
      .sort((a, b) => compareEquipmentSeq(a.deviceSeq, b.deviceSeq) || a.machine.localeCompare(b.machine))
      .map((card) => {
        const seq = card.deviceSeq;
        const lightNode = index.bySeq.get(seq)!;
        const detail = detailBySeq.get(seq);
        const node: NormalizedEquipmentNode = {
          ...lightNode,
          name: normalizeEquipmentNodeName(seq, detail?.name ?? lightNode.name),
          kks: detail?.kks ?? null,
          attachedInfo: detail?.attachedInfo ?? null,
          documentUrl: detail?.documentUrl ?? null,
          imageUrl: detail?.imageUrl ?? null,
        };
        const parentSeq = index.parentOf.get(seq) ?? node.parentSeq ?? null;
        const parent = parentSeq ? index.bySeq.get(parentSeq) ?? null : null;
        const machine = normalizeQrMachine(card.machine) ?? defaultScopeOf(seq);
        return toCardRecord(node, parent, machine, statsBySeq.get(seq));
      });
    return ok(data, { total: data.length });
  });
}

/** POST /api/device-qr-cards — tạo thẻ QR cho thiết bị lá hoặc thiết bị lớn/thư mục cha. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await ensureDeviceQrCardTable();
    await requireDeviceCreate(user);
    const body = await req.json();
    const deviceSeq = String(body.deviceSeq ?? "").trim();
    if (!deviceSeq) return fail("Chưa chọn thiết bị");
    await assertSeqEditable(user, deviceSeq);

    const node = await prisma.equipmentNode.findUnique({ where: { seq: deviceSeq }, select: { seq: true } });
    if (!node) return fail("Không tìm thấy thiết bị trong cây thư mục", 404);
    const machine = normalizeQrMachine(body.machine) ?? defaultScopeOf(deviceSeq);
    if (!machinesOf(deviceSeq).includes(machine)) return fail("Tổ máy không phù hợp với thiết bị đã chọn");
    const exists = await prisma.deviceQrCard.findFirst({ where: { deviceSeq, machine } });
    if (exists) return fail("Thiết bị này đã có thẻ QR trong phạm vi tổ máy đã chọn");

    const card = await prisma.deviceQrCard.create({ data: { deviceSeq, machine, createdById: user.id } });
    await audit(user.id, "CREATE_DEVICE_QR_CARD", "DeviceQrCard", card.id, `${deviceSeq} · ${machine}`);
    return ok(card);
  });
}

/** DELETE /api/device-qr-cards?seq=... — gỡ thẻ QR (KHÔNG xoá thiết bị). */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await ensureDeviceQrCardTable();
    await requireDeviceManage(user, "Bạn không có quyền gỡ thẻ QR thiết bị");
    const seq = req.nextUrl.searchParams.get("seq")?.trim();
    if (!seq) return fail("Thiếu seq thiết bị");
    await assertSeqEditable(user, seq);
    const machine = normalizeQrMachine(req.nextUrl.searchParams.get("machine"));
    const { count } = await prisma.deviceQrCard.deleteMany({ where: { deviceSeq: seq, ...(machine ? { machine } : {}) } });
    if (!count) return fail("Thiết bị này chưa có thẻ QR", 404);
    await audit(user.id, "DELETE_DEVICE_QR_CARD", "DeviceQrCard", seq, `${seq}${machine ? ` · ${machine}` : ""}`);
    return ok({ seq, machine });
  });
}
