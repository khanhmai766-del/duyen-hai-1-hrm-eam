import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { handle, requireUser, ok, fail, audit } from "@/lib/api";
import { getSessionUser } from "@/modules/ctktkt/lib/auth/server";
import { inspectUpload } from "@/lib/upload-guard";
import { isCtktktMachineEndpoint } from "@/modules/ctktkt/lib/machine-endpoints";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Module = Partial<Record<Method, (request: Request) => Promise<Response>>>;
const routes: Record<string, () => Promise<Module>> = {
  "correction-requests": () => import("@/modules/ctktkt/server/routes/correction-requests/route"),
  "permissions": () => import("@/modules/ctktkt/server/routes/permissions/route"),
  "integration/v1/operating-data": () => import("@/modules/ctktkt/server/routes/integration/v1/operating-data/route"),
  "cron/coal-photos": () => import("@/modules/ctktkt/server/routes/cron/coal-photos/route"),
  "admin/data-backup/archive": () => import("@/modules/ctktkt/server/routes/admin/data-backup/archive/route"),
  "bcsx-sync": () => import("@/modules/ctktkt/server/routes/bcsx-sync/route"),
  "chemical-usage": () => import("@/modules/ctktkt/server/routes/chemical-usage/route"),
  "google-mirror/snapshot": () => import("@/modules/ctktkt/server/routes/google-mirror/snapshot/route"),
  "google-mirror/setup": () => import("@/modules/ctktkt/server/routes/google-mirror/setup/route"),
  "google-mirror/status": () => import("@/modules/ctktkt/server/routes/google-mirror/status/route"),
  "ctktkt-report": () => import("@/modules/ctktkt/server/routes/ctktkt-report/route"),
  "ctktkt-report/export": () => import("@/modules/ctktkt/server/routes/ctktkt-report/export/route"),
  "coal-meter-photos": () => import("@/modules/ctktkt/server/routes/coal-meter-photos/route"),
  "admin/data-backup": () => import("@/modules/ctktkt/server/routes/admin/data-backup/route"),
  "coal-meter-ocr": () => import("@/modules/ctktkt/server/routes/coal-meter-ocr/route"),
  "bcsx-section1-import": () => import("@/modules/ctktkt/server/routes/bcsx-section1-import/route"),
  "bcsx-export": () => import("@/modules/ctktkt/server/routes/bcsx-export/route"),
  "water-report": () => import("@/modules/ctktkt/server/routes/water-report/route"),
  "water-report/leaders": () => import("@/modules/ctktkt/server/routes/water-report/leaders/route"),
  "water-report/compare": () => import("@/modules/ctktkt/server/routes/water-report/compare/route"),
  "water-report/export": () => import("@/modules/ctktkt/server/routes/water-report/export/route"),
  "water-report/upload": () => import("@/modules/ctktkt/server/routes/water-report/upload/route"),
  "google-sheet-sync": () => import("@/modules/ctktkt/server/routes/google-sheet-sync/route"),
  "coal-gemini-settings": () => import("@/modules/ctktkt/server/routes/coal-gemini-settings/route"),
  "coal-gemini-settings/check": () => import("@/modules/ctktkt/server/routes/coal-gemini-settings/check/route"),
  "bcsx-operation-import": () => import("@/modules/ctktkt/server/routes/bcsx-operation-import/route"),
  "operating-events": () => import("@/modules/ctktkt/server/routes/operating-events/route"),
  "ppa-heat-rate": () => import("@/modules/ctktkt/server/routes/ppa-heat-rate/route"),
  "ppa-heat-rate/notes": () => import("@/modules/ctktkt/server/routes/ppa-heat-rate/notes/route"),
  "measurements": () => import("@/modules/ctktkt/server/routes/measurements/route"),
  "shift-readings": () => import("@/modules/ctktkt/server/routes/shift-readings/route"),
  "daily-inputs": () => import("@/modules/ctktkt/server/routes/daily-inputs/route"),
  "bcsx-coal-stock": () => import("@/modules/ctktkt/server/routes/bcsx-coal-stock/route")
};
/**
 * Route đã chuyển về chuẩn web chính (handler tự trả `ok()`/`fail()` của lib/api) — cổng này chỉ ghi audit
 * và đặt Cache-Control, KHÔNG giải mã rồi bọc lại JSON lần nữa. Thêm tên route vào đây khi chuyển đổi xong
 * (docs/ktkt-chuyen-doi.md); phải giữ `npm run test:ctktkt:contract` khớp.
 */
const NATIVE_ENVELOPE_ROUTES = new Set(["chemical-usage", "water-report", "water-report/leaders", "water-report/upload", "daily-inputs", "ppa-heat-rate", "ppa-heat-rate/notes", "google-sheet-sync", "shift-readings", "operating-events", "bcsx-coal-stock", "bcsx-section1-import", "bcsx-operation-import"]);
async function dispatch(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return handle(async () => {
    const path=(await context.params).path?.join("/") ?? "";
    const load=routes[path]; if(!load) return fail("Không tìm thấy chức năng KTKT.",404);
    // API tích hợp, cron và Google Apps Script tự xác thực bearer trong handler.
    const machine = isCtktktMachineEndpoint(new URL(request.url).pathname, request.method);
    const actor = machine ? null : await requireUser();
    if (!machine && !await getSessionUser()) return fail("Không đủ quyền truy cập Chỉ tiêu KTKT.",403);
    if (!["GET","HEAD"].includes(request.method)) {
      if (!isCtktktSameOrigin(request)) return fail("Nguồn yêu cầu không hợp lệ.",403);
    }
    // Quét tệp trước khi parser Excel/ZIP hoặc AI xử lý byte người dùng gửi lên.
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if(Number(request.headers.get("content-length") ?? 0)>32*1024*1024) return fail("Tệp tải lên quá lớn.",413);
      const form=await request.clone().formData();
      for(const [,value] of form) if(value instanceof File) {
        if(value.size>25*1024*1024) return fail("Tệp tải lên quá lớn.",413);
        await inspectUpload(Buffer.from(await value.arrayBuffer()),{fileName:value.name,kinds:["zip","ole"],label:"Excel hoặc ZIP"});
      }
    }
    const handlers=await load();
    const handler=handlers[request.method as Method]; if(!handler) return fail("Phương thức không được hỗ trợ.",405);
    const response=await handler(request);
    if(machine) return response; // Giữ hợp đồng JSON gốc cho các hệ thống gọi API.
    if(path === "permissions") { response.headers.set("Cache-Control", "private, no-store"); return response; }
    if(actor && path !== "permissions" && response.ok && !["GET","HEAD"].includes(request.method)) await audit(actor.id,"UPDATE_CTKTKT","Ctktkt",undefined,`${request.method} ${path}`);
    if(NATIVE_ENVELOPE_ROUTES.has(path)) { response.headers.set("Cache-Control","private, no-store"); return response; }
    if(response.status===304 || response.headers.has("Content-Disposition") || !response.headers.get("Content-Type")?.includes("application/json")) return response;
    const body=await response.json();
    if(!response.ok || body?.error) return fail(body?.error || "Thao tác KTKT thất bại.",response.ok?400:response.status);
    const result=ok(body); result.headers.set("Cache-Control","private, no-store");
    return result;
  });
}
export const GET=dispatch;
export const POST=dispatch;
export const PUT=dispatch;
export const PATCH=dispatch;
export const DELETE=dispatch;
