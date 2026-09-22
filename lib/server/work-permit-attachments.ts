import PizZip from "pizzip";
import { fail } from "@/lib/api";
import { PERMIT_MAX_ATTACHMENT_BYTES } from "@/lib/work-permit-source-fields";

export const PERMIT_ATTACHMENT_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg", "image/png", "image/webp",
]);

export async function permitAttachmentFile(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw fail("Vui lòng chọn tệp đính kèm", 400);
  if (!PERMIT_ATTACHMENT_MIME.has(file.type)) throw fail("Chỉ chấp nhận PDF, Word DOCX, JPG, PNG hoặc WEBP", 400);
  if (file.size > PERMIT_MAX_ATTACHMENT_BYTES) throw fail("Tệp đính kèm vượt quá 15 MB", 400);
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowedExtensions: Record<string, string[]> = {
    "application/pdf": ["pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
    "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"],
  };
  if (!allowedExtensions[mime]?.includes(extension)) throw fail("Tên tệp và định dạng không khớp", 400);
  const valid = mime === "application/pdf" ? buffer.subarray(0, 5).toString() === "%PDF-"
    : mime === "image/jpeg" ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    : mime === "image/png" ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === "image/webp" ? buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP"
    : isDocx(buffer);
  if (!valid) throw fail("Nội dung tệp không đúng định dạng đã chọn", 400);
  const originalName = file.name.split(/[\\/]/).pop()?.trim().slice(0, 180) || "tai-lieu";
  return { buffer, mime, originalName, bytes: buffer.length };
}

function isDocx(buffer: Buffer) {
  try {
    const zip = new PizZip(buffer);
    return Boolean(zip.file("[Content_Types].xml") && zip.file("word/document.xml"));
  } catch { return false; }
}

export function attachmentDisposition(name: string, inline: boolean) {
  const ascii = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
