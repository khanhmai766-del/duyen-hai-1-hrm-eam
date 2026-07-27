import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const prisma = new PrismaClient();
const sourceFile = process.argv[2];
const applyChanges = process.argv.includes("--apply");
const sqlArgument = process.argv.find((arg) => arg.startsWith("--sql="));
const sqlOutput = sqlArgument ? path.resolve(sqlArgument.slice("--sql=".length)) : null;
const canonicalDepartments = new Set(["VH", "VH3", ""]);

if (!sourceFile) {
  throw new Error(
    "Thiếu file nguồn. Cách dùng: node scripts/restore-equipment-kks-from-source.mjs <file.xlsx> [--apply] [--sql=<file.sql>]"
  );
}

const clean = (value) => String(value ?? "").trim();
const cleanNullable = (value) => {
  const text = clean(value);
  return text === "" || text.toUpperCase() === "N/A" ? null : text;
};
const cleanKks = (value) => {
  const text = cleanNullable(value);
  if (!text) return null;
  return /^không có/i.test(text) || /^\(?n\/a\)?$/i.test(text) ? null : text;
};
const canonical = (value) => (value == null ? null : String(value).replace(/\r\n/g, "\n"));
const same = (left, right) => canonical(left) === canonical(right);
const normalizeKksPrefix = (kks) =>
  kks
    ? kks.replace(/^(?:20|1O|X0|XO|2O)/i, "10").replace(/^X(?=[12])/i, "1")
    : kks;
const normalizeX0Tokens = (value) =>
  value?.replace(/(^|[^A-Z0-9])X(?:0|\s+O)/gi, (_match, boundary) => `${boundary}10`) ?? value;

function legacyImportNormalization(seq, kks) {
  if (!kks) return null;
  if (/^DH1\.S1\.3(?:\.|$)/.test(seq)) {
    const electrical = kks.replace(/^X(?=[02])/i, "1");
    return /^20/i.test(electrical) ? `10${electrical.slice(2)}` : electrical;
  }

  const inBranch12 = /^DH1\.S1\.(?:1|2)(?:\.|$)/.test(seq);
  const turbine = /^DH1\.S1\.2(?:\.|$)/.test(seq)
    ? kks.replace(/\bX(?=[12])/gi, "1")
    : kks;
  return inBranch12 && /^(?:X0|XO|1O|20|2O)/i.test(turbine)
    ? `10${turbine.slice(2)}`
    : turbine;
}

function historicalKksVariants(seq, sourceKks) {
  const variants = [sourceKks];
  const afterImport = legacyImportNormalization(seq, sourceKks);
  variants.push(afterImport);

  for (const value of [...variants]) {
    if (value && /^[kx]hông có/i.test(value)) variants.push(null);
    else variants.push(normalizeX0Tokens(value));
  }

  return variants.filter(
    (value, index, values) => values.findIndex((other) => same(other, value)) === index
  );
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function sqlLiteral(value) {
  if (value == null) return "NULL";
  const escaped = String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "''")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n");
  return `E'${escaped}'`;
}

function buildSql(rows) {
  const values = rows
    .map(
      (row) =>
        `  (${sqlLiteral(row.seq)}, ${sqlLiteral(row.desiredKks)}, ${sqlLiteral(
          row.restoreName ? row.desiredName : null
        )}, ${sqlLiteral(row.searchText)})`
    )
    .join(",\n");

  return `-- Phục hồi KKS từ file danh mục gốc và chuẩn hóa đúng hai ký tự đầu chuỗi.
-- X1/X2 -> 11/12; 20, 1O, X0, XO, 2O -> 10.
-- Không thay các tiền tố này khi nằm giữa chuỗi hoặc ở mã con phía sau.
-- Sinh bởi scripts/restore-equipment-kks-from-source.mjs.
BEGIN;

WITH restored("seq", "kks", "name", "searchText") AS (
VALUES
${values}
)
UPDATE "EquipmentNode" AS target
SET
  "kks" = restored."kks",
  "name" = COALESCE(restored."name", target."name"),
  "searchText" = restored."searchText"
FROM restored
WHERE target."seq" = restored."seq";

COMMIT;
`;
}

