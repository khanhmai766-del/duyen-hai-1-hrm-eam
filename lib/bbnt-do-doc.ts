import path from "path";
import { readFileSync } from "fs";
import sharp from "sharp";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import { uploadS3Object, s3ProxyUrl, getS3ObjectBuffer } from "@/lib/s3";
import { bbntDoFileName, vietnamDatePath, vietnamDocumentDate } from "@/lib/material-document-name";
import { normalizeText } from "@/lib/nav";

/**
 * Chức danh in ở Ô CHỮ KÝ của đại diện SCCN — KHÁC dòng "Chức vụ:" trong thân biên bản.
 *
 * Quản Đốc ký bằng chính danh nghĩa mình. Chức danh khác là KÝ THAY, nên theo thể thức
 * văn bản hành chính phải ghi "KT." kèm chức danh thật ở dòng dưới.
 *
 * Mẫu .docx dùng thẻ VIẾT HOA `{{SCCNREPRESENTATIVEPOSITION}}` cho ô chữ ký, tách hẳn
 * khỏi thẻ thường `{{sccnRepresentativePosition}}` của dòng "Chức vụ:". Docxtemplater
 * phân biệt hoa thường nên hai chỗ nhận hai giá trị khác nhau mà không phải sửa mẫu.
 *
 * Xuống dòng dựa vào `linebreaks: true` đã bật lúc khởi tạo Docxtemplater.
 */
function sccnSignatureTitle(position?: string | null) {
  const value = (position ?? "").trim();
  if (!value) return "";
  if (normalizeText(value) === normalizeText("Quản Đốc")) return "QUẢN ĐỐC PX.SCCN";
  // Dòng dưới lấy theo chức danh ĐƯỢC CHỌN chứ không viết cứng "PHÓ QUẢN ĐỐC": hôm nay
  // danh sách chỉ có hai giá trị nên kết quả như nhau, nhưng nếu về sau thêm chức danh
  // thì biên bản vẫn ghi đúng người ký thay thay vì ghi sai một chức vụ không liên quan.
  return `KT. QUẢN ĐỐC PX.SCCN\n${value.toUpperCase()}`;
}

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
  materialCategory?: string | null; // loại vật tư trên phiếu, dùng chọn mẫu nội dung công tác
  heThongThietBi?: string | null; // tên hệ thống/thiết bị theo Chi tiết điểm thay thế (EquipmentNode.name)
  bbktNumber?: string | null; // số biên bản kiểm tra
  pctNumber?: string | null;
  pctContent?: string | null; // nội dung công việc trên PCT/LCT, in ngay sau số PCT
  proposalNumber?: string | null;
  deliveryNoteNumber?: string | null; // số phiếu giao hàng
  sccnRepresentativeName?: string | null; // đại diện Phân xưởng Sửa chữa Cơ nhiệt
  sccnRepresentativePosition?: string | null;
  quanDocName?: string | null; // tên Quản đốc (đại diện đơn vị chủ quản)
  quanDocPosition?: string | null; // chức vụ đại diện đơn vị chủ quản
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
  /**
   * Khóa S3 của bản đã phát hành trước đó.
   *
   * Có giá trị thì GHI ĐÈ đúng tệp đó thay vì tạo tệp mới. Mỗi lần sửa phiếu đều
   * dựng lại biên bản; không ghi đè thì mỗi lần sửa đẻ thêm một tệp, phiếu chỉ trỏ
   * vào bản mới nhất còn các bản cũ nằm lại chiếm chỗ vĩnh viễn.
   */
  existingKey?: string | null;
  chuKyQuanDoc?: Buffer | null; // ảnh chữ ký số Quản đốc
  chuKyNguoiLap?: Buffer | null; // ảnh chữ ký số người sử dụng vật tư
  /** Ba ảnh hiện trường chèn vào bảng "Hình ảnh quá trình công tác". */
  anhTruoc?: Buffer | null;
  anhSau?: Buffer | null;
  anhThongSo?: Buffer | null;
}

/** Tên tag ảnh hiện trường, theo thứ tự ba ô trong bảng của mẫu. */
const PHOTO_TAGS = ["anhTruoc", "anhSau", "anhThongSo"] as const;

