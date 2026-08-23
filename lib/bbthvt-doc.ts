import path from "path";
import { readFileSync } from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import sharp from "sharp";
import { uploadS3Object, s3ProxyUrl } from "@/lib/s3";
import { bbthvtFileName, vietnamDatePath } from "@/lib/material-document-name";
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

/** Một tờ liên 3 kèm theo biên bản — một lô vật tư mà phiếu đã rút hàng. */
export interface BbthvtDeliveryPhoto {
  deliveryNote: string | null; // số phiếu giao hàng của lô
  used: number; // phần phiếu này lấy từ lô đó
  unit: string; // đơn vị tính, để viết chú thích
  buffer: Buffer; // ảnh JPEG
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
  /**
   * Khoá S3 của bản đã phát hành trước đó.
   *
   * Có giá trị thì GHI ĐÈ đúng tệp đó thay vì tạo tệp mới — giống BBNT D-Office. Bổ sung ảnh
   * liên 3 cho phiếu cũ rồi xuất lại là chuyện thường xuyên, mà khoá tệp lại mang ngày xuất:
   * không ghi đè thì mỗi lần bổ sung đẻ thêm một tệp ở thư mục ngày khác, phiếu chỉ trỏ vào
   * bản mới nhất còn các bản cũ nằm lại chiếm chỗ vĩnh viễn.
   */
  existingKey?: string | null;
  /**
   * Ảnh liên 3 của TỪNG LÔ phiếu đã rút, in thành phụ lục cuối biên bản.
   *
   * Nhiều tấm là chuyện bình thường chứ không phải ngoại lệ: dùng 7 lít có thể là 5 lít của
   * phiếu giao hàng cũ cộng 2 lít của phiếu mới, và kho yêu cầu nộp kèm bản photo của CẢ HAI.
   * Lô nào chưa có ảnh thì bỏ qua tấm đó, không chặn xuất biên bản.
   */
  deliveryPhotos?: BbthvtDeliveryPhoto[];
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

/** Tên tag ảnh của tấm liên 3 thứ `index` — sinh động theo số lô phiếu đã rút. */
const photoTag = (index: number) => `lien3_${index}`;

/**
 * Khung ảnh phụ lục, pixel 96dpi: gần trọn bề ngang vùng chữ A4 (~15,9cm) và chừa chỗ cho
 * tiêu đề + chú thích trên cùng trang. Liên 3 là tờ giấy chụp lại nên phải to mới đọc được.
 */
const PHOTO_BOX = { width: 580, height: 680 };

/** Thu ảnh vừa khung, giữ nguyên tỉ lệ — liên 3 chụp dọc hay ngang đều có. */
async function photoSize(buffer: Buffer): Promise<[number, number]> {
  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? PHOTO_BOX.width;
    const h = meta.height ?? PHOTO_BOX.height;
    const scale = Math.min(PHOTO_BOX.width / w, PHOTO_BOX.height / h, 1);
    return [Math.round(w * scale), Math.round(h * scale)];
  } catch {
    return [PHOTO_BOX.width, PHOTO_BOX.height];
  }
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const centeredParagraph = (runs: string) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${runs}</w:p>`;

/**
 * Nối phụ lục ảnh vào cuối thân biên bản, ngay TRƯỚC `<w:sectPr>` cuối cùng.
 *
 * Mẫu do phòng vật tư ban hành và mình không được sửa mẫu, nên không thể yêu cầu người soạn
 * đặt sẵn tag ảnh ở đó — phụ lục phải do code dựng thêm. Chèn sau `sectPr` thì phần thêm vào
 * nằm ngoài section và Word coi tài liệu là hỏng, nên vị trí này là bắt buộc.
 */
function appendPhotoAppendix(documentXml: string, captions: string[]) {
  if (!captions.length) return documentXml;
  const sectPrStart = documentXml.lastIndexOf("<w:sectPr");
  if (sectPrStart < 0) return documentXml;

  let block = "";
  captions.forEach((caption, index) => {
    // Mỗi tấm một trang: liên 3 in gần trọn khổ giấy, nhét hai tấm một trang là không đọc được.
    block += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
    block += centeredParagraph(
      `<w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">PHỤ LỤC ${index + 1}: PHIẾU XUẤT KHO (LIÊN 3)</w:t></w:r>`
    );
    block += centeredParagraph(
      `<w:r><w:rPr><w:i/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escapeXml(caption)}</w:t></w:r>`
    );
    block += centeredParagraph(`<w:r><w:t>{{%${photoTag(index)}}}</w:t></w:r>`);
  });

  return documentXml.slice(0, sectPrStart) + block + documentXml.slice(sectPrStart);
}

