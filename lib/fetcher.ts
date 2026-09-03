import type { ApiResponse } from "@/types";

/**
 * Đọc phong bì `{ data, meta, error }` của API.
 *
 * KHÔNG gọi thẳng `res.json()`: mọi tầng NGOÀI ứng dụng đều trả HTML chứ không trả JSON —
 * nginx chặn body quá lớn (413), nginx hết giờ chờ (504), tiến trình chết (502), phiên đăng
 * nhập hết hạn nên middleware đá sang trang /login. Gọi `res.json()` lúc đó ném đúng một
 * câu khó hiểu: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` — người dùng
 * tưởng mình gõ nhầm ký tự đặc biệt, còn người sửa thì không biết hỏng ở tầng nào.
 *
 * Vì vậy: đọc ra text trước, parse sau; parse hỏng thì dựng câu tiếng Việt kèm MÃ LỖI HTTP
 * để biết ngay phải đi xem nginx, xem log ứng dụng hay chỉ cần đăng nhập lại.
 */
async function readEnvelope<T>(res: Response, fallback: string): Promise<ApiResponse<T>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    throw new Error(describeNonJson(res, text, fallback));
  }
}

function describeNonJson(res: Response, text: string, fallback: string): string {
  // Bị đá về trang đăng nhập: fetch tự đi theo redirect nên ta chỉ thấy HTML của /login.
  if (res.redirected && /\/login/.test(res.url)) {
    return "Phiên đăng nhập đã hết hạn. Hãy tải lại trang và đăng nhập lại rồi thao tác lại.";
  }
  switch (res.status) {
    case 413:
      return "Dữ liệu gửi lên quá lớn nên bị máy chủ web chặn (413). Với ảnh, hãy chụp/chọn ảnh nhẹ hơn rồi thử lại.";
    case 502:
    case 503:
      return `Máy chủ ứng dụng không phản hồi (${res.status}). Hãy thử lại sau ít phút hoặc báo quản trị kiểm tra dịch vụ.`;
    case 504:
      return "Máy chủ xử lý quá lâu nên bị ngắt (504). Thao tác có thể chưa được lưu — hãy tải lại trang để kiểm tra trước khi làm lại.";
    default:
      break;
  }
  if (/<!doctype|<html/i.test(text.slice(0, 200))) {
    return `Máy chủ trả về trang web thay vì dữ liệu (mã ${res.status}). Hãy tải lại trang; nếu vẫn lỗi, báo quản trị kèm mã này.`;
  }
  return res.ok ? fallback : `${fallback} (mã ${res.status})`;
}

export async function apiGet<T>(url: string): Promise<{ data: T; meta: any }> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const json = await readEnvelope<T>(res, "Lỗi tải dữ liệu");
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
  const json = await readEnvelope<T>(res, "Thao tác thất bại");
  if (!res.ok || json.error) throw new Error(json.error || "Thao tác thất bại");
  return json.data as T;
}

export async function apiDownload(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message: string | null = null;
    try {
      message = (JSON.parse(text) as ApiResponse<unknown>).error ?? null;
    } catch {
      message = describeNonJson(res, text, "Không thể tải tệp");
    }
    throw new Error(message || "Không thể tải tệp");
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "download.xlsx";
  return { blob: await res.blob(), filename };
}

export async function apiUpload<T>(url: string, formData: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: formData });
  const json = await readEnvelope<T>(res, "Tải tệp thất bại");
  if (!res.ok || json.error) throw new Error(json.error || "Tải tệp thất bại");
  return json.data as T;
}
