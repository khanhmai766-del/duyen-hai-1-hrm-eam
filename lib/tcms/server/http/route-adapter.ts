import { getRequestContext } from "./request-context";
import { apiError } from "./api-response";
import { handle, ok, fail, audit } from "@/lib/api";

/** Adapt the imported contract API to the website's data/meta/error envelope. */
export function adaptTcmsRoute<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return (...args: A) => handle(async () => {
    const request = args[0] as Request;
    let response: Response;
    try {
      const context = await getRequestContext(request);
      response = await handler(...args);
      if (response.ok && !["GET", "HEAD"].includes(request.method)) {
        await audit(context.websiteUserId, request.method, "ContractManagement", undefined, new URL(request.url).pathname);
      }
    } catch (error) {
      response = apiError(error);
    }
    const body = await response.json();
    if (body && "data" in body && "error" in body) return Response.json(body, { status: response.status });
    if (!response.ok) {
      const message = body.message ?? (response.status === 404 ? "Không tìm thấy dữ liệu." : "Không thể thực hiện thao tác.");
      return fail(message, response.status);
    }
    const result = ok(body);
    return new Response(result.body, { status: response.status, headers: { ...Object.fromEntries(result.headers), "cache-control": "no-store" } });
  });
}
