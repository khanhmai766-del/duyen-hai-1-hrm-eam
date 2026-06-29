import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api";
import {
  buildEquipmentTreeIndex,
  getNormalizedEquipmentNodes,
  type NormalizedEquipmentNode,
} from "@/lib/equipment-tree";
import { normalizeText } from "@/lib/nav";
import {
  deviceAccessForPosition,
  nodeAccessForPosition,
  normalizeScopeAccess,
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
export async function loadPositionSystemScopeRows(): Promise<PositionSystemScope[]> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{ id: string; position: string; systemSeq: string; access: string; createdAt: Date }>
    >`SELECT "id", "position", "systemSeq", "access", "createdAt" FROM "PositionSystemScope"`;
    return rows.map((row) => ({
      id: row.id,
      position: row.position,
      systemSeq: row.systemSeq,
      access: normalizeScopeAccess(row.access),
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

export async function filterEquipmentNodesForUser(user: SessionUser, nodes: NormalizedEquipmentNode[]) {
  if (user.role === "ADMIN") return nodes;
  const position = user.position ?? "";
  if (!position) return nodes;
  const scopes = await loadPositionSystemScopeRows();
  if (!hasExplicitScopes(scopes, position)) return nodes;

  const index = buildEquipmentTreeIndex(nodes);
  const visible = new Set<string>();
  for (const node of nodes) {
    if (nodeAccessForPosition(node.seq, position, nodes, scopes) === "none") continue;
    let current: string | null | undefined = node.seq;
    while (current && !visible.has(current)) {
      visible.add(current);
      current = index.parentOf.get(current) ?? null;
    }
  }
  return nodes.filter((node) => visible.has(node.seq));
}

/** Chặn nếu cương vị người dùng không có quyền CHỈNH SỬA trên hệ thống của node seq. */
export async function assertSeqViewable(user: SessionUser, seq: string) {
  if (user.role === "ADMIN") return;
  const position = user.position ?? "";
  if (!position) return;
  const scopes = await loadPositionSystemScopeRows();
  if (!hasExplicitScopes(scopes, position)) return;
  const nodes = await getNormalizedEquipmentNodes(prisma);
  if (nodeAccessForPosition(seq, position, nodes, scopes) === "none") {
    throw fail("Cương vị của bạn không có quyền xem hệ thống thiết bị này", 403);
  }
}

export async function assertSeqEditable(user: SessionUser, seq: string) {
  if (user.role === "ADMIN") return;
  const position = user.position ?? "";
  if (!position) return;
  const scopes = await loadPositionSystemScopeRows();
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
  const scopes = await loadPositionSystemScopeRows();
  if (!hasExplicitScopes(scopes, position)) return;
  const nodes = await getNormalizedEquipmentNodes(prisma);
  if (deviceAccessForPosition(device, position, nodes, scopes) !== "edit") {
    throw fail("Cương vị của bạn không có quyền thao tác trên hệ thống thiết bị này", 403);
  }
}
