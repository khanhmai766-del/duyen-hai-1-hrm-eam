const WORK_PERMIT_QR_PATH = /^\/work-permits\/([^/]+)\/lam-viec\/?$/;

export type WorkPermitQrTarget = { id: string };

/** Ảnh trong margin box có kích thước nội tại 25 mm, không phụ thuộc tùy chọn in hình nền. */
export function workPermitQrPrintImage(pngDataUrl: string) {
  if (/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/.test(pngDataUrl)) return pngDataUrl;
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(pngDataUrl)) throw new Error("Ảnh QR không hợp lệ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="25mm" height="25mm" viewBox="0 0 600 600"><image width="600" height="600" href="${pngDataUrl}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** QR chỉ mang đường dẫn ổn định; số phiếu và nội dung được in bằng chữ cạnh mã. */
export function workPermitQrValue(id: string, origin?: string | null) {
  const path = `/work-permits/${encodeURIComponent(id)}/lam-viec?open=1`;
  const base = (origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://duyenhai1.vn").trim().replace(/\/+$/, "");
  return `${base}${path}`;
}

/** Nhận đúng đường dẫn màn hình làm việc; không tin host hay tham số do mã QR cung cấp. */
export function parseWorkPermitQrValue(rawValue: unknown): WorkPermitQrTarget | null {
  const raw = String(rawValue ?? "").trim();
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw, "https://qr.invalid");
    const match = url.pathname.match(WORK_PERMIT_QR_PATH);
    if (!match) return null;
    const id = decodeURIComponent(match[1]);
    return /^[A-Za-z0-9_-]{10,100}$/.test(id) ? { id } : null;
  } catch {
    return null;
  }
}
