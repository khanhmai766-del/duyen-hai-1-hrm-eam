import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireRole, requireUser } from "@/lib/api";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";
import {
  normalizePositionScopeKey,
  normalizePositionScopeLabel,
  positionScopeOptions,
} from "@/lib/position-system-scopes";
import { selectableManagingPositionOptions } from "@/lib/positions";
import { invalidateEquipmentAccessCache } from "@/lib/server-access";

export const dynamic = "force-dynamic";

// Gán theo hướng cha → con:
// - xóa mọi điểm ghi đè đang nằm trong nhánh;
// - đặt quyền Sửa cho cương vị được chọn tại node gốc của nhánh;
// - đặt Không cho các cương vị còn lại tại cùng node.
// Nhờ cơ chế kế thừa, toàn bộ hậu duệ nhận cương vị mới mà không cần tạo hàng
// nghìn dòng. Gán lại tại một node con sau đó sẽ tạo một điểm ghi đè mới.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);

    const body = await req.json();
    const seq = String(body.seq ?? "").trim();
    const requestedPosition = normalizePositionScopeLabel(
      typeof body.position === "string" ? body.position : ""
    );
    if (!seq) return fail("Vui lòng chọn thiết bị hoặc nhóm thiết bị");
    if (!requestedPosition) return fail("Vui lòng chọn cương vị cần gán");

    const [node, users] = await Promise.all([
      prisma.equipmentNode.findUnique({
        where: { seq },
        select: { seq: true, name: true },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { position: true, secondaryPosition: true },
      }),
    ]);
    if (!node) return fail("Không tìm thấy thiết bị trong cây", 404);

    const userPositions = users.flatMap((item) => [item.position, item.secondaryPosition]);
    const positions = positionScopeOptions(selectableManagingPositionOptions(userPositions));
    const requestedKey = normalizePositionScopeKey(requestedPosition);
    const canonicalPosition =
      positions.find((item) => normalizePositionScopeKey(item) === requestedKey) ?? requestedPosition;
    if (!positions.some((item) => normalizePositionScopeKey(item) === requestedKey)) {
      return fail("Cương vị đã chọn không còn trong danh sách cương vị quản lý");
    }

    const branchWhere = {
      OR: [{ systemSeq: seq }, { systemSeq: { startsWith: `${seq}.` } }],
    };
    const nodeBranchWhere = {
      OR: [{ seq }, { seq: { startsWith: `${seq}.` } }],
    };

    const result = await prisma.$transaction(async (tx) => {
      const [affectedNodes, cleared] = await Promise.all([
        tx.equipmentNode.count({ where: nodeBranchWhere }),
        tx.positionSystemScope.deleteMany({ where: branchWhere }),
      ]);

      await tx.positionSystemScope.createMany({
        data: positions.map((position) => ({
          position,
          systemSeq: seq,
          access:
            normalizePositionScopeKey(position) === normalizePositionScopeKey(canonicalPosition)
              ? "edit"
              : "none",
        })),
      });
      return { affectedNodes, clearedOverrides: cleared.count };
    });

    await audit(
      user.id,
      "ASSIGN_POSITION_EQUIPMENT_BRANCH",
      "PositionSystemScope",
      seq,
      `${canonicalPosition} · ${node.name} · ${result.affectedNodes} nút`
    );
    invalidateDeviceListCache();
    invalidateEquipmentAccessCache();

    return ok({ seq, position: canonicalPosition, ...result });
  });
}
