import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { permitText } from "@/lib/server/work-permits";
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
