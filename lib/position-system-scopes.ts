import { EQUIPMENT_SYSTEM_BY_POSITION } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";

export type PositionSystemScope = {
  id: string;
  position: string;
  systemSeq: string;
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

export function scopesForPosition(scopes: PositionSystemScope[], position?: string | null) {
  const normalized = normalizeText(position ?? "");
  if (!normalized) return [];
  return scopes.filter((scope) => normalizeText(scope.position) === normalized);
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

function seqInScope(seq: string | null | undefined, allowedRoots: Set<string>, parentOf: Map<string, string | null>) {
  if (!seq) return false;
  let current: string | null | undefined = seq;
  while (current) {
    if (allowedRoots.has(current)) return true;
    current = parentOf.get(current) ?? null;
  }
  return false;
}

export function deviceAllowedForPosition(
  device: DeviceLike,
  position: string | null | undefined,
  nodes: EquipmentNodeLike[],
  scopes: PositionSystemScope[]
) {
  if (!position) return true;
  const explicitScopes = scopesForPosition(scopes, position);
  if (!explicitScopes.length) {
    return !device.managingPosition || normalizeText(device.managingPosition) === normalizeText(position);
  }

  const allowedRoots = new Set(explicitScopes.map((scope) => scope.systemSeq));
  const { bySeq, parentOf } = nodeIndex(nodes);
  if (seqInScope(device.code, allowedRoots, parentOf)) return true;
  if (seqInScope(device.systemSeq, allowedRoots, parentOf)) return true;

  if (device.system) {
    const matchingNode = Array.from(bySeq.values()).find((node) => normalizeText(node.name) === normalizeText(device.system!));
    if (matchingNode && seqInScope(matchingNode.seq, allowedRoots, parentOf)) return true;
  }

  return normalizeText(device.managingPosition ?? "") === normalizeText(position);
}
