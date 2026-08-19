/**
 * SỔ THEO DÕI PHƯƠNG TIỆN PCCC (Mẫu số 01) — dữ liệu và điều kiện xuất.
 *
 * Đây là biểu mẫu GIẤY nộp cho công tác PCCC, khác hẳn file Excel lưu trữ kỳ
 * (lib/pccc-archive.ts): sổ này in theo TỪNG CƯƠNG VỊ, gộp bình chữa cháy rồi tới tủ
 * chữa cháy của chính cương vị đó, đánh số thứ tự liên tục từ 1.
 *
 * LUẬT MỞ NÚT (chốt với nghiệp vụ 2026-08-12): chỉ xuất được khi cương vị đã KÝ ĐỦ
 * cả hai bảng của kỳ — chữ ký là bằng chứng đã đi kiểm tra, in sổ khi còn dòng chưa ký
 * là in ra một tờ khai dối. Điều kiện tính lại theo TỪNG KỲ nên sang tháng mới, kỳ mới
 * chưa ai ký, nút tự biến mất — không cần cơ chế reset riêng.
 */
import { prisma } from "@/lib/prisma";
import { positionLabelOf, type PositionCode } from "@/lib/position-catalog";
import { TINH_TRANG_DAT, round2ToneOf } from "@/lib/pccc-status";
import { signaturesOf } from "@/lib/pccc-service";

/** Thư mục gốc trên S3. Tách khỏi `pccc/archive` vì vòng đời khác nhau hoàn toàn. */
export const PCCC_BOOK_PREFIX = (process.env.PCCC_BOOK_S3_PREFIX || "pccc/so-theo-doi").replace(/^\/+|\/+$/g, "");

/**
 * `T08.2026` + `COAL_MILL` → `pccc/so-theo-doi/2026/T08.2026/COAL_MILL.pdf`.
 *
 * Chia theo NĂM → KỲ → CƯƠNG VỊ: mỗi cương vị mỗi tháng đúng MỘT tệp, bấm xuất lần nữa
 * thì ghi đè. Giữ nhiều phiên bản chỉ tổ làm người tra cứu phân vân bản nào là bản nộp.
 */
export function bookKeyOf(periodLabel: string, positionCode: string) {
  const year = periodLabel.split(".")[1] ?? "0000";
  return `${PCCC_BOOK_PREFIX}/${year}/${periodLabel}/${positionCode}.pdf`;
}

export function bookFileNameOf(periodLabel: string, positionCode: string) {
  return `So-theo-doi-PCCC-${positionCode}-${periodLabel}.pdf`;
}

/**
 * Cương vị mà người đang đăng nhập được xuất sổ.
 *
 * - Cương vị thường: đúng cương vị của mình (phạm vi ghi chỉ có một mã).
 * - Cấp quản lý / quản trị (phạm vi ghi = tất cả): họ không "thuộc" cương vị nào theo
 *   phạm vi ghi, nên lấy theo thứ tự — CƯƠNG VỊ CHỌN Ở BỘ LỌC trước, không chọn thì
 *   dùng CƯƠNG VỊ ĐANG LÀM VIỆC của chính họ (`ownCode`).
 *
 *   Không có bước `ownCode` thì người vừa là quản lý vừa đang trực một cương vị (rất
 *   phổ biến: Trưởng ca đang trực Máy nghiền, hay tài khoản quản trị của chính người đi
 *   kiểm tra) ký xong lại KHÔNG thấy nút, vì bộ lọc mặc định là "tất cả cương vị" —
 *   nhìn y như tính năng hỏng.
 */
