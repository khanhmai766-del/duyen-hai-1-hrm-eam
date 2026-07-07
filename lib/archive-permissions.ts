import type { DocumentCategory } from "@/hooks/useDocuments";

export const ARCHIVE_CATEGORY_PERMISSION_IDS: Partial<Record<DocumentCategory, string>> = {
  GRID_SEPARATION: "archive-grid-separation",
  STARTUP_DATA: "archive-startup-data",
  BOILER_CALIBRATION: "archive-boiler-calibration",
  MAJOR_REPAIR: "archive-major-repair",
  OIL_GUN_DATA: "archive-oil-gun-data",
  SOOT_BLOWER_DATA: "archive-soot-blower-data",
};

export function archiveCategoryPermissionId(category: string | null | undefined) {
  return ARCHIVE_CATEGORY_PERMISSION_IDS[category as DocumentCategory] ?? null;
}

