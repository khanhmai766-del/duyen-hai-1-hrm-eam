import path from "path";
import { readFileSync } from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import { uploadS3Object, s3ProxyUrl } from "@/lib/s3";
import { dxvtFileName, vietnamDatePath } from "@/lib/material-document-name";

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
  warehouse?: string | null;
  erpStock?: number | null;
}

export interface DxvtData {
  fileBaseName: string; // định danh kỹ thuật tháng + STT
  lyDo?: string | null; // lý do (proposalNote — nhập ở tạo phiếu / bước Xác nhận yêu cầu)
  soBBKT?: string | null; // số biên bản kiểm tra
  quanDocName?: string | null;
  quanDocPosition?: string | null;
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

function replaceTemplateParagraph(documentXml: string, marker: string, replacement: string) {
  const markerIndex = documentXml.indexOf(marker);
  if (markerIndex < 0) return documentXml;
  const paragraphStart = Math.max(
    documentXml.lastIndexOf("<w:p ", markerIndex),
    documentXml.lastIndexOf("<w:p>", markerIndex)
  );
  const paragraphEnd = documentXml.indexOf("</w:p>", markerIndex);
  const openingTagEnd = documentXml.indexOf(">", paragraphStart);
  if (paragraphStart < 0 || paragraphEnd < 0 || openingTagEnd < 0) return documentXml;

  const paragraph = documentXml.slice(paragraphStart, paragraphEnd + 6);
  const paragraphProperties = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
  const dynamicParagraph =
    `${documentXml.slice(paragraphStart, openingTagEnd + 1)}${paragraphProperties}` +
    "<w:r><w:rPr><w:b/><w:sz w:val=\"26\"/></w:rPr>" +
    `<w:t>${replacement}</w:t></w:r></w:p>`;
  return (
    documentXml.slice(0, paragraphStart) +
    dynamicParagraph +
    documentXml.slice(paragraphEnd + 6)
  );
}

/** Sinh file Word Phiếu ĐXVT đã điền dữ liệu, upload MinIO, trả về { key, url }. */
export async function generateDxvtDoc(d: DxvtData): Promise<{ key: string; url: string }> {
  const tplPath = path.join(process.cwd(), "templates", "dxvt-template.docx");
  const zip = new PizZip(readFileSync(tplPath));
  // Mẫu nghiệp vụ hiện hành ghi cố định chức vụ và tên Quản đốc.
  // Chuyển hai vị trí đó thành token ngay trong OOXML để giữ nguyên toàn bộ
  // bố cục/tài nguyên của mẫu gốc nhưng vẫn dùng đại diện SCCN được chọn.
  let documentXml = zip.file("word/document.xml")?.asText();
  if (documentXml) {
    if (!documentXml.includes("{{quanDocName}}")) {
      documentXml = replaceTemplateParagraph(
        documentXml,
        "<w:t>Trương</w:t>",
        "{{quanDocName}}"
      );
    }
    if (!documentXml.includes("{{quanDocPosition}}")) {
      documentXml = replaceTemplateParagraph(
        documentXml,
        "<w:t>QUẢN</w:t>",
        "{{quanDocPosition}} PXVH 1"
      );
    }
    zip.file("word/document.xml", documentXml);
  }
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
    quanDocPosition: (d.quanDocPosition || "QUẢN ĐỐC").toLocaleUpperCase("vi-VN"),
    tenThongKe: d.tenThongKe || "……………………………",
    items: d.items.map((item, index) => ({
      stt: index + 1,
      maVatTu: item.materialCode,
      tenVatTu: item.materialName,
      donVi: item.materialUnit,
      soLuong: String(item.quantity),
      khoVTTB: item.warehouse || "",
      tonKho:
        item.erpStock === null || item.erpStock === undefined
          ? ""
          : item.erpStock.toLocaleString("vi-VN", {
              maximumFractionDigits: 3,
            }),
    })),
    coChuKyQuanDoc: Boolean(d.chuKyQuanDoc),
    chuKyQuanDoc: d.chuKyQuanDoc ? d.chuKyQuanDoc.toString("base64") : "",
    coChuKyThongKe: Boolean(d.chuKyThongKe),
    chuKyThongKe: d.chuKyThongKe ? d.chuKyThongKe.toString("base64") : "",
  });

  const buf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;

  const fileName = dxvtFileName(d.items.map((item) => item.deviceName), issuedAt);
  // Cây thư mục Năm/Tháng/Ngày — xem chú thích ở lib/bbnt-doc.ts.
  const key = `public/Thay The Vat Tu/Phieu DXVT/${vietnamDatePath(issuedAt)}/${d.fileBaseName} - ${fileName}`;
  await uploadS3Object({ key, body: buf, contentType: DOCX_MIME, originalName: fileName });
  return { key, url: s3ProxyUrl(key, fileName) };
}
