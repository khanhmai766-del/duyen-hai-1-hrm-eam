import { NKVH_PCT_PAGES } from "./constants";

export const NKVH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseNkvhLinkUpdate(body: Record<string, unknown>) {
  if (Object.keys(body).some(key => !["version", "nkvhPctId"].includes(key))) throw new Error("Chỉ được cập nhật liên kết NKVH, không thay đổi thông tin cấp phiếu.");
  if (!Number.isInteger(body.version) || Number(body.version) < 1) throw new Error("Phiên bản PCT không hợp lệ.");
  if (body.nkvhPctId !== null && (typeof body.nkvhPctId !== "string" || !NKVH_UUID.test(body.nkvhPctId))) throw new Error("ID phiếu NKVH không hợp lệ.");
  return { version: Number(body.version), nkvhPctId: typeof body.nkvhPctId === "string" ? body.nkvhPctId.toLowerCase() : null };
}
export function nkvhPctUrl(kind: string, id?: string | null) {
  const url = new URL(NKVH_PCT_PAGES[kind === "ELECTRICAL" ? "DIEN" : "TCNH"].url);
  if (id && NKVH_UUID.test(id)) {
    url.pathname += "_ct";
    url.searchParams.set("id_pct", id);
  }
  return url.toString();
}
export function parseNkvhPctLink(value: string, kind: string): string | null {
  if (!value.trim()) return null;
  const expected = new URL(nkvhPctUrl(kind));
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Vui lòng dán đường link chi tiết phiếu NKVH hợp lệ."); }
  const ids = url.searchParams.getAll("id_pct");
  if (!["http:", "https:"].includes(url.protocol) || url.host !== expected.host || url.username || url.password || url.pathname !== `${expected.pathname}_ct` || ids.length !== 1 || !NKVH_UUID.test(ids[0])) {
    throw new Error("Link phải là phiếu NKVH đúng loại Cơ/Điện đã chọn và có id_pct hợp lệ.");
  }
  return ids[0].toLowerCase();
}
