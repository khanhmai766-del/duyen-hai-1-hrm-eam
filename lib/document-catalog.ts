import { EQUIPMENT_BLOCKS } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";

export const LEGACY_COMMON_POSITION = "Chung";
export const LEGACY_COMMON_BLOCK = "QT Chung";
export const COMMON_BLOCK = "Chung";
export const MANAGEMENT_BLOCK_OPTIONS = [COMMON_BLOCK, ...EQUIPMENT_BLOCKS] as const;
export const PROCEDURE_TYPES = ["QTVH-XLSC", "QT thử nghiệm - nghiệm thu", "QTNV", "QTAT-MT", "QT sữa chữa, bảo dưỡng", "QT khác", "Thông tư - nghị định"] as const;
export const EXPIRING_PROCEDURE_TYPES = new Set(["QTVH-XLSC", "QT thử nghiệm - nghiệm thu", "QTNV", "QT sữa chữa, bảo dưỡng"]);

export function normalizeProcedureType(value?: string | null) {
  const raw = String(value ?? "").trim();
  return PROCEDURE_TYPES.includes(raw as (typeof PROCEDURE_TYPES)[number]) ? raw : "QT khác";
}

export function normalizeManagementBlock(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === LEGACY_COMMON_POSITION || raw === LEGACY_COMMON_BLOCK) return COMMON_BLOCK;
  const matched = MANAGEMENT_BLOCK_OPTIONS.find((block) => normalizeText(block) === normalizeText(raw));
  return matched ?? COMMON_BLOCK;
}
