import { fail } from "@/lib/api";

export function userImportEnabled() {
  return process.env.USER_IMPORT_ENABLED === "true";
}

export function requireUserImportEnabled() {
  if (!userImportEnabled()) {
    throw fail("Chức năng import/upload người dùng đang tắt", 403);
  }
}
