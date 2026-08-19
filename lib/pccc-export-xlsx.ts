/**
 * Xuất Excel module PCCC — chạy PHÍA SERVER bằng exceljs.
 *
 * Khác bản web demo: demo tạo file trong trình duyệt và nạp exceljs qua CDN nên bắt
 * buộc phải có internet (hạn chế ở mục 5 README demo). Ở đây workbook được dựng trên
 * server, máy người dùng không cần internet ngoài chính trang web.
 *
 * THỨ TỰ CỘT giữ đúng bản gốc trong Excel/Google Sheet, không theo thứ tự hiển thị
 * trên web — hai thứ tự này khác nhau và không được lẫn.
 */
import ExcelJS from "exceljs";
import { cabinetComponentsForTcc, hoseReelLabelDisplay } from "@/lib/pccc-status";

const ARGB = (hex: string) => "FF" + hex;

/** Màu tô theo nhãn tình trạng — khớp bảng chú giải của sheet gốc. */
const STATUS_FILL: Record<string, string> = {
  // Hai mức theo TB 5100 (bình, tủ, nút nhấn, cuộn vòi). Ba nhãn cũ vẫn giữ trong
  // bảng màu để file lưu trữ của kỳ cũ mở ra không mất nền màu.
  "Đạt": "C6EFCE",
  "Không đạt": "FFC7CE",
  "Khả dụng": "C6EFCE",
  "Đủ mức": "C6EFCE",
  "Cần theo dõi": "FFEB9C",
  "Bất khả dụng": "FFC7CE",
  "Cần bổ sung gấp": "FFC7CE",
  "Chưa cập nhật": "EDEDED",
};

const thin = { style: "thin" as const, color: { argb: ARGB("BFBFBF") } };
const BORDER = { top: thin, left: thin, right: thin, bottom: thin };
const HEADER_FILL = "1E3A5F";

export type ExportSheet = "BCC" | "TCC" | "FCD" | "NNBC" | "VAN" | "DEN" | "CVCC";

/** Một ô tích trong sheet hai tầng. */
export type ComponentCell = { groupLabel: string; status: string; checked: boolean; groupOrder: number; statusOrder: number };

export type ExportInput = {
  periodLabel: string;
  extinguishers: Record<string, unknown>[];
  cabinets: (Record<string, unknown> & {
    components: ComponentCell[];
  })[];
  bulks: Record<string, unknown>[];
  // --- Bốn nhóm bổ sung đợt 2. Để TUỲ CHỌN để mọi nơi gọi cũ (bản lưu trữ hằng tháng,
  // script đối chiếu) không phải sửa cùng lúc; thiếu thì sheet đó không được sinh ra.
  alarmButtons?: (Record<string, unknown> & { components: ComponentCell[] })[];
  valves?: Record<string, unknown>[];
  emergencyLights?: Record<string, unknown>[];
  hoseReels?: (Record<string, unknown> & { components: ComponentCell[] })[];
  panels: {
    title: string;
    binhLabels: string[];
    mucMin: number | null;
    mucMax: number | null;
    mucDvt: string | null;
    mucValues: Record<string, number | null>;
    mucGhiChu: string | null;
    apMin: number | null;
    apMax: number | null;
    apDvt: string | null;
    apValues: Record<string, number | null>;
    apGhiChu: string | null;
    ngayKiemTra: Date | null;
    nguoiKiemTra: string | null;
  }[];
  /** Ảnh chữ ký số tải sẵn từ S3, tra theo `signatureKey` của từng bản ký. */
  signatureImages?: SignatureImages;
  /** Chỉ có ở BẢN LƯU TRỮ hằng tháng — sinh thêm sheet "CHỐT KỲ" (xem writeClosingSheet). */
  closing?: {
    closedAt: Date;
    closedBy: string;
    soBinh: number;
    soTu: number;
    soBon: number;
    soBangFm200: number;
    soChuKy: number;
  };
};

