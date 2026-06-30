import { normalizeText } from "@/lib/nav";

export type ScopeAccess = "none" | "view" | "edit";
export type NodeAccess = ScopeAccess;

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

export function normalizeScopeAccess(value: unknown): ScopeAccess {
  if (value === "edit") return "edit";
  if (value === "view") return "view";
  return "none";
}

export function normalizePositionScopeLabel(position?: string | null) {
  return String(position ?? "")
    .trim()
    .replace(/[-\s]+s[12]$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePositionScopeKey(position?: string | null) {
  return normalizeText(normalizePositionScopeLabel(position));
}

const HIDDEN_POSITION_SCOPE_OPTION_KEYS = new Set([
  "i&c",
  "khi nen - nha dau 300m3",
  "xlnt- nha dau 5000m3",
  "tram nuoc tho",
  "truong kip lo - may dh1",
].map(compactPositionScopeKey));

function compactPositionScopeKey(position?: string | null) {
  return normalizePositionScopeKey(position).replace(/[^a-z0-9]+/g, "");
}

export function positionScopeOptions(positions: string[]) {
  const byKey = new Map<string, string>();
  for (const position of positions) {
    const label = normalizePositionScopeLabel(position);
    const key = normalizePositionScopeKey(label);
    if (HIDDEN_POSITION_SCOPE_OPTION_KEYS.has(compactPositionScopeKey(label))) continue;
    if (!key || byKey.has(key)) continue;
    byKey.set(key, label);
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, "vi"));
}

export function scopesForPosition(scopes: PositionSystemScope[], position?: string | null) {
  const normalized = normalizePositionScopeKey(position);
  if (!normalized) return [];
  return scopes.filter((scope) => normalizePositionScopeKey(scope.position) === normalized);
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

  const { parentOf } = nodeIndex(nodes);
  const accessBySeq = new Map(explicit.map((scope) => [scope.systemSeq, normalizeScopeAccess(scope.access)] as const));

  let current: string | null | undefined = seq;
  while (current) {
    if (accessBySeq.has(current)) return accessBySeq.get(current)!;
    current = parentOf.get(current) ?? null;
  }
  return "none";
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
    const ok = !device.managingPosition || normalizePositionScopeKey(device.managingPosition) === normalizePositionScopeKey(position);
    return ok ? "edit" : "none";
  }

  const { bySeq, parentOf } = nodeIndex(nodes);
  const accessBySeq = new Map(explicit.map((scope) => [scope.systemSeq, normalizeScopeAccess(scope.access)] as const));
  const seqAccess = (seq: string | null | undefined): NodeAccess => {
    let current: string | null | undefined = seq;
    while (current) {
      if (accessBySeq.has(current)) return accessBySeq.get(current)!;
      current = parentOf.get(current) ?? null;
    }
    return "none";
  };

  if (device.code && bySeq.has(device.code)) return seqAccess(device.code);

  let best: NodeAccess = seqAccess(device.systemSeq);
  if (device.system) {
    const node = Array.from(bySeq.values()).find((item) => normalizeText(item.name) === normalizeText(device.system!));
    if (node) best = seqAccess(node.seq);
  }
  // Nhánh COMMON luôn được xem.
  // Thiết bị do chính cương vị quản lý → coi như được chỉnh sửa (giữ rule cũ).
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
  const normalizedPosition = normalizePositionScopeKey(position);
  if (!normalizedPosition) return true;

  const explicitScopes = scopesForPosition(scopes, position);
  if (explicitScopes.length) {
    return explicitScopes.some((scope) => scope.systemSeq === root.seq && normalizeScopeAccess(scope.access) !== "none");
  }

  return true;
}
