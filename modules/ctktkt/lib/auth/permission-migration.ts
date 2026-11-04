import { PERMISSIONS, type Permission, type SessionUser } from "./session";
import { CTKTKT_GROUP_META, legacyCanEditCtktktGroup, type CtktktFieldGroup } from "../ctktkt-permissions";
import { legacyCanEditWaterField, type WaterColumnGroup } from "../water-report/permissions";
import { CHEMICAL_CATALOG, legacyCanEnterChemical } from "../chemical-usage/catalog";

export function normalizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) throw new Error("Cấu hình quyền không hợp lệ.");
  return [...new Set(value.filter((p): p is Permission => PERMISSIONS.includes(p as Permission)))];
}

/** Only version 1 configurations; version 2 empty arrays stay empty. */
export function migrateLegacyPermissions(user: SessionUser): Permission[] {
  const permissions = new Set<Permission>(normalizePermissions(user.permissions));
  for (const group of Object.keys(CTKTKT_GROUP_META) as CtktktFieldGroup[]) {
    if (legacyCanEditCtktktGroup(user, group)) permissions.add(`ctktkt_${group}`);
  }
  if (user.role === "technician" || user.role === "supervisor" || (user.position || "").toLowerCase().includes("trưởng ca")) permissions.add("edit_ctktkt");
  for (const group of ["meta", "electricity", "water_intake", "resin_water"] as WaterColumnGroup[]) {
    if (legacyCanEditWaterField(user, group)) permissions.add(`water_${group}`);
  }
  for (const chemical of CHEMICAL_CATALOG) {
    if (legacyCanEnterChemical(user, chemical.code)) permissions.add(`chemical_${chemical.code}`);
  }
  return [...permissions];
}
