import { audit, fail, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/modules/ctktkt/lib/auth/server";
import { defaultPositionGrants, positionPermissionOptions, validatePositionGrants } from "@/modules/ctktkt/lib/auth/position-permissions";
import { readPositionPermissionConfig, savePositionPermissionConfig, PositionPermissionConflict, CTKTKT_POSITION_CONFIG_KEY } from "@/modules/ctktkt/lib/auth/position-permission-store";

export async function GET() {
  const guard = await requirePermission("manage_permissions"); if (!guard.ok) return guard.response;
  const { config, updatedAt } = await readPositionPermissionConfig();
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { position: true, secondaryPosition: true, secondaryPosition2: true } });
  const values = users.flatMap(user => [user.position, user.secondaryPosition, user.secondaryPosition2]).filter((p): p is string => Boolean(p));
  return ok({ ...config, updatedAt, defaults: defaultPositionGrants(), positions: positionPermissionOptions(values, config.grants) });
}

export async function PUT(request: Request) {
  const guard = await requirePermission("manage_permissions"); if (!guard.ok) return guard.response;
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("Nguồn yêu cầu không hợp lệ.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("Yêu cầu phải là JSON.", 415);
  if (!request.body) return fail("Thiếu bảng phân quyền KTKT.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 256_000) { await reader.cancel(); return fail("Bảng phân quyền quá lớn.", 413); }
    chunks.push(value);
  }
  let body, grants;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Number.isSafeInteger(body?.expectedVersion) || body.expectedVersion < 0) return fail("Phiên bản phân quyền không hợp lệ.");
    grants = validatePositionGrants(body.grants);
  } catch (error) { return fail(error instanceof SyntaxError ? "JSON không hợp lệ." : error instanceof Error ? error.message : "Bảng phân quyền không hợp lệ."); }
  try {
    const host = await requireUser();
    const { before, config } = await savePositionPermissionConfig(grants, body.expectedVersion, host.id);
    await audit(host.id, "UPDATE_CTKTKT_PERMISSIONS", "RbacConfig", CTKTKT_POSITION_CONFIG_KEY, "Cập nhật phân quyền KTKT theo cương vị", {
      beforeData: before, afterData: config, changedFields: ["grants"],
    });
    const response = ok(config); response.headers.set("Cache-Control", "private, no-store"); return response;
  } catch (error) {
    if (error instanceof PositionPermissionConflict) return fail(error.message, 409);
    throw error;
  }
}
