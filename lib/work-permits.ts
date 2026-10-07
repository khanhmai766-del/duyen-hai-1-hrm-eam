import { safetySummary, type SafetySelection } from "@/lib/work-permit-safety";
import { overhaulItemsOf, type OverhaulItemProgress, type OverhaulItemSnapshot } from "@/lib/work-permit-overhaul";
import { attendanceInside } from "@/lib/work-permit-attendance";
export const PERMIT_PAGE_SIZE = 25;
/** Ghép số thuần theo mẫu chung Cơ/Điện; số đầy đủ hoặc mã cũ giữ nguyên. */
/**
 * Người này có phải CHTT của lần làm việc không. So theo hồ sơ khi cả hai còn id; lần làm việc mà Quản trị đã xoá
 * hồ sơ CHTT (commanderId rỗng) thì so theo số thẻ đã chụp lại.
 */
export function isSessionCommander(member: { personId?: string | null; code?: string | null }, session: { commanderId: string | null; commanderCode: string }) {
  if (member.personId && session.commanderId) return member.personId === session.commanderId;
  return Boolean(member.code) && member.code === session.commanderCode;
}
/**
 * Nhân viên (KHÔNG tính CHTT) còn trong khu vực của lần làm việc. Còn người thì KHÔNG được kết thúc lần làm việc — phải
 * quét ra từng người trước (server cũng chặn). CHTT rút ra cùng lúc kết thúc.
 */
export function workersStillInside<M extends { personId?: string | null; code?: string | null; attendance?: Array<{ in: string; out: string | null }> | null }>(members: M[], session: { commanderId: string | null; commanderCode: string }) {
  return members.filter(member => attendanceInside(member) && !isSessionCommander(member, session));
}
export function formatPermitNumber(row: { number: string; year: number; nkvhNumber?: string | null }): string {
  const number = row.number.trim().toUpperCase().replace(/\s+/g, "");
  if (row.nkvhNumber) return row.nkvhNumber;
  return /^\d+$/.test(number) ? `${number}/${row.year}/VH1-NĐDH` : number;
}

/** Còn ≤ ngần này ngày tới "Kết thúc công việc dự kiến" thì nhắc. */
export const PERMIT_DEADLINE_WARN_DAYS = 2;
export type PermitDeadline = { state: "ok" | "soon" | "overdue"; msLeft: number; label: string } | null;
/**
 * Hạn thực hiện của PCT nhà thầu theo "Kết thúc công việc dự kiến". Quá hạn mà công tác chưa xong thì theo quy định phải
 * kết thúc phiếu này và cấp PCT mới (số mới) — nên server chặn mở / bàn giao lần làm việc. null = không áp dụng.
 */
export function permitDeadline(row: { teamType: string; status: string; plannedEndAt?: Date | string | null }, now: Date = new Date()): PermitDeadline {
  if (row.teamType !== "CONTRACTOR" || !row.plannedEndAt || ["DRAFT", "CLOSED", "CANCELLED"].includes(row.status)) return null;
  const msLeft = new Date(row.plannedEndAt).getTime() - now.getTime();
  if (!Number.isFinite(msLeft)) return null;
  if (msLeft <= 0) return { state: "overdue", msLeft, label: "Quá hạn — cần kết thúc phiếu, cấp PCT mới" };
  if (msLeft > PERMIT_DEADLINE_WARN_DAYS * 86_400_000) return { state: "ok", msLeft, label: "" };
  const hours = Math.ceil(msLeft / 3_600_000);
  const days = Math.floor(hours / 24), rest = hours % 24;
  return { state: "soon", msLeft, label: `Sắp hết hạn · còn ${days ? `${days} ngày${rest ? ` ${rest} giờ` : ""}` : `${hours} giờ`}` };
}

