import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const sourcePath = path.join(rootDir, "templates", "bbnt-do-template-bi.docx");

const variants = [
  {
    suffix: "dau",
    workItems: [
      "-Kiểm tra mức dầu trước thực hiện",
      "-Châm dầu, nhớt, mỡ",
      "-Kiểm tra thiết bị sau khi thực hiện",
    ],
  },
  {
    suffix: "loi",
    workItems: [
      "-Tháo và vệ sinh bên trong bộ lọc",
      "-Thay mới lõi lọc",
      "-Lắp đặt lại bộ lọc",
    ],
  },
];

const tablePattern = /<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g;
const rowPattern = /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g;
const cellPattern = /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g;
const macroPattern = /\{\{[^}]+\}\}/g;

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function replaceCellText(cellXml, value) {
  const openingTag = cellXml.match(/^<w:tc(?:\s[^>]*)?>/)?.[0] ?? "<w:tc>";
  const cellProperties = cellXml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0] ?? "";
  const paragraphOpeningTag = cellXml.match(/<w:p(?:\s[^>]*)?>/)?.[0] ?? "<w:p>";
  const paragraphProperties = cellXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
  const runProperties = cellXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
  return (
    `${openingTag}${cellProperties}${paragraphOpeningTag}${paragraphProperties}` +
    `<w:r>${runProperties}<w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>` +
    "</w:p></w:tc>"
  );
}

function replaceCellAt(rowXml, cellIndex, value) {
  const cells = [...rowXml.matchAll(cellPattern)];
  const target = cells[cellIndex];
  if (!target || target.index === undefined) {
    throw new Error(`Không tìm thấy ô thứ ${cellIndex + 1} trong bảng Nội dung công tác`);
  }
  return (
    rowXml.slice(0, target.index) +
    replaceCellText(target[0], value) +
    rowXml.slice(target.index + target[0].length)
  );
}

function patchWorkTable(documentXml, workItems) {
  let patched = false;
  const result = documentXml.replace(tablePattern, (tableXml) => {
    if (
      patched ||
      !tableXml.includes("Nội dung công tác") ||
      !tableXml.includes("Vật tư thay thế")
    ) {
      return tableXml;
    }

    const rows = [...tableXml.matchAll(rowPattern)];
    if (rows.length < 7) {
      throw new Error("Bảng Nội dung công tác không đủ 7 dòng như mẫu chuẩn");
    }

    let nextTable = tableXml;
    for (let index = workItems.length - 1; index >= 0; index -= 1) {
      const row = rows[index + 2];
      if (!row || row.index === undefined) {
        throw new Error(`Không tìm thấy dòng công tác STT ${index + 2}`);
      }
      const updatedRow = replaceCellAt(row[0], 1, workItems[index]);
      nextTable =
        nextTable.slice(0, row.index) +
        updatedRow +
        nextTable.slice(row.index + row[0].length);
    }
    patched = true;
    return nextTable;
  });

  if (!patched) {
    throw new Error("Không tìm thấy bảng Nội dung công tác trong mẫu BBNT D-Office");
  }
  return result;
}

const sourceBuffer = readFileSync(sourcePath);
const sourceZip = new PizZip(sourceBuffer);
const sourceXml = sourceZip.file("word/document.xml")?.asText();
if (!sourceXml) throw new Error("Mẫu BBNT D-Office không có word/document.xml");
const sourceMacros = [...sourceXml.matchAll(macroPattern)].map((match) => match[0]).sort();

for (const variant of variants) {
  const zip = new PizZip(sourceBuffer);
  const documentXml = zip.file("word/document.xml")?.asText();
  if (!documentXml) throw new Error("Mẫu BBNT D-Office không có word/document.xml");

  const patchedXml = patchWorkTable(documentXml, variant.workItems);
  const variantMacros = [...patchedXml.matchAll(macroPattern)].map((match) => match[0]).sort();
  if (JSON.stringify(variantMacros) !== JSON.stringify(sourceMacros)) {
    throw new Error(`Macro của mẫu -${variant.suffix} không còn giống mẫu gốc`);
  }
  if (!patchedXml.includes("{{materialSummary}}")) {
    throw new Error(`Mẫu -${variant.suffix} bị mất macro {{materialSummary}}`);
  }

  zip.file("word/document.xml", patchedXml);
  const outputPath = path.join(
    rootDir,
    "templates",
    `bbnt-do-template-${variant.suffix}.docx`
  );
  writeFileSync(
    outputPath,
    zip.generate({ type: "nodebuffer", compression: "DEFLATE" })
  );
  console.log(`Đã tạo ${outputPath}`);
}
