import path from "path";
import { readFileSync } from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import { uploadS3Object, s3ProxyUrl, getS3ObjectBuffer } from "@/lib/s3";
import { bbntDoFileName, vietnamDocumentDate } from "@/lib/material-document-name";

/* ============================================================
   lib/bbnt-do-doc.ts
   Điền dữ liệu phiếu vào templates/bbnt-do-template.docx (BBNT DO —
   Biên bản nghiệm thu lắp đặt, chạy thử và hoàn thành đưa vào sử dụng),
   chèn ảnh chữ ký số (Quản đốc + Người lập), upload MinIO và trả URL.
   Tên file: "BBNT DO <tên thiết bị>_ddmmyy" — ddmmyy theo ngày bổ sung
   của BBNT ký tay (thời điểm xuất bộ biên bản).
   ============================================================ */

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface BbntDoItem {
  deviceSeq?: string | null;
  deviceName: string;
  materialCode: string;
  materialName: string;
  materialUnit: string;
}

export interface BbntDoData {
  fileBaseName: string; // định danh kỹ thuật tháng + STT, dùng làm thư mục lưu file
  unit: string; // tổ máy S1 | S2 | COMMON
  heThongThietBi?: string | null; // tên hệ thống/thiết bị theo Chi tiết điểm thay thế (EquipmentNode.name)
  pctNumber?: string | null;
  proposalNumber?: string | null;
  deliveryNoteNumber?: string | null; // số phiếu giao hàng
  quanDocName?: string | null; // tên Quản đốc (đại diện đơn vị chủ quản)
  usedByName?: string | null; // người sử dụng vật tư = Người lập
  usedByPosition?: string | null;
  workStartedAt?: Date | string | null;
  workEndedAt?: Date | string | null;
  receivedQuantity?: number | null; // khối lượng lĩnh
  usedQuantity?: number | null; // khối lượng sử dụng
  recoveryQuantity?: number | null; // khối lượng thu hồi
  recoveryReturned?: boolean; // đã hoàn trả vật tư thu hồi
  issuedAt?: Date; // ngày bổ sung (trùng BBNT ký tay); mặc định: thời điểm xuất
  items: BbntDoItem[];
  chuKyQuanDoc?: Buffer | null; // ảnh chữ ký số Quản đốc
  chuKyNguoiLap?: Buffer | null; // ảnh chữ ký số người sử dụng vật tư
}

/** Tải ảnh chữ ký số của một user: ưu tiên key MinIO, rơi về data URL base64. */
export async function resolveSignatureBuffer(
  user: { signatureKey?: string | null; signatureUrl?: string | null } | null | undefined
): Promise<Buffer | null> {
  if (!user) return null;
  try {
    if (user.signatureKey) return await getS3ObjectBuffer(user.signatureKey);
    const url = user.signatureUrl;
    if (url?.startsWith("data:image/")) {
      return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    }
  } catch {
    // chữ ký hỏng/thiếu → bỏ trống chỗ ký, không chặn xuất biên bản
  }
  return null;
}

function joinUniq(arr: Array<string | null | undefined>) {
  return [...new Set(arr.filter(Boolean) as string[])].join(", ");
}

/** "18 giờ 18 phút ngày 15 tháng 07 năm 2026" — định dạng chữ theo mẫu biên bản. */
function vnDateTime(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("hour")} giờ ${get("minute")} phút ngày ${get("day")} tháng ${get("month")} năm ${get("year")}`;
}

function vnDate(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

const qty = (value?: number | null) => (value === null || value === undefined ? "" : String(value));

/** Sinh file Word BBNT DO đã điền dữ liệu, upload MinIO, trả về { key, url }. */
export async function generateBbntDoDoc(d: BbntDoData): Promise<{ key: string; url: string }> {
  const tplPath = path.join(process.cwd(), "templates", "bbnt-do-template.docx");
  const zip = new PizZip(readFileSync(tplPath));
  // Giá trị tag ảnh phải là CHUỖI base64 (Buffer là object sẽ bị module hiểu nhầm
  // thành dữ liệu đã resolve và crash) — getImage decode lại thành Buffer.
  const imageModule = new ImageModule({
    centered: true,
    getImage: (tagValue) => Buffer.from(String(tagValue), "base64"),
    // Chữ ký hiển thị ~4.2cm x 1.7cm — đủ rõ, không phá bố cục khối ký
    getSize: () => [160, 64],
  });
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    modules: [imageModule],
  });

  const issuedAt = d.issuedAt ?? new Date();
  doc.render({
    unit: d.unit,
    heThongThietBi: d.heThongThietBi || joinUniq(d.items.map((item) => item.deviceSeq)),
    deviceNameManual: joinUniq(d.items.map((item) => item.deviceName)),
    pctNumber: d.pctNumber || "",
    proposalNumber: d.proposalNumber ? `Phiếu đề xuất vật tư số ${d.proposalNumber}` : "Phiếu đề xuất vật tư: (không)",
    deliveryNote: d.deliveryNoteNumber ? `Phiếu giao hàng số ${d.deliveryNoteNumber}` : "",
    quanDocName: d.quanDocName || "……………………………",
    usedByName: d.usedByName || "……………………………",
    usedByPosition: d.usedByPosition || "……………………",
    workStartedAt: vnDateTime(d.workStartedAt),
    workEndedAt: vnDateTime(d.workEndedAt),
    workStartedDate: vnDate(d.workStartedAt),
    workEndedDate: vnDate(d.workEndedAt),
    materialSummary: joinUniq(d.items.map((item) => `${item.materialName}.${item.materialCode}`)),
    ngayXuat: vietnamDocumentDate(issuedAt),
    items: d.items.map((item, index) => ({
      stt: index + 1,
      heThong: d.usedByPosition || "",
      thietBi: item.deviceName,
      maVatTu: item.materialCode,
      tenVatTu: item.materialName,
      thongSoKyThuat: item.materialName,
      xuatXu: "",
      donVi: item.materialUnit,
      khoiLuongLinh: qty(d.receivedQuantity),
      khoiLuongSuDung: qty(d.usedQuantity),
      khoiLuongThuHoi: qty(d.recoveryQuantity),
      khoiLuongHoanTra: d.recoveryReturned ? qty(d.recoveryQuantity) : "",
    })),
    coChuKyQuanDoc: Boolean(d.chuKyQuanDoc),
    chuKyQuanDoc: d.chuKyQuanDoc ? d.chuKyQuanDoc.toString("base64") : "",
    coChuKyNguoiLap: Boolean(d.chuKyNguoiLap),
    chuKyNguoiLap: d.chuKyNguoiLap ? d.chuKyNguoiLap.toString("base64") : "",
  });

  const buf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;

  const fileName = bbntDoFileName(d.items.map((item) => item.deviceName), issuedAt);
  const key = `public/tickets/${d.fileBaseName}/${fileName}`;
  await uploadS3Object({ key, body: buf, contentType: DOCX_MIME, originalName: fileName });
  return { key, url: s3ProxyUrl(key, fileName) };
}
