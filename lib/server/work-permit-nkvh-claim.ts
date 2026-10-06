import type { Prisma, WorkPermit } from "@prisma/client";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { NKVH_UUID } from "@/lib/nkvh-pct";
import { positionCodeOf, positionLabelOf } from "@/lib/position-catalog";
import { DEFAULT_INTERNAL_TEAM_NAME } from "@/lib/work-permit-source-fields";
import { CONTRACTOR_PERMIT_TRANSITIONS, formatPermitNumber, PERMIT_DISCIPLINES, PERMIT_KINDS, PERMIT_TRANSITIONS, PERMIT_UNITS, type PermitKind, type PermitStatus } from "@/lib/work-permits";
import { parsePermit, permitSnapshot } from "@/lib/server/work-permits";
import { activePermitNumberExists, assertNumberNotCancelled, lockNkvhPermit, canonicalPermitNumber, lockPermitNumberScope, OBSERVED_NUMBER_STATUS, CONFIRMED_NUMBER_STATUS, IGNORED_NUMBER_STATUS, permitNumberHighWater, nextPermitNumber, reservePermitNumber } from "@/lib/server/work-permit-number-reservations";

/** Giữ số trước khi cấp; nhận số/nội dung/trạng thái chính thức sau khi NKVH lưu. */
const CLASSIFICATIONS: Record<string, "PLANNED" | "OFF_PLAN" | "UNEXPECTED"> = {
  "PLCT.PL.001": "PLANNED", "PLCT.PL.002": "OFF_PLAN", "PLCT.PL.003": "UNEXPECTED",
};
const TEAM_CODES: Record<string, string> = { PCN: DEFAULT_INTERNAL_TEAM_NAME.MECHANICAL, DTD: DEFAULT_INTERNAL_TEAM_NAME.ELECTRICAL };