export function bookPositionOf(
  /** Nhận cả bản meta của route đọc (`codes` là string[]) lẫn phạm vi ghi thật. */
  scope: { all: boolean; codes: readonly string[] },
  filterCuongVi?: string | null,
  /** Mã cương vị ĐANG LÀM VIỆC của người đăng nhập — chỉ dùng khi phạm vi là tất cả. */
  ownCode?: string | null
): PositionCode | null {
  const picked = filterCuongVi && filterCuongVi !== "ALL" ? (filterCuongVi as PositionCode) : null;
  if (scope.all) return picked ?? ((ownCode as PositionCode) || null);
  if (!scope.codes.length) return null;
  // Đã chọn lọc thì phải nằm trong phạm vi của mình, nếu không là xuất sổ của người khác.
  if (picked) return scope.codes.includes(picked) ? picked : null;
  return scope.codes[0] as PositionCode;
}

/**
 * Nhóm thiết bị trong sổ. Số thứ tự vẫn chạy LIÊN TỤC xuyên các nhóm — nhóm chỉ để
 * đếm và để nói câu "còn N cái chưa ký".
 *
 * Thứ tự ở đây là thứ tự in ra sổ, bám mẫu "BẢNG II": bình chữa cháy → thiết bị thuộc
 * hệ thống chữa cháy → đèn/phương tiện chiếu sáng sự cố, chỉ dẫn thoát nạn.
 */
export const BOOK_GROUPS = [
  { key: "BCC", label: "bình chữa cháy" },
  { key: "TCC", label: "tủ chữa cháy" },
  { key: "CVCC", label: "cuộn vòi chữa cháy" },
  { key: "VAN", label: "van chữa cháy" },
  { key: "NNBC", label: "nút nhấn báo cháy" },
  { key: "DEN", label: "đèn sự cố" },
] as const;

export type BookGroupKey = (typeof BOOK_GROUPS)[number]["key"];

export type BookRow = {
  /** Chỉ dùng để gom nhóm; số thứ tự vẫn chạy liên tục xuyên các nhóm. */
  table: BookGroupKey;
  /** Cột "Ký mã hiệu" — mã thiết bị, đứng thành cột riêng đúng mẫu. */
  ma: string;
  /** Cột "Tên phương tiện" = chủng loại (BCC) / tên tủ (TCC) / tên van… */
  ten: string;
  dvt: string;
  sl: number | null;
  ngayKiemTra: Date | null;
  tinhTrang: string;
  /**
   * Cột "Đánh giá tình trạng hoạt động" — chữ IN RA SỔ.
   *
   * Thiết bị có ô tích (tủ, nút nhấn, cuộn vòi) thì liệt kê RÕ từng khiếm khuyết đang
   * tích, ví dụ "Thân tủ: Gỉ sét nhẹ, có thể xử lý; Ngàm: Bất khả dụng" — biểu mẫu yêu
   * cầu ghi rõ hỏng ở đâu chứ không chỉ một chữ "Không đạt". Không khiếm khuyết nào thì
   * ghi "Đạt". Thiết bị một ô tình trạng (bình, van, đèn) thì lấy thẳng nhãn tình trạng.
   */
  danhGia: string;
  /** Dòng phụ chữ nhỏ ngay dưới phần đánh giá — xem `noteOf`. Thiết bị tốt thì để trống. */
  ghiChu: string;
  nguoiKiemTra: string;
  signatureKey: string | null;
};

/**
 * Liệt kê từng khiếm khuyết ĐANG TÍCH của một dòng có ô tích, dạng
 * "Nhóm: trạng thái", nối nhau bằng "; ". Không có khiếm khuyết nào thì trả về "Đạt".
 *
 * Bỏ qua ô ĐẦU mỗi nhóm vì đó là mức bình thường/khả dụng, không phải khiếm khuyết.
 * Nhãn nhóm trong dữ liệu viết HOA toàn bộ nên hạ về dạng câu cho dễ đọc trên giấy.
 */
function defectDetail(components: { groupLabel: string; status: string; checked: boolean; statusOrder: number }[]): string {
  const parts = components
    .filter((c) => c.checked && c.statusOrder > 0)
    .map((c) => `${c.groupLabel.charAt(0)}${c.groupLabel.slice(1).toLowerCase()}: ${c.status}`);
  return parts.length ? parts.join('; ') : TINH_TRANG_DAT;
}

