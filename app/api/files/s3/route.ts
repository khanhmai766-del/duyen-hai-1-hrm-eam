import type { NextRequest } from "next/server";
import { fail, handle, requireUser } from "@/lib/api";
import { getS3Object } from "@/lib/s3";
import { bbntHandwrittenFileName } from "@/lib/material-document-name";
import { prisma } from "@/lib/prisma";
import { lookupModulesFor } from "@/lib/server/lookup-access";
import { requireDigitalDocumentReadPermission } from "@/lib/document-read-access";
import {
  avatarNotModified,
  avatarResponseBody,
  avatarResponseHeaders,
  getDeliveredAvatar,
} from "@/lib/avatar-delivery-cache";

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
    const user = await requireUser();
    const key = req.nextUrl.searchParams.get("key")?.trim() ?? "";
    if (!validKey(key)) return fail("Key không hợp lệ", 400);
    if (user.accessMode === "DEFECT_READ_ONLY") {
      const modules = await lookupModulesFor(user.id);
      const own = await prisma.user.findUnique({ where: { id: user.id }, select: { avatarKey: true, signatureKey: true } });
      let allowed = key === own?.avatarKey || key === own?.signatureKey || key.startsWith("avatars/");
      const folders: Array<[string, string[]]> = [
        ["defects/", ["defects"]], ["equipment/", ["devices", "reports"]],
        ["materials/", ["materials", "material-plans", "material-tickets"]],
        ["material-tickets/", ["material-tickets"]], ["announcements/", ["notifications"]],
        ["grounding-lightning/", ["grounding"]], ["pccc/", ["pccc"]], ["signatures/", ["pccc"]],
        ["tbycnn/", ["tbycnn"]], ["work-permits/", ["work-permits"]], ["work-permit-people/", ["work-permits"]],
      ];
      allowed ||= folders.some(([folder, ids]) => key.startsWith(folder) && modules.some(id => ids.includes(id)));
      if (!allowed && key.startsWith("digital-documents/")) {
        const document = await prisma.digitalDocument.findFirst({ where: { attachmentUrls: { contains: key } }, select: { category: true } });
        if (document) { await requireDigitalDocumentReadPermission(user, document.category); allowed = true; }
      }
      if (!allowed) return fail("Tài khoản tra cứu chưa được cấp quyền đọc tệp này", 403);
    }
    const requestedFileName = req.nextUrl.searchParams.get("filename")?.trim();
    const requestedDeviceName = req.nextUrl.searchParams.get("deviceName")?.trim();

    if (key.startsWith("avatars/")) {
      const avatar = await getDeliveredAvatar(key);
      const headers = avatarResponseHeaders(avatar, "private");
      if (avatarNotModified(req, avatar)) {
        const notModifiedHeaders = new Headers(headers);
        notModifiedHeaders.delete("Content-Length");
        return new Response(null, { status: 304, headers: notModifiedHeaders });
      }
      return new Response(avatarResponseBody(avatar), { headers });
    }

    const object = await getS3Object(key);
    const body = object.Body;
    if (!body) return fail("Không đọc được tệp", 404);

    const stream =
      typeof body.transformToWebStream === "function"
        ? body.transformToWebStream()
        : (body as unknown as ReadableStream);

    const contentType = object.ContentType || "application/octet-stream";
    /*
     * Ảnh tiếp địa & chống sét nằm dưới khoá DUY NHẤT mỗi lần tải (makeKey = thời điểm +
     * UUID; thay ảnh là khoá khác, ảnh cũ bị xoá) — nội dung tại một khoá không bao giờ
     * đổi. Lớp lưu trữ đã khai báo `immutable` ngay lúc ghi (DEFAULT_CACHE_CONTROL) nhưng
     * proxy lại ép xuống 5 phút, nên cứ quá 5 phút là trình duyệt tải lại nguyên tấm ảnh
     * qua Node → MinIO, kể cả khi mở lại đúng tấm vừa xem.
     *
     * Chỉ mở cho thư mục này: hai nơi ghi vào nó (route tải ảnh và
     * scripts/import/grounding-lightning.ts) đều đi qua uploadImageBufferToS3 nên chắc
     * chắn là khoá mới. Các thư mục khác chưa rà hết người ghi nên giữ nguyên 5 phút.
     * `private` để proxy/CDN dùng chung không giữ lại ảnh vốn phải đăng nhập mới xem.
     *
     * Ảnh thẻ nhân sự nhà thầu: khoá cố định theo số thẻ và bị ghi đè khi đồng bộ, nhưng URL luôn kèm
     * `v` = băm nguồn ảnh (withPhotoUrl) — ảnh đổi thì URL đổi, nên URL có `v` giữ được lâu dài.
     */
    const versionedPersonPhoto = key.startsWith("work-permit-people/photos/") && req.nextUrl.searchParams.has("v");
    const immutableImage = (key.startsWith("grounding-lightning/") || versionedPersonPhoto) && contentType.startsWith("image/");
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": immutableImage ? "private, max-age=31536000, immutable" : "private, max-age=300",
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