function headerRow(ws: ExcelJS.Worksheet, rowIdx: number, labels: string[]) {
  const row = ws.getRow(rowIdx);
  labels.forEach((label, i) => {
    const cell = row.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true, size: 10, color: { argb: ARGB("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB(HEADER_FILL) } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDER;
  });
  row.height = 32;
}

function writeBody(ws: ExcelJS.Worksheet, startRow: number, rows: unknown[][], statusCol?: number) {
  rows.forEach((values, r) => {
    const row = ws.getRow(startRow + r);
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v instanceof Date ? v : (v as ExcelJS.CellValue);
      if (v instanceof Date) cell.numFmt = "dd/mm/yyyy";
      cell.font = { size: 10 };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = BORDER;
      if (statusCol !== undefined && c + 1 === statusCol) {
        const fill = STATUS_FILL[String(v ?? "")];
        if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB(fill) } };
      }
    });
  });
}

// ---------------------------------------------------------------- CHỮ KÝ (ảnh)
/**
 * Ảnh chữ ký số tải sẵn từ S3, tra theo `signatureKey` đã chốt lúc ký.
 * Buffer được nạp Ở NGOÀI (lib/pccc-archive.ts) — file này giữ nguyên tính thuần tuý,
 * không tự đi gọi mạng.
 */
export type SignatureImages = Map<string, Buffer>;

/** Hộp chứa ảnh trong ô, tính bằng pixel. Cao 24 vừa với hàng 22pt mà vẫn đọc được nét ký. */
const SIGN_BOX = { width: 96, height: 24 };
const SIGN_ROW_HEIGHT = 22; // point

/**
 * Bề rộng THỰC của PNG để giữ đúng tỉ lệ — kéo giãn chữ ký cho vừa khung là làm méo
 * chữ ký của người ta. Đọc thẳng khối IHDR (13 byte đầu sau chữ ký PNG); định dạng khác
 * thì trả null và dùng khung mặc định.
 */
function pngSize(buffer: Buffer): { width: number; height: number } | null {
  const isPng = buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47;
  if (!isPng) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * Chèn ảnh chữ ký vào đúng ô của một dòng.
 *
 * Mỗi ảnh chỉ được `addImage` MỘT LẦN cho cả workbook rồi neo lại nhiều chỗ: cả kỳ
 * thường chỉ vài người ký, mà thêm ảnh theo từng dòng thì 747 dòng là 747 bản sao cùng
 * một tấm ảnh nằm trong file.
 */
function attachSignature(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  images: SignatureImages | undefined,
  imageIds: Map<string, number>,
  rowNumber: number,
  colNumber: number,
  signatureKey: string | null | undefined
) {
  if (!signatureKey || !images) return;
  const buffer = images.get(signatureKey);
  if (!buffer) return;

  let imageId = imageIds.get(signatureKey);
  if (imageId === undefined) {
    imageId = wb.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: "png" });
    imageIds.set(signatureKey, imageId);
  }

  const size = pngSize(buffer);
  const height = SIGN_BOX.height;
  const width = size ? Math.min(SIGN_BOX.width, Math.round((size.width / size.height) * height)) : SIGN_BOX.width;

  ws.getRow(rowNumber).height = SIGN_ROW_HEIGHT;
  ws.addImage(imageId, {
    // `tl` đếm từ 0 và nhận số thập phân — cộng thêm chút để ảnh không đè lên viền ô.
    tl: { col: colNumber - 1 + 0.08, row: rowNumber - 1 + 0.08 },
    ext: { width, height },
    editAs: "oneCell",
  });
}

function autoWidths(ws: ExcelJS.Worksheet, labels: string[], rows: unknown[][], min = 8, max = 34) {
  labels.forEach((label, i) => {
    const lens = [label.length / 2, ...rows.map((r) => String(r[i] ?? "").length)];
    ws.getColumn(i + 1).width = Math.min(max, Math.max(min, Math.max(...lens) + 2));
  });
}

// ------------------------------------------------------------------ BCC
const BCC_HEADERS = [
  "STT", "Mã thiết bị", "Chủng loại", "Vị trí lắp đặt", "Cương vị quản lý", "Tổ máy", "Cấp giám sát", "SL", "ĐVT",
  "Tình trạng tổng thể", "Áp suất bình MFZ/KL bình CO2 (%)", "Vị trí đặt hiện tại", "Tình trạng bên ngoài",
  "Nguồn gốc / NSX", "Thời gian thay thế gần nhất", "Ngày sản xuất", "Thời gian sử dụng", "Đến hạn thay thế",
  "Ngày kiểm tra gần nhất", "Người kiểm tra", "Ghi chú khác", "Người ký", "Thời điểm ký", "Chữ ký",
];
const BCC_FIELDS = [
  "stt", "ma", "chungLoai", "viTri", "cuongVi", "machine", "nguoiGiamSat", "sl", "dvt", "tinhTrang", "apSuat",
  "viTriHienTai", "tinhTrangNgoai", "nguonGoc", "thoiGianThayGanNhat", "ngaySx", "thoiGianSd",
  "denHanThayThe", "ngayKiemTra", "nguoiKiemTra", "ghiChu",
];