/**
 * Khung chứa ảnh trong ô bảng, tính theo pixel 96dpi — dùng khi không đọc được bề
 * ngang thật của ô.
 *
 * Bảng ảnh chia ba cột trên khổ giấy A4 lề chuẩn (~15,9cm vùng chữ) nên mỗi ô rộng
 * ~5,3cm ≈ 200px. Chừa lại chút mép để ảnh không đội đường kẻ. Chiều cao rộng tay
 * hơn bề ngang: ảnh dọc chụp bằng điện thoại mà bị kẹp ở 200px thì chỉ lấp được nửa
 * ô, và người dùng lại kéo tay cho kín — kéo tay là chỗ ảnh bị méo tỉ lệ.
 */
const PHOTO_BOX = { width: 190, height: 240 };

/**
 * Bề ngang khả dụng của một ô bảng, đổi twip → pixel 96dpi.
 *
 * Ba cột của mẫu KHÔNG bằng nhau (2977 / 2835 / 3871 twip), nên lấy chung một cỡ
 * 190px là để phí gần 1,5cm bề ngang ở cột thứ ba.
 */
function cellWidthPx(cell: string): number | null {
  const match = /<w:tcW\s+w:w="(\d+)"\s+w:type="dxa"/.exec(cell);
  if (!match) return null;
  // 1 twip = 1/1440 inch → chia 15 ra pixel 96dpi. Trừ lề trong ô (mặc định 108
  // twip mỗi bên) và chút mép để ảnh không đội đường kẻ.
  const px = Math.round(Number(match[1]) / 15) - 18;
  return px > 40 ? px : null;
}

/** Thu ảnh vừa khung, GIỮ NGUYÊN TỈ LỆ — ép cứng một cỡ là ảnh dọc bị bóp méo. */
async function photoSize(buffer: Buffer, box: { width: number; height: number }): Promise<[number, number]> {
  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? box.width;
    const h = meta.height ?? box.height;
    const scale = Math.min(box.width / w, box.height / h, 1);
    return [Math.round(w * scale), Math.round(h * scale)];
  } catch {
    return [box.width, box.height];
  }
}

/**
 * Chèn tag ảnh vào ba ô TRỐNG nằm ngay trên hàng chú thích "Hình 1 / Hình 2 / Hình 3".
 *
 * Mẫu do phân xưởng tự soạn trên Word và còn sửa tiếp, nên KHÔNG bắt người soạn phải
 * gõ đúng `{{%anhTruoc}}` vào từng ô — chỉ cần giữ hàng chú thích như hiện tại là
 * chạy được. Cùng cách làm với `patchSccnRepresentativeTokens`.
 *
 * Ô nào không có ảnh thì không chèn tag, để ô trống — chèn tag rỗng sẽ làm module
 * ảnh dựng một Buffer rỗng và hỏng cả file.
 *
 * Trả kèm bề ngang từng ô: đằng nào cũng phải duyệt qua các ô ở đây, và cỡ ảnh phải
 * tính theo đúng ô chứa nó.
 */
