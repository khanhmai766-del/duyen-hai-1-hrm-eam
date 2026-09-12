/**
 * Xem trước hoặc nhập danh sách kiểm tra tiếp địa & chống sét từ workbook gốc.
 *
 *   npm run import:grounding-lightning -- --file "/path/file.xlsx"          # chỉ xem trước
 *   npm run import:grounding-lightning -- --file "/path/file.xlsx" --commit # ghi DB + S3
 *
 * Mặc định KHÔNG ghi. Ô merge được trải xuống; X/Có/Bình thường/Không ở cột
 * khiếm khuyết được chuẩn hoá; ảnh neo cùng dòng được gắn vào điểm đang khiếm khuyết.
 */
import path from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { normalizePosition } from "../lib/pccc-position";
import { uploadImageBufferToS3 } from "../lib/s3";

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const fileIndex = argv.indexOf("--file");
const FILE = fileIndex >= 0 ? argv[fileIndex + 1] : undefined;
const COMMIT = argv.includes("--commit");
const SKIP_IMAGES = argv.includes("--skip-images");
if (!FILE) throw new Error('Thiếu --file. Ví dụ: npm run import:grounding-lightning -- --file "/path/file.xlsx"');

type PointDraft = { type: "LIGHTNING" | "GROUNDING"; status: "NORMAL" | "DEFECT" | "UNCHECKED"; defectDescription: string | null };
type RowDraft = {
  sourceKey: string; sheet: string; row: number; areaEquipment: string;
  position: string | null; positionCode: string | null; machine: string; note: string | null;
  points: PointDraft[]; imageIds: number[];
};