function writeBcc(wb: ExcelJS.Workbook, input: ExportInput, imageIds: Map<string, number>) {
  const ws = wb.addWorksheet(`BÌNH CHỮA CHÁY - ${input.periodLabel}`, {
    views: [{ state: "frozen", xSplit: 2, ySplit: 1 }],
  });
  const rows = input.extinguishers.map((r) => [
    ...BCC_FIELDS.map((f) => (r[f] ?? null) as unknown),
    (r.signature as { signerName?: string } | null)?.signerName ?? "",
    (r.signature as { signedAt?: Date } | null)?.signedAt ?? "",
    "", // cột "Chữ ký": để trống, ảnh được neo đè lên ô
  ]);
  headerRow(ws, 1, BCC_HEADERS);
  writeBody(ws, 2, rows, 10); // cột 10 = Tình trạng tổng thể (đã dịch 1 vì thêm Tổ máy)
  autoWidths(ws, BCC_HEADERS, rows);
  const signCol = BCC_HEADERS.length;
  ws.getColumn(signCol).width = 18;
  input.extinguishers.forEach((r, i) => {
    const sig = r.signature as { signatureKey?: string | null } | null;
    attachSignature(wb, ws, input.signatureImages, imageIds, 2 + i, signCol, sig?.signatureKey);
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: BCC_HEADERS.length } };
}

// ------------------------------------------------------------------ TCC
function writeTcc(wb: ExcelJS.Workbook, input: ExportInput, imageIds: Map<string, number>) {
  const ws = wb.addWorksheet(`TỦ CHỮA CHÁY - ${input.periodLabel}`, {
    views: [{ state: "frozen", xSplit: 2, ySplit: 2 }],
  });

  // Hai nhóm CUỘN ỐNG / LĂNG PHUN đã chuyển hẳn sang sheet CUỘN VÒI CHỮA CHÁY —
  // lọc ở đây để file xuất khớp với bảng trên web, không đếm một khiếm khuyết hai lần.
  const cabinets: ExportInput["cabinets"] = input.cabinets.map((c) => ({
    ...c,
    components: cabinetComponentsForTcc(c.components),
  }));
  const groups: { label: string; statuses: string[] }[] = [];
  for (const c of cabinets[0]?.components ?? []) {
    const g = groups.find((x) => x.label === c.groupLabel);
    if (g) g.statuses.push(c.status);
    else groups.push({ label: c.groupLabel, statuses: [c.status] });
  }

  const identity = ["STT", "Mã thiết bị", "Tên / Loại tủ", "Vị trí lắp đặt", "Cương vị quản lý", "Tổ máy", "SL", "ĐVT"];
  const trailing = ["Tình trạng tổng thể", "Số YCSC", "Ngày kiểm tra gần nhất", "Người kiểm tra", "Ghi chú khác", "Người ký", "Thời điểm ký", "Chữ ký"];
  const componentCount = groups.reduce((n, g) => n + g.statuses.length, 0);
  const totalCols = identity.length + componentCount + trailing.length;

  // Hàng 1 = nhóm (merge), hàng 2 = trạng thái
  headerRow(ws, 1, Array(totalCols).fill(""));
  headerRow(ws, 2, Array(totalCols).fill(""));
  identity.forEach((label, i) => {
    ws.mergeCells(1, i + 1, 2, i + 1);
    ws.getCell(1, i + 1).value = label;
  });
  let col = identity.length + 1;
  for (const g of groups) {
    if (g.statuses.length > 1) ws.mergeCells(1, col, 1, col + g.statuses.length - 1);
    ws.getCell(1, col).value = g.label;
    g.statuses.forEach((s, i) => (ws.getCell(2, col + i).value = s));
    col += g.statuses.length;
  }
  trailing.forEach((label, i) => {
    ws.mergeCells(1, col + i, 2, col + i);
    ws.getCell(1, col + i).value = label;
  });

  const rows = cabinets.map((cab) => {
    const tick = (groupLabel: string, status: string) =>
      cab.components.find((c) => c.groupLabel === groupLabel && c.status === status)?.checked ? "☑" : "☐";
    return [
      cab.stt ?? null,
      cab.ma ?? null,
      cab.ten ?? null,
      cab.viTri ?? null,
      cab.cuongVi ?? null,
      cab.machine ?? null,
      cab.sl ?? null,
      cab.dvt ?? null,
      ...groups.flatMap((g) => g.statuses.map((s) => tick(g.label, s))),
      cab.tinhTrangTongThe ?? null,
      cab.soYcsc ?? null,
      cab.ngayKiemTra ?? null,
      cab.nguoiKiemTra ?? null,
      cab.ghiChu ?? null,
      (cab.signature as { signerName?: string } | null)?.signerName ?? "",
      (cab.signature as { signedAt?: Date } | null)?.signedAt ?? "",
      "", // cột "Chữ ký": ảnh neo đè lên ô
    ] as unknown[];
  });

  writeBody(ws, 3, rows, identity.length + componentCount + 1);
  cabinets.forEach((cab, i) => {
    const sig = cab.signature as { signatureKey?: string | null } | null;
    attachSignature(wb, ws, input.signatureImages, imageIds, 3 + i, totalCols, sig?.signatureKey);
  });
  for (let c = 1; c <= identity.length; c++) ws.getColumn(c).width = c === 3 ? 34 : c === 6 ? 8 : 14;
  for (let c = identity.length + 1; c <= identity.length + componentCount; c++) ws.getColumn(c).width = 5;
  for (let c = identity.length + componentCount + 1; c <= totalCols; c++) ws.getColumn(c).width = c === totalCols ? 18 : 16;
}

