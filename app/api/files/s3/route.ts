import type { NextRequest } from "next/server";
import { fail, handle, requireUser } from "@/lib/api";
import { getS3Object } from "@/lib/s3-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validKey(key: string) {
  return Boolean(key) && !key.startsWith("/") && !key.includes("..");
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const key = req.nextUrl.searchParams.get("key")?.trim() ?? "";
    if (!validKey(key)) return fail("Key không hợp lệ", 400);

    const object = await getS3Object(key);
    const body = object.Body;
    if (!body) return fail("Không đọc được tệp", 404);

    const stream =
      typeof body.transformToWebStream === "function"
        ? body.transformToWebStream()
        : (body as unknown as ReadableStream);

    return new Response(stream, {
      headers: {
        "Content-Type": object.ContentType || "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  });
}
