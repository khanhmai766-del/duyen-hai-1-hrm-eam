// Nhập cây danh mục thiết bị từ DM_ThietBi.xlsx vào bảng EquipmentNode.
// Phân cấp theo "Số thứ tự" dạng chấm (cha của "1.1.1.2" là "1.1.1").
//
// Dùng:
//   node scripts/import-equipment.mjs            # nhập vào DB local (.env DATABASE_URL)
//   EQUIP_DATABASE_URL="postgresql://..." node scripts/import-equipment.mjs   # nhập DB khác (vd server)
//   EQUIP_XLSX="/đường/dẫn.xlsx" node scripts/import-equipment.mjs            # đổi file nguồn
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.env.EQUIP_XLSX || join(root, "scripts", "data", "DM_ThietBi.xlsx");
const url = process.env.EQUIP_DATABASE_URL; // nếu trỏ DB khác (vd server)

const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

const norm = (v) => String(v ?? "").trim();
const parentOf = (seq) => {
  const parts = seq.split(".");
  parts.pop();
  return parts.length ? parts.join(".") : null;
};
const normalizeEquipmentName = (seq, name) => {
  if (
    seq.startsWith("1.4.11.") &&
    /bunker\s*than/i.test(name) &&
    /than\s*nguyên|than\s*nguyen/i.test(name)
  ) {
    return "Bunker than nguyên";
  }

  return name;
};

// Node nhóm cha bổ sung (không có trong file nguồn) — gom các nhánh mồ côi lại.
const EXTRA_NODES = [
  { seq: "1.1", name: "HỆ THỐNG XỬ LÝ NƯỚC", drawing: "F4281Z" },
];

async function main() {
  const buf = readFileSync(file);
  const wb = XLSX.read(buf, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

  const data = rows
    .map((r, i) => {
      const seq = norm(r["Số thứ tự"]);
      return {
        seq,
        parentSeq: parentOf(seq),
        code: norm(r["Mã thiết bị"]),
        name: normalizeEquipmentName(seq, norm(r["Tên thiết bị"])),
        kks: norm(r["Mã KKS"]) || null,
        drawing: norm(r["Bản vẽ liên quan"]) || null,
        depth: seq.split(".").length,
        sort: i,
      };
    })
    // Bỏ nhánh "Tổ máy S2" (seq bắt đầu bằng "2").
    .filter((d) => d.seq && d.code && d.seq !== "2" && !d.seq.startsWith("2."));

  // Thêm các node nhóm cha tổng hợp (nếu chưa có trong nguồn).
  const present = new Set(data.map((d) => d.seq));
  for (const e of EXTRA_NODES) {
    if (present.has(e.seq)) continue;
    data.push({
      seq: e.seq,
      parentSeq: parentOf(e.seq),
      code: e.code ?? "",
      name: e.name,
      kks: e.kks ?? null,
      drawing: e.drawing ?? null,
      depth: e.seq.split(".").length,
      sort: -1,
    });
  }

  console.log(`Đọc ${data.length} dòng từ ${file}`);

  // Thay toàn bộ danh mục.
  await prisma.equipmentNode.deleteMany({});
  const CHUNK = 500;
  let done = 0;
  for (let i = 0; i < data.length; i += CHUNK) {
    const res = await prisma.equipmentNode.createMany({ data: data.slice(i, i + CHUNK), skipDuplicates: true });
    done += res.count;
  }

  const total = await prisma.equipmentNode.count();
  const seqSet = new Set(data.map((d) => d.seq));
  const roots = data.filter((d) => !d.parentSeq || !seqSet.has(d.parentSeq)).length;
  const maxDepth = Math.max(...data.map((d) => d.depth));
  console.log(`✅ Đã nhập ${done}/${data.length}. Tổng trong DB: ${total}. Node gốc: ${roots}. Độ sâu tối đa: ${maxDepth}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗ Lỗi:", e);
  await prisma.$disconnect();
  process.exit(1);
});
