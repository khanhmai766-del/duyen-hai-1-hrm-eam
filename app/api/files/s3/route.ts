import type { NextRequest } from "next/server";
import { fail, handle, requireUser } from "@/lib/api";
import { getS3Object } from "@/lib/s3";
import { bbntHandwrittenFileName } from "@/lib/material-document-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function validKey(key: string) {
  return Boolean(key) && !key.startsWith("/") && !key.includes("..");
}

function safeDownloadName(value: string) {
  const baseName = value.split(/[\\/]/).pop()?.trim() ?? "";
  return baseName
    .replace(/[\r\n]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .slice(0, 180) || "tai-lieu.docx";
}

function contentDisposition(fileName: string) {
  const asciiName = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const key = req.nextUrl.searchParams.get("key")?.trim() ?? "";
    if (!validKey(key)) return fail("Key không hợp lệ", 400);
    const requestedFileName = req.nextUrl.searchParams.get("filename")?.trim();
    const requestedDeviceName = req.nextUrl.searchParams.get("deviceName")?.trim();

    const object = await getS3Object(key);
    const body = object.Body;
    if (!body) return fail("Không đọc được tệp", 404);

    const stream =
      typeof body.transformToWebStream === "function"
        ? body.transformToWebStream()
        : (body as unknown as ReadableStream);

    const contentType = object.ContentType || "application/octet-stream";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
    };
    if (contentType === DOCX_MIME) {
      const keyFileName = key.split("/").pop() || "tai-lieu.docx";
      const generatedFileName = requestedDeviceName
        ? bbntHandwrittenFileName([requestedDeviceName], object.LastModified ?? new Date())
        : null;
      headers["Content-Disposition"] = contentDisposition(safeDownloadName(requestedFileName || generatedFileName || keyFileName));
    }

    return new Response(stream, { headers });
  });
}