export const PERMIT_FORMATS = { PAPER: "PCT giấy", ELECTRONIC: "PCT điện tử" } as const;
export type PermitFormatValue = keyof typeof PERMIT_FORMATS;
export function defaultPermitFormat(teamType: string): PermitFormatValue { return teamType === "CONTRACTOR" ? "PAPER" : "ELECTRONIC"; }
export function effectivePermitFormat(row: { format?: string | null; teamType: string }): PermitFormatValue {
  return row.format === "PAPER" || row.format === "ELECTRONIC" ? row.format : defaultPermitFormat(row.teamType);
}
export const PERMIT_KINDS = { MECHANICAL: "Cơ – Nhiệt – Hóa", ELECTRICAL: "Điện" } as const;
export const PERMIT_WORK_TYPES = {
  PLANNED: "Kế hoạch (KH)",
  UNPLANNED: "Đột xuất (ĐX)",
  INCIDENT: "Sự cố (SC)",
} as const;
export const PERMIT_WORK_TYPE_CODES = { PLANNED: "KH", UNPLANNED: "ĐX", INCIDENT: "SC" } as const;
export type PermitWorkType = keyof typeof PERMIT_WORK_TYPES;
export const PERMIT_CONTRACTOR_SCOPES = { SCTX: "SCTX", OVERHAUL: "Đại tu" } as const;
export type PermitContractorScope = keyof typeof PERMIT_CONTRACTOR_SCOPES;
/**
 * Nhân sự nhà thầu chia hai nhóm SCTX / Đại tu (07/10/2026): PCT nhà thầu nhóm nào chỉ nhận CHTT và nhân viên nhóm đó.
 * Trả câu báo lỗi khi lệch nhóm; phiếu chưa có nhóm (phiếu cũ) hoặc hồ sơ chưa có nhóm → không chặn.
 */
export function personScopeError(person: { name: string; scope?: string | null }, permitScope: string | null | undefined) {
  if (!permitScope || !person.scope || person.scope === permitScope) return null;
  const label = (scope: string) => PERMIT_CONTRACTOR_SCOPES[scope as PermitContractorScope] ?? scope;
  return `${person.name} thuộc nhân sự ${label(person.scope)}, không dùng cho PCT nhà thầu ${label(permitScope)}. Đổi nhóm trong hồ sơ nhân sự nếu cần.`;
}
/** Phân loại đơn vị nhà thầu (danh bạ đơn vị): được cấp PCT nhóm SCTX / Đại tu. */
export type PermitCompanyScopes = { sctx: boolean; overhaul: boolean };
/** Đơn vị chưa tick nhóm nào = "Chưa phân loại". */
export const companyUnclassified = (company: PermitCompanyScopes) => !company.sctx && !company.overhaul;
/**
 * Đơn vị có được chọn cho PCT nhà thầu nhóm `scope` không (nghiệp vụ 06/10/2026): chưa phân loại → được cả hai nhóm
 * (giai đoạn chuyển đổi); đã phân loại → chỉ nhóm đã tick. Không có thông tin đơn vị / nhóm → không chặn.
 */
export function companyAllowsScope(company: PermitCompanyScopes | null | undefined, scope: string | null | undefined) {
  if (!company || !scope || companyUnclassified(company)) return true;
  return scope === "OVERHAUL" ? company.overhaul : company.sctx;
}
/** Nhãn phân loại: "SCTX", "Đại tu", "SCTX + Đại tu", "Chưa phân loại". */
export function companyScopeLabel(company: PermitCompanyScopes) {
  if (companyUnclassified(company)) return "Chưa phân loại";
  return [company.sctx && PERMIT_CONTRACTOR_SCOPES.SCTX, company.overhaul && PERMIT_CONTRACTOR_SCOPES.OVERHAUL].filter(Boolean).join(" + ");
}
/** PCT nhà thầu SCTX có thể ghi nhận cấp nhanh, chưa cần danh bạ đơn vị/CHTT. */
export function isSctxContractorPermit(row: { teamType: string; contractorScope?: string | null }): boolean {
  return row.teamType === "CONTRACTOR" && row.contractorScope === "SCTX";
}
export const PERMIT_SOURCE_CLASSIFICATIONS = {
  PLANNED: "Kế hoạch",
  OFF_PLAN: "Ngoài kế hoạch",
  UNEXPECTED: "Đột xuất",
} as const;
export type PermitSourceClassification = keyof typeof PERMIT_SOURCE_CLASSIFICATIONS;
/**
 * Ô "Phân loại" trên phiếu (Kế hoạch / Ngoài kế hoạch / Đột xuất) quyết định ký hiệu KH/ĐX ở cột Loại
 * và bộ lọc KH/ĐX/SC: Kế hoạch → KH; Ngoài kế hoạch và Đột xuất đều là việc ngoài kế hoạch → ĐX.
 * Sự cố (SC) không có trên mẫu phiếu nên không suy ra từ đây.
 */
