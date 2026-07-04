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

  doc.render({
    tieuDe: (d.noiDung || "").toUpperCase(),
    noiDung: d.noiDung || "",
    soBBKT: d.soBBKT || "(bổ sung sau)",
    soPCT: d.soPCT || "",
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

  // Ưu tiên URL công khai (VPS đặt S3_PUBLIC_URL / S3_PUBLIC_BASE_URL);
  // thiếu thì phục vụ qua proxy của app để không phụ thuộc bucket public.
  const base = (process.env.S3_PUBLIC_URL || process.env.S3_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  return { key, url: base ? `${base}/${key}` : s3ProxyUrl(key) };
}
