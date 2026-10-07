import ExcelJS from "exceljs";
import { normalizePosition } from "@/lib/pccc-position";
import { normalizeText } from "@/lib/nav";

export type CatalogPoint = { type: "GROUNDING" | "LIGHTNING"; status: "NORMAL" | "DEFECT" | "UNCHECKED"; defectDescription: string | null };
export type CatalogLocation = {
  sheet: string; rows: number[]; areaEquipment: string; position: string; positionCode: string;
  machine: string; machineExplicit: boolean; parentName: string | null; note: string | null;
  points: CatalogPoint[]; warnings: string[];
};

const compact = (text: string) => text.replace(/\s+/g, " ").trim();
export function catalogNameKey(text: string) {
  return compact(normalizeText(text)).replace(/\bmill(?:\s+mill)+\b/g, "mill").replace(/\bnha nha\b/g, "nha").replace(/\s*\.$/, "");
}
function text(cell: ExcelJS.Cell): string {
  const value = (cell.isMerged ? cell.master : cell).value;
  if (value == null) return "";
  if (typeof value === "object") {
    if ("richText" in value) return compact(value.richText.map((part) => part.text).join(""));
    if ("result" in value) return compact(String(value.result ?? ""));
    if ("text" in value) return compact(String(value.text));
  }
  return compact(String(value));
}
const empty = (value: string) => ["", "-"].includes(catalogNameKey(value));
const normal = (value: string) => ["x", "khong", "ko", "co", "binh thuong"].includes(catalogNameKey(value));
const defectWords = /(?:mat|thieu|bung|gay|ri set|gi set|oxy|oxi|muc|dut|giuoc)/;
function ordinaryPoint(type: CatalogPoint["type"], defect: string, healthy: string): CatalogPoint | null {
  if (empty(defect) && empty(healthy)) return null;
  if ((!empty(defect) && !normal(defect)) || defectWords.test(catalogNameKey(healthy))) {
    return { type, status: "DEFECT", defectDescription: !empty(defect) && !normal(defect) ? defect : healthy };
  }
  return { type, status: "NORMAL", defectDescription: null };
}

/** Máy nghiền 2 chuyển F sang tên bộ phận, G sang tình trạng: không coi mọi tên bộ phận là lỗi. */
export function millDetail(rawName: string, rawStatus: string, progress: string, parentName: string) {
  const failure = defectWords.test(catalogNameKey(rawName)) || defectWords.test(catalogNameKey(rawStatus));
  const name = compact(rawName.replace(/\s+(?:mất|thiếu|bung|gãy|đứt)\b.*$/iu, "").replace(/\s*\(\s*\d+\s*dây\s*\)\s*$/iu, ""));
  const areaEquipment = /\b2[A-F](?:[12])?\b/i.test(name) ? name : `${name} · ${parentName}`;
  const status: CatalogPoint["status"] = failure ? "DEFECT" : normal(rawStatus) ? "NORMAL" : "UNCHECKED";
  return {
    areaEquipment,
    point: { type: "GROUNDING" as const, status, defectDescription: failure ? [rawName, rawStatus].filter((value) => !empty(value) && !normal(value)).join("; ") : null },
    warnings: status === "UNCHECKED" && !empty(progress) ? ["Có ghi tiến độ nhưng chưa đủ thông tin xác định kết quả"] : [],
  };
}

