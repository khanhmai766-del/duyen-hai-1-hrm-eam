import type { Prisma, WorkPermit } from "@prisma/client";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { NKVH_UUID } from "@/lib/nkvh-pct";
import { OPERATION_POSITION_TITLES } from "@/lib/positions";
import { DEFAULT_INTERNAL_TEAM_NAME } from "@/lib/work-permit-source-fields";
import { CONTRACTOR_PERMIT_TRANSITIONS, formatPermitNumber, PERMIT_DISCIPLINES, PERMIT_KINDS, PERMIT_TRANSITIONS, PERMIT_UNITS, type PermitKind, type PermitStatus } from "@/lib/work-permits";
import { parsePermit, permitSnapshot } from "@/lib/server/work-permits";
import { consumePermitNumberReservation, lockPermitNumberScope, reservePermitNumber } from "@/lib/server/work-permit-number-reservations";

/*
 * Cầu nối tiện ích "Cấp số PCT NKVH" (chrome-extension/nkvh-pct) — CHỈ cho PCT nội bộ điện tử.
 *
 * VHV tạo PCT từ ĐKCT trên NKVH rồi bấm "Lấy số PCT" ngay trên trang NKVH. Tiện ích gửi về đây nội
 * dung đang hiện trên trang (NKVH đã điền sẵn từ ĐKCT) + Tổ máy/Cương vị VHV chọn; server lấy số tiếp
 * theo của đúng sổ Cơ/Điện bằng CÙNG đường giữ số với nút "Lấy số PCT" trên sổ — nên phiếu giấy lấy
 * sau luôn nhảy qua số này — rồi ghi phiếu vào sổ kèm liên kết NKVH (id_pct).
 *
 * Một phiếu NKVH (id_pct) chỉ nhận MỘT số: gọi lại (bấm hai lần, tải lại trang) trả về chính số cũ.
 * Việc kiểm tra "đã có số chưa" chạy sau khi khoá dãy số của sổ, nên hai lần bấm đồng thời không thể
 * cùng lấy số. Không có chỉ mục duy nhất trên nkvhPctId nên khoá này là hàng rào duy nhất.
 *
 * Phiếu ra sai: trang phiếu đã hủy trên NKVH → "Báo hủy về sổ" (cancelNkvhPermit): phiếu sổ chuyển
 * Hủy, lý do lấy nguyên dòng "Phiếu đã hủy. Lý do: …" của NKVH. Số đó bị bỏ; phiếu tạo lại trên NKVH
 * lấy số mới như mọi phiếu khác.
 */
const CLASSIFICATIONS: Record<string, "PLANNED" | "OFF_PLAN" | "UNEXPECTED"> = {
  "PLCT.PL.001": "PLANNED", "PLCT.PL.002": "OFF_PLAN", "PLCT.PL.003": "UNEXPECTED",
};
const TEAM_CODES: Record<string, string> = { PCN: DEFAULT_INTERNAL_TEAM_NAME.MECHANICAL, DTD: DEFAULT_INTERNAL_TEAM_NAME.ELECTRICAL };

export type NkvhPage = {
  registrationNumber: string; teamCode: string; teamLabel: string; qlvhCode: string; classification: string; disciplines: string[];
  location: string; content: string; workScope: string; plannedStartAt: string | null; plannedEndAt: string | null;
  commanderName: string; leaderName: string; workerCount: number | null; issuerName: string;
};
type Actor = { id: string; name?: string | null; role?: string | null };
type Tx = Prisma.TransactionClient;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}
/** Nội dung nhiều dòng giữ xuống dòng, chỉ gọn khoảng trắng hai đầu. */
function multiline(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, max) : "";
}
/** NKVH ghi người theo dạng "1386 - Nguyễn Duy Tâm" (mã NV + tên); sổ chỉ lưu tên. */
function personName(value: unknown) {
  return text(value, 200).replace(/^\d{2,}\s*[-–]?\s*/, "").trim();
}
/** Lịch NKVH hiện "dd/MM/yyyy HH:mm:ss" theo giờ Việt Nam → ISO có múi giờ để parsePermit kiểm tra. */
function nkvhInstant(value: unknown) {
  const match = text(value, 40).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, d, m, y, hh = "00", mi = "00", ss = "00"] = match;
  return `${y}-${m}-${d}T${hh}:${mi}:${ss}+07:00`;
}
function vnParts(date: Date) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return { day, year: Number(day.slice(0, 4)) };
}

