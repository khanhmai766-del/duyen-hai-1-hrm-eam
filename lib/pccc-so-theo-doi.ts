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
import { toneOf } from "@/lib/pccc-status";
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

export type BookRow = {
  /** BCC hay TCC — chỉ dùng để gom nhóm, số thứ tự vẫn chạy liên tục xuyên hai bảng. */
  table: "BCC" | "TCC";
  ma: string;
  /** Cột "Tên phương tiện" = chủng loại (BCC) / tên tủ (TCC). */
  ten: string;
  dvt: string;
  sl: number | null;
  ngayKiemTra: Date | null;
  tinhTrang: string;
  /** Cột 8 "Ghi chú" của biểu mẫu — xem `noteOf`. Thiết bị còn tốt thì để trống. */
  ghiChu: string;
  nguoiKiemTra: string;
  signatureKey: string | null;
};

/**
 * Cột 8 "Ghi chú" của Mẫu số 01 — CHỈ ghi cho thiết bị KHÔNG còn khả dụng (bất khả dụng
 * / cần theo dõi). Sổ nộp cho công tác PCCC cần nói rõ thiết bị hỏng thì hỏng ở đâu;
 * còn thiết bị tốt mà cũng điền thì cột này đầy chữ vô ích, che mất mấy dòng đáng chú ý.
 *
 * Nguồn chữ khác nhau theo bảng, đúng như nghiệp vụ chốt 2026-08-13:
 *  - Bình chữa cháy → cột "Áp suất / KL" (hết áp, 2/4 mức đỏ, KL hao hụt…), vì đó chính
 *    là lý do bình bị đánh giá không khả dụng.
 *  - Tủ chữa cháy  → cột "Ghi chú" của bảng (mô tả linh kiện hỏng).
 *
 * Xét theo MÀU của tình trạng (`toneOf`) chứ không so chuỗi: danh mục tình trạng còn
 * đổi chữ, nhưng "ok / cần theo dõi / hỏng" thì đã có bảng tra dùng chung.
 */
function noteOf(tinhTrang: string | null, source: string | null): string {
  if (toneOf(tinhTrang) === "ok") return "";
  return source ?? "";
}

export type BookStatus = {
  positionCode: string | null;
  positionLabel: string | null;
  bcc: { total: number; signed: number };
  tcc: { total: number; signed: number };
  /** Đủ điều kiện hiện nút xuất PDF chưa. */
  ready: boolean;
  /** Vì sao chưa xuất được — hiện thẳng lên tooltip/toast cho người dùng. */
  reason: string | null;
};

/** Dòng của cương vị trong kỳ, kèm chữ ký — dùng chung cho cả đếm và dựng PDF. */
export async function loadBookData(periodId: string, positionCode: string) {
  const [extinguishers, cabinets, sigBcc, sigTcc] = await Promise.all([
    prisma.pcccExtinguisher.findMany({
      where: { periodId, cuongViCode: positionCode },
      orderBy: [{ stt: "asc" }, { ma: "asc" }],
      select: {
        id: true,
        ma: true,
        chungLoai: true,
        dvt: true,
        sl: true,
        ngayKiemTra: true,
        tinhTrang: true,
        apSuat: true,
        nguoiKiemTra: true,
      },
    }),
    prisma.pcccCabinet.findMany({
      where: { periodId, cuongViCode: positionCode },
      orderBy: [{ stt: "asc" }, { ma: "asc" }],
      select: {
        id: true,
        ma: true,
        ten: true,
        dvt: true,
        sl: true,
        ngayKiemTra: true,
        tinhTrangTongThe: true,
        ghiChu: true,
        nguoiKiemTra: true,
      },
    }),
    signaturesOf(periodId, "EXTINGUISHER"),
    signaturesOf(periodId, "CABINET"),
  ]);

  const rows: BookRow[] = [
    ...extinguishers.map((r) => ({
      table: "BCC" as const,
      ma: r.ma,
      ten: r.chungLoai ?? "Bình chữa cháy",
      dvt: r.dvt ?? "Bình",
      sl: r.sl,
      ngayKiemTra: r.ngayKiemTra,
      tinhTrang: r.tinhTrang ?? "",
      ghiChu: noteOf(r.tinhTrang, r.apSuat),
      // Cột 7 ghi người ĐÃ KÝ, không phải ô `nguoiKiemTra` gõ tay — ký mới là bằng chứng.
      nguoiKiemTra: sigBcc.get(r.id)?.signerName ?? r.nguoiKiemTra ?? "",
      signatureKey: sigBcc.get(r.id)?.signatureKey ?? null,
    })),
    ...cabinets.map((r) => ({
      table: "TCC" as const,
      ma: r.ma,
      ten: r.ten ?? "Tủ chữa cháy",
      dvt: r.dvt ?? "Tủ",
      sl: r.sl,
      ngayKiemTra: r.ngayKiemTra,
      tinhTrang: r.tinhTrangTongThe ?? "",
      ghiChu: noteOf(r.tinhTrangTongThe, r.ghiChu),
      nguoiKiemTra: sigTcc.get(r.id)?.signerName ?? r.nguoiKiemTra ?? "",
      signatureKey: sigTcc.get(r.id)?.signatureKey ?? null,
    })),
  ];

  const signedBcc = extinguishers.filter((r) => sigBcc.has(r.id)).length;
  const signedTcc = cabinets.filter((r) => sigTcc.has(r.id)).length;
  return {
    rows,
    counts: {
      bcc: { total: extinguishers.length, signed: signedBcc },
      tcc: { total: cabinets.length, signed: signedTcc },
    },
  };
}

/** Trạng thái để client quyết định có hiện nút hay không. */
export async function bookStatusOf(periodId: string, positionCode: string | null): Promise<BookStatus> {
  if (!positionCode) {
    return {
      positionCode: null,
      positionLabel: null,
      bcc: { total: 0, signed: 0 },
      tcc: { total: 0, signed: 0 },
      ready: false,
      reason: "Chọn một cương vị ở bộ lọc để xuất sổ theo dõi của cương vị đó",
    };
  }
  const { counts } = await loadBookData(periodId, positionCode);
  const label = positionLabelOf(positionCode);
  const missingBcc = counts.bcc.total - counts.bcc.signed;
  const missingTcc = counts.tcc.total - counts.tcc.signed;

  // Cương vị không có thiết bị nào thì không có sổ để in — nói thẳng, đừng hiện nút
  // rồi xuất ra một quyển sổ rỗng.
  if (counts.bcc.total === 0 && counts.tcc.total === 0) {
    return {
      positionCode,
      positionLabel: label,
      ...counts,
      ready: false,
      reason: `Cương vị ${label} không có thiết bị PCCC nào trong kỳ này`,
    };
  }
  // Bảng KHÔNG có thiết bị của cương vị này thì coi như xong bảng đó (0/0), chứ không
  // chặn mãi: nhiều cương vị chỉ có bình, không có tủ.
  if (missingBcc > 0 || missingTcc > 0) {
    const parts = [
      missingBcc > 0 ? `${missingBcc} bình chữa cháy` : null,
      missingTcc > 0 ? `${missingTcc} tủ chữa cháy` : null,
    ].filter(Boolean);
    return {
      positionCode,
      positionLabel: label,
      ...counts,
      ready: false,
      reason: `Còn ${parts.join(" và ")} chưa ký xác nhận`,
    };
  }
  return { positionCode, positionLabel: label, ...counts, ready: true, reason: null };
}
