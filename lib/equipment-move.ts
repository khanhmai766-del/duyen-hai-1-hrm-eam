/**
 * DI CHUYỂN MỘT NHÁNH CÂY THIẾT BỊ sang thư mục cha khác — đổi mã cho cả nhánh và kéo theo
 * mọi thứ đã gắn vào thiết bị.
 *
 * Vì sao tách khỏi route: cùng một việc còn được gọi từ script sắp xếp lại cây chạy một lần
 * trên máy chủ. Hai bản chép tay là sớm muộn một bên quên cập nhật một bảng, và cái quên đó
 * chỉ lộ ra khi có người mở lại phiếu cũ.
 *
 * ĐIỀU KHIẾN VIỆC NÀY AN TOÀN: mọi bảng nghiệp vụ trỏ tới thiết bị bằng MÃ (`deviceSeq` →
 * `EquipmentNode.seq`) và toàn bộ khoá ngoại đều `ON UPDATE CASCADE` — đổi mã thì Postgres tự
 * kéo phiếu đi theo, trong cùng giao dịch. Phiếu KHÔNG nằm lại ở con số cũ.
 *
 * Phần bên dưới chỉ lo bốn thứ mà cascade KHÔNG lo được:
 *
 *  1. Bảng không có khoá ngoại: `PositionSystemScope.systemSeq`, `MaterialReplacementLog`,
 *     ba bảng PCCC, mảng `MaterialTicketItem.replacementPointKeys` — phải đổi tay, nếu không
 *     sẽ trỏ vào mã không còn tồn tại và âm thầm mất phân quyền / mất liên kết.
 *  2. Cột chép lại mã dạng văn bản: `Defect.device`, `DefectHistory.device`.
 *  3. HỒ SƠ TỔ MÁY khi nhánh rời cây tổ máy sang cây dùng chung: nhánh 5,6 chỉ có một hồ sơ
 *     COMMON, nên phiếu còn ghi S1/S2 sẽ trượt `validateMappedDevice` ở lần sửa sau và có thể
 *     không hiện trong danh sách lọc theo hồ sơ.
 *  4. `sort` — cây xếp con theo `sort` chứ KHÔNG theo mã. Không đặt lại thì nhánh vừa chuyển
 *     nhảy vào giữa danh sách thư mục mới theo thứ tự cũ, không nằm ở cuối như người dùng chờ đợi.
 *
 * Đổi mã đi qua MỘT MÃ TẠM trước (hai pha): đổi thẳng sẽ đụng ràng buộc `seq` duy nhất khi mã
 * đích trùng một mã đang tồn tại trong chính nhánh đang chuyển.
 */
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { MAX_EQUIPMENT_DEPTH, machinesOf } from "@/lib/equipment-units";
import { displayCode } from "@/lib/equipment-import";
import { normalizeText } from "@/lib/nav";
import { recomputeChildCount } from "@/lib/equipment-child-count";

type EquipmentDb = PrismaClient | Prisma.TransactionClient;

type MoveNode = { seq: string; parentSeq: string | null; name: string; kks: string | null; sort: number };

export type EquipmentMovePlan = {
  sourceSeq: string;
  targetParentSeq: string;
  targetName: string;
  oldParentSeq: string | null;
  /** Mã mới của chính nút gốc nhánh. */
  rootSeq: string;
  nodes: MoveNode[];
  /** mã cũ → mã mới, cha đứng trước con. */
  mapping: Map<string, string>;
  /** Nhánh rời cây tổ máy sang cây dùng chung — kéo theo việc đổi hồ sơ tổ máy của dữ liệu. */
  toCommon: boolean;
  /** Giá trị `sort` đầu tiên cấp cho nhánh; các nút sau cộng dồn, giữ nguyên thứ tự cũ. */
  sortBase: number;
};

export type EquipmentMovePlanResult = { ok: false; error: string } | { ok: true; plan: EquipmentMovePlan };

