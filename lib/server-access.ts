import { fail } from "@/lib/api";
import {
  buildEquipmentTreeIndex,
  type NormalizedEquipmentNode,
} from "@/lib/equipment-tree";
import { getCachedEquipmentNodeList } from "@/lib/equipment-node-cache";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";
import {
  createPositionAccessResolver,
  normalizePositionScopeKey,
  normalizeScopeAccess,
  scopesForPosition,
  type PositionSystemScope,
} from "@/lib/position-system-scopes";

type SessionUser = { role?: string | null; position?: string | null };

/**
 * Bộ lọc phạm vi thiết bị của một cương vị, dạng biểu diễn được trong SQL:
 * - "all": không giới hạn (admin / chưa cấu hình scope).
 * - "branches": vài nhánh gốc được cấp (include) trừ vài nhánh bị chặn (exclude)
 *   → query bằng prefix seq (deviceSeq = root OR LIKE 'root.%'), chạy trên index
 *   text_pattern_ops, KHÔNG phụ thuộc tổng kích thước bảng.
 * - "list": cấu trúc scope lồng nhau phức tạp (cấp lại bên trong nhánh bị chặn)
 *   không biểu diễn được bằng prefix → fallback IN-list.
 */
export type EquipmentBranchFilter =
  | { kind: "all" }
  | { kind: "branches"; include: string[]; exclude: string[] }
  | { kind: "list"; seqs: string[] };

/**
 * Dựng điều kiện Prisma where cho một cột chứa seq theo bộ lọc phạm vi.
 * Trả null nếu không cần lọc ("all").
 */
export function equipmentSeqWhere(
  filter: EquipmentBranchFilter,
  column: string
): Record<string, unknown> | null {
  if (filter.kind === "all") return null;
  if (filter.kind === "list") return { [column]: { in: filter.seqs } };
  if (!filter.include.length) return { [column]: { in: [] } }; // có scope nhưng toàn "none" → không thấy gì
  const branchOr = (root: string) => [{ [column]: root }, { [column]: { startsWith: `${root}.` } }];
  const include = { OR: filter.include.flatMap(branchOr) };
  if (!filter.exclude.length) return include;
  return {
    AND: [include, ...filter.exclude.map((root) => ({ NOT: { OR: branchOr(root) } }))],
  };
}

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
  branchFilter: EquipmentBranchFilter;
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

// Cache access-context: theo (mảng node, cương vị) với TTL. Chỉ ~10-20 cương vị và
// scope hiếm khi đổi — không cần dựng lại index 9k node + quyền trên mỗi request.
// WeakMap theo mảng node: node-cache refresh → mảng mới → entry cũ tự bị bỏ.
const ACCESS_CACHE_TTL_MS = 60_000;
type CachedAccess = { ctx: EquipmentAccessContext; expiresAt: number; generation: number };
const accessCacheByNodes = new WeakMap<NormalizedEquipmentNode[], Map<string, CachedAccess>>();
let accessGeneration = 0;

/** Gọi khi admin đổi phân quyền hệ thống (PositionSystemScope) để quyền mới áp dụng ngay. */
export function invalidateEquipmentAccessCache() {
  accessGeneration++;
}

export async function resolveEquipmentAccessForUser(
  user: SessionUser,
  inputNodes?: NormalizedEquipmentNode[]
): Promise<EquipmentAccessContext> {
  const allNodes = inputNodes ?? (await getCachedEquipmentNodeList());
  const cacheKey =
    user.role === "ADMIN" || !(user.position ?? "")
      ? "__unrestricted__"
      : `pos:${normalizePositionScopeKey(user.position)}`;

  let byPosition = accessCacheByNodes.get(allNodes);
  if (!byPosition) {
    byPosition = new Map();
    accessCacheByNodes.set(allNodes, byPosition);
  }
  const hit = byPosition.get(cacheKey);
  const now = Date.now();
  if (hit && hit.expiresAt > now && hit.generation === accessGeneration) return hit.ctx;

  const ctx = await buildEquipmentAccessContext(user, allNodes);
  byPosition.set(cacheKey, { ctx, expiresAt: now + ACCESS_CACHE_TTL_MS, generation: accessGeneration });
  return ctx;
}

