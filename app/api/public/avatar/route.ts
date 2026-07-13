import type { NextRequest } from "next/server";
import { fail, handle } from "@/lib/api";
import { getS3Object } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Đồng bộ với safeEmployeeCode(): mã nhân viên có thể chứa ký tự Unicode/Vietnamese.
// Vẫn khóa cứng prefix và phần mở rộng để endpoint không đọc được tệp ngoài avatar.
const PUBLIC_AVATAR_KEY = /^avatars\/[\p{L}\p{M}\p{N}._-]+\.(?:jpg|jpeg|png|webp)$/iu;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const key = req.nextUrl.searchParams.get("key")?.trim() ?? "";
    if (!PUBLIC_AVATAR_KEY.test(key)) return fail("Đường dẫn ảnh đại diện không hợp lệ", 400);

    const object = await getS3Object(key);
    if (!object.Body) return fail("Không đọc được ảnh đại diện", 404);

    const stream = typeof object.Body.transformToWebStream === "function"
      ? object.Body.transformToWebStream()
      : (object.Body as unknown as ReadableStream);

    return new Response(stream, {
      headers: {
        "Content-Type": object.ContentType || "image/jpeg",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
