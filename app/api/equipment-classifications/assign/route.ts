import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireRole, requireUser } from "@/lib/api";
import { EQUIPMENT_BLOCKS } from "@/lib/constants";
import { normalizePositionScopeKey, normalizePositionScopeLabel } from "@/lib/position-system-scopes";
import { selectableManagingPositionOptions } from "@/lib/positions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const body = await req.json();
    const seq = String(body.seq ?? "").trim();
    const assignmentType = body.assignmentType === "block" ? "block" : "position";
    const requestedValue = String(body.value ?? "").trim();
    if (!seq) return fail("Vui lòng chọn thiết bị hoặc nhóm thiết bị");
    if (!requestedValue) return fail(assignmentType === "block" ? "Vui lòng chọn khối" : "Vui lòng chọn cương vị quản lý");

    const [node, users, affectedNodes] = await Promise.all([
      prisma.equipmentNode.findUnique({ where: { seq }, select: { seq: true, name: true } }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { position: true, secondaryPosition: true, secondaryPosition2: true },
      }),
      prisma.equipmentNode.count({ where: { OR: [{ seq }, { seq: { startsWith: `${seq}.` } }] } }),
    ]);
    if (!node) return fail("Không tìm thấy thiết bị trong cây", 404);

    let value: string;
    if (assignmentType === "block") {
      const block = EQUIPMENT_BLOCKS.find(
        (item) => normalizePositionScopeKey(item) === normalizePositionScopeKey(requestedValue)
      );
      if (!block) return fail("Khối đã chọn không hợp lệ");
      value = block;
    } else {
      const options = selectableManagingPositionOptions(
        users.flatMap((item) => [item.position, item.secondaryPosition, item.secondaryPosition2])
      );
      const requested = normalizePositionScopeLabel(requestedValue);
      const position = options.find(
        (item) => normalizePositionScopeKey(item) === normalizePositionScopeKey(requested)
      );
      if (!position) return fail("Cương vị đã chọn không còn trong danh sách");
      value = position;
    }

    const saved = await prisma.equipmentBranchClassification.upsert({
      where: { systemSeq: seq },
      create: {
        systemSeq: seq,
        block: assignmentType === "block" ? value : null,
        managingPosition: assignmentType === "position" ? value : null,
      },
      update: {
        block: assignmentType === "block" ? value : null,
        managingPosition: assignmentType === "position" ? value : null,
      },
    });
    await audit(user.id, "CLASSIFY_EQUIPMENT_BRANCH", "EquipmentBranchClassification", saved.id, `${seq} · ${assignmentType} · ${value}`);
    return ok({ seq, assignmentType, value, affectedNodes });
  });
}
