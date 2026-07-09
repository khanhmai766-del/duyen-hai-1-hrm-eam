import { prisma } from "@/lib/prisma";

/* ============================================================
   lib/material-workflow.ts
   Nhận diện cương vị & kiểm tra phạm vi cây thiết bị (PositionSystemScope)
   cho workflow Phiếu thay thế vật tư.
   ============================================================ */

/** Chuẩn hóa chuỗi cương vị: thường hóa + bỏ khoảng thừa */
function norm(s?: string | null) {
  return (s || "").toLowerCase().trim();
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

export const WORKFLOW_STEPS = ["create", "confirm", "receive", "use", "accept", "manage"] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export const WORKFLOW_STEP_LABELS: Record<WorkflowStep, string> = {
  create: "Tạo phiếu / Đề xuất vật tư",
  confirm: "Xác nhận",
  receive: "Nhận vật tư",
  use: "Sử dụng vật tư",
  accept: "Nghiệm thu + xuất BBNT",
  manage: "Sửa / Xoá phiếu",
};

/** Đọc toàn bộ cấu hình phân quyền: step → danh sách cương vị. */
export async function getWorkflowRoleMap(): Promise<Record<WorkflowStep, string[]>> {
  const rows = await prisma.materialWorkflowRole.findMany({ select: { step: true, position: true } });
  const map: Record<WorkflowStep, string[]> = { create: [], confirm: [], receive: [], use: [], accept: [], manage: [] };
  for (const r of rows) {
    if ((WORKFLOW_STEPS as readonly string[]).includes(r.step)) map[r.step as WorkflowStep].push(r.position);
  }
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
  if (step === "confirm" || step === "receive" || step === "use" || step === "accept") return isShiftLeader(user.position);
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
  const rows = await prisma.positionSystemScope.findMany({
    where: { position },
    select: { systemSeq: true },
  });
  return rows.map((r) => r.systemSeq);
}

/** deviceSeq có nằm trong phạm vi phân giao? (chính nó hoặc con cháu theo prefix) */
export function seqInScope(deviceSeq: string, scopes: string[]) {
  return scopes.some((s) => deviceSeq === s || deviceSeq.startsWith(s + "."));
}

/** Sinh số phiếu riêng theo từng luồng: VT-<năm>-0001 và UNG-<năm>-0001. */
type TicketCodeDb = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  materialTicket: {
    findMany: (args: {
      where: {
        type: "DE_XUAT" | "UNG";
        createdAt: { gte: Date; lt: Date };
      };
      select: { code: true };
    }) => Promise<{ code: string }[]>;
  };
};

function materialTicketPrefix(type: "DE_XUAT" | "UNG") {
  return type === "UNG" ? "UNG" : "VT";
}

export async function nextTicketCode(type: "DE_XUAT" | "UNG", db: TicketCodeDb = prisma) {
  const year = new Date().getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  await db.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `material-ticket:${type}:${year}`);

  const tickets = await db.materialTicket.findMany({
    where: { type, createdAt: { gte: start, lt: end } },
    select: { code: true },
  });
  const maxNumber = tickets.reduce((max, ticket) => {
    const match = ticket.code.match(/-(\d+)(?:U)?$/);
    const value = match ? Number(match[1]) : 0;
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);
  const num = String(maxNumber + 1).padStart(4, "0");
  return `${materialTicketPrefix(type)}-${year}-${num}`;
}
