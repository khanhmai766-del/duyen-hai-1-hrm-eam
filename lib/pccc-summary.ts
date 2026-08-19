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
  LIGHT_KHONG_CO_DEN,
  VALVE_TINH_TRANG_OPTIONS,
  componentLevelOf,
  cabinetComponentsForTcc,
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
  /** Cần cho phần RON: gom cuộn vòi theo tủ cha. Bỏ trống thì tủ đó coi như chưa có cuộn. */
  id?: string;
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

/**
 * `hoseReels` cần cho phần RON: từ 2026-08-18 ron lăng phun đọc ở bảng cuộn vòi chứ
 * không còn ở bảng tủ (xem summarizeRon). Để mặc định rỗng nên nơi gọi nào chỉ cần số
 * liệu tủ vẫn gọi được như cũ — khi đó phần ron lăng phun ra 0.
 */
export function summarizeCabinets(input: CabinetRow[], hoseReels: HoseReelRonRow[] = []) {
  // Bỏ hai nhóm đã chuyển hẳn xuống bảng cuộn vòi — xem TCC_ABSORBED_GROUPS.
  const cabinets = input.map((c) => ({ ...c, components: cabinetComponentsForTcc(c.components) }));
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

  return { rows, total, ron: summarizeRon(cabinets, hoseReels) };
}

// -------------------------------------------------------------------- Ron
/**
 * RON CHỮA CHÁY — hai dòng "Ron chữa cháy DN50/DN65" của sheet TỔNG QUAN.
 *
 * ĐẾM THEO TỦ: mỗi tủ đúng 3 ron — lăng phun 2, ngàm 1. Cuộn ống KHÔNG tính vào ron
 * (sheet có dòng riêng "Cuộn ống chữa cháy DN50/DN65"). DN50 ứng với tủ INDOOR, DN65
 * ứng với tủ OUTDOOR. Công thức này tái tạo ĐÚNG số của sheet gốc: INDOOR 619 khả dụng
 * / 4 thiếu, OUTDOOR 106 / 4.
 *
 * NGUỒN ĐỌC ĐÃ ĐỔI (2026-08-18) nhưng CÁCH ĐẾM THÌ KHÔNG: lăng phun chuyển hẳn xuống
 * bảng cuộn vòi nên phải đọc từ đó, còn ngàm vẫn ở bảng tủ. Tủ ngoài trời có hai cuộn
 * vòi, nhưng vẫn chỉ tính 2 ron lăng phun CHO CẢ TỦ chứ không nhân đôi — nghiệp vụ chốt
 * 2026-08-19 là giữ nguyên cách đếm theo tủ của sheet gốc.
 *
 * Gộp trạng thái nhiều cuộn của cùng một tủ bằng phép HOẶC: tủ có bất kỳ cuộn nào tích
 * "Thiếu ron" thì tính là tủ thiếu ron. Lúc sinh dữ liệu các cuộn của cùng một tủ mang
 * y hệt trạng thái chép từ tủ cha, nên phép này tái tạo đúng số cũ; về sau người dùng
 * sửa từng cuộn lệch nhau thì "có một chỗ thiếu là tủ thiếu" vẫn là cách đọc đúng.
 */
export type RonSummaryRow = {
  loaiRon: "DN50" | "DN65";
  loaiTu: CabinetKind;
  soTu: number;
  /** Số vị trí ron phải có = 3 × số tủ (lăng phun 2 + ngàm 1). */
  tongRon: number;
  /** Ron ở tủ có tích "Khả dụng" — khớp cột "BÌNH THƯỜNG" của sheet. */
  dayDu: number;
  /** Ron ở tủ có tích "Thiếu ron" — khớp cột "HƯ HỎNG 1 PHẦN" của sheet. */
  thieuRon: number;
  /** Chi tiết theo nhóm linh kiện (đã nhân trọng số), để soi nhanh chỗ nào hụt. */
  thieuRonTheoNhom: Record<string, number>;
};

/** Cuộn vòi kèm khoá tủ cha — cần để gộp các cuộn của cùng một tủ lại. */
export type HoseReelRonRow = {
  cabinetId: string;
  components: CabinetComponentRow[];
};

