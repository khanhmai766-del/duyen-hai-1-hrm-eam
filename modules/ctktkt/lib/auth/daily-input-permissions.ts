import { hasPermission, type SessionUser } from "./session";
export function canEditDailyInput(user: SessionUser | null | undefined, code: string): boolean {
  const field = code.replace(/_NOTE$/, "");
  return hasPermission(user, /^D[A-H]$/.test(field) ? "edit_pmis" : "edit_daily_inputs");
}
