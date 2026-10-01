import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { assertOilSootAccess } from "@/lib/server-access";
import { captureOilGunSnapshot, ensureTodaySnapshot, findOilGunSnapshot, firstOilGunSnapshotDate, isSnapshotDate, vietnamDate } from "@/lib/server/oil-gun-snapshot";

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

function summarize(guns: Array<{ status: string; defectSccn?: string | null; defectScd?: string | null }>) {
  return {
    total: guns.length,
    available: guns.filter((g) => g.status === "available" && !hasDefect(g)).length,
    defective: guns.filter((g) => g.status === "available" && hasDefect(g)).length,
    unavailable: guns.filter((g) => g.status === "unavailable").length,
  };
}

// GET /api/oil-guns?machine=S1[&date=YYYY-MM-DD] -> danh sách vòi của tổ máy, theo thứ tự sơ đồ.
// Có `date` (ngày trước hôm nay) → trạng thái cuối ngày đó lấy từ ảnh chụp hằng ngày (chỉ xem).
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await assertOilSootAccess(user); // chặn cứng theo chức vụ (thay cho RBAC ở đọc)
    const machine = req.nextUrl.searchParams.get("machine") || "S1";
    const date = req.nextUrl.searchParams.get("date") || "";
    const today = vietnamDate();
    if (date && date !== today) {
      if (!isSnapshotDate(date) || date > today) return fail("Ngày xem không hợp lệ");
      const [snapshot, firstDate] = await Promise.all([findOilGunSnapshot(machine, date), firstOilGunSnapshotDate(machine)]);
      if (!snapshot) {
        return fail(firstDate
          ? `Chưa có dữ liệu chụp cho ngày này — sơ đồ ${machine} được lưu theo ngày từ ${firstDate.split("-").reverse().join("/")}.`
          : "Chưa có dữ liệu chụp theo ngày nào.", 404);
      }
      return ok(snapshot.guns, {
        machine,
        summary: summarize(snapshot.guns),
        note: snapshot.note,
        noteUpdatedBy: snapshot.noteUpdatedBy,
        noteUpdatedAt: snapshot.noteUpdatedAt,
        snapshot: { date, sourceDate: snapshot.date, capturedAt: snapshot.capturedAt },
        today,
        firstSnapshotDate: firstDate,
      });
    }
    // Hôm nay chưa có bản nào → chụp ngay ở lần xem đầu tiên (ngày không ai sửa vẫn có dữ liệu). Chụp cả
    // hai tổ máy: Excel ngày cũ xuất cả S1 lẫn S2, tổ máy chưa ai mở cũng phải có bản.
    await Promise.all(["S1", "S2"].map(ensureTodaySnapshot));
    const [guns, noteRow, firstDate] = await Promise.all([
      prisma.oilGun.findMany({ where: { machine }, orderBy: { position: "asc" } }),
      prisma.oilGunNote.findUnique({ where: { machine } }),
      firstOilGunSnapshotDate(machine),
    ]);
    return ok(guns, {
      machine,
      summary: summarize(guns),
      note: noteRow?.note ?? "",
      noteUpdatedBy: noteRow?.updatedBy ?? null,
      noteUpdatedAt: noteRow?.updatedAt ?? null,
      snapshot: null,
      today,
      firstSnapshotDate: firstDate,
    });
  });
}

// PUT /api/oil-guns  { machine, code, status, defect } -> cập nhật 1 vòi
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await assertOilSootAccess(user); // chức vụ được phép
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
    // Lớp vòi than
    const coalStatus = body.coalStatus && VALID_STATUS.includes(body.coalStatus) ? body.coalStatus : undefined;
    const coalDefectNote =
      body.coalDefectNote === null ? null : typeof body.coalDefectNote === "string" ? body.coalDefectNote.trim() || null : undefined;
    const coalTouched = coalStatus !== undefined || coalDefectNote !== undefined;

    const gun = await prisma.oilGun.upsert({
      where: { machine_code: { machine, code } },
      update: {
        ...(body.status ? { status: body.status } : {}),
        ...(defectSccn !== undefined ? { defectSccn } : {}),
        ...(defectScd !== undefined ? { defectScd } : {}),
        ...(forceFlame !== undefined ? { forceFlame } : {}),
        ...(coalStatus !== undefined ? { coalStatus } : {}),
        ...(coalDefectNote !== undefined ? { coalDefectNote } : {}),
        ...(coalTouched ? { coalUpdatedBy: user.name ?? null, coalUpdatedAt: new Date() } : {}),
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
        coalStatus: coalStatus ?? "available",
        coalDefectNote: coalDefectNote ?? null,
        coalUpdatedBy: coalTouched ? user.name ?? null : null,
        coalUpdatedAt: coalTouched ? new Date() : null,
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
    await captureOilGunSnapshot(machine); // bản của hôm nay = trạng thái sau lần sửa này
    return ok(gun);
  });
}
