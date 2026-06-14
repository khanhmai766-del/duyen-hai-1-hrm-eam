import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

/**
 * Nhập/cập nhật thiết bị hàng loạt từ CSV/Excel (đã parse ở client).
 * Khớp theo Mã thiết bị (code): có thì cập nhật Tên/Hệ thống, chưa có thì tạo mới.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const body = await req.json();
    const rows: Array<{ code?: string; name?: string; system?: string }> = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return fail("Không có dòng dữ liệu hợp lệ");

    const base = process.env.NEXT_PUBLIC_APP_URL || "";
    let created = 0;
    let updated = 0;
    const skipped: string[] = [];

    for (const r of rows) {
      const code = String(r.code ?? "").trim();
      if (!code) continue;
      const name = r.name != null ? String(r.name).trim() : "";
      const system = r.system != null ? String(r.system).trim() : "";

      const existing = await prisma.device.findUnique({ where: { code } });
      if (existing) {
        await prisma.device.update({
          where: { code },
          data: {
            ...(name ? { name } : {}),
            ...(system ? { system } : {}),
          },
        });
        updated++;
      } else {
        if (!name) { skipped.push(code); continue; } // tạo mới cần có tên
        const device = await prisma.device.create({ data: { code, name, system: system || null } });
        await prisma.device.update({ where: { id: device.id }, data: { qrCodeData: `${base}/public/devices/${device.id}` } });
        created++;
      }
    }

    await audit(user.id, "IMPORT_DEVICES", "Device", undefined, `tạo ${created}, cập nhật ${updated}`);
    return ok({ created, updated, skipped });
  });
}
