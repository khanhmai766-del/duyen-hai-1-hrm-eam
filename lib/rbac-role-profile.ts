/** Xoá hồ sơ mở rộng cùng cột ma trận và các liên kết gán hồ sơ đó. */
export function removeRoleProfile<P extends { matrix: Record<string, string> }, O extends { roleId?: string }>(
  roleId: string, permissions: P[], overrides: O[]
) {
  return {
    permissions: permissions.map(row => ({ ...row, matrix: Object.fromEntries(Object.entries(row.matrix).filter(([id]) => id !== roleId)) })),
    userOverrides: overrides.filter(override => override.roleId !== roleId),
  };
}
