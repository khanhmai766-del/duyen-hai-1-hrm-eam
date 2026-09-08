/**
 * BBKT — BIÊN BẢN KIỂM TRA ĐỊNH KỲ dụng cụ ATLĐ (Word).
 *
 * Ba biểu mẫu riêng, bám đúng ba bản mẫu của phân xưởng:
 *   • Thang di động          — thử tải tĩnh
 *   • Dây đeo an toàn        — thử tải tĩnh + động
 *   • Dụng cụ điện cầm tay   — kiểm tra bằng mắt + đo cách điện
 *
 * Phần CHỮ CỐ ĐỊNH (căn cứ, phương pháp, kiến nghị, khối ký, ghi chú) nằm sẵn trong tệp
 * `templates/bbkt-*.docx` do `scripts/build-tbycnn-bbkt-templates.mjs` sinh ra. Tệp này
 * chỉ giữ phần THAY ĐỔI THEO TỪNG ĐỢT để giao diện điền sẵn và máy chủ dựng lại — dùng
 * chung client/server nên hai nơi không thể lệch nhau.
 *
 * Bảng phụ lục KHÔNG chép cứng: luôn dựng lại từ dữ liệu đang có trên sổ, nên sửa số
 * liệu trên web rồi xuất lại là biên bản khớp ngay.
 */

import { TBYCNN_TOOL_TABS, type TbycnnToolTab } from "@/lib/tbycnn";

/** Một dòng "Ông: … Chức danh: …" trong mục Thành phần kiểm tra. */
export type BbktMember = { ten: string; chucDanh: string };

export type BbktForm = {
  /** Trùng `key` của TBYCNN_TOOL_TABS — một bảng, một biểu mẫu. */
  key: string;
  /** Tên tệp mẫu trong thư mục templates/. */
  template: string;
  /** Nhãn hiển thị trên nút và trong thông báo. */
  label: string;
  /** Tên tệp gợi ý khi tải về (chưa kèm kỳ). */
  fileBase: string;
  /** Giá trị điền sẵn cho hộp thoại — chép từ chính bản mẫu của phân xưởng. */
  macDinh: {
    thanhPhan: BbktMember[];
    gio: string;
    diaDiem: string;
  };
};

export const BBKT_FORMS: BbktForm[] = [
  {
    key: "THANG",
    template: "bbkt-thang-di-dong.docx",
    label: "Biên bản kiểm tra thang di động",
    fileBase: "BBKT-Thang-di-dong",
    macDinh: {
      thanhPhan: [
        { ten: "Lương Thanh Phương", chucDanh: "Phó trưởng P. KTAT" },
        { ten: "Nguyễn Văn Cường", chucDanh: "PQĐ PXVH1" },
        { ten: "Nguyễn Quang Đàm", chucDanh: "KTV PXVH1" },
        { ten: "Trần Thanh Hạ", chucDanh: "Chuyên viên P. KTAT" },
      ],
      gio: "8h",
      diaDiem: "Phân xưởng Vận Hành 1 - Công ty Nhiệt điện Duyên Hải",
    },
  },
  {
    key: "DAY_DAI",
    template: "bbkt-day-dai-an-toan.docx",
    label: "Biên bản kiểm tra dây đeo an toàn",
    fileBase: "BBKT-Day-deo-an-toan",
    macDinh: {
      thanhPhan: [
        { ten: "Lương Thanh Phương", chucDanh: "Phó trưởng P. KTAT" },
        { ten: "Nguyễn Văn Cường", chucDanh: "PQĐ PXVH1" },
        { ten: "Trần Thanh Hạ", chucDanh: "Chuyên viên P. KTAT" },
        { ten: "Triệu Hồng Phát", chucDanh: "VHV Trợ thủ" },
      ],
      gio: "14h00",
      diaDiem: "Phân xưởng Sửa chữa Điện tự động - Công ty Nhiệt điện Duyên Hải",
    },
  },
  {
    key: "DUNG_CU_DIEN",
    template: "bbkt-dung-cu-dien-cam-tay.docx",
    label: "Biên bản kiểm tra dụng cụ điện cầm tay",
    fileBase: "BBKT-Dung-cu-dien-cam-tay",
    macDinh: {
      thanhPhan: [
        { ten: "Lương Thanh Phương", chucDanh: "Phó trưởng P. KTAT" },
        { ten: "Nguyễn Văn Cường", chucDanh: "PQĐ PXVH1" },
        { ten: "Nguyễn Quang Đàm", chucDanh: "KTV PXVH1" },
        { ten: "Nguyễn Hồng Quân", chucDanh: "Chuyên viên P. KTAT" },
      ],
      gio: "13h00",
      diaDiem: "Phân xưởng Sửa chữa Điện tự động - Công ty Nhiệt điện Duyên Hải",
    },
  },
];

export function bbktFormOf(key?: string | null): BbktForm | null {
  return BBKT_FORMS.find((form) => form.key === key) ?? null;
}

/** Bảng dụng cụ tương ứng của một biểu mẫu — một bảng ứng đúng một biên bản. */
export function bbktToolTabOf(form: BbktForm): TbycnnToolTab {
  const tab = TBYCNN_TOOL_TABS.find((item) => item.key === form.key);
  // Hai danh sách phải khớp khoá; lệch là lỗi lập trình chứ không phải dữ liệu xấu.
  if (!tab) throw new Error(`BBKT "${form.key}" không có bảng dụng cụ tương ứng`);
  return tab;
}

/** Số lượng tham gia kiểm tra tối đa của biểu mẫu — cả ba bản mẫu đều 4 người. */
export const BBKT_MAX_MEMBERS = 6;

/**
 * "Ngày ban hành" của biên bản. Bản mẫu để trống bằng dấu chấm cho văn thư điền tay
 * (thang: "ngày …. tháng …. năm 2026"), nên đây cũng phải dựng được chuỗi dạng đó.
 */
export function bbktNgayBanHanh(iso?: string | null): string {
  const value = String(iso ?? "").trim();
  if (!value) return "ngày …… tháng …… năm ………";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "ngày …… tháng …… năm ………";
  return `ngày ${d.getUTCDate()} tháng ${d.getUTCMonth() + 1} năm ${d.getUTCFullYear()}`;
}

/**
 * Dòng "Thời gian: Lúc {giờ} ngày {ngày}".
 *
 * Ngày mặc định lấy từ **KĐ gần nhất** của chính các dòng trong bảng — đó chính là ngày
 * đi kiểm tra. Đã đối chiếu với ba bản mẫu: 20/5/2026 (thang), 08/06/2026 (dây đai),
 * 03/07/2026 (dụng cụ điện) khớp đúng cả ba.
 */
export function bbktThoiGian(gio: string, ngayVN: string): string {
  const g = gio.trim();
  const n = ngayVN.trim() || "…/…/……";
  return `Lúc ${g || "……"}, ngày ${n}`;
}