/** Sinh file Word BBTHVT đã điền dữ liệu, upload MinIO, trả về { key, url }. */
export async function generateBbthvtDoc(d: BbthvtData): Promise<{ key: string; url: string }> {
  const tplPath = path.join(process.cwd(), "templates", "bbthvt-template.docx");
  const zip = new PizZip(readFileSync(tplPath));

  const photos = (d.deliveryPhotos ?? []).filter((photo) => photo.buffer?.byteLength);
  if (photos.length) {
    const documentXml = zip.file("word/document.xml")?.asText();
    if (documentXml) {
      const captions = photos.map((photo) => {
        const note = photo.deliveryNote?.trim();
        const source = note ? `Phiếu giao hàng số ${note}` : "Tồn đầu kỳ (chưa rõ số phiếu giao hàng)";
        return photo.used > 0 ? `${source} — sử dụng ${photo.used} ${photo.unit}` : source;
      });
      zip.file("word/document.xml", appendPhotoAppendix(documentXml, captions));
    }
  }

  // Cỡ ảnh phải tính TRƯỚC vì getSize của module là hàm đồng bộ, không await được.
  const photoSizes = new Map<string, [number, number]>();
  const photoValues = new Map<string, string>();
  for (const [index, photo] of photos.entries()) {
    const tag = photoTag(index);
    photoSizes.set(tag, await photoSize(photo.buffer));
    // Bản free của image-module luôn đặt tên phần ảnh trong DOCX là `.png`. Ảnh liên 3
    // trên kho lại được nén thành JPEG; nhúng thẳng sẽ tạo tệp mang đuôi PNG nhưng nội dung
    // JPEG, khiến một số bản Word không hiển thị ảnh hoặc mở tài liệu rất chậm.
    // Chuẩn hoá đúng PNG trước khi chuyển cho module để phần mở rộng, Content-Type và bytes
    // bên trong gói OOXML khớp nhau.
    const png = await sharp(photo.buffer).png({ compressionLevel: 9 }).toBuffer();
    photoValues.set(tag, png.toString("base64"));
  }

  const modules = photos.length
    ? [
        new ImageModule({
          centered: true,
          // Giá trị tag phải là CHUỖI base64; Buffer bị module hiểu nhầm là dữ liệu đã resolve.
          getImage: (tagValue: unknown) => Buffer.from(String(tagValue), "base64"),
          getSize: (_img: unknown, _tagValue: unknown, tagName: string) =>
            photoSizes.get(tagName) ?? [PHOTO_BOX.width, PHOTO_BOX.height],
        }),
      ]
    : [];

  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
    modules,
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
    ...Object.fromEntries(photos.map((_photo, index) => [photoTag(index), photoValues.get(photoTag(index)) ?? ""])),
  });

  const buf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;

  const issuedAt = d.issuedAt ?? new Date();
  const fileName = bbthvtFileName(d.items.map((item) => item.deviceName), issuedAt);
  // Cây thư mục MinIO: <loại biên bản>/<Năm>/<Tháng>/<Ngày>/<file> (theo ngày xuất,
  // giờ VN); tiền tố định danh phiếu chống trùng tên, tên tải về vẫn là fileName gọn.
  //
  // Đã phát hành rồi thì ghi đè đúng tệp cũ: link trên phiếu không đổi, và bổ sung ảnh rồi
  // xuất lại nhiều lần cũng chỉ một tệp. Tên tệp giữ theo bản đầu, kể cả khi tên thiết bị đổi
  // về sau — đổi tên là lại đẻ tệp mới, đúng thứ cần tránh.
  const key = d.existingKey
    || `public/Thay The Vat Tu/BBTHVT/${vietnamDatePath(issuedAt)}/${d.fileBaseName} - ${fileName}`;
  await uploadS3Object({ key, body: buf, contentType: DOCX_MIME, originalName: fileName });
  return { key, url: s3ProxyUrl(key, fileName) };
}
