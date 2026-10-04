import type { Prisma, WorkPermit } from "@prisma/client";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { NKVH_UUID } from "@/lib/nkvh-pct";
import { OPERATION_POSITION_TITLES } from "@/lib/positions";
import { DEFAULT_INTERNAL_TEAM_NAME } from "@/lib/work-permit-source-fields";
import { CONTRACTOR_PERMIT_TRANSITIONS, formatPermitNumber, PERMIT_DISCIPLINES, PERMIT_KINDS, PERMIT_TRANSITIONS, PERMIT_UNITS, type PermitKind, type PermitStatus } from "@/lib/work-permits";
import { parsePermit, permitSnapshot } from "@/lib/server/work-permits";
import { canonicalPermitNumber, consumePermitNumberReservation, lockPermitNumberScope, OBSERVED_NUMBER_STATUS, permitNumberHighWater, reservePermitNumber } from "@/lib/server/work-permit-number-reservations";

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
 *
 * Số gõ tay trên NKVH (sổ không biết) từng làm lệch dãy: sổ cấp lại đúng số đó cho phiếu sau, VHV sửa
 * tay sang số kế, sổ vẫn ghi số cũ và lượt sau lại trùng. Hai lớp chặn:
 *  - observeNkvhNumbers: tiện ích báo các số …/VH1-NĐDH đang thấy trên NKVH mà sổ chưa có → giữ chỗ
 *    OBSERVED để lần lấy số sau nhảy qua.
 *  - renumberNkvhPermit: ô Số phiếu NKVH khác số sổ đã cấp → sửa phiếu trên sổ theo NKVH.
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

