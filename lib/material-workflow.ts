import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";
import { isShiftCommandPosition } from "@/lib/constants";

/* ============================================================
   lib/material-workflow.ts
   Nhận diện cương vị & kiểm tra phạm vi cây thiết bị (PositionSystemScope)
   cho workflow Phiếu thay thế vật tư.
   ============================================================ */

/** Chuẩn hóa chuỗi cương vị: thường hóa + bỏ khoảng thừa */
function norm(s?: string | null) {
  return normalizeText(s || "").trim();
}

/**
 * Cương vị hành chính/kỹ thuật vẫn có thể được giao phiếu vật tư dù không nằm
 * trong danh mục cương vị vận hành (và vì vậy không bắt buộc có phạm vi cây
 * thiết bị trong PositionSystemScope).
 */
export const MATERIAL_TICKET_EXTRA_ASSIGNED_POSITIONS = ["Kỹ thuật viên", "Thống kê"] as const;

export function isMaterialTicketExtraAssignedPosition(position?: string | null) {
  const value = norm(position);
  return MATERIAL_TICKET_EXTRA_ASSIGNED_POSITIONS.some((item) => norm(item) === value);
}

/**
 * Trưởng Ca / Trưởng Kíp / TK Lò máy / Trưởng Kíp Điện — nhóm duyệt, nghiệm thu, xuất file.
 *
 * Uỷ quyền cho `isShiftCommandPosition` để chỉ có MỘT định nghĩa "chỉ huy ca trực" trong
 * cả hệ thống. Bản viết tay trước đây so chuỗi ĐÃ BỎ DẤU với literal CÒN DẤU ("trưởng ca")
 * nên không bao giờ khớp: Trưởng ca và Trưởng kíp điện âm thầm mất quyền tạo phiếu, chỉ
 * "TK Lò máy" lọt qua nhờ nhánh startsWith("tk ").
 */
export function isShiftLeader(position?: string | null) {
  return isShiftCommandPosition(position);
}

/** Thống kê — nhập số phiếu Đề xuất vật tư */
export function isStats(position?: string | null) {
  return norm(position).includes("thống kê");
}

/** Kỹ thuật viên: vai trò TECHNICIAN hoặc chức vụ có chữ "Kỹ thuật viên". Một định nghĩa dùng
 *  chung cho quyền tạo phiếu và quyền xác nhận đề xuất ở luồng hóa chất. */
export function isTechnician(user: { role?: string | null; position?: string | null }) {
  if (user.role === "TECHNICIAN") return true;
  return norm(user.position).includes("kỹ thuật viên");
}

/** Ai được TẠO phiếu thay thế vật tư:
 *  - Quản trị (role ADMIN)
 *  - Kỹ thuật viên (role TECHNICIAN hoặc chức vụ "Kỹ thuật viên")
 *  - Trưởng Ca / Trưởng Kíp (gồm TK Lò máy, Trưởng kíp điện) */
export function canCreateTicket(user: { role?: string | null; position?: string | null }) {
  if (user.role === "ADMIN") return true;
  if (isTechnician(user)) return true;
  return isShiftLeader(user.position);
}

/* ---------- Phân quyền các bước quy trình (admin cấu hình, bảng MaterialWorkflowRole) ---------- */

export const WORKFLOW_STEPS = [
  "create", "confirm", "vhvReceive", "stats", "statsHandover", "receive", "issue", "use", "accept", "return", "settle", "manage",
] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export const WORKFLOW_STEP_LABELS: Record<WorkflowStep, string> = {
  create: "Tạo phiếu / Đề xuất vật tư",
  confirm: "Xác nhận",
  vhvReceive: "Ứng - VHV lãnh vật tư",
  stats: "Thống kê xác nhận ĐXVT",
  statsHandover: "Xác nhận VHV nhận / trả phiếu ĐXVT",
  receive: "Nhận vật tư",
  issue: "Cấp vật tư từ hiện có",
  use: "Ghi nhận sử dụng vật tư",
  accept: "Nghiệm thu + xuất BBNT",
  return: "Xác nhận trả (chai khí)",
  settle: "Quyết toán vật tư",
  manage: "Sửa / Xoá phiếu",
};

/* Cache trong RAM cho các bảng cấu hình gần như không đổi (phân quyền bước,
   phạm vi hệ thống theo cương vị). Mỗi lần tải danh sách phiếu trước đây tốn
   3 truy vấn cho các bảng này; TTL 60s + xóa cache khi admin lưu phân quyền
   là đủ tươi. Lưu ý: chỉ đúng khi app chạy 1 process (pm2 1 instance). */
const CONFIG_CACHE_TTL_MS = 60_000;
type CacheEntry<T> = { value: T; expires: number };
let roleMapCache: CacheEntry<Record<WorkflowStep, string[]>> | null = null;
const scopesCache = new Map<string, CacheEntry<string[]>>();
let scopeCountCache: CacheEntry<number> | null = null;

/** Xóa cache phân quyền — gọi ngay sau khi admin lưu cấu hình MaterialWorkflowRole. */
export function invalidateWorkflowConfigCache() {
  roleMapCache = null;
  scopesCache.clear();
  scopeCountCache = null;
}

/** Đọc toàn bộ cấu hình phân quyền: step → danh sách cương vị. */
export async function getWorkflowRoleMap(): Promise<Record<WorkflowStep, string[]>> {
  if (roleMapCache && roleMapCache.expires > Date.now()) return roleMapCache.value;
  const rows = await prisma.materialWorkflowRole.findMany({ select: { step: true, position: true } });
  const map: Record<WorkflowStep, string[]> = {
    create: [], confirm: [], vhvReceive: [], stats: [], statsHandover: [],
    receive: [], issue: [], use: [], accept: [], return: [], settle: [], manage: [],
  };
  for (const r of rows) {
    if ((WORKFLOW_STEPS as readonly string[]).includes(r.step)) map[r.step as WorkflowStep].push(r.position);
  }
  roleMapCache = { value: map, expires: Date.now() + CONFIG_CACHE_TTL_MS };
  return map;
}