export const SOURCE_CLASSIFICATION_WORK_TYPE = { PLANNED: "PLANNED", OFF_PLAN: "UNPLANNED", UNEXPECTED: "UNPLANNED" } as const;
/** Phân loại KH/ĐX/SC để hiển thị: ưu tiên ô Phân loại trên phiếu, phiếu không có ô này dùng workType đã lưu. */
export function effectiveWorkType(row: { workType?: string | null; sourceClassification?: string | null }): PermitWorkType | null {
  const derived = row.sourceClassification ? SOURCE_CLASSIFICATION_WORK_TYPE[row.sourceClassification as PermitSourceClassification] : undefined;
  return derived ?? (row.workType as PermitWorkType | null | undefined) ?? null;
}
export const PERMIT_STATUSES = {
  DRAFT: "Nháp", ISSUED: "Đã cấp", ACTIVE: "Đang thực hiện",
  PAUSED: "Tạm dừng", WAITING: "Chờ làm tiếp", CLOSED: "Kết thúc phiếu", CANCELLED: "Đã hủy",
} as const;
export type PermitKind = keyof typeof PERMIT_KINDS;
export type PermitStatus = keyof typeof PERMIT_STATUSES;
export const PERMIT_UNITS = { S1: "Tổ máy S1", S2: "Tổ máy S2", COMMON: "Dùng chung", UNKNOWN: "Chưa xác định" } as const;
export const PERMIT_TRANSITIONS: Record<PermitStatus, readonly PermitStatus[]> = {
  DRAFT: ["ISSUED", "CANCELLED"], ISSUED: ["CLOSED", "CANCELLED"],
  // Phiếu nội bộ cũ ở trạng thái thực hiện vẫn được chốt/hủy, không mở thêm vòng thực hiện.
  ACTIVE: ["CLOSED", "CANCELLED"], PAUSED: ["CLOSED", "CANCELLED"], WAITING: ["CLOSED", "CANCELLED"],
  CLOSED: [], CANCELLED: [],
};
// ACTIVE/WAITING của nhà thầu chỉ do API mở/kết thúc lần làm việc thay đổi.
export const CONTRACTOR_PERMIT_TRANSITIONS: Record<PermitStatus, readonly PermitStatus[]> = {
  DRAFT: ["ISSUED", "CANCELLED"], ISSUED: ["CANCELLED"], ACTIVE: [], PAUSED: [],
  WAITING: ["CLOSED", "CANCELLED"], CLOSED: [], CANCELLED: [],
};
export const PERMIT_DISCIPLINES = { HYDRO: "Thủy", MECHANICAL: "Cơ", THERMAL: "Nhiệt", CHEMICAL: "Hóa" } as const;
export type PermitDiscipline = keyof typeof PERMIT_DISCIPLINES;
export interface PermitInput {
  /** Có khi đang sửa phiếu đã lưu (form dựng từ bản ghi) — server không đọc trường này từ body. */
  id?: string;
  managingUnit?: string;
  plantName?: string;
  registrationNumber?: string;
  workScope?: string;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  disciplines?: PermitDiscipline[];
  safetyItems?: SafetySelection[];
  format?: PermitFormatValue | null;
  workType: PermitWorkType | null;
  sourceClassification?: PermitSourceClassification | null;
  kind: PermitKind; year: number; number: string; position: string; unit: keyof typeof PERMIT_UNITS;
  content: string; location: string; workDate: string;
  issuerUserId?: string | null; commanderPersonId?: string | null;
  issuerName: string; issuerPosition?: string; electricalSafetySupervisorName: string; leaderName: string; commanderName: string; teamName: string;
  workerCount: number | null; authorizerName: string;
  teamType: "INTERNAL" | "CONTRACTOR";
  contractorScope: PermitContractorScope | null;
  /** Hạng mục đại tu đã chọn (chỉ phiếu nhà thầu · Đại tu) — lib/work-permit-overhaul.ts. */
  overhaulItems?: OverhaulItemSnapshot[] | null;
  /**
   * Chỉ khi CẤP PCT nhà thầu · Đại tu không chọn hạng mục nào: true = tạo hạng mục PHÁT SINH PS.1.x (thiết bị = Địa điểm,
   * nội dung = Nội dung công việc) ở tab cương vị và ghi lên Sheet tiến độ. Không lưu trên phiếu.
   */
  overhaulExtra?: boolean;
  members: PermitMember[];
  issuedAt: string | null; authorizedAt: string | null; closedAt: string | null;
  result: string; note: string; statusReason: string;
  defectId?: string | null;
  nkvhNumber?: string | null;
  nkvhPctId?: string | null;
  repairRequestNumber: string;
}
export interface PermitRow extends PermitInput {
  id: string; status: PermitStatus; progress: number | null; version: number;
  createdById: string; createdByName: string; createdAt: string; updatedAt: string;
  sessions?: PermitSession[];
}
export interface PermitHistory {
  id: string; actorName: string; action: string; createdAt: string;
  before: Record<string, unknown> | null; after: Record<string, unknown>;
}
export const PERMIT_FIELD_LABELS: Record<string, string> = {
  managingUnit: "Đơn vị QLVH", plantName: "Nhà máy",
  nkvhPctId: "ID liên kết NKVH",
  registrationNumber: "Số ĐKCT", workScope: "Phạm vi công tác", plannedStartAt: "Dự kiến bắt đầu", plannedEndAt: "Dự kiến kết thúc", disciplines: "Chuyên môn",
  safetyItems: "Mối nguy và biện pháp an toàn", format: "Hình thức phiếu", workType: "Phân loại công việc (KH/ĐX/SC)", sourceClassification: "Phân loại", kind: "Loại PCT", year: "Năm cấp số", number: "Số PCT", position: "Cương vị", status: "Trạng thái", unit: "Tổ máy",
  content: "Nội dung công việc", location: "Thiết bị / vị trí", workDate: "Ngày thực hiện",
  issuerName: "Người cấp PCT", issuerPosition: "Chức vụ người cấp PCT", electricalSafetySupervisorName: "Người giám sát an toàn điện", leaderName: "Người lãnh đạo công việc", commanderName: "Người chỉ huy trực tiếp",
  teamName: "Đơn vị công tác", workerCount: "Số nhân viên", authorizerName: "Người cho phép làm việc",
  issuedAt: "Thời điểm cấp", authorizedAt: "Lần đầu cho phép làm việc", closedAt: "Thời điểm đóng PCT",
  result: "Kết quả công việc", note: "Ghi chú", statusReason: "Lý do tạm dừng / hủy", repairRequestNumber: "Số SYC",
  teamType: "Loại đơn vị", contractorScope: "Nhóm phiếu nhà thầu", overhaulItems: "Hạng mục đại tu", members: "Danh sách nhân viên công tác",
};
export function permitValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "disciplines" && Array.isArray(value)) return value.map(v => PERMIT_DISCIPLINES[v as PermitDiscipline] ?? v).join(" / ") || "—";
  if (key === "safetyItems") return safetySummary(value);
  if (key === "format") return PERMIT_FORMATS[value as PermitFormatValue] ?? String(value);
  if (key === "status") return PERMIT_STATUSES[value as PermitStatus] ?? String(value);
  if (key === "workType") return PERMIT_WORK_TYPES[value as PermitWorkType] ?? String(value);
  if (key === "sourceClassification") return PERMIT_SOURCE_CLASSIFICATIONS[value as PermitSourceClassification] ?? String(value);
  if (key === "kind") return PERMIT_KINDS[value as PermitKind] ?? String(value);
  if (key === "unit") return PERMIT_UNITS[value as keyof typeof PERMIT_UNITS] ?? String(value);
  if (key === "teamType") return value === "CONTRACTOR" ? "Nhà thầu" : "Nội bộ";
  if (key === "contractorScope") return PERMIT_CONTRACTOR_SCOPES[value as PermitContractorScope] ?? String(value);
  if (key === "overhaulItems") return overhaulItemsOf(value).map(item => item.code).join(", ") || "—";
  if (key === "members" && Array.isArray(value)) return value.map(p => [p.code, p.name, p.company].filter(Boolean).join(" · ")).join("\n") || "—";
  if (["issuedAt", "authorizedAt", "closedAt", "plannedStartAt", "plannedEndAt"].includes(key)) return new Date(String(value)).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  if (key === "workDate") return String(value).split("-").reverse().join("/");
  return String(value);
}

