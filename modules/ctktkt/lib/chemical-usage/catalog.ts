import { isAdminUser, type SessionUser } from "../auth/session";

const DIESEL_MATERIAL_CODE = "1.11.01.002.VIE.00.000";

export const CHEMICAL_CATALOG = [
  {
    code: "PAC_LIQUID",
    materialCode: "1.61.86.566.VIE.00.000",
    name: "PAC lỏng",
    unit: "Tấn",
    allowedPositions: ["XLN hỗn hợp"],
    suggestedReasons: ["Sử dụng cho sản xuất"],
  },
  {
    code: "NAOCL",
    materialCode: "1.61.26.003.VIE.00.000",
    name: "NaOCl",
    unit: "Tấn",
    allowedPositions: ["XLN hỗn hợp"],
    suggestedReasons: ["Sử dụng cho sản xuất"],
  },
  {
    code: "NH4OH_20",
    materialCode: "1.61.86.518.VIE.00.000",
    name: "NH₄OH 20%",
    unit: "Tấn",
    allowedPositions: ["Máy phó"],
    suggestedReasons: ["Pha để thực hiện XLN Lò"],
  },
  {
    code: "HCL_31",
    materialCode: "1.61.06.038.VIE.00.000",
    name: "HCl 31%",
    unit: "Tấn",
    allowedPositions: ["Trợ thủ", "Máy phó", "XLN hỗn hợp", "XLNT"],
    suggestedReasons: [
      "Sử dụng cho sản xuất",
      "Tái sinh hạt CRT Hỗn Hợp 1",
      "Tái sinh hạt CRT Hỗn Hợp 2",
      "Tái sinh hạt CRT Hỗn Hợp 3",
      "Tái sinh hạt CRT Hỗn Hợp 4",
      "Tái sinh hạt CRT Hỗn Hợp 5",
      "Tái sinh hạt CRT Hỗn Hợp 6",
      "Tái sinh hạt CRT Hỗn Hợp 7",
    ],
  },
  {
    code: "NAOH_31",
    materialCode: "1.61.16.008.VIE.00.000",
    name: "NaOH 31%",
    unit: "Tấn",
    allowedPositions: ["Trợ thủ", "Máy phó", "XLN hỗn hợp", "XLNT"],
    suggestedReasons: [
      "Sử dụng cho sản xuất",
      "Tái sinh hạt ART Hỗn Hợp 1",
      "Tái sinh hạt ART Hỗn Hợp 2",
      "Tái sinh hạt ART Hỗn Hợp 3",
      "Tái sinh hạt ART Hỗn Hợp 4",
      "Tái sinh hạt ART Hỗn Hợp 5",
      "Tái sinh hạt ART Hỗn Hợp 6",
      "Tái sinh hạt ART Hỗn Hợp 7",
    ],
  },
  {
    code: "DO_AUX_BOILER",
    materialCode: DIESEL_MATERIAL_CODE,
    name: "Dầu DO – Lò hơi phụ",
    unit: "Lít",
    allowedPositions: ["NH3 - Lò hơi phụ"],
    suggestedReasons: ["Vận hành lò hơi phụ"],
  },
  {
    code: "DO_FIRE_PUMP",
    materialCode: DIESEL_MATERIAL_CODE,
    name: "Dầu DO – Bơm diesel chữa cháy khẩn cấp",
    unit: "Lít",
    allowedPositions: ["NH3 - Lò hơi phụ"],
    suggestedReasons: ["Chạy thử bơm chữa cháy", "Vận hành chữa cháy"],
  },
  {
    code: "DO_EMERGENCY_GENERATOR",
    materialCode: DIESEL_MATERIAL_CODE,
    name: "Dầu DO – Máy phát diesel khẩn cấp",
    unit: "Lít",
    allowedPositions: ["Trực phụ điện"],
    suggestedReasons: ["Chạy thử máy phát diesel", "Vận hành máy phát diesel khẩn cấp"],
  },
] as const;

export type ChemicalCode = (typeof CHEMICAL_CATALOG)[number]["code"];
export type ChemicalCatalogItem = (typeof CHEMICAL_CATALOG)[number];

function normalizePosition(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

export function findChemical(code: string): ChemicalCatalogItem | undefined {
  return CHEMICAL_CATALOG.find(item => item.code === code);
}

export function legacyCanEnterChemical(user: SessionUser | null | undefined, chemicalCode: string): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  const chemical = findChemical(chemicalCode);
  if (!chemical) return false;
  const position = normalizePosition(user.position || "");
  return chemical.allowedPositions.some(allowed => normalizePosition(allowed) === position);
}

export function editableChemicalsFor(user: SessionUser | null | undefined): ChemicalCatalogItem[] {
  return CHEMICAL_CATALOG.filter(item => canEnterChemical(user, item.code));
}

export function canEnterChemical(user: SessionUser | null | undefined, chemicalCode: string): boolean {
  const chemical = findChemical(chemicalCode);
  if (!user || !chemical) return false;
  return isAdminUser(user)
    || user.permissions.includes(`chemical_${chemical.code}`)
    || (chemical.unit === "Tấn" && user.permissions.includes("edit_chemical"));
}