async function main() {
  const workbook = XLSX.readFile(sourceFile);
  const sheet = workbook.Sheets["Ds Thiet Bi"] ?? workbook.Sheets[workbook.SheetNames[0]];
  const sourceRows = XLSX.utils.sheet_to_json(sheet, { defval: null, blankrows: false });
  const filteredRows = sourceRows.filter((row) =>
    canonicalDepartments.has(clean(row["Bộ phận quản lý"]).toUpperCase())
  );

  const dbRows = await prisma.equipmentNode.findMany({
    select: {
      seq: true,
      externalId: true,
      code: true,
      name: true,
      kks: true,
    },
  });
  const byExternalId = new Map(
    dbRows.filter((row) => row.externalId).map((row) => [row.externalId, row])
  );
  const bySeq = new Map(dbRows.map((row) => [row.seq, row]));
  const corrections = [];
  const unrelatedKksDifferences = [];
  const matchedSeqs = new Set();

  for (const source of filteredRows) {
    const externalId = clean(source.Assetid);
    const sourceSeq = clean(source["Mã thiết bị"]);
    const current = (externalId && byExternalId.get(externalId)) || bySeq.get(sourceSeq);
    if (!current || matchedSeqs.has(current.seq)) continue;
    matchedSeqs.add(current.seq);

    const sourceKks = cleanKks(source["Mã KKS"]);
    const desiredKks = normalizeKksPrefix(sourceKks);
    const kksVariants = historicalKksVariants(current.seq, sourceKks);
    const kksWasTargeted = kksVariants.some((variant) => !same(variant, desiredKks));

    const sourceName = clean(source["Tên thiết bị"]) || current.seq;
    const legacyName = normalizeX0Tokens(sourceName);
    const nameWasTargeted = !same(sourceName, legacyName);
    if (!kksWasTargeted && !nameWasTargeted) {
      if (!same(current.kks, desiredKks)) {
        unrelatedKksDifferences.push({
          seq: current.seq,
          currentKks: current.kks,
          desiredKks,
        });
      }
      continue;
    }

    const desiredName = nameWasTargeted ? sourceName : current.name;
    const displayCode = current.seq.replace(/^DH1\.S1\.?/, "") || current.seq;
    corrections.push({
      seq: current.seq,
      currentKks: current.kks,
      desiredKks,
      desiredName,
      restoreName: nameWasTargeted,
      changesName: nameWasTargeted && !same(current.name, sourceName),
      searchText: normalizeSearchText(
        `${desiredName} ${desiredKks ?? ""} ${displayCode} ${current.seq}`
      ),
      changesKks: !same(current.kks, desiredKks),
    });
  }

  const changedKks = corrections.filter((row) => row.changesKks);
  const changedNames = corrections.filter((row) => row.changesName);
  console.log(`Nguồn: ${filteredRows.length} dòng thuộc VH/VH3/trống`);
  console.log(`Khớp DB: ${matchedSeqs.size}/${dbRows.length} thiết bị`);
  console.log(`Phạm vi phục hồi an toàn: ${corrections.length} thiết bị`);
  console.log(`KKS cần đổi: ${changedKks.length}; tên cần trả lại: ${changedNames.length}`);
  console.log(`KKS khác nguồn ngoài các quy tắc đã đổi nhầm: ${unrelatedKksDifferences.length}`);
  console.table(
    changedKks.slice(0, 12).map((row) => ({
      "Mã thiết bị": row.seq,
      "KKS hiện tại": row.currentKks,
      "KKS đúng": row.desiredKks,
    }))
  );
  if (unrelatedKksDifferences.length) {
    console.table(
      unrelatedKksDifferences.slice(0, 12).map((row) => ({
        "Mã thiết bị": row.seq,
        "KKS hiện tại": row.currentKks,
        "KKS trong nguồn": row.desiredKks,
      }))
    );
  }

  if (sqlOutput) {
    fs.writeFileSync(sqlOutput, buildSql(corrections), "utf8");
    console.log(`Đã sinh SQL phục hồi: ${sqlOutput}`);
  }

  if (!applyChanges) {
    console.log("Đang ở chế độ xem trước; thêm --apply để cập nhật cơ sở dữ liệu.");
    return;
  }

  const batchSize = 250;
  for (let index = 0; index < corrections.length; index += batchSize) {
    const batch = corrections.slice(index, index + batchSize);
    await prisma.$transaction(
      batch.map((row) =>
        prisma.equipmentNode.update({
          where: { seq: row.seq },
          data: {
            kks: row.desiredKks,
            ...(row.restoreName ? { name: row.desiredName } : {}),
            searchText: row.searchText,
          },
        })
      )
    );
  }
  console.log(`Đã phục hồi ${corrections.length} thiết bị theo đúng dữ liệu nguồn.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