function text(cell: ExcelJS.Cell) {
  const target = cell.isMerged ? cell.master : cell;
  const value = target.value;
  if (value == null) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if ("text" in value) return String(value.text ?? "").trim();
  }
  return String(value).trim();
}
function compact(value: string) { return value.replace(/\s+/g, " ").trim(); }
function normalized(value: string) { return compact(value).toLocaleLowerCase("vi-VN"); }
function uniqueLines(values: Array<string | null>) {
  const seen = new Set<string>();
  return values.flatMap((value) => (value ?? "").split(/\r?\n/)).map(compact).filter((value) => {
    const key = normalized(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function isEmptyMarker(value: string) { return ["", "-"].includes(normalized(value)); }
function isNoDefect(value: string) { return ["không", "ko", "khong", "bình thường", "binh thuong", "x", "có", "co"].includes(normalized(value)); }
function point(type: PointDraft["type"], defectCell: string, normalCell: string): PointDraft | null {
  if (isEmptyMarker(defectCell) && isEmptyMarker(normalCell)) return null;
  if (!isEmptyMarker(defectCell) && !isNoDefect(defectCell)) return { type, status: "DEFECT", defectDescription: compact(defectCell) };
  if (!isEmptyMarker(normalCell) || isNoDefect(defectCell)) return { type, status: "NORMAL", defectDescription: null };
  return { type, status: "UNCHECKED", defectDescription: null };
}
function inferredPosition(sheet: string, raw: string) {
  const special: Record<string, string> = {
    "TPĐ": "Trực phụ điện",
    "XLNT- ND5000": "XLNT",
    "ESP Chung": "ESP",
    "TBNT": "Trạm bơm nước thô",
    "TBĐLĐK": "Thiết bị đo lường điều khiển",
    "IC": "Thiết bị đo lường điều khiển",
    "Máy nghiền 1": "Máy nghiền S1",
    "Máy nghiền 2": "Máy nghiền S2",
  };
  if (raw) return special[compact(raw)] ?? raw;
  return special[sheet] ?? sheet.replace(/\s+1$/, " S1").replace(/\s+2$/, " S2").replace(/\+chung$/i, "");
}
function machineFrom(sheet: string, value: string) {
  const raw = normalized(value);
  if (raw === "s1" || /s1$/.test(raw)) return "S1";
  if (raw === "s2" || /s2$/.test(raw)) return "S2";
  if (/chung|common/.test(raw)) return "COMMON";
  if (/\b1$/.test(sheet)) return "S1";
  if (/\b2$/.test(sheet)) return "S2";
  return null;
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.resolve(FILE!));
  const sourcePrefix = path.basename(FILE!, path.extname(FILE!));
  const drafts: RowDraft[] = [];
  const unmatched = new Set<string>();

  for (const sheet of workbook.worksheets) {
    if (/^(trang tính3|tổng hợp)$/i.test(sheet.name.trim())) continue;
    const imagesByRow = new Map<number, number[]>();
    for (const image of sheet.getImages()) {
      const row = image.range.tl.nativeRow + 1;
      imagesByRow.set(row, [...(imagesByRow.get(row) ?? []), Number(image.imageId)]);
    }
    let lastPosition = "";
    let lastArea = "";
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 3) return;
      const rawPosition = compact(text(row.getCell(2)));
      const rawArea = compact(text(row.getCell(3)));
      if (rawPosition) lastPosition = rawPosition;
      if (rawArea) lastArea = rawArea;
      const points = [
        point("LIGHTNING", text(row.getCell(4)), text(row.getCell(5))),
        point("GROUNDING", text(row.getCell(6)), text(row.getCell(7))),
      ].filter((value): value is PointDraft => Boolean(value));
      if (!points.length || !lastArea) return;
      const rawLabel = inferredPosition(sheet.name.trim(), lastPosition);
      const position = normalizePosition(rawLabel);
      if (position.unmatched && position.label) unmatched.add(position.label);
      const explicitMachine = machineFrom(sheet.name, text(row.getCell(9)));
      drafts.push({
        sourceKey: `${sourcePrefix}|${sheet.name}|${rowNumber}`,
        sheet: sheet.name,
        row: rowNumber,
        areaEquipment: lastArea,
        position: position.label,
        positionCode: position.code,
        machine: explicitMachine ?? position.machine,
        note: compact(text(row.getCell(8))) || null,
        points,
        imageIds: imagesByRow.get(rowNumber) ?? [],
      });
    });
  }

  const grouped = new Map<string, RowDraft>();
  for (const draft of drafts) {
    const key = `${draft.positionCode ?? ""}|${draft.machine}|${normalized(draft.areaEquipment)}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...draft, points: draft.points.map((entry) => ({ ...entry })), imageIds: [...draft.imageIds] });
      continue;
    }
    current.note = uniqueLines([current.note, draft.note]).join("\n") || null;
    current.imageIds = Array.from(new Set([...current.imageIds, ...draft.imageIds]));
    for (const incoming of draft.points) {
      const saved = current.points.find((entry) => entry.type === incoming.type);
      if (!saved) {
        current.points.push({ ...incoming });
        continue;
      }
      const descriptions = uniqueLines([saved.defectDescription, incoming.defectDescription]);
      if (saved.status === "DEFECT" || incoming.status === "DEFECT") saved.status = "DEFECT";
      else if (saved.status === "NORMAL" || incoming.status === "NORMAL") saved.status = "NORMAL";
      else saved.status = "UNCHECKED";
      saved.defectDescription = saved.status === "DEFECT" ? descriptions.join("\n") || null : null;
    }
  }
  const groupedDrafts = [...grouped.values()];
  const defectRows = groupedDrafts.filter((row) => row.points.some((entry) => entry.status === "DEFECT")).length;
  const imageCount = groupedDrafts.reduce((sum, row) => sum + row.imageIds.length, 0);
  const lightningOnly = groupedDrafts.filter((row) => row.points.length === 1 && row.points[0].type === "LIGHTNING").length;
  const groundingOnly = groupedDrafts.filter((row) => row.points.length === 1 && row.points[0].type === "GROUNDING").length;
  const both = groupedDrafts.filter((row) => row.points.length === 2).length;
  console.log(`Đã đọc ${drafts.length} dòng và gộp thành ${groupedDrafts.length} thiết bị · ${defectRows} thiết bị có khiếm khuyết · ${imageCount} ảnh.`);
  console.log(`Phân loại: ${lightningOnly} chỉ chống sét · ${groundingOnly} chỉ tiếp địa · ${both} có cả hai.`);
  if (unmatched.size) console.warn(`Cương vị chưa khớp danh mục (${unmatched.size}): ${[...unmatched].join(", ")}`);
  if (!COMMIT) {
    console.log("Đang ở chế độ xem trước; thêm --commit để ghi cơ sở dữ liệu và tải ảnh lên S3.");
    return;
  }
  if (SKIP_IMAGES) console.log("Bỏ qua toàn bộ ảnh trong workbook; người dùng sẽ tự tải ảnh khiếm khuyết lên sau.");

  let imported = 0;
  for (const draft of groupedDrafts) {
    const item = await prisma.groundingLightningItem.upsert({
      where: { sourceKey: draft.sourceKey },
      update: { stt: null, areaEquipment: draft.areaEquipment, position: draft.position, positionCode: draft.positionCode, machine: draft.machine, note: draft.note, sourceSheet: draft.sheet, sourceRow: draft.row },
      create: { areaEquipment: draft.areaEquipment, position: draft.position, positionCode: draft.positionCode, machine: draft.machine, note: draft.note, sourceKey: draft.sourceKey, sourceSheet: draft.sheet, sourceRow: draft.row },
    });
    const points = new Map<string, { id: string; status: string }>();
    for (const entry of draft.points) {
      const saved = await prisma.groundingLightningPoint.upsert({
        where: { itemId_type: { itemId: item.id, type: entry.type } },
        update: { status: entry.status, defectDescription: entry.defectDescription },
        create: { itemId: item.id, type: entry.type, status: entry.status, defectDescription: entry.defectDescription },
      });
      points.set(entry.type, saved);
    }
    const defectPoints = draft.points.filter((entry) => entry.status === "DEFECT");
    const imageTarget = defectPoints.length === 1 ? points.get(defectPoints[0].type) : defectPoints.length > 1 ? points.get("GROUNDING") ?? points.get(defectPoints[0].type) : null;
    if (!SKIP_IMAGES && imageTarget && draft.imageIds.length && await prisma.groundingLightningAttachment.count({ where: { pointId: imageTarget.id } }) === 0) {
      for (const imageId of draft.imageIds) {
        const image = workbook.getImage(imageId);
        const buffer = image.buffer
          ? Buffer.from(image.buffer as unknown as Uint8Array)
          : image.base64
            ? Buffer.from(image.base64, "base64")
            : null;
        if (!buffer) continue;
        const mimeType = image.extension === "jpeg" ? "image/jpeg" : image.extension === "gif" ? "image/gif" : "image/png";
        const uploaded = await uploadImageBufferToS3({ buffer, contentType: mimeType, folder: `grounding-lightning/${item.id}/imported`, preset: "image" });
        await prisma.groundingLightningAttachment.create({ data: { pointId: imageTarget.id, s3Key: uploaded.key, originalName: `${draft.sheet}-${draft.row}.${image.extension}`, mimeType, bytes: buffer.length } });
      }
    }
    imported += 1;
  }
  console.log(`Đã nhập ${imported} thiết bị đã gộp vào cơ sở dữ liệu.`);
}

main().finally(() => prisma.$disconnect());
