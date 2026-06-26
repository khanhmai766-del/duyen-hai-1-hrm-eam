import { NextResponse, type NextRequest } from "next/server";
import { fail, handle, ok, requireRole, requireUser } from "@/lib/api";
import { createUserImportTemplate, importUsersFromForm } from "@/lib/admin-user-import";
import { requireUserImportEnabled } from "@/lib/admin-user-import-toggle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    requireUserImportEnabled();
    const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
    const body = createUserImportTemplate(format);
    return new NextResponse(body, {
      headers: {
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="mau_import_nguoi_dung.${format}"`,
      },
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    requireUserImportEnabled();
    try {
      const result = await importUsersFromForm(await req.formData(), user.id);
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Không import được người dùng");
    }
  });
}
