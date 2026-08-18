/**
 * Quy tắc TÌNH TRẠNG ↔ ÁP SUẤT của bảng Bình chữa cháy.
 *
 * Bê nguyên logic của bản web demo (`Web_Demo_PCCC/app.js`) — vốn mô phỏng đúng quy
 * tắc của file Excel gốc — nhưng đặt ở `lib/` để CẢ server và client dùng một bản:
 * client dùng để dựng danh sách chọn + tô màu, server dùng để CƯỠNG CHẾ khi ghi.
 * Không kiểm tra ở client là đủ: người dùng có thể gọi API trực tiếp.
 *
 * Ba quy tắc:
 *  1. Danh sách áp suất phụ thuộc CHỦNG LOẠI: bình CO2 đo theo khối lượng, MFZ/Foam
 *     đo theo vạch áp.
 *  2. Áp suất từ mức cảnh báo trở lên thì KHÔNG được chọn "Khả dụng" nữa — chỉ còn
 *     "Cần theo dõi" / "Bất khả dụng".
 *  3. Đổi áp suất thì tình trạng tự chỉnh theo: "Hết áp" → Bất khả dụng; mức cảnh
 *     báo → Cần theo dõi (giữ nguyên nếu đang là Bất khả dụng, vì nặng hơn).
 */

export const BCC_TINH_TRANG_OPTIONS = ["Khả dụng", "Cần theo dõi", "Bất khả dụng"] as const;

/**
 * Chủng loại bình — thứ tự giữ đúng sheet TỔNG QUAN.
 *
 * Nghiệp vụ chốt bỏ hậu tố "(bột)": file gốc ghi `Bình MFZ (bột)`, nay hiển thị và lưu
 * là `Bình MFZ`. `normalizeChungLoai()` được gọi cả lúc IMPORT và lúc SỬA để re-import
 * không mang lại cách viết cũ.
 */
export const CHUNG_LOAI_OPTIONS = ["Bình MFZ", "Bình CO2", "Bình Foam"] as const;

const CHUNG_LOAI_ALIASES: Record<string, string> = {
  "bình mfz (bột)": "Bình MFZ",
  "binh mfz (bot)": "Bình MFZ",
  "bình mfz(bột)": "Bình MFZ",
};

export function normalizeChungLoai(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return CHUNG_LOAI_ALIASES[value.toLowerCase().replace(/\s+/g, " ")] ?? value;
}

/** MFZ (bột) và Foam: đo theo vạch áp trên đồng hồ. */
export const AP_SUAT_OPTIONS_NORMAL = [
  "Đủ áp",
  "1/4 mức đỏ",
  "2/4 mức đỏ",
  "3/4 mức đỏ",
  "4/4 mức đỏ",
  "Hết áp",
] as const;

/** Bình CO2 không có đồng hồ áp — theo dõi bằng cân khối lượng. */
export const AP_SUAT_OPTIONS_CO2 = ["Đúng theo khối lượng", "KL hao hụt nhiều, cần nạp lại"] as const;

/** Mức cảnh báo (chưa phải mất hẳn khả năng chữa cháy). */
export const AP_SUAT_WARN_VALUES = [
  "1/4 mức đỏ",
  "2/4 mức đỏ",
  "3/4 mức đỏ",
  "4/4 mức đỏ",
  "KL hao hụt nhiều, cần nạp lại",
] as const;

/** Mức mất hẳn khả năng chữa cháy. */
export const AP_SUAT_CRITICAL = "Hết áp";

export const BCC_VI_TRI_HIEN_TAI_OPTIONS = [
  "Tại chỗ",
  "Trả phòng tập kết/chưa cấp phát",
  "Thất lạc/chưa cấp phát",
] as const;

export const BCC_TINH_TRANG_NGOAI_OPTIONS = [
  "Gỉ sét thân bình",
  "Gỉ sét tay nắm",
  "Gỉ sét thân bình + Gỉ sét tay nắm",
  "Hư hỏng bộ phận phun",
  "Hư hỏng khác",
] as const;

