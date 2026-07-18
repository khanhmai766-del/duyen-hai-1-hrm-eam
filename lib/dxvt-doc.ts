import path from "path";
import { readFileSync } from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import { uploadS3Object, s3ProxyUrl } from "@/lib/s3";
import { dxvtFileName } from "@/lib/material-document-name";

/* ============================================================
   lib/dxvt-doc.ts
   Điền dữ liệu phiếu vào templates/dxvt-template.docx (QLVT.12 —
   Giấy đề nghị xuất vật tư thiết bị SCTX), chèn chữ ký số Quản đốc
   + Thống kê (người đề nghị), upload MinIO và trả URL tải file Word.
   ============================================================ */

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface DxvtItem {
  deviceName: string; // dùng đặt tên file
  materialCode: string;
  materialName: string;
  materialUnit: string;
  quantity: number;
}

export interface DxvtData {
  fileBaseName: string; // định danh kỹ thuật tháng + STT
  lyDo?: string | null; // lý do (proposalNote — nhập ở tạo phiếu / bước Xác nhận yêu cầu)
  soBBKT?: string | null; // số biên bản kiểm tra
  quanDocName?: string | null;
  tenThongKe?: string | null; // người đề nghị (Thống kê đang thao tác)
  issuedAt?: Date; // mốc điền "Tháng" + tên file; mặc định: thời điểm xuất
  items: DxvtItem[];
  chuKyQuanDoc?: Buffer | null;
  chuKyThongKe?: Buffer | null;
}

function vnMonth(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh", month: "2-digit", year: "numeric",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}/${get("year")}`;
}

/** Sinh file Word Phiếu ĐXVT đã điền dữ liệu, upload MinIO, trả về { key, url }. */
export async function generateDxvtDoc(d: DxvtData): Promise<{ key: string; url: string }> {
  const tplPath = path.join(process.cwd(), "templates", "dxvt-template.docx");
  const zip = new PizZip(readFileSync(tplPath));
  // Giá trị tag ảnh là CHUỖI base64 (Buffer sẽ bị module hiểu nhầm) — getImage decode lại.
  const imageModule = new ImageModule({
    centered: true,
    getImage: (tagValue) => Buffer.from(String(tagValue), "base64"),
    getSize: () => [160, 64],
  });
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
    modules: [imageModule],
  });

  const issuedAt = d.issuedAt ?? new Date();
  doc.render({
    thang: vnMonth(issuedAt),
    Lydo: d.lyDo || "", // token do phân xưởng đặt trong file Word — giữ nguyên tên
    soBBKT: d.soBBKT || "……",
    quanDocName: d.quanDocName || "……………………………",
    tenThongKe: d.tenThongKe || "……………………………",
    items: d.items.map((item, index) => ({
      stt: index + 1,
      maVatTu: item.materialCode,
      tenVatTu: item.materialName,
      donVi: item.materialUnit,
      soLuong: String(item.quantity),
    })),
    coChuKyQuanDoc: Boolean(d.chuKyQuanDoc),
    chuKyQuanDoc: d.chuKyQuanDoc ? d.chuKyQuanDoc.toString("base64") : "",
    coChuKyThongKe: Boolean(d.chuKyThongKe),
    chuKyThongKe: d.chuKyThongKe ? d.chuKyThongKe.toString("base64") : "",
  });

  const buf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;

  const fileName = dxvtFileName(d.items.map((item) => item.deviceName), issuedAt);
  // Gom theo loại biên bản trong public/Thay The Vat Tu/ — xem chú thích ở lib/bbnt-doc.ts.
  const key = `public/Thay The Vat Tu/Phieu DXVT/${d.fileBaseName} - ${fileName}`;
  await uploadS3Object({ key, body: buf, contentType: DOCX_MIME, originalName: fileName });
  return { key, url: s3ProxyUrl(key, fileName) };
}
