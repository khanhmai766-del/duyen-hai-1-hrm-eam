// Nhập khiếm khuyết từ file Excel "BM-BDSCTX-05 TỔNG KHIẾM KHUYẾT" (tải từ Google Sheet SYC).
//
//   node scripts/import-defects.mjs                # nhập 2 file mặc định trên Desktop (tab DH1)
//   node scripts/import-defects.mjs --dry          # chỉ XEM TRƯỚC, không ghi
//
// Quy tắc đã chốt (2026-07-23):
//   - Nhập TOÀN BỘ dòng có nội dung của tab DH1 (cả đã xử lý xong — lịch sử đầy đủ).
//   - Tổ máy: S1/S2 giữ nguyên; BOP/CHUNG → COMMON.
//   - Trạng thái: Đã xử lý xong→DA_XU_LY · Chưa xử lý→CHUA_XU_LY · Đang xử lý→CO_PCT ·
//     Chờ vật tư→CHO_VAT_TU · Chờ ngừng máy→CHO_NGUNG_MAY (trạng thái mới) · khác→CHUA_XU_LY.
//   - Số yêu cầu = "STT/năm phát hiện" (vd STT 158, phát hiện 15/01/2024 → "158/2024").
//     Chạy lại script sẽ CẬP NHẬT số yêu cầu cho cả bản ghi đã nhập trước đó.
//   - Dòng "gom danh sách số" giữ nguyên 1 phiếu như sheet (không bung từng thiết bị).
//   - Thiết bị lưu dạng text (cột `device`); KHÔNG bắt buộc gắn cây (deviceSeq gắn dần sau).
//   - Dedupe theo (unit + ngày phát hiện + 150 ký tự đầu nội dung) → chạy lại chỉ thêm dòng mới.

import XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

const FILES = [
  { path: "C:/Users/Asus/OneDrive/Desktop/20250505 BM-BDSCTX-05 TỔNG KHIẾM KHUYẾT_ CƠ_HÓA_Up 2026.xlsx", requestType: "Cơ" },
  { path: "C:/Users/Asus/OneDrive/Desktop/20250505 BM-BDSCTX-05 TỔNG KHIẾM KHUYẾT_ ĐIỆN_Up 2026.xlsx", requestType: "Điện" },
];
const SHEET = "DH1";
const CHUNK = 500;

const t = (v) => String(v ?? "").trim();
// S1/S2 giữ nguyên; BOP/CHUNG/ĐKTT/Phòng C&I và mọi khu vực khác → COMMON.
// Chỉ bỏ dòng phụ đề dạng "(2)".
const unitOf = (raw) => {
  const u = raw.toUpperCase().replace(/\s+/g, " ").trim();
  if (!u || /^\(\d+\)$/.test(u)) return null; // dòng phụ đề/lạc
  if (u === "S1" || u === "S2") return u;
  return "COMMON";
};
const STATUS_MAP = new Map([
  ["đã xử lý xong", "DA_XU_LY"], ["đã xử lý", "DA_XU_LY"], ["đã xong", "DA_XU_LY"],
  ["chưa xử lý", "CHUA_XU_LY"],
  ["đang xử lý", "CO_PCT"], ["đang thực hiện", "CO_PCT"],
  ["chờ vật tư", "CHO_VAT_TU"],
  ["chờ ngừng máy", "CHO_NGUNG_MAY"],
]);

function parseDate(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  const s = t(v);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
    if (!isNaN(d)) return d;
  }
  return null;
}

