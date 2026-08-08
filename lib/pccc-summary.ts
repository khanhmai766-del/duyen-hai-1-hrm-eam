/**
 * Tổng hợp số liệu bảng "TỔNG QUAN" của module PCCC.
 *
 * Hàm THUẦN (không chạm Prisma) để API, script đối chiếu và test dùng chung.
 *
 * NGUYÊN TẮC: mọi con số ở đây được TÍNH TỪ DỮ LIỆU CHI TIẾT, không nhập tay.
 * Sheet TỔNG QUAN của file gốc chỉ có `=SUM()` và `=C/B` (các ô còn lại là số gõ
 * tay), nhưng công thức ở đây tái tạo lại được gần hết — kể cả hai dòng ron. Chỗ
 * duy nhất còn lệch là "Quá hạn thay thế" của bình MFZ, xem docs/pccc.md mục 3c.
 */

import {
  CHUNG_LOAI_OPTIONS,
  RON_PER_CABINET,
  RON_STATUS_MISSING,
  RON_STATUS_OK,
  RON_WEIGHTS,
  componentLevelOf,
} from "@/lib/pccc-status";

// ---------------------------------------------------------------- kiểu dữ liệu
export type ExtinguisherRow = {
  chungLoai: string | null;
  tinhTrang: string | null;
  tinhTrangNgoai: string | null;
  denHanThayThe: Date | null;
};

export type CabinetComponentRow = {
  groupLabel: string;
  status: string;
  checked: boolean;
  groupOrder: number;
  statusOrder: number;
};

export type CabinetRow = {
  ten: string | null; // chứa "(INDOOR)" hoặc "(OUTDOOR)"
  components: CabinetComponentRow[];
};

export type BulkRow = {
  ten: string;
  phanTramConLai: number | null;
};

export type Fm200PanelRow = {
  panelKey: string;
  binhLabels: string[];
  mucMin: number | null;
  mucMax: number | null;
  mucValues: Record<string, number | null>;
  apMin: number | null;
  apMax: number | null;
  apValues: Record<string, number | null>;
};

// ------------------------------------------------------------------ hằng số
/** Nhãn tình trạng tổng thể dùng chung cho BCC và TCC. */
export const TINH_TRANG = {
  OK: "Khả dụng",
  WATCH: "Cần theo dõi",
  BAD: "Bất khả dụng",
} as const;

/** Ngưỡng % còn lại của FOAM/CO2/DIESEL — theo công thức ô I5 của sheet nguồn. */
export const FCD_THRESHOLDS = { ok: 0.9, watch: 0.7 } as const;

/**
 * Ngưỡng % của FM200. CHƯA có sheet nguồn để đối chiếu (bảng FM200 không còn
 * trong file Excel hiện tại) — tạm giữ 75/50 như bản web demo, cần nghiệp vụ chốt.
 */
export const FM200_THRESHOLDS = { ok: 0.75, watch: 0.5 } as const;

/** "Sắp đến hạn" = còn trong vòng N ngày. Đổi 1 chỗ nếu nghiệp vụ chốt khác. */
export const SAP_DEN_HAN_DAYS = 90;

// -------------------------------------------------------------------- BCC
export type ExtinguisherSummaryRow = {
  chungLoai: string;
  tongSo: number;
  khaDung: number;
  canTheoDoi: number;
  batKhaDung: number;
  quaHanThayThe: number;
  sapDenHan: number;
  giSetThanBinh: number;
  giSetTayNam: number;
  phanTramKhaDung: number;
};

/**
 * Gỉ sét đếm theo CHUỖI CON của "Tình trạng bên ngoài": giá trị thực tế có dạng
 * ghép "Gỉ sét thân bình + Gỉ sét tay nắm" nên một bình có thể tính vào cả hai
 * cột. Đã đối chiếu đúng với sheet T08.2026: thân bình 7 + 36 = 43, tay nắm
 * 103 + 36 = 139.
 */
function countGiSet(rows: ExtinguisherRow[], keyword: string) {
  return rows.filter((r) => (r.tinhTrangNgoai ?? "").includes(keyword)).length;
}

/**
 * "Quá hạn thay thế" = `denHanThayThe` (dẫn xuất: ngày SX + số năm sử dụng) đã
 * TRƯỚC mốc kết thúc kỳ. Bình không có ngày SX → không có hạn → không tính.
 *
 * LƯU Ý: sheet TỔNG QUAN ghi MFZ 117 trong khi công thức này ra 110 (CO2 91 và
 * Foam 0 thì khớp mọi mốc ngày). Số 117 của sheet không tái tạo được bằng bất kỳ mốc
 * nào — bảng Tổng quan mới lệch với sheet cũ đúng ở chỗ này, có chủ đích.
 */
function isOverdue(r: ExtinguisherRow, periodEnd: Date) {
  return r.denHanThayThe !== null && r.denHanThayThe.getTime() < periodEnd.getTime();
}

