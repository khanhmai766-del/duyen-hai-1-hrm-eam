/*
 * Mục tạm "Dòng chưa số" (lib/server/defect-unnumbered.ts). Thử trên production chỉ cho Quản trị; từ 10/10/2026 mở cho
 * mọi cương vị (vẫn rào theo cương vị được xem + ghi cần defect-manage mức manage/full như sửa phiếu khiếm khuyết thường).
 * Đặt lại true nếu cần khoá về Quản trị.
 */
export const UNNUMBERED_ADMIN_ONLY = false;

export function canSeeUnnumbered(role: string | null | undefined) {
  return !UNNUMBERED_ADMIN_ONLY || role === "ADMIN";
}