export function isCo2(chungLoai: string | null | undefined) {
  return (chungLoai ?? "").toUpperCase().includes("CO2");
}

/** Quy tắc 1 — danh sách áp suất theo chủng loại bình. */
export function apSuatOptions(chungLoai: string | null | undefined): readonly string[] {
  return isCo2(chungLoai) ? AP_SUAT_OPTIONS_CO2 : AP_SUAT_OPTIONS_NORMAL;
}

export function isApSuatWarn(apSuat: string | null | undefined) {
  return (AP_SUAT_WARN_VALUES as readonly string[]).includes(apSuat ?? "");
}

export function isApSuatCritical(apSuat: string | null | undefined) {
  return apSuat === AP_SUAT_CRITICAL;
}

/** Quy tắc 2 — áp suất cảnh báo/hết áp thì bỏ "Khả dụng" khỏi danh sách chọn. */
export function tinhTrangOptions(apSuat: string | null | undefined): readonly string[] {
  if (isApSuatCritical(apSuat) || isApSuatWarn(apSuat)) return ["Cần theo dõi", "Bất khả dụng"];
  return BCC_TINH_TRANG_OPTIONS;
}

/**
 * Quy tắc 3 — tình trạng hợp lệ ứng với một cặp (áp suất, tình trạng người chọn).
 * Dùng cho cả lúc người dùng đổi áp suất (tự nâng mức) và lúc người dùng đổi tình
 * trạng (chặn hạ xuống "Khả dụng" khi áp suất chưa hồi phục).
 */
export function resolveTinhTrang(apSuat: string | null | undefined, tinhTrang: string | null | undefined) {
  if (isApSuatCritical(apSuat)) return "Bất khả dụng";
  if (isApSuatWarn(apSuat)) return tinhTrang === "Bất khả dụng" ? "Bất khả dụng" : "Cần theo dõi";
  return tinhTrang ?? null;
}

/** Ba mức màu dùng chung cho cả nhãn tình trạng VÀ nhãn áp suất. */
export type PcccTone = "ok" | "watch" | "bad" | "none";

const TONE_BY_VALUE: Record<string, PcccTone> = {
  "Khả dụng": "ok",
  "Đủ mức": "ok",
  "Đủ áp": "ok",
  "Đúng theo khối lượng": "ok",
  "Cần theo dõi": "watch",
  "1/4 mức đỏ": "watch",
  "2/4 mức đỏ": "watch",
  "3/4 mức đỏ": "watch",
  "4/4 mức đỏ": "watch",
  "Bất khả dụng": "bad",
  "Cần bổ sung gấp": "bad",
  "Hết áp": "bad",
  "KL hao hụt nhiều, cần nạp lại": "bad",
};

export function toneOf(value: string | null | undefined): PcccTone {
  return TONE_BY_VALUE[value ?? ""] ?? "none";
}

// ===========================================================================
// TỦ CHỮA CHÁY — quy tắc ô ☑ và tình trạng tổng thể
// ===========================================================================

export type ComponentLevel = "binhThuong" | "huHong1Phan" | "huHongHoanToan";

/**
 * Mức của một ô ☑ suy ra từ VỊ TRÍ cột trong nhóm: cột đầu = bình thường, cột cuối =
 * hư hỏng hoàn toàn, các cột giữa = hư hỏng 1 phần. Đã đối chiếu đúng từng cột với
 * công thức ở cột ẩn `AN` của sheet TCC.
 */
export function componentLevelOf(statusOrder: number, statusCount: number): ComponentLevel {
  if (statusOrder === 0) return "binhThuong";
  if (statusOrder === statusCount - 1) return "huHongHoanToan";
  return "huHong1Phan";
}

export type TccComponent = { groupLabel: string; status: string; checked: boolean; statusOrder: number };

/** Số trạng thái của từng nhóm (để biết cột nào là cột cuối). */
export function statusCountByGroup(components: TccComponent[]) {
  const map = new Map<string, number>();
  for (const c of components) map.set(c.groupLabel, Math.max(map.get(c.groupLabel) ?? 0, c.statusOrder + 1));
  return map;
}

