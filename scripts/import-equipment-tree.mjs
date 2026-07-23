// Nhập cây thiết bị từ file Excel danh mục (chạy NGOÀI GIỜ, không qua API khi có người dùng).
//
//   node scripts/import-equipment-tree.mjs "C:/path/danhmucs1common.xlsx" [DEPT]
//
// Mặc định lọc bộ phận quản lý = VH (vận hành).
//
// NGUỒN CHUẨN (theo hướng dẫn):
//   - Định danh cây/khóa nghiệp vụ: MÃ THIẾT BỊ đầy đủ (vd DH1.S1.5.1.1) → cột `seq`.
//   - Đối soát đồng bộ: Assetid (ERP) → cột `externalId` (ổn định tuyệt đối).
//   - Quan hệ cha: AssetidParent (nếu cha thuộc VH); node "mồ côi" (cha ngoài VH) tái gắn
//     vào tổ tiên VH gần nhất theo TIỀN TỐ Mã thiết bị (đã kiểm chứng: mã con luôn bắt đầu
//     bằng mã cha, 0 vi phạm). KHÔNG dùng "Số thứ tự" để dựng cây.
//
// ⚠ XÓA SẠCH: xóa toàn bộ EquipmentNode cũ (cascade repair log / vật tư gắn / thẻ QR;
// SetNull khiếm khuyết / lịch thay thế) rồi nạp lại từ file. Không hoàn tác được.

import XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FILE = process.argv[2] || "C:/Users/Asus/OneDrive/Desktop/danhmucs1common.xlsx";
// Bộ lọc CHUẨN đã chốt: VH + VH3 + ô trống (22.708 dòng) — VH3/trống là thiết bị vận hành
// thật bị nhập thiếu/lệch cột bộ phận. Truyền arg thứ 3 để override (vd chỉ "VH").
const DEPT_ARG = (process.argv[3] || "").trim().toUpperCase();
const CANON_DEPTS = new Set(["VH", "VH3", ""]);
const deptOk = (d) => (DEPT_ARG ? d === DEPT_ARG : CANON_DEPTS.has(d));
const BATCH = 1000;

const clean = (v) => {
  const t = String(v ?? "").trim();
  return t === "" || t.toUpperCase() === "N/A" ? null : t;
};

// KKS: các giá trị GHI CHÚ ("Không có KKS", "N/A", "(N/A)") không phải mã → null cho sạch.
const cleanKks = (v) => {
  const t = clean(v);
  if (!t) return null;
  if (/^không có/i.test(t) || /^\(?n\/a\)?$/i.test(t)) return null;
  return t;
};

// Bỏ dấu + đ→d + lowercase (đồng bộ với normalizeText ở lib/nav.ts) để tìm kiếm không dấu.
const normalize = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();

