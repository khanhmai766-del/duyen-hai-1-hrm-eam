import { NextResponse } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { exportUsersWorkbook } from "@/lib/admin-user-export";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "user-manage", ["read", "manage", "full"], "Không đủ quyền export người dùng");

    const body = await exportUsersWorkbook();
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="danh_sach_nguoi_dung.xlsx"',
      },
    });
  });
}
