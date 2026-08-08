/**
 * Import dữ liệu QUẢN LÝ THIẾT BỊ PCCC từ file Excel gốc vào Postgres.
 *
 *   npx tsx scripts/import-pccc-excel.ts --file "<đường dẫn .xlsx>" [--json "<data.json>"] [--dry-run] [--prune]
 *   npx tsx scripts/import-pccc-excel.ts --gsheet "<URL hoặc id Google Sheet>"
 *
 * Khác biệt có chủ đích so với export_web_data.py (script cũ sinh data.js cho bản demo):
 *  - TỰ DÒ các kỳ (tháng) từ tên sheet bằng regex, KHÔNG hardcode danh sách MONTHS
 *    (hạn chế đã ghi ở mục 6 README bản demo: mỗi tháng mới phải sửa tay script).
 *  - Chấp nhận cả hai cách đặt tên sheet FCD đang tồn tại trong thực tế:
 *    "FOAM+CO2+DIESEL - T08.2026" và "FOAM+CO2+DO+FM200 - T08.2026".
 *  - Idempotent: upsert theo (kỳ, mã) — chạy lại nhiều lần không nhân bản dữ liệu.
 *  - Không xoá gì theo mặc định. --prune mới xoá các dòng của kỳ đó không còn
 *    trong file nguồn (in danh sách trước khi xoá).
 *
 * Bảng FM200 (bố cục ngang) chỉ có trong bản Excel có sheet "…DO+FM200". Nếu file
 * nguồn không có, dùng --json trỏ tới data.json của bản demo để lấy phần FM200.
 */
import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { normalizePosition } from "../lib/pccc-position";
import { normalizeChungLoai } from "../lib/pccc-status";

const prisma = new PrismaClient();

// ---------------------------------------------------------------- tham số CLI
function argValue(name: string) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const FILE = argValue("--file");
const GSHEET = argValue("--gsheet"); // id hoặc URL Google Sheet
const JSON_FALLBACK = argValue("--json");
const DRY_RUN = process.argv.includes("--dry-run");
const PRUNE = process.argv.includes("--prune");

/**
 * Tải Google Sheet về .xlsx tạm rồi đọc như file thường. Chỉ hoạt động khi Sheet
 * được chia sẻ "bất kỳ ai có đường liên kết" — endpoint export không mang theo
 * đăng nhập. Sheet nội bộ có hạn chế truy cập thì phải tải tay rồi dùng --file.
 */
async function downloadGsheet(idOrUrl: string): Promise<string> {
  const id = idOrUrl.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] ?? idOrUrl;
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được Google Sheet (${res.status}). Sheet có được chia sẻ theo link không?`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Sheet bị hạn chế trả về trang HTML đăng nhập chứ không phải file .xlsx
  if (buf.subarray(0, 2).toString() !== "PK") {
    throw new Error("Endpoint export trả về HTML (yêu cầu đăng nhập) — hãy tải file .xlsx về rồi dùng --file.");
  }
  const out = path.join(os.tmpdir(), `pccc-gsheet-${id}.xlsx`);
  writeFileSync(out, buf);
  console.log(`Đã tải Google Sheet ${id} → ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
  return out;
}

// -------------------------------------------------- chuẩn hoá Cương vị quản lý
// Chuẩn hoá về danh mục chức danh chung (lib/position-catalog.ts) NGAY LÚC NẠP:
// nhãn không hậu tố tổ máy + mã PositionCode + tổ máy tách riêng. Nhờ vậy chạy lại
// import không ghi đè lại giá trị thô lên dữ liệu đã chuẩn hoá.
// Bảng alias cũ (CUONG_VI_ALIASES) đã bỏ: 6 cách viết tắt của bảng PCCC nay nằm
// trong `aliases` của danh mục chung, một nguồn chuẩn duy nhất.
type PositionFields = { label: string | null; code: string | null; machine: string };

function positionFields(raw: unknown): PositionFields {
  const res = normalizePosition(asString(raw));
  if (res.unmatched && res.label) unmatchedPositions.add(res.label);
  return { label: res.label, code: res.code, machine: res.machine };
}

/** Gom các giá trị chưa khớp danh mục để báo ở cuối, thay vì im lặng bỏ qua. */
const unmatchedPositions = new Set<string>();