// ------------------------------------------------------- FCD + FM200 (1 sheet)
const FCD_HEADERS = [
  "STT", "Tên", "Cương vị quản lý", "Tổ máy", "Vị trí lắp đặt", "ĐVT", "Khối lượng thiết kế", "Khối lượng hiện tại",
  "% còn lại", "Tình trạng", "Ngày chốt", "Người chốt", "Ghi chú", "Người ký", "Thời điểm ký", "Chữ ký",
];

function writeFcd(wb: ExcelJS.Workbook, input: ExportInput, imageIds: Map<string, number>) {
  const ws = wb.addWorksheet(`FOAM+CO2+DIESEL - ${input.periodLabel}`, { views: [{ state: "frozen", ySplit: 1 }] });
  const rows = input.bulks.map((b) => [
    b.stt ?? null, b.ten ?? null, b.cuongVi ?? null, b.machine ?? null, b.viTri ?? null, b.dvt ?? null,
    b.khoiLuongThietKe ?? null, b.khoiLuongHienTai ?? null,
    b.phanTramConLai === null || b.phanTramConLai === undefined ? null : Number(b.phanTramConLai),
    b.tinhTrang ?? null, b.ngayChot ?? null, b.nguoiChot ?? null, b.ghiChu ?? null,
    (b.signature as { signerName?: string } | null)?.signerName ?? "",
    (b.signature as { signedAt?: Date } | null)?.signedAt ?? "",
    "", // cột "Chữ ký": ảnh neo đè lên ô
  ] as unknown[]);
  headerRow(ws, 1, FCD_HEADERS);
  writeBody(ws, 2, rows, 10); // Tình trạng dịch sang cột 10 vì thêm Tổ máy
  autoWidths(ws, FCD_HEADERS, rows);
  ws.getColumn(FCD_HEADERS.length).width = 18;
  input.bulks.forEach((b, i) => {
    const sig = b.signature as { signatureKey?: string | null } | null;
    attachSignature(wb, ws, input.signatureImages, imageIds, 2 + i, FCD_HEADERS.length, sig?.signatureKey);
  });
  for (let r = 2; r < 2 + rows.length; r++) ws.getCell(r, 9).numFmt = "0.0%";

  // Bảng FM200 nằm dưới, bố cục NGANG (mỗi bình 1 cột) như bảng giấy gốc
  let cursor = 2 + rows.length + 2;
  for (const panel of input.panels) {
    ws.mergeCells(cursor, 1, cursor, 5 + panel.binhLabels.length);
    const title = ws.getCell(cursor, 1);
    title.value = panel.title;
    title.font = { bold: true, size: 11, color: { argb: ARGB(HEADER_FILL) } };
    cursor += 1;

    const sub = ws.getCell(cursor, 1);
    sub.value = `Ngày kiểm tra: ${panel.ngayKiemTra ? new Date(panel.ngayKiemTra).toLocaleDateString("vi-VN") : "—"}   ·   Người kiểm tra: ${panel.nguoiKiemTra ?? "—"}`;
    sub.font = { size: 9, italic: true };
    cursor += 2;

    const labels = ["Loại đo", "Min", "Max", "Đơn vị", ...panel.binhLabels.map((b) => `Bình ${b}`), "Ghi chú"];
    headerRow(ws, cursor, labels);
    const body: unknown[][] = [
      ["Mức FM 200", panel.mucMin, panel.mucMax, panel.mucDvt, ...panel.binhLabels.map((b) => panel.mucValues?.[b] ?? null), panel.mucGhiChu],
      ["Áp suất N2", panel.apMin, panel.apMax, panel.apDvt, ...panel.binhLabels.map((b) => panel.apValues?.[b] ?? null), panel.apGhiChu],
    ];
    writeBody(ws, cursor + 1, body);
    cursor += body.length + 3;
  }
}