/**
 * Cột 8 "Ghi chú" của Mẫu số 01 — CHỈ ghi cho thiết bị KHÔNG còn khả dụng (bất khả dụng
 * / cần theo dõi / không đạt). Sổ nộp cho công tác PCCC cần nói rõ thiết bị hỏng thì
 * hỏng ở đâu; còn thiết bị tốt mà cũng điền thì cột này đầy chữ vô ích, che mất mấy
 * dòng đáng chú ý.
 *
 * Nguồn chữ khác nhau theo bảng, đúng như nghiệp vụ chốt 2026-08-13:
 *  - Bình chữa cháy → cột "Áp suất / KL" (hết áp, 2/4 mức đỏ, KL hao hụt…), vì đó chính
 *    là lý do bình bị đánh giá không khả dụng.
 *  - Tủ chữa cháy / cuộn vòi → cột "Ghi chú" của bảng (mô tả linh kiện hỏng).
 *  - Van → cột "Mô tả"; nút nhấn → cột "Ghi chú khác"; đèn → "Kết quả test gần nhất".
 *
 * Xét theo MÀU của tình trạng (`round2ToneOf`) chứ không so chuỗi: mỗi bảng một vốn từ
 * riêng, nhưng "ok / cần theo dõi / hỏng" thì đã có bảng tra dùng chung.
 *
 * "Không có đèn" có màu trung tính (không phải "ok") nên VẪN được ghi chú — đúng ý:
 * sổ cần nói rõ vị trí đó không lắp đèn, đó là thông tin, không phải lỗi.
 */
function noteOf(tinhTrang: string | null, source: string | null): string {
  if (round2ToneOf(tinhTrang) === "ok") return "";
  return source ?? "";
}

export type BookGroupCount = { key: BookGroupKey; label: string; total: number; signed: number };

export type BookStatus = {
  positionCode: string | null;
  positionLabel: string | null;
  /** Đếm theo từng nhóm — thay cho hai trường cứng bcc/tcc của bản trước. */
  groups: BookGroupCount[];
  /** Đủ điều kiện hiện nút xuất PDF chưa. */
  ready: boolean;
  /** Vì sao chưa xuất được — hiện thẳng lên tooltip/toast cho người dùng. */
  reason: string | null;
};