async function buildEquipmentAccessContext(
  user: SessionUser,
  allNodes: NormalizedEquipmentNode[]
): Promise<EquipmentAccessContext> {
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
    branchFilter: { kind: "all" } as EquipmentBranchFilter,
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
  // recordSeqs = node có quyền thật (≠ none) — hẹp hơn visibleSeqs (visibleSeqs kèm
  // tổ tiên chỉ để vẽ đường dẫn cây, không cấp quyền xem DỮ LIỆU gắn vào tổ tiên).
  const recordSeqs = new Set<string>();
  const includeRoots: string[] = [];
  const excludeRoots: string[] = [];
  const accessResolver = createPositionAccessResolver(position, allNodes, scopes);
  for (const node of allNodes) {
    const access = accessResolver.accessForSeq(node.seq);
    const parentSeq = allIndex.parentOf.get(node.seq) ?? null;
    const parentAccess = parentSeq ? accessResolver.accessForSeq(parentSeq) : "none";
    // Ranh giới chuyển quyền = gốc một nhánh include/exclude (giữa 2 ranh giới quyền đồng nhất).
    if (access !== "none" && parentAccess === "none") includeRoots.push(node.seq);
    if (access === "none" && parentAccess !== "none") excludeRoots.push(node.seq);
    if (access === "none") continue;
    recordSeqs.add(node.seq);
    if (access === "edit") editableSeqs.add(node.seq);

    let current: string | null | undefined = node.seq;
    while (current && !visibleSeqs.has(current)) {
      visibleSeqs.add(current);
      current = allIndex.parentOf.get(current) ?? null;
    }
  }

  // Nhánh include nằm BÊN TRONG một nhánh exclude (cấp lại sâu hơn chỗ đã chặn):
  // biểu thức prefix OR/NOT không mô tả được → fallback IN-list cho đúng tuyệt đối.
  const excludeRootSet = new Set(excludeRoots);
  const hasNestedInclude = includeRoots.some((root) => {
    let current = allIndex.parentOf.get(root) ?? null;
    while (current) {
      if (excludeRootSet.has(current)) return true;
      current = allIndex.parentOf.get(current) ?? null;
    }
    return false;
  });
  const branchFilter: EquipmentBranchFilter = hasNestedInclude
    ? { kind: "list", seqs: Array.from(recordSeqs) }
    : { kind: "branches", include: includeRoots, exclude: excludeRoots };

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
    branchFilter,
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

// Kiểm tra quyền XEM một seq mà KHÔNG cần nạp/normalize toàn bộ 9k node: chỉ đọc
// scopes của cương vị rồi leo cây theo tổ tiên của seq (tổ tiên hiệu lực luôn là
// tiền tố chuỗi seq). Fail-safe: chỉ nới quyền khi cương vị chưa cấu hình riêng.
export async function assertSeqViewable(user: SessionUser, seq: string) {
  if (user.role === "ADMIN") return;
  const position = user.position ?? "";
  if (!position) return;

  const scopes = await loadPositionSystemScopeRows();
  const explicit = scopesForPosition(scopes, position);
  if (!explicit.length) return; // cương vị chưa cấu hình riêng → xem tất cả (giữ rule cũ)

  const accessBySeq = new Map(
    explicit.map((scope) => [scope.systemSeq, normalizeScopeAccess(scope.access)] as const)
  );
  let current: string | null = seq;
  while (current) {
    const access = accessBySeq.get(current);
    if (access && access !== "none") return; // seq hoặc tổ tiên được cấp quyền
    const idx = current.lastIndexOf(".");
    current = idx > 0 ? current.slice(0, idx) : null;
  }
  throw fail("Cương vị của bạn không có quyền xem hệ thống thiết bị này", 403);
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