export async function planEquipmentMove(
  db: EquipmentDb,
  params: { sourceSeq: string; targetParentSeq: string; allowScopeChange?: boolean }
): Promise<EquipmentMovePlanResult> {
  const { sourceSeq, targetParentSeq, allowScopeChange = false } = params;
  if (!sourceSeq || !targetParentSeq) return { ok: false, error: "Thiếu thiết bị cần di chuyển hoặc thư mục đích" };
  if (sourceSeq === targetParentSeq) return { ok: false, error: "Không thể di chuyển thiết bị vào chính nó" };
  if (targetParentSeq.startsWith(`${sourceSeq}.`)) {
    return { ok: false, error: "Không thể di chuyển một thư mục vào nhánh con của chính nó" };
  }

  const [source, target] = await Promise.all([
    db.equipmentNode.findUnique({ where: { seq: sourceSeq }, select: { seq: true, parentSeq: true, name: true } }),
    db.equipmentNode.findUnique({ where: { seq: targetParentSeq }, select: { seq: true, name: true, depth: true } }),
  ]);
  if (!source) return { ok: false, error: "Không tìm thấy thiết bị hoặc thư mục cần di chuyển" };
  if (!target) return { ok: false, error: "Không tìm thấy thư mục đích" };
  if (!source.parentSeq) return { ok: false, error: "Không thể di chuyển hệ thống gốc" };

  const sourceScope = machinesOf(sourceSeq)[0];
  const targetScope = machinesOf(targetParentSeq)[0];
  const toCommon = sourceScope !== "COMMON" && targetScope === "COMMON";
  if (sourceScope !== targetScope) {
    if (!allowScopeChange) {
      return { ok: false, error: "Không thể di chuyển thiết bị giữa cây tổ máy và cây dùng chung" };
    }
    // Chiều ngược lại (dùng chung → tổ máy) KHÔNG tự làm được: một thiết bị dùng chung có phiếu
    // của cả hai tổ máy, máy không tự quyết được phiếu nào thuộc S1, phiếu nào thuộc S2.
    if (!toCommon) {
      return { ok: false, error: "Chỉ hỗ trợ chuyển từ cây tổ máy sang cây dùng chung; chiều ngược lại phải tách hồ sơ S1/S2 thủ công" };
    }
  }

  const nodes = await db.equipmentNode.findMany({
    where: { OR: [{ seq: sourceSeq }, { seq: { startsWith: `${sourceSeq}.` } }] },
    select: { seq: true, parentSeq: true, name: true, kks: true, sort: true },
    orderBy: [{ depth: "asc" }, { sort: "asc" }],
  });

  const extraDepth = target.depth + 1 - sourceSeq.split(".").length;
  const deepest = Math.max(...nodes.map((node) => node.seq.split(".").length + extraDepth));
  if (deepest > MAX_EQUIPMENT_DEPTH) return { ok: false, error: `Nhánh sau khi di chuyển sẽ vượt quá ${MAX_EQUIPMENT_DEPTH} cấp` };

  // Giữ nguyên số thứ tự cuối của mã cũ nếu chỗ đó còn trống — mã quen thuộc thì người dùng
  // đỡ phải học lại; kẹt thì lấy số kế tiếp trong thư mục đích.
  const oldSegment = sourceSeq.slice(sourceSeq.lastIndexOf(".") + 1);
  const preferredPrefix = `${targetParentSeq}.${oldSegment}`;
  const insideSource = { OR: [{ seq: sourceSeq }, { seq: { startsWith: `${sourceSeq}.` } }] };
  const preferredTaken = await db.equipmentNode.findFirst({
    where: { seq: { startsWith: preferredPrefix }, NOT: insideSource },
    select: { seq: true },
  });
  let rootSeq = preferredPrefix;
  if (preferredTaken) {
    const siblings = await db.equipmentNode.findMany({ where: { parentSeq: targetParentSeq }, select: { seq: true } });
    const nextSegment =
      siblings.reduce((max, row) => {
        const segment = Number(row.seq.slice(row.seq.lastIndexOf(".") + 1));
        return Number.isFinite(segment) ? Math.max(max, segment) : max;
      }, 0) + 1;
    rootSeq = `${targetParentSeq}.${nextSegment}`;
  }

  const mapping = new Map(nodes.map((node) => [node.seq, `${rootSeq}${node.seq.slice(sourceSeq.length)}`]));
  const collisions = await db.equipmentNode.count({
    where: { seq: { in: [...mapping.values()] }, NOT: insideSource },
  });
  if (collisions) return { ok: false, error: "Mã thiết bị tại thư mục đích đã tồn tại; vui lòng chọn thư mục khác" };

  if (toCommon) {
    const blocker = await findMachineProfileConflicts(db, [...mapping.keys()]);
    if (blocker) return { ok: false, error: blocker };
  }

  // Xếp nhánh xuống CUỐI danh sách con của thư mục đích: lấy sort lớn nhất toàn cây rồi cộng dồn.
  // Dùng cực đại toàn cây (không phải cực đại trong thư mục đích) để khối sort mới chắc chắn
  // không chèn vào giữa dải sort của nhánh khác.
  const maxSort = await db.equipmentNode.aggregate({ _max: { sort: true } });

  return {
    ok: true,
    plan: {
      sourceSeq,
      targetParentSeq,
      targetName: target.name,
      oldParentSeq: source.parentSeq,
      rootSeq,
      nodes,
      mapping,
      toCommon,
      sortBase: (maxSort._max.sort ?? 0) + 1,
    },
  };
}

