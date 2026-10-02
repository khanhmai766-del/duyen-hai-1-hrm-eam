import sharp from "sharp";
import { BarcodeFormat, EncodeHintType, QRCodeWriter } from "@zxing/library";
import { workPermitQrValue } from "@/lib/work-permit-qr";
import { formatPermitNumber } from "@/lib/work-permits";

/** QR dùng chung cho phiếu Word và ảnh tải riêng; kích thước in mặc định 25 mm. */
export async function workPermitQrAssets(row: { id: string }, qrOrigin?: string) {
  const value = workPermitQrValue(row.id, qrOrigin);
  const hints = new Map<EncodeHintType, unknown>();
  hints.set(EncodeHintType.MARGIN, 4);
  const matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 0, 0, hints);
  let pathData = "";
  for (let y = 0; y < matrix.getHeight(); y++) {
    for (let x = 0; x < matrix.getWidth(); x++) if (matrix.get(x, y)) pathData += `M${x} ${y}h1v1h-1z`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="25mm" height="25mm" viewBox="0 0 ${matrix.getWidth()} ${matrix.getHeight()}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${pathData}" fill="#000"/></svg>`;
  // Mỗi ô QR đúng 32 pixel: cạnh ô không có pixel xám do nội suy/co giãn.
  const size = matrix.getWidth() * 32;
  const rasterSvg = svg.replace('width="25mm" height="25mm"', `width="${size}" height="${size}"`);
  return { svg, png: await sharp(Buffer.from(rasterSvg)).withMetadata({ density: Math.round(size * 25.4 / 25) }).png().toBuffer() };
}

type QrLabelPermit = { id: string; number: string; year: number; content: string };

/** Pango tự xuống dòng nội dung dài, không cắt chữ hoặc diễn giải nội dung thành markup. */
export function workPermitQrLabelText(row: QrLabelPermit) {
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character]!));
  return `<span foreground="#000000"><b>PCT ${escape(formatPermitNumber(row))}</b>\nNội dung: ${escape(row.content)}</span>`;
}

/** Nhãn tải riêng rộng 60 mm: mã vẫn 25 mm, số PCT và toàn bộ nội dung nằm bên dưới. */
export async function workPermitQrLabelPng(row: QrLabelPermit, qrOrigin?: string) {
  const { png } = await workPermitQrAssets(row, qrOrigin);
  const qr = await sharp(png).metadata();
  const density = qr.density!;
  const mm = (value: number) => Math.round(value * density / 25.4);
  const width = mm(60), margin = mm(2);
  const caption = await sharp({ text: {
    text: workPermitQrLabelText(row), font: "sans 8", dpi: density,
    width: width - margin * 2, align: "centre", wrap: "word-char", rgba: true,
  } }).png().toBuffer({ resolveWithObject: true });
  const captionTop = margin + qr.height! + mm(2);
  return sharp({ create: { width, height: captionTop + caption.info.height + margin, channels: 3, background: "#ffffff" } })
    .composite([
      { input: png, top: margin, left: Math.round((width - qr.width!) / 2) },
      { input: caption.data, top: captionTop, left: Math.round((width - caption.info.width) / 2) },
    ]).withMetadata({ density }).png().toBuffer();
}
