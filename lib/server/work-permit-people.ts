import { createHash } from "node:crypto";
import type { WorkPermitPerson } from "@prisma/client";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { s3ProxyUrl } from "@/lib/s3";
import { permitText } from "@/lib/server/work-permits";

/** Cột thông tin thẻ (đồng bộ từ Google Sheets) trả kèm hồ sơ người. */
export const personCardSelect = {
  birthYear: true, jobTitle: true, workPackage: true, workPosition: true, workArea: true, trainingResult: true,
  trainedAt: true, cardIssuedAt: true, cardExpiresAt: true, photoKey: true, photoSource: true,
} as const;

/**
 * Ảnh thẻ qua proxy /api/files/s3 (bucket không mở đọc công khai). Key ảnh cố định theo số thẻ và bị ghi
 * đè khi đồng bộ lại → gắn `v` theo nguồn ảnh để trình duyệt không giữ ảnh cũ trong cache.
 */
export function withPhotoUrl<T extends Partial<Pick<WorkPermitPerson, "photoKey" | "photoSource">>>(person: T) {
  const { photoKey, photoSource, ...rest } = person;
  const version = createHash("md5").update(photoSource ?? "").digest("hex").slice(0, 8);
  return { ...rest, photoUrl: photoKey ? `${s3ProxyUrl(photoKey)}&v=${version}` : null };
}
export function parsePermitPerson(body: Record<string, unknown>) {
  const code = permitText(body, "code", 80).normalize("NFC").toUpperCase();
  const name = permitText(body, "name"), company = permitText(body, "company"), phone = permitText(body, "phone", 40);
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\/._-]{0,79}$/u.test(code)) throw fail("Số thẻ an toàn gồm tối đa 80 ký tự: chữ, số, dấu /, chấm, gạch ngang hoặc gạch dưới");
  if (!name || !company) throw fail("Vui lòng nhập họ tên và đơn vị nhà thầu");
  if (typeof body.canCommand !== "boolean" || typeof body.isActive !== "boolean") throw fail("Vai trò hoặc tình trạng hoạt động không hợp lệ");
  // SĐT nhận cả dạng có dấu cách, dấu chấm hoặc đầu +84 vì danh sách nhà thầu gửi sang mỗi nơi ghi một kiểu.
  if (phone && !/^[+()\d][\d\s.()-]{5,39}$/.test(phone)) throw fail("Số điện thoại chỉ gồm chữ số và các dấu + ( ) - . khoảng trắng");
  return { code, name, company, phone, canCommand: body.canCommand, isActive: body.isActive, searchText: normalizeText([code, name, company, phone].join(" ")) };
}
