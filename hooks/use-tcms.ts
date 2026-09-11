"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, apiUpload } from "@/lib/fetcher";

/** Query-backed compatibility transport for the imported contract screens. */
export function useTcmsTransport() {
  const client = useQueryClient();
  return useCallback(async (url: string, init?: RequestInit): Promise<Response> => {
    if (!url.startsWith("/api/tcms/")) throw new Error("Đường dẫn hợp đồng không hợp lệ.");
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET") {
      const data = await client.fetchQuery({
        queryKey: ["tcms", url],
        queryFn: async () => (await apiGet<unknown>(url)).data,
        staleTime: 0,
        retry: false,
      });
      return Response.json(data);
    }
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) throw new Error("Thao tác không hợp lệ.");
    const data = init?.body instanceof FormData
      ? await apiUpload<unknown>(url, init.body)
      : await apiMutate<unknown>(url, method as "POST" | "PUT" | "PATCH" | "DELETE", typeof init?.body === "string" ? JSON.parse(init.body) : undefined);
    await client.invalidateQueries({ queryKey: ["tcms"] });
    return Response.json(data ?? {});
  }, [client]);
}
