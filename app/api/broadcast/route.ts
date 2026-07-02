import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { hasPermissionLevel, requirePermissionLevel } from "@/lib/rbac-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BROADCAST_PERMISSION = "broadcast-manage";

// Bảng SystemBroadcast được khai báo trong prisma/schema.prisma và tạo bằng db push.
const SELECT = `SELECT id, title, body, "isActive", "createdById", "createdByName", "createdAt", "updatedAt" FROM "SystemBroadcast"`;

// GET: ADMIN nhận toàn bộ (để quản lý); user khác chỉ nhận các thông báo đang bật.
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const canManage = await hasPermissionLevel(user, BROADCAST_PERMISSION, ["manage", "full"]);
    const where = canManage ? "" : `WHERE "isActive" = true`;
    const rows = await prisma.$queryRawUnsafe(
      `${SELECT} ${where} ORDER BY "isActive" DESC, "updatedAt" DESC`
    );
    return ok(rows);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, BROADCAST_PERMISSION, ["manage", "full"], "Không đủ quyền tạo thông báo hệ thống");
    const body = (await req.json()) as Record<string, unknown>;
    const title = String(body.title ?? "").trim();
    const content = String(body.body ?? "").trim();
    if (!title || !content) return fail("Vui lòng nhập tiêu đề và nội dung thông báo");

    const id = randomUUID();
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO "SystemBroadcast" (id, title, body, "isActive", "createdById", "createdByName")
       VALUES ($1, $2, $3, true, $4, $5)
       RETURNING id, title, body, "isActive", "createdById", "createdByName", "createdAt", "updatedAt"`,
      id,
      title,
      content,
      user.id,
      user.name ?? null
    );
    await audit(user.id, "CREATE_BROADCAST", "SystemBroadcast", id, title);
    return ok((rows as unknown[])[0]);
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, BROADCAST_PERMISSION, ["manage", "full"], "Không đủ quyền cập nhật thông báo hệ thống");
    const body = (await req.json()) as Record<string, unknown>;
    const id = String(body.id ?? "");
    if (!id) return fail("Thiếu id thông báo");

    const sets: string[] = [];
    const params: unknown[] = [id];
    if (body.title !== undefined) {
      const t = String(body.title).trim();
      if (!t) return fail("Tiêu đề không được để trống");
      params.push(t);
      sets.push(`title = $${params.length}`);
    }
    if (body.body !== undefined) {
      const c = String(body.body).trim();
      if (!c) return fail("Nội dung không được để trống");
      params.push(c);
      sets.push(`body = $${params.length}`);
    }
    if (body.isActive !== undefined) {
      params.push(Boolean(body.isActive));
      sets.push(`"isActive" = $${params.length}`);
    }
    if (!sets.length) return fail("Không có thay đổi");

    const rows = await prisma.$queryRawUnsafe(
      `UPDATE "SystemBroadcast" SET ${sets.join(", ")}, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, title, body, "isActive", "createdById", "createdByName", "createdAt", "updatedAt"`,
      ...params
    );
    if (!(rows as unknown[]).length) return fail("Không tìm thấy thông báo", 404);
    await audit(user.id, "UPDATE_BROADCAST", "SystemBroadcast", id);
    return ok((rows as unknown[])[0]);
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, BROADCAST_PERMISSION, ["full"], "Không đủ quyền xoá thông báo hệ thống");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail("Thiếu id");
    await prisma.$executeRawUnsafe(`DELETE FROM "SystemBroadcast" WHERE id = $1`, id);
    await audit(user.id, "DELETE_BROADCAST", "SystemBroadcast", id);
    return ok({ id });
  });
}