export type NkvhPage = {
  registrationNumber: string; teamCode: string; teamLabel: string; qlvhCode: string; classification: string; disciplines: string[];
  location: string; content: string; workScope: string; plannedStartAt: string | null; plannedEndAt: string | null;
  issuedAt: string | null; authorizerPosition: string; commanderName: string; leaderName: string; workerCount: number | null; issuerName: string;
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

/**
 * Chỉ nhận số chính thức của sổ PXVH1, xét phần đầu "<số>/<năm>/VH1-NĐDH"; phần sau là ghi chú tuỳ phiếu
 * ("(ĐT)" = đăng ký qua điện thoại, "gấp"…) nên bỏ qua. Không nhận số NKVH tự sinh dạng …/NĐDH-VH1.
 */
export function parseExistingNkvhPermitNumber(value: unknown) {
  // Giữ khoảng trắng giữa số và ghi chú ("…VH1-NĐDH gấp"), chỉ bỏ khoảng trắng quanh "/" và "-".
  const normalized = text(value, 160).toUpperCase().replace(/\s*([/-])\s*/g, "$1");
  // Tiện ích 1.1.0 vẫn gửi cả dạng …/NĐDH-VH1 — chặn ở đây để khỏi phải phát hành lại tiện ích.
  if (/^[0-9]+\/20[0-9]{2}\/N[ĐD]DH-VH/u.test(normalized)) {
    throw fail(`“${text(value, 160)}” là số NKVH tự sinh, chưa phải số sổ PXVH1. Hãy xoá ô Số phiếu, bấm “Lấy số PCT” rồi lưu lại phiếu trên NKVH.`, 400);
  }
  // Sau "NĐDH" không được dính chữ/số (tránh nhận nhầm "VH1-NĐDH2…"), còn lại là ghi chú.
  const match = normalized.match(/^([0-9]{1,80})\/(20[0-9]{2})\/VH1-N[ĐD]DH(?![\p{L}\p{N}])/u);
  if (!match) throw fail("Số trên NKVH không đúng dạng số sổ PXVH1 (ví dụ 1234/2026/VH1-NĐDH)", 400);
  return { number: canonicalPermitNumber(match[1]), year: Number(match[2]) };
}

export function parseNkvhKind(value: unknown) {
  const kind = typeof value === "string" && Object.hasOwn(PERMIT_KINDS, value) ? value as PermitKind : null;
  if (!kind) throw fail("Không xác định được sổ Cơ – Nhiệt – Hóa hay Điện từ trang NKVH");
  return kind;
}

export function parseNkvhScope(body: Record<string, unknown>) {
  const kind = parseNkvhKind(body.kind);
  const nkvhPctId = typeof body.nkvhPctId === "string" && NKVH_UUID.test(body.nkvhPctId) ? body.nkvhPctId.toLowerCase() : null;
  if (!nkvhPctId) throw fail("Trang NKVH chưa có mã phiếu (id_pct). Hãy mở phiếu từ danh sách PCT trên NKVH.");
  return { kind, nkvhPctId };
}

/**
 * NKVH đã kết thúc bình thường: T-C-N-H hiển thị "Khóa phiếu", Điện hiển thị "Hoàn thành".
 * Có thể gọi bằng id_pct ở trang chi tiết hoặc số PCT ở trang danh sách. Trường hợp theo số chỉ nhận
 * đúng một PCT nội bộ điện tử đã có liên kết NKVH, tránh đóng nhầm phiếu giấy hoặc hồ sơ trùng cũ.
 */
export async function closeNkvhPermit(tx: Tx, user: Actor, input: {
  kind: PermitKind; nkvhPctId?: unknown; formattedNumber?: unknown; sourceStatus?: unknown; closedAt?: unknown;
}, now = new Date()) {
  const nkvhPctId = typeof input.nkvhPctId === "string" && NKVH_UUID.test(input.nkvhPctId)
    ? input.nkvhPctId.toLowerCase() : null;
  const number = nkvhPctId ? null : parseExistingNkvhPermitNumber(input.formattedNumber);
  const candidates = await tx.workPermit.findMany({
    where: {
      kind: input.kind,
      teamType: "INTERNAL",
      status: { not: NKVH_PENDING_STATUS },
      OR: [{ format: "ELECTRONIC" }, { format: null }],
      ...(nkvhPctId ? { nkvhPctId } : { nkvhPctId: { not: null }, year: number!.year, number: number!.number }),
    },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { id: true },
  });
  if (candidates.length === 0) throw fail("Phiếu NKVH này chưa có liên kết trên sổ PXVH1 — không có gì để đóng", 404);
  if (candidates.length > 1) throw fail("Số PCT này đang có nhiều hồ sơ liên kết NKVH. Quản trị cần đối chiếu trước khi đóng.", 409);

  await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${candidates[0].id} FOR UPDATE`;
  const before = await tx.workPermit.findUniqueOrThrow({ where: { id: candidates[0].id } });
  if (before.status === "CLOSED") return { ...nkvhClaimResult(before, false), changed: false };
  if (!["ISSUED", "ACTIVE", "PAUSED", "WAITING"].includes(before.status)) {
    throw fail(`Phiếu ${formatPermitNumber(before)} trên sổ đang ở trạng thái không thể đóng theo NKVH.`, 409);
  }

  const suppliedAt = nkvhInstant(input.closedAt);
  const parsedAt = suppliedAt ? new Date(suppliedAt) : now;
  // Dữ liệu DOM chỉ là gợi ý; thời điểm đóng không được trước lúc cấp hoặc ở tương lai.
  const validAt = Number.isFinite(parsedAt.getTime()) && parsedAt <= new Date(now.getTime() + 5 * 60 * 1000)
    && (!before.issuedAt || parsedAt >= before.issuedAt);
  const closedAt = validAt ? parsedAt : now;
  const sourceStatus = text(input.sourceStatus, 80) || (input.kind === "ELECTRICAL" ? "Hoàn thành" : "Khóa phiếu");
  const after = await tx.workPermit.update({ where: { id: before.id }, data: {
    status: "CLOSED", closedAt, version: { increment: 1 },
  } });
  await tx.workPermitHistory.create({ data: {
    permitId: after.id, actorId: user.id, actorName: user.name ?? "",
    action: `Đóng theo NKVH (${sourceStatus})`, before: permitSnapshot(before), after: permitSnapshot(after),
  } });
  return { ...nkvhClaimResult(after, false), changed: true };
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
    issuedAt: nkvhInstant(page.issuedAt), issuerName: personName(page.issuerName), authorizerPosition: text(page.authorizerPosition, 200),
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
  const found = await tx.workPermit.findFirst({ where: { kind, nkvhPctId, status: { notIn: ["CANCELLED", NKVH_PENDING_STATUS] } }, orderBy: { createdAt: "desc" }, select: { id: true } });
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

export function nkvhClaimResult(row: Pick<WorkPermit, "id" | "number" | "year" | "status"> & { nkvhNumber?: string | null }, created: boolean) {
  return { id: row.id, number: row.number, year: row.year, status: row.status, formatted: formatPermitNumber(row), created };
}

/**
 * Phiếu "Chờ NKVH lưu": lấy số xong sổ có ngay một phiếu NHÁP mang số đó (người lấy, nội dung đang điền,
 * link NKVH) để số đang dùng không bao giờ mất dấu. Nháp chưa tính là đã cấp (không vào sổ xuất, không
 * nâng dãy); chỉ bản đã LƯU trên NKVH mới chuyển nháp thành Đã cấp (importExistingNkvhPermit).
 * Tiện ích không thấy nháp: GET/claim/đóng/dừng vẫn trả như khi chỉ có lượt giữ số.
 */
export const NKVH_PENDING_STATUS = "DRAFT";
const PENDING_CONTENT = "(Chờ NKVH lưu nội dung phiếu)";

async function ensurePendingDraft(tx: Tx, user: Actor, input: { kind: PermitKind; nkvhPctId: string; page: NkvhPage; unit: unknown; position: unknown },
  reservation: { number: string; year: number }, now: Date) {
  const { kind, nkvhPctId, page } = input;
  const draft = await tx.workPermit.findFirst({ where: { kind, nkvhPctId, status: NKVH_PENDING_STATUS } });
  if (draft) return draft;
  // Số đã có hồ sơ khác (vd nháp cũ gõ tay) → không tạo thêm; lượt giữ số vẫn giữ số như trước.
  const taken = await tx.workPermit.findFirst({ where: { kind, year: reservation.year, number: reservation.number, status: { not: "CANCELLED" } }, select: { id: true } });
  if (taken) return null;
  const fields: Record<string, unknown> = {
    ...pageFields(page, kind), kind, year: reservation.year, number: reservation.number,
    unit: typeof input.unit === "string" && Object.hasOwn(PERMIT_UNITS, input.unit) ? input.unit : "UNKNOWN",
    position: nkvhPositionOrBlank(page, input.position), nkvhPctId, teamType: "INTERNAL", format: "ELECTRONIC",
    workDate: page.plannedStartAt?.slice(0, 10) ?? vnParts(now).day, issuerName: page.issuerName || user.name || "",
    content: page.content || PENDING_CONTENT,
  };
  dropInvalidPlannedEnd(fields);
  let data: ReturnType<typeof parsePermit>;
  try { data = parsePermit(fields, NKVH_PENDING_STATUS, { allowIncompleteIssue: true }); } catch { return null; }
  const row = await tx.workPermit.create({ data: { ...data, status: NKVH_PENDING_STATUS, createdById: user.id, createdByName: user.name ?? "" } });
  await tx.workPermitHistory.create({ data: { permitId: row.id, actorId: user.id, actorName: user.name ?? "",
    action: "Lấy số từ NKVH — chờ NKVH lưu phiếu", after: permitSnapshot(row) } });
  return row;
}

/** Giờ kết thúc dự kiến sớm hơn giờ bắt đầu (NKVH vẫn cho lưu) → bỏ giờ kết thúc, không từ chối cả phiếu. */
function dropInvalidPlannedEnd(fields: Record<string, unknown>) {
  const start = Date.parse(String(fields.plannedStartAt ?? "")), end = Date.parse(String(fields.plannedEndAt ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end >= start) return null;
  fields.plannedEndAt = "";
  return "giờ kết thúc dự kiến trên NKVH sớm hơn giờ bắt đầu nên chưa ghi";
}

/**
 * Lấy số: giữ số + tạo phiếu nháp chờ NKVH lưu (xem NKVH_PENDING_STATUS). Phản hồi cho tiện ích giữ
 * nguyên dạng lượt giữ số (status RESERVED) để mọi bản tiện ích chạy như cũ.
 */
export async function claimNkvhPermit(tx: Tx, user: Actor, input: { kind: PermitKind; nkvhPctId: string; page: NkvhPage; unit: unknown; position: unknown }, now = new Date()) {
  const { kind, nkvhPctId } = input;
  validateNkvhSource(input.page, false);
  await lockNkvhPermit(tx, kind, nkvhPctId);
  const existing = await tx.workPermit.findFirst({ where: { kind, nkvhPctId, status: { not: NKVH_PENDING_STATUS } } });
  if (existing) return { ...nkvhClaimResult(existing, false), reservationId: null };
  const { year } = vnParts(now);
  await lockPermitNumberScope(tx, kind, year);
  const observed = await tx.workPermitNumberReservation.findFirst({ where: { kind, nkvhPctId, status: { in: [OBSERVED_NUMBER_STATUS, CONFIRMED_NUMBER_STATUS] } } });
  if (observed) throw fail("Phiếu đã có số được ghi nhận trên NKVH. Hãy đồng bộ phiếu đã lưu, không lấy số khác.", 409);
  const held = await tx.workPermitNumberReservation.findFirst({ where: { kind, nkvhPctId, status: "RESERVED" } });
  const reservation = held ?? await reservePermitNumber(tx, { kind, year, teamType: "INTERNAL", ownerId: user.id, ownerName: user.name ?? "", nkvhPctId });
  await ensurePendingDraft(tx, user, input, reservation, now);
  return { id: reservation.id, reservationId: reservation.id, number: reservation.number, year: reservation.year,
    status: "RESERVED", formatted: formatPermitNumber(reservation), created: !held };
}

function validateNkvhSource(page: NkvhPage, requireContent = true) {
  if (page.qlvhCode !== "VH") throw fail("Chưa xác định phiếu thuộc Phân xưởng Vận hành 1 trên NKVH.", 400);
  if (requireContent && !page.content) throw fail("Chưa đọc được nội dung công tác đã lưu trên NKVH.", 400);
  if (TEAM_CODES[page.teamCode] === undefined && /^[0-9a-f-]{36}$/i.test(page.teamCode)) throw fail("Phiếu đơn vị ngoài không thuộc luồng PCT nội bộ điện tử.", 400);
}

/** Như nkvhPosition nhưng chức danh chưa khớp danh mục thì bỏ trống — dùng khi nhận phiếu NKVH đã lưu. */
export function nkvhPositionOrBlank(page: NkvhPage, fallback: unknown = "") {
  const code = positionCodeOf(page.authorizerPosition) ?? positionCodeOf(text(fallback, 200));
  return code ? positionLabelOf(code) : "";
}

export function nkvhPosition(page: NkvhPage, fallback: unknown = "") {
  const source = page.authorizerPosition || text(fallback, 200);
  const code = positionCodeOf(source) ?? positionCodeOf(text(fallback, 200));
  if (!code && source) throw fail(`Chức danh NKVH “${source}” chưa khớp danh mục. Vui lòng xác nhận cương vị.`, 400);
  return code ? positionLabelOf(code) : "";
}

/** Nhận đúng phiếu đã lưu trên NKVH. Khóa theo mã phiếu trước, khóa dãy số sau. */
export async function importExistingNkvhPermit(tx: Tx, user: Actor, input: {
  kind: PermitKind; nkvhPctId: string; page: NkvhPage; unit: unknown; position: unknown; formattedNumber: unknown;
  sourceStatus?: unknown; sourceReason?: unknown;
}, now = new Date()) {
  const { kind, nkvhPctId, page } = input;
  validateNkvhSource(page);
  const parsed = parseExistingNkvhPermitNumber(input.formattedNumber);
  const officialNumber = text(input.formattedNumber, 160);
  const sourceStatus = text(input.sourceStatus, 20) || "ISSUED";
  if (!["ISSUED", "PAUSED", "CLOSED", "CANCELLED"].includes(sourceStatus)) throw fail("Trạng thái NKVH không hợp lệ.", 400);
  await lockNkvhPermit(tx, kind, nkvhPctId);
  const candidates = await tx.workPermit.findMany({ where: { kind, nkvhPctId }, take: 2 });
  if (candidates.length > 1) throw fail("Phiếu NKVH đang có nhiều hồ sơ theo dõi. Cần đối chiếu trước khi đồng bộ.", 409);
  const before = candidates[0] ?? null;
  if (before && (before.format === "PAPER" || before.teamType === "CONTRACTOR")) throw fail("Hồ sơ liên kết là PCT giấy. Cần đối chiếu, không tự chuyển sang điện tử.", 409);
  if (before && before.year !== parsed.year) throw fail("Số NKVH khác năm hồ sơ đã liên kết. Cần đối chiếu.", 409);
  await lockPermitNumberScope(tx, kind, parsed.year);
  if (before) await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${before.id} FOR UPDATE`;
  const owners = await tx.$queryRaw<Array<{ id: string; number: string; format: string | null; nkvhPctId: string | null; status: string; issuerName: string; content: string }>>`
    SELECT "id", "number", "format", "nkvhPctId", "status", "issuerName", "content" FROM "WorkPermit"
    WHERE "kind" = ${kind} AND "year" = ${parsed.year} AND "number" ~ '^[0-9]+$'
      AND "number"::numeric = ${parsed.number}::numeric AND (${before?.id ?? null}::text IS NULL OR "id" <> ${before?.id ?? null})
    FOR UPDATE`;
  const activeOwners = owners.filter(owner => owner.status !== "CANCELLED");
  if (activeOwners.length) throw fail(`Số ${officialNumber} đã thuộc hồ sơ khác (${activeOwners[0].format === "PAPER" ? "PCT giấy đã cấp" : "PCT điện tử"}), người cấp: ${activeOwners[0].issuerName || "chưa rõ"}; công việc: ${text(activeOwners[0].content, 180) || "chưa rõ"}. Mở số này trên sổ để đối chiếu, không tự ghi đè.`, 409);
  if (!before || before.number !== parsed.number) await assertNumberNotCancelled(tx, kind, parsed.year, parsed.number);
  let reservation = await tx.workPermitNumberReservation.findFirst({ where: { kind, year: parsed.year, number: parsed.number,
    status: { in: ["RESERVED", "ISSUED", "CANCELLED", OBSERVED_NUMBER_STATUS, CONFIRMED_NUMBER_STATUS, "REVIEW"] } } });
  if (reservation && ["ISSUED", "CANCELLED", "REVIEW"].includes(reservation.status) && reservation.permitId !== before?.id) throw fail("Số đã có lượt cấp hoặc đã hủy. Cần đối chiếu hồ sơ liên quan.", 409);
  const baseline = await tx.workPermitNumberBaseline.findUnique({ where: { kind_year: { kind, year: parsed.year } } });
  const highest = await permitNumberHighWater(tx, kind, parsed.year);
  const expectedNext = await nextPermitNumber(tx, kind, parsed.year, baseline?.number ?? "0", highest);
  // Một số mới nhảy cóc chưa được giữ/xác nhận không tự nâng dãy, kể cả đã có phiếu thật.
  // OBSERVED đã gắn phiếu tiếp tục chờ xác nhận khi đồng bộ lặp.
  const sequencePending = (reservation?.status === OBSERVED_NUMBER_STATUS && Boolean(reservation.permitId))
    || ((!reservation || reservation.status === OBSERVED_NUMBER_STATUS) && BigInt(parsed.number) > BigInt(expectedNext));
  // NKVH là phiếu chính thức: dữ liệu phụ sai (chức danh lạ, giờ vô lý) không làm mất cả phiếu trên sổ —
  // bỏ trống/chỉnh và ghi chú vào lịch sử; chỉ sai SỐ mới từ chối.
  const notes: string[] = [];
  const position = nkvhPositionOrBlank(page, input.position);
  if (!position && page.authorizerPosition) notes.push(`chức danh NKVH “${page.authorizerPosition}” chưa khớp danh mục, cần chọn cương vị`);
  const unit = typeof input.unit === "string" && Object.hasOwn(PERMIT_UNITS, input.unit) ? input.unit : before?.unit ?? "UNKNOWN";
  const status = (sourceStatus === "ISSUED" && before && ["ACTIVE", "WAITING", "PAUSED", "CLOSED", "CANCELLED"].includes(before.status) ? before.status : sourceStatus) as PermitStatus;
  const reason = text(input.sourceReason, 1500);
  const fields = {
    ...(before ? rowBody(before) : {}), ...pageFields(page, kind), kind, year: parsed.year, number: parsed.number,
    unit, position: position || before?.position || "", nkvhPctId, teamType: "INTERNAL", format: "ELECTRONIC",
    workDate: before?.workDate ?? page.plannedStartAt?.slice(0, 10) ?? vnParts(now).day,
    issuerName: page.issuerName || before?.issuerName || user.name || "",
    issuedAt: page.issuedAt ?? before?.issuedAt?.toISOString() ?? (parsed.year === vnParts(now).year ? now.toISOString() : null),
    closedAt: status === "CLOSED" ? before?.closedAt?.toISOString() ?? now.toISOString() : null,
    statusReason: ["PAUSED", "CANCELLED"].includes(status) ? reason ? `Theo NKVH: ${reason}` : before?.statusReason || "Theo NKVH" : "",
  };
  const plannedNote = dropInvalidPlannedEnd(fields);
  if (plannedNote) notes.push(plannedNote);
  const issuedTime = Date.parse(String(fields.issuedAt ?? ""));
  if (fields.closedAt && Number.isFinite(issuedTime) && Date.parse(String(fields.closedAt)) < issuedTime) fields.closedAt = fields.issuedAt;
  const data = parsePermit(fields, status, { allowIncompleteIssue: true });
  data.searchText = `${data.searchText} ${normalizeText(officialNumber)}`;
  const oldReservation = before ? await tx.workPermitNumberReservation.findUnique({ where: { permitId: before.id } }) : null;
  // Số cũ từng ghi cấp: giữ dấu vết REVIEW để không tự cấp lại cho phiếu khác.
  if (oldReservation && oldReservation.number !== parsed.number) {
    const oldStatus = oldReservation.status === OBSERVED_NUMBER_STATUS ? OBSERVED_NUMBER_STATUS : "REVIEW";
    await tx.workPermitNumberReservation.update({ where: { id: oldReservation.id }, data: { status: oldStatus, permitId: null } });
    await tx.workPermitNumberReservationHistory.create({ data: { reservationId: oldReservation.id, action: oldStatus,
      actorId: user.id, actorName: user.name ?? "", note: `Đổi sang ${officialNumber} theo NKVH; số cũ cần đối chiếu trước khi giải phóng` } });
  }
  const changed = !before || Object.entries({ ...data, nkvhNumber: officialNumber, status }).some(([key, value]) =>
    JSON.stringify(permitSnapshot(value)) !== JSON.stringify(permitSnapshot((before as unknown as Record<string, unknown>)[key])));
  const row = before ? changed ? await tx.workPermit.update({ where: { id: before.id }, data: { ...data, nkvhNumber: officialNumber, status, version: { increment: 1 } } }) : before
    : await tx.workPermit.create({ data: { ...data, nkvhNumber: officialNumber, status, createdById: user.id, createdByName: user.name ?? "" } });
  const reservationStatus = sequencePending ? OBSERVED_NUMBER_STATUS : status === "CANCELLED" ? "CANCELLED" : "ISSUED";
  if (!reservation) reservation = await tx.workPermitNumberReservation.create({ data: { kind, year: parsed.year, number: parsed.number,
    teamType: "INTERNAL", ownerId: user.id, ownerName: user.name ?? "", status: reservationStatus, nkvhPctId, permitId: row.id, issuedAt: now,
    ...(status === "CANCELLED" ? { cancelledAt: now, cancelReason: fields.statusReason, cancelledById: user.id } : {}) } });
  else if (reservation.status !== reservationStatus || reservation.permitId !== row.id || reservation.nkvhPctId !== nkvhPctId
    || reservation.teamType !== "INTERNAL" || !reservation.issuedAt
    || (status === "CANCELLED" && (!reservation.cancelledAt || reservation.cancelReason !== fields.statusReason))) {
    await tx.workPermitNumberReservation.update({ where: { id: reservation.id }, data: { status: reservationStatus, permitId: row.id,
    nkvhPctId, teamType: "INTERNAL", issuedAt: reservation.issuedAt ?? now,
    ...(status === "CANCELLED" ? { cancelledAt: now, cancelReason: fields.statusReason, cancelledById: user.id } : {}) } });
  }
  if (changed) {
    await tx.workPermitHistory.create({ data: { permitId: row.id, actorId: user.id, actorName: user.name ?? "",
      action: `Đồng bộ số, nội dung và trạng thái đã lưu trên NKVH${notes.length ? ` (${notes.join("; ")})` : ""}`,
      ...(before ? { before: permitSnapshot(before) } : {}), after: permitSnapshot(row) } });
    await tx.workPermitNumberReservationHistory.create({ data: { reservationId: reservation.id, action: reservationStatus,
      actorId: user.id, actorName: user.name ?? "", permitId: row.id,
      note: `Nhận phiếu đã lưu trên NKVH${reservation.ownerId !== user.id ? `; hoàn tất lượt giữ của ${reservation.ownerName}` : ""}` } });
  }
  const pending = await tx.workPermitNumberReservation.findMany({ where: { kind, nkvhPctId, status: { in: ["RESERVED", "REVIEW"] }, permitId: null }, select: { id: true, number: true, year: true } });
  return { ...nkvhClaimResult(row, !before), changed, pendingReservations: pending, sequencePending };
}

function tryParsePxvh1Number(value: unknown) {
  try { return parseExistingNkvhPermitNumber(value); } catch { return null; }
}

const OBSERVE_LIMIT = 200;
export type NkvhObserveResult = { recorded: string[]; ahead: Array<{ formatted: string; expected: string }> };

export async function observeNkvhNumbers(tx: Tx, user: Actor, input: { kind: PermitKind; entries: unknown }, now = new Date()): Promise<NkvhObserveResult> {
  const { year } = vnParts(now);
  const result: NkvhObserveResult = { recorded: [], ahead: [] };
  const pctIds = new Map<string, string>();
  for (const entry of Array.isArray(input.entries) ? input.entries.slice(0, OBSERVE_LIMIT) : []) {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const parsed = tryParsePxvh1Number(item.formattedNumber);
    if (!parsed || parsed.year !== year) continue;
    const pct = typeof item.nkvhPctId === "string" && NKVH_UUID.test(item.nkvhPctId) ? item.nkvhPctId.toLowerCase() : "";
    if (!pctIds.get(parsed.number)) pctIds.set(parsed.number, pct);
  }
  if (!pctIds.size) return result;

  await lockPermitNumberScope(tx, input.kind, year);
  const baseline = await tx.workPermitNumberBaseline.findUnique({ where: { kind_year: { kind: input.kind, year } } });
  const highest = await permitNumberHighWater(tx, input.kind, year);
  const expected = await nextPermitNumber(tx, input.kind, year, baseline?.number ?? "0", highest);
  const numbers = [...pctIds.keys()].map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const value of numbers) {
    const number = value.toString();
    if (await activePermitNumberExists(tx, input.kind, year, number)) continue;
    const held = await tx.workPermitNumberReservation.findFirst({ where: { kind: input.kind, year, number,
      status: { in: ["RESERVED", "ISSUED", "CANCELLED", OBSERVED_NUMBER_STATUS, CONFIRMED_NUMBER_STATUS, "REVIEW"] } } });
    if (held) {
      if (held.status === "RESERVED") {
        await tx.workPermitNumberReservation.update({ where: { id: held.id }, data: { status: CONFIRMED_NUMBER_STATUS,
          ...(pctIds.get(number) ? { nkvhPctId: pctIds.get(number) } : {}) } });
        await tx.workPermitNumberReservationHistory.create({ data: { reservationId: held.id, action: CONFIRMED_NUMBER_STATUS,
          actorId: user.id, actorName: user.name ?? "", note: "Số xuất hiện trên danh sách phiếu NKVH đã lưu; chặn tiếp tục cấp giấy hoặc giải phóng lượt trước khi đồng bộ" } });
      }
      if (held.status === OBSERVED_NUMBER_STATUS && BigInt(number) > BigInt(expected)) result.ahead.push({ formatted: formatPermitNumber({ number, year }), expected });
      continue;
    }
    const pct = pctIds.get(number);
    const ignored = await tx.workPermitNumberReservation.findFirst({ where: { kind: input.kind, year, number, status: IGNORED_NUMBER_STATUS }, orderBy: { createdAt: "desc" } });
    if (ignored && (!pct || ignored.nkvhPctId === pct)) continue;
    const row = await tx.workPermitNumberReservation.create({ data: {
      kind: input.kind, year, number, teamType: "INTERNAL", status: OBSERVED_NUMBER_STATUS, ownerId: user.id, ownerName: user.name ?? "",
      ...(pct ? { nkvhPctId: pct } : {}),
    } });
    await tx.workPermitNumberReservationHistory.create({ data: { reservationId: row.id, action: OBSERVED_NUMBER_STATUS,
      actorId: user.id, actorName: user.name ?? "",
      note: `Số đã dùng trên NKVH${pct ? ` (id_pct ${pct})` : ""} nhưng sổ chưa có hồ sơ — giữ chỗ để không cấp trùng` } });

    result.recorded.push(formatPermitNumber({ number, year }));
    if (BigInt(number) > BigInt(expected)) result.ahead.push({ formatted: formatPermitNumber({ number, year }), expected });
  }
  return result;
}