/** Chỉ nhận số chính thức của sổ PXVH1; không nhận số NKVH tự sinh dạng …/NĐDH-VH1. */
export function parseExistingNkvhPermitNumber(value: unknown) {
  const normalized = text(value, 160).toUpperCase().replace(/\s+/g, "");
  const match = normalized.match(/^([0-9]{1,80})\/(20[0-9]{2})\/VH1-N[ĐD]DH$/u);
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

function validateNkvhIssueInput(kind: PermitKind, page: NkvhPage, input: { unit: unknown; position: unknown }) {
  const unit = typeof input.unit === "string" && Object.hasOwn(PERMIT_UNITS, input.unit) ? input.unit : "";
  if (!unit) throw fail("Vui lòng chọn tổ máy");
  const position = text(input.position, 200);
  if (!OPERATION_POSITION_TITLES.some(value => value === position)) throw fail("Vui lòng chọn cương vị");
  if (!page.content) throw fail("Trang NKVH chưa có nội dung công tác. Hãy mở phiếu ở bước B1.");
  if (page.qlvhCode && page.qlvhCode !== "VH") {
    throw fail("Phiếu này thuộc phân xưởng khác trên NKVH (Đơn vị QLVH không phải Phân xưởng Vận hành 1). Sổ PXVH1 không nhận phiếu này.");
  }
  if (TEAM_CODES[page.teamCode] === undefined && /^[0-9a-f-]{36}$/i.test(page.teamCode)) {
    throw fail("Đơn vị công tác trên NKVH là đơn vị ngoài. Tiện ích chỉ dùng cho PCT nội bộ; phiếu nhà thầu lấy số trên sổ PCT giấy.");
  }
  return { unit, position };
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
  const { unit, position } = validateNkvhIssueInput(kind, page, input);
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
 * Khôi phục phiếu đã được cấp số chính thức trên NKVH nhưng chưa có/ chưa gắn với sổ PXVH1.
 * Không sinh số mới: dùng đúng số đang hiện, dưới khóa dãy số và chỉ khi không xung đột.
 */
export async function importExistingNkvhPermit(tx: Tx, user: Actor, input: {
  kind: PermitKind; nkvhPctId: string; page: NkvhPage; unit: unknown; position: unknown; formattedNumber: unknown;
}, now = new Date()) {
  const { kind, nkvhPctId, page } = input;
  const { unit, position } = validateNkvhIssueInput(kind, page, input);
  const parsed = parseExistingNkvhPermitNumber(input.formattedNumber);
  const current = vnParts(now);
  if (parsed.year !== current.year) throw fail("Chỉ đồng bộ số PCT của năm hiện tại. Phiếu năm cũ cần quản trị đối chiếu trước.", 409);

  const baseline = await lockPermitNumberScope(tx, kind, parsed.year);
  const byNkvh = await tx.workPermit.findFirst({
    where: { kind, nkvhPctId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" },
    select: { id: true, number: true, year: true, status: true },
  });
  if (byNkvh) return nkvhClaimResult(byNkvh, false);

  const matching = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "WorkPermit"
    WHERE "kind" = ${kind} AND "year" = ${parsed.year} AND "status" <> 'CANCELLED'
      AND "number" ~ '^[0-9]+$' AND "number"::numeric = ${parsed.number}::numeric
    FOR UPDATE
  `;
  if (matching.length > 1) throw fail("Số PCT này đang có nhiều hồ sơ cũ trên sổ. Quản trị cần đối chiếu trước khi gắn NKVH.", 409);
  if (matching.length === 1) {
    const before = await tx.workPermit.findUniqueOrThrow({ where: { id: matching[0].id } });
    if (before.nkvhPctId && before.nkvhPctId !== nkvhPctId) throw fail("Số PCT này đã liên kết với một phiếu NKVH khác.", 409);
    if (["DRAFT", "CLOSED"].includes(before.status)) throw fail(`Phiếu ${formatPermitNumber(before)} trên sổ đang ở trạng thái không thể đồng bộ tự động.`, 409);
    const data = parsePermit({ ...rowBody(before), ...pageFields(page, kind), nkvhPctId }, before.status as PermitStatus, { allowIncompleteIssue: true });
    const after = await tx.workPermit.update({ where: { id: before.id }, data: {
      nkvhPctId, registrationNumber: data.registrationNumber, teamName: data.teamName,
      sourceClassification: data.sourceClassification, workType: data.workType, content: data.content,
      location: data.location, workScope: data.workScope, disciplines: data.disciplines,
      plannedStartAt: data.plannedStartAt, plannedEndAt: data.plannedEndAt,
      commanderName: data.commanderName, leaderName: data.leaderName, workerCount: data.workerCount,
      searchText: data.searchText, version: { increment: 1 },
    } });
    await tx.workPermitHistory.create({ data: { permitId: after.id, actorId: user.id, actorName: user.name ?? "",
      action: "Gắn và đồng bộ phiếu NKVH đã cấp số", before: permitSnapshot(before), after: permitSnapshot(after) } });
    return nkvhClaimResult(after, false);
  }

  const highWater = await permitNumberHighWater(tx, kind, parsed.year);
  const floor = BigInt(baseline) > BigInt(highWater) ? BigInt(baseline) : BigInt(highWater);
  if (BigInt(parsed.number) > floor + BigInt(1)) {
    throw fail(`Số ${parsed.number} vượt quá số tiếp theo dự kiến ${floor + BigInt(1)}. Quản trị cần đối chiếu mốc sổ trước.`, 409);
  }
  const cancelled = await tx.workPermitNumberReservation.findFirst({
    where: { kind, year: parsed.year, number: parsed.number, status: "CANCELLED" }, select: { id: true },
  });
  if (cancelled) throw fail("Số PCT này đã có lượt cấp bị hủy trên sổ. Quản trị cần đối chiếu trước khi dùng lại.", 409);

  let reservation = await tx.workPermitNumberReservation.findFirst({
    where: { kind, year: parsed.year, number: parsed.number, status: { in: ["RESERVED", "ISSUED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (reservation?.status === "ISSUED") throw fail("Số PCT này đã có lượt cấp trên sổ nhưng thiếu hồ sơ liên kết. Quản trị cần đối chiếu.", 409);
  // Số đã được ghi nhận "đã dùng trên NKVH" (lớp 2): ai mở đúng phiếu đó cũng nhận về được.
  reservation ??= await adoptObservedNumber(tx, user, { kind, year: parsed.year, number: parsed.number, status: "RESERVED",
    note: "Nhận số đã ghi nhận trên NKVH để đồng bộ về sổ" });
  if (reservation && reservation.ownerId !== user.id && user.role !== "ADMIN") {
    throw fail(`Số PCT này đang được ${reservation.ownerName || "người khác"} giữ. Người đã lấy số hoặc quản trị cần thực hiện đồng bộ.`, 409);
  }
  if (!reservation) {
    reservation = await tx.workPermitNumberReservation.create({ data: {
      kind, year: parsed.year, number: parsed.number, teamType: "INTERNAL", ownerId: user.id, ownerName: user.name ?? "",
    } });
    await tx.workPermitNumberReservationHistory.create({ data: { reservationId: reservation.id, action: "RESERVED",
      actorId: user.id, actorName: user.name ?? "", note: "Nhận số đã cấp trên NKVH để đồng bộ về sổ" } });
  }

  const issuerName = page.issuerName || user.name?.trim() || "";
  const data = parsePermit({
    ...pageFields(page, kind), kind, year: parsed.year, number: parsed.number, unit, position,
    workDate: page.plannedStartAt?.slice(0, 10) ?? current.day, teamType: "INTERNAL", format: "ELECTRONIC", nkvhPctId,
    issuerName, issuerUserId: issuerName === user.name?.trim() ? user.id : "", issuedAt: now.toISOString(),
  }, "ISSUED", { allowIncompleteIssue: true });
  const row = await tx.workPermit.create({ data: { ...data, status: "ISSUED", createdById: user.id, createdByName: user.name ?? "" } });
  await consumePermitNumberReservation(tx, { reservationId: reservation.id, kind, year: parsed.year, number: parsed.number,
    teamType: "INTERNAL", userId: user.id, userName: user.name ?? "", isAdmin: user.role === "ADMIN", permitId: row.id });
  await tx.workPermitHistory.create({ data: { permitId: row.id, actorId: user.id, actorName: user.name ?? "",
    action: "Nhập phiếu đã cấp số từ NKVH", after: permitSnapshot(row) } });
  return nkvhClaimResult(row, true);
}

function tryParsePxvh1Number(value: unknown) {
  try { return parseExistingNkvhPermitNumber(value); } catch { return null; }
}
const maxBigInt = (a: string, b: string) => BigInt(a) > BigInt(b) ? BigInt(a) : BigInt(b);

/**
 * Chuyển lượt OBSERVED của đúng số này (nếu có) thành lượt giữ/cấp của người đang nhận phiếu về sổ.
 * Trả về null khi số chưa được ghi nhận — người gọi tự tạo lượt mới như cũ.
 */
async function adoptObservedNumber(tx: Tx, user: Actor, input: {
  kind: PermitKind; year: number; number: string; status: "RESERVED" | "ISSUED"; permitId?: string; teamType?: string; note: string;
}) {
  const observed = await tx.workPermitNumberReservation.findFirst({
    where: { kind: input.kind, year: input.year, number: input.number, status: OBSERVED_NUMBER_STATUS }, orderBy: { createdAt: "asc" },
  });
  if (!observed) return null;
  const saved = await tx.workPermitNumberReservation.update({ where: { id: observed.id }, data: {
    status: input.status, ownerId: user.id, ownerName: user.name ?? "",
    ...(input.permitId ? { permitId: input.permitId, issuedAt: new Date() } : {}),
    ...(input.teamType ? { teamType: input.teamType } : {}),
  } });
  await tx.workPermitNumberReservationHistory.create({ data: { reservationId: observed.id, action: input.status,
    actorId: user.id, actorName: user.name ?? "", permitId: input.permitId ?? null, note: input.note } });
  return saved;
}

const OBSERVE_LIMIT = 200;
export type NkvhObserveResult = { recorded: string[]; ahead: Array<{ formatted: string; expected: string }> };

/**
 * Lớp 2 — sổ tự biết số gõ tay. Tiện ích gửi các số …/VH1-NĐDH đang thấy trên NKVH (trang danh sách,
 * hoặc ô Số phiếu lúc mở trang chi tiết chưa liên kết). Số nằm ĐÚNG ngay sau số cao nhất sổ đang biết
 * được giữ chỗ OBSERVED, nên "Lấy số PCT" lần sau nhảy qua. Xét theo thứ tự tăng dần: 4464, 4465 gõ
 * tay liên tiếp đều được ghi.
 *  - Số ≤ số cao nhất: đã có trên sổ hoặc là lỗ dưới dãy — không ảnh hưởng số cấp tiếp, bỏ qua.
 *  - Số nhảy cóc (> kế tiếp): KHÔNG ghi — một số gõ nhầm 9999 sẽ đẩy cả dãy lên — chỉ báo về để đối chiếu.
 *  - Chỉ nhận số năm hiện tại.
 */
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

  const baseline = await lockPermitNumberScope(tx, input.kind, year);
  let floor = maxBigInt(baseline, await permitNumberHighWater(tx, input.kind, year));
  const numbers = [...pctIds.keys()].map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const value of numbers) {
    if (value <= floor) continue;
    const number = value.toString();
    if (value > floor + BigInt(1)) {
      result.ahead.push({ formatted: formatPermitNumber({ number, year }), expected: formatPermitNumber({ number: (floor + BigInt(1)).toString(), year }) });
      continue;
    }
    const pct = pctIds.get(number);
    const row = await tx.workPermitNumberReservation.create({ data: {
      kind: input.kind, year, number, teamType: "INTERNAL", status: OBSERVED_NUMBER_STATUS, ownerId: user.id, ownerName: user.name ?? "",
    } });
    await tx.workPermitNumberReservationHistory.create({ data: { reservationId: row.id, action: OBSERVED_NUMBER_STATUS,
      actorId: user.id, actorName: user.name ?? "",
      note: `Số đã dùng trên NKVH${pct ? ` (id_pct ${pct})` : ""} nhưng sổ chưa có hồ sơ — giữ chỗ để không cấp trùng` } });
    floor = value;
    result.recorded.push(formatPermitNumber({ number, year }));
  }
  return result;
}

/**
 * Lớp 1 — ô Số phiếu trên NKVH khác số sổ đã cấp cho chính phiếu đó (VHV sửa tay vì số sổ đưa ra đã
 * bị người khác dùng) → sửa phiếu trên sổ theo NKVH. Số đích phải trống trên sổ (không phiếu nào khác,
 * không lượt đang giữ / đã hủy) và không vượt quá số kế tiếp — trừ khi đã được ghi nhận OBSERVED.
 * Số cũ trả về dãy (RELEASED): phiếu NKVH đang thật sự dùng số đó nhận lại bằng "Đồng bộ số hiện có".
 * Phiếu đã Kết thúc chỉ quản trị mới sửa số.
 */
export async function renumberNkvhPermit(tx: Tx, user: Actor, input: { kind: PermitKind; nkvhPctId: string; formattedNumber: unknown }) {
  const { kind, nkvhPctId } = input;
  const target = parseExistingNkvhPermitNumber(input.formattedNumber);
  const formatted = formatPermitNumber(target);
  const found = await tx.workPermit.findFirst({ where: { kind, nkvhPctId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, select: { id: true, year: true } });
  if (!found) throw fail("Phiếu NKVH này chưa lấy số trên sổ PXVH1 — không có gì để sửa số", 404);
  if (found.year !== target.year) throw fail(`Số trên NKVH thuộc năm ${target.year}, phiếu trên sổ thuộc năm ${found.year}. Quản trị cần đối chiếu.`, 409);

  const baseline = await lockPermitNumberScope(tx, kind, target.year);
  await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${found.id} FOR UPDATE`;
  const before = await tx.workPermit.findUniqueOrThrow({ where: { id: found.id } });
  const previous = formatPermitNumber(before);
  if (/^[0-9]+$/.test(before.number) && BigInt(before.number) === BigInt(target.number)) {
    return { ...nkvhClaimResult(before, false), previous, changed: false };
  }
  if (before.status === "DRAFT") throw fail(`Phiếu ${previous} trên sổ đang ở trạng thái nháp, không sửa số theo NKVH được.`, 409);
  if (before.status === "CLOSED" && user.role !== "ADMIN") throw fail(`Phiếu ${previous} đã kết thúc trên sổ. Báo quản trị sửa số theo NKVH.`, 409);

  const owner = await tx.$queryRaw<Array<{ nkvhPctId: string | null }>>`
    SELECT "nkvhPctId" FROM "WorkPermit"
    WHERE "kind" = ${kind} AND "year" = ${target.year} AND "status" NOT IN ('DRAFT', 'CANCELLED')
      AND "number" ~ '^[0-9]+$' AND "number"::numeric = ${target.number}::numeric AND "id" <> ${before.id}
    LIMIT 1
  `;
  if (owner.length) {
    throw fail(`Số ${formatted} đã thuộc một phiếu khác trên sổ (${owner[0].nkvhPctId ? "PCT điện tử liên kết phiếu NKVH khác" : "phiếu chưa liên kết NKVH hoặc PCT giấy"}). Kiểm tra lại số trên NKVH; nếu NKVH thật sự trùng số, báo quản trị đối chiếu.`, 409);
  }
  const held = await tx.workPermitNumberReservation.findFirst({
    where: { kind, year: target.year, number: target.number, status: { in: ["RESERVED", "ISSUED", "CANCELLED"] } }, orderBy: { createdAt: "desc" },
  });
  if (held?.status === "CANCELLED") throw fail(`Số ${formatted} đã có lượt cấp bị hủy trên sổ. Quản trị cần đối chiếu trước khi dùng lại.`, 409);
  if (held?.status === "RESERVED") throw fail(`Số ${formatted} đang được ${held.ownerName || "người khác"} giữ trên sổ (đã lấy số, chưa lưu phiếu). Kiểm tra lại số trên NKVH.`, 409);
  if (held) throw fail(`Số ${formatted} đã có lượt cấp trên sổ nhưng thiếu hồ sơ liên kết. Quản trị cần đối chiếu.`, 409);
  const observed = await tx.workPermitNumberReservation.findFirst({
    where: { kind, year: target.year, number: target.number, status: OBSERVED_NUMBER_STATUS }, select: { id: true },
  });
  if (!observed) {
    const next = maxBigInt(baseline, await permitNumberHighWater(tx, kind, target.year)) + BigInt(1);
    if (BigInt(target.number) > next) {
      throw fail(`Số ${formatted} vượt quá số tiếp theo dự kiến ${formatPermitNumber({ number: next.toString(), year: target.year })} của sổ. Kiểm tra lại số trên NKVH; nếu đúng, quản trị cần đối chiếu mốc sổ.`, 409);
    }
  }

  const note = `Sửa số theo NKVH: ${previous} → ${formatted}`;
  // permitId là duy nhất: gỡ khỏi lượt cũ trước rồi mới gắn vào lượt của số mới.
  const old = await tx.workPermitNumberReservation.findUnique({ where: { permitId: before.id } });
  if (old) {
    await tx.workPermitNumberReservation.update({ where: { id: old.id }, data: { status: "RELEASED", permitId: null } });
    await tx.workPermitNumberReservationHistory.create({ data: { reservationId: old.id, action: "RELEASED",
      actorId: user.id, actorName: user.name ?? "", permitId: before.id, note: `${note}. Số ${previous} trả về dãy.` } });
  }
  const adopted = await adoptObservedNumber(tx, user, { kind, year: target.year, number: target.number, status: "ISSUED",
    permitId: before.id, teamType: before.teamType, note });
  if (!adopted) {
    const row = await tx.workPermitNumberReservation.create({ data: {
      kind, year: target.year, number: target.number, teamType: before.teamType, status: "ISSUED",
      ownerId: user.id, ownerName: user.name ?? "", permitId: before.id, issuedAt: new Date(),
    } });
    await tx.workPermitNumberReservationHistory.create({ data: { reservationId: row.id, action: "ISSUED",
      actorId: user.id, actorName: user.name ?? "", permitId: before.id, note } });
  }
  const data = parsePermit({ ...rowBody(before), number: target.number }, before.status as PermitStatus, { allowIncompleteIssue: true });
  const after = await tx.workPermit.update({ where: { id: before.id }, data: {
    number: target.number, searchText: data.searchText, version: { increment: 1 },
  } });
  await tx.workPermitHistory.create({ data: { permitId: after.id, actorId: user.id, actorName: user.name ?? "",
    action: note, before: permitSnapshot(before), after: permitSnapshot(after) } });
  return { ...nkvhClaimResult(after, false), previous, changed: true };
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
