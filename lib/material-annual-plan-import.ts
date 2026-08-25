import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { normalizeText } from "@/lib/nav";

export const ANNUAL_PLAN_GROUPS = {
  OIL: "I. Dầu nhớt bôi trơn",
  FILTER: "II. Lọc dầu và lọc nước",
  OTHER: "III. Chai khí, hạt nhựa, dầu DO, hóa chất và vật tư phụ khác",
} as const;

export type AnnualPlanGroup = (typeof ANNUAL_PLAN_GROUPS)[keyof typeof ANNUAL_PLAN_GROUPS];
export type AnnualPlanRoute = "CHEMICAL" | "MATERIAL";

export type AnnualPlanImportIssue = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  row?: number;
  erpCode?: string;
};

export type AnnualPlanConflict = {
  key: string;
  label: string;
  erpCode: string | null;
  values: number[];
  rowNumbers: number[];
};

type ParsedPlanRow = {
  sourceRow: number;
  materialCategory: AnnualPlanGroup;
  materialNameKey: string;
  materialNameLabel: string;
  rawErpCode: string;
  erpCodes: string[];
  unitLabel: string;
  plannedQuantity: number;
};

export type ReconciledAnnualPlanRow = ParsedPlanRow & {
  erpCode: string | null;
  materialId: string | null;
  materialCode: string | null;
  chemicalItemId: string | null;
  chemicalItemCode: string | null;
  route: AnnualPlanRoute;
  conflictKeys: string[];
  matchStatus: "MATCHED" | "ERP_ONLY" | "NAME_ONLY" | "UNMATCHED" | "AMBIGUOUS";
};

export type AnnualPlanImportPreview = {
  fileName: string;
  fileHash: string;
  sheetNames: string[];
  selectedSheet: string;
  detectedYear: number;
  headerRow: number;
  rows: ReconciledAnnualPlanRow[];
  conflicts: AnnualPlanConflict[];
  issues: AnnualPlanImportIssue[];
  summary: {
    sourceRows: number;
    planRows: number;
    skippedWithoutPlan: number;
    chemicalRows: number;
    materialRows: number;
    erpMatchedRows: number;
    materialMatchedRows: number;
    unmatchedErpCodes: number;
    conflictCount: number;
  };
};

const clean = (value: unknown) => String(value ?? "").replace(/\u00a0/g, " ").trim();
export const annualPlanNameKey = (value: string) => normalizeText(value).replace(/\s+/g, " ");

function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = clean(value);
  if (!text) return null;
  const normalized = text.replace(/\s/g, "").replace(/,(?=\d{1,4}$)/, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function cellValue(sheet: XLSX.WorkSheet, row: number, column: number) {
  return sheet[XLSX.utils.encode_cell({ r: row - 1, c: column })]?.v;
}

/**
 * Workbook thật đang có !ref kéo tới dòng 1.046.075 dù dữ liệu chỉ khoảng 263 dòng.
 * Không được dùng sheet_to_json trực tiếp trên !ref vì request sẽ ngốn hàng triệu ô.
 */
function lastPopulatedRow(sheet: XLSX.WorkSheet) {
  let max = 0;
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const row = XLSX.utils.decode_cell(address).r + 1;
    if (row > max) max = row;
  }
  return Math.min(max, 20_000);
}

function groupFromHeading(value: unknown): AnnualPlanGroup | null {
  const label = annualPlanNameKey(clean(value));
  if (label.startsWith("i. vat tu dau nhot boi tron")) return ANNUAL_PLAN_GROUPS.OIL;
  if (label.startsWith("ii. vat tu loc dau nhot")) return ANNUAL_PLAN_GROUPS.FILTER;
  if (label.startsWith("iii. vat tu chai khi")) return ANNUAL_PLAN_GROUPS.OTHER;
  return null;
}

function extractErpCodes(value: unknown) {
  const source = clean(value).toUpperCase();
  const matches = source.match(/[0-9A-Z]+(?:\.[0-9A-Z]+){5,}/g) ?? [];
  return Array.from(new Set(matches.map((code) => code.replace(/[\s\t]+/g, "").trim()).filter(Boolean)));
}

function detectYear(sheet: XLSX.WorkSheet, sheetName: string) {
  const fromName = /(?:19|20)\d{2}/.exec(sheetName)?.[0];
  if (fromName) return Number(fromName);
  for (let row = 1; row <= Math.min(30, lastPopulatedRow(sheet)); row += 1) {
    for (let column = 0; column < 12; column += 1) {
      const match = /(?:19|20)\d{2}/.exec(clean(cellValue(sheet, row, column)));
      if (match) return Number(match[0]);
    }
  }
  return new Date().getFullYear();
}

