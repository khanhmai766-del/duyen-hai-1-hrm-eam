export const DEFECT_ENVIRONMENT_SHEET_OPTIONS = [
  { value: "CO", label: "Môi Trường – Cơ", sheetName: "DH1 MTruong" },
  { value: "DIEN", label: "Môi Trường – Điện", sheetName: "DH1 qt OL" },
] as const;

export type DefectEnvironmentSheet = (typeof DEFECT_ENVIRONMENT_SHEET_OPTIONS)[number]["value"];

export function defectEnvironmentSheetFromName(value: unknown): DefectEnvironmentSheet | "" {
  const name = String(value ?? "").trim().toLocaleLowerCase("vi");
  if (name === "dh1 mtruong") return "CO";
  if (name === "dh1 qt ol") return "DIEN";
  return "";
}

export function parseDefectEnvironmentSheet(value: unknown): DefectEnvironmentSheet | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "CO" || normalized === "DIEN" ? normalized : null;
}

export function resolveDefectEnvironmentSheetTarget(
  value: unknown,
  spreadsheetIds: Record<DefectEnvironmentSheet, string>
) {
  const target = parseDefectEnvironmentSheet(value);
  if (!target) throw new Error("Vui lòng chọn Sheet Môi Trường – Cơ hoặc Môi Trường – Điện");

  const spreadsheetId = spreadsheetIds[target]?.trim();
  if (!spreadsheetId) {
    throw new Error(`Chưa cấu hình Google Sheet Môi Trường – ${target === "CO" ? "Cơ" : "Điện"}`);
  }

  return {
    spreadsheetId,
    sheetName: target === "CO" ? "DH1 MTruong" : "DH1 qt OL",
  };
}
