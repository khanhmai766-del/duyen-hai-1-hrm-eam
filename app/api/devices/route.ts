import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireRole, requireUser } from "@/lib/api";
import {
  buildEquipmentTreeIndex,
  compareEquipmentSeq,
  getEquipmentDescendantSeqs,
  getNormalizedEquipmentNodes,
  type NormalizedEquipmentNode,
} from "@/lib/equipment-tree";
import { normalizeText } from "@/lib/nav";
import { filterEquipmentNodesForUser } from "@/lib/server-access";
import { maybeUploadDataUrl } from "@/lib/s3";

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

type DeviceUsageStats = {
  repairCount?: number;
  latestRepairAt?: Date | null;
};

function toDeviceRecordWithStats(
  node: NormalizedEquipmentNode,
  parent: NormalizedEquipmentNode | null,
  stats?: DeviceUsageStats
) {
  return {
    ...toDeviceRecord(node, parent),
    repairLogs: stats?.latestRepairAt ? [{ startedAt: stats.latestRepairAt.toISOString() }] : [],
    _count: { repairLogs: stats?.repairCount ?? 0 },
  };
}

async function getDeviceLikeRecords() {
  const nodes = await getNormalizedEquipmentNodes(prisma);
  const index = buildEquipmentTreeIndex(nodes);
  const leafNodes = nodes.filter((node) => (index.childrenOf.get(node.seq) ?? []).length === 0);
  const leafSeqs = leafNodes.map((node) => node.seq);
  const repairStats = leafSeqs.length
    ? await prisma.repairLog.groupBy({
        by: ["deviceSeq"],
        where: { deviceSeq: { in: leafSeqs } },
        _count: { _all: true },
        _max: { startedAt: true },
      })
    : [];
  const statsBySeq = new Map(
    repairStats.map((item) => [
      item.deviceSeq,
      { repairCount: item._count._all, latestRepairAt: item._max.startedAt },
    ])
  );
  return {
    nodes,
    index,
    records: leafNodes.map((node) => {
      const parentSeq = index.parentOf.get(node.seq) ?? node.parentSeq ?? null;
      const parent = parentSeq ? index.bySeq.get(parentSeq) ?? null : null;
      return toDeviceRecordWithStats(node, parent, statsBySeq.get(node.seq));
    }),
  };
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const q = normalizeText(sp.get("q")?.trim() ?? "");
    const systemSeq = sp.get("systemSeq")?.trim();
    const systemName = sp.get("system")?.trim();

    const { nodes, records } = await getDeviceLikeRecords();
    const visibleNodes = await filterEquipmentNodesForUser(user, nodes);
    const visibleSeqs = new Set(visibleNodes.map((node) => node.seq));
    const visibleIndex = buildEquipmentTreeIndex(visibleNodes);
    const allowedSeqs = systemSeq
      ? visibleSeqs.has(systemSeq)
        ? getEquipmentDescendantSeqs(visibleNodes, systemSeq)
        : new Set<string>()
      : null;

    const devices = records
      .filter((device) => {
        if (!visibleSeqs.has(device.code)) return false;
        if (allowedSeqs && !allowedSeqs.has(device.code)) return false;
        if (!allowedSeqs && systemName && systemName !== "ALL" && device.system !== systemName) return false;
        if (!q) return true;
        return normalizeText([device.code, device.name, device.system].filter(Boolean).join(" ")).includes(q);
      })
      .sort((a, b) => compareEquipmentSeq(a.code, b.code));

    const systems = Array.from(
      new Set(
        records
          .filter((device) => visibleSeqs.has(device.code))
          .map((device) => device.system)
          .filter((name): name is string => !!name)
      )
    ).sort((a, b) => a.localeCompare(b, "vi"));

    return ok(devices, {
      total: devices.length,
      totalSystemDevices: records.length,
      systems,
      rootSystems: visibleIndex.roots.map((node) => ({ seq: node.seq, name: node.name })),
      source: "equipment-node",
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const body = await req.json();
    const seq = String(body.code ?? body.seq ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!seq || !name) return fail("Thiếu số thứ tự hoặc tên thiết bị");

    const existing = await prisma.equipmentNode.findUnique({ where: { seq } });
    if (existing) return fail("Số thứ tự thiết bị đã tồn tại");

    const parentSeq = String(body.systemSeq ?? "").trim() || parentSeqOf(seq);
    const maxSort = await prisma.equipmentNode.aggregate({ _max: { sort: true } });
    const rawImageUrl = Array.isArray(body.images) ? body.images.filter(Boolean)[0] ?? null : null;
    const imageUrl = await maybeUploadDataUrl({ value: rawImageUrl, folder: "equipment/images", preset: "image" });
    const node = await prisma.equipmentNode.create({
      data: {
        seq,
        code: seq,
        name,
        parentSeq,
        depth: seq.split(".").length,
        sort: (maxSort._max.sort ?? 0) + 1,
        drawing: null,
        kks: null,
        attachedInfo: typeof body.attachedInfo === "string" ? body.attachedInfo.trim() || null : null,
        documentUrl: typeof body.documentUrl === "string" ? body.documentUrl.trim() || null : null,
        imageUrl,
        deviceSynced: true,
      },
    });

    const nodes = await getNormalizedEquipmentNodes(prisma);
    const index = buildEquipmentTreeIndex(nodes);
    const effectiveParentSeq = index.parentOf.get(node.seq) ?? node.parentSeq ?? null;
    const parent = effectiveParentSeq ? index.bySeq.get(effectiveParentSeq) ?? null : null;
    await audit(user.id, "CREATE_EQUIPMENT_NODE", "EquipmentNode", node.id, node.seq);
    return ok(toDeviceRecord({ ...node, drawing: node.drawing, attachedInfo: node.attachedInfo, documentUrl: node.documentUrl, imageUrl: node.imageUrl }, parent));
  });
}
