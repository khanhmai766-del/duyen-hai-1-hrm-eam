import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { effectivePermitFormat, PERMIT_KINDS } from "@/lib/work-permits";
import { SAFETY_MAX_ROWS, type SafetySelection } from "@/lib/work-permit-safety";
import { permitText } from "@/lib/server/work-permits";

export function parseSafetyItem(body: Record<string, unknown>) {
  const kind = permitText(body, "kind");
  if (!Object.hasOwn(PERMIT_KINDS, kind)) throw fail("Loại PCT không hợp lệ");
  const hazard = permitText(body, "hazard", 1000);
  const measure = permitText(body, "measure", 5000), source = permitText(body, "source", 500);
  if (!measure || !hazard) throw fail("Vui lòng nhập đủ mối nguy và biện pháp an toàn");
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") throw fail("Trạng thái biện pháp không hợp lệ");
  return { kind, hazard, measure, source, isActive: body.isActive !== false, searchText: normalizeText([hazard, measure, source].join(" ")) };
}

/** Sao chép nội dung đã chọn lên phiếu; không đọc động danh mục khi xem/in phiếu cũ. */
export async function resolvePermitSafety(tx: Prisma.TransactionClient, body: Record<string, unknown>, before?: { safetyItems: Prisma.JsonValue; kind: string }) {
  if (body.kind === "ELECTRICAL") {
    if (Array.isArray(body.safetyItems) && body.safetyItems.length) throw fail("PCT Điện tạm thời không điền sẵn mối nguy và biện pháp an toàn");
    return [];
  }
  if (body.safetyItems === undefined) {
    if (before && body.kind !== before.kind && Array.isArray(before.safetyItems) && before.safetyItems.length) throw fail("Vui lòng bỏ biện pháp cũ trước khi đổi loại PCT");
    body = { ...body, safetyItems: before?.safetyItems ?? [] };
  }
  if (effectivePermitFormat({ format: typeof body.format === "string" ? body.format : null, teamType: String(body.teamType) }) !== "PAPER" && Array.isArray(body.safetyItems) && body.safetyItems.length) throw fail("Mối nguy và biện pháp an toàn chỉ áp dụng cho PCT giấy");
  if (!Array.isArray(body.safetyItems) || body.safetyItems.length > SAFETY_MAX_ROWS) throw fail(`Chỉ chọn tối đa ${SAFETY_MAX_ROWS} biện pháp cho một phiếu`);
  const seen = new Set<string>();
  const rows: SafetySelection[] = body.safetyItems.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw fail("Biện pháp đã chọn không hợp lệ");
    const sourceId = permitText(value, "sourceId", 100), hazard = permitText(value, "hazard", 1000);
    const measure = permitText(value, "measure", 5000);
    if (!measure || !hazard) throw fail("Vui lòng nhập đầy đủ mối nguy và biện pháp đã chọn");
    if (sourceId && seen.has(sourceId)) throw fail("Một biện pháp đang được chọn nhiều lần");
    if (sourceId) seen.add(sourceId);
    if (typeof value.forAuthorization !== "boolean" || typeof value.forExecution !== "boolean") throw fail("Vui lòng chọn đơn vị thực hiện biện pháp");
    if (!value.forAuthorization && !value.forExecution && body.status !== "DRAFT") throw fail("Mỗi biện pháp cần phân công cho đơn vị cho phép hoặc đơn vị công tác trước khi cấp phiếu");
    return { ...(sourceId ? { sourceId } : {}), hazard, measure, forAuthorization: value.forAuthorization, forExecution: value.forExecution };
  });
  const sources = seen.size ? await tx.workPermitSafetyMeasure.findMany({ where: { id: { in: [...seen] } }, select: { id: true, kind: true, isActive: true } }) : [];
  const previous = before && before.kind === body.kind && Array.isArray(before.safetyItems) ? before.safetyItems as unknown as SafetySelection[] : [];
  for (const row of rows) {
    if (!row.sourceId) continue;
    const source = sources.find(s => s.id === row.sourceId);
    if (!source || source.kind !== body.kind) throw fail("Biện pháp không thuộc loại PCT đã chọn. Vui lòng chọn lại.");
    if (!source.isActive && !previous.some(s => s.sourceId === row.sourceId)) throw fail("Biện pháp vừa ngừng sử dụng. Vui lòng chọn lại.", 409);
  }
  return rows;
}