/** Dòng của cương vị trong kỳ, kèm chữ ký — dùng chung cho cả đếm và dựng PDF. */
export async function loadBookData(periodId: string, positionCode: string) {
  const where = { periodId, cuongViCode: positionCode };
  const [
    extinguishers,
    cabinets,
    hoseReels,
    valves,
    alarmButtons,
    lights,
    sigBcc,
    sigTcc,
    sigCvcc,
    sigVan,
    sigNnbc,
    sigDen,
  ] = await Promise.all([
    prisma.pcccExtinguisher.findMany({
      where,
      orderBy: [{ stt: "asc" }, { ma: "asc" }],
      select: { id: true, ma: true, chungLoai: true, dvt: true, sl: true, ngayKiemTra: true, tinhTrang: true, apSuat: true, nguoiKiemTra: true },
    }),
    prisma.pcccCabinet.findMany({
      where,
      orderBy: [{ stt: "asc" }, { ma: "asc" }],
      select: {
        id: true, ma: true, ten: true, dvt: true, sl: true, ngayKiemTra: true,
        tinhTrangTongThe: true, ghiChu: true, nguoiKiemTra: true,
        components: { orderBy: [{ groupOrder: 'asc' }, { statusOrder: 'asc' }] },
      },
    }),
    prisma.pcccHoseReel.findMany({
      where,
      orderBy: [{ stt: "asc" }, { ma: "asc" }],
      select: {
        id: true, ma: true, ten: true, ngayKiemTra: true,
        tinhTrangTongThe: true, ghiChu: true, nguoiKiemTra: true,
        components: { orderBy: [{ groupOrder: 'asc' }, { statusOrder: 'asc' }] },
      },
    }),
    prisma.pcccValve.findMany({
      where,
      orderBy: [{ stt: "asc" }, { rowKey: "asc" }],
      select: { id: true, maKks: true, tenVan: true, loaiVan: true, ngayKiemTra: true, tinhTrang: true, moTa: true, nguoiKiemTra: true },
    }),
    prisma.pcccAlarmButton.findMany({
      where,
      orderBy: [{ stt: "asc" }, { rowKey: "asc" }],
      select: {
        id: true, maKks: true, viTri: true, ngayKiemTra: true,
        tinhTrangTongThe: true, khac: true, nguoiKiemTra: true,
        components: { orderBy: [{ groupOrder: 'asc' }, { statusOrder: 'asc' }] },
      },
    }),
    prisma.pcccEmergencyLight.findMany({
      where,
      orderBy: [{ loai: "asc" }, { stt: "asc" }, { rowKey: "asc" }],
      select: { id: true, loai: true, maKks: true, tenKhuVuc: true, ngayKiemTra: true, tinhTrang: true, ketQuaTest: true, nguoiKiemTra: true },
    }),
    signaturesOf(periodId, "EXTINGUISHER"),
    signaturesOf(periodId, "CABINET"),
    signaturesOf(periodId, "HOSE_REEL"),
    signaturesOf(periodId, "VALVE"),
    signaturesOf(periodId, "ALARM_BUTTON"),
    signaturesOf(periodId, "EMERGENCY_LIGHT"),
  ]);

  /** Cột 7 ghi người ĐÃ KÝ, không phải ô `nguoiKiemTra` gõ tay — ký mới là bằng chứng. */
  const signer = (sig: Map<string, { signerName: string; signatureKey: string | null }>, id: string, fallback: string | null) => ({
    nguoiKiemTra: sig.get(id)?.signerName ?? fallback ?? "",
    signatureKey: sig.get(id)?.signatureKey ?? null,
  });

  const rows: BookRow[] = [
    ...extinguishers.map((r) => ({
      table: "BCC" as const,
      ma: r.ma,
      ten: r.chungLoai ?? "Bình chữa cháy",
      dvt: r.dvt ?? "Bình",
      sl: r.sl,
      ngayKiemTra: r.ngayKiemTra,
      tinhTrang: r.tinhTrang ?? "",
      danhGia: r.tinhTrang ?? "",
      ghiChu: noteOf(r.tinhTrang, r.apSuat),
      ...signer(sigBcc, r.id, r.nguoiKiemTra),
    })),
    ...cabinets.map((r) => ({
      table: "TCC" as const,
      ma: r.ma,
      ten: r.ten ?? "Tủ chữa cháy",
      dvt: r.dvt ?? "Tủ",
      sl: r.sl,
      ngayKiemTra: r.ngayKiemTra,
      tinhTrang: r.tinhTrangTongThe ?? "",
      danhGia: defectDetail(r.components),
      ghiChu: noteOf(r.tinhTrangTongThe, r.ghiChu),
      ...signer(sigTcc, r.id, r.nguoiKiemTra),
    })),
    ...hoseReels.map((r) => ({
      table: "CVCC" as const,
      ma: r.ma,
      ten: r.ten ?? "Cuộn vòi chữa cháy",
      dvt: "Cuộn",
      sl: 1,
      ngayKiemTra: r.ngayKiemTra,
      tinhTrang: r.tinhTrangTongThe ?? "",
      danhGia: defectDetail(r.components),
      ghiChu: noteOf(r.tinhTrangTongThe, r.ghiChu),
      ...signer(sigCvcc, r.id, r.nguoiKiemTra),
    })),
    ...valves.map((r) => ({
      table: "VAN" as const,
      ma: r.maKks,
      ten: r.tenVan || `Van ${r.loaiVan}`,
      dvt: "Van",
      sl: 1,
      ngayKiemTra: r.ngayKiemTra,
      tinhTrang: r.tinhTrang ?? "",
      danhGia: r.tinhTrang ?? "",
      ghiChu: noteOf(r.tinhTrang, r.moTa),
      ...signer(sigVan, r.id, r.nguoiKiemTra),
    })),
    ...alarmButtons.map((r) => ({
      table: "NNBC" as const,
      ma: r.maKks,
      // Nút nhấn không có cột "tên" riêng — lấy vị trí cụ thể làm tên phương tiện,
      // vì trên hiện trường người ta gọi nhau bằng vị trí chứ không bằng mã KKS.
      ten: r.viTri ? `Nút nhấn báo cháy — ${r.viTri}` : "Nút nhấn báo cháy",
      dvt: "Nút",
      sl: 1,
      ngayKiemTra: r.ngayKiemTra,
      tinhTrang: r.tinhTrangTongThe ?? "",
      danhGia: defectDetail(r.components),
      ghiChu: noteOf(r.tinhTrangTongThe, r.khac),
      ...signer(sigNnbc, r.id, r.nguoiKiemTra),
    })),
    ...lights.map((r) => ({
      table: "DEN" as const,
      ma: r.maKks,
      ten: `${r.loai === "EXIT" ? "Đèn EXIT" : "Đèn chiếu sáng sự cố"}${r.tenKhuVuc ? ` — ${r.tenKhuVuc}` : ""}`,
      dvt: "Bộ",
      sl: 1,
      ngayKiemTra: r.ngayKiemTra,
      tinhTrang: r.tinhTrang ?? "",
      danhGia: r.tinhTrang ?? "",
      ghiChu: noteOf(r.tinhTrang, r.ketQuaTest),
      ...signer(sigDen, r.id, r.nguoiKiemTra),
    })),
  ];

  const counted: Record<BookGroupKey, { rows: { id: string }[]; sig: Map<string, unknown> }> = {
    BCC: { rows: extinguishers, sig: sigBcc },
    TCC: { rows: cabinets, sig: sigTcc },
    CVCC: { rows: hoseReels, sig: sigCvcc },
    VAN: { rows: valves, sig: sigVan },
    NNBC: { rows: alarmButtons, sig: sigNnbc },
    DEN: { rows: lights, sig: sigDen },
  };
  const groups: BookGroupCount[] = BOOK_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    total: counted[g.key].rows.length,
    signed: counted[g.key].rows.filter((r) => counted[g.key].sig.has(r.id)).length,
  }));

  return { rows, groups };
}

