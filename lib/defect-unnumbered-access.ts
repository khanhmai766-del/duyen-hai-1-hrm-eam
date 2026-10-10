/*
 * Mục tạm "Dòng chưa số" (lib/server/defect-unnumbered.ts). Đang thử trên production nên CHỈ Quản trị thấy và dùng;
 * thử ổn thì đổi UNNUMBERED_ADMIN_ONLY = false để mở cho mọi người (vẫn rào theo cương vị + quyền defect-manage).
 */
export const UNNUMBERED_ADMIN_ONLY = true;

export function canSeeUnnumbered(role: string | null | undefined) {
  return !UNNUMBERED_ADMIN_ONLY || role === "ADMIN";
}
