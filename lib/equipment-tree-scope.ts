import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { resolveEquipmentTreeAccess } from "@/lib/server-access";
import {
  branchOf,
  COMMON_BRANCHES,
  parseScopeParam,
  seqInScope,
  TREE_SCOPES,
  type TreeScope,
} from "@/lib/equipment-units";
import { normalizeText } from "@/lib/nav";

// Tách cây thiết bị dùng chung thành 3 phạm vi hiển thị mà KHÔNG nhân bản node:
//   S1 / S2  → nhánh thiết bị riêng từng tổ máy (1, 2, 3, 7)
//   COMMON   → nhánh dùng chung 2 tổ máy (5, 6)
// Mọi điều kiện đều chạy trên tiền tố `seq` nên dùng được index text_pattern_ops.

const ROOT_PREFIX = "DH1.S1";

/** Điều kiện khớp trọn một nhánh: chính nó HOẶC con cháu (tránh 'DH1.S1.5' khớp nhầm 'DH1.S1.50'). */
function branchOr(column: string, root: string) {
  return [{ [column]: root }, { [column]: { startsWith: `${root}.` } }];
}

/**
 * Điều kiện Prisma giới hạn một cột seq vào phạm vi cây.
 * COMMON = thuộc nhánh dùng chung; S1/S2 = KHÔNG thuộc nhánh dùng chung.
 */
export function scopeSeqWhere(scope: TreeScope, column: string): Record<string, unknown> {
  const commonRoots = [...COMMON_BRANCHES].map((b) => `${ROOT_PREFIX}.${b}`);
  const inCommon = { OR: commonRoots.flatMap((root) => branchOr(column, root)) };
  return scope === "COMMON" ? inCommon : { NOT: inCommon };
}

/**
 * Điều kiện Prisma cho các nút GỐC của một phạm vi.
 *
 * Cây vật lý có đúng một gốc `DH1.S1` chứa cả 6 nhánh; sau khi tách, chính các nhánh mới là
 * gốc hiển thị nên gốc nhà máy được BUNG XUỐNG MỘT CẤP. Với cương vị bị giới hạn phạm vi,
 * gốc hiển thị có thể nằm sâu hơn — những nút đó giữ nguyên, không bung.
 */
export async function resolveScopeRootWhere(
  user: { role?: string | null; position?: string | null; currentPosition?: string | null },
  scope: TreeScope
): Promise<Record<string, unknown>> {
  const { rootSeqs } = await resolveEquipmentTreeAccess(user);
  const scopeWhere = scopeSeqWhere(scope, "seq");

  // Không giới hạn quyền: gốc hiển thị = con trực tiếp của (các) gốc nhà máy.
  if (rootSeqs === null) {
    const plantRoots = await prisma.equipmentNode.findMany({
      where: { parentSeq: null },
      select: { seq: true },
    });
    return { AND: [{ parentSeq: { in: plantRoots.map((n) => n.seq) } }, scopeWhere] };
  }

  // Có giới hạn: bung gốc nhà máy, giữ nguyên các gốc nằm sâu trong cây.
  const plantRootSeqs = rootSeqs.filter((seq) => branchOf(seq) === null);
  const deepRootSeqs = rootSeqs.filter((seq) => branchOf(seq) !== null && seqInScope(seq, scope));
  const or: Record<string, unknown>[] = [];
  if (plantRootSeqs.length) or.push({ parentSeq: { in: plantRootSeqs } });
  if (deepRootSeqs.length) or.push({ seq: { in: deepRootSeqs } });
  if (!or.length) return { seq: { in: [] } };
  return { AND: [{ OR: or }, scopeWhere] };
}

/**
 * Từ khoá tìm kiếm cho một phạm vi. Cột `searchText` lưu KKS của S1, nên ở cây S2 người
 * dùng gõ KKS thật của họ ("20HFE…") sẽ không khớp gì — dịch ngược ký tự đầu 2 → 1 và
 * tìm cả hai dạng.
 */
export function scopeSearchTerms(q: string, scope: TreeScope): string[] {
  const term = normalizeText(q);
  if (scope !== "S2" || !term.startsWith("2")) return [term];
  return [term, `1${term.slice(1)}`];
}

/**
 * Chặn cứng phía server: dữ liệu nghiệp vụ của một tổ máy chỉ được gắn vào ĐÚNG cây của
 * tổ máy đó — khiếm khuyết S1/S2 vào nhánh 1,2,3,7; khiếm khuyết dùng chung vào nhánh 5,6.
 * Không có ràng buộc này thì client cũ (hoặc gọi API trực tiếp) vẫn ghi lẫn được hai cây.
 */
export function assertSeqsInScope(seqs: Array<string | null | undefined>, unit: string) {
  const scope = parseScopeParam(unit);
  if (!scope) return; // tổ máy không hợp lệ đã được các route kiểm riêng
  const label = TREE_SCOPES.find((s) => s.key === scope)?.label ?? scope;
  for (const seq of seqs) {
    if (!seq || seqInScope(seq, scope)) continue;
    throw fail(
      scope === "COMMON"
        ? `Thiết bị ${seq} không thuộc nhóm dùng chung — phiếu ${label} chỉ được gắn thiết bị ở nhánh dùng chung.`
        : `Thiết bị ${seq} thuộc nhánh dùng chung — phiếu ${label} chỉ được gắn thiết bị của tổ máy.`
    );
  }
}
