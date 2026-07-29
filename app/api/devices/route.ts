import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import {
  compareEquipmentSeq,
  getEquipmentDescendantSeqs,
  getNormalizedEquipmentNodes,
  type NormalizedEquipmentNode,
} from "@/lib/equipment-tree";
import { normalizeText } from "@/lib/nav";
import {
  filterEquipmentNodesForUser,
  loadPositionSystemScopeRows,
  managingPositionsByEquipmentSeq,
} from "@/lib/server-access";
import { maybeUploadDataUrl } from "@/lib/s3";
import { getOrSetDeviceListCache, invalidateDeviceListCache } from "@/lib/device-list-cache";
import { getCachedEquipmentNodeFull, invalidateEquipmentNodeCache,  getEquipmentTreeIndexFor } from "@/lib/equipment-node-cache";
import { recomputeChildCount } from "@/lib/equipment-child-count";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { canonicalSeq, MAX_EQUIPMENT_DEPTH, validateEquipmentSeq } from "@/lib/equipment-units";
import { canBypassEquipmentPositionScope } from "@/lib/material-equipment-access";

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

function toDeviceRecord(
  node: NormalizedEquipmentNode,
  parent: NormalizedEquipmentNode | null,
  managingPositions: string[] = []
) {
  return {
    id: node.seq,
    code: node.seq,
    name: node.name,
    kks: node.kks ?? null,
    system: parent?.name ?? null,
    systemSeq: parent?.seq ?? null,
    managingPosition: managingPositions[0] ?? null,
    managingPositions,
    images: node.imageUrl ? [node.imageUrl] : [],
    attachedInfo: node.attachedInfo ?? null,
    documentUrl: node.documentUrl ?? null,
    qrCodeData: publicEquipmentUrl(node.seq),
    // Bỏ createdAt/updatedAt (luôn là hằng 1970-01-01, không nơi nào đọc) và materials
    // (luôn rỗng): với 21.948 thiết bị, ba trường chết này chiếm ~2,5 MB mỗi lần trả về.
    repairLogs: [],
    _count: { repairLogs: 0 },
  };
}

/**
 * Bản rút gọn cho màn hình thống kê: đúng 5 trường mà trang Báo cáo đọc.
 * Bỏ images/attachedInfo/documentUrl/qrCodeData/repairLogs, bỏ luôn id (trùng hệt code),
 * kks và systemSeq (không nơi nào trong Báo cáo dùng) — với 21.948 thiết bị, mỗi trường
 * thừa là vài trăm KB trên đường truyền.
 */
function toDeviceSummary(device: DeviceListRecord) {
  return {
    code: device.code,
    name: device.name,
    system: device.system,
    managingPosition: device.managingPosition,
    repairCount: device._count.repairLogs,
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
  user: { id?: string | null; role?: string | null; position?: string | null },
  params: {
    q: string;
    systemSeq?: string;
    systemName?: string;
    permissionScope?: string;
    canAccessAllDevices: boolean;
  }
) {
  const scope = user.role === "ADMIN"
    ? "admin"
    : `${user.role ?? "user"}:${normalizeText(user.position ?? "")}`;
  return JSON.stringify({
    userId: user.id ?? "",
    scope,
    accessMode: params.canAccessAllDevices ? "rbac-global" : "position-scope",
    q: params.q,
    systemSeq: params.systemSeq ?? "",
    systemName: params.systemName ?? "",
    permissionScope: params.permissionScope ?? "",
  });
}

function toDeviceRecordWithStats(
  node: NormalizedEquipmentNode,
  parent: NormalizedEquipmentNode | null,
  stats?: DeviceUsageStats,
  managingPositions: string[] = []
) {
  return {
    ...toDeviceRecord(node, parent, managingPositions),
    repairLogs: stats?.latestRepairAt ? [{ startedAt: stats.latestRepairAt.toISOString() }] : [],
    _count: { repairLogs: stats?.repairCount ?? 0 },
  };
}

async function getDeviceLikeRecords() {
  // Bản đầy đủ từ cache 60s — trước đây mỗi cache-miss của danh sách thiết bị
  // (mỗi tổ hợp scope × từ khoá) lại đọc + normalize ~6.6k dòng từ DB.
  const nodes = await getCachedEquipmentNodeFull();
  const index = getEquipmentTreeIndexFor(nodes);
  const leafNodes = nodes.filter((node) => (index.childrenOf.get(node.seq) ?? []).length === 0);
  const leafSeqs = leafNodes.map((node) => node.seq);
  const [repairStats, scopes] = await Promise.all([
    leafSeqs.length
      ? prisma.repairLog.groupBy({
          by: ["deviceSeq"],
          where: { deviceSeq: { in: leafSeqs } },
          _count: { _all: true },
          _max: { startedAt: true },
        })
      : [],
    loadPositionSystemScopeRows(),
  ]);
  const managingPositionsBySeq = managingPositionsByEquipmentSeq(leafSeqs, nodes, scopes);
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
      return toDeviceRecordWithStats(
        node,
        parent,
        statsBySeq.get(node.seq),
        managingPositionsBySeq.get(node.seq) ?? []
      );
    }),
  };
}