async function main() {
  console.log(`📖 Đọc ${FILE} ...`);
  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, blankrows: false });
  const dept = rows.filter((r) => deptOk(String(r["Bộ phận quản lý"] ?? "").trim().toUpperCase()));
  console.log(`   Tổng ${rows.length} dòng → ${dept.length} dòng (bộ lọc ${DEPT_ARG || "VH+VH3+trống"})`);
  if (!dept.length) throw new Error("Không có dòng nào khớp bộ lọc bộ phận");

  const maOf = (r) => String(r["Mã thiết bị"] ?? "").trim();
  const assetOf = (r) => String(r["Assetid"] ?? "").trim();
  const assetParentOf = (r) => String(r["AssetidParent"] ?? "").trim();

  // Sắp xếp theo TỪNG ĐOẠN SỐ của Mã (5.1.10 sau 5.1.2, KHÔNG coi là số thập phân) → thứ tự
  // hiển thị đúng DFS số học cho anh em cùng cấp (1,2,3,5,6,7…).
  const cmpMa = (a, b) => {
    const pa = a.split("."), pb = b.split(".");
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      if (pa[i] === undefined) return -1;
      if (pb[i] === undefined) return 1;
      const nx = Number(pa[i]), ny = Number(pb[i]);
      if (!Number.isNaN(nx) && !Number.isNaN(ny)) { if (nx !== ny) return nx - ny; }
      else if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
    }
    return 0;
  };
  dept.sort((a, b) => cmpMa(maOf(a), maOf(b)));

  // Kiểm tra trước khi ghi (theo hướng dẫn — dừng nếu sai để tránh cây hỏng).
  const missingAsset = dept.filter((r) => !assetOf(r)).length;
  const missingMa = dept.filter((r) => !maOf(r)).length;
  const missingName = dept.filter((r) => !clean(r["Tên thiết bị"])).length;
  const maSet = new Set(dept.map(maOf));
  const assetSet = new Set(dept.map(assetOf));
  const dupMa = dept.length - maSet.size;
  const dupAsset = dept.length - assetSet.size;
  const wrongSystem = dept.filter((r) => !maOf(r).startsWith("DH1.S1")).length;
  if (missingAsset) throw new Error(`${missingAsset} dòng thiếu Assetid`);
  if (dupAsset) throw new Error(`${dupAsset} dòng trùng Assetid`);
  if (missingMa) throw new Error(`${missingMa} dòng thiếu Mã thiết bị`);
  if (dupMa) throw new Error(`${dupMa} dòng trùng Mã thiết bị trong cùng cây`);
  if (missingName) throw new Error(`${missingName} dòng thiếu Tên thiết bị`);
  if (wrongSystem) throw new Error(`${wrongSystem} dòng có Mã không bắt đầu bằng DH1.S1`);

  const byAsset = new Map(dept.map((r) => [assetOf(r), r]));

  // Cha = Mã của AssetidParent (nếu cha thuộc VH); nếu không → tổ tiên VH gần nhất theo
  // tiền tố Mã (cắt dần đuôi). null nếu là gốc.
  const nearestByPrefix = (ma) => {
    const parts = ma.split(".");
    parts.pop();
    while (parts.length) {
      const p = parts.join(".");
      if (maSet.has(p)) return p;
      parts.pop();
    }
    return null;
  };
  const parentMaOf = (r) => {
    const pa = assetParentOf(r);
    if (pa) {
      const parent = byAsset.get(pa);
      if (parent) return maOf(parent);
    }
    return nearestByPrefix(maOf(r));
  };

  const nodes = dept.map((r, i) => {
    const seq = maOf(r); // Mã thiết bị đầy đủ = fullCode = khóa
    const kks = cleanKks(r["Mã KKS"]);
    const name = clean(r["Tên thiết bị"]) ?? seq;
    const strippedCode = seq.replace(/^DH1\.S1\.?/, "") || seq;
    return {
      seq,
      externalId: assetOf(r),
      parentSeq: parentMaOf(r),
      code: seq, // giữ bất biến code == seq (Mã thiết bị đầy đủ)
      name,
      kks,
      drawing: clean(r["Bản vẽ liên quan"]),
      depth: seq.split(".").length, // vd DH1.S1.5.1.1 → 5
      sort: i + 1, // giữ đúng thứ tự file nguồn
      searchText: normalize(`${name} ${kks ?? ""} ${strippedCode} ${seq}`),
      deviceSynced: false,
    };
  });

  const cc = new Map();
  for (const n of nodes) if (n.parentSeq) cc.set(n.parentSeq, (cc.get(n.parentSeq) || 0) + 1);
  for (const n of nodes) n.childCount = cc.get(n.seq) || 0;

  const roots = nodes.filter((n) => !n.parentSeq).length;
  const reparented = dept.filter((r) => {
    const pa = assetParentOf(r);
    return pa && !byAsset.has(pa);
  }).length;
  const maxDepth = Math.max(...nodes.map((n) => n.depth));
  console.log(`   Node: ${nodes.length} | gốc: ${roots} | tái gắn mồ côi: ${reparented} | có con: ${cc.size} | cấp sâu nhất: ${maxDepth}`);

  console.log("🗑️  Xóa cây thiết bị cũ (cascade dữ liệu gắn theo) ...");
  const del = await prisma.equipmentNode.deleteMany({});
  console.log(`   Đã xóa ${del.count} node cũ`);

  console.log(`⬆️  Nạp ${nodes.length} node theo lô ${BATCH} ...`);
  let done = 0;
  for (let i = 0; i < nodes.length; i += BATCH) {
    const chunk = nodes.slice(i, i + BATCH);
    await prisma.equipmentNode.createMany({ data: chunk, skipDuplicates: true });
    done += chunk.length;
    if (done % 5000 === 0 || done === nodes.length) console.log(`   ${done}/${nodes.length}`);
  }

  const total = await prisma.equipmentNode.count();
  console.log(`✅ Xong. EquipmentNode trong DB: ${total}`);
}

main()
  .catch((e) => {
    console.error("❌ Import lỗi:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
