import { safetySummary, type SafetySelection } from "@/lib/work-permit-safety";
export const PERMIT_PAGE_SIZE = 10;
/** Ghép số thuần theo mẫu chung Cơ/Điện; số đầy đủ hoặc mã cũ giữ nguyên. */
export function formatPermitNumber(row: { number: string; year: number }): string {
  const number = row.number.trim().toUpperCase().replace(/\s+/g, "");
  return /^\d+$/.test(number) ? `${number}/${row.year}/VH1-NĐDH` : number;
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
export const PERMIT_STATUSES = {
  DRAFT: "Nháp", ISSUED: "Đã cấp", ACTIVE: "Đang thực hiện",
  PAUSED: "Tạm dừng", WAITING: "Chờ làm tiếp", CLOSED: "Đã đóng", CANCELLED: "Đã hủy",
} as const;
export type PermitKind = keyof typeof PERMIT_KINDS;
export type PermitStatus = keyof typeof PERMIT_STATUSES;
export const PERMIT_UNITS = { S1: "Tổ máy S1", S2: "Tổ máy S2", COMMON: "Dùng chung" } as const;
export const PERMIT_TRANSITIONS: Record<PermitStatus, readonly PermitStatus[]> = {
  DRAFT: ["ISSUED", "CANCELLED"], ISSUED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["PAUSED", "CLOSED"], PAUSED: ["ACTIVE", "CLOSED", "CANCELLED"], WAITING: [],
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
  registrationNumber?: string;
  workScope?: string;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  disciplines?: PermitDiscipline[];
  safetyItems?: SafetySelection[];
  format?: PermitFormatValue | null;
  workType: PermitWorkType | null;
  kind: PermitKind; year: number; number: string; position: string; unit: keyof typeof PERMIT_UNITS;
  content: string; location: string; workDate: string;
  issuerUserId?: string | null; commanderPersonId?: string | null;
  issuerName: string; electricalSafetySupervisorName: string; leaderName: string; commanderName: string; teamName: string;
  workerCount: number | null; authorizerName: string;
  teamType: "INTERNAL" | "CONTRACTOR";
  members: PermitMember[];
  issuedAt: string | null; authorizedAt: string | null; closedAt: string | null;
  result: string; note: string; statusReason: string; repairRequestNumber: string;
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
  registrationNumber: "Số ĐKCT", workScope: "Phạm vi công tác", plannedStartAt: "Dự kiến bắt đầu", plannedEndAt: "Dự kiến kết thúc", disciplines: "Chuyên môn",
  safetyItems: "Mối nguy và biện pháp an toàn", format: "Hình thức phiếu", workType: "Phân loại công việc (KH/ĐX/SC)", kind: "Loại PCT", year: "Năm cấp số", number: "Số PCT", position: "Cương vị", status: "Trạng thái", unit: "Tổ máy",
  content: "Nội dung công việc", location: "Thiết bị / vị trí", workDate: "Ngày thực hiện",
  issuerName: "Người cấp PCT", electricalSafetySupervisorName: "Người giám sát an toàn điện", leaderName: "Người lãnh đạo công việc", commanderName: "Người chỉ huy trực tiếp",
  teamName: "Đơn vị công tác", workerCount: "Số nhân viên", authorizerName: "Người cho phép làm việc",
  issuedAt: "Thời điểm cấp", authorizedAt: "Lần đầu cho phép làm việc", closedAt: "Thời điểm đóng PCT",
  result: "Kết quả công việc", note: "Ghi chú", statusReason: "Lý do tạm dừng / hủy", repairRequestNumber: "Số SYC",
  teamType: "Loại đơn vị", members: "Danh sách nhân viên công tác",
};
export function permitValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "disciplines" && Array.isArray(value)) return value.map(v => PERMIT_DISCIPLINES[v as PermitDiscipline] ?? v).join(" / ") || "—";
  if (key === "safetyItems") return safetySummary(value);
  if (key === "format") return PERMIT_FORMATS[value as PermitFormatValue] ?? String(value);
  if (key === "status") return PERMIT_STATUSES[value as PermitStatus] ?? String(value);
  if (key === "workType") return PERMIT_WORK_TYPES[value as PermitWorkType] ?? String(value);
  if (key === "kind") return PERMIT_KINDS[value as PermitKind] ?? String(value);
  if (key === "unit") return PERMIT_UNITS[value as keyof typeof PERMIT_UNITS] ?? String(value);
  if (key === "teamType") return value === "CONTRACTOR" ? "Nhà thầu" : "Nội bộ";
  if (key === "members" && Array.isArray(value)) return value.map(p => [p.code, p.name, p.company].filter(Boolean).join(" · ")).join("\n") || "—";
  if (["issuedAt", "authorizedAt", "closedAt", "plannedStartAt", "plannedEndAt"].includes(key)) return new Date(String(value)).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  if (key === "workDate") return String(value).split("-").reverse().join("/");
  return String(value);
}

/** code lưu số thẻ an toàn thực tế; giữ khóa API để tương thích dữ liệu đã có. */
export interface PermitMember { personId?: string; code: string; name: string; company: string }
export interface PermitPerson {
  id: string; code: string; name: string; company: string;
  canCommand: boolean; isActive: boolean; version: number;
  activeWorks?: Array<{ sessionId: string; role: "CHTT" | "MEMBER"; openedAt: string; permit: { id: string; number: string; year: number; kind: PermitKind } }>;
  activeWork?: { openedAt: string; permit: { number: string; year: number; kind: PermitKind } } | null;
}
export interface PermitSession {
  id: string; permitId: string; commanderId: string; commanderCode: string;
  commanderName: string; company: string; members: PermitMember[]; workerCount: number;
  openedAt: string; endedAt: string | null; authorizerName: string;
  endConfirmedByName: string; endNote: string; progress: number | null; createdByName: string; endedByName: string | null;
}
export type PermitHistorySummary = Pick<PermitHistory, "id" | "actorName" | "action" | "createdAt">;
export type PermitListRow = Pick<PermitRow, "id" | "number" | "year" | "kind" | "format" | "workType" | "workDate" | "content" | "location" | "position" | "unit" | "issuerName" | "commanderName" | "teamName" | "teamType" | "workerCount" | "authorizerName" | "status" | "progress" | "repairRequestNumber"> & { sessions: Array<Pick<PermitSession, "commanderName" | "company" | "authorizerName">> };
export interface PermitDetailRow extends PermitRow { history: PermitHistorySummary[]; sessions: PermitSession[]; _count: { sessions: number; history: number } }
