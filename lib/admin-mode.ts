export const ADMIN_MODE_STORAGE_KEY = "pp:admin-mode";
export const ADMIN_MODE_COOKIE = "pp-admin-mode";

export function adminModeEnabled(value?: string | null) {
  return value !== "off";
}