/** Tình trạng tổng thể của tủ — DẪN XUẤT, không cho sửa tay. */
export function deriveCabinetStatus(components: TccComponent[]): string {
  const counts = statusCountByGroup(components);
  let severe = false;
  let minor = false;
  let ok = false;
  for (const c of components) {
    if (!c.checked) continue;
    const level = componentLevelOf(c.statusOrder, counts.get(c.groupLabel) ?? 1);
    if (level === "huHongHoanToan") severe = true;
    else if (level === "huHong1Phan") minor = true;
    else ok = true;
  }
  if (severe) return "Bất khả dụng";
  if (minor) return "Cần theo dõi";
  if (ok) return "Khả dụng";
  return "Cần theo dõi";
}

/**
 * Bấm 1 ô ☑ của bảng TCC. CHO PHÉP tích nhiều khiếm khuyết cùng lúc trong một nhóm
 * (vd vừa "Thiếu ron" vừa "Gỉ sét") — quy tắc có chủ đích, đừng đổi thành chọn một.
 * CHỈ hai thái cực "Khả dụng" (cột đầu) và "Bất khả dụng" (cột cuối) là LOẠI TRỪ nhau:
 * tích ô này thì tự bỏ tích ô kia.
 *
 * Trả về danh sách ô cần ghi (gồm cả ô bị tự bỏ tích) để route ghi trong 1 lượt.
 */
export function applyTccToggle(
  components: TccComponent[],
  groupLabel: string,
  status: string,
  checked: boolean
): { groupLabel: string; status: string; checked: boolean }[] {
  const inGroup = components
    .filter((c) => c.groupLabel === groupLabel)
    .sort((a, b) => a.statusOrder - b.statusOrder);
  if (inGroup.length === 0) return [{ groupLabel, status, checked }];

  const okStatus = inGroup[0].status;
  const severeStatus = inGroup[inGroup.length - 1].status;
  const changes = [{ groupLabel, status, checked }];

  if (checked && okStatus !== severeStatus) {
    const opposite = status === okStatus ? severeStatus : status === severeStatus ? okStatus : null;
    if (opposite && inGroup.find((c) => c.status === opposite)?.checked) {
      changes.push({ groupLabel, status: opposite, checked: false });
    }
  }
  return changes;
}

/**
 * Dữ liệu cũ/nhập tay có thể tích CẢ HAI thái cực trong một nhóm. Ưu tiên giữ mức
 * NẶNG hơn ("Bất khả dụng"), bỏ tích "Khả dụng".
 */
export function tccPolarityViolations(components: TccComponent[]) {
  const out: { groupLabel: string; okStatus: string }[] = [];
  const byGroup = new Map<string, TccComponent[]>();
  for (const c of components) byGroup.set(c.groupLabel, [...(byGroup.get(c.groupLabel) ?? []), c]);
  for (const [groupLabel, list] of byGroup) {
    const sorted = [...list].sort((a, b) => a.statusOrder - b.statusOrder);
    if (sorted.length < 2) continue;
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first.checked && last.checked) out.push({ groupLabel, okStatus: first.status });
  }
  return out;
}

/**
 * RON CHỮA CHÁY — mỗi tủ có 3 ron, phân bổ theo bản demo (`ronCount()` trong app.js):
 * lăng phun 2 ron, ngàm 1 ron. Cuộn ống KHÔNG tính vào ron (nó là dòng riêng "Cuộn
 * ống chữa cháy DN50/DN65" trong sheet TỔNG QUAN).
 *
 * Công thức này tái tạo ĐÚNG hai dòng ron nhập tay của sheet: INDOOR 619 khả dụng /
 * 4 thiếu, OUTDOOR 106 / 4.
 */
