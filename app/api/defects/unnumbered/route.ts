import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { hasPermissionLevel, requirePermissionLevel } from "@/lib/rbac-guard";
import { canViewPosition, resolvePositionViewScope } from "@/lib/position-data-scope";
import { N8N_DEFECT_SOURCES, type N8nDefectSource } from "@/lib/defect-n8n-sync";
import { canSeeUnnumbered } from "@/lib/defect-unnumbered-access";
import {
  lastUnnumberedReadAt,
  refreshUnnumberedRows,
  UNNUMBERED_SOURCES,
  UNNUMBERED_STATUSES,
  writeUnnumberedStatuses,
  type UnnumberedStatus,
} from "@/lib/server/defect-unnumbered";

export const dynamic = "force-dynamic";

/*
 * Dòng khiếm khuyết CHƯA CÓ STT trên Sheet Cơ/Điện — xem lib/server/defect-unnumbered.ts.
 *   GET  ?source=CO|DIEN  → các dòng thuộc cương vị người xem được xem (cùng rào với danh sách khiếm khuyết).
 *   POST { source, force } → đọc lại từ Sheet.
 *   PUT  { source, changes: [{ id, status }] } → ghi cột 14 lên Sheet (một dòng hay hàng loạt).
 */

function sourceOf(value: unknown): N8nDefectSource {
  if (N8N_DEFECT_SOURCES.includes(value as N8nDefectSource)) return value as N8nDefectSource;
  throw fail("Nguồn Sheet không hợp lệ");
}

/** Mục tạm đang thử trên production: chỉ Quản trị (lib/defect-unnumbered-access.ts). */
async function requireUnnumberedUser() {
  const user = await requireUser();
  if (!canSeeUnnumbered(user.role)) throw fail("Mục “Dòng chưa số” đang thử nghiệm — tạm chỉ Quản trị dùng được", 403);
  return user;
}

async function canEdit(user: Awaited<ReturnType<typeof requireUser>>) {
  return user.accessMode !== "DEFECT_READ_ONLY" && await hasPermissionLevel(user, "defect-manage", ["manage", "full"]);
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUnnumberedUser();
    const source = sourceOf(req.nextUrl.searchParams.get("source"));
    const [scope, rows, lastReadAt, editable] = await Promise.all([
      resolvePositionViewScope(user, "defect"),
      prisma.defectUnnumberedRow.findMany({ where: { source }, orderBy: { sourceRow: "asc" } }),
      lastUnnumberedReadAt(source),
      canEdit(user),
    ]);
    const visible = rows.filter(row => canViewPosition(row.system ?? row.positionRaw, scope));
    return ok(visible, { lastReadAt, canEdit: editable, label: UNNUMBERED_SOURCES[source].label });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireUnnumberedUser();
    const body = await req.json().catch(() => ({}));
    const result = await refreshUnnumberedRows(sourceOf(body.source), { force: body.force === true });
    return ok(result);
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUnnumberedUser();
    if (user.accessMode === "DEFECT_READ_ONLY") throw fail("Tài khoản tra cứu chỉ đọc không cập nhật được trạng thái", 403);
    await requirePermissionLevel(user, "defect-manage", ["manage", "full"], "Không đủ quyền cập nhật khiếm khuyết");
    const body = await req.json().catch(() => ({}));
    const source = sourceOf(body.source);
    const input = Array.isArray(body.changes) ? body.changes as Array<{ id?: unknown; status?: unknown }> : [];
    if (!input.length) throw fail("Chưa chọn dòng nào để cập nhật");
    if (input.length > 200) throw fail("Mỗi lượt cập nhật tối đa 200 dòng");
    if (input.some(change => !UNNUMBERED_STATUSES.includes(change.status as UnnumberedStatus))) throw fail("Trạng thái không hợp lệ");

    const ids = input.map(change => String(change.id ?? ""));
    const rows = await prisma.defectUnnumberedRow.findMany({ where: { id: { in: ids }, source } });
    if (rows.length !== new Set(ids).size) throw fail("Có dòng không còn trong danh sách — bấm “Đọc lại từ Sheet”.", 409);
    const scope = await resolvePositionViewScope(user, "defect");
    if (rows.some(row => !canViewPosition(row.system ?? row.positionRaw, scope))) throw fail("Có dòng không thuộc cương vị bạn được phân giao", 403);

    const byId = new Map(rows.map(row => [row.id, row]));
    const changes = input
      .map(change => ({ row: byId.get(String(change.id))!, status: change.status as UnnumberedStatus }))
      .filter(({ row, status }) => row.sheetStatus !== status || !row.sheetStatusRaw);
    if (!changes.length) return ok({ written: 0 });

    const written = await writeUnnumberedStatuses(source, changes.map(({ row, status }) => ({ id: row.id, identityHash: row.identityHash, status })));
    const now = new Date();
    await prisma.$transaction(written.map(item => {
      const row = byId.get(item.id)!;
      return prisma.defectUnnumberedRow.update({
        where: { id: item.id },
        data: {
          sheetStatusRaw: item.label, sheetStatus: item.status, sourceRow: item.sourceRow,
          mismatch: row.suggestedStatus !== null && row.suggestedStatus !== item.status,
          updatedById: user.id, updatedByName: user.name ?? null, updatedAt: now,
        },
      });
    }));
    await audit(user.id, "UPDATE_DEFECT_UNNUMBERED", "DefectUnnumberedRow", written.length === 1 ? written[0].id : undefined,
      `${UNNUMBERED_SOURCES[source].label} — ghi cột 14 cho ${written.length} dòng chưa số: ${written.slice(0, 20).map(item => `dòng ${item.sourceRow} “${item.previous || "trống"}” → “${item.label}”`).join("; ")}`);
    return ok({ written: written.length });
  });
}
