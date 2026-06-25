import { EQUIPMENT_SYSTEM_BY_POSITION } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";

export type ScopeAccess = "view" | "edit";
export type NodeAccess = "none" | ScopeAccess;

export type PositionSystemScope = {
  id: string;
  position: string;
  systemSeq: string;
  access: ScopeAccess;
  createdAt: string;
};

type EquipmentNodeLike = {
  seq: string;
  parentSeq: string | null;
  name: string;
};

type DeviceLike = {
  code: string;
  system?: string | null;
  systemSeq?: string | null;
  managingPosition?: string | null;
};

const ACCESS_RANK: Record<NodeAccess, number> = { none: 0, view: 1, edit: 2 };

export function strongerAccess(a: NodeAccess, b: NodeAccess): NodeAccess {
  return ACCESS_RANK[a] >= ACCESS_RANK[b] ? a : b;
}

function normalizeAccess(value: unknown): ScopeAccess {
  return value === "edit" ? "edit" : "view";
}

export function scopesForPosition(scopes: PositionSystemScope[], position?: string | null) {
  const normalized = normalizeText(position ?? "");
  if (!normalized) return [];
  return scopes.filter((scope) => normalizeText(scope.position) === normalized);
}

function nodeIndex(nodes: EquipmentNodeLike[]) {
  const bySeq = new Map<string, EquipmentNodeLike>();
  const parentOf = new Map<string, string | null>();
  for (const node of nodes) {
    bySeq.set(node.seq, node);
  }
  for (const node of nodes) {
    let parent = node.parentSeq && bySeq.has(node.parentSeq) ? node.parentSeq : null;
    if (!parent) {
      const parts = node.seq.split(".");
      parts.pop();
      while (parts.length) {
        const candidate = parts.join(".");
        if (bySeq.has(candidate)) {
          parent = candidate;
          break;
        }
        parts.pop();
      }
    }
    parentOf.set(node.seq, parent);
  }
  return { bySeq, parentOf };
}

/** Tên gốc (root ancestor) của một seq — để nhận diện nhánh COMMON. */
function rootNameOf(seq: string, bySeq: Map<string, EquipmentNodeLike>, parentOf: Map<string, string | null>) {
  let current: string | null | undefined = seq;
  let name = bySeq.get(seq)?.name ?? "";
  while (current) {
    const parent: string | null = parentOf.get(current) ?? null;
    if (!parent) {
      name = bySeq.get(current)?.name ?? name;
      break;
    }
    current = parent;
  }
  return name;
}

/**
 * Quyền của một cương vị trên một node của cây thiết bị (kế thừa theo nhánh cha).
 * - Cương vị CHƯA có cấu hình riêng → "edit" (không giới hạn, giữ nguyên hành vi cũ).
 * - Đã cấu hình → lấy mức mạnh nhất trong các scope khớp node hoặc tổ tiên; nhánh COMMON luôn ≥ "view".
 */
export function nodeAccessForPosition(
  seq: string,
  position: string | null | undefined,
  nodes: EquipmentNodeLike[],
  scopes: PositionSystemScope[]
): NodeAccess {
  const normalizedPosition = normalizeText(position ?? "");
  if (!normalizedPosition) return "edit";
  const explicit = scopesForPosition(scopes, position);
  if (!explicit.length) return "edit";

  const { bySeq, parentOf } = nodeIndex(nodes);
  const accessBySeq = new Map(explicit.map((scope) => [scope.systemSeq, normalizeAccess(scope.access)] as const));

  let best: NodeAccess = "none";
  let current: string | null | undefined = seq;
  while (current) {
    const access = accessBySeq.get(current);
    if (access) best = strongerAccess(best, access);
    current = parentOf.get(current) ?? null;
  }
  if (best === "none") {
    const rootName = rootNameOf(seq, bySeq, parentOf);
    if (normalizeText(rootName).includes("common")) best = "view";
  }
  return best;
}

/** Quyền của cương vị trên một thiết bị (suy ra hệ thống của thiết bị rồi xét node). */
export function deviceAccessForPosition(
  device: DeviceLike,
  position: string | null | undefined,
  nodes: EquipmentNodeLike[],
  scopes: PositionSystemScope[]
): NodeAccess {
  const normalizedPosition = normalizeText(position ?? "");
  if (!normalizedPosition) return "edit";
  const explicit = scopesForPosition(scopes, position);
  if (!explicit.length) {
    // Chưa cấu hình riêng: giữ rule cũ theo cương vị quản lý của thiết bị.
    const ok = !device.managingPosition || normalizeText(device.managingPosition) === normalizedPosition;
    return ok ? "edit" : "none";
  }

  const { bySeq, parentOf } = nodeIndex(nodes);
  const accessBySeq = new Map(explicit.map((scope) => [scope.systemSeq, normalizeAccess(scope.access)] as const));
  const seqAccess = (seq: string | null | undefined): NodeAccess => {
    let best: NodeAccess = "none";
    let current: string | null | undefined = seq;
    while (current) {
      const access = accessBySeq.get(current);
      if (access) best = strongerAccess(best, access);
      current = parentOf.get(current) ?? null;
    }
    return best;
  };

  let best: NodeAccess = "none";
  best = strongerAccess(best, seqAccess(device.code));
  best = strongerAccess(best, seqAccess(device.systemSeq));
  if (device.system) {
    const node = Array.from(bySeq.values()).find((item) => normalizeText(item.name) === normalizeText(device.system!));
    if (node) best = strongerAccess(best, seqAccess(node.seq));
  }
  // Nhánh COMMON luôn được xem.
  if (best === "none" && seqAccess(device.code) === "none") {
    const node = bySeq.get(device.code) ?? (device.systemSeq ? bySeq.get(device.systemSeq) : undefined);
    if (node && normalizeText(rootNameOf(node.seq, bySeq, parentOf)).includes("common")) best = "view";
  }
  // Thiết bị do chính cương vị quản lý → coi như được chỉnh sửa (giữ rule cũ).
  if (best === "none" && normalizeText(device.managingPosition ?? "") === normalizedPosition) best = "edit";
  return best;
}

/** Giữ tương thích: thiết bị có được hiển thị cho cương vị không (xem trở lên). */
export function deviceAllowedForPosition(
  device: DeviceLike,
  position: string | null | undefined,
  nodes: EquipmentNodeLike[],
  scopes: PositionSystemScope[]
) {
  return deviceAccessForPosition(device, position, nodes, scopes) !== "none";
}

/** Thiết bị có được cương vị chỉnh sửa/thao tác (sửa chữa, khiếm khuyết, vật tư) không. */
export function deviceEditableForPosition(
  device: DeviceLike,
  position: string | null | undefined,
  nodes: EquipmentNodeLike[],
  scopes: PositionSystemScope[]
) {
  return deviceAccessForPosition(device, position, nodes, scopes) === "edit";
}

export function rootAllowedForPosition(
  root: { seq: string; name: string },
  position: string | null | undefined,
  scopes: PositionSystemScope[]
) {
  const name = normalizeText(root.name);
  if (name.includes("common")) return true;
  const normalizedPosition = normalizeText(position ?? "");
  if (!normalizedPosition) return true;

  const explicitScopes = scopesForPosition(scopes, position);
  if (explicitScopes.length) {
    return explicitScopes.some((scope) => scope.systemSeq === root.seq);
  }

  const fallbackRule = EQUIPMENT_SYSTEM_BY_POSITION.find((rule) => name.includes(normalizeText(rule.match)));
  if (!fallbackRule) return true;
  return fallbackRule.positions.some((item) => normalizeText(item) === normalizedPosition);
}