/**
 * Sheet "CHỐT KỲ" — chỉ có trong BẢN LƯU TRỮ hằng tháng, không có trong file người dùng
 * tự bấm xuất. File lưu trên S3 sống lâu hơn dữ liệu trong DB (DB chỉ giữ 6 kỳ), nên nó
 * phải tự mang theo bằng chứng: chốt lúc nào, ai/cái gì chốt, chốt trên bao nhiêu dòng.
 * Đặt LÀM SHEET ĐẦU để mở file ra là thấy ngay, và các sheet dữ liệu giữ nguyên bố cục
 * gốc của file Excel nguồn.
 */
function writeClosingSheet(wb: ExcelJS.Workbook, input: ExportInput) {
  const closing = input.closing;
  if (!closing) return;
  const ws = wb.addWorksheet("CHỐT KỲ");
  ws.columns = [{ width: 30 }, { width: 46 }];
  const rows: [string, string | number][] = [
    ["Kỳ kiểm tra", input.periodLabel],
    ["Thời điểm chốt", closing.closedAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })],
    ["Người/hệ thống chốt", closing.closedBy],
    ["Số bình chữa cháy", closing.soBinh],
    ["Số tủ chữa cháy", closing.soTu],
    ["Số bồn Foam/CO2/Diesel", closing.soBon],
    ["Số bảng FM200", closing.soBangFm200],
    ["Số chữ ký hiệu lực", closing.soChuKy],
  ];
  const title = ws.getRow(1);
  title.getCell(1).value = `THÔNG TIN CHỐT KỲ ${input.periodLabel}`;
  title.getCell(1).font = { bold: true, size: 13, color: { argb: ARGB("FFFFFF") } };
  title.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB(HEADER_FILL) } };
  title.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB(HEADER_FILL) } };
  title.height = 22;

  rows.forEach(([label, value], i) => {
    const row = ws.getRow(i + 2);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = value;
    for (const col of [1, 2]) row.getCell(col).border = BORDER;
  });
  ws.getRow(rows.length + 3).getCell(1).value =
    "Bản lưu trữ tự động của hệ thống EAM. Dữ liệu trong cơ sở dữ liệu chỉ giữ 6 kỳ gần nhất; tệp này là bản gốc dài hạn.";
  ws.getRow(rows.length + 3).getCell(1).font = { italic: true, size: 10 };
}