const dedupeKey = (unit, detectedAt, content) =>
  `${unit}|${detectedAt ? detectedAt.toISOString().slice(0, 10) : ""}|${t(content).replace(/\s+/g, " ").slice(0, 150).toLowerCase()}`;

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, email: true } });
  if (!admin) throw new Error("Không tìm thấy tài khoản ADMIN để gán người tạo");
  console.log(`👤 Người tạo (gán cho bản ghi nhập): ${admin.email}${DRY ? "  [DRY-RUN]" : ""}`);

  // Khóa chống trùng từ dữ liệu đã có (kèm id + requestNumber để cập nhật số yêu cầu)
  const existing = await prisma.defect.findMany({ select: { id: true, unit: true, detectedAt: true, content: true, requestNumber: true } });
  const byKey = new Map(existing.map((d) => [dedupeKey(d.unit, d.detectedAt, d.content ?? ""), d]));
  const seen = new Set(byKey.keys());
  console.log(`📚 Khiếm khuyết đang có trong DB: ${existing.length}`);

  let totalInserted = 0;
  let totalUpdated = 0;
  for (const file of FILES) {
    const wb = XLSX.readFile(file.path, { cellDates: true });
    const ws = wb.Sheets[SHEET];
    if (!ws) { console.log(`⚠️  ${file.path.split("/").pop()}: không có tab ${SHEET} — bỏ qua`); continue; }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });
    const hIdx = rows.findIndex((r) => r.some((c) => String(c ?? "").includes("Tồn tại")));
    const H = rows[hIdx].map((c) => String(c ?? ""));
    const col = (kw) => H.findIndex((h) => h.includes(kw));
    const C = {
      stt: col("STT"),
      may: col("Tổ máy"), tb: col("Thiết bị"), cv: col("Cương vị"), nd: col("Tồn tại"),
      ngay: col("Ngày phát hiện"), pccc: col("Ảnh hưởng PCCC"), mt: col("Môi trường"),
      pl: col("Phân loại"), dk: col("ĐK thực"), kq: col("Ghi chú Kq"), gc: col("Ghi chú (VH1)"),
      ketThuc: col("Ngày kết thúc"),
    };

    const stats = { read: 0, junk: 0, dup: 0, insert: 0, update: 0, statusUnknown: 0 };
    const byStatus = {};
    const batch = [];
    const updates = []; // { id, requestNumber } — sửa số yêu cầu cho bản ghi đã nhập trước đó
    for (const r of rows.slice(hIdx + 1)) {
      const content = t(r[C.nd]);
      if (!content) continue;
      stats.read++;
      const unit = unitOf(t(r[C.may]));
      if (!unit) { stats.junk++; continue; } // dòng phụ đề "(2)", dòng lạc
      const detectedAt = parseDate(r[C.ngay]);

      // Số yêu cầu = STT/năm phát hiện (vd "158/2024"); thiếu STT hoặc ngày → null (hiển thị "—")
      const stt = t(r[C.stt]).replace(/\.0$/, "");
      const requestNumber = stt && detectedAt ? `${stt}/${detectedAt.getUTCFullYear()}` : null;

      const key = dedupeKey(unit, detectedAt, content);
      if (seen.has(key)) {
        stats.dup++;
        const ex = byKey.get(key);
        if (ex && ex.requestNumber !== requestNumber) {
          updates.push({ id: ex.id, requestNumber });
          ex.requestNumber = requestNumber; // tránh đẩy update trùng khi khóa lặp lại
          stats.update++;
        }
        continue;
      }
      seen.add(key);

      const rawStatus = t(r[C.kq]).toLowerCase();
      let status = STATUS_MAP.get(rawStatus);
      if (!status) {
        status = [...STATUS_MAP.entries()].find(([k]) => rawStatus.startsWith(k))?.[1] ?? "CHUA_XU_LY";
        if (rawStatus && !STATUS_MAP.has(rawStatus)) stats.statusUnknown++;
      }
      byStatus[status] = (byStatus[status] ?? 0) + 1;

      const sev = t(r[C.pl]);
      const dk = t(r[C.dk]).toUpperCase();
      batch.push({
        unit,
        device: t(r[C.tb]) || null,
        system: t(r[C.cv]).replace(/^\d+\.\s*/, "") || null, // bỏ số thứ tự "12. " đầu cương vị
        severity: ["1", "2", "3", "4"].includes(sev) ? sev : null,
        condition: ["A", "B"].includes(dk) ? dk : null,
        fireSafetyImpact: t(r[C.pccc]) || null,
        environmentSafetyImpact: t(r[C.mt]) || null,
        requestType: file.requestType,
        requestNumber,
        content,
        status,
        detectedAt,
        completedAt: status === "DA_XU_LY" ? parseDate(r[C.ketThuc]) : null,
        note: t(r[C.gc]) || null,
        createdById: admin.id,
      });
    }

    if (!DRY) {
      for (let i = 0; i < batch.length; i += CHUNK) {
        await prisma.defect.createMany({ data: batch.slice(i, i + CHUNK) });
      }
      for (let i = 0; i < updates.length; i += CHUNK) {
        await prisma.$transaction(
          updates.slice(i, i + CHUNK).map((u) =>
            prisma.defect.update({ where: { id: u.id }, data: { requestNumber: u.requestNumber } })
          )
        );
      }
    }
    stats.insert = batch.length;
    totalInserted += batch.length;
    totalUpdated += updates.length;
    console.log(`📄 ${file.path.split("/").pop()} [${file.requestType}]`);
    console.log(`   đọc ${stats.read} · bỏ dòng lạc ${stats.junk} · trùng ${stats.dup} · ${DRY ? "sẽ nhập" : "đã nhập"} ${stats.insert} · ${DRY ? "sẽ sửa số YC" : "đã sửa số YC"} ${stats.update} · trạng thái lạ ${stats.statusUnknown}`);
    console.log(`   phân bố: ${JSON.stringify(byStatus)}`);
  }

  const total = await prisma.defect.count();
  console.log(`✅ ${DRY ? "DRY-RUN xong" : "Xong"}. Nhập mới ${totalInserted} · sửa số YC ${totalUpdated}.${DRY ? "" : ` Tổng Defect trong DB: ${total}`}`);
}

main()
  .catch((e) => { console.error("❌ Lỗi:", e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