/**
 * Nhánh về cây dùng chung thì mỗi nút chỉ còn MỘT hồ sơ / MỘT thẻ QR. Nút nào đang có hồ sơ
 * riêng cho cả S1 lẫn S2 (hoặc hai thẻ QR) thì gộp lại là mất một bản — không tự quyết thay
 * người dùng, dừng lại và nói rõ nút nào.
 */
async function findMachineProfileConflicts(db: EquipmentDb, seqs: string[]): Promise<string | null> {
  const [profiles, cards] = await Promise.all([
    db.equipmentProfile.groupBy({ by: ["nodeSeq"], where: { nodeSeq: { in: seqs } }, _count: { _all: true } }),
    db.deviceQrCard.groupBy({ by: ["deviceSeq"], where: { deviceSeq: { in: seqs } }, _count: { _all: true } }),
  ]);
  const dupProfiles = profiles.filter((row) => row._count._all > 1).map((row) => row.nodeSeq);
  const dupCards = cards.filter((row) => row._count._all > 1).map((row) => row.deviceSeq);
  if (dupProfiles.length) {
    return `Các thiết bị sau đang có hồ sơ riêng cho cả S1 và S2, phải gộp trước khi chuyển sang cây dùng chung: ${dupProfiles.slice(0, 5).join(", ")}${dupProfiles.length > 5 ? "…" : ""}`;
  }
  if (dupCards.length) {
    return `Các thiết bị sau đang có thẻ QR riêng cho cả S1 và S2, phải gộp trước khi chuyển sang cây dùng chung: ${dupCards.slice(0, 5).join(", ")}${dupCards.length > 5 ? "…" : ""}`;
  }
  return null;
}

export type EquipmentMoveResult = {
  seq: string;
  movedCount: number;
  /** Số dòng nghiệp vụ đã đổi hồ sơ tổ máy sang COMMON (chỉ khi chuyển sang cây dùng chung). */
  rescopedRows: number;
};

