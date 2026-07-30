import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { normalizePositionScopeKey, normalizePositionScopeLabel } from "@/lib/position-system-scopes";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";
import { invalidateEquipmentAccessCache } from "@/lib/server-access";
import { invalidatePositionScopeCache } from "@/lib/position-scope-cache";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { positionCodeOf, positionLabelOf } from "@/lib/position-catalog";

export const dynamic = "force-dynamic";

type ScopeAccess = "none" | "view" | "edit";

type ScopeRow = {
  id: string;
  position: string;
  positionCode: string | null;
  systemSeq: string;
  access: ScopeAccess;
  createdAt: Date;
};

// Bảng PositionSystemScope (gồm cột "access") được khai báo trong prisma/schema.prisma
// và tạo bằng db push.
async function listScopes() {
  return prisma.$queryRaw<ScopeRow[]>`
    SELECT "id", "position", "positionCode", "systemSeq", "access", "createdAt"
    FROM "PositionSystemScope"
    ORDER BY "position" ASC, "systemSeq" ASC
  `;
}

export async function GET() {
  return handle(async () => {
    await requireUser();
    const rows = await listScopes();
    return ok(rows, { total: rows.length });
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "rbac-manage", ["full"], "Không đủ quyền cấu hình phạm vi thiết bị theo cương vị");
    const body = await req.json();
    const requestedPosition = normalizePositionScopeLabel(typeof body.position === "string" ? body.position : "");
    const positionCode = positionCodeOf(requestedPosition);
    const position = positionLabelOf(positionCode ?? requestedPosition);

    // Payload mới: entries [{ systemSeq, access }]. Vẫn nhận systemSeqs cũ (mặc định "edit").
    const rawEntries: Array<{ systemSeq: string; access: ScopeAccess }> = Array.isArray(body.entries)
      ? body.entries
          .map((entry: { systemSeq?: unknown; access?: unknown }) => ({
            systemSeq: String(entry?.systemSeq ?? "").trim(),
            access: (entry?.access === "edit" ? "edit" : entry?.access === "view" ? "view" : "none") as ScopeAccess,
          }))
          .filter((entry: { systemSeq: string }) => entry.systemSeq)
      : Array.isArray(body.systemSeqs)
        ? body.systemSeqs
            .map((value: unknown) => ({ systemSeq: String(value).trim(), access: "edit" as ScopeAccess }))
            .filter((entry: { systemSeq: string }) => entry.systemSeq)
        : [];

    // Khử trùng theo systemSeq, giữ access mạnh hơn (edit > view).
    const bySeq = new Map<string, ScopeAccess>();
    for (const entry of rawEntries) {
      const prev = bySeq.get(entry.systemSeq);
      bySeq.set(
        entry.systemSeq,
        prev === "edit" || entry.access === "edit"
          ? "edit"
          : prev === "view" || entry.access === "view"
            ? "view"
            : "none"
      );
    }

    if (!position) return fail("Vui lòng chọn cương vị cần phân quyền hệ thống thiết bị");

    const existingRows = await listScopes();
    const positionKey = normalizePositionScopeKey(position);
    const positionsToClear = Array.from(
      new Set(
        existingRows
          .filter((row) =>
            positionCode && row.positionCode
              ? row.positionCode === positionCode
              : normalizePositionScopeKey(row.position) === positionKey
          )
          .map((row) => row.position)
      )
    );
    for (const item of positionsToClear) {
      await prisma.$executeRaw`DELETE FROM "PositionSystemScope" WHERE "position" = ${item}`;
    }
    for (const [systemSeq, access] of bySeq) {
      await prisma.$executeRaw`
        INSERT INTO "PositionSystemScope" ("id", "position", "positionCode", "systemSeq", "access")
        VALUES (${randomUUID()}, ${position}, ${positionCode}, ${systemSeq}, ${access})
        ON CONFLICT ("position", "systemSeq") DO UPDATE
        SET "access" = EXCLUDED."access", "positionCode" = EXCLUDED."positionCode"
      `;
    }
    await audit(
      user.id,
      "UPDATE_POSITION_SYSTEM_SCOPE",
      "PositionSystemScope",
      position,
      Array.from(bySeq.entries()).map(([seq, access]) => `${seq}:${access}`).join(", ")
    );
    invalidateDeviceListCache();
    // Bảng scope được cache in-process — xoá cache để quyền mới có hiệu lực ngay.
    invalidatePositionScopeCache();
    invalidateEquipmentAccessCache();
    const rows = await listScopes();
    return ok(rows, { total: rows.length });
  });
}
