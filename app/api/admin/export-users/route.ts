import { NextResponse } from "next/server";
import { handle, requireRole, requireUser } from "@/lib/api";
import { exportUsersWorkbook } from "@/lib/admin-user-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);

    const body = await exportUsersWorkbook();
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="danh_sach_nguoi_dung.xlsx"',
      },
    });
  });
}
