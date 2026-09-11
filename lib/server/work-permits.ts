import { Prisma } from "@prisma/client";
import { fail, handle } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { OPERATION_POSITION_TITLES } from "@/lib/positions";
import { formatPermitNumber, PERMIT_DISCIPLINES, PERMIT_FORMATS, defaultPermitFormat, PERMIT_KINDS, PERMIT_WORK_TYPES, PERMIT_STATUSES, PERMIT_UNITS, type PermitStatus } from "@/lib/work-permits";

export function permitHandle(fn: () => Promise<Response>) {
  return handle(async () => {
    try { return await fn(); } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002" && String(e.meta?.modelName ?? "").includes("WorkPermitSession")) return fail("CHTT hoặc PCT đang có một lần làm việc chưa kết thúc. Vui lòng tải lại để kiểm tra.", 409);
        if (e.code === "P2002") return fail("Số PCT đang được sử dụng trong loại và năm này.", 409);
        if (e.code === "P2021" || e.code === "P2022") return fail("Sổ cấp PCT chưa được khởi tạo. Vui lòng liên hệ quản trị để mở sổ.", 503);
      }
      throw e;
    }
  });
}
export async function permitBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw fail("Dữ liệu phiếu không hợp lệ"); }
}
export function permitText(body: Record<string, unknown>, key: string, max = 200) {
  const v = body[key] ?? "";
  if (typeof v !== "string" || v.length > max) throw fail(`Thông tin không hợp lệ hoặc vượt quá ${max} ký tự`);
  return v.trim();
}
export function isPermitDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function permitInstant(body: Record<string, unknown>, key: string) {
  const value = permitText(body, key, 40);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) || !isPermitDay(value.slice(0, 10))) throw fail("Ngày giờ không hợp lệ");
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59) throw fail("Giờ hoặc phút không hợp lệ");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw fail("Ngày giờ không hợp lệ");
  return date;
}
export function parsePermit(body: Record<string, unknown>, status: PermitStatus) {
  const kind = permitText(body, "kind"), unit = permitText(body, "unit"), workDate = permitText(body, "workDate");
  if (!Object.hasOwn(PERMIT_KINDS, kind) || !Object.hasOwn(PERMIT_UNITS, unit)) throw fail("Loại PCT hoặc tổ máy không hợp lệ");
  const year = Number(body.year), number = permitText(body, "number", 80).toUpperCase().replace(/\s+/g, "");
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !number) throw fail("Vui lòng nhập số PCT và năm cấp số hợp lệ");
  if (!isPermitDay(workDate)) throw fail("Ngày thực hiện không hợp lệ");
  const count = body.workerCount === null || body.workerCount === "" || body.workerCount === undefined ? null : Number(body.workerCount);
  if (body.teamType !== "CONTRACTOR" && count !== null && (!Number.isInteger(count) || count < 1 || count > 10000)) throw fail("Số nhân viên phải là số nguyên từ 1 đến 10.000");
  const teamType = permitText(body, "teamType");
  if (!["INTERNAL", "CONTRACTOR"].includes(teamType)) throw fail("Loại đơn vị không hợp lệ");
  const format = permitText(body, "format", 20) || defaultPermitFormat(teamType);
  if (!Object.hasOwn(PERMIT_FORMATS, format)) throw fail("Hình thức phiếu phải là PCT giấy hoặc PCT điện tử");
  const workType = permitText(body, "workType", 20) || null;
  if (workType && !Object.hasOwn(PERMIT_WORK_TYPES, workType)) throw fail("Phân loại công việc phải là Kế hoạch (KH), Đột xuất (ĐX) hoặc Sự cố (SC)");
  const position = permitText(body, "position");
  if (position && !OPERATION_POSITION_TITLES.some(value => value === position)) throw fail("Cương vị không có trong danh mục của phân xưởng");
  const disciplines = body.disciplines ?? [];
  if (!Array.isArray(disciplines) || disciplines.length > 4 || disciplines.some(v => typeof v !== "string" || !Object.hasOwn(PERMIT_DISCIPLINES, v)) || new Set(disciplines).size !== disciplines.length) throw fail("Chuyên môn phải thuộc Thủy, Cơ, Nhiệt hoặc Hóa và không được lặp");
  if (kind !== "MECHANICAL" && disciplines.length) throw fail("Chuyên môn Thủy/Cơ/Nhiệt/Hóa chỉ áp dụng cho sổ Cơ – Nhiệt – Hóa");
  const data = {
    registrationNumber: permitText(body, "registrationNumber", 200), workScope: permitText(body, "workScope", 5000),
    plannedStartAt: permitInstant(body, "plannedStartAt"), plannedEndAt: permitInstant(body, "plannedEndAt"), disciplines: disciplines as string[],
    format, workType, kind, unit, year, number, position, workDate, workerCount: count, teamType,
    issuerUserId: permitText(body, "issuerUserId", 100) || null,
    commanderPersonId: permitText(body, "commanderPersonId", 100) || null,
    members: parsePermitMembers(body.members),
    content: permitText(body, "content", 5000), location: permitText(body, "location", 500),
    issuerName: permitText(body, "issuerName"), electricalSafetySupervisorName: permitText(body, "electricalSafetySupervisorName"), leaderName: permitText(body, "leaderName"),
    commanderName: permitText(body, "commanderName"), teamName: permitText(body, "teamName"),
    authorizerName: permitText(body, "authorizerName"), result: permitText(body, "result", 5000),
    note: permitText(body, "note", 5000), statusReason: permitText(body, "statusReason", 2000),
    repairRequestNumber: permitText(body, "repairRequestNumber", 100),
    issuedAt: permitInstant(body, "issuedAt"), authorizedAt: permitInstant(body, "authorizedAt"), closedAt: permitInstant(body, "closedAt"),
  };
  if (data.plannedStartAt && data.plannedEndAt && data.plannedEndAt < data.plannedStartAt) throw fail("Thời gian dự kiến kết thúc phải từ thời gian dự kiến bắt đầu trở đi");
  if (teamType === "CONTRACTOR") {
    data.members = data.members.filter(member => !member.personId || member.personId !== data.commanderPersonId);
    data.workerCount = data.commanderName ? 1 + data.members.length : null;
  } else if (data.members.length) data.workerCount = data.members.length;
  if (!data.content) throw fail("Vui lòng nhập nội dung công việc");
  if (["ISSUED", "ACTIVE", "PAUSED", "WAITING", "CLOSED"].includes(status) && (!data.issuerName || !data.issuedAt || !data.commanderName || !data.teamName || (teamType !== "CONTRACTOR" && !data.workerCount))) throw fail("Để ghi cấp phiếu, cần người cấp, thời điểm cấp, chỉ huy trực tiếp, đơn vị và số nhân viên");
  if (["ACTIVE", "PAUSED", "WAITING", "CLOSED"].includes(status) && (!data.authorizerName || !data.authorizedAt)) throw fail("Vui lòng ghi người và thời điểm cho phép làm việc");
  if (["PAUSED", "CANCELLED"].includes(status) && !data.statusReason) throw fail("Vui lòng nhập lý do tạm dừng hoặc hủy phiếu");
  if (status === "CLOSED" && (!data.result || !data.closedAt)) throw fail("Vui lòng nhập kết quả và thời điểm đóng phiếu");
  if (status === "DRAFT" && (data.issuedAt || data.authorizedAt || data.closedAt)) throw fail("Phiếu nháp chưa ghi thời điểm cấp hoặc thực hiện");
  if (status === "ISSUED" && data.authorizedAt) throw fail("Chọn Đang thực hiện khi ghi nhận thời điểm cho phép làm việc");
  if (status !== "CLOSED" && data.closedAt) throw fail("Chỉ ghi thời điểm đóng khi chọn Đã đóng");
  if (data.issuedAt && Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(data.issuedAt)) !== year) throw fail("Năm cấp số phải khớp năm của thời điểm cấp phiếu");
  if (data.authorizedAt && (!data.issuedAt || data.authorizedAt < data.issuedAt)) throw fail("Thời điểm cho phép làm việc phải từ thời điểm cấp trở đi");
  if (data.closedAt && (!data.authorizedAt || data.closedAt < data.authorizedAt)) throw fail("Thời điểm đóng phải từ thời điểm cho phép làm việc trở đi");
  return { ...data, searchText: normalizeText([number, formatPermitNumber({ number, year }), data.position, data.content, data.location, data.issuerName, data.electricalSafetySupervisorName, data.commanderName, data.leaderName, data.authorizerName, data.teamName, data.repairRequestNumber, data.registrationNumber, data.workScope, data.note].join(" ")) };
}
export function permitFilters(
  req: Request,
  options: { includeClosedByDefault?: boolean } = {}
): Prisma.WorkPermitWhereInput {
  const p = new URL(req.url).searchParams;
  const kind = p.get("kind") || "MECHANICAL", status = p.get("status") || "";
  if (!Object.hasOwn(PERMIT_KINDS, kind)) throw fail("Loại PCT không hợp lệ");
  if (status && status !== "OPEN" && !Object.hasOwn(PERMIT_STATUSES, status)) throw fail("Trạng thái không hợp lệ");
  const unit = p.get("unit") || "", position = p.get("position") || "", from = p.get("from") || "", to = p.get("to") || "";
  if (unit && !Object.hasOwn(PERMIT_UNITS, unit)) throw fail("Tổ máy không hợp lệ");
  if (position && !OPERATION_POSITION_TITLES.some(value => value === position)) throw fail("Cương vị không hợp lệ");
  if ((from && !isPermitDay(from)) || (to && !isPermitDay(to)) || (from && to && from > to)) throw fail("Khoảng ngày không hợp lệ");
  const teamType = p.get("teamType") || "";
  if (teamType && !["INTERNAL", "CONTRACTOR"].includes(teamType)) throw fail("Loại đơn vị không hợp lệ");
  const workType = p.get("workType") || "";
  if (workType && workType !== "UNCLASSIFIED" && !Object.hasOwn(PERMIT_WORK_TYPES, workType)) throw fail("Phân loại công việc không hợp lệ");
  const q = p.get("q") || "";
  if (q.length > 200) throw fail("Từ khóa quá dài");
  return { kind, ...(workType ? { workType: workType === "UNCLASSIFIED" ? null : workType } : {}), ...(teamType ? { teamType } : {}), ...(unit ? { unit } : {}), ...(position ? { position } : {}),
    ...(status
      ? { status: status === "OPEN" ? { notIn: ["CLOSED", "CANCELLED"] } : status }
      : { status: options.includeClosedByDefault ? { not: "CANCELLED" } : { notIn: ["CLOSED", "CANCELLED"] } }),
    ...(from || to ? { workDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q.trim() ? { OR: [{ searchText: { contains: permitSearchTerm(q) } }, { sessions: { some: { searchText: { contains: permitSearchTerm(q) } } } }] } : {}),
  };
}
export function permitSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}


export function parsePermitMembers(value: unknown): Array<{ personId?: string; code: string; name: string; company: string }> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200) throw fail("Danh sách nhân viên phải có tối đa 200 người");
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw fail("Thông tin nhân viên không hợp lệ");
    const personId = permitText(item, "personId", 100), code = permitText(item, "code", 80);
    const name = permitText(item, "name"), company = permitText(item, "company");
    if (!name) throw fail("Vui lòng nhập họ tên cho tất cả nhân viên");
    const key = personId || (code ? `code:${code.toUpperCase()}` : "");
    if (key && seen.has(key)) throw fail("Một nhân viên đang được chọn nhiều lần trong danh sách");
    if (key) seen.add(key);
    return { ...(personId ? { personId } : {}), code, name, company };
  });
}

/** Prisma contains dùng LIKE; mã người/số phiếu có _ và % phải được tìm nguyên văn. */
export function permitSearchTerm(value: string) {
  return normalizeText(value.trim()).replace(/[\\%_]/g, "\\$&");
}