/** Phải gọi trong một giao dịch: đổi mã dở dang là cây gãy. */
export async function applyEquipmentMove(tx: Prisma.TransactionClient, plan: EquipmentMovePlan): Promise<EquipmentMoveResult> {
  const { sourceSeq, targetParentSeq, nodes, mapping, toCommon, sortBase } = plan;
  const moveToken = `__MOVE__${randomUUID()}__`;

  for (const node of nodes) {
    await tx.equipmentNode.update({
      where: { seq: node.seq },
      data: { seq: `${moveToken}${node.seq}`, code: `${moveToken}${node.seq}` },
    });
  }
  const order = [...nodes].sort((a, b) => a.sort - b.sort);
  const sortOf = new Map(order.map((node, index) => [node.seq, sortBase + index]));
  for (const node of nodes) {
    const nextSeq = mapping.get(node.seq)!;
    const nextParent = node.seq === sourceSeq ? targetParentSeq : mapping.get(node.parentSeq ?? "") ?? node.parentSeq;
    await tx.equipmentNode.update({
      where: { seq: `${moveToken}${node.seq}` },
      data: {
        seq: nextSeq,
        code: nextSeq,
        parentSeq: nextParent,
        depth: nextSeq.split(".").length,
        sort: sortOf.get(node.seq),
        searchText: normalizeText(`${node.name} ${node.kks ?? ""} ${displayCode(nextSeq)} ${nextSeq}`),
        // Đánh dấu để lần NHẬP LẠI DANH MỤC không kéo mã về chỗ cũ theo file Excel.
        relocated: true,
      },
    });
  }

  for (const [oldSeq, nextSeq] of mapping) {
    // Bảng có khoá ngoại: ở DB đã bật ON UPDATE CASCADE thì không còn dòng nào mang mã cũ,
    // các lệnh này thành không-làm-gì. Vẫn gọi để chạy đúng cả trên DB cũ chưa có cascade.
    await tx.repairLog.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
    await tx.materialReplacement.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
    await tx.equipmentMaterial.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
    await tx.defect.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
    await tx.defectHistory.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
    await tx.defectRelatedDevice.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
    await tx.defectHistoryRelatedDevice.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
    await tx.equipmentProfile.updateMany({ where: { nodeSeq: oldSeq }, data: { nodeSeq: nextSeq } });
    await tx.deviceQrCard.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
    await tx.materialTicketItem.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });

    // Bảng KHÔNG có khoá ngoại — không đổi ở đây là mất hẳn liên kết.
    await tx.materialReplacementLog.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
    await tx.positionSystemScope.updateMany({ where: { systemSeq: oldSeq }, data: { systemSeq: nextSeq } });
    await tx.pcccExtinguisher.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
    await tx.pcccCabinet.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
    await tx.pcccBulk.updateMany({ where: { deviceSeq: oldSeq }, data: { deviceSeq: nextSeq } });
    await tx.$executeRawUnsafe(
      `UPDATE "MaterialTicketItem" SET "replacementPointKeys" = array_replace("replacementPointKeys", $1, $2) WHERE $1 = ANY("replacementPointKeys")`,
      oldSeq,
      nextSeq
    );

    // Bản chép mã dạng văn bản: để nguyên là phiếu hiển thị mã của một thiết bị KHÁC.
    await tx.defect.updateMany({ where: { device: oldSeq }, data: { device: nextSeq } });
    await tx.defectHistory.updateMany({ where: { device: oldSeq }, data: { device: nextSeq } });
  }

  let rescopedRows = 0;
  if (toCommon) {
    const seqs = [...mapping.values()];
    const results = await Promise.all([
      tx.defect.updateMany({ where: { deviceSeq: { in: seqs } }, data: { mappedDeviceUnit: "COMMON" } }),
      tx.defectHistory.updateMany({ where: { deviceSeq: { in: seqs } }, data: { mappedDeviceUnit: "COMMON" } }),
      // Thiết bị LIÊN QUAN trong phiếu mang hồ sơ tổ máy riêng (`mappedUnit`), không dùng
      // chung cột với thiết bị chính — bỏ sót là phiếu vẫn còn dòng ghi S1/S2 trên thiết bị
      // dùng chung, đúng thứ mà việc chuyển cây phải dọn.
      tx.defectRelatedDevice.updateMany({ where: { deviceSeq: { in: seqs } }, data: { mappedUnit: "COMMON" } }),
      tx.defectHistoryRelatedDevice.updateMany({ where: { deviceSeq: { in: seqs } }, data: { mappedUnit: "COMMON" } }),
      tx.materialReplacement.updateMany({ where: { deviceSeq: { in: seqs } }, data: { machine: "COMMON" } }),
      tx.materialReplacementLog.updateMany({ where: { deviceSeq: { in: seqs } }, data: { machine: "COMMON" } }),
      tx.deviceQrCard.updateMany({ where: { deviceSeq: { in: seqs } }, data: { machine: "COMMON" } }),
      tx.equipmentProfile.updateMany({ where: { nodeSeq: { in: seqs } }, data: { machine: "COMMON" } }),
    ]);
    rescopedRows = results.reduce((sum, row) => sum + row.count, 0);
  }

  await recomputeChildCount(tx, [plan.oldParentSeq, targetParentSeq]);
  return { seq: plan.rootSeq, movedCount: nodes.length, rescopedRows };
}
