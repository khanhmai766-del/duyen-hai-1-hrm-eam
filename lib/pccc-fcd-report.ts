/**
 * BẢN IN BẢNG FOAM · CO2 · DIESEL · FM200 (tab FCD) — dữ liệu và điều kiện xuất.
 *
 * Khác hẳn "Sổ theo dõi Mẫu số 01" (lib/pccc-so-theo-doi.ts): đây KHÔNG in theo cương
 * vị. Bồn foam, chai CO2, bồn diesel và hai tủ FM200 là TÀI SẢN DÙNG CHUNG của cả phân
 * xưởng, nên bản in là MỘT bản duy nhất cho cả kỳ, in đúng hình cái bảng trên web.
 *
 * LUẬT MỞ NÚT (chốt với nghiệp vụ 2026-08-13) — phải thoả CẢ HAI:
 *   1. KÝ ĐỦ: 3 bồn mỗi bồn một chữ ký, mỗi bảng FM200 một chữ ký.
 *   2. ĐIỀN ĐỦ: bồn phải có ngày chốt, người chốt, ghi chú; bảng FM200 phải có đủ số
 *      đo Mức FM200 và Áp suất N2 cho TỪNG bình.
 * Thiếu một ô là bản in ra có ô trống — thứ không nộp được cho công tác PCCC.
 *
 * Điều kiện tính theo TỪNG KỲ nên sang tháng mới, kỳ mới chưa ai ký, nút tự biến mất.
 */
import { prisma } from "@/lib/prisma";
import { signaturesOf } from "@/lib/pccc-service";
import { PCCC_BOOK_PREFIX } from "@/lib/pccc-so-theo-doi";

/** `T08.2026` → `pccc/so-theo-doi/2026/T08.2026/FOAM-CO2-DIESEL-FM200.pdf`. */
export function fcdKeyOf(periodLabel: string) {
  const year = periodLabel.split(".")[1] ?? "0000";
  return `${PCCC_BOOK_PREFIX}/${year}/${periodLabel}/FOAM-CO2-DIESEL-FM200.pdf`;
}

export function fcdFileNameOf(periodLabel: string) {
  return `Foam-CO2-Diesel-FM200-${periodLabel}.pdf`;
}

export type FcdBulkRow = {
  stt: number | null;
  ten: string;
  cuongVi: string;
  dvt: string;
  khoiLuongThietKe: number | null;
  khoiLuongHienTai: number | null;
  phanTramConLai: number | null;
  tinhTrang: string;
  ngayChot: Date | null;
  nguoiChot: string;
  ghiChu: string;
  signerName: string;
  signatureKey: string | null;
};

export type FcdPanel = {
  title: string;
  binhLabels: string[];
  ngayKiemTra: Date | null;
  nguoiKiemTra: string;
  signerName: string;
  signatureKey: string | null;
  rows: {
    label: string;
    min: number | null;
    max: number | null;
    dvt: string;
    values: (number | null)[];
  }[];
};

export type FcdReport = { bulks: FcdBulkRow[]; panels: FcdPanel[] };