function isDueSoon(r: ExtinguisherRow, periodEnd: Date) {
  if (r.denHanThayThe === null || isOverdue(r, periodEnd)) return false;
  const limit = new Date(periodEnd.getTime());
  limit.setUTCDate(limit.getUTCDate() + SAP_DEN_HAN_DAYS);
  return r.denHanThayThe.getTime() < limit.getTime();
}

function summarizeExtinguisherGroup(chungLoai: string, rows: ExtinguisherRow[], periodEnd: Date): ExtinguisherSummaryRow {
  const khaDung = rows.filter((r) => r.tinhTrang === TINH_TRANG.OK).length;
  return {
    chungLoai,
    tongSo: rows.length,
    khaDung,
    canTheoDoi: rows.filter((r) => r.tinhTrang === TINH_TRANG.WATCH).length,
    batKhaDung: rows.filter((r) => r.tinhTrang === TINH_TRANG.BAD).length,
    quaHanThayThe: rows.filter((r) => isOverdue(r, periodEnd)).length,
    sapDenHan: rows.filter((r) => isDueSoon(r, periodEnd)).length,
    giSetThanBinh: countGiSet(rows, "Gỉ sét thân bình"),
    giSetTayNam: countGiSet(rows, "Gỉ sét tay nắm"),
    phanTramKhaDung: rows.length === 0 ? 0 : khaDung / rows.length,
  };
}

/** Thứ tự dòng giữ đúng sheet TỔNG QUAN. Chủng loại lạ được thêm vào cuối. */
const BCC_ORDER: string[] = [...CHUNG_LOAI_OPTIONS];

