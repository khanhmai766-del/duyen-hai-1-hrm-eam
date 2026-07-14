import path from "path";
import { readFileSync } from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { uploadS3Object, s3ProxyUrl } from "@/lib/s3";

/* ============================================================
   lib/bbnt-doc.ts
   Điền dữ liệu phiếu vào mẫu templates/bbnt-template.docx (15 token),
   upload MinIO (public/tickets/) và trả về URL tải file Word.
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
  code: string;             // số phiếu VT-2026-xxxx (dùng đặt tên file)
  soBBKT?: string | null;   // Ứng: có thể chưa có -> in "(bổ sung sau)"
  soPCT?: string | null;
  thoiGianBatDau?: Date | string | null;
  thoiGianKetThuc?: Date | string | null;
  noiDung: string;          // thông tin thay thế xong
  tenChiHuy: string;        // chỉ huy trực tiếp (SCCN)
  tenTruongCa: string;      // tên thật tài khoản Trưởng Ca/TK xác nhận xuất
  tenVHV?: string | null;   // người đề xuất / nhập liệu
  chucVuVHV?: string | null;
  items: BbntItem[];
}

function joinUniq(arr: Array<string | null | undefined>) {
  return [...new Set(arr.filter(Boolean) as string[])].join(", ");
}

/** Sinh file Word BBNT, upload MinIO, trả về { key, url } */
export async function generateBbntDoc(d: BbntData): Promise<{ key: string; url: string }> {
  const tplPath = path.join(process.cwd(), "templates", "bbnt-template.docx");
  const zip = new PizZip(readFileSync(tplPath));
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
  });

  const today = new Date();
  const ngayXuat = today.toLocaleDateString("vi-VN"); // dd/mm/yyyy
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
  });

  const buf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;

  const key = `public/tickets/${d.code}-BBNT.docx`;
  await uploadS3Object({
    key,
    body: buf,
    contentType: DOCX_MIME,
    originalName: `${d.code}-BBNT.docx`,
  });

  // Link tải qua proxy của app (/api/files/s3): chỉ người đã đăng nhập tải được,
  // không phụ thuộc bucket policy công khai trên MinIO.
  return { key, url: s3ProxyUrl(key) };
}
