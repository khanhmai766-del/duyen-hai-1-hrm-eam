import type { NextRequest } from "next/server";
import { ok, fail, requireUser, handle } from "@/lib/api";
import { loadPositionSystemScopeRows, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { scopesForPosition } from "@/lib/position-system-scopes";

export const dynamic = "force-dynamic";

// Quyền của người dùng hiện tại trên MỘT seq — thay cho việc client tải toàn bộ cây (3MB)
// chỉ để tính ẩn/hiện nút Sửa. Fast-path (ADMIN / chưa cấu hình scope) không đụng bảng node;
// cương vị có scope dùng access-context đã cache theo cương vị (60s).
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const seq = (req.nextUrl.searchParams.get("seq") ?? "").trim();
    if (!seq) return fail("Thiếu seq");

    if (user.role === "ADMIN") return ok({ access: "edit" });
    const position = user.position ?? "";
    if (!position) return ok({ access: "edit" });
    const scopes = await loadPositionSystemScopeRows();
    if (!scopesForPosition(scopes, position).length) return ok({ access: "edit" });

    const ctx = await resolveEquipmentAccessForUser(user);
    const access = ctx.canEditSeq(seq) ? "edit" : ctx.canViewSeq(seq) ? "view" : "none";
    return ok({ access });
  });
}
