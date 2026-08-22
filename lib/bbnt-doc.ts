import path from "path";
import { readFileSync } from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { uploadS3Object, s3ProxyUrl } from "@/lib/s3";
import { usesHandwrittenBbnt } from "@/lib/constants";
import { bbntHandwrittenFileName, vietnamDatePath, vietnamDocumentDate } from "@/lib/material-document-name";

/* ============================================================
   lib/bbnt-doc.ts
   Điền dữ liệu phiếu vào mẫu templates/bbnt-template.docx (15 token),
   upload MinIO (public/Thay The Vat Tu/BBNT ky tay/) và trả về URL tải file Word.
   Cần: npm install docxtemplater pizzip
   ============================================================ */

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface BbntItem {
  materialName: string;
  materialCode: string;
  materialUnit: string;
  quantity: number;
  deviceName: string;
  deviceKks?: string | null;
}

export interface BbntData {
  fileBaseName: string;     // định danh kỹ thuật tháng + STT, chỉ dùng đặt tên file
  lyDo?: string | null;     // lý do (proposalNote) — token {{Lydo}} trong mẫu
  soBBKT?: string | null;   // Ứng: có thể chưa có -> in "(bổ sung sau)"
  soPCT?: string | null;
  thoiGianBatDau?: Date | string | null;
  thoiGianKetThuc?: Date | string | null;
  noiDung: string;          // thông tin thay thế xong
  tenChiHuy: string;        // chỉ huy trực tiếp (SCCN)
  tenTruongCa: string;      // tên thật tài khoản Trưởng Ca/TK xác nhận xuất
  tenVHV?: string | null;   // người đề xuất / nhập liệu
  chucVuVHV?: string | null;
  unit?: string | null;       // tổ máy S1 | S2 | COMMON
  usedByName?: string | null; // người sử dụng vật tư (mẫu mới); thiếu thì rơi về tenVHV
  usedByPosition?: string | null;
  materialCategory?: string | null; // loại vật tư trên phiếu — chọn mẫu biên bản
  soGiaoHang?: string | null; // số phiếu giao hàng của các lô đã dùng — token {{soGiaoHang}}
  items: BbntItem[];
}

/**
 * Mỗi loại vật tư một mẫu BBNT ký tay riêng vì phần RUỘT khác hẳn nhau: bi nghiền than ghi
 * dòng điện trước/sau và số thùng bi theo từng máy nghiền A–F, kèm khung dán ảnh; các loại còn
 * lại dùng mẫu chung (mã hạng mục, nội dung thực hiện, phụ lục danh mục vật tư).
 *
 * Cùng bộ token nên không phải điền khác đi — chỉ đổi tệp mẫu. Nhãn loại trên PHIẾU là
 * "Bi nghiền", nhãn trong Danh mục vật tư là "Bi Nghiền Than" — nhận cả hai.
 */
function joinUniq(arr: Array<string | null | undefined>) {
  return [...new Set(arr.filter(Boolean) as string[])].join(", ");
}

/** Sinh file Word BBNT, upload MinIO, trả về { key, url } */
export async function generateBbntDoc(d: BbntData): Promise<{ key: string; url: string }> {
  if (!usesHandwrittenBbnt(d.materialCategory)) {
    throw new Error("BBNT ký tay chỉ còn áp dụng cho luồng bi nghiền");
  }
  const tplPath = path.join(process.cwd(), "templates", "bbnt-template-bi.docx");
  const zip = new PizZip(readFileSync(tplPath));
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    // Token có trong mẫu nhưng thiếu dữ liệu → in chuỗi rỗng, không in "undefined"
    nullGetter: () => "",
  });

  const today = new Date();
  const ngayXuat = vietnamDocumentDate(today);
  const formatDateTime = (value?: Date | string | null) => value
    ? new Date(value).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })
    : "";

  doc.render({
    tieuDe: (d.noiDung || "").toUpperCase(),
    noiDung: d.noiDung || "",
    soBBKT: d.soBBKT || "(bổ sung sau)",
    soPCT: d.soPCT || "",
    thoiGianBatDau: formatDateTime(d.thoiGianBatDau),
    thoiGianKetThuc: formatDateTime(d.thoiGianKetThuc),
    ngayXuat,
    tenThietBi: joinUniq(d.items.map((i) => i.deviceName)),
    maKKS: joinUniq(d.items.map((i) => i.deviceKks)),
    tenVatTu: joinUniq(d.items.map((i) => i.materialName)),
    maVatTu: joinUniq(d.items.map((i) => i.materialCode)),
    soLuong: d.items.map((i) => `${i.quantity} ${i.materialUnit}`).join(", "),
    tenVHV: d.tenVHV || "",
    chucVuVHV: d.chucVuVHV || "",
    tenChiHuy: d.tenChiHuy || "",
    tenTruongCa: d.tenTruongCa || "",
    // Bộ token của mẫu mới (bbnt-template.docx bản chỉnh tay) — điền song song với tên cũ
    Lydo: d.lyDo || "",
    unit: d.unit || "",
    pctNumber: d.soPCT || "",
    deviceNameManual: joinUniq(d.items.map((i) => i.deviceName)),
    usedByName: d.usedByName || d.tenVHV || "",
    usedByPosition: d.usedByPosition || d.chucVuVHV || "",
    // Mẫu hiện chưa có ô này; điền sẵn để khi thêm {{soGiaoHang}} vào Word là chạy, không phải sửa mã.
    soGiaoHang: d.soGiaoHang || "",
  });

  const buf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;

  const fileName = bbntHandwrittenFileName(d.items.map((item) => item.deviceName), today);
  // Cây thư mục MinIO: <loại biên bản>/<Năm>/<Tháng>/<Ngày>/<file> (theo ngày xuất, giờ VN);
  // tiền tố định danh phiếu chống trùng tên, tên tải về vẫn là fileName gọn (originalName).
  const key = `public/Thay The Vat Tu/BBNT ky tay/${vietnamDatePath(today)}/${d.fileBaseName} - ${fileName}`;
  await uploadS3Object({
    key,
    body: buf,
    contentType: DOCX_MIME,
    originalName: fileName,
  });

  // Link tải qua proxy của app (/api/files/s3): chỉ người đã đăng nhập tải được,
  // không phụ thuộc bucket policy công khai trên MinIO.
  return { key, url: s3ProxyUrl(key, fileName) };
}