function findHeaderRow(sheet: XLSX.WorkSheet) {
  const max = Math.min(80, lastPopulatedRow(sheet));
  for (let row = 1; row <= max; row += 1) {
    const codeHeader = annualPlanNameKey(clean(cellValue(sheet, row, 1)));
    const nameHeader = annualPlanNameKey(clean(cellValue(sheet, row, 2)));
    if (codeHeader.includes("ma vat tu") && nameHeader.includes("ten quy cach vat tu")) return row;
  }
  return null;
}

function parseWorkbook(buffer: Buffer, fileName: string, requestedSheet?: string | null) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, cellFormula: true });
  if (workbook.SheetNames.length === 0) throw new Error("Workbook không có sheet dữ liệu");
  const selectedSheet = requestedSheet && workbook.SheetNames.includes(requestedSheet)
    ? requestedSheet
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[selectedSheet];
  const headerRow = findHeaderRow(sheet);
  if (!headerRow) throw new Error(`Không tìm thấy hàng tiêu đề QLVT.20 trên sheet “${selectedSheet}”`);

  const rows: ParsedPlanRow[] = [];
  const conflictRows: ParsedPlanRow[] = [];
  const issues: AnnualPlanImportIssue[] = [];
  let group: AnnualPlanGroup | null = null;
  let skippedWithoutPlan = 0;
  const maxRow = lastPopulatedRow(sheet);

  for (let row = headerRow + 1; row <= maxRow; row += 1) {
    const heading = groupFromHeading(cellValue(sheet, row, 0));
    if (heading) {
      group = heading;
      continue;
    }
    const materialNameLabel = clean(cellValue(sheet, row, 2));
    if (!materialNameLabel) continue;
    if (!group) {
      issues.push({ severity: "error", code: "MISSING_GROUP", row, message: "Dòng vật tư nằm ngoài ba nhóm I–III" });
      continue;
    }
    const rawErpCode = clean(cellValue(sheet, row, 1));
    const erpCodes = extractErpCodes(rawErpCode);
    const unitLabel = clean(cellValue(sheet, row, 3));
    const plannedQuantity = numeric(cellValue(sheet, row, 4));
    if (plannedQuantity === null) {
      skippedWithoutPlan += 1;
      // Biểu đang dùng ô trống như số 0. Vẫn đưa dòng này vào đối chiếu mã ERP
      // để bắt đúng 20 mã có chỉ tiêu E không nhất quán, nhưng không nhập nó
      // thành một dòng kế hoạch độc lập.
      conflictRows.push({
        sourceRow: row,
        materialCategory: group,
        materialNameKey: annualPlanNameKey(materialNameLabel),
        materialNameLabel,
        rawErpCode,
        erpCodes,
        unitLabel,
        plannedQuantity: 0,
      });
      continue;
    }
    if (plannedQuantity < 0) {
      issues.push({ severity: "error", code: "NEGATIVE_PLAN", row, message: "Kế hoạch năm không được âm" });
      continue;
    }
    if (erpCodes.length > 1) {
      issues.push({
        severity: "warning",
        code: "MULTIPLE_ERP_CODES",
        row,
        message: `Một dòng chứa ${erpCodes.length} mã ERP; hệ thống không tự chọn mã đại diện`,
      });
    }
    const parsedRow = {
      sourceRow: row,
      materialCategory: group,
      materialNameKey: annualPlanNameKey(materialNameLabel),
      materialNameLabel,
      rawErpCode,
      erpCodes,
      unitLabel,
      plannedQuantity,
    } satisfies ParsedPlanRow;
    rows.push(parsedRow);
    conflictRows.push(parsedRow);
  }

  return {
    fileName,
    fileHash: createHash("sha256").update(buffer).digest("hex"),
    sheetNames: workbook.SheetNames,
    selectedSheet,
    detectedYear: detectYear(sheet, selectedSheet),
    headerRow,
    rows,
    conflictRows,
    issues,
    skippedWithoutPlan,
  };
}

/**
 * Loại vật tư của hệ thống thuộc nhóm nào trên biểu QLVT.20.
 *
 * Xuất ra ngoài để báo cáo năm ghép được số THỰC DÙNG vào đúng dòng kế hoạch: kế hoạch khoá
 * theo `(năm, nhóm, tên chữ chuẩn hoá)` nên phần thực dùng cũng phải quy về đúng khoá đó.
 */
export function annualPlanGroupOfCategory(category: string | null): AnnualPlanGroup {
  const key = annualPlanNameKey(category ?? "");
  if (key.includes("dau boi tron")) return ANNUAL_PLAN_GROUPS.OIL;
  if (key.includes("loc dau")) return ANNUAL_PLAN_GROUPS.FILTER;
  return ANNUAL_PLAN_GROUPS.OTHER;
}

function categoryMatchesGroup(category: string | null, group: AnnualPlanGroup) {
  return annualPlanGroupOfCategory(category) === group;
}