/** code lưu số thẻ ra vào cổng thực tế; personId là khóa ổn định khi số thẻ được chỉnh sửa. */
export interface PermitMember {
  personId?: string; code: string; name: string; company: string;
  /** Chỉ có ở thành viên của LẦN LÀM VIỆC: các lượt vào/ra vị trí (lib/work-permit-attendance.ts). */
  attendance?: Array<{ in: string; out: string | null }>;
}
export interface PermitPerson {
  id: string; code: string; name: string; company: string; phone: string;
  canCommand: boolean; isActive: boolean; version: number;
  /** Nhóm nhân sự: SCTX (không cần ảnh) / Đại tu (đủ họ tên, ảnh, chức vụ). */
  scope?: PermitContractorScope;
  /** Thông tin thẻ ra vào cổng & ATVSLĐ (đồng bộ từ Google Sheets); ảnh qua proxy S3. */
  birthYear?: string; jobTitle?: string; workPackage?: string; workPosition?: string; workArea?: string;
  trainingResult?: string; trainedAt?: string | null; cardIssuedAt?: string | null; cardExpiresAt?: string | null; photoUrl?: string | null;
  activeWorks?: Array<{ sessionId: string; role: "CHTT" | "MEMBER"; openedAt: string; permit: { id: string; number: string; year: number; kind: PermitKind } }>;
  activeWork?: { openedAt: string; permit: { number: string; year: number; kind: PermitKind } } | null;
}
export interface PermitSession {
  id: string; permitId: string; commanderId: string | null; commanderCode: string;
  commanderName: string; company: string; members: PermitMember[]; workerCount: number;
  openedAt: string; endedAt: string | null; authorizerName: string;
  endConfirmedByName: string; endNote: string; progress: number | null; createdByName: string; endedByName: string | null;
  /** PCT đại tu: kết quả từng hạng mục lúc kết thúc. */
  itemProgress?: OverhaulItemProgress[] | null;
}
export type PermitHistorySummary = Pick<PermitHistory, "id" | "actorName" | "action" | "createdAt">;
/** Phiếu nháp có liên kết NKVH = đã lấy số từ tiện ích, đang chờ NKVH lưu để thành Đã cấp. */
export const isNkvhPendingPermit = (row: Pick<PermitRow, "status" | "nkvhPctId">) => row.status === "DRAFT" && Boolean(row.nkvhPctId);
/** Chờ NKVH lưu quá lâu → sổ cảnh báo đỏ (không tự hủy: có thể phiếu đang làm dở). */
export const NKVH_PENDING_STALE_MS = 2 * 3600_000;
export const isNkvhPendingStale = (row: Pick<PermitRow, "createdAt">, now = Date.now()) => now - new Date(row.createdAt).getTime() > NKVH_PENDING_STALE_MS;
export type PermitListRow = Pick<PermitRow, "id" | "number" | "year" | "kind" | "format" | "workType" | "workDate" | "content" | "location" | "position" | "unit" | "issuerName" | "commanderName" | "teamName" | "teamType" | "contractorScope" | "workerCount" | "authorizerName" | "status" | "progress" | "repairRequestNumber" | "nkvhPctId" | "nkvhNumber" | "sourceClassification" | "plannedEndAt" | "statusReason" | "createdAt" | "createdByName"> & { sessions: Array<Pick<PermitSession, "commanderName" | "company" | "authorizerName">> };
export interface PermitDetailRow extends PermitRow {
  history: PermitHistorySummary[]; sessions: PermitSession[]; _count: { sessions: number; history: number };
  /** PCT đại tu: % lũy kế gần nhất theo overhaulItemKey. */
  overhaulPercents?: Record<string, number>;
  /** PCT đại tu: ghi chú gần nhất theo overhaulItemKey (điền sẵn ô ghi chú khi cập nhật tiếp). */
  overhaulNotes?: Record<string, string>;
}

export interface DefectLinkedWorkPermit {
  nkvhNumber?: string | null;
  nkvhPctId?: string | null;
  id: string;
  number: string;
  year: number;
  kind: PermitKind;
  format: PermitFormatValue | null;
  teamType: "INTERNAL" | "CONTRACTOR";
  workDate: string;
}
