import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { assertOilSootAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

// PUT /api/oil-guns/note  { machine, note } -> lưu ghi chú chung của sơ đồ 1 tổ máy
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await assertOilSootAccess(user); // chức vụ được phép
    await requirePermissionLevel(user, "archive-oil-gun-data", ["manage", "full"], "Không đủ quyền cập nhật ghi chú vòi dầu");

    const body = await req.json();
    const machine = String(body.machine || "").trim();
    if (!machine) return fail("Thiếu tổ máy");
    const note = typeof body.note === "string" ? body.note : "";

    const row = await prisma.oilGunNote.upsert({
      where: { machine },
      update: { note, updatedBy: user.name ?? null },
      create: { machine, note, updatedBy: user.name ?? null },
    });

    await audit(user.id, "UPDATE_OIL_GUN_NOTE", "OilGunNote", machine, `Ghi chú sơ đồ vòi dầu ${machine}`);
    return ok(row);
  });
}
