import type { ApiResponse } from "@/types";

export async function apiGet<T>(url: string): Promise<{ data: T; meta: any }> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || json.error) throw new Error(json.error || "Lỗi tải dữ liệu");
  return { data: json.data as T, meta: json.meta };
}

export async function apiMutate<T>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || json.error) throw new Error(json.error || "Thao tác thất bại");
  return json.data as T;
}