// ------------------------------------------------------------- đọc ô Excel
/** exceljs trả về object cho ô công thức / rich text / hyperlink — quy về giá trị thô. */
function raw(cell: ExcelJS.Cell | undefined): unknown {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if (v instanceof Date) return v;
    if ("result" in v) return (v as ExcelJS.CellFormulaValue).result ?? null;
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in v) return (v as ExcelJS.CellHyperlinkValue).text ?? null;
    if ("error" in v) return null;
  }
  return v;
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const s = v.trim();
    return s === "" ? null : s;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const vn = v.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (vn) return new Date(Date.UTC(+vn[3], +vn[2] - 1, +vn[1]));
  }
  return null;
}

function cellOf(ws: ExcelJS.Worksheet, row: number, col: number) {
  return raw(ws.getRow(row).getCell(col));
}

/** ngaySx + thoiGianSd (năm) → hạn thay thế. Giữ đúng cách tính của script cũ. */
function computeDenHan(ngaySx: Date | null, namSuDung: number | null): Date | null {
  if (!ngaySx || namSuDung === null) return null;
  const months = Math.round(namSuDung * 12);
  const d = new Date(ngaySx.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// ------------------------------------------------------- dò kỳ theo tên sheet
const PERIOD_RE = /T(\d{2})\.(\d{4})\s*$/;
type SheetKind = "BCC" | "TCC" | "FCD";

function classifySheet(name: string): { kind: SheetKind; label: string } | null {
  const m = name.match(PERIOD_RE);
  if (!m) return null;
  const label = `T${m[1]}.${m[2]}`;
  const upper = name.toUpperCase();
  if (upper.startsWith("BÌNH CHỮA CHÁY")) return { kind: "BCC", label };
  if (upper.startsWith("TỦ CHỮA CHÁY")) return { kind: "TCC", label };
  // "FOAM+CO2+DIESEL - …" hoặc "FOAM+CO2+DO+FM200 - …"
  if (upper.startsWith("FOAM+CO2")) return { kind: "FCD", label };
  return null;
}

function periodParts(label: string) {
  const m = label.match(/^T(\d{2})\.(\d{4})$/);
  if (!m) throw new Error(`Nhãn kỳ không hợp lệ: ${label}`);
  return { monthNo: Number(m[1]), year: Number(m[2]) };
}

// ------------------------------------------------------------------- BCC
const BCC_DATA_START = 5; // dòng 4 = header, dữ liệu từ dòng 5

type BccRow = {
  stt: number | null;
  ma: string;
  chungLoai: string | null;
  viTri: string | null;
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  nguoiGiamSat: string | null;
  nguoiGiamSatCode: string | null;
  sl: number | null;
  dvt: string | null;
  tinhTrang: string | null;
  apSuat: string | null;
  viTriHienTai: string | null;
  tinhTrangNgoai: string | null;
  nguonGoc: string | null;
  thoiGianThayGanNhat: Date | null;
  ngaySx: Date | null;
  thoiGianSd: number | null;
  denHanThayThe: Date | null;
  ngayKiemTra: Date | null;
  nguoiKiemTra: string | null;
  ghiChu: string | null;
};

function readBcc(ws: ExcelJS.Worksheet): BccRow[] {
  const rows: BccRow[] = [];
  for (let r = BCC_DATA_START; r <= ws.rowCount; r++) {
    const ma = asString(cellOf(ws, r, 2));
    if (!ma) continue;
    const ngaySx = asDate(cellOf(ws, r, 15));
    const thoiGianSd = asNumber(cellOf(ws, r, 16));
    const cv = positionFields(cellOf(ws, r, 5));
    const gs = positionFields(cellOf(ws, r, 6));
    rows.push({
      stt: asNumber(cellOf(ws, r, 1)),
      ma,
      chungLoai: normalizeChungLoai(asString(cellOf(ws, r, 3))),
      viTri: asString(cellOf(ws, r, 4)),
      cuongVi: cv.label,
      cuongViCode: cv.code,
      machine: cv.machine,
      nguoiGiamSat: gs.label,
      nguoiGiamSatCode: gs.code,
      sl: asNumber(cellOf(ws, r, 7)),
      dvt: asString(cellOf(ws, r, 8)),
      tinhTrang: asString(cellOf(ws, r, 9)),
      apSuat: asString(cellOf(ws, r, 10)),
      viTriHienTai: asString(cellOf(ws, r, 11)),
      tinhTrangNgoai: asString(cellOf(ws, r, 12)),
      nguonGoc: asString(cellOf(ws, r, 13)),
      thoiGianThayGanNhat: asDate(cellOf(ws, r, 14)),
      ngaySx,
      thoiGianSd,
      // Excel có cột 17 nhưng thường là công thức; tính lại cho chắc, chỉ dùng
      // giá trị trong file khi không tính được.
      denHanThayThe: computeDenHan(ngaySx, thoiGianSd) ?? asDate(cellOf(ws, r, 17)),
      ngayKiemTra: asDate(cellOf(ws, r, 18)),
      nguoiKiemTra: asString(cellOf(ws, r, 19)),
      ghiChu: asString(cellOf(ws, r, 20)),
    });
  }
  return rows;
}

// ------------------------------------------------------------------- TCC
const TCC_GROUP_ROW = 4;
const TCC_SUBHEAD_ROW = 5;
const TCC_DATA_START = 6;
const TCC_IDENTITY_COLS = 7;
const TCC_LAST_VISIBLE_COL = 39; // cột 40 = cột công thức trạng thái (ẩn)

type TccGroup = { label: string; statuses: string[]; cols: number[] };

/**
 * Ô con của vùng đã merge. KHÁC openpyxl: exceljs trả giá trị của ô master cho cả
 * các ô con, nên không thể dựa vào "ô rỗng" để biết nhóm còn kéo dài — phải hỏi
 * chính vùng merge. Không có hàm này thì mỗi cột thành 1 nhóm riêng.
 */
function isMergeSlave(ws: ExcelJS.Worksheet, row: number, col: number) {
  const cell = ws.getRow(row).getCell(col);
  const master = (cell as ExcelJS.Cell & { master?: ExcelJS.Cell }).master;
  return Boolean(cell.isMerged && master && master.address !== cell.address);
}

/** Dò khối linh kiện từ header 2 tầng (dòng 4 = nhóm đã merge, dòng 5 = trạng thái). */
function readTccGroups(ws: ExcelJS.Worksheet): TccGroup[] {
  const groups: TccGroup[] = [];
  let c = TCC_IDENTITY_COLS + 1;
  while (c <= TCC_LAST_VISIBLE_COL) {
    const label = asString(cellOf(ws, TCC_GROUP_ROW, c));
    if (!label) break;
    const statuses: string[] = [];
    const cols: number[] = [];
    let cc = c;
    while (cc <= TCC_LAST_VISIBLE_COL) {
      const sub = asString(cellOf(ws, TCC_SUBHEAD_ROW, cc));
      if (!sub) break;
      // Còn thuộc nhóm hiện tại khi ô nhóm ở cột này là ô CON của vùng merge;
      // gặp ô master mới nghĩa là đã sang nhóm kế tiếp.
      if (cc > c && !isMergeSlave(ws, TCC_GROUP_ROW, cc)) break;
      statuses.push(sub);
      cols.push(cc);
      cc++;
    }
    if (statuses.length === 0) break;
    groups.push({ label, statuses, cols });
    c = cc;
  }
  return groups;
}

/** Nhóm đầu = khả dụng, nhóm cuối = nặng, ở giữa = lỗi nhẹ. */
function computeTccStatus(checked: Map<number, boolean>, groups: TccGroup[]): string {
  let severe = false;
  let minor = false;
  let ok = false;
  for (const g of groups) {
    g.cols.forEach((col, i) => {
      if (!checked.get(col)) return;
      if (i === 0) ok = true;
      else if (i === g.statuses.length - 1) severe = true;
      else minor = true;
    });
  }
  if (severe) return "Bất khả dụng";
  if (minor) return "Cần theo dõi";
  if (ok) return "Khả dụng";
  return "Cần theo dõi";
}

type TccRow = {
  stt: number | null;
  ma: string;
  ten: string | null;
  viTri: string | null;
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  sl: number | null;
  dvt: string | null;
  soYcsc: string | null;
  ngayKiemTra: Date | null;
  nguoiKiemTra: string | null;
  ghiChu: string | null;
  tinhTrangTongThe: string;
  components: { groupLabel: string; status: string; checked: boolean; groupOrder: number; statusOrder: number }[];
};

function readTcc(ws: ExcelJS.Worksheet, groups: TccGroup[]): TccRow[] {
  const lastComponentCol = Math.max(...groups.flatMap((g) => g.cols));
  const trailingStart = lastComponentCol + 1;
  const rows: TccRow[] = [];
  for (let r = TCC_DATA_START; r <= ws.rowCount; r++) {
    const ma = asString(cellOf(ws, r, 2));
    if (!ma) continue;
    const cvTcc = positionFields(cellOf(ws, r, 5));
    const checked = new Map<number, boolean>();
    for (const g of groups) {
      for (const col of g.cols) checked.set(col, asString(cellOf(ws, r, col)) === "☑");
    }
    rows.push({
      stt: asNumber(cellOf(ws, r, 1)),
      ma,
      ten: asString(cellOf(ws, r, 3)),
      viTri: asString(cellOf(ws, r, 4)),
      cuongVi: cvTcc.label,
      cuongViCode: cvTcc.code,
      machine: cvTcc.machine,
      sl: asNumber(cellOf(ws, r, 6)),
      dvt: asString(cellOf(ws, r, 7)),
      soYcsc: asString(cellOf(ws, r, trailingStart)),
      ngayKiemTra: asDate(cellOf(ws, r, trailingStart + 1)),
      nguoiKiemTra: asString(cellOf(ws, r, trailingStart + 2)),
      ghiChu: asString(cellOf(ws, r, trailingStart + 3)),
      tinhTrangTongThe: computeTccStatus(checked, groups),
      components: groups.flatMap((g, gi) =>
        g.statuses.map((status, si) => ({
          groupLabel: g.label,
          status,
          checked: checked.get(g.cols[si]) === true,
          groupOrder: gi,
          statusOrder: si,
        }))
      ),
    });
  }
  return rows;
}

// ------------------------------------------------------------------- FCD
const FCD_DATA_START = 5;

type FcdRow = {
  stt: number | null;
  ten: string;
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  viTri: string | null;
  dvt: string | null;
  khoiLuongThietKe: number | null;
  khoiLuongHienTai: number | null;
  phanTramConLai: number | null;
  tinhTrang: string;
  ngayChot: Date | null;
  nguoiChot: string | null;
  ghiChu: string | null;
};

// Ngưỡng % còn lại của FOAM/CO2/DIESEL: lấy ĐÚNG công thức trong ô I5 của sheet
// nguồn (Google Sheet), không lấy theo code bản web demo:
//   =IF(H5="","Chưa cập nhật",IF(H5>=0.9,"Đủ mức",IF(H5>=0.7,"Cần theo dõi","Cần bổ sung gấp")))
// Bản demo (app.js / export_web_data.py) dùng 0.75/0.50 → SAI so với nguồn: bồn CO2
// 62% bị xếp "Cần theo dõi" trong khi sheet xếp "Cần bổ sung gấp".
const FCD_THRESHOLD_OK = 0.9;
const FCD_THRESHOLD_WATCH = 0.7;

function fcdStatus(pct: number | null): string {
  if (pct === null) return "Chưa cập nhật";
  if (pct >= FCD_THRESHOLD_OK) return "Đủ mức";
  if (pct >= FCD_THRESHOLD_WATCH) return "Cần theo dõi";
  return "Cần bổ sung gấp";
}

function readFcd(ws: ExcelJS.Worksheet, endRow: number): FcdRow[] {
  const rows: FcdRow[] = [];
  for (let r = FCD_DATA_START; r <= endRow; r++) {
    const ten = asString(cellOf(ws, r, 2));
    if (!ten) continue;
    const cvFcd = positionFields(cellOf(ws, r, 3));
    const klTk = asNumber(cellOf(ws, r, 6));
    const klHt = asNumber(cellOf(ws, r, 7));
    const pct = klTk && klHt !== null ? klHt / klTk : null;
    rows.push({
      stt: asNumber(cellOf(ws, r, 1)),
      ten,
      cuongVi: cvFcd.label,
      cuongViCode: cvFcd.code,
      machine: cvFcd.machine,
      viTri: asString(cellOf(ws, r, 4)),
      dvt: asString(cellOf(ws, r, 5)),
      khoiLuongThietKe: klTk,
      khoiLuongHienTai: klHt,
      phanTramConLai: pct,
      tinhTrang: fcdStatus(pct),
      ngayChot: asDate(cellOf(ws, r, 10)),
      nguoiChot: asString(cellOf(ws, r, 11)),
      ghiChu: asString(cellOf(ws, r, 12)),
    });
  }
  return rows;
}

// ------------------------------------------------------------------ FM200
const FM200_TITLE_PREFIX = "THEO DÕI THÔNG SỐ HỆ THỐNG FM200";

type Fm200Panel = {
  panelKey: string;
  title: string;
  binhLabels: string[];
  /** Cương vị phụ trách — không có trong file nguồn, nghiệp vụ chốt là Trực chính điện. */
  cuongVi?: string | null;
  cuongViCode?: string | null;
  machine?: string;
  mucMin: number | null;
  mucMax: number | null;
  mucDvt: string | null;
  mucValues: Record<string, number | null>;
  mucGhiChu: string | null;
  apMin: number | null;
  apMax: number | null;
  apDvt: string | null;
  apValues: Record<string, number | null>;
  apGhiChu: string | null;
};

/** Tiêu đề ở cột A; header cách tiêu đề 3 dòng: Loại đo(1) Min(2) Max(3) ĐVT(4) Bình 1..N(5..) Ghi chú. */
function findFm200Tables(ws: ExcelJS.Worksheet) {
  const tables: { title: string; headerRow: number; binhLabels: string[] }[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const v = asString(cellOf(ws, r, 1));
    if (!v || !v.startsWith(FM200_TITLE_PREFIX)) continue;
    const headerRow = r + 3;
    const binhLabels: string[] = [];
    for (let c = 5; ; c++) {
      const h = asString(cellOf(ws, headerRow, c));
      if (!h || h === "Ghi chú") break;
      binhLabels.push(h.replace(/^Bình\s*/i, ""));
    }
    tables.push({ title: v, headerRow, binhLabels });
  }
  return tables;
}

function readFm200Row(ws: ExcelJS.Worksheet, r: number, labels: string[]) {
  const values: Record<string, number | null> = {};
  labels.forEach((label, i) => {
    values[label] = asNumber(cellOf(ws, r, 5 + i));
  });
  return {
    min: asNumber(cellOf(ws, r, 2)),
    max: asNumber(cellOf(ws, r, 3)),
    dvt: asString(cellOf(ws, r, 4)),
    values,
    ghiChu: asString(cellOf(ws, r, 5 + labels.length)),
  };
}

function readFm200Panels(ws: ExcelJS.Worksheet): Fm200Panel[] {
  const tables = findFm200Tables(ws);
  return tables.map((t, i) => {
    const muc = readFm200Row(ws, t.headerRow + 1, t.binhLabels);
    const ap = readFm200Row(ws, t.headerRow + 2, t.binhLabels);
    return {
      // Bảng 1 = phòng kích từ, bảng 2 = nhà ĐKTT (theo thứ tự trong sheet gốc);
      // ưu tiên nhận diện bằng tiêu đề để không phụ thuộc thứ tự.
      panelKey: /KÍCH TỪ/i.test(t.title) ? "KICH_TU" : /ĐKTT/i.test(t.title) ? "DKTT" : i === 0 ? "KICH_TU" : "DKTT",
      title: t.title,
      binhLabels: t.binhLabels,
      mucMin: muc.min,
      mucMax: muc.max,
      mucDvt: muc.dvt,
      mucValues: muc.values,
      mucGhiChu: muc.ghiChu,
      apMin: ap.min,
      apMax: ap.max,
      apDvt: ap.dvt,
      apValues: ap.values,
      apGhiChu: ap.ghiChu,
    };
  });
}

/**
 * Cấu trúc FM200 mặc định. Bảng FM200 KHÔNG còn trong file Excel/Google Sheet hiện
 * tại (cả hai bản `Quan_ly_thiet_bi_PCCC.xlsx` trên máy cũng chỉ có 3 sheet), và
 * trong file cũ nhất từng có thì mọi ô mức/áp đều rỗng. Vì vậy mỗi kỳ được tạo sẵn
 * 2 bảng ĐÚNG CẤU TRÚC (dải đo + danh sách bình) để người dùng nhập trực tiếp trên
 * web — không phụ thuộc data.json của bản demo nữa.
 *
 * Cương vị phụ trách là TRỰC CHÍNH ĐIỆN (nghiệp vụ chốt 2026-08-08). Bảng không có
 * cương vị thì theo quy tắc phạm vi ghi (docs/pccc.md mục 4e) sẽ không ai ở mức
 * `personal` sửa/ký được — nên đây không phải trường trang trí.
 */
const FM200_DEFAULT_PANELS: Fm200Panel[] = [
  {
    panelKey: "KICH_TU",
    cuongVi: "Trực chính điện",
    cuongViCode: "ELECTRICAL_MAIN_OPERATOR",
    machine: "COMMON",
    title: "THEO DÕI THÔNG SỐ HỆ THỐNG FM200 - PHÒNG KÍCH TỪ",
    binhLabels: ["1", "2", "3", "4"],
    mucMin: 0,
    mucMax: 3,
    mucDvt: "FT(Feet)",
    mucValues: {},
    mucGhiChu: null,
    apMin: 1670,
    apMax: 2000,
    apDvt: "PSI",
    apValues: {},
    apGhiChu: null,
  },
  {
    panelKey: "DKTT",
    cuongVi: "Trực chính điện",
    cuongViCode: "ELECTRICAL_MAIN_OPERATOR",
    machine: "COMMON",
    title: "THEO DÕI THÔNG SỐ HỆ THỐNG FM200 - NHÀ ĐKTT",
    binhLabels: ["1A", "2A", "3A", "4A", "5A", "6A", "7A", "8A", "1B", "2B", "3B", "4B", "5B", "6B", "7B", "8B"],
    mucMin: 0,
    mucMax: 3,
    mucDvt: "FT(Feet)",
    mucValues: {},
    mucGhiChu: null,
    apMin: 1670,
    apMax: 2000,
    apDvt: "PSI",
    apValues: {},
    apGhiChu: null,
  },
].map((p) => ({ ...p, mucValues: emptyValues(p.binhLabels), apValues: emptyValues(p.binhLabels) }));

function emptyValues(labels: string[]): Record<string, number | null> {
  return Object.fromEntries(labels.map((l) => [l, null]));
}

/** Lấy FM200 từ data.json của bản demo khi file Excel nguồn không có bảng này. */
function fm200FromJson(file: string): Map<string, Fm200Panel[]> {
  const out = new Map<string, Fm200Panel[]>();
  const d = JSON.parse(readFileSync(file, "utf8"));
  const meta = d.fm200Meta ?? {};
  for (const [key, metaKey] of [
    ["fm200KichTu", "kichTu"],
    ["fm200Dktt", "dktt"],
  ] as const) {
    for (const [label, panel] of Object.entries<any>(d[key] ?? {})) {
      if (!panel) continue;
      const labels: string[] = meta[metaKey]?.binhLabels ?? Object.keys(panel.mucValues ?? {});
      const list = out.get(label) ?? [];
      list.push({
        panelKey: metaKey === "kichTu" ? "KICH_TU" : "DKTT",
        title: meta[metaKey]?.title ?? "",
        binhLabels: labels,
        mucMin: panel.mucRange?.min ?? null,
        mucMax: panel.mucRange?.max ?? null,
        mucDvt: panel.mucRange?.dvt ?? null,
        mucValues: panel.mucValues ?? {},
        mucGhiChu: panel.mucGhiChu ?? null,
        apMin: panel.apRange?.min ?? null,
        apMax: panel.apRange?.max ?? null,
        apDvt: panel.apRange?.dvt ?? null,
        apValues: panel.apValues ?? {},
        apGhiChu: panel.apGhiChu ?? null,
      });
      out.set(label, list);
    }
  }
  return out;
}

// ------------------------------------------------------------------- import
async function ensurePeriod(label: string) {
  const { year, monthNo } = periodParts(label);
  return prisma.pcccPeriod.upsert({
    where: { label },
    update: { year, monthNo },
    create: { label, year, monthNo },
  });
}

async function reportStale(
  table: "extinguishers" | "cabinets" | "bulks",
  periodId: string,
  keys: Set<string>,
  label: string
) {
  const existing =
    table === "extinguishers"
      ? await prisma.pcccExtinguisher.findMany({ where: { periodId }, select: { id: true, ma: true } })
      : table === "cabinets"
        ? await prisma.pcccCabinet.findMany({ where: { periodId }, select: { id: true, ma: true } })
        : (await prisma.pcccBulk.findMany({ where: { periodId }, select: { id: true, ten: true } })).map((r) => ({
            id: r.id,
            ma: r.ten,
          }));
  const stale = existing.filter((r) => !keys.has(r.ma));
  if (stale.length === 0) return;
  console.log(`  ⚠ ${label}: ${stale.length} dòng có trong DB nhưng KHÔNG còn trong file nguồn`);
  for (const s of stale.slice(0, 10)) console.log(`      - ${s.ma}`);
  if (stale.length > 10) console.log(`      … và ${stale.length - 10} dòng khác`);
  if (!PRUNE) {
    console.log("      (thêm --prune nếu muốn xoá)");
    return;
  }
  const ids = stale.map((s) => s.id);
  if (table === "extinguishers") await prisma.pcccExtinguisher.deleteMany({ where: { id: { in: ids } } });
  else if (table === "cabinets") await prisma.pcccCabinet.deleteMany({ where: { id: { in: ids } } });
  else await prisma.pcccBulk.deleteMany({ where: { id: { in: ids } } });
  console.log(`      → đã xoá ${ids.length} dòng`);
}

async function main() {
  if (!FILE && !GSHEET) throw new Error("Thiếu nguồn: dùng --file <đường dẫn .xlsx> hoặc --gsheet <id|URL>");
  const file = GSHEET ? await downloadGsheet(GSHEET) : path.resolve(FILE!);
  if (!existsSync(file)) throw new Error(`Không tìm thấy file Excel: ${file}`);
  console.log(`Nguồn: ${file}${DRY_RUN ? "   [DRY-RUN: không ghi DB]" : ""}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  // Gom sheet theo kỳ
  const byPeriod = new Map<string, Partial<Record<SheetKind, ExcelJS.Worksheet>>>();
  for (const ws of wb.worksheets) {
    const c = classifySheet(ws.name);
    if (!c) continue;
    const entry = byPeriod.get(c.label) ?? {};
    entry[c.kind] = ws;
    byPeriod.set(c.label, entry);
  }
  if (byPeriod.size === 0) throw new Error("Không dò được sheet nào theo mẫu tên '<NHÓM> - Tmm.yyyy'");

  const labels = [...byPeriod.keys()].sort((a, b) => {
    const pa = periodParts(a);
    const pb = periodParts(b);
    return pa.year - pb.year || pa.monthNo - pb.monthNo;
  });
  console.log(`Kỳ dò được: ${labels.join(", ")}`);

  const fm200Json = JSON_FALLBACK ? fm200FromJson(path.resolve(JSON_FALLBACK)) : null;
  const summary: Record<string, Record<string, number>> = {};

  for (const label of labels) {
    const sheets = byPeriod.get(label)!;
    console.log(`\n=== ${label} ===`);
    const counts: Record<string, number> = { bcc: 0, tcc: 0, components: 0, fcd: 0, fm200: 0 };

    const period = DRY_RUN ? { id: "dry-run" } : await ensurePeriod(label);

    // ---- BCC
    if (sheets.BCC) {
      const rows = readBcc(sheets.BCC);
      counts.bcc = rows.length;
      if (!DRY_RUN) {
        for (const r of rows) {
          const { ma, ...rest } = r;
          await prisma.pcccExtinguisher.upsert({
            where: { periodId_ma: { periodId: period.id, ma } },
            update: rest,
            create: { periodId: period.id, ma, ...rest },
          });
        }
        await reportStale("extinguishers", period.id, new Set(rows.map((r) => r.ma)), "BCC");
      }
      const byChungLoai = rows.reduce<Record<string, number>>((acc, r) => {
        const k = r.chungLoai ?? "(trống)";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
      const byTinhTrang = rows.reduce<Record<string, number>>((acc, r) => {
        const k = r.tinhTrang ?? "(trống)";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
      console.log(`  BCC: ${rows.length} dòng`);
      console.log(`    theo chủng loại:`, byChungLoai);
      console.log(`    theo tình trạng:`, byTinhTrang);
    }

    // ---- TCC
    if (sheets.TCC) {
      const groups = readTccGroups(sheets.TCC);
      const rows = readTcc(sheets.TCC, groups);
      counts.tcc = rows.length;
      counts.components = rows.reduce((n, r) => n + r.components.length, 0);
      if (!DRY_RUN) {
        for (const r of rows) {
          const { ma, components, ...rest } = r;
          const cabinet = await prisma.pcccCabinet.upsert({
            where: { periodId_ma: { periodId: period.id, ma } },
            update: rest,
            create: { periodId: period.id, ma, ...rest },
          });
          // Cấu trúc nhóm/trạng thái của bảng TCC ổn định trong 1 kỳ → xoá & ghi lại
          // toàn bộ ô tích của tủ đó là cách đơn giản và vẫn idempotent.
          await prisma.pcccCabinetComponent.deleteMany({ where: { cabinetId: cabinet.id } });
          await prisma.pcccCabinetComponent.createMany({
            data: components.map((c) => ({ ...c, cabinetId: cabinet.id })),
          });
        }
        await reportStale("cabinets", period.id, new Set(rows.map((r) => r.ma)), "TCC");
      }
      // Đối chiếu với bảng TCC ở sheet TỔNG QUAN: đếm số ô ☑ theo (nhóm × trạng thái)
      const tally = rows.reduce<Record<string, number>>((acc, r) => {
        for (const c of r.components) {
          if (!c.checked) continue;
          const bucket = c.statusOrder === 0 ? "BÌNH THƯỜNG" : c.statusOrder === (groups[c.groupOrder].statuses.length - 1) ? "HƯ HỎNG HOÀN TOÀN" : "HƯ HỎNG 1 PHẦN";
          acc[bucket] = (acc[bucket] ?? 0) + 1;
        }
        return acc;
      }, {});
      console.log(`  TCC: ${rows.length} tủ, ${counts.components} ô linh kiện`);
      console.log(`    nhóm linh kiện: ${groups.map((g) => `${g.label}(${g.statuses.length})`).join(", ")}`);
      console.log(`    tổng ô ☑ theo mức (đối chiếu sheet TỔNG QUAN):`, tally);
      console.log(
        `    tình trạng tổng thể:`,
        rows.reduce<Record<string, number>>((acc, r) => {
          acc[r.tinhTrangTongThe] = (acc[r.tinhTrangTongThe] ?? 0) + 1;
          return acc;
        }, {})
      );
    }

    // ---- FCD + FM200 (cùng 1 sheet)
    if (sheets.FCD) {
      const ws = sheets.FCD;
      const fmTables = findFm200Tables(ws);
      // Bảng FCD chỉ chiếm các dòng đầu sheet; chặn lại trước tiêu đề FM200 đầu tiên
      // để không đọc dòng của bảng FM200 thành thiết bị FCD "ma".
      const endRow = fmTables.length ? Math.min(...fmTables.map((t) => t.headerRow - 3)) - 1 : ws.rowCount;
      const rows = readFcd(ws, endRow);
      counts.fcd = rows.length;
      if (!DRY_RUN) {
        for (const r of rows) {
          const { ten, ...rest } = r;
          await prisma.pcccBulk.upsert({
            where: { periodId_ten: { periodId: period.id, ten } },
            update: rest,
            create: { periodId: period.id, ten, ...rest },
          });
        }
        await reportStale("bulks", period.id, new Set(rows.map((r) => r.ten)), "FCD");
      }
      console.log(`  FCD: ${rows.length} dòng — ${rows.map((r) => `${r.ten}=${r.phanTramConLai === null ? "?" : Math.round(r.phanTramConLai * 100) + "%"}`).join(", ")}`);

      let panels = readFm200Panels(ws);
      // Excel = số liệu thật → ghi đè. json/mặc định = chỉ có KHUNG (mọi ô rỗng)
      // → chỉ tạo khi chưa có, tuyệt đối không ghi đè số người dùng đã nhập trên web.
      let fmSource: "Excel" | "data.json" | "khung mặc định" = "Excel";
      if (panels.length === 0) {
        panels = fm200Json?.get(label) ?? FM200_DEFAULT_PANELS;
        fmSource = fm200Json?.has(label) ? "data.json" : "khung mặc định";
      }
      counts.fm200 = panels.length;
      if (!DRY_RUN) {
        for (const p of panels) {
          const { panelKey, ...rest } = p;
          if (fmSource === "Excel") {
            await prisma.pcccFm200Panel.upsert({
              where: { periodId_panelKey: { periodId: period.id, panelKey } },
              update: rest,
              create: { periodId: period.id, panelKey, ...rest },
            });
          } else {
            const existing = await prisma.pcccFm200Panel.findUnique({
              where: { periodId_panelKey: { periodId: period.id, panelKey } },
              select: { id: true },
            });
            if (!existing) await prisma.pcccFm200Panel.create({ data: { periodId: period.id, panelKey, ...rest } });
          }
        }
      }
      console.log(
        `  FM200 (nguồn: ${fmSource}${fmSource === "Excel" ? "" : " — chỉ tạo khung nếu chưa có, không ghi đè số đã nhập"}): ` +
          panels.map((p) => `${p.panelKey}[${p.binhLabels.length} bình]`).join(", ")
      );
    }

    summary[label] = counts;
  }

  console.log("\n===== TỔNG HỢP =====");
  console.table(summary);
  if (DRY_RUN) console.log("DRY-RUN: chưa ghi gì vào DB.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