function positionInList(position: string | null | undefined, list: string[]) {
  const p = norm(position);
  if (!p) return false;
  return list.some((item) => norm(item) === p);
}

/** Mặc định khi bước CHƯA được admin cấu hình (giữ hành vi cũ, không gãy khi mới deploy). */
function defaultStepAllowed(step: WorkflowStep, user: { role?: string | null; position?: string | null }) {
  if (step === "create") return canCreateTicket(user);
  // statsHandover tách khỏi stats từ 2026-08-10 để giao được cho cương vị khác; khi
  // chưa cấu hình vẫn mặc định Thống kê y như trước, deploy không đổi hành vi.
  if (step === "stats" || step === "statsHandover" || step === "settle") return isStats(user.position);
  if (step === "confirm" || step === "receive" || step === "issue" || step === "use" || step === "accept") return isShiftLeader(user.position);
  if (step === "vhvReceive") return true; // khi chưa cấu hình, API vẫn giới hạn đúng cương vị được giao
  return false; // manage: mặc định chỉ người tạo phiếu (kiểm tra riêng tại API) + Admin
}

/**
 * User có được thao tác ở bước này không?
 * - ADMIN: luôn được.
 * - Bước đã cấu hình: cương vị phải nằm trong danh sách.
 * - Bước chưa cấu hình: dùng mặc định cũ.
 */
export function stepAllowedWithMap(
  map: Record<WorkflowStep, string[]>,
  step: WorkflowStep,
  user: { role?: string | null; position?: string | null }
) {
  if (user.role === "ADMIN") return true;
  const configured = map[step];
  if (configured.length > 0) return positionInList(user.position, configured);
  return defaultStepAllowed(step, user);
}

/**
 * Bước do CHÍNH VHV được giao phiếu thực hiện: lãnh vật tư (Ứng), ra SYC sửa chữa,
 * xác nhận trả vỏ chai.
 *
 * Danh sách cương vị admin cấu hình cho các bước này là quyền BỔ SUNG — để Quản đốc /
 * Phó QĐ / KTV làm hộ được — chứ KHÔNG thay cho cương vị được giao phiếu. Bản cũ hiểu
 * là thay thế, nên khi bước `vhvReceive` và `return` được gán 3 cương vị quản lý
 * (2026-08-21) thì chính VHV Máy phó cầm phiếu lại mất nút "Xác nhận lãnh vật tư",
 * nút "Ra SYC sửa chữa" và nút trả vỏ chai.
 *
 * Chỉ xét danh sách khi bước ĐÃ cấu hình: `defaultStepAllowed("vhvReceive")` trả về true
 * cho tất cả (vốn dựa vào cương vị phiếu để rào), cộng thẳng vào sẽ mở toang cho mọi người.
 */
export function assignedOrConfiguredStep(
  map: Record<WorkflowStep, string[]>,
  step: WorkflowStep,
  user: { role?: string | null; position?: string | null },
  isAssigned: boolean
) {
  if (isAssigned || user.role === "ADMIN") return true;
  return map[step].length > 0 && stepAllowedWithMap(map, step, user);
}

/**
 * Bước "Xác nhận trả" (chai khí) mới có từ 2026-08, chưa cương vị nào được gán.
 * Khi Quản trị chưa cấu hình riêng thì DÙNG LUÔN quyền của bước Sử dụng vật tư — người
 * mang chai đi dùng cũng là người mang vỏ đi trả; mặc định theo `isShiftLeader` như các
 * bước khác sẽ giao nhầm việc này cho Trưởng ca.
 */
export function returnStepAllowed(
  map: Record<WorkflowStep, string[]>,
  user: { role?: string | null; position?: string | null }
) {
  return stepAllowedWithMap(map, map.return.length > 0 ? "return" : "use", user);
}

export async function canDoStep(step: WorkflowStep, user: { role?: string | null; position?: string | null }) {
  const map = await getWorkflowRoleMap();
  return stepAllowedWithMap(map, step, user);
}

/** Lấy danh sách systemSeq được phân giao cho một cương vị (PositionSystemScope) */
export async function getPositionScopes(position?: string | null): Promise<string[]> {
  if (!position) return [];
  const cached = scopesCache.get(position);
  if (cached && cached.expires > Date.now()) return cached.value;
  const rows = await prisma.positionSystemScope.findMany({
    where: { position },
    select: { systemSeq: true },
  });
  const scopes = rows.map((r) => r.systemSeq);
  scopesCache.set(position, { value: scopes, expires: Date.now() + CONFIG_CACHE_TTL_MS });
  return scopes;
}

/** Tổng số dòng phân giao phạm vi — 0 nghĩa là chưa cấu hình, mọi cương vị đều có scope. */
export async function getPositionScopeCount(): Promise<number> {
  if (scopeCountCache && scopeCountCache.expires > Date.now()) return scopeCountCache.value;
  const count = await prisma.positionSystemScope.count();
  scopeCountCache = { value: count, expires: Date.now() + CONFIG_CACHE_TTL_MS };
  return count;
}

/** deviceSeq có nằm trong phạm vi phân giao? (chính nó hoặc con cháu theo prefix) */
export function seqInScope(deviceSeq: string, scopes: string[]) {
  return scopes.some((s) => deviceSeq === s || deviceSeq.startsWith(s + "."));
}