/** Trạng thái để client quyết định có hiện nút hay không. */
export async function bookStatusOf(periodId: string, positionCode: string | null): Promise<BookStatus> {
  const empty = BOOK_GROUPS.map((g) => ({ key: g.key, label: g.label, total: 0, signed: 0 }));
  if (!positionCode) {
    return {
      positionCode: null,
      positionLabel: null,
      groups: empty,
      ready: false,
      reason: "Chọn một cương vị ở bộ lọc để xuất sổ theo dõi của cương vị đó",
    };
  }
  const { groups } = await loadBookData(periodId, positionCode);
  const label = positionLabelOf(positionCode);

  // Cương vị không có thiết bị nào thì không có sổ để in — nói thẳng, đừng hiện nút
  // rồi xuất ra một quyển sổ rỗng.
  if (groups.every((g) => g.total === 0)) {
    return {
      positionCode,
      positionLabel: label,
      groups,
      ready: false,
      reason: `Cương vị ${label} không có thiết bị PCCC nào trong kỳ này`,
    };
  }
  // Nhóm KHÔNG có thiết bị của cương vị này thì coi như xong nhóm đó (0/0), chứ không
  // chặn mãi: nhiều cương vị chỉ có bình, không có tủ.
  const missing = groups.filter((g) => g.total > g.signed);
  if (missing.length > 0) {
    return {
      positionCode,
      positionLabel: label,
      groups,
      ready: false,
      reason: `Còn ${missing.map((g) => `${g.total - g.signed} ${g.label}`).join(", ")} chưa ký xác nhận`,
    };
  }
  return { positionCode, positionLabel: label, groups, ready: true, reason: null };
}