async function getDeviceCountsByPosition(
  devices: DeviceListRecord[]
) {
  const counts = new Map<string, number>();
  for (const device of devices) {
    for (const position of device.managingPositions) {
      counts.set(position, (counts.get(position) ?? 0) + 1);
    }
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
    const permissionScope = sp.get("permissionScope")?.trim();
    // "summary": chỉ các trường mà màn hình thống kê thực sự đọc. Trang Báo cáo phải duyệt
    // toàn bộ 21.948 thiết bị để tổng hợp, không lọc bớt được — nhưng ảnh/QR/tài liệu đính
    // kèm thì nó không đụng tới, mà đó lại là phần chiếm gần hết dung lượng trả về.
    const summary = sp.get("view") === "summary";
    const canAccessAllDevices = await canBypassEquipmentPositionScope(user, permissionScope);

    const cacheKey = deviceListCacheKey(user, {
      q,
      systemSeq,
      systemName,
      permissionScope,
      canAccessAllDevices,
    });
    const result = await getOrSetDeviceListCache<DeviceListResult>(cacheKey, async () => {
      const { nodes, records } = await getDeviceLikeRecords();
      const totalSystemDevices = nodes.length;
      const visibleNodes = canAccessAllDevices ? nodes : await filterEquipmentNodesForUser(user, nodes);
      const visibleSeqs = new Set(visibleNodes.map((node) => node.seq));
      const visibleIndex = getEquipmentTreeIndexFor(visibleNodes);
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
          byPosition: await getDeviceCountsByPosition(devices),
          source: "equipment-node",
        },
      };
    });

    return ok(summary ? result.data.map(toDeviceSummary) : result.data, result.meta);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "device-manage", ["personal", "manage", "full"], "Không đủ quyền thêm thiết bị");
    const body = await req.json();
    const rawSeq = String(body.code ?? body.seq ?? "").trim();
    const name = String(body.name ?? "").trim();
    const kks = String(body.kks ?? "").trim() || null;
    if (!rawSeq || !name) return fail("Thiếu số thứ tự hoặc tên thiết bị");
    const seqError = validateEquipmentSeq(rawSeq);
    if (seqError) return fail(seqError);
    // Giao diện hiển thị mã theo tổ máy đang xem (DH1.S2.…) nhưng cây vật lý chỉ có mã
    // chuẩn — quy về DH1.S1.… trước khi tra cứu và ghi.
    const seq = canonicalSeq(rawSeq);

    const existing = await prisma.equipmentNode.findUnique({ where: { seq } });
    if (existing) return fail("Số thứ tự thiết bị đã tồn tại");

    const parentSeq = canonicalSeq(String(body.systemSeq ?? "").trim()) || parentSeqOf(seq);
    if (parentSeq) {
      // Xác thực theo cùng cây đã chuẩn hoá mà giao diện đang hiển thị. Cây này có
      // một số node hệ thống tổng hợp (vd. 1.0), nên không phải node nào cũng có
      // một dòng vật lý tương ứng trong EquipmentNode.
      const normalizedNodes = await getNormalizedEquipmentNodes(prisma);
      const parent = normalizedNodes.find((item) => item.seq === parentSeq);
      if (!parent) return fail("Không tìm thấy thư mục hoặc thiết bị cha đã chọn");
      if (parent.seq.split(".").length >= MAX_EQUIPMENT_DEPTH) return fail(`Không thể tạo thiết bị con dưới cấp ${MAX_EQUIPMENT_DEPTH}`);
      if (parentSeqOf(seq) !== parentSeq) return fail(`Số thứ tự thiết bị con phải nằm ngay dưới thư mục cha ${parentSeq}`);
    }
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
        kks,
        searchText: normalizeText(`${name} ${kks ?? ""} ${seq.replace(/^DH1\.S1\.?/, "")} ${seq}`),
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

    // Cập nhật lại childCount của thư mục cha để cây thiết bị (lazy) nhận ra nó là thư mục,
    // hiện mũi tên bung + badge số con thay vì vẽ nhầm thành thiết bị lá.
    await recomputeChildCount(prisma, [node.parentSeq]);

    const nodes = await getNormalizedEquipmentNodes(prisma);
    const index = getEquipmentTreeIndexFor(nodes);
    const effectiveParentSeq = index.parentOf.get(node.seq) ?? node.parentSeq ?? null;
    const parent = effectiveParentSeq ? index.bySeq.get(effectiveParentSeq) ?? null : null;
    invalidateEquipmentNodeCache();
    invalidateDeviceListCache();
    await audit(user.id, "CREATE_EQUIPMENT_NODE", "EquipmentNode", node.id, node.seq);
    return ok(toDeviceRecord({ ...node, drawing: node.drawing, attachedInfo: node.attachedInfo, documentUrl: node.documentUrl, imageUrl: node.imageUrl }, parent));
  });
}