export function parseNkvhScope(body: Record<string, unknown>) {
  const kind = typeof body.kind === "string" && Object.hasOwn(PERMIT_KINDS, body.kind) ? body.kind as PermitKind : null;
  if (!kind) throw fail("Không xác định được sổ Cơ – Nhiệt – Hóa hay Điện từ trang NKVH");
  const nkvhPctId = typeof body.nkvhPctId === "string" && NKVH_UUID.test(body.nkvhPctId) ? body.nkvhPctId.toLowerCase() : null;
  if (!nkvhPctId) throw fail("Trang NKVH chưa có mã phiếu (id_pct). Hãy mở phiếu từ danh sách PCT trên NKVH.");
  return { kind, nkvhPctId };
}

export function parseNkvhPage(raw: unknown, kind: PermitKind): NkvhPage {
  const page = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const labels = Array.isArray(page.disciplines) ? page.disciplines : [];
  const disciplines = kind === "MECHANICAL"
    ? Object.entries(PERMIT_DISCIPLINES).filter(([, label]) => labels.some(v => normalizeText(String(v)) === normalizeText(label))).map(([key]) => key)
    : [];
  const count = Number(page.workerCount);
  return {
    registrationNumber: text(page.registrationNumber, 200), teamCode: text(page.teamCode, 60), teamLabel: text(page.teamLabel, 200), qlvhCode: text(page.qlvhCode, 60),
    classification: text(page.classification, 40), disciplines,
    location: multiline(page.location, 500), content: multiline(page.content, 5000), workScope: multiline(page.workScope, 5000),
    plannedStartAt: nkvhInstant(page.plannedStartAt), plannedEndAt: nkvhInstant(page.plannedEndAt),
    commanderName: personName(page.commanderName), leaderName: personName(page.leaderName),
    workerCount: page.workerCount !== "" && Number.isInteger(count) && count >= 1 && count <= 10000 ? count : null,
    issuerName: personName(page.issuerName),
  };
}

/** Các trường sổ lấy theo NKVH (NKVH là phiếu chính thức). Trường trống trên NKVH không xoá dữ liệu sổ. */
function pageFields(page: NkvhPage, kind: PermitKind) {
  const sourceClassification = CLASSIFICATIONS[page.classification] ?? null;
  const fields: Record<string, unknown> = {
    registrationNumber: page.registrationNumber,
    teamName: TEAM_CODES[page.teamCode] ?? (page.teamLabel || DEFAULT_INTERNAL_TEAM_NAME[kind]),
  };
  if (sourceClassification) {
    fields.sourceClassification = sourceClassification;
    fields.workType = sourceClassification === "PLANNED" ? "PLANNED" : "UNPLANNED";
  }
  if (page.content) fields.content = page.content;
  if (page.location) fields.location = page.location;
  if (page.workScope) fields.workScope = page.workScope;
  if (kind === "MECHANICAL") fields.disciplines = page.disciplines;
  if (page.plannedStartAt) fields.plannedStartAt = page.plannedStartAt;
  if (page.plannedEndAt) fields.plannedEndAt = page.plannedEndAt;
  if (page.commanderName) fields.commanderName = page.commanderName;
  if (page.leaderName) fields.leaderName = page.leaderName;
  if (page.workerCount) fields.workerCount = page.workerCount;
  return fields;
}

/**
 * Phiếu bị DỪNG trên NKVH (đang thực hiện thì xảy ra sự cố thiết bị / tai nạn lao động) → phiếu sổ
 * chuyển Tạm dừng, lý do "Dừng trên NKVH: …". KHÁC hủy: công việc đã diễn ra nên số được GIỮ, không
 * bỏ. Không ghi Đóng vì Đóng hiểu là làm xong bình thường. Sau đó sổ vẫn Đóng/Hủy được như mọi phiếu
 * nội bộ (PAUSED → CLOSED/CANCELLED). Gọi lại khi sổ đã Tạm dừng thì trả về phiếu đó (bấm hai lần không lỗi).
 */
