import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import {
  buildEquipmentTreeIndex,
  compareEquipmentSeq,
  getNormalizedEquipmentNodes,
  type NormalizedEquipmentNode,
} from "@/lib/equipment-tree";
import { filterEquipmentNodesForUser } from "@/lib/server-access";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

function publicEquipmentUrl(seq: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${base}/public/equipment/${encodeURIComponent(seq)}`;
}

// Cùng shape với /api/devices để tab "Thẻ" tái dùng nguyên lưới thẻ hiện có.
function toCardRecord(
  node: NormalizedEquipmentNode,
  parent: NormalizedEquipmentNode | null,
  stats?: { repairCount: number; latestRepairAt: Date | null }
) {
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
    repairLogs: stats?.latestRepairAt ? [{ startedAt: stats.latestRepairAt.toISOString() }] : [],
    materials: [],
    _count: { repairLogs: stats?.repairCount ?? 0 },
  };
}

/** GET /api/device-qr-cards — chỉ các thiết bị ĐÃ ĐƯỢC CHỌN tạo thẻ QR. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const cards = await prisma.deviceQrCard.findMany({ select: { deviceSeq: true } });
    if (!cards.length) return ok([], { total: 0 });

    const cardSeqs = new Set(cards.map((c) => c.deviceSeq));
    const nodes = await getNormalizedEquipmentNodes(prisma);
    const visibleNodes = await filterEquipmentNodesForUser(user, nodes);
    const visibleSeqs = new Set(visibleNodes.map((node) => node.seq));
    const index = buildEquipmentTreeIndex(nodes);

    const seqs = [...cardSeqs].filter((seq) => visibleSeqs.has(seq) && index.bySeq.has(seq));
    const repairStats = seqs.length
      ? await prisma.repairLog.groupBy({
          by: ["deviceSeq"],
          where: { deviceSeq: { in: seqs } },
          _count: { _all: true },
          _max: { startedAt: true },
        })
      : [];
    const statsBySeq = new Map(
      repairStats.map((item) => [item.deviceSeq, { repairCount: item._count._all, latestRepairAt: item._max.startedAt }])
    );

    const data = seqs
      .sort(compareEquipmentSeq)
      .map((seq) => {
        const node = index.bySeq.get(seq)!;
        const parentSeq = index.parentOf.get(seq) ?? node.parentSeq ?? null;
        const parent = parentSeq ? index.bySeq.get(parentSeq) ?? null : null;
        return toCardRecord(node, parent, statsBySeq.get(seq));
      });
    return ok(data, { total: data.length });
  });
}

/** POST /api/device-qr-cards — chọn thêm 1 thiết bị (node lá) tạo thẻ QR. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "device-manage", ["create", "manage", "full"], "Không đủ quyền tạo thẻ QR thiết bị");
    const body = await req.json();
    const deviceSeq = String(body.deviceSeq ?? "").trim();
    if (!deviceSeq) return fail("Chưa chọn thiết bị");

    const nodes = await getNormalizedEquipmentNodes(prisma);
    const index = buildEquipmentTreeIndex(nodes);
    const node = index.bySeq.get(deviceSeq);
    if (!node) return fail("Không tìm thấy thiết bị trong cây thư mục", 404);
    if ((index.childrenOf.get(deviceSeq) ?? []).length > 0) {
      return fail("Chỉ tạo thẻ QR cho thiết bị ở thư mục con cuối cùng (node lá)");
    }
    const exists = await prisma.deviceQrCard.findUnique({ where: { deviceSeq } });
    if (exists) return fail("Thiết bị này đã có thẻ QR");

    const card = await prisma.deviceQrCard.create({ data: { deviceSeq, createdById: user.id } });
    await audit(user.id, "CREATE_DEVICE_QR_CARD", "DeviceQrCard", card.id, deviceSeq);
    return ok(card);
  });
}

/** DELETE /api/device-qr-cards?seq=... — gỡ thẻ QR (KHÔNG xoá thiết bị). */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "device-manage", ["create", "manage", "full"], "Không đủ quyền gỡ thẻ QR thiết bị");
    const seq = req.nextUrl.searchParams.get("seq")?.trim();
    if (!seq) return fail("Thiếu seq thiết bị");
    const { count } = await prisma.deviceQrCard.deleteMany({ where: { deviceSeq: seq } });
    if (!count) return fail("Thiết bị này chưa có thẻ QR", 404);
    await audit(user.id, "DELETE_DEVICE_QR_CARD", "DeviceQrCard", seq, seq);
    return ok({ seq });
  });
}