export const RON_WEIGHTS: Record<string, number> = { "LĂNG PHUN": 2, "NGÀM": 1 };
// Số ron mỗi tủ KHÔNG còn là hằng số từ 2026-08-18: lăng phun đã chuyển xuống bảng
// cuộn vòi, mà tủ ngoài trời có hai cuộn — xem summarizeRon trong lib/pccc-summary.ts.
export const RON_STATUS_OK = "Khả dụng";
export const RON_STATUS_MISSING = "Thiếu ron";

/** Số ngày trước hạn thì tô vàng cột "Đến hạn thay thế" (bản demo dùng 30 ngày). */
export const HAN_THAY_THE_SOON_DAYS = 30;

export function hanThayTheTone(denHan: string | Date | null | undefined): PcccTone {
  if (!denHan) return "none";
  const d = denHan instanceof Date ? denHan : new Date(denHan);
  if (Number.isNaN(d.getTime())) return "none";
  const now = Date.now();
  if (d.getTime() < now) return "bad";
  if (d.getTime() <= now + HAN_THAY_THE_SOON_DAYS * 86_400_000) return "watch";
  return "none";
}

// ===========================================================================
// BỐN NHÓM THIẾT BỊ ĐỢT 2 — vốn từ tình trạng riêng của từng bảng
//
// Mỗi bảng có BỘ TỪ RIÊNG, cố ý không gộp: văn bản nghiệp vụ đặt tên khác nhau
// cho từng loại thiết bị, gộp lại thì báo cáo in ra sai chữ so với biểu mẫu.
//   - Van chữa cháy: 3 mức riêng (mức giữa là cả một câu dài, đúng nguyên văn).
//   - Đèn EXIT / chiếu sáng sự cố: Đạt / Không đạt / Không có đèn.
//   - Cuộn vòi: Đạt / Không đạt (TB 5100/TB-NĐDH ngày 14/8/2026).
//   - Nút nhấn báo cháy: DÙNG LẠI vốn từ 3 mức của tủ chữa cháy, vì tình trạng
//     tổng thể cũng suy ra từ ô tích theo đúng một quy tắc.
// ===========================================================================

export const VALVE_TINH_TRANG_OPTIONS = [
  "Khả dụng",
  "Có suy giảm chức năng nhưng vẫn sử dụng được khi có sự cố",
  "Không khả dụng",
] as const;

export const VALVE_LOAI_OPTIONS = ["DELUGE", "ALARM"] as const;

/** "Không có đèn" = vị trí thực tế không lắp đèn, KHÔNG phải lỗi thiết bị. */
export const LIGHT_KHONG_CO_DEN = "Không có đèn";
export const LIGHT_TINH_TRANG_OPTIONS = ["Đạt", "Không đạt", LIGHT_KHONG_CO_DEN] as const;

export const LIGHT_LOAI = { EXIT: "EXIT", CSSC: "CSSC" } as const;
export type PcccLightLoai = (typeof LIGHT_LOAI)[keyof typeof LIGHT_LOAI];

export const LIGHT_LOAI_LABEL: Record<PcccLightLoai, string> = {
  EXIT: "Đèn EXIT",
  CSSC: "Đèn chiếu sáng sự cố",
};

export function isPcccLightLoai(value: unknown): value is PcccLightLoai {
  return value === "EXIT" || value === "CSSC";
}

export const HOSE_REEL_TINH_TRANG_OPTIONS = ["Đạt", "Không đạt"] as const;

/**
 * Nhóm ô tích của bảng NNBC. Giữ đúng thứ tự cột nguồn — thứ tự QUYẾT ĐỊNH mức
 * nặng/nhẹ (xem componentLevelOf): cột đầu là bình thường, cột cuối là hỏng hẳn.
 */
export const ALARM_BUTTON_GROUPS = [
  { label: "TEST NÚT NHẤN", statuses: ["Bình thường", "Có tác động nhưng không reset được", "Không tác động"] },
  { label: "CHUÔNG", statuses: ["Có tác động", "Không tác động"] },
  { label: "ĐÈN", statuses: ["Có tác động", "Không tác động"] },
] as const;