/**
 * Phiếu đã hủy trên NKVH → hủy phiếu tương ứng trên sổ, lý do lấy theo NKVH. Gọi lại khi sổ đã hủy
 * thì trả về phiếu đó (bấm hai lần không lỗi). Số mặc định bị bỏ; quản trị có thể đặt lại từ Mốc sổ giấy.
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
  if (before.status === NKVH_PENDING_STATUS) await settleNkvhDraftNumber(tx, before, user, statusReason);
  await tx.workPermitHistory.create({ data: { permitId: after.id, actorId: user.id, actorName: user.name ?? "", action: "Hủy theo NKVH", before: permitSnapshot(before), after: permitSnapshot(after) } });
  return nkvhClaimResult(after, false);
}

/** Đồng bộ thủ công và tự động dùng cùng đường nhận phiếu đã lưu. */
export async function syncNkvhPermit(tx: Tx, user: Actor, input: Parameters<typeof importExistingNkvhPermit>[2]) {
  return importExistingNkvhPermit(tx, user, input);
}

/**
 * Hủy phiếu nháp chờ NKVH lưu → xử lý lượt giữ số của nó. Chưa thấy số trên NKVH (RESERVED) thì trả số
 * (RELEASED, gắn permitId để số được cấp lại); đã thấy trên NKVH (OBSERVED…) thì ghi hủy như phiếu đã cấp.
 */
export async function settleNkvhDraftNumber(tx: Tx, draft: Pick<WorkPermit, "id" | "kind" | "year" | "number" | "nkvhPctId">, user: Actor, note: string) {
  if (!draft.nkvhPctId) return;
  const held = await tx.workPermitNumberReservation.findFirst({ where: { kind: draft.kind, year: draft.year, number: draft.number, nkvhPctId: draft.nkvhPctId,
    status: { in: ["RESERVED", OBSERVED_NUMBER_STATUS, CONFIRMED_NUMBER_STATUS] } } });
  if (!held) return;
  const released = held.status === "RESERVED";
  await tx.workPermitNumberReservation.update({ where: { id: held.id }, data: released
    ? { status: "RELEASED", permitId: draft.id, nkvhPctId: null }
    : { status: "CANCELLED", permitId: draft.id, cancelledAt: new Date(), cancelledById: user.id, cancelReason: note } });
  await tx.workPermitNumberReservationHistory.create({ data: { reservationId: held.id, action: released ? "RELEASED" : "CANCELLED",
    actorId: user.id, actorName: user.name ?? "", permitId: draft.id, note: `Hủy phiếu chờ NKVH lưu: ${note}` } });
}
