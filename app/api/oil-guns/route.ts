import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

// Vòi thuộc tường sau (còn lại là tường trước) — dùng khi tạo mới on-the-fly.
const REAR = new Set([
  "D1", "E1", "F1", "D2", "E2", "F2", "D3", "E3", "F3",
  "A3", "B3", "C3", "A2", "B2", "C2", "A1", "B1", "C1",
]);

const VALID_STATUS = ["available", "unavailable"];

// Vòi có khiếm khuyết khi 1 trong 2 ô SCCN/SCĐ có nội dung.
function hasDefect(g: { defectSccn?: string | null; defectScd?: string | null }) {
  return !!(g.defectSccn?.trim() || g.defectScd?.trim());
}

// GET /api/oil-guns?machine=S1  -> danh sách vòi của tổ máy, theo thứ tự sơ đồ
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "archive-oil-gun-data", ["read", "own", "create", "approve", "manage", "full"], "Không đủ quyền xem dữ liệu vòi dầu");
    const machine = req.nextUrl.searchParams.get("machine") || "S1";
    const guns = await prisma.oilGun.findMany({
      where: { machine },
      orderBy: { position: "asc" },
    });
    const summary = {
      total: guns.length,
      available: guns.filter((g) => g.status === "available" && !hasDefect(g)).length,
      defective: guns.filter((g) => g.status === "available" && hasDefect(g)).length,
      unavailable: guns.filter((g) => g.status === "unavailable").length,
    };
    return ok(guns, { machine, summary });
  });
}

// PUT /api/oil-guns  { machine, code, status, defect } -> cập nhật 1 vòi
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "archive-oil-gun-data", ["manage", "full"], "Không đủ quyền cập nhật dữ liệu vòi dầu");

    const body = await req.json();
    const machine = String(body.machine || "").trim();
    const code = String(body.code || "").trim().toUpperCase();
    if (!machine || !code) return fail("Thiếu tổ máy hoặc mã vòi");
    if (body.status && !VALID_STATUS.includes(body.status)) return fail("Trạng thái không hợp lệ");

    // null (từ cơ chế hoàn tác) → xóa ô; chuỗi → lưu; thiếu → giữ nguyên.
    const defectSccn =
      body.defectSccn === null ? null : typeof body.defectSccn === "string" ? body.defectSccn.trim() || null : undefined;
    const defectScd =
      body.defectScd === null ? null : typeof body.defectScd === "string" ? body.defectScd.trim() || null : undefined;
    const forceFlame = typeof body.forceFlame === "boolean" ? body.forceFlame : undefined;

    const gun = await prisma.oilGun.upsert({
      where: { machine_code: { machine, code } },
      update: {
        ...(body.status ? { status: body.status } : {}),
        ...(defectSccn !== undefined ? { defectSccn } : {}),
        ...(defectScd !== undefined ? { defectScd } : {}),
        ...(forceFlame !== undefined ? { forceFlame } : {}),
        updatedBy: user.name ?? null,
      },
      create: {
        machine,
        code,
        wall: REAR.has(code) ? "REAR" : "FRONT",
        status: body.status || "available",
        defectSccn: defectSccn ?? null,
        defectScd: defectScd ?? null,
        forceFlame: forceFlame ?? false,
        updatedBy: user.name ?? null,
      },
    });

    await audit(
      user.id,
      "UPDATE_OIL_GUN",
      "OilGun",
      gun.id,
      `${machine}/${code} → ${gun.status}${hasDefect(gun) ? " (có khiếm khuyết)" : ""}`
    );
    return ok(gun);
  });
}