/**
 * Nhóm ô tích của bảng CVCC. Nhãn lấy ĐÚNG NGUYÊN VĂN hai nhóm cùng tên của tủ
 * chữa cháy (đọc từ pccc_cabinet_components của dữ liệu thật) vì cuộn vòi được
 * sao trạng thái từ tủ cha — lệch một chữ là phần sao chép trượt hết.
 *
 * CHÚ Ý: bản demo tĩnh GỠ hai nhóm này khỏi bảng TCC sau khi tách CVCC. Ở đây cố
 * ý CHƯA gỡ: bảng TCC của app đang chạy thật, và khối "Ron chữa cháy" ở Tổng quan
 * đọc thẳng LĂNG PHUN + NGÀM (xem RON_WEIGHTS). Gỡ là một quyết định nghiệp vụ
 * riêng, làm sau khi đối chiếu số liệu.
 */
export const HOSE_REEL_GROUPS = [
  { label: "CUỘN ỐNG", statuses: ["Khả dụng", "Bị lủng, dùng tạm", "Thiếu ron", "Hư hỏng nặng, cần thay mới"] },
  { label: "LĂNG PHUN", statuses: ["Khả dụng", "Thiếu ron", "Bất khả dụng"] },
] as const;

/**
 * Nhãn HIỂN THỊ của ô đầu/ô cuối trong mỗi nhóm CVCC. KEY lưu trong DB vẫn là vốn
 * từ gốc của tủ chữa cháy vì dữ liệu được sao từ tủ cha — đổi key sẽ làm sai phần
 * sao chép. Chỉ đổi chữ trên header/tooltip, và CHỈ trong bảng CVCC ("Hư hỏng
 * nặng, cần thay mới" ở nhóm THÂN TỦ/CHÂN ĐẾ của TCC vẫn giữ nguyên chữ).
 */
export const HOSE_REEL_LABEL_DISPLAY: Record<string, string> = {
  "Khả dụng": "Đạt",
  "Bất khả dụng": "Không đạt",
  "Hư hỏng nặng, cần thay mới": "Không đạt",
};

export function hoseReelLabelDisplay(status: string): string {
  return HOSE_REEL_LABEL_DISPLAY[status] ?? status;
}

/**
 * Tình trạng tổng thể của một cuộn vòi — DẪN XUẤT, hai mức.
 *
 * KHÁC deriveCabinetStatus (tủ vẫn ba mức): theo TB 5100/TB-NĐDH ngày 14/8/2026
 * cuộn vòi chỉ còn Đạt / Không đạt. Có khiếm khuyết NẶNG (ô cuối của bất kỳ nhóm
 * nào) → "Không đạt"; còn lại — kể cả khiếm khuyết nhẹ, kể cả chưa tích ô nào —
 * → "Đạt".
 */
export function deriveHoseReelStatus(components: TccComponent[]): string {
  const counts = statusCountByGroup(components);
  for (const c of components) {
    if (!c.checked) continue;
    if (componentLevelOf(c.statusOrder, counts.get(c.groupLabel) ?? 1) === "huHongHoanToan") return "Không đạt";
  }
  return "Đạt";
}

/**
 * Màu cho các nhãn CHỈ xuất hiện ở bốn bảng mới. Tách khỏi TONE_BY_VALUE ở trên
 * để không phải đụng vào bảng màu đã đối chiếu của BCC/TCC/FCD.
 *
 * "Không có đèn" cố ý là "none" (xám trung tính): đó là ghi nhận hiện trạng lắp
 * đặt, không phải hỏng hóc — tô đỏ sẽ thổi phồng tỉ lệ lỗi trên dashboard.
 */
const ROUND2_TONE_BY_VALUE: Record<string, PcccTone> = {
  Đạt: "ok",
  "Không đạt": "bad",
  [LIGHT_KHONG_CO_DEN]: "none",
  "Có suy giảm chức năng nhưng vẫn sử dụng được khi có sự cố": "watch",
  "Không khả dụng": "bad",
  "Bình thường": "ok",
  "Có tác động": "ok",
  "Có tác động nhưng không reset được": "watch",
  "Không tác động": "bad",
  "Rò rỉ": "watch",
  "Rách/mục": "watch",
};