export function summarizeExtinguishers(rows: ExtinguisherRow[], periodEnd: Date) {
  const groups = new Map<string, ExtinguisherRow[]>();
  for (const r of rows) {
    const key = r.chungLoai ?? "(không rõ chủng loại)";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const ordered = [
    ...BCC_ORDER.filter((k) => groups.has(k)),
    ...[...groups.keys()].filter((k) => !BCC_ORDER.includes(k)).sort(),
  ];
  return {
    rows: ordered.map((k) => summarizeExtinguisherGroup(k, groups.get(k)!, periodEnd)),
    total: summarizeExtinguisherGroup("TỔNG CỘNG", rows, periodEnd),
  };
}

// -------------------------------------------------------------------- TCC
export type CabinetKind = "INDOOR" | "OUTDOOR";

export type CabinetSummaryRow = {
  groupLabel: string;
  loaiTu: CabinetKind;
  binhThuong: number;
  huHong1Phan: number;
  huHongHoanToan: number;
};

export function cabinetKind(ten: string | null): CabinetKind {
  return /INDOOR/i.test(ten ?? "") ? "INDOOR" : "OUTDOOR";
}

export function summarizeCabinets(cabinets: CabinetRow[]) {
  // số trạng thái của mỗi nhóm (để biết cột nào là cột cuối)
  const statusCount = new Map<string, number>();
  for (const cab of cabinets) {
    for (const c of cab.components) {
      statusCount.set(c.groupLabel, Math.max(statusCount.get(c.groupLabel) ?? 0, c.statusOrder + 1));
    }
  }
  const groupOrder = new Map<string, number>();
  for (const cab of cabinets) for (const c of cab.components) groupOrder.set(c.groupLabel, c.groupOrder);

  const acc = new Map<string, CabinetSummaryRow>();
  const keyOf = (g: string, k: CabinetKind) => `${g}|${k}`;
  for (const cab of cabinets) {
    const kind = cabinetKind(cab.ten);
    for (const c of cab.components) {
      if (!c.checked) continue;
      const key = keyOf(c.groupLabel, kind);
      const row =
        acc.get(key) ?? { groupLabel: c.groupLabel, loaiTu: kind, binhThuong: 0, huHong1Phan: 0, huHongHoanToan: 0 };
      row[componentLevelOf(c.statusOrder, statusCount.get(c.groupLabel) ?? 1)]++;
      acc.set(key, row);
    }
  }

  const rows = [...acc.values()].sort(
    (a, b) =>
      (groupOrder.get(a.groupLabel) ?? 0) - (groupOrder.get(b.groupLabel) ?? 0) ||
      (a.loaiTu === "INDOOR" ? -1 : 1) - (b.loaiTu === "INDOOR" ? -1 : 1)
  );
  const total = rows.reduce(
    (t, r) => ({
      binhThuong: t.binhThuong + r.binhThuong,
      huHong1Phan: t.huHong1Phan + r.huHong1Phan,
      huHongHoanToan: t.huHongHoanToan + r.huHongHoanToan,
    }),
    { binhThuong: 0, huHong1Phan: 0, huHongHoanToan: 0 }
  );

  return { rows, total, ron: summarizeRon(cabinets) };
}

// -------------------------------------------------------------------- Ron
/**
 * RON CHỮA CHÁY — hai dòng "Ron chữa cháy DN50/DN65" của sheet TỔNG QUAN.
 *
 * Mỗi tủ có 3 ron, phân bổ theo đúng `ronCount()` của bản web demo:
 * **lăng phun 2 ron, ngàm 1 ron**; cuộn ống KHÔNG tính vào ron (sheet có dòng riêng
 * "Cuộn ống chữa cháy DN50/DN65"). `DN50 ↔ tủ INDOOR`, `DN65 ↔ tủ OUTDOOR`.
 *
 * Công thức này tái tạo ĐÚNG số của sheet: INDOOR 619 khả dụng / 4 thiếu,
 * OUTDOOR 106 / 4 — nên hai dòng đó KHÔNG phải số nhập tay như từng kết luận.
 */
export type RonSummaryRow = {
  loaiRon: "DN50" | "DN65";
  loaiTu: CabinetKind;
  soTu: number;
  /** Số vị trí ron phải có = 3 × số tủ (lăng phun 2 + ngàm 1). */
  tongRon: number;
  /** Ron ở tủ có linh kiện "Khả dụng" — khớp cột "BÌNH THƯỜNG" của sheet. */
  dayDu: number;
  /** Ron ở tủ có tích "Thiếu ron" — khớp cột "HƯ HỎNG 1 PHẦN" của sheet. */
  thieuRon: number;
  /** Chi tiết theo nhóm linh kiện (đã nhân trọng số), để soi nhanh chỗ nào hụt. */
  thieuRonTheoNhom: Record<string, number>;
};

export function summarizeRon(cabinets: CabinetRow[]): RonSummaryRow[] {
  const spec: { loaiRon: "DN50" | "DN65"; loaiTu: CabinetKind }[] = [
    { loaiRon: "DN50", loaiTu: "INDOOR" },
    { loaiRon: "DN65", loaiTu: "OUTDOOR" },
  ];
  const groups = Object.keys(RON_WEIGHTS);

  return spec.map(({ loaiRon, loaiTu }) => {
    const list = cabinets.filter((c) => cabinetKind(c.ten) === loaiTu);
    const ticked = (cab: CabinetRow, groupLabel: string, status: string) =>
      cab.components.some((c) => c.checked && c.groupLabel === groupLabel && c.status === status);

    let dayDu = 0;
    const thieuRonTheoNhom: Record<string, number> = Object.fromEntries(groups.map((g) => [g, 0]));
    for (const cab of list) {
      for (const g of groups) {
        const w = RON_WEIGHTS[g];
        if (ticked(cab, g, RON_STATUS_OK)) dayDu += w;
        if (ticked(cab, g, RON_STATUS_MISSING)) thieuRonTheoNhom[g] += w;
      }
    }
    const thieuRon = Object.values(thieuRonTheoNhom).reduce((a, b) => a + b, 0);
    return {
      loaiRon,
      loaiTu,
      soTu: list.length,
      tongRon: list.length * RON_PER_CABINET,
      dayDu,
      thieuRon,
      thieuRonTheoNhom,
    };
  });
}

// ------------------------------------------------------------- FCD & FM200
export function fcdStatus(pct: number | null): string {
  if (pct === null) return "Chưa cập nhật";
  if (pct >= FCD_THRESHOLDS.ok) return "Đủ mức";
  if (pct >= FCD_THRESHOLDS.watch) return "Cần theo dõi";
  return "Cần bổ sung gấp";
}

/** % theo dải đo: (giá trị − min) / (max − min). */
export function fm200Percent(value: number | null, min: number | null, max: number | null) {
  if (value === null || min === null || max === null || max === min) return null;
  return (value - min) / (max - min);
}

export function fm200Status(pct: number | null): string {
  if (pct === null) return "Chưa cập nhật";
  if (pct >= FM200_THRESHOLDS.ok) return "Đủ mức";
  if (pct >= FM200_THRESHOLDS.watch) return "Cần theo dõi";
  return "Cần bổ sung gấp";
}

export function summarizeBulks(rows: BulkRow[]) {
  return rows.map((r) => ({ ...r, tinhTrang: fcdStatus(r.phanTramConLai) }));
}

export function summarizeFm200(panels: Fm200PanelRow[]) {
  return panels.map((p) => ({
    panelKey: p.panelKey,
    binh: p.binhLabels.map((label) => {
      const mucPct = fm200Percent(p.mucValues?.[label] ?? null, p.mucMin, p.mucMax);
      const apPct = fm200Percent(p.apValues?.[label] ?? null, p.apMin, p.apMax);
      return {
        label,
        muc: { value: p.mucValues?.[label] ?? null, phanTram: mucPct, tinhTrang: fm200Status(mucPct) },
        ap: { value: p.apValues?.[label] ?? null, phanTram: apPct, tinhTrang: fm200Status(apPct) },
      };
    }),
  }));
}

/** Ngày cuối của kỳ (dùng làm mốc so hạn thay thế). label dạng "T08.2026". */
export function periodEndDate(label: string): Date {
  const m = label.match(/^T(\d{2})\.(\d{4})$/);
  if (!m) throw new Error(`Nhãn kỳ không hợp lệ: ${label}`);
  return new Date(Date.UTC(Number(m[2]), Number(m[1]), 0, 23, 59, 59));
}
