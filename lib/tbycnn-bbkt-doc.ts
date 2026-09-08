/**
 * Dựng BIÊN BẢN KIỂM TRA ĐỊNH KỲ (BBKT) dụng cụ ATLĐ dưới dạng .docx.
 *
 * Điền `templates/bbkt-*.docx` (sinh bằng scripts/build-tbycnn-bbkt-templates.mjs) bằng
 * docxtemplater, cùng khuôn với BBNT / BBTHVT / ĐXVT của module vật tư.
 *
 * BẢNG PHỤ LỤC LUÔN DỰNG LẠI TỪ SỔ, không chép cứng: sửa số liệu trên web rồi xuất lại
 * là biên bản khớp ngay — đúng yêu cầu "bảng cập nhật đúng tình hình thực tế".
 */
import { readFileSync } from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { bbktNgayBanHanh, bbktThoiGian, type BbktForm, type BbktMember } from "@/lib/tbycnn-bbkt";
import { displayKdDate, TBYCNN_NO_POSITION_LABEL } from "@/lib/tbycnn";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Đúng bộ trường mà bảng phụ lục của cả ba biểu mẫu cần tới. */
export type BbktRow = {
  tenThietBi: string;
  maHieu: string | null;
  cuongVi: string | null;
  khuVuc: string;
  thongSoKyThuat: string | null;
  taiTrongThuKg: number | null;
  thoiGianThuPhut: number | null;
  tinhTrangSuDung: string | null;
  kiemTraBangMat: string | null;
  cachDienMOhm: number | null;
  ketQuaThu: string | null;
  nghiemThuSauSuaChua: string | null;
  ghiChu: string | null;
  chuKyThu: number | null;
  kdGanNhat: Date | null;
  kdGanNhatText: string | null;
  kdTiepTheo: Date | null;
  kdTiepTheoText: string | null;
};

export type BbktInput = {
  form: BbktForm;
  rows: BbktRow[];
  /** Ngày ký ban hành (ISO). Bỏ trống → in dấu chấm cho văn thư điền tay, đúng bản mẫu. */
  ngayBanHanh?: string | null;
  gio: string;
  /** Ngày đi kiểm tra, dd/mm/yyyy. Bỏ trống → suy từ KĐ gần nhất của chính các dòng. */
  ngayKiemTra?: string | null;
  diaDiem: string;
  thanhPhan: BbktMember[];
};

/** Ô trống trong biên bản in ra để TRỐNG, không in "—": đó là chỗ điền tay. */
const text = (value?: string | null) => (value ?? "").trim();
const num = (value?: number | null) => (value == null ? "" : String(value));

function formatVN(date: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getUTCDate())}/${p(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/**
 * Ngày đi kiểm tra mặc định = mốc **KĐ gần nhất** xuất hiện nhiều nhất trong bảng.
 *
 * Cả một đợt kiểm tra dùng chung một ngày, nhưng vài dòng có thể bỏ trống hoặc lệch, nên
 * lấy giá trị PHỔ BIẾN NHẤT thay vì dòng đầu tiên — dòng đầu trống là cả biên bản mất ngày.
 */
export function suyNgayKiemTra(rows: BbktRow[]): string {
  const tally = new Map<string, number>();
  for (const row of rows) {
    if (!row.kdGanNhat) continue;
    const key = formatVN(row.kdGanNhat);
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [value, count] of tally) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Số dòng ĐẠT — đếm bằng cột `soLuongKhaDung` thì đúng hơn so chuỗi "Đạt": kết quả trong
 * hồ sơ viết nhiều kiểu ("Không", "Không đạt – Thay bằng dây mới #1"). Nhưng ở đây chỉ có
 * `ketQuaThu`, nên so chuẩn hoá: bắt đầu bằng "đạt" mới tính là đạt.
 */
export function demSoDat(rows: BbktRow[]): number {
  return rows.filter((row) => text(row.ketQuaThu).toLowerCase().startsWith("đạt")).length;
}

export function buildBbktDocx(input: BbktInput): Buffer {
  const tplPath = path.join(process.cwd(), "templates", input.form.template);
  const zip = new PizZip(readFileSync(tplPath));
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });

  const ngayKiemTra = text(input.ngayKiemTra) || suyNgayKiemTra(input.rows);

  doc.render({
    ngayBanHanh: bbktNgayBanHanh(input.ngayBanHanh),
    thoiGian: bbktThoiGian(input.gio, ngayKiemTra),
    diaDiem: text(input.diaDiem),
    thanhPhan: input.thanhPhan
      .filter((m) => text(m.ten) || text(m.chucDanh))
      .map((m) => ({ ten: text(m.ten), chucDanh: text(m.chucDanh) })),
    tongSo: input.rows.length,
    soDat: demSoDat(input.rows),
    items: input.rows.map((row, index) => ({
      tt: index + 1,
      tenThietBi: text(row.tenThietBi),
      maHieu: text(row.maHieu),
      // Dòng hồ sơ không ghi cương vị vẫn phải có chữ đọc được, không để ô trắng lửng lơ.
      cuongVi: text(row.cuongVi) || text(row.khuVuc) || TBYCNN_NO_POSITION_LABEL,
      thongSoKyThuat: text(row.thongSoKyThuat),
      taiTrongThuKg: num(row.taiTrongThuKg),
      thoiGianThuPhut: num(row.thoiGianThuPhut),
      tinhTrangSuDung: text(row.tinhTrangSuDung),
      kiemTraBangMat: text(row.kiemTraBangMat),
      cachDienMOhm: num(row.cachDienMOhm),
      ketQuaThu: text(row.ketQuaThu),
      nghiemThuSauSuaChua: text(row.nghiemThuSauSuaChua),
      ghiChu: text(row.ghiChu),
      chuKyThu: num(row.chuKyThu),
      // Hai mốc kiểm định nhận CẢ CHỮ ("Chưa dán tem"), nên đi qua displayKdDate như
      // mọi nơi khác thay vì ép định dạng ngày.
      kdGanNhat: displayKdDate(row.kdGanNhat, row.kdGanNhatText),
      kdTiepTheo: displayKdDate(row.kdTiepTheo, row.kdTiepTheoText),
    })),
  });

  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}