export async function buildPcccWorkbook(input: ExportInput, sheets: ExportSheet[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PowerPlant EAM — Quản lý thiết bị PCCC";
  wb.created = new Date();
  if (input.closing) {
    wb.description = `Bản lưu trữ kỳ ${input.periodLabel}, chốt lúc ${input.closing.closedAt.toISOString()}`;
    wb.lastModifiedBy = input.closing.closedBy;
  }
  writeClosingSheet(wb, input);
  // Mỗi ảnh chữ ký chỉ nạp vào workbook một lần, dùng lại cho mọi dòng và mọi sheet.
  const imageIds = new Map<string, number>();
  if (sheets.includes("BCC")) writeBcc(wb, input, imageIds);
  if (sheets.includes("TCC")) writeTcc(wb, input, imageIds);
  if (sheets.includes("FCD")) writeFcd(wb, input, imageIds);
  if (sheets.includes("NNBC")) writeAlarmButtons(wb, input, imageIds);
  if (sheets.includes("VAN")) writeValves(wb, input, imageIds);
  if (sheets.includes("DEN")) writeEmergencyLights(wb, input, imageIds);
  if (sheets.includes("CVCC")) writeHoseReels(wb, input, imageIds);
  return wb.xlsx.writeBuffer();
}

// ===========================================================================
// BỐN NHÓM THIẾT BỊ ĐỢT 2
//
// Hai kiểu sheet, đúng hai kiểu bảng trên web:
//   - Sheet PHẲNG (van, đèn EXIT, đèn chiếu sáng sự cố): đầu bảng một tầng.
//   - Sheet HAI TẦNG (nút nhấn, cuộn vòi): nhóm × trạng thái như tủ chữa cháy.
//
// Ba cột cuối "Người ký / Thời điểm ký / Chữ ký" giống hệt các sheet cũ — người
// nhận file mở sheet nào cũng thấy cùng một chỗ để đối chiếu chữ ký.
// ===========================================================================

type SignedRow = Record<string, unknown> & {
  signature?: { signerName?: string; signedAt?: Date; signatureKey?: string | null } | null;
};

const SIGN_HEADERS = ["Người ký", "Thời điểm ký", "Chữ ký"];

/**
 * Sheet phẳng dùng chung. Gom lại vì ba sheet mới chỉ khác nhau ở TÊN SHEET, danh sách
 * cột và cột tô màu theo tình trạng — chép `writeBcc` thêm ba lần thì mỗi lần sửa bố
 * cục chữ ký lại phải sửa bốn chỗ.
 *
 * `statusCol` là số thứ tự (1-based) của cột tình trạng cần tô nền theo màu trạng thái;
 * bỏ trống nếu sheet không có cột nào như vậy.
 */
function writeFlatSheet(
  wb: ExcelJS.Workbook,
  input: ExportInput,
  imageIds: Map<string, number>,
  spec: { name: string; headers: string[]; fields: string[]; rows: SignedRow[]; statusCol?: number; freezeCols?: number }
) {
  const ws = wb.addWorksheet(spec.name, {
    views: [{ state: "frozen", xSplit: spec.freezeCols ?? 2, ySplit: 1 }],
  });
  const headers = [...spec.headers, ...SIGN_HEADERS];
  const rows = spec.rows.map((r) => [
    ...spec.fields.map((f) => (r[f] ?? null) as unknown),
    r.signature?.signerName ?? "",
    r.signature?.signedAt ?? "",
    "", // cột "Chữ ký": để trống, ảnh được neo đè lên ô
  ]);
  headerRow(ws, 1, headers);
  writeBody(ws, 2, rows, spec.statusCol);
  autoWidths(ws, headers, rows);
  const signCol = headers.length;
  ws.getColumn(signCol).width = 18;
  spec.rows.forEach((r, i) => attachSignature(wb, ws, input.signatureImages, imageIds, 2 + i, signCol, r.signature?.signatureKey));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
}

/**
 * Sheet hai tầng dùng chung cho nút nhấn và cuộn vòi — cùng khuôn với `writeTcc`
 * (nhóm merge ở hàng 1, trạng thái ở hàng 2, ô tích ghi ☑/☐).
 */
function writeTieredSheet(
  wb: ExcelJS.Workbook,
  input: ExportInput,
  imageIds: Map<string, number>,
  spec: {
    name: string;
    identity: string[];
    trailing: string[];
    rows: (SignedRow & { components: ComponentCell[] })[];
    /** Giá trị các cột định danh và cột đuôi của một dòng, theo đúng thứ tự header. */
    identityValues: (row: SignedRow & { components: ComponentCell[] }) => unknown[];
    trailingValues: (row: SignedRow & { components: ComponentCell[] }) => unknown[];
    /** Đổi CHỮ hiển thị của trạng thái (cuộn vòi ghi "Đạt"/"Không đạt"). */
    statusLabel?: (status: string) => string;
  }
) {
  const ws = wb.addWorksheet(spec.name, { views: [{ state: "frozen", xSplit: 2, ySplit: 2 }] });

  // Khung nhóm × trạng thái lấy từ chính dữ liệu (giữ thứ tự cột gốc)
  const groups: { label: string; statuses: string[] }[] = [];
  for (const c of spec.rows[0]?.components ?? []) {
    const g = groups.find((x) => x.label === c.groupLabel);
    if (g) g.statuses.push(c.status);
    else groups.push({ label: c.groupLabel, statuses: [c.status] });
  }

  const trailing = [...spec.trailing, ...SIGN_HEADERS];
  const componentCount = groups.reduce((n, g) => n + g.statuses.length, 0);
  const totalCols = spec.identity.length + componentCount + trailing.length;

  headerRow(ws, 1, Array(totalCols).fill(""));
  headerRow(ws, 2, Array(totalCols).fill(""));
  spec.identity.forEach((label, i) => {
    ws.mergeCells(1, i + 1, 2, i + 1);
    ws.getCell(1, i + 1).value = label;
  });
  let col = spec.identity.length + 1;
  for (const g of groups) {
    if (g.statuses.length > 1) ws.mergeCells(1, col, 1, col + g.statuses.length - 1);
    ws.getCell(1, col).value = g.label;
    g.statuses.forEach((s, i) => (ws.getCell(2, col + i).value = spec.statusLabel ? spec.statusLabel(s) : s));
    col += g.statuses.length;
  }
  trailing.forEach((label, i) => {
    ws.mergeCells(1, col + i, 2, col + i);
    ws.getCell(1, col + i).value = label;
  });

  const rows = spec.rows.map((r) => {
    const tick = (groupLabel: string, status: string) =>
      r.components.find((c) => c.groupLabel === groupLabel && c.status === status)?.checked ? "☑" : "☐";
    return [
      ...spec.identityValues(r),
      ...groups.flatMap((g) => g.statuses.map((s) => tick(g.label, s))),
      ...spec.trailingValues(r),
      r.signature?.signerName ?? "",
      r.signature?.signedAt ?? "",
      "", // cột "Chữ ký": ảnh neo đè lên ô
    ] as unknown[];
  });

  writeBody(ws, 3, rows, spec.identity.length + componentCount + 1);
  spec.rows.forEach((r, i) => attachSignature(wb, ws, input.signatureImages, imageIds, 3 + i, totalCols, r.signature?.signatureKey));
  for (let c = 1; c <= spec.identity.length; c++) ws.getColumn(c).width = c === 3 ? 34 : 14;
  for (let c = spec.identity.length + 1; c <= spec.identity.length + componentCount; c++) ws.getColumn(c).width = 5;
  for (let c = spec.identity.length + componentCount + 1; c <= totalCols; c++) ws.getColumn(c).width = c === totalCols ? 18 : 16;
}

// ------------------------------------------------------------------ NNBC
function writeAlarmButtons(wb: ExcelJS.Workbook, input: ExportInput, imageIds: Map<string, number>) {
  writeTieredSheet(wb, input, imageIds, {
    name: `NÚT NHẤN BÁO CHÁY - ${input.periodLabel}`,
    identity: ["STT", "Mã KKS", "Tên khu vực Layout", "Vị trí cụ thể", "Cương vị quản lý", "Tổ máy", "Người giám sát"],
    // KHÔNG có "Số YCSC" — sheet nguồn của nút nhấn không có cột này.
    trailing: ["Tình trạng tổng thể", "Ngày kiểm tra gần nhất", "Người kiểm tra", "Ghi chú khác"],
    rows: input.alarmButtons ?? [],
    identityValues: (r) => [r.stt ?? null, r.maKks ?? null, r.tenKhuVuc ?? null, r.viTri ?? null, r.cuongVi ?? null, r.machine ?? null, r.nguoiGiamSat ?? null],
    trailingValues: (r) => [r.tinhTrangTongThe ?? null, r.ngayKiemTra ?? null, r.nguoiKiemTra ?? null, r.khac ?? null],
  });
}

// ------------------------------------------------------------------ CVCC
function writeHoseReels(wb: ExcelJS.Workbook, input: ExportInput, imageIds: Map<string, number>) {
  writeTieredSheet(wb, input, imageIds, {
    name: `CUỘN VÒI CHỮA CHÁY - ${input.periodLabel}`,
    identity: ["STT", "Mã cuộn vòi", "Tên", "Thuộc tủ chữa cháy", "Vị trí lắp đặt", "Cương vị quản lý", "Tổ máy"],
    trailing: ["Tình trạng tổng thể", "Số YCSC", "Ngày kiểm tra gần nhất", "Người kiểm tra", "Ghi chú khác"],
    rows: input.hoseReels ?? [],
    identityValues: (r) => [r.stt ?? null, r.ma ?? null, r.ten ?? null, r.cabinetMa ?? null, r.viTri ?? null, r.cuongVi ?? null, r.machine ?? null],
    trailingValues: (r) => [r.tinhTrangTongThe ?? null, r.soYcsc ?? null, r.ngayKiemTra ?? null, r.nguoiKiemTra ?? null, r.ghiChu ?? null],
    // Trên web hai ô đầu/cuối hiện là "Đạt"/"Không đạt"; file xuất phải ghi giống hệt,
    // nếu không người đối chiếu sẽ tưởng là hai bảng khác nhau.
    statusLabel: hoseReelLabelDisplay,
  });
}

// ------------------------------------------------------------------- VAN
const VAN_HEADERS = [
  "STT", "Mã KKS van", "Tên van", "Loại van", "Cương vị quản lý", "Tổ máy", "Người giám sát", "Vị trí",
  "Tình trạng", "Mô tả", "Số YCSC", "Ngày kiểm tra gần nhất", "Người kiểm tra",
];
const VAN_FIELDS = [
  "stt", "maKks", "tenVan", "loaiVan", "cuongVi", "machine", "nguoiGiamSat", "viTri",
  "tinhTrang", "moTa", "soYcsc", "ngayKiemTra", "nguoiKiemTra",
];

function writeValves(wb: ExcelJS.Workbook, input: ExportInput, imageIds: Map<string, number>) {
  writeFlatSheet(wb, input, imageIds, {
    name: `VAN CHỮA CHÁY - ${input.periodLabel}`,
    headers: VAN_HEADERS,
    fields: VAN_FIELDS,
    rows: input.valves ?? [],
    statusCol: 9, // "Tình trạng"
  });
}

// ------------------------------------------------------------------- ĐÈN
const DEN_HEADERS = [
  "STT", "Mã KKS", "Tên khu vực Layout", "Mã bảng vẽ", "Số lượng khu vực", "Cương vị quản lý", "Tổ máy",
  "Người giám sát", "Tình trạng", "Kết quả test gần nhất", "Ghi chú", "Ngày kiểm tra gần nhất", "Người kiểm tra",
];
const DEN_FIELDS = [
  "stt", "maKks", "tenKhuVuc", "maBanVe", "soLuongKhuVuc", "cuongVi", "machine",
  "nguoiGiamSat", "tinhTrang", "ketQuaTest", "ghiChu", "ngayKiemTra", "nguoiKiemTra",
];

/**
 * Hai loại đèn ra HAI SHEET riêng dù trong DB chung một bảng — bám đúng file Excel nguồn
 * và mẫu báo cáo, người nhận file không phải tự lọc cột "loại".
 */
function writeEmergencyLights(wb: ExcelJS.Workbook, input: ExportInput, imageIds: Map<string, number>) {
  const all = input.emergencyLights ?? [];
  for (const [loai, name] of [
    ["EXIT", "ĐÈN EXIT"],
    ["CSSC", "ĐÈN CHIẾU SÁNG SỰ CỐ"],
  ] as const) {
    const rows = all.filter((r) => r.loai === loai);
    if (rows.length === 0) continue;
    writeFlatSheet(wb, input, imageIds, {
      name: `${name} - ${input.periodLabel}`,
      headers: DEN_HEADERS,
      fields: DEN_FIELDS,
      rows,
      statusCol: 9, // "Tình trạng"
    });
  }
}
