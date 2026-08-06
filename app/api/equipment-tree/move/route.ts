import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { requireDeviceManage } from "@/lib/device-permissions";
import { assertSeqEditable } from "@/lib/server-access";
import { MAX_EQUIPMENT_DEPTH, machinesOf } from "@/lib/equipment-units";
import { normalizeText } from "@/lib/nav";
import { recomputeChildCount } from "@/lib/equipment-child-count";
import { invalidateEquipmentNodeCache } from "@/lib/equipment-node-cache";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";

export const dynamic = "force-dynamic";

type MoveRow = { seq: string; parentSeq: string | null; name: string; kks: string | null };

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceManage(user, "Bạn không có quyền di chuyển thiết bị");
    const body = await req.json();
    const sourceSeq = String(body.sourceSeq ?? "").trim();
    const targetParentSeq = String(body.targetParentSeq ?? "").trim();
    if (!sourceSeq || !targetParentSeq) return fail("Thiếu thiết bị cần di chuyển hoặc thư mục đích");
    if (sourceSeq === targetParentSeq) return fail("Không thể di chuyển thiết bị vào chính nó");
    if (targetParentSeq.startsWith(`${sourceSeq}.`)) return fail("Không thể di chuyển một thư mục vào nhánh con của chính nó");

    await Promise.all([assertSeqEditable(user, sourceSeq), assertSeqEditable(user, targetParentSeq)]);
    const [source, target] = await Promise.all([
      prisma.equipmentNode.findUnique({ where: { seq: sourceSeq }, select: { seq: true, parentSeq: true, name: true } }),
      prisma.equipmentNode.findUnique({ where: { seq: targetParentSeq }, select: { seq: true, name: true, depth: true } }),
    ]);
    if (!source) return fail("Không tìm thấy thiết bị hoặc thư mục cần di chuyển", 404);
    if (!target) return fail("Không tìm thấy thư mục đích", 404);
    if (!source.parentSeq) return fail("Không thể di chuyển hệ thống gốc");
    if (machinesOf(sourceSeq)[0] !== machinesOf(targetParentSeq)[0]) {
      return fail("Không thể di chuyển thiết bị giữa cây tổ máy và cây dùng chung");
    }

    const subtree = await prisma.equipmentNode.findMany({
      where: { OR: [{ seq: sourceSeq }, { seq: { startsWith: `${sourceSeq}.` } }] },
      select: { seq: true, parentSeq: true, name: true, kks: true },
      orderBy: { depth: "asc" },
    });
    const extraDepth = target.depth + 1 - sourceSeq.split(".").length;
    const deepest = Math.max(...subtree.map((node) => node.seq.split(".").length + extraDepth));
    if (deepest > MAX_EQUIPMENT_DEPTH) return fail(`Nhánh sau khi di chuyển sẽ vượt quá ${MAX_EQUIPMENT_DEPTH} cấp`);

    const oldSegment = sourceSeq.slice(sourceSeq.lastIndexOf(".") + 1);
    const preferredPrefix = `${targetParentSeq}.${oldSegment}`;
    const preferredTaken = await prisma.equipmentNode.findFirst({
      where: { seq: { startsWith: preferredPrefix }, NOT: { OR: [{ seq: sourceSeq }, { seq: { startsWith: `${sourceSeq}.` } }] } },
      select: { seq: true },
    });
    let rootSeq = preferredPrefix;
    if (preferredTaken) {
      const siblings = await prisma.equipmentNode.findMany({ where: { parentSeq: targetParentSeq }, select: { seq: true } });
      const nextSegment = siblings.reduce((max, row) => {
        const segment = Number(row.seq.slice(row.seq.lastIndexOf(".") + 1));
        return Number.isFinite(segment) ? Math.max(max, segment) : max;
      }, 0) + 1;
      rootSeq = `${targetParentSeq}.${nextSegment}`;
    }

    const mapping = new Map(subtree.map((node) => [node.seq, `${rootSeq}${node.seq.slice(sourceSeq.length)}`]));
    const destinationSeqs = [...mapping.values()];
    const collisions = await prisma.equipmentNode.count({
      where: { seq: { in: destinationSeqs }, NOT: { OR: [{ seq: sourceSeq }, { seq: { startsWith: `${sourceSeq}.` } }] } },
    });
    if (collisions) return fail("Mã thiết bị tại thư mục đích đã tồn tại; vui lòng chọn thư mục khác");

    const moveToken = `__MOVE__${randomUUID()}__`;
    await prisma.$transaction(async (tx) => {
      // Hai pha tránh va chạm khóa unique khi đổi mã cho cả một nhánh.
      for (const node of subtree) {
        await tx.equipmentNode.update({ where: { seq: node.seq }, data: { seq: `${moveToken}${node.seq}`, code: `${moveToken}${node.seq}` } });
      }
      for (const node of subtree) {
        const nextSeq = mapping.get(node.seq)!;
        const nextParent = node.seq === sourceSeq ? targetParentSeq : mapping.get(node.parentSeq ?? "") ?? node.parentSeq;
        await tx.equipmentNode.update({
          where: { seq: `${moveToken}${node.seq}` },
          data: {
            seq: nextSeq,
            code: nextSeq,
            parentSeq: nextParent,
            depth: nextSeq.split(".").length,
            searchText: normalizeText(`${node.name} ${node.kks ?? ""} ${nextSeq.replace(/^DH1\.S1\.?/, "")} ${nextSeq}`),
          },
        });
      }

      // Các bảng snapshot/phân quyền không có khóa ngoại nên phải đổi thủ công.
      // Các update còn lại cũng được gọi để tương thích DB cũ thiếu FK ON UPDATE CASCADE;
      // ở DB đã có cascade chúng đơn giản không còn dòng mang mã cũ.
      for (const [oldSeq, nextSeq] of mapping) {
        await tx.repairLog.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
        await tx.materialReplacement.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
        await tx.materialReplacementLog.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
        await tx.equipmentMaterial.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
        await tx.defect.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
        await tx.defectHistory.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
        await tx.defectRelatedDevice.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
        await tx.defectHistoryRelatedDevice.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
        await tx.equipmentProfile.updateMany({ where: { nodeSeq: oldSeq }, data: { nodeSeq: nextSeq } });
        await tx.deviceQrCard.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
        await tx.materialTicketItem.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
        await tx.positionSystemScope.updateMany({ where: { systemSeq: oldSeq }, data: { systemSeq: nextSeq } });
      }
      await recomputeChildCount(tx, [source.parentSeq, targetParentSeq]);
    });

    await audit(user.id, "MOVE_EQUIPMENT_NODE", "EquipmentNode", undefined, `${sourceSeq} → ${rootSeq} (${target.name})`);
    invalidateEquipmentNodeCache();
    invalidateDeviceListCache();
    return ok({ sourceSeq, seq: rootSeq, movedCount: subtree.length, targetParentSeq });
  });
}