function patchUsagePhotoCells(documentXml: string, hasPhoto: boolean[]) {
  const unchanged = { xml: documentXml, widths: [] as Array<number | null> };
  if (documentXml.includes("{{%anhTruoc}}")) return unchanged; // mẫu đã tự gắn tag
  const captionIndex = documentXml.indexOf("Hình 1");
  if (captionIndex < 0) return unchanged;

  // Dò mốc hàng bằng `<w:tr ` / `<w:tr>` chứ KHÔNG phải chuỗi "<w:tr": `<w:trPr>`
  // (thuộc tính hàng) cũng bắt đầu bằng đúng chuỗi đó, dò thô sẽ bắt nhầm nó và
  // chèn ảnh vào ngay hàng chú thích thay vì hàng trống phía trên.
  const rowStarts = [...documentXml.matchAll(/<w:tr[ >]/g)].map((m) => m.index ?? -1);
  const captionRowPos = rowStarts.findLastIndex((start) => start < captionIndex);
  if (captionRowPos <= 0) return unchanged;

  const photoRowStart = rowStarts[captionRowPos - 1];
  const photoRowEnd = documentXml.indexOf("</w:tr>", photoRowStart);
  if (photoRowEnd < 0 || photoRowEnd > rowStarts[captionRowPos]) return unchanged;

  let row = documentXml.slice(photoRowStart, photoRowEnd);
  const widths: Array<number | null> = [];
  let cellIndex = 0;
  let cursor = 0;
  let patched = "";

  while (cellIndex < PHOTO_TAGS.length) {
    const cellStart = row.indexOf("<w:tc>", cursor) >= 0 ? row.indexOf("<w:tc>", cursor) : row.indexOf("<w:tc ", cursor);
    if (cellStart < 0) break;
    const cellEnd = row.indexOf("</w:tc>", cellStart);
    if (cellEnd < 0) break;

    const cell = row.slice(cellStart, cellEnd);
    widths.push(cellWidthPx(cell));
    // Chèn run mang tag vào cuối đoạn văn đầu tiên của ô. Run phải đứng SAU <w:pPr>
    // nên nối ngay trước </w:p> là đúng thứ tự OOXML.
    const paragraphEnd = cell.indexOf("</w:p>");
    if (paragraphEnd >= 0 && hasPhoto[cellIndex]) {
      const tag = `<w:r><w:t>{{%${PHOTO_TAGS[cellIndex]}}}</w:t></w:r>`;
      patched += row.slice(cursor, cellStart) + cell.slice(0, paragraphEnd) + tag + cell.slice(paragraphEnd);
    } else {
      patched += row.slice(cursor, cellEnd);
    }
    cursor = cellEnd;
    cellIndex += 1;
  }

  if (cellIndex === 0) return unchanged;
  row = patched + row.slice(cursor);
  return {
    xml: documentXml.slice(0, photoRowStart) + row + documentXml.slice(photoRowEnd),
    widths,
  };
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

/**
 * Chữ thuần của mẫu, đã gộp các đoạn chạy.
 *
 * Word hay cắt một token thành nhiều `<w:r>` (mẫu lõi lọc đang bị vậy với
 * `{{pctNumber}}`), nên dò token bằng cách tìm chuỗi thô trong XML sẽ trượt.
 * Docxtemplater tự nối lại được, còn code của ta thì phải tự gộp trước khi dò.
 */
function templatePlainText(documentXml: string) {
  return [...documentXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
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

function bbntDoTemplateFileName(materialCategory?: string | null) {
  if (materialCategory === "Dầu bôi trơn") return "bbnt-do-template-dau.docx";
  if (materialCategory === "Lọc dầu" || materialCategory === "Lõi lọc dầu") {
    return "bbnt-do-template-loi.docx";
  }
  return "bbnt-do-template-bi.docx";
}

function patchSccnRepresentativeTokens(documentXml: string) {
  let patched = documentXml;
  const sectionMarker = "Đại diện đơn vị sửa chữa: Phân xưởng Sửa chữa cơ nhiệt:";
  const sectionIndex = patched.indexOf(sectionMarker);
  const sectionParagraphEnd = sectionIndex >= 0
    ? patched.indexOf("</w:p>", sectionIndex)
    : -1;
  const representativeParagraphStart = sectionParagraphEnd >= 0
    ? patched.indexOf("<w:p", sectionParagraphEnd + 6)
    : -1;
  const representativeParagraphEnd = representativeParagraphStart >= 0
    ? patched.indexOf("</w:p>", representativeParagraphStart)
    : -1;
  if (representativeParagraphStart >= 0 && representativeParagraphEnd >= 0) {
    const originalParagraph = patched.slice(
      representativeParagraphStart,
      representativeParagraphEnd + 6
    );
    const representativeParagraph = originalParagraph.replace(
      "Ông: ……………………………",
      "Ông: {{sccnRepresentativeName}}"
    ).replace(
      "Chức vụ: ……………………",
      "Chức vụ: {{sccnRepresentativePosition}}"
    );
    patched =
      patched.slice(0, representativeParagraphStart) +
      representativeParagraph +
      patched.slice(representativeParagraphEnd + 6);
  }
  // Ô cuối cùng có chữ "Trống" thuộc cột Phân Xưởng Sửa Chữa Cơ Nhiệt.
  // Thay đúng ô này bằng tên đại diện SCCN, giữ nguyên định dạng căn giữa/in đậm.
  const emptyNameCell = "<w:t>Trống</w:t>";
  const lastEmptyNameCell = patched.lastIndexOf(emptyNameCell);
  const representativeNameTokenCount =
    patched.split("{{sccnRepresentativeName}}").length - 1;
  if (lastEmptyNameCell >= 0 && representativeNameTokenCount < 2) {
    patched =
      patched.slice(0, lastEmptyNameCell) +
      "<w:t>{{sccnRepresentativeName}}</w:t>" +
      patched.slice(lastEmptyNameCell + emptyNameCell.length);
  }
  return patched;
}

/** Sinh file Word BBNT DO đã điền dữ liệu, upload MinIO, trả về { key, url }. */
export async function generateBbntDoDoc(d: BbntDoData): Promise<{ key: string; url: string }> {
  const tplPath = path.join(
    process.cwd(),
    "templates",
    bbntDoTemplateFileName(d.materialCategory)
  );
  const zip = new PizZip(readFileSync(tplPath));
  let documentXml = zip.file("word/document.xml")?.asText();
  if (documentXml) {
    // Mẫu dầu từng được lưu từ Word với token thiếu một dấu `}`:
    // `{{quanDocName}`. Docxtemplater coi toàn bộ phần chữ phía sau là một tag
    // chưa đóng và làm tác vụ nghiệm thu trả 500. Chuẩn hóa mẫu cũ ngay trước
    // khi biên dịch để các file đã triển khai cũng tiếp tục xuất được.
    documentXml = documentXml.replace(
      /\{\{quanDocName\}(?!\})/g,
      "{{quanDocName}}"
    );
    documentXml = patchSccnRepresentativeTokens(documentXml);
  }
  // Tương thích với mẫu đang được mở/khóa hoặc bản mẫu cũ đã deploy:
  // thay chức vụ cố định bằng token ngay trong OOXML trước khi render.
  if (documentXml && !documentXml.includes("{{quanDocPosition}}")) {
    documentXml = documentXml.replace(
      "Chức vụ: Quản đốc",
      "Chức vụ: {{quanDocPosition}}"
    );
  }
  const photos: Record<(typeof PHOTO_TAGS)[number], Buffer | null> = {
    anhTruoc: d.anhTruoc ?? null,
    anhSau: d.anhSau ?? null,
    anhThongSo: d.anhThongSo ?? null,
  };
  let photoCellWidths: Array<number | null> = [];
  if (documentXml) {
    const patched = patchUsagePhotoCells(documentXml, PHOTO_TAGS.map((tag) => Boolean(photos[tag])));
    documentXml = patched.xml;
    photoCellWidths = patched.widths;
    zip.file("word/document.xml", documentXml);
  }

  // Cỡ ảnh phải tính TRƯỚC vì getSize của module là hàm đồng bộ, không await được.
  const photoSizes = new Map<string, [number, number]>();
  for (const [index, tag] of PHOTO_TAGS.entries()) {
    const buffer = photos[tag];
    if (!buffer) continue;
    const width = photoCellWidths[index] ?? PHOTO_BOX.width;
    photoSizes.set(tag, await photoSize(buffer, { width, height: PHOTO_BOX.height }));
  }

  // Giá trị tag ảnh phải là CHUỖI base64 (Buffer là object sẽ bị module hiểu nhầm
  // thành dữ liệu đã resolve và crash) — getImage decode lại thành Buffer.
  const imageModule = new ImageModule({
    centered: true,
    getImage: (tagValue) => Buffer.from(String(tagValue), "base64"),
    // Chữ ký hiển thị ~4.2cm x 1.7cm — đủ rõ, không phá bố cục khối ký.
    // Ảnh hiện trường thì theo khung ô bảng, mỗi ảnh một cỡ theo tỉ lệ gốc.
    getSize: (_img: unknown, _tagValue: unknown, tagName: string) =>
      photoSizes.get(tagName) ?? [160, 64],
  });
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    modules: [imageModule],
  });

  const issuedAt = d.issuedAt ?? new Date();

  /**
   * Nội dung PCT in ngay sau số PCT, trên cùng một dòng của mục "Đối tượng nghiệm thu".
   *
   * Cả ba mẫu đều dùng `{{pctNumber}}` đúng MỘT lần ở dòng đó, nên ghép thẳng vào giá
   * trị là đủ — không phải vá OOXML, và không sợ Word cắt token thành nhiều đoạn.
   * Mẫu nào tự đặt sẵn `{{pctContent}}` thì tôn trọng chỗ người soạn đã chọn, và
   * KHÔNG ghép nữa để nội dung không in ra hai lần.
   */
  const pctContent = (d.pctContent ?? "").trim();
  const templateHasPctContentTag = documentXml ? templatePlainText(documentXml).includes("{{pctContent}}") : false;
  const pctNumberText = templateHasPctContentTag
    ? d.pctNumber || ""
    : [d.pctNumber || "", pctContent ? `Nội dung PCT/LCT: ${pctContent}` : ""].filter(Boolean).join(" — ");
  const pctContentText = templateHasPctContentTag && pctContent
    ? ` — Nội dung PCT/LCT: ${pctContent}`
    : pctContent;

  doc.render({
    unit: d.unit,
    heThongThietBi: d.heThongThietBi || joinUniq(d.items.map((item) => item.deviceSeq)),
    deviceNameManual: joinUniq(d.items.map((item) => item.deviceName)),
    soBBKT: d.bbktNumber || "",
    pctNumber: pctNumberText,
    pctContent: pctContentText,
    // CHỈ điền SỐ, không kèm chữ dẫn. Mẫu đã có sẵn "Phiếu đề xuất vật tư số …" và
    // "Phiếu giao hàng số …" trước ô điền, ghép thêm ở đây là in ra lặp hai lần:
    // "Phiếu đề xuất vật tư số Phiếu đề xuất vật tư số 123".
    // Không có số thì ghi "(không)" cho đồng bộ với các dòng căn cứ khác trong mục a).
    proposalNumber: d.proposalNumber || "(không)",
    deliveryNote: d.deliveryNoteNumber || "(không)",
    sccnRepresentativeName: d.sccnRepresentativeName || "",
    sccnRepresentativePosition: d.sccnRepresentativePosition || "",
    // Thẻ viết hoa của ô chữ ký — xem sccnSignatureTitle ở đầu tệp.
    SCCNREPRESENTATIVEPOSITION: sccnSignatureTitle(d.sccnRepresentativePosition),
    quanDocName: d.quanDocName || "……………………………",
    quanDocPosition: d.quanDocPosition || "Quản Đốc",
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
    anhTruoc: photos.anhTruoc ? photos.anhTruoc.toString("base64") : "",
    anhSau: photos.anhSau ? photos.anhSau.toString("base64") : "",
    anhThongSo: photos.anhThongSo ? photos.anhThongSo.toString("base64") : "",
  });

  const buf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;

  const fileName = bbntDoFileName(d.items.map((item) => item.deviceName), issuedAt);
  // Cây thư mục Năm/Tháng/Ngày — xem chú thích ở lib/bbthvt-doc.ts.
  // Đã phát hành rồi thì ghi đè đúng tệp cũ: link trên phiếu không đổi, và sửa phiếu
  // nhiều lần cũng không sinh thêm tệp. Tên tệp giữ theo bản đầu, kể cả khi tên thiết
  // bị đổi về sau — đổi tên là lại đẻ tệp mới, đúng thứ cần tránh.
  const key = d.existingKey
    || `public/Thay The Vat Tu/BBNT D-Office/${vietnamDatePath(issuedAt)}/${d.fileBaseName} - ${fileName}`;
  await uploadS3Object({ key, body: buf, contentType: DOCX_MIME, originalName: fileName });
  return { key, url: s3ProxyUrl(key, fileName) };
}
