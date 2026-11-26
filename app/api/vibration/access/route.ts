import { handle, ok } from "@/lib/api";
import { vibrationAccessFor } from "@/lib/vibration/position-access";
import { requireVibrationView } from "@/lib/vibration/server";

export const dynamic = "force-dynamic";

/** Quyền nhập số đo theo cương vị của người đang đăng nhập (đối chiếu app cũ): { admin, viewAll, editAreas, declared, supervisor }.
 *  Chỉ phục vụ giao diện (mặc định cương vị, khoá ô nhập); máy chủ luôn tự kiểm tra lại khi lưu. Cần vibration-view. */
export async function GET() {
  return handle(async () => {
    const user = await requireVibrationView();
    return ok(vibrationAccessFor(user));
  });
}