export type FcdStatus = {
  ready: boolean;
  /** Vì sao chưa xuất được — hiện thẳng cho người dùng. */
  reason: string | null;
  bulks: { total: number; signed: number; missingFields: number };
  panels: { total: number; signed: number; missingValues: number };
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function loadFcdReport(periodId: string): Promise<FcdReport> {
  const [bulks, panels, sigBulk, sigPanel] = await Promise.all([
    prisma.pcccBulk.findMany({ where: { periodId }, orderBy: [{ stt: "asc" }, { ten: "asc" }] }),
    prisma.pcccFm200Panel.findMany({ where: { periodId }, orderBy: { panelKey: "asc" } }),
    signaturesOf(periodId, "BULK"),
    signaturesOf(periodId, "FM200_PANEL"),
  ]);

  return {
    bulks: bulks.map((b) => ({
      stt: b.stt,
      ten: b.ten,
      cuongVi: b.cuongVi ?? "",
      dvt: b.dvt ?? "",
      khoiLuongThietKe: b.khoiLuongThietKe,
      khoiLuongHienTai: b.khoiLuongHienTai,
      phanTramConLai: b.phanTramConLai,
      tinhTrang: b.tinhTrang ?? "",
      ngayChot: b.ngayChot,
      // Cột "Người chốt" lấy TÊN NGƯỜI ĐÃ KÝ nếu có — ký mới là bằng chứng, ô gõ tay chỉ là dự phòng.
      nguoiChot: sigBulk.get(b.id)?.signerName ?? b.nguoiChot ?? "",
      ghiChu: b.ghiChu ?? "",
      signerName: sigBulk.get(b.id)?.signerName ?? "",
      signatureKey: sigBulk.get(b.id)?.signatureKey ?? null,
    })),
    panels: panels.map((p) => {
      const muc = (p.mucValues ?? {}) as Record<string, number | null>;
      const ap = (p.apValues ?? {}) as Record<string, number | null>;
      return {
        title: p.title,
        binhLabels: p.binhLabels,
        ngayKiemTra: p.ngayKiemTra,
        nguoiKiemTra: sigPanel.get(p.id)?.signerName ?? p.nguoiKiemTra ?? "",
        signerName: sigPanel.get(p.id)?.signerName ?? "",
        signatureKey: sigPanel.get(p.id)?.signatureKey ?? null,
        rows: [
          {
            label: "Mức FM 200",
            min: p.mucMin,
            max: p.mucMax,
            dvt: p.mucDvt ?? "",
            values: p.binhLabels.map((label) => num(muc[label])),
          },
          {
            label: "Áp suất N2",
            min: p.apMin,
            max: p.apMax,
            dvt: p.apDvt ?? "",
            values: p.binhLabels.map((label) => num(ap[label])),
          },
        ],
      };
    }),
  };
}

export async function fcdStatusOf(periodId: string): Promise<FcdStatus> {
  const { bulks, panels } = await loadFcdReport(periodId);

  const bulkSigned = bulks.filter((b) => b.signatureKey || b.signerName).length;
  // Ba ô bắt buộc của mỗi bồn. Ngày/người chốt do thao tác ký tự điền, còn ghi chú phải
  // gõ tay — nghiệp vụ yêu cầu bồn nào cũng phải có nhận xét khi chốt tháng.
  const bulkMissing = bulks.filter((b) => !b.ngayChot || !b.nguoiChot.trim() || !b.ghiChu.trim()).length;

  const panelSigned = panels.filter((p) => p.signatureKey || p.signerName).length;
  const panelMissing = panels.reduce(
    (n, p) => n + p.rows.reduce((m, row) => m + row.values.filter((v) => v === null).length, 0),
    0
  );

  const status: FcdStatus = {
    ready: false,
    reason: null,
    bulks: { total: bulks.length, signed: bulkSigned, missingFields: bulkMissing },
    panels: { total: panels.length, signed: panelSigned, missingValues: panelMissing },
  };

  if (bulks.length === 0 && panels.length === 0) {
    return { ...status, reason: "Kỳ này chưa có dữ liệu Foam · CO2 · Diesel · FM200" };
  }
  const missing: string[] = [];
  if (bulkSigned < bulks.length) missing.push(`${bulks.length - bulkSigned} bồn chưa ký`);
  if (panelSigned < panels.length) missing.push(`${panels.length - panelSigned} bảng FM200 chưa ký`);
  if (bulkMissing > 0) missing.push(`${bulkMissing} bồn thiếu ngày chốt / người chốt / ghi chú`);
  if (panelMissing > 0) missing.push(`${panelMissing} ô số đo FM200 còn trống`);
  if (missing.length > 0) return { ...status, reason: `Còn ${missing.join(" · ")}` };

  return { ...status, ready: true };
}