export async function stopNkvhPermit(tx: Tx, user: Actor, input: { kind: PermitKind; nkvhPctId: string; reason: unknown }) {
  const { kind, nkvhPctId } = input;
  const found = await tx.workPermit.findFirst({ where: { kind, nkvhPctId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!found) throw fail("Phiếu NKVH này chưa có trên sổ PXVH1 (hoặc đã hủy) — không có gì để dừng", 404);
  await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${found.id} FOR UPDATE`;
  const before = await tx.workPermit.findUniqueOrThrow({ where: { id: found.id } });
  if (before.status === "PAUSED") return nkvhClaimResult(before, false);
  if (!["ISSUED", "ACTIVE", "WAITING"].includes(before.status)) {
    throw fail(`Phiếu ${formatPermitNumber(before)} trên sổ đang ở trạng thái không dừng được. Liên hệ quản trị nếu cần sửa.`, 409);
  }
  const reason = text(input.reason, 500);
  const statusReason = `Dừng trên NKVH${reason ? `: ${reason}` : ""}`;
  const after = await tx.workPermit.update({ where: { id: before.id }, data: { status: "PAUSED", statusReason, version: { increment: 1 } } });
  await tx.workPermitHistory.create({ data: { permitId: after.id, actorId: user.id, actorName: user.name ?? "", action: "Dừng theo NKVH", before: permitSnapshot(before), after: permitSnapshot(after) } });
  return nkvhClaimResult(after, false);
}

/** Đưa hàng DB về dạng body để chạy lại parsePermit (tính lại searchText, kiểm tra ràng buộc). */
function rowBody(row: WorkPermit): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value ?? ""]));
}

export function nkvhClaimResult(row: Pick<WorkPermit, "id" | "number" | "year" | "status">, created: boolean) {
  return { id: row.id, number: row.number, year: row.year, status: row.status, formatted: formatPermitNumber(row), created };
}

/** Lấy số cho phiếu NKVH (hoặc trả lại số đã lấy). Gọi trong một giao dịch. */
export async function claimNkvhPermit(tx: Tx, user: Actor, input: { kind: PermitKind; nkvhPctId: string; page: NkvhPage; unit: unknown; position: unknown }, now = new Date()) {
  const { kind, nkvhPctId, page } = input;
  const unit = typeof input.unit === "string" && Object.hasOwn(PERMIT_UNITS, input.unit) ? input.unit : "";
  if (!unit) throw fail("Vui lòng chọn tổ máy");
  const position = text(input.position, 200);
  if (!OPERATION_POSITION_TITLES.some(value => value === position)) throw fail("Vui lòng chọn cương vị");
  if (!page.content) throw fail("Trang NKVH chưa có nội dung công tác. Hãy mở phiếu ở bước B1.");
  // Đơn vị QLVH trên NKVH: "VH" = PXVH1. Phiếu của phân xưởng khác (VH3 = PXVH2…) không cấp số sổ PXVH1.
  // Tiện ích bản cũ không gửi qlvhCode (chuỗi rỗng) → không chặn, giữ nguyên hành vi cũ.
  if (page.qlvhCode && page.qlvhCode !== "VH") {
    throw fail("Phiếu này thuộc phân xưởng khác trên NKVH (Đơn vị QLVH không phải Phân xưởng Vận hành 1). Sổ PXVH1 không cấp số cho phiếu này.");
  }
  if (TEAM_CODES[page.teamCode] === undefined && /^[0-9a-f-]{36}$/i.test(page.teamCode)) {
    throw fail("Đơn vị công tác trên NKVH là đơn vị ngoài. Tiện ích chỉ lấy số cho PCT nội bộ; phiếu nhà thầu lấy số trên sổ PCT giấy.");
  }
  const { day: today, year } = vnParts(now);
  await lockPermitNumberScope(tx, kind, year);
  const existing = await tx.workPermit.findFirst({
    where: { kind, nkvhPctId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" },
    select: { id: true, number: true, year: true, status: true },
  });
  if (existing) return nkvhClaimResult(existing, false);
  const reservation = await reservePermitNumber(tx, { kind, year, teamType: "INTERNAL", ownerId: user.id, ownerName: user.name ?? "" });
  const issuerName = page.issuerName || user.name?.trim() || "";
  const data = parsePermit({
    ...pageFields(page, kind), kind, year, number: reservation.number, unit, position,
    workDate: page.plannedStartAt?.slice(0, 10) ?? today, teamType: "INTERNAL", format: "ELECTRONIC", nkvhPctId,
    issuerName, issuerUserId: issuerName === user.name?.trim() ? user.id : "", issuedAt: now.toISOString(),
  }, "ISSUED", { allowIncompleteIssue: true });
  const row = await tx.workPermit.create({ data: { ...data, status: "ISSUED", createdById: user.id, createdByName: user.name ?? "" } });
  await consumePermitNumberReservation(tx, { reservationId: reservation.id, kind, year, number: reservation.number,
    teamType: "INTERNAL", userId: user.id, userName: user.name ?? "", isAdmin: user.role === "ADMIN", permitId: row.id });
  await tx.workPermitHistory.create({ data: { permitId: row.id, actorId: user.id, actorName: user.name ?? "", action: "Tạo phiếu từ NKVH", after: permitSnapshot(row) } });
  return nkvhClaimResult(row, true);
}

/**
 * Phiếu đã hủy trên NKVH → hủy phiếu tương ứng trên sổ, lý do lấy theo NKVH. Gọi lại khi sổ đã hủy
 * thì trả về phiếu đó (bấm hai lần không lỗi). Số của phiếu bị bỏ, không cấp lại.
 */
export async function cancelNkvhPermit(tx: Tx, user: Actor, input: { kind: PermitKind; nkvhPctId: string; reason: unknown }) {
  const { kind, nkvhPctId } = input;
  const found = await tx.workPermit.findFirst({ where: { kind, nkvhPctId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!found) {
    const cancelled = await tx.workPermit.findFirst({ where: { kind, nkvhPctId, status: "CANCELLED" }, orderBy: { createdAt: "desc" },
      select: { id: true, number: true, year: true, status: true } });
    if (cancelled) return nkvhClaimResult(cancelled, false);
    throw fail("Phiếu NKVH này chưa có trên sổ PXVH1 — không có gì để hủy", 404);
  }
  await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${found.id} FOR UPDATE`;
  const before = await tx.workPermit.findUniqueOrThrow({ where: { id: found.id } });
  const transitions = before.teamType === "CONTRACTOR" ? CONTRACTOR_PERMIT_TRANSITIONS : PERMIT_TRANSITIONS;
  if (!transitions[before.status as PermitStatus]?.includes("CANCELLED")) {
    throw fail(`Phiếu ${formatPermitNumber(before)} trên sổ đã đóng, không hủy được. Liên hệ quản trị nếu cần sửa.`, 409);
  }
  const reason = text(input.reason, 500);
  const statusReason = `Hủy trên NKVH${reason ? `: ${reason}` : ""}`;
  const after = await tx.workPermit.update({ where: { id: before.id }, data: { status: "CANCELLED", statusReason, version: { increment: 1 } } });
  const reservation = await tx.workPermitNumberReservation.findUnique({ where: { permitId: after.id } });
  if (reservation?.status === "ISSUED") {
    await tx.workPermitNumberReservation.update({ where: { id: reservation.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: user.id, cancelReason: statusReason } });
    await tx.workPermitNumberReservationHistory.create({ data: { reservationId: reservation.id, action: "CANCELLED",
      actorId: user.id, actorName: user.name ?? "", permitId: after.id, note: statusReason } });
  }
  await tx.workPermitHistory.create({ data: { permitId: after.id, actorId: user.id, actorName: user.name ?? "", action: "Hủy theo NKVH", before: permitSnapshot(before), after: permitSnapshot(after) } });
  return nkvhClaimResult(after, false);
}

/** Cập nhật về sổ các trường NKVH là nguồn gốc (nội dung, địa điểm, thời gian, CHTT…). */
export async function syncNkvhPermit(tx: Tx, user: Actor, input: { kind: PermitKind; nkvhPctId: string; page: NkvhPage }) {
  const { kind, nkvhPctId, page } = input;
  const found = await tx.workPermit.findFirst({ where: { kind, nkvhPctId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!found) throw fail("Phiếu NKVH này chưa lấy số trên sổ PXVH1", 404);
  await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${found.id} FOR UPDATE`;
  const before = await tx.workPermit.findUniqueOrThrow({ where: { id: found.id } });
  const data = parsePermit({ ...rowBody(before), ...pageFields(page, kind) }, before.status as PermitStatus, { allowIncompleteIssue: true });
  const after = await tx.workPermit.update({ where: { id: before.id }, data: {
    registrationNumber: data.registrationNumber, teamName: data.teamName, sourceClassification: data.sourceClassification,
    workType: data.workType, content: data.content, location: data.location, workScope: data.workScope, disciplines: data.disciplines,
    plannedStartAt: data.plannedStartAt, plannedEndAt: data.plannedEndAt, commanderName: data.commanderName,
    leaderName: data.leaderName, workerCount: data.workerCount, searchText: data.searchText, version: { increment: 1 },
  } });
  await tx.workPermitHistory.create({ data: { permitId: after.id, actorId: user.id, actorName: user.name ?? "", action: "Đồng bộ từ NKVH", before: permitSnapshot(before), after: permitSnapshot(after) } });
  return nkvhClaimResult(after, false);
}