export async function readGroundingCatalogWorkbook(file: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const locations: CatalogLocation[] = [];
  const headings: Array<{ sheet: string; row: number; name: string }> = [];
  const photos = new Map<string, number[]>();
  for (const sheet of workbook.worksheets) {
    if (/^(Tổng hợp|Trang tính3)$/i.test(sheet.name)) continue;
    for (const image of sheet.getImages()) {
      const key = `${sheet.name}|${image.range.tl.nativeRow + 1}`;
      photos.set(key, [...(photos.get(key) ?? []), Number(image.imageId)]);
    }
    let lastPosition = "";
    for (let row = 4; row <= sheet.rowCount; row++) {
      const cells = Array.from({ length: 10 }, (_, col) => text(sheet.getCell(row, col + 1)));
      let area = cells[2];
      if (cells[1]) lastPosition = cells[1];
      const mill2 = sheet.name === "Máy nghiền 2";
      if (!area && mill2 && cells[5]) {
        const code = cells[5].match(/\b2[A-F]\b/i)?.[0];
        if (code) area = `Mill ${code.toUpperCase()}`;
      }
      if (!area) continue;
      if (sheet.name === "MN-ND300m3" && ["he thong khi nen", "he thong nha dau 300m3"].includes(catalogNameKey(area))) {
        headings.push({ sheet: sheet.name, row, name: area }); continue;
      }
      const positionAliases: Record<string, string> = { "TPĐ": "Trực phụ điện", "XLNT- ND5000": "XLNT", "TBNT": "Trạm bơm nước thô", "TBĐLĐK": "Thiết bị đo lường điều khiển", "ESP Chung": "ESP" };
      const rawPosition = lastPosition || sheet.name.replace(/\s+([12])$/, " S$1");
      const position = normalizePosition(positionAliases[rawPosition] ?? rawPosition);
      if (!position.code || !position.label) throw new Error(`Không nhận diện cương vị ở ${sheet.name}, dòng ${row}: ${rawPosition}`);
      const explicitUnit = cells[8].match(/^S([12])$/i)?.[1] ?? (/\s[12]$/.test(sheet.name) ? sheet.name.slice(-1) : null);
      const explicitCommon = /^(common|chung)$/i.test(cells[8]);
      const namedUnits = Array.from(area.matchAll(/\bS([12])\b/gi), (match) => match[1]);
      const inferredUnit = new Set(namedUnits).size === 1 ? namedUnits[0] : null;
      const machine = explicitCommon ? "COMMON" : explicitUnit ? `S${explicitUnit}` : position.machine !== "COMMON" ? position.machine : inferredUnit ? `S${inferredUnit}` : "COMMON";
      const parentCode = sheet.name.startsWith("Máy nghiền") ? area.match(/\b([12][A-F])(?:[12])?\b/i)?.[1] : null;
      const parentName = parentCode ? `Mill ${parentCode.toUpperCase()}` : null;
      let points: CatalogPoint[];
      let warnings: string[] = [];
      if (mill2 && parentName) {
        if (!cells[5]) throw new Error(`Thiếu tên bộ phận ở ${sheet.name}, dòng ${row}`);
        const detail = millDetail(cells[5], cells[6], cells[7], parentName);
        area = detail.areaEquipment; points = [detail.point]; warnings = detail.warnings;
      } else if (mill2 && /^Quạt gió chèn 2[AB]$/i.test(area)) {
        // F là tên động cơ, C đã là tên vị trí độc lập; giữ tên C và chỉ đọc kết quả G.
        points = [millDetail(cells[5], cells[6], cells[7], area).point];
      } else {
        points = [ordinaryPoint("LIGHTNING", cells[3], cells[4]), ordinaryPoint("GROUNDING", cells[5], cells[6])].filter((point): point is CatalogPoint => Boolean(point));
        if (!points.length) {
          if (sheet.name.startsWith("Máy nghiền")) points = [{ type: "GROUNDING", status: "UNCHECKED", defectDescription: null }];
          warnings.push("Chưa ghi kết quả trong file, giữ Chưa kiểm tra");
        }
      }
      locations.push({ sheet: sheet.name, rows: [row], areaEquipment: area, position: position.label, positionCode: position.code, machine,
        machineExplicit: Boolean(explicitUnit || explicitCommon || position.machine !== "COMMON" || inferredUnit), parentName, note: cells[7] || null, points, warnings });
    }
  }
  const seen = new Map<string, CatalogLocation[]>();
  for (const row of locations) {
    const key = `${row.positionCode}|${row.machine}|${catalogNameKey(row.areaEquipment)}`;
    seen.set(key, [...(seen.get(key) ?? []), row]);
  }
  for (const rows of seen.values()) {
    if (rows.length < 2) continue;
    for (const row of rows) row.warnings.push(`Giữ riêng từng dòng trùng tên theo yêu cầu; các dòng: ${rows.flatMap((entry) => entry.rows).join(", ")}`);
  }
  return { locations, headings, rawLocationCount: locations.length, photos, getImage: (id: number) => workbook.getImage(id) };
}
