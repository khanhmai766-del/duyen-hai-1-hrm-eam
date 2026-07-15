import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import {
  buildEquipmentTreeIndex,
  compareEquipmentSeq,
  getEquipmentDescendantSeqs,
  getNormalizedEquipmentNodes,
  type NormalizedEquipmentNode,
} from "@/lib/equipment-tree";
import { normalizeText } from "@/lib/nav";
import { filterEquipmentNodesForUser, loadPositionSystemScopeRows } from "@/lib/server-access";
import { maybeUploadDataUrl } from "@/lib/s3";
import { getOrSetDeviceListCache, invalidateDeviceListCache } from "@/lib/device-list-cache";
import { getCachedEquipmentNodeFull, invalidateEquipmentNodeCache } from "@/lib/equipment-node-cache";
import { requirePermissionLevel } from "@/lib/rbac-guard";

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

type DeviceListRecord = ReturnType<typeof toDeviceRecordWithStats>;
type DeviceListResult = {
  data: DeviceListRecord[];
  meta: {
    total: number;
    totalSystemDevices: number;
    systems: string[];
    rootSystems: Array<{ seq: string; name: string }>;
    byPosition: Array<{ name: string; count: number }>;
    source: string;
  };
};

function deviceListCacheKey(
  user: { role?: string | null; position?: string | null },
  params: { q: string; systemSeq?: string; systemName?: string }
) {
  const scope = user.role === "ADMIN"
    ? "admin"
    : `${user.role ?? "user"}:${normalizeText(user.position ?? "")}`;
  return JSON.stringify({
    scope,
    q: params.q,
    systemSeq: params.systemSeq ?? "",
    systemName: params.systemName ?? "",
  });
}

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
  // Bản đầy đủ từ cache 60s — trước đây mỗi cache-miss của danh sách thiết bị
  // (mỗi tổ hợp scope × từ khoá) lại đọc + normalize ~6.6k dòng từ DB.
  const nodes = await getCachedEquipmentNodeFull();
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

async function getDeviceCountsByPosition(
  devices: DeviceListRecord[],
  index: ReturnType<typeof buildEquipmentTreeIndex>
) {
  const scopes = await loadPositionSystemScopeRows();
  const editPosBySeq = new Map<string, string[]>();
  for (const scope of scopes) {
    if (scope.access !== "edit") continue;
    const positions = editPosBySeq.get(scope.systemSeq) ?? [];
    positions.push(scope.position);
    editPosBySeq.set(scope.systemSeq, positions);
  }

  const counts = new Map<string, number>();
  for (const device of devices) {
    const managing = new Set<string>();
    let current: string | null | undefined = device.code;
    while (current) {
      for (const position of editPosBySeq.get(current) ?? []) managing.add(position);
      current = index.parentOf.get(current) ?? null;
    }
    for (const position of managing) counts.set(position, (counts.get(position) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const q = normalizeText(sp.get("q")?.trim() ?? "");
    const systemSeq = sp.get("systemSeq")?.trim();
    const systemName = sp.get("system")?.trim();

    const cacheKey = deviceListCacheKey(user, { q, systemSeq, systemName });
    const result = await getOrSetDeviceListCache<DeviceListResult>(cacheKey, async () => {
      const { nodes, records } = await getDeviceLikeRecords();
      const totalSystemDevices = nodes.length;
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

      return {
        data: devices,
        meta: {
          total: devices.length,
          totalSystemDevices,
          systems,
          rootSystems: visibleIndex.roots.map((node) => ({ seq: node.seq, name: node.name })),
          byPosition: await getDeviceCountsByPosition(devices, visibleIndex),
          source: "equipment-node",
        },
      };
    });

    return ok(result.data, result.meta);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "device-manage", ["create", "manage", "full"], "Không đủ quyền thêm thiết bị");
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
        documentUrl: await maybeUploadDataUrl({
          value: typeof body.documentUrl === "string" ? body.documentUrl.trim() || null : null,
          folder: "equipment/documents",
          preset: "document-image",
        }),
        imageUrl,
        deviceSynced: true,
      },
    });

    const nodes = await getNormalizedEquipmentNodes(prisma);
    const index = buildEquipmentTreeIndex(nodes);
    const effectiveParentSeq = index.parentOf.get(node.seq) ?? node.parentSeq ?? null;
    const parent = effectiveParentSeq ? index.bySeq.get(effectiveParentSeq) ?? null : null;
    invalidateEquipmentNodeCache();
    invalidateDeviceListCache();
    await audit(user.id, "CREATE_EQUIPMENT_NODE", "EquipmentNode", node.id, node.seq);
    return ok(toDeviceRecord({ ...node, drawing: node.drawing, attachedInfo: node.attachedInfo, documentUrl: node.documentUrl, imageUrl: node.imageUrl }, parent));
  });
}
