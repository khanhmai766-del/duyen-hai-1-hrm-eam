import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { permitText } from "@/lib/server/work-permits";
export function parsePermitPerson(body: Record<string, unknown>) {
  const code = permitText(body, "code", 80).normalize("NFC").toUpperCase();
  const name = permitText(body, "name"), company = permitText(body, "company");
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\/._-]{0,79}$/u.test(code)) throw fail("Số thẻ an toàn gồm tối đa 80 ký tự: chữ, số, dấu /, chấm, gạch ngang hoặc gạch dưới");
  if (!name || !company) throw fail("Vui lòng nhập họ tên và đơn vị nhà thầu");
  if (typeof body.canCommand !== "boolean" || typeof body.isActive !== "boolean") throw fail("Vai trò hoặc tình trạng hoạt động không hợp lệ");
  return { code, name, company, canCommand: body.canCommand, isActive: body.isActive, searchText: normalizeText([code, name, company].join(" ")) };
}
