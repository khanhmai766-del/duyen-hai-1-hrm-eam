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

/** Sinh số phiếu: VT-<năm>-<số thứ tự 4 chữ số>[U nếu Ứng] */
export async function nextTicketCode(type: "DE_XUAT" | "UNG") {
  const year = new Date().getFullYear();
  const count = await prisma.materialTicket.count({
    where: { code: { startsWith: `VT-${year}-` } },
  });
  const num = String(count + 1).padStart(4, "0");
  return `VT-${year}-${num}${type === "UNG" ? "U" : ""}`;
}
