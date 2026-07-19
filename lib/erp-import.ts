import * as XLSX from "xlsx";
import {
  GROUPING_CATEGORIES,
  type ErpStockUpdateInput,
  type GroupedErpMaterialInput,
  type GroupingCategory,
} from "@/hooks/useOilGrouping";
import { normalizeText } from "@/lib/nav";
import { parseErpNumber } from "@/lib/parse-number";

export const ERP_EXPORT_HEADERS = ["Mã", "Tên", "ĐVT", "Loại vật tư", "Kho VTTB", "Số liệu ERP"];

export function canonicalGroupedCategory(value?: string | null): GroupingCategory {
  const normalized = normalizeText(value || "");
  if (normalized === "hoa chat" || normalized === "vat tu tieu hao") return "Hóa Chất";
  if (normalized === "bi nghien than" || normalized === "bi nghien") return "Bi Nghiền Than";
  if (normalized === "thiet bi c&i" || normalized === "thiet bi ci" || normalized === "c&i") return "Thiết bị C&I";
  return GROUPING_CATEGORIES.find((category) => normalizeText(category) === normalized) ?? GROUPING_CATEGORIES[0];
}

export function parseErpImportRows(
  rows: Array<Array<string | number | null>>,
  defaultCategory: GroupingCategory = GROUPING_CATEGORIES[0]
): GroupedErpMaterialInput[] {
  const normalizedRows = rows.map((row) => row.map((cell) => normalizeText(String(cell ?? ""))));
  const headerIndex = normalizedRows.findIndex((row) => {
    const joined = row.join(" ");
    return joined.includes("ma") && joined.includes("ten") && joined.includes("dvt");
  });
  if (headerIndex < 0) return [];

  const header = normalizedRows[headerIndex];
  const findColumn = (candidates: string[]) => header.findIndex((label) => candidates.includes(label));

  const codeIndex = findColumn(["ma", "ma vat tu", "code"]);
  const nameIndex = findColumn(["ten", "ten vat tu", "name"]);
  const unitIndex = findColumn(["dvt", "don vi tinh", "unit"]);
  const categoryIndex = findColumn(["loai vat tu", "loai", "category"]);
  const warehouseIndex = findColumn(["kho vttb", "kho", "kho vat tu", "kho vat tu thiet bi", "warehouse"]);
  const stockIndex = findColumn(["so lieu erp", "erp", "erp stock", "solieu erp"]);
  if (codeIndex < 0 || nameIndex < 0 || unitIndex < 0) return [];

  return rows
    .slice(headerIndex + 1)
    .map((row) => {
      const code = String(row[codeIndex] ?? "").trim();
      const name = String(row[nameIndex] ?? "").trim();
      const unit = String(row[unitIndex] ?? "").trim();
      const category = categoryIndex >= 0 ? canonicalGroupedCategory(String(row[categoryIndex] ?? "").trim()) : defaultCategory;
      const warehouse = warehouseIndex >= 0 ? String(row[warehouseIndex] ?? "").trim() : "";
      const parsedStock = stockIndex >= 0 ? parseErpNumber(row[stockIndex]) : 0;
      const erpStock = Number.isFinite(parsedStock) ? Math.max(0, Math.round(parsedStock)) : 0;
      return { code, name, unit, category, warehouse, erpStock };
    })
    .filter((row) => row.code || row.name || row.unit);
}

/** Đọc file cập nhật tồn kho: chỉ lấy cột Mã và Số liệu ERP từ mẫu import chuẩn. */
export function parseErpStockUpdateRows(
  rows: Array<Array<string | number | null>>
): ErpStockUpdateInput[] {
  const normalizedRows = rows.map((row) => row.map((cell) => normalizeText(String(cell ?? ""))));
  const stockHeaders = ["so lieu erp", "erp", "erp stock", "solieu erp", "ton kho", "ton erp"];
  const headerIndex = normalizedRows.findIndex((row) =>
    row.some((cell) => ["ma", "ma vat tu", "code"].includes(cell)) && row.some((cell) => stockHeaders.includes(cell))
  );
  if (headerIndex < 0) return [];

  const header = normalizedRows[headerIndex];
  const codeIndex = header.findIndex((cell) => ["ma", "ma vat tu", "code"].includes(cell));
  const stockIndex = header.findIndex((cell) => stockHeaders.includes(cell));

  return rows
    .slice(headerIndex + 1)
    .map((row) => ({
      code: String(row[codeIndex] ?? "").trim(),
      erpStock: row[stockIndex] ?? null,
    }))
    .filter((row) => row.code || String(row.erpStock ?? "").trim());
}

export function downloadErpImportTemplate(sampleCategory: GroupingCategory = GROUPING_CATEGORIES[0]) {
  const aoa = [
    ["DANH MỤC VẬT TƯ ERP"],
    [`Ngày xuất: ${new Intl.DateTimeFormat("vi-VN").format(new Date())}`, "Số bản ghi: 1"],
    [],
    ERP_EXPORT_HEADERS,
    ["ERP-001", "Vật tư mẫu", "Cái", sampleCategory, "Kho Duyên Hải", 0],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [{ wch: 18 }, { wch: 34 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 14 }];
  sheet["!rows"] = [{ hpt: 24 }, { hpt: 20 }, { hpt: 8 }, { hpt: 28 }, { hpt: 25 }];
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: ERP_EXPORT_HEADERS.length - 1 } }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Bao cao");
  XLSX.writeFile(workbook, "mau-nhap-danh-muc-vat-tu-erp.xlsx", { compression: true });
}

export async function readErpImportFile(
  file: File,
  defaultCategory: GroupingCategory = GROUPING_CATEGORIES[0]
): Promise<GroupedErpMaterialInput[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, { header: 1, defval: "" });
  return parseErpImportRows(rows, defaultCategory);
}

export async function readErpStockUpdateFile(file: File): Promise<ErpStockUpdateInput[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, { header: 1, defval: "" });
  return parseErpStockUpdateRows(rows);
}
