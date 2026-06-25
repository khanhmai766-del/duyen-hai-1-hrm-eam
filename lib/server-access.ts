import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api";
import { getNormalizedEquipmentNodes } from "@/lib/equipment-tree";
import { normalizeText } from "@/lib/nav";
import {
  deviceAccessForPosition,
  nodeAccessForPosition,
  type PositionSystemScope,
} from "@/lib/position-system-scopes";

type SessionUser = { role?: string | null; position?: string | null };

type DeviceLike = {
  code: string;
  system?: string | null;
  systemSeq?: string | null;
  managingPosition?: string | null;
};

/** Đọc bảng phân quyền hệ thống (quản lý bằng raw SQL). Lỗi/chưa có bảng → rỗng. */
async function loadScopeRows(): Promise<PositionSystemScope[]> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{ id: string; position: string; systemSeq: string; access: string; createdAt: Date }>
    >`SELECT "id", "position", "systemSeq", "access", "createdAt" FROM "PositionSystemScope"`;
    return rows.map((row) => ({
      id: row.id,
      position: row.position,
      systemSeq: row.systemSeq,
      access: row.access === "edit" ? "edit" : "view",
      createdAt: row.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

/** Cương vị có cấu hình riêng không (nếu chưa thì không giới hạn — giữ hành vi cũ). */
function hasExplicitScopes(scopes: PositionSystemScope[], position: string) {
  const normalized = normalizeText(position);
  return scopes.some((scope) => normalizeText(scope.position) === normalized);
}

/** Chặn nếu cương vị người dùng không có quyền CHỈNH SỬA trên hệ thống của node seq. */
export async function assertSeqEditable(user: SessionUser, seq: string) {
  if (user.role === "ADMIN") return;
  const position = user.position ?? "";
  if (!position) return;
  const scopes = await loadScopeRows();
  if (!hasExplicitScopes(scopes, position)) return;
  const nodes = await getNormalizedEquipmentNodes(prisma);
  if (nodeAccessForPosition(seq, position, nodes, scopes) !== "edit") {
    throw fail("Cương vị của bạn không có quyền chỉnh sửa hệ thống thiết bị này", 403);
  }
}

/** Chặn nếu cương vị người dùng không có quyền CHỈNH SỬA trên hệ thống của thiết bị. */
export async function assertDeviceEditable(user: SessionUser, device: DeviceLike) {
  if (user.role === "ADMIN") return;
  const position = user.position ?? "";
  if (!position) return;
  const scopes = await loadScopeRows();
  if (!hasExplicitScopes(scopes, position)) return;
  const nodes = await getNormalizedEquipmentNodes(prisma);
  if (deviceAccessForPosition(device, position, nodes, scopes) !== "edit") {
    throw fail("Cương vị của bạn không có quyền thao tác trên hệ thống thiết bị này", 403);
  }
}