const quantityKey = (value: number) => Number(value.toFixed(4)).toString();

export async function buildAnnualPlanImportPreview(
  prisma: PrismaClient,
  buffer: Buffer,
  fileName: string,
  requestedSheet?: string | null,
): Promise<AnnualPlanImportPreview> {
  const parsed = parseWorkbook(buffer, fileName, requestedSheet);
  const [erpMaterials, materials, chemicalItems] = await Promise.all([
    prisma.erpMaterial.findMany({ where: { isActive: true }, select: { code: true } }),
    prisma.material.findMany({ select: { id: true, code: true, erpCodes: true, name: true, category: true } }),
    prisma.chemicalInventoryItem.findMany({
      where: { isActive: true, materialCode: { not: null } },
      select: { id: true, code: true, materialCode: true },
    }),
  ]);
  const erpSet = new Set(erpMaterials.map((item) => item.code.trim().toUpperCase()));
  const chemicalByMaterialCode = new Map(
    chemicalItems.flatMap((item) => item.materialCode ? [[item.materialCode.trim().toUpperCase(), item] as const] : []),
  );

  const codeValues = new Map<string, Map<string, number>>();
  for (const row of parsed.conflictRows) {
    for (const code of row.erpCodes) {
      const values = codeValues.get(code) ?? new Map<string, number>();
      values.set(quantityKey(row.plannedQuantity), row.plannedQuantity);
      codeValues.set(code, values);
    }
  }
  const conflicts: AnnualPlanConflict[] = [];
  for (const [code, values] of codeValues) {
    if (values.size <= 1) continue;
    conflicts.push({
      key: `ERP:${code}`,
      label: `Mã ERP ${code}`,
      erpCode: code,
      values: [...values.values()].sort((a, b) => a - b),
      rowNumbers: parsed.conflictRows.filter((row) => row.erpCodes.includes(code)).map((row) => row.sourceRow),
    });
  }
  const conflictingErpCodes = new Set(conflicts.flatMap((conflict) => conflict.erpCode ?? []));

  // Khoá DB là nhóm + tên, nên cả dòng có mã ERP vẫn phải được đối chiếu theo tên.
  // Nếu các dòng đã có chung một mã ERP mâu thuẫn thì bộ chọn ERP đó đủ để chốt,
  // không tạo thêm một bộ chọn tên trùng lặp.
  const nameValues = new Map<string, Map<string, number>>();
  for (const row of parsed.rows) {
    const key = `${row.materialCategory}|${row.materialNameKey}`;
    const values = nameValues.get(key) ?? new Map<string, number>();
    values.set(quantityKey(row.plannedQuantity), row.plannedQuantity);
    nameValues.set(key, values);
  }
  for (const [key, values] of nameValues) {
    if (values.size <= 1) continue;
    const nameRows = parsed.rows.filter((row) => `${row.materialCategory}|${row.materialNameKey}` === key);
    const sample = nameRows[0];
    const sharedConflictingErp = sample.erpCodes.some((code) =>
      conflictingErpCodes.has(code) && nameRows.every((row) => row.erpCodes.includes(code)),
    );
    if (sharedConflictingErp) continue;
    conflicts.push({
      key: `NAME:${key}`,
      label: sample.materialNameLabel,
      erpCode: null,
      values: [...values.values()].sort((a, b) => a - b),
      rowNumbers: nameRows.map((row) => row.sourceRow),
    });
  }
  const conflictByErp = new Map(conflicts.flatMap((item) => item.erpCode ? [[item.erpCode, item.key] as const] : []));
  const conflictByName = new Map(conflicts.filter((item) => !item.erpCode).map((item) => [item.key.slice(5), item.key]));

  const issues = [...parsed.issues];
  const unmatchedCodes = new Set<string>();
  const rows: ReconciledAnnualPlanRow[] = parsed.rows.map((row) => {
    const singleCode = row.erpCodes.length === 1 ? row.erpCodes[0] : null;
    const erpMatched = Boolean(singleCode && erpSet.has(singleCode));
    for (const code of row.erpCodes) {
      if (erpSet.has(code) || unmatchedCodes.has(code)) continue;
      unmatchedCodes.add(code);
      issues.push({
        severity: "warning",
        code: "ERP_NOT_FOUND",
        erpCode: code,
        message: `Mã ERP ${code} chưa có trong danh mục ERP của hệ thống`,
      });
    }

    const chemical = singleCode ? chemicalByMaterialCode.get(singleCode) ?? null : null;
    const codeCandidates = singleCode
      ? materials.filter((item) => item.code.toUpperCase() === singleCode || item.erpCodes.some((code) => code.toUpperCase() === singleCode))
      : [];
    const nameCandidates = codeCandidates.length === 0
      ? materials.filter((item) => annualPlanNameKey(item.name) === row.materialNameKey && categoryMatchesGroup(item.category, row.materialCategory))
      : [];
    const candidates = codeCandidates.length ? codeCandidates : nameCandidates;
    const material = candidates.length === 1 ? candidates[0] : null;
    if (candidates.length > 1) {
      issues.push({
        severity: "warning",
        code: "MATERIAL_AMBIGUOUS",
        row: row.sourceRow,
        erpCode: singleCode ?? undefined,
        message: "Có nhiều vật tư hệ thống cùng khớp; không tự gắn materialId",
      });
    }
    const matchStatus: ReconciledAnnualPlanRow["matchStatus"] = candidates.length > 1
      ? "AMBIGUOUS"
      : material && erpMatched ? "MATCHED"
      : erpMatched ? "ERP_ONLY"
      : material ? "NAME_ONLY"
      : "UNMATCHED";
    const nameConflictLookup = `${row.materialCategory}|${row.materialNameKey}`;
    return {
      ...row,
      erpCode: erpMatched || chemical ? singleCode : null,
      materialId: material?.id ?? null,
      materialCode: material?.code ?? null,
      chemicalItemId: chemical?.id ?? null,
      chemicalItemCode: chemical?.code ?? null,
      route: chemical ? "CHEMICAL" : "MATERIAL",
      conflictKeys: [
        ...row.erpCodes.flatMap((code) => conflictByErp.get(code) ?? []),
        ...[conflictByName.get(nameConflictLookup)].filter((key): key is string => Boolean(key)),
      ],
      matchStatus,
    };
  });

  return {
    fileName: parsed.fileName,
    fileHash: parsed.fileHash,
    sheetNames: parsed.sheetNames,
    selectedSheet: parsed.selectedSheet,
    detectedYear: parsed.detectedYear,
    headerRow: parsed.headerRow,
    rows,
    conflicts,
    issues,
    summary: {
      sourceRows: rows.length + parsed.skippedWithoutPlan,
      planRows: rows.length,
      skippedWithoutPlan: parsed.skippedWithoutPlan,
      chemicalRows: rows.filter((row) => row.route === "CHEMICAL").length,
      materialRows: rows.filter((row) => row.route === "MATERIAL").length,
      erpMatchedRows: rows.filter((row) => row.erpCode).length,
      materialMatchedRows: rows.filter((row) => row.materialId).length,
      unmatchedErpCodes: unmatchedCodes.size,
      conflictCount: conflicts.length,
    },
  };
}

