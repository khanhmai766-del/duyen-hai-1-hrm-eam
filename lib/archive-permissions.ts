import type { DocumentCategory } from "@/hooks/useDocuments";

export const ARCHIVE_CATEGORY_PERMISSION_IDS: Partial<Record<DocumentCategory, string>> = {
  GRID_SEPARATION: "archive-grid-separation",
  STARTUP_DATA: "archive-startup-data",
  BOILER_CALIBRATION: "archive-boiler-calibration",
  OIL_GUN_DATA: "archive-oil-gun-data",
};

export function archiveCategoryPermissionId(category: string | null | undefined) {
  return ARCHIVE_CATEGORY_PERMISSION_IDS[category as DocumentCategory] ?? null;
}

