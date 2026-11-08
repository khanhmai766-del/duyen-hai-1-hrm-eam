import { DEFAULT_POSITIONS } from './default-positions';
import { ctktktPositionKey, POSITION_PERMISSION_IDS, type PositionGrants, type PositionPermission } from './position-permissions';
import { hasPermission, type SessionUser } from './session';

export function isShiftInputCoordinator(user: SessionUser | null | undefined) {
  return Boolean(user && ['truong kip dien', 'truong ca'].includes(ctktktPositionKey(user.position || '')));
}
/**
 * Ai được mở trang Phân công nhập liệu KTKT: người có quyền quản trị phân quyền KTKT, hoặc người được
 * quản trị viên cấp quyền RBAC "ctktkt-delegate" theo từng tài khoản (TKĐ, Trưởng ca, một số KTV…).
 * Tách khỏi isShiftInputCoordinator (theo cương vị) — cái đó chỉ dùng cho đề nghị sửa số liệu.
 */
export function canManageKtktInputs(user: SessionUser | null | undefined) {
  return hasPermission(user, 'manage_permissions') || Boolean(user?.canDelegateInputs);
}
export const DELEGATABLE_INPUTS = POSITION_PERMISSION_IDS.filter(id =>
  id.startsWith('ctktkt_') || id.startsWith('water_') || id.startsWith('chemical_')
  || ['edit_monthly_kpi','edit_daily_inputs','edit_bcsx','edit_pmis'].includes(id));
export function isOperatorPosition(position: string) {
  const key = ctktktPositionKey(position);
  return DEFAULT_POSITIONS.some(p => ctktktPositionKey(p.position) === key
    && !['Lãnh đạo', 'Kỹ thuật', 'Vận hành ca'].includes(p.category));
}
/** Reject forged full-matrix changes before the versioned write. */
export function validateDelegatedChange(user: SessionUser, before: PositionGrants, next: PositionGrants) {
  if (hasPermission(user, 'manage_permissions')) return;
  if (!canManageKtktInputs(user)) throw new Error('Không có quyền phân công nhập liệu KTKT.');
  for (const id of POSITION_PERMISSION_IDS) {
    const a = new Set(before[id].map(ctktktPositionKey)), b = new Set(next[id].map(ctktktPositionKey));
    for (const position of [...before[id], ...next[id]]) {
      const key = ctktktPositionKey(position);
      if (a.has(key) === b.has(key)) continue;
      if (!DELEGATABLE_INPUTS.includes(id as PositionPermission) || !isOperatorPosition(position))
        throw new Error('Chỉ được phân công quyền nhập liệu KTKT cho các cương vị VHV. Không được đổi quyền quản trị hoặc quyền của lãnh đạo.');
    }
  }
}
