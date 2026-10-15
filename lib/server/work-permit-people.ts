import { createHash } from "node:crypto";
import type { WorkPermitPerson } from "@prisma/client";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { cardlessCode, isCardlessCode, parseCardQr, SCTX_CARD_SUFFIX, sctxCardCode } from "@/lib/work-permit-card";
import { prisma } from "@/lib/prisma";
import { presentMembers, samePermitWorker } from "@/lib/work-permit-presence";
import { s3ProxyUrl } from "@/lib/s3";
import { permitText } from "@/lib/server/work-permits";
import { PERMIT_CONTRACTOR_SCOPES } from "@/lib/work-permits";

/** Cột thông tin thẻ (đồng bộ từ Google Sheets) trả kèm hồ sơ người. */
export const personCardSelect = {
  scope: true, birthYear: true, jobTitle: true, workPackage: true, workPosition: true, workArea: true, trainingResult: true,
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
  if (code && !/^[\p{L}\p{N}][\p{L}\p{N}\/._-]{0,79}$/u.test(code)) throw fail("Số thẻ ra vào cổng gồm tối đa 80 ký tự: chữ, số, dấu /, chấm, gạch ngang hoặc gạch dưới");
  if (!name || !company) throw fail("Vui lòng nhập họ tên và đơn vị nhà thầu");
  if (typeof body.canCommand !== "boolean" || typeof body.isActive !== "boolean") throw fail("Vai trò hoặc tình trạng hoạt động không hợp lệ");
  // SĐT nhận cả dạng có dấu cách, dấu chấm hoặc đầu +84 vì danh sách nhà thầu gửi sang mỗi nơi ghi một kiểu.
  if (phone && !/^[+()\d][\d\s.()-]{5,39}$/.test(phone)) throw fail("Số điện thoại chỉ gồm chữ số và các dấu + ( ) - . khoảng trắng");
  // Dùng cùng mã tạm theo họ tên như danh bạ đồng bộ khi chưa được cấp thẻ.
  const personCode = code || cardlessCode(name);
  if (!personCode) throw fail("Vui lòng nhập họ tên có chữ hoặc số để lưu hồ sơ chưa có thẻ");
  // Nhóm SCTX / Đại tu: không gửi thì giữ nhóm hiện có (sửa) hoặc nhận mặc định SCTX của DB (thêm mới).
  const scope = body.scope === undefined ? undefined : String(body.scope);
  if (scope !== undefined && !Object.hasOwn(PERMIT_CONTRACTOR_SCOPES, scope)) throw fail("Nhóm nhân sự không hợp lệ");
  return { code: personCode, name, company, phone, canCommand: body.canCommand, isActive: body.isActive, ...(scope ? { scope } : {}), searchText: normalizeText([personCode, name, company, phone].join(" ")) };
}

/**
 * Tra một thẻ vừa quét: nội dung QR (link ?id= hoặc số thẻ trơn) → hồ sơ + ảnh + các lần làm việc đang mở của người đó.
 * Tra đúng số thẻ (khoá duy nhất) nên nhanh, không phụ thuộc Google Sheets. `null` = nội dung không phải mã thẻ.
 * Dùng chung cho hộp quét thẻ của PCT (/api/work-permits/people/card) và nút "Quét QR" chung (/api/device-qr/resolve).
 */
export async function lookupPermitCardPerson(raw: string, scope?: string | null) {
  const code = parseCardQr(raw);
  if (!code) return null;
  const select = { id: true, code: true, name: true, company: true, phone: true, canCommand: true, isActive: true, version: true, ...personCardSelect } as const;
  // Thẻ SCTX in số trơn nhưng lưu kèm "/SXKD": quét trong PCT SCTX thì thử số + "/SXKD" trước; nơi khác thử số trơn trước
  // (thẻ Đại tu), không có thì thử bản "/SXKD". QR người chưa có thẻ mang họ tên → thử tiếp mã tạm HL-….
  const tries = isCardlessCode(code) || code.endsWith(SCTX_CARD_SUFFIX) ? [code]
    : scope === "SCTX" ? [sctxCardCode(code), code] : [code, sctxCardCode(code)];
  let person = null;
  for (const candidate of tries) { person = await prisma.workPermitPerson.findUnique({ where: { code: candidate }, select }); if (person) break; }
  person ??= isCardlessCode(code) ? null : await prisma.workPermitPerson.findUnique({ where: { code: cardlessCode(code) }, select });
  if (!person) return { code, person: null };
  const sessions = await prisma.workPermitSession.findMany({
    where: { endedAt: null },
    select: { id: true, commanderId: true, members: true, openedAt: true, permit: { select: { id: true, number: true, nkvhNumber: true, year: true, kind: true } } },
    orderBy: { openedAt: "asc" },
  });
  return { code, person: { ...withPhotoUrl(person), activeWorks: sessions.filter(s => s.commanderId === person.id || presentMembers(s.members).some(member => samePermitWorker(member, { personId: person.id, code: person.code, name: person.name, company: person.company }))).map(s => ({
    sessionId: s.id, role: s.commanderId === person.id ? "CHTT" as const : "MEMBER" as const, openedAt: s.openedAt, permit: s.permit,
  })) } };
}
