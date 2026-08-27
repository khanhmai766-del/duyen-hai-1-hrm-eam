import type { NextRequest } from "next/server";
import { fail, handle } from "@/lib/api";
import {
  avatarNotModified,
  avatarResponseBody,
  avatarResponseHeaders,
  getDeliveredAvatar,
} from "@/lib/avatar-delivery-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Đồng bộ với safeEmployeeCode(): mã nhân viên có thể chứa ký tự Unicode/Vietnamese.
// Vẫn khóa cứng prefix và phần mở rộng để endpoint không đọc được tệp ngoài avatar.
const PUBLIC_AVATAR_KEY = /^avatars\/[\p{L}\p{M}\p{N}._-]+\.(?:jpg|jpeg|png|webp)$/iu;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const key = req.nextUrl.searchParams.get("key")?.trim() ?? "";
    if (!PUBLIC_AVATAR_KEY.test(key)) return fail("Đường dẫn ảnh đại diện không hợp lệ", 400);

    const avatar = await getDeliveredAvatar(key);
    const headers = avatarResponseHeaders(avatar, "public");
    if (avatarNotModified(req, avatar)) {
      const notModifiedHeaders = new Headers(headers);
      notModifiedHeaders.delete("Content-Length");
      return new Response(null, { status: 304, headers: notModifiedHeaders });
    }
    return new Response(avatarResponseBody(avatar), { headers });
  });
}
