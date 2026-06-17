import { prisma } from "@/lib/prisma";
import { ok, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

// Số liệu công khai cho màn hình đăng nhập (không cần đăng nhập): tổng thiết bị
// và tổng người dùng. Chỉ trả về số đếm, không lộ dữ liệu chi tiết.
export async function GET() {
  return handle(async () => {
    const [devices, users] = await Promise.all([
      prisma.device.count(),
      prisma.user.count(),
    ]);
    return ok({ devices, users });
  });
}
