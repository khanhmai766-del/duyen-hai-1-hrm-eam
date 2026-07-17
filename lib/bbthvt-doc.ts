import path from "path";
import { readFileSync } from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { uploadS3Object, s3ProxyUrl } from "@/lib/s3";
import { bbthvtFileName } from "@/lib/material-document-name";
import { normalizeText } from "@/lib/nav";

/* ============================================================
   lib/bbthvt-doc.ts
   Điền dữ liệu phiếu vào templates/bbthvt-template.docx (QLVT.06 —
   Biên bản giao nhận vật tư thiết bị thu hồi sau sửa chữa),
   upload MinIO và trả URL tải file Word.
   Tên file: "BBTHVT <tên thiết bị>_ddmmyy" — ddmmyy theo ngày bổ sung
   của BBNT ký tay (thời điểm xuất bộ biên bản).
   ============================================================ */

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface BbthvtItem {
  deviceName: string; // dùng đặt tên file
  materialCode: string;
  materialName: string;
  materialUnit: string;
}

export interface BbthvtData {
  fileBaseName: string; // định danh kỹ thuật tháng + STT, dùng làm thư mục lưu file
  soVB?: string | null; // số văn bản BBTHVT — cấp tăng dần, reset theo năm
  recoveryQuantity?: number | null; // số lượng vật tư thu hồi
  deliveryNoteNumber?: string | null; // số phiếu giao hàng
  pctNumber?: string | null; // in vào cột Ghi chú theo mẫu
  materialCategory?: string | null; // loại vật tư — suy ra Mác vật liệu / Phân loại
  issuedAt?: Date; // ngày bổ sung (trùng BBNT ký tay); mặc định: thời điểm xuất
  items: BbthvtItem[];
}

/** Mác vật liệu / Phân loại theo loại vật tư. Chưa nhận diện được thì để trống điền tay. */
function wasteLabels(category?: string | null) {
  const normalized = normalizeText(category ?? "");
  // "Lọc dầu" (loại trên phiếu) và "Lõi lọc dầu" (danh mục) đều khớp "loc dau" — xét trước
  // để không rơi nhầm vào nhánh dầu bôi trơn.
  if (normalized.includes("loc dau")) return { macVatTu: "Lõi lọc (Sắt)", phanLoai: "CTNH" };
  if (normalized.includes("dau boi tron")) return { macVatTu: "Dầu thải", phanLoai: "CTNH" };
  return { macVatTu: "", phanLoai: "" };
}

/** Sinh file Word BBTHVT đã điền dữ liệu, upload MinIO, trả về { key, url }. */
export async function generateBbthvtDoc(d: BbthvtData): Promise<{ key: string; url: string }> {
  const tplPath = path.join(process.cwd(), "templates", "bbthvt-template.docx");
  const zip = new PizZip(readFileSync(tplPath));
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });

  const { macVatTu, phanLoai } = wasteLabels(d.materialCategory);
  doc.render({
    // Giá trị mức phiếu — các dòng trong bảng tra lên scope cha khi thiếu khóa riêng
    soVB: d.soVB || "……",
    deliveryNote: d.deliveryNoteNumber || "",
    macVatTu,
    phanLoai,
    ghiChu: d.pctNumber ? `PCT/LCT số ${d.pctNumber}` : "",
    items: d.items.map((item, index) => ({
      stt: index + 1,
      maVatTu: item.materialCode,
      tenVatTu: item.materialName,
      donVi: item.materialUnit,
      soLuongThuHoi: d.recoveryQuantity === null || d.recoveryQuantity === undefined ? "" : String(d.recoveryQuantity),
    })),
  });

  const buf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;

  const issuedAt = d.issuedAt ?? new Date();
  const fileName = bbthvtFileName(d.items.map((item) => item.deviceName), issuedAt);
  // Gom theo loại biên bản trong public/Thay The Vat Tu/ — xem chú thích ở lib/bbnt-doc.ts.
  const key = `public/Thay The Vat Tu/BBTHVT/${d.fileBaseName} - ${fileName}`;
  await uploadS3Object({ key, body: buf, contentType: DOCX_MIME, originalName: fileName });
  return { key, url: s3ProxyUrl(key, fileName) };
}
