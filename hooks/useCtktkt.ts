"use client";
import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiReportResponse } from "@/lib/fetcher";

/** Giữ API Response của báo cáo nguồn, đưa mọi lần đọc/ghi qua TanStack Query của EAM. */
export function useCtktktRequest(): typeof fetch {
  const client = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: ({ input, init }: { input: RequestInfo | URL; init?: RequestInit }) => apiReportResponse(input, init),
    onSuccess: async response => { if (response.ok) await client.invalidateQueries({ queryKey: ["ctktkt"] }); },
  });
  return useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if(init?.signal?.aborted) throw new DOMException("Đã hủy yêu cầu.","AbortError");
    if (method.toUpperCase() !== "GET") return mutateAsync({ input, init });
    // File tải về và yêu cầu ngoài ứng dụng không được giữ trong bộ nhớ cache báo cáo.
    if (!url.startsWith("/api/ctktkt/") || /(?:export|data-backup|setup)(?:\?|$|\/)/.test(url)) return apiReportResponse(input, init);
    const response = await client.fetchQuery({
      queryKey: ["ctktkt", url], staleTime: 0, gcTime: 60_000, retry: false,
      // Một lần đọc có thể được nhiều bảng dùng chung. Không để controller của một bảng
      // huỷ truy vấn đang được bảng khác chờ (đặc biệt khi đổi khoảng ngày qua nhiều tháng).
      queryFn: ({ signal }) => apiReportResponse(input, { ...init, signal }),
    });
    if(init?.signal?.aborted) throw new DOMException("Đã hủy yêu cầu.","AbortError");
    return response.clone();
  }, [client, mutateAsync]);
}

export function useCtktktDownload() {
  const request=useCtktktRequest();
  return useCallback(async(url:string)=>{
    const response=await request(url);
    if(!response.ok){const body=await response.json().catch(()=>({error:"Không tải được báo cáo."}));throw new Error(body.error||"Không tải được báo cáo.");}
    const blob=await response.blob(),href=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=href;link.download=/filename="([^"]+)"/.exec(response.headers.get("Content-Disposition")??"")?.[1]??"bao-cao.xlsx";
    link.click();window.setTimeout(()=>URL.revokeObjectURL(href),10_000);
  },[request]);
}