/**
 * Màu của một nhãn ở bốn bảng mới. Tra bảng riêng trước rồi mới rơi về `toneOf`
 * dùng chung ("Khả dụng"/"Bất khả dụng"/"Thiếu ron"… vẫn lấy đúng màu cũ).
 */
export function round2ToneOf(value: string | null | undefined): PcccTone {
  return ROUND2_TONE_BY_VALUE[value ?? ""] ?? toneOf(value);
}

/**
 * Mã cuộn vòi suy từ mã tủ cha — chép đúng `deriveCvccMa()` của bản demo: đổi đoạn
 * "TCC" thành "CVCC"; tủ có nhiều cuộn thì chèn thêm "01"/"02" ngay TRƯỚC hai đoạn cuối.
 *
 * Để ở đây (không để riêng trong script nhập liệu) vì cả ba nơi cần đúng một công thức:
 * script sinh lần đầu, hộp thoại "Thêm cuộn vòi" gợi ý mã, và người đối chiếu số liệu.
 */
export function deriveHoseReelMa(cabinetMa: string, seqNum: number | null) {
  const parts = String(cabinetMa || "").split("/");
  const idx = parts.indexOf("TCC");
  if (idx !== -1) parts[idx] = "CVCC";
  if (seqNum) {
    const tail = parts.length >= 2 ? parts.splice(parts.length - 2, 2) : [];
    parts.push(String(seqNum).padStart(2, "0"), ...tail);
  }
  return parts.join("/");
}

/**
 * Mã gợi ý cho cuộn vòi THÊM TAY vào một tủ: tủ chưa có cuộn nào thì dùng mã không số
 * thứ tự, đã có rồi thì đánh số tiếp. Người dùng vẫn sửa được trước khi lưu — đây chỉ
 * là gợi ý, mã thật do hiện trường quyết định.
 */
export function suggestHoseReelMa(cabinetMa: string, existingCount: number) {
  return existingCount === 0 ? deriveHoseReelMa(cabinetMa, null) : deriveHoseReelMa(cabinetMa, existingCount + 1);
}

/**
 * Hai nhóm ô tích ĐÃ CHUYỂN HẲN xuống bảng cuộn vòi chữa cháy (CVCC).
 *
 * Nghiệp vụ chốt 2026-08-18: cuộn ống và lăng phun giờ theo dõi ĐỘC LẬP ở CVCC, nên
 * bảng tủ chữa cháy không hiển thị, không tính tình trạng và không xuất hai nhóm này
 * nữa — để lại là cùng một khiếm khuyết bị đếm hai lần ở hai bảng.
 *
 * Dữ liệu trong `pccc_cabinet_components` được GIỮ NGUYÊN, không xoá:
 *  - kỳ đã chốt (T07.2026) phải bất biến, gồm cả phần đã ký;
 *  - dòng cuộn vòi mới thêm còn sao trạng thái ban đầu từ tủ cha;
 *  - đổi ý thì chỉ cần bỏ lọc, không phải nhập lại dữ liệu.
 */
export const TCC_ABSORBED_GROUPS = ["CUỘN ỐNG", "LĂNG PHUN"] as const;

export function isAbsorbedByHoseReel(groupLabel: string) {
  return (TCC_ABSORBED_GROUPS as readonly string[]).includes(groupLabel);
}

/**
 * Lọc ô tích của tủ về đúng phần CÒN THUỘC bảng tủ. Gọi ở MỌI nơi đọc linh kiện tủ cho
 * mục đích hiển thị / tính tình trạng / xuất file — bỏ sót một chỗ là chỗ đó lại đếm
 * lẫn phần của cuộn vòi.
 */
export function cabinetComponentsForTcc<T extends { groupLabel: string }>(components: T[]): T[] {
  return components.filter((c) => !isAbsorbedByHoseReel(c.groupLabel));
}