export function summarizeRon(cabinets: CabinetRow[], hoseReels: HoseReelRonRow[]): RonSummaryRow[] {
  const spec: { loaiRon: "DN50" | "DN65"; loaiTu: CabinetKind }[] = [
    { loaiRon: "DN50", loaiTu: "INDOOR" },
    { loaiRon: "DN65", loaiTu: "OUTDOOR" },
  ];
  const ticked = (components: CabinetComponentRow[], groupLabel: string, status: string) =>
    components.some((c) => c.checked && c.groupLabel === groupLabel && c.status === status);

  // Gom cuộn vòi theo tủ cha để tính trạng thái lăng phun Ở CẤP TỦ.
  const reelsByCabinet = new Map<string, CabinetComponentRow[][]>();
  for (const r of hoseReels) {
    reelsByCabinet.set(r.cabinetId, [...(reelsByCabinet.get(r.cabinetId) ?? []), r.components]);
  }

  return spec.map(({ loaiRon, loaiTu }) => {
    const list = cabinets.filter((c) => cabinetKind(c.ten) === loaiTu);
    const thieuRonTheoNhom: Record<string, number> = { "LĂNG PHUN": 0, "NGÀM": 0 };
    let dayDu = 0;

    for (const cab of list) {
      // NGÀM — vẫn nằm ở bảng tủ.
      const wNgam = RON_WEIGHTS["NGÀM"];
      if (ticked(cab.components, "NGÀM", RON_STATUS_OK)) dayDu += wNgam;
      if (ticked(cab.components, "NGÀM", RON_STATUS_MISSING)) thieuRonTheoNhom["NGÀM"] += wNgam;

      // LĂNG PHUN — đọc ở bảng cuộn vòi, gộp các cuộn của tủ này bằng phép HOẶC.
      const reels = reelsByCabinet.get(cab.id ?? "") ?? [];
      const wLang = RON_WEIGHTS["LĂNG PHUN"];
      if (reels.some((c) => ticked(c, "LĂNG PHUN", RON_STATUS_OK))) dayDu += wLang;
      if (reels.some((c) => ticked(c, "LĂNG PHUN", RON_STATUS_MISSING))) thieuRonTheoNhom["LĂNG PHUN"] += wLang;
    }

    return {
      loaiRon,
      loaiTu,
      soTu: list.length,
      tongRon: list.length * RON_PER_CABINET,
      dayDu,
      thieuRon: thieuRonTheoNhom["LĂNG PHUN"] + thieuRonTheoNhom["NGÀM"],
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

// ===========================================================================
// BỐN NHÓM THIẾT BỊ ĐỢT 2 — số liệu cho tab Tổng quan
//
// Hai kiểu tổng hợp, bám đúng hai kiểu dữ liệu:
//   - Bảng có ô tích (nút nhấn, cuộn vòi): đếm ô ĐÃ TÍCH theo ba mức nặng/nhẹ như
//     tủ chữa cháy, cộng thêm phân bố tình trạng tổng thể.
//   - Bảng một ô tình trạng (van, đèn): chỉ đếm phân bố tình trạng, tách theo loại.
//
// Cố ý KHÔNG gộp tất cả vào một hàm chung: mỗi bảng có vốn từ tình trạng riêng, gộp
// lại thì bảng nào cũng phải mang theo một bộ nhãn không phải của nó.
// ===========================================================================

export type ComponentBreakdownRow = {
  groupLabel: string;
  binhThuong: number;
  huHong1Phan: number;
  huHongHoanToan: number;
};

/** Đếm ô ĐÃ TÍCH theo ba mức, gom theo nhóm linh kiện. Dùng chung cho NNBC và CVCC. */
function breakdownByGroup(rows: { components: CabinetComponentRow[] }[]): ComponentBreakdownRow[] {
  const statusCount = new Map<string, number>();
  const groupOrder = new Map<string, number>();
  for (const r of rows) {
    for (const c of r.components) {
      statusCount.set(c.groupLabel, Math.max(statusCount.get(c.groupLabel) ?? 0, c.statusOrder + 1));
      groupOrder.set(c.groupLabel, c.groupOrder);
    }
  }
  const acc = new Map<string, ComponentBreakdownRow>();
  for (const r of rows) {
    for (const c of r.components) {
      if (!c.checked) continue;
      const cur = acc.get(c.groupLabel) ?? { groupLabel: c.groupLabel, binhThuong: 0, huHong1Phan: 0, huHongHoanToan: 0 };
      const level = componentLevelOf(c.statusOrder, statusCount.get(c.groupLabel) ?? 1);
      if (level === "binhThuong") cur.binhThuong += 1;
      else if (level === "huHong1Phan") cur.huHong1Phan += 1;
      else cur.huHongHoanToan += 1;
      acc.set(c.groupLabel, cur);
    }
  }
  return [...acc.values()].sort((a, b) => (groupOrder.get(a.groupLabel) ?? 0) - (groupOrder.get(b.groupLabel) ?? 0));
}

export type AlarmButtonSummary = {
  tongSo: number;
  khaDung: number;
  canTheoDoi: number;
  batKhaDung: number;
  theoNhom: ComponentBreakdownRow[];
};

export function summarizeAlarmButtons(
  rows: { tinhTrangTongThe: string | null; components: CabinetComponentRow[] }[]
): AlarmButtonSummary {
  return {
    tongSo: rows.length,
    khaDung: rows.filter((r) => r.tinhTrangTongThe === TINH_TRANG.OK).length,
    canTheoDoi: rows.filter((r) => r.tinhTrangTongThe === TINH_TRANG.WATCH).length,
    batKhaDung: rows.filter((r) => r.tinhTrangTongThe === TINH_TRANG.BAD).length,
    theoNhom: breakdownByGroup(rows),
  };
}

export type HoseReelSummary = {
  tongSo: number;
  dat: number;
  khongDat: number;
  theoNhom: ComponentBreakdownRow[];
};

export function summarizeHoseReels(
  rows: { tinhTrangTongThe: string | null; components: CabinetComponentRow[] }[]
): HoseReelSummary {
  return {
    tongSo: rows.length,
    dat: rows.filter((r) => r.tinhTrangTongThe === "Đạt").length,
    khongDat: rows.filter((r) => r.tinhTrangTongThe === "Không đạt").length,
    theoNhom: breakdownByGroup(rows),
  };
}

export type ValveSummaryRow = {
  loaiVan: string;
  tongSo: number;
  khaDung: number;
  suyGiam: number;
  khongKhaDung: number;
  chuaCapNhat: number;
};

/**
 * Van: tách theo loại (Deluge / Alarm) vì hai loại làm hai việc khác nhau, gộp lại thì
 * không biết hỏng nằm ở nhánh nào.
 */
export function summarizeValves(rows: { loaiVan: string; tinhTrang: string | null }[]) {
  const [khaDung, suyGiam, khongKhaDung] = VALVE_TINH_TRANG_OPTIONS;
  const acc = new Map<string, ValveSummaryRow>();
  for (const r of rows) {
    const cur =
      acc.get(r.loaiVan) ?? { loaiVan: r.loaiVan, tongSo: 0, khaDung: 0, suyGiam: 0, khongKhaDung: 0, chuaCapNhat: 0 };
    cur.tongSo += 1;
    if (r.tinhTrang === khaDung) cur.khaDung += 1;
    else if (r.tinhTrang === suyGiam) cur.suyGiam += 1;
    else if (r.tinhTrang === khongKhaDung) cur.khongKhaDung += 1;
    else cur.chuaCapNhat += 1;
    acc.set(r.loaiVan, cur);
  }
  const rowsOut = [...acc.values()].sort((a, b) => a.loaiVan.localeCompare(b.loaiVan));
  const total = rowsOut.reduce<ValveSummaryRow>(
    (t, r) => ({
      loaiVan: "TỔNG CỘNG",
      tongSo: t.tongSo + r.tongSo,
      khaDung: t.khaDung + r.khaDung,
      suyGiam: t.suyGiam + r.suyGiam,
      khongKhaDung: t.khongKhaDung + r.khongKhaDung,
      chuaCapNhat: t.chuaCapNhat + r.chuaCapNhat,
    }),
    { loaiVan: "TỔNG CỘNG", tongSo: 0, khaDung: 0, suyGiam: 0, khongKhaDung: 0, chuaCapNhat: 0 }
  );
  return { rows: rowsOut, total };
}

export type LightSummaryRow = {
  loai: string;
  tongSo: number;
  dat: number;
  khongDat: number;
  khongCoDen: number;
  chuaCapNhat: number;
};

/**
 * Đèn: "Không có đèn" đếm thành CỘT RIÊNG, không nhập vào "Không đạt" — đó là ghi nhận
 * vị trí thực tế không lắp đèn, gộp vào lỗi sẽ thổi phồng tỉ lệ hỏng của cả phân xưởng.
 */
export function summarizeEmergencyLights(rows: { loai: string; tinhTrang: string | null }[]) {
  const acc = new Map<string, LightSummaryRow>();
  for (const r of rows) {
    const cur = acc.get(r.loai) ?? { loai: r.loai, tongSo: 0, dat: 0, khongDat: 0, khongCoDen: 0, chuaCapNhat: 0 };
    cur.tongSo += 1;
    if (r.tinhTrang === "Đạt") cur.dat += 1;
    else if (r.tinhTrang === "Không đạt") cur.khongDat += 1;
    else if (r.tinhTrang === LIGHT_KHONG_CO_DEN) cur.khongCoDen += 1;
    else cur.chuaCapNhat += 1;
    acc.set(r.loai, cur);
  }
  // EXIT trước, CSSC sau — đúng thứ tự hai tab và thứ tự trong mẫu báo cáo Bảng II.
  const order = ["EXIT", "CSSC"];
  return [...acc.values()].sort((a, b) => order.indexOf(a.loai) - order.indexOf(b.loai));
}