export function resolveAnnualPlanRows(
  preview: AnnualPlanImportPreview,
  resolutions: Record<string, number>,
) {
  for (const conflict of preview.conflicts) {
    const selected = Number(resolutions[conflict.key]);
    if (!Number.isFinite(selected) || !conflict.values.some((value) => quantityKey(value) === quantityKey(selected))) {
      throw new Error(`Vui lòng chọn một giá trị hợp lệ cho ${conflict.label}`);
    }
  }

  const byUniqueKey = new Map<string, ReconciledAnnualPlanRow>();
  for (const row of preview.rows) {
    const selectedValues = Array.from(new Set(
      row.conflictKeys.map((key) => quantityKey(Number(resolutions[key]))),
    ));
    if (selectedValues.length > 1) {
      throw new Error(`Các mã ERP cùng dòng ${row.sourceRow} đang được chốt với giá trị khác nhau`);
    }
    const plannedQuantity = selectedValues.length === 1 ? Number(selectedValues[0]) : row.plannedQuantity;
    const uniqueKey = `${row.materialCategory}|${row.materialNameKey}`;
    const previous = byUniqueKey.get(uniqueKey);
    if (!previous) {
      byUniqueKey.set(uniqueKey, { ...row, plannedQuantity });
      continue;
    }
    if (quantityKey(previous.plannedQuantity) !== quantityKey(plannedQuantity)) {
      throw new Error(`Vật tư “${row.materialNameLabel}” có nhiều kế hoạch khác nhau nhưng chưa được chốt`);
    }
    // Nhiều dòng cùng tên chỉ là nhiều mục đích sử dụng. Chỉ tiêu E là theo mã/tên,
    // vì vậy giữ một dòng kế hoạch sau khi toàn bộ mâu thuẫn đã được người dùng chốt.
    byUniqueKey.set(uniqueKey, {
      ...previous,
      plannedQuantity,
      erpCode: previous.erpCode ?? row.erpCode,
      materialId: previous.materialId ?? row.materialId,
      materialCode: previous.materialCode ?? row.materialCode,
      chemicalItemId: previous.chemicalItemId ?? row.chemicalItemId,
      chemicalItemCode: previous.chemicalItemCode ?? row.chemicalItemCode,
      route: previous.route === "CHEMICAL" || row.route === "CHEMICAL" ? "CHEMICAL" : "MATERIAL",
    });
  }
  return [...byUniqueKey.values()];
}
