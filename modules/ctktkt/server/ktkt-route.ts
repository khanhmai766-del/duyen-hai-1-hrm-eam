import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { handle, requireUser, fail, audit } from "@/lib/api";
import { getSessionUser } from "@/modules/ctktkt/lib/auth/server";
import { inspectUpload } from "@/lib/upload-guard";
import { isCtktktMachineEndpoint } from "@/modules/ctktkt/lib/machine-endpoints";

/**
 * Lớp bọc chung cho mọi route `/api/ctktkt/<đường dẫn>` (giai đoạn 4 — thay cổng `[[...path]]`): mỗi đường dẫn có tệp
 * `app/api/ctktkt/<đường dẫn>/route.ts` riêng, cùng các bước như cổng cũ, theo đúng thứ tự:
 * 1. API cho máy (tích hợp, cron, Google Apps Script) tự kiểm bearer trong handler — bỏ qua phiên đăng nhập;
 *    còn lại: phải đăng nhập (401) và có phiên KTKT (403).
 * 2. Phương thức ghi: phải cùng nguồn (403).
 * 3. Tệp tải lên (multipart): giới hạn dung lượng + quét định dạng/virus TRƯỚC khi parser Excel/ZIP/AI đọc byte.
 * 4. Gọi handler (phương thức không có → 405).
 * 5. API máy trả nguyên JSON gốc; còn lại: ghi audit lượt ghi thành công và đặt `Cache-Control: private, no-store`
 *    (file tải về của các route xuất/sao lưu giữ tiêu đề riêng, như cổng cũ).
 */
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Handlers = Partial<Record<Method, (request: Request) => Promise<Response>>>;

/** Route trả FILE mà cổng cũ để nguyên tiêu đề (không đè Cache-Control). */
const FILE_PASSTHROUGH = new Set(["ctktkt-report/export", "water-report/export", "bcsx-export", "admin/data-backup", "admin/data-backup/archive", "google-mirror/setup"]);

export function ktktRoute(path: string, handlers: Handlers) {
  const run = (method: Method) => (request: Request) => handle(async () => {
    const machine = isCtktktMachineEndpoint(new URL(request.url).pathname, request.method);
    const actor = machine ? null : await requireUser();
    if (!machine && !await getSessionUser()) return fail("Không đủ quyền truy cập Chỉ tiêu KTKT.", 403);
    if (!["GET", "HEAD"].includes(request.method)) {
      if (!isCtktktSameOrigin(request)) return fail("Nguồn yêu cầu không hợp lệ.", 403);
    }
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if (Number(request.headers.get("content-length") ?? 0) > 32 * 1024 * 1024) return fail("Tệp tải lên quá lớn.", 413);
      const form = await request.clone().formData();
      for (const [, value] of form) if (value instanceof File) {
        if (value.size > 25 * 1024 * 1024) return fail("Tệp tải lên quá lớn.", 413);
        await inspectUpload(Buffer.from(await value.arrayBuffer()), { fileName: value.name, kinds: ["zip", "ole"], label: "Excel hoặc ZIP" });
      }
    }
    const handler = handlers[method];
    if (!handler) return fail("Phương thức không được hỗ trợ.", 405);
    const response = await handler(request);
    if (machine) return response; // Giữ hợp đồng JSON gốc cho các hệ thống gọi API.
    if (path === "permissions") { response.headers.set("Cache-Control", "private, no-store"); return response; }
    if (actor && response.ok && !["GET", "HEAD"].includes(request.method)) await audit(actor.id, "UPDATE_CTKTKT", "Ctktkt", undefined, `${request.method} ${path}`);
    if (FILE_PASSTHROUGH.has(path) && response.headers.has("Content-Disposition")) return response;
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
  return { GET: run("GET"), POST: run("POST"), PUT: run("PUT"), PATCH: run("PATCH"), DELETE: run("DELETE") };
}
