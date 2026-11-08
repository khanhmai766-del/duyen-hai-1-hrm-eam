import { getRawDb } from "@/modules/ctktkt/db";
import { ok, fail } from "@/lib/api";
import { requireAdmin, requireSession } from "@/modules/ctktkt/lib/auth/server";
import { ensureWaterSchema } from "@/modules/ctktkt/lib/water-report/schema";

export async function GET() {
  const session = await requireSession(); if (!session.ok) return session.response;
  try {
    const rawDb = getRawDb();
    await ensureWaterSchema(rawDb);
    const { results } = await rawDb
      .prepare("SELECT id, name, is_active AS isActive, display_order AS displayOrder FROM water_shift_leaders ORDER BY display_order ASC, name ASC")
      .all();
    return ok({ ok: true, leaders: results });
  } catch (err) {
    console.error("Lỗi lấy danh sách Trưởng ca:", err);
    return fail("Không thể lấy danh sách Trưởng ca.", 500);
  }
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const rawDb = getRawDb();
    await ensureWaterSchema(rawDb);

    const body = (await request.json()) as { name?: string; isActive?: number; displayOrder?: number };
    const name = String(body.name || "").trim();
    if (!name) {
      return fail("Tên Trưởng ca không được để trống.", 400);
    }

    const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : 1;
    const displayOrder = Number(body.displayOrder ?? 0);

    await rawDb
      .prepare(
        `INSERT INTO water_shift_leaders (name, is_active, display_order)
         VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET is_active = excluded.is_active, display_order = excluded.display_order`
      )
      .bind(name, isActive, displayOrder)
      .run();

    return ok({ ok: true, message: `Đã cập nhật Trưởng ca: ${name}` });
  } catch (err) {
    console.error("Lỗi thêm/sửa Trưởng ca:", err);
    return fail("Không thể cập nhật Trưởng ca.", 500);
  }
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id") || 0);
    const name = url.searchParams.get("name") || "";

    const rawDb = getRawDb();
    if (id > 0) {
      await rawDb.prepare("DELETE FROM water_shift_leaders WHERE id = ?").bind(id).run();
    } else if (name) {
      await rawDb.prepare("DELETE FROM water_shift_leaders WHERE name = ?").bind(name).run();
    } else {
      return fail("Thiếu ID hoặc tên Trưởng ca cần xoá.", 400);
    }

    return ok({ ok: true, message: "Đã xoá Trưởng ca thành công." });
  } catch (err) {
    console.error("Lỗi xoá Trưởng ca:", err);
    return fail("Không thể xoá Trưởng ca.", 500);
  }
}
