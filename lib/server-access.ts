import { fail } from "@/lib/api";
import {
  buildEquipmentTreeIndex,
  getNormalizedEquipmentNodes,
  type NormalizedEquipmentNode,
} from "@/lib/equipment-tree";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";
import {
  createPositionAccessResolver,
  normalizeScopeAccess,
  scopesForPosition,
  type PositionSystemScope,
} from "@/lib/position-system-scopes";

type SessionUser = { role?: string | null; position?: string | null };

type DeviceLike = {
  code: string;
  system?: string | null;
  systemSeq?: string | null;
  managingPosition?: string | null;
};

export type EquipmentAccessContext = {
  nodes: NormalizedEquipmentNode[];
  index: ReturnType<typeof buildEquipmentTreeIndex>;
  hasExplicitScopes: boolean;
  visibleSeqs: Set<string>;
  editableSeqs: Set<string>;
  visibleSystemNames: Set<string>;
  editableSystemNames: Set<string>;
  canViewSeq: (seq?: string | null) => boolean;
  canEditSeq: (seq?: string | null) => boolean;
  canViewDeviceLike: (device: { device?: string | null; system?: string | null }) => boolean;
  canEditDeviceLike: (device: { device?: string | null; system?: string | null }) => boolean;
};

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

function hasExplicitScopes(scopes: PositionSystemScope[], position: string) {
  return scopesForPosition(scopes, position).length > 0;
}

export async function resolveEquipmentAccessForUser(
  user: SessionUser,
  inputNodes?: NormalizedEquipmentNode[]
): Promise<EquipmentAccessContext> {
  const allNodes = inputNodes ?? await getNormalizedEquipmentNodes(prisma);
  const allIndex = buildEquipmentTreeIndex(allNodes);
  const allSeqs = new Set(allNodes.map((node) => node.seq));
  const allNames = new Set(allNodes.map((node) => normalizeText(node.name)).filter(Boolean));

  const unrestricted = {
    nodes: allNodes,
    index: allIndex,
    hasExplicitScopes: false,
    visibleSeqs: allSeqs,
    editableSeqs: allSeqs,
    visibleSystemNames: allNames,
    editableSystemNames: allNames,
    canViewSeq: () => true,
    canEditSeq: () => true,
    canViewDeviceLike: (device: { device?: string | null; system?: string | null }) => {
      return true;
    },
    canEditDeviceLike: (device: { device?: string | null; system?: string | null }) => {
      return true;
    },
  } satisfies EquipmentAccessContext;

  if (user.role === "ADMIN") return unrestricted;
  const position = user.position ?? "";
  if (!position) return unrestricted;

  const scopes = await loadPositionSystemScopeRows();
  if (!hasExplicitScopes(scopes, position)) return unrestricted;

  const visibleSeqs = new Set<string>();
  const editableSeqs = new Set<string>();
  const accessResolver = createPositionAccessResolver(position, allNodes, scopes);
  for (const node of allNodes) {
    const access = accessResolver.accessForSeq(node.seq);
    if (access === "none") continue;
    if (access === "edit") editableSeqs.add(node.seq);

    let current: string | null | undefined = node.seq;
    while (current && !visibleSeqs.has(current)) {
      visibleSeqs.add(current);
      current = allIndex.parentOf.get(current) ?? null;
    }
  }

  const visibleNodes = allNodes.filter((node) => visibleSeqs.has(node.seq));
  const visibleSystemNames = new Set(visibleNodes.map((node) => normalizeText(node.name)).filter(Boolean));
  const editableSystemNames = new Set(
    allNodes
      .filter((node) => editableSeqs.has(node.seq))
      .map((node) => normalizeText(node.name))
      .filter(Boolean)
  );

  return {
    nodes: visibleNodes,
    index: buildEquipmentTreeIndex(visibleNodes),
    hasExplicitScopes: true,
    visibleSeqs,
    editableSeqs,
    visibleSystemNames,
    editableSystemNames,
    canViewSeq: (seq?: string | null) => !!seq && visibleSeqs.has(seq),
    canEditSeq: (seq?: string | null) => !!seq && editableSeqs.has(seq),
    canViewDeviceLike: (device: { device?: string | null; system?: string | null }) => {
      if (device.device) return visibleSeqs.has(device.device);
      if (device.system) return visibleSystemNames.has(normalizeText(device.system));
      return false;
    },
    canEditDeviceLike: (device: { device?: string | null; system?: string | null }) => {
      if (device.device) return editableSeqs.has(device.device);
      if (device.system) return editableSystemNames.has(normalizeText(device.system));
      return false;
    },
  };
}

export async function filterEquipmentNodesForUser(user: SessionUser, nodes: NormalizedEquipmentNode[]) {
  const access = await resolveEquipmentAccessForUser(user, nodes);
  return access.nodes;
}

export async function assertSeqViewable(user: SessionUser, seq: string) {
  const access = await resolveEquipmentAccessForUser(user);
  if (!access.canViewSeq(seq)) {
    throw fail("Cương vị của bạn không có quyền xem hệ thống thiết bị này", 403);
  }
}

export async function assertSeqEditable(user: SessionUser, seq: string) {
  const access = await resolveEquipmentAccessForUser(user);
  if (!access.canEditSeq(seq)) {
    throw fail("Cương vị của bạn không có quyền chỉnh sửa hệ thống thiết bị này", 403);
  }
}

export async function assertDeviceEditable(user: SessionUser, device: DeviceLike) {
  const access = await resolveEquipmentAccessForUser(user);
  const canEdit = device.code
    ? access.canEditSeq(device.code)
    : device.systemSeq
      ? access.canEditSeq(device.systemSeq)
      : device.system
        ? access.editableSystemNames.has(normalizeText(device.system))
        : true;

  if (!canEdit) {
    throw fail("Cương vị của bạn không có quyền thao tác trên hệ thống thiết bị này", 403);
  }
}
