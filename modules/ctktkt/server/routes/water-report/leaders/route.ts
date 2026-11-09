import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { requireAdmin, requireSession } from "@/modules/ctktkt/lib/auth/server";

export async function GET() {
  const session = await requireSession(); if (!session.ok) return session.response;
  try {
    const rows = await prisma.ctktktWaterShiftLeaders.findMany({
      orderBy: [{ display_order: "asc" }, { name: "asc" }], select: { id: true, name: true, is_active: true, display_order: true },
    });
    return ok({ ok: true, leaders: rows.map(r => ({ id: r.id, name: r.name, isActive: r.is_active, displayOrder: r.display_order })) });
  } catch (err) {
    console.error("Lỗi lấy danh sách Trưởng ca:", err);
    return fail("Không thể lấy danh sách Trưởng ca.", 500);
  }
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as { name?: string; isActive?: number; displayOrder?: number };
    const name = String(body.name || "").trim();
    if (!name) {
      return fail("Tên Trưởng ca không được để trống.", 400);
    }

    const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : 1;
    const displayOrder = Number(body.displayOrder ?? 0);

    // Bảng Trưởng ca không nằm trong nhóm dữ liệu vận hành → không có khoá phiên bản đọc (như bản cũ).
    await prisma.ctktktWaterShiftLeaders.upsert({
      where: { name },
      create: { name, is_active: isActive, display_order: displayOrder },
      update: { is_active: isActive, display_order: displayOrder },
    });

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

    if (id > 0) {
      await prisma.ctktktWaterShiftLeaders.deleteMany({ where: { id } });
    } else if (name) {
      await prisma.ctktktWaterShiftLeaders.deleteMany({ where: { name } });
    } else {
      return fail("Thiếu ID hoặc tên Trưởng ca cần xoá.", 400);
    }

    return ok({ ok: true, message: "Đã xoá Trưởng ca thành công." });
  } catch (err) {
    console.error("Lỗi xoá Trưởng ca:", err);
    return fail("Không thể xoá Trưởng ca.", 500);
  }
}
