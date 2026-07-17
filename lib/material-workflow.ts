import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";

/* ============================================================
   lib/material-workflow.ts
   Nhận diện cương vị & kiểm tra phạm vi cây thiết bị (PositionSystemScope)
   cho workflow Phiếu thay thế vật tư.
   ============================================================ */

/** Chuẩn hóa chuỗi cương vị: thường hóa + bỏ khoảng thừa */
function norm(s?: string | null) {
  return normalizeText(s || "").trim();
}

/** Trưởng Ca / Trưởng Kíp / TK Lò máy / Trưởng Kíp Điện — nhóm duyệt, nghiệm thu, xuất file */
export function isShiftLeader(position?: string | null) {
  const p = norm(position);
  if (!p) return false;
  return (
    p.includes("trưởng ca") ||
    p.includes("trưởng kíp") ||
    p.includes("tk lò") ||
    p.includes("tk điện") ||
    p.startsWith("tk ")
  );
}

/** Thống kê — nhập số phiếu Đề xuất vật tư */
export function isStats(position?: string | null) {
  return norm(position).includes("thống kê");
}

/** Ai được TẠO phiếu thay thế vật tư:
 *  - Quản trị (role ADMIN)
 *  - Kỹ thuật viên (role TECHNICIAN hoặc chức vụ "Kỹ thuật viên")
 *  - Trưởng Ca / Trưởng Kíp (gồm TK Lò máy, Trưởng kíp điện) */
export function canCreateTicket(user: { role?: string | null; position?: string | null }) {
  if (user.role === "ADMIN") return true;
  if (user.role === "TECHNICIAN") return true;
  if (norm(user.position).includes("kỹ thuật viên")) return true;
  return isShiftLeader(user.position);
}

/* ---------- Phân quyền các bước quy trình (admin cấu hình, bảng MaterialWorkflowRole) ---------- */

export const WORKFLOW_STEPS = [
  "create", "confirm", "vhvReceive", "stats", "receive", "use", "accept", "settle", "manage",
] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export const WORKFLOW_STEP_LABELS: Record<WorkflowStep, string> = {
  create: "Tạo phiếu / Đề xuất vật tư",
  confirm: "Xác nhận",
  vhvReceive: "Ứng - VHV lãnh vật tư",
  stats: "Thống kê xác nhận ĐXVT",
  receive: "Nhận vật tư",
  use: "Sử dụng vật tư",
  accept: "Nghiệm thu + xuất BBNT",
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
    create: [], confirm: [], vhvReceive: [], stats: [], receive: [], use: [], accept: [], settle: [], manage: [],
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
  if (step === "stats" || step === "settle") return isStats(user.position);
  if (step === "confirm" || step === "receive" || step === "use" || step === "accept") return isShiftLeader(user.position);
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
