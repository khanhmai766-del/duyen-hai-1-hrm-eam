import { normalizeText } from "@/lib/nav";
import { positionLabelOf } from "@/lib/position-catalog";
import { isAdminUser, type SessionUser } from "./auth/session";
import { NH3_OPENING_STOCK_CELL } from "./ctktkt-report";

export type CtktktFieldGroup =
  | "kpi_summary"        // Ô I35, I36, E39, H39, W86, W87, giờ vận hành W68:Z69
  | "tkd_trend"           // Bảng TKĐ DCS (P/Q TD 911, 912, 921, 922, 21)
  | "tpd_tcd_power"       // Công tơ máy phát, MBT T1/T2, TD 911/921, TD 912/922 S1 & S2
  | "lo_pho_oil"          // Công tơ dầu cấp lò F1 & dầu về bồn F2 S1 & S2
  | "may_nghien_coal_s1"  // 12 cân than S1 (A1..F2)
  | "may_nghien_coal_s2"  // 12 cân than S2 (A1..F2)
  | "steam_flow"          // Tổng lưu lượng hơi S1 & S2
  | "nh3_tank"            // Tổng lượng NH3 (mức bồn & lượng nhập)
  | "nh3_dcs"             // Công tơ NH3 trên DCS S1 & S2
  | "td21"                // Công tơ điện tự dùng TD21
  | "startup_shutdown"    // Khởi động / Ngừng tổ máy
  | "coal_blend_pmis"     // Than trộn PMIS (Wtp, Qk, tỷ lệ trộn)
  | "pmis_reports";       // Báo cáo PMIS 02-PĐ và đối chiếu ngày

export const CTKTKT_GROUP_META: Record<
  CtktktFieldGroup,
  { label: string; shortLabel: string; responsible: string; description: string }
> = {
  kpi_summary: {
    label: "Chỉ tiêu KTKT tổng hợp",
    shortLabel: "Chỉ tiêu KTKT",
    responsible: "Trưởng kíp điện / Thống kê / KTV",
    description: "Nhập suất hao bi nghiền than (150 g/kWh), lượng than nhập và than nhập 06h (W87)",
  },
  tkd_trend: {
    label: "Bảng TKĐ trend DCS",
    shortLabel: "TKĐ DCS",
    responsible: "Trưởng kíp điện",
    description: "Nhập P/Q tự dùng 911, 912, 921, 922, TD 21 (6 mốc giờ) và công tơ nước demin 24h S1, S2, tái sinh hạt",
  },
  tpd_tcd_power: {
    label: "Công tơ điện Tổ máy (S1 & S2)",
    shortLabel: "Điện S1 & S2",
    responsible: "Trực phụ điện / Trực chính Điện",
    description: "Nhập công tơ máy phát, MBT T1/T2, TD 911/912/921/922 tại 06h, 14h, 22h, 24h",
  },
  lo_pho_oil: {
    label: "Công tơ dầu cấp / về bồn (F1 - F2)",
    shortLabel: "Dầu F1 - F2",
    responsible: "Lò phó",
    description: "Nhập công tơ dầu cấp lò F1 và dầu về bồn F2 tại 06h, 08h, 14h, 16h, 22h, 24h",
  },
  may_nghien_coal_s1: {
    label: "Công tơ than Tổ máy S1 (12 cân A1..F2)",
    shortLabel: "Than S1",
    responsible: "Vận hành viên Máy nghiền S1",
    description: "Nhập chỉ số 12 công tơ than máy nghiền S1 tại 08h, 16h, 24h",
  },
  may_nghien_coal_s2: {
    label: "Công tơ than Tổ máy S2 (12 cân A1..F2)",
    shortLabel: "Than S2",
    responsible: "Vận hành viên Máy nghiền S2",
    description: "Nhập chỉ số 12 công tơ than máy nghiền S2 tại 08h, 16h, 24h",
  },
  steam_flow: {
    label: "Lưu lượng hơi (S1 & S2)",
    shortLabel: "Lưu lượng hơi",
    responsible: "Trưởng kíp điện",
    description: "Nhập tổng lưu lượng hơi S1 và S2 tại 6 mốc giờ",
  },
  nh3_tank: {
    label: "Tổng lượng NH3 dùng trong ngày",
    shortLabel: "Bồn NH3",
    responsible: "VHV NH3 - Lò hơi phụ / Trưởng kíp điện",
    description: "Nhập mức bồn NH3 A, B, C (00h và 24h) và lượng NH3 nhập",
  },
  nh3_dcs: {
    label: "Tổng lượng NH3 dùng trong ngày theo công tơ DCS",
    shortLabel: "NH3 DCS",
    responsible: "Lò trưởng / Trưởng kíp điện",
    description: "Nhập chỉ số công tơ NH3 DCS lúc 00h và 24h; hiệu chỉnh mức reset riêng cho S1, S2 nếu công tơ quay về 0",
  },
  td21: {
    label: "Công tơ điện tự dùng - TD21",
    shortLabel: "TD21",
    responsible: "Trực phụ điện",
    description: "Nhập chỉ số công tơ điện tự dùng TD21 tại 06h, 14h, 22h, 24h",
  },
  startup_shutdown: {
    label: "Khởi động / Ngừng tổ máy",
    shortLabel: "KĐ / Ngừng máy",
    responsible: "Trưởng kíp điện / Lò phó / Trưởng ca",
    description: "Chỉ nhập khi có sự kiện khởi động hoặc ngừng tổ máy",
  },
  coal_blend_pmis: {
    label: "Bảng nhập PMIS than trộn 6A10 & Sub bitum",
    shortLabel: "Than trộn PMIS",
    responsible: "Trưởng kíp điện",
    description: "Nhập độ ẩm Wtp, nhiệt trị khô Qk theo ca và tỷ lệ trộn",
  },
  pmis_reports: {
    label: "Báo cáo PMIS 02-PĐ & Đối chiếu ngày",
    shortLabel: "Báo cáo PMIS",
    responsible: "Trưởng kíp điện / Thống kê / Kỹ thuật viên / Trưởng ca",
    description: "Hiển thị tổng hợp số liệu PMIS 02-PĐ và đối chiếu SLĐC/SLXT",
  },
};

// Tập hợp ô theo nhóm
const GROUP_CELLS: Record<CtktktFieldGroup, Set<string>> = {
  kpi_summary: new Set([
    "I35", "I36", "E39", "H39", "W86", "W87", "COAL_STOCK_24H_START",
    "W68", "X68", "Y68", "Z68", "W69", "X69", "Y69", "Z69",
  ]),
  tkd_trend: new Set([
    "M9", "N9", "O9", "P9", "Q9", "R9",     // P TD 911
    "M10", "N10", "O10", "P10", "Q10", "R10", // P TD 912
    "M12", "N12", "O12", "P12", "Q12", "R12", // P TD 921
    "M13", "N13", "O13", "P13", "Q13", "R13", // P TD 922
    "M15", "N15", "O15", "P15", "Q15", "R15", // P TD 21
    "M16", "N16", "O16", "P16", "Q16", "R16", // Q TD 21
    "W72", "X72", "Z72",                     // Nước demin DCS S1 (24h D-1, 24h D, Tái sinh hạt)
    "W73", "X73", "Z73",                     // Nước demin DCS S2 (24h D-1, 24h D, Tái sinh hạt)
    "WATER_ADJ_S1", "WATER_ADJ_S2",           // Hiệu chỉnh công tơ nước demin DCS S1 & S2 (m³)
    "WATER_ADJ_NOTE_S1", "WATER_ADJ_NOTE_S2", // Lý do hiệu chỉnh công tơ nước demin S1 & S2
  ]),
  tpd_tcd_power: new Set([
    // S1
    "W8", "Y8", "AA8", "AB8",    // MF S1
    "W9", "Y9", "AA9", "AB9",    // MBT T1
    "W10", "Y10", "AA10", "AB10", // TD 911
    "W11", "Y11", "AA11", "AB11", // TD 912
    // S2
    "AG8", "AI8", "AK8", "AL8",    // MF S2
    "AG9", "AI9", "AK9", "AL9",    // MBT T2
    "AG10", "AI10", "AK10", "AL10", // TD 921
    "AG11", "AI11", "AK11", "AL11", // TD 922
    // Hiệu chỉnh công tơ điện khi reset/thay (MWh) và lý do
    "ELEC_RESET_S1_8", "ELEC_RESET_S1_9", "ELEC_RESET_S1_10", "ELEC_RESET_S1_11", "ELEC_RESET_NOTE_S1",
    "ELEC_RESET_S2_8", "ELEC_RESET_S2_9", "ELEC_RESET_S2_10", "ELEC_RESET_S2_11", "ELEC_RESET_NOTE_S2",
  ]),
  lo_pho_oil: new Set([
    // S1 (tấn)
    "W13", "X13", "Y13", "Z13", "AA13", "AB13", // F1 cấp
    "W14", "X14", "Y14", "Z14", "AA14", "AB14", // F2 về
    // S2 (kg)
    "AG13", "AH13", "AI13", "AJ13", "AK13", "AL13", // F1 cấp
    "AG14", "AH14", "AI14", "AJ14", "AK14", "AL14", // F2 về
  ]),
  may_nghien_coal_s1: new Set([
    "W28", "Y28", "AA28", // hiệu chỉnh 3 ca
    "COAL_ADJ_NOTE_S1", // lý do hiệu chỉnh
    // 12 cân than S1 (cols X, Z, AB; rows 16 to 27)
    "X16", "Z16", "AB16", "X17", "Z17", "AB17",
    "X18", "Z18", "AB18", "X19", "Z19", "AB19",
    "X20", "Z20", "AB20", "X21", "Z21", "AB21",
    "X22", "Z22", "AB22", "X23", "Z23", "AB23",
    "X24", "Z24", "AB24", "X25", "Z25", "AB25",
    "X26", "Z26", "AB26", "X27", "Z27", "AB27",
  ]),
  may_nghien_coal_s2: new Set([
    "AG28", "AI28", "AK28", // hiệu chỉnh 3 ca
    "COAL_ADJ_NOTE_S2", // lý do hiệu chỉnh
    // 12 cân than S2 (cols AH, AJ, AL; rows 16 to 27)
    "AH16", "AJ16", "AL16", "AH17", "AJ17", "AL17",
    "AH18", "AJ18", "AL18", "AH19", "AJ19", "AL19",
    "AH20", "AJ20", "AL20", "AH21", "AJ21", "AL21",
    "AH22", "AJ22", "AL22", "AH23", "AJ23", "AL23",
    "AH24", "AJ24", "AL24", "AH25", "AJ25", "AL25",
    "AH26", "AJ26", "AL26", "AH27", "AJ27", "AL27",
  ]),
  steam_flow: new Set([
    // S1
    "W54", "X54", "Y54", "Z54", "AA54", "AB54",
    // S2
    "AG54", "AH54", "AI54", "AJ54", "AK54", "AL54",
  ]),
  nh3_tank: new Set([
    "N69", "O69", "P69",
    "N70", "O70", "P70",
    "N71", "O71", "P71",
    "P72", "P73", "P74",
  ]),
  nh3_dcs: new Set(["N81", "N82", "NH3_DCS_RESET_S1", "NH3_DCS_RESET_S2"]),
  td21: new Set([
    "M49", "O49", "Q49", "R49",
  ]),
  startup_shutdown: new Set([
    "STARTUP_UNIT", "STARTUP_EVENT", "STARTUP_EVENTS_JSON",
    "C87", "D87", "E87", "F87", "G87", "H87",
    "C88", "D88", "E88", "F88", "G88", "H88",
    "C93", "D93", "E93", "F93", "G93", "H93",
    "C94", "D94", "E94", "F94", "G94", "H94",
  ]),
  coal_blend_pmis: new Set([
    // Chỉ còn than 6A10: Ẩm toàn phần & Nhiệt trị khô theo 3 ca của S1/S2.
    "AJ87", "AK87", "AJ88", "AK88", "AJ89", "AK89",
    "AJ90", "AK90", "AJ91", "AK91", "AJ92", "AK92",
  ]),
  pmis_reports: new Set([
    "J157", "K157", "J158", "K158",
    "PMIS_AUX_MANUAL_S1", "PMIS_AUX_MANUAL_S2", "PMIS_AUX_NOTE_S1", "PMIS_AUX_NOTE_S2",
    "C181", "D181", "E181", "F181", "G181", "H181", "I181", "J181", "K181", "L181",
    "M181", "N181", "O181", "P181", "Q181", "R181", "S181", "T181",
    "D183", "E183", "F183", "K183", "L183", "N183", "O183", "P183", "Q183", "R183",
    "D184", "F184", "K184", "L184", "N184", "O184",
  ]),
};

// Bản đồ tra nhanh: Cell -> Group
const CELL_TO_GROUP = new Map<string, CtktktFieldGroup>();
for (const [group, cellSet] of Object.entries(GROUP_CELLS) as Array<[CtktktFieldGroup, Set<string>]>) {
  for (const cell of cellSet) {
    CELL_TO_GROUP.set(cell, group);
  }
}

export function getCtktktFieldGroup(cell: string): CtktktFieldGroup | null {
  return CELL_TO_GROUP.get(cell.toUpperCase()) || null;
}

export function getGroupCells(group: CtktktFieldGroup): Set<string> {
  return GROUP_CELLS[group] || new Set();
}

/**
 * Kiểm tra quyền nhập liệu theo từng cụm cụ thể trên trang Chỉ tiêu KTKT:
 * - Admin, Quản đốc, Phó Quản đốc, Kỹ thuật viên, Thống kê: Toàn quyền nhập tất cả các cụm.
 * - Trưởng ca / Giám sát: Toàn quyền nhập / phê duyệt các cụm trong ca.
 * - Trưởng kíp điện:
 *   + Cụm 2: TKĐ DCS trend (P/Q TD 911, 912, 921, 922, TD21)
 *   + Cụm 4 & 5 (Nhóm điện): MF, MBT T1/T2, TD911/921, TD912/922
 *   + Cụm 6: Lưu lượng hơi S1 & S2
 *   + Cụm 8: Tổng lượng NH3
 *   + Cụm 9: Công tơ điện tự dùng TD21
 *   + Cụm 11: Khởi động / Ngừng tổ máy
 *   + Cụm 14: Than trộn PMIS (Wtp, Qk, tỷ lệ trộn)
 *   + Cụm 1: Dầu nhập, than nhập, bi nghiền, tồn kho than, giờ vận hành (I35, I36, E39, H39, W86, W87, W68:Z69)
 * - Trực phụ điện / Trực chính Điện:
 *   + Cụm 4 & 5 (Nhóm điện): Công tơ máy phát, MBT T1/T2, TD 911/921, TD 912/922
 *   + Cụm 9: Công tơ điện tự dùng TD21
 * - Lò phó / Lò trưởng:
 *   + Cụm 4 & 5 (Nhóm dầu): Công tơ dầu cấp lò F1 & dầu về bồn F2 của S1 & S2
 *   + Cụm 11: Khởi động / Ngừng máy (dầu cấp lò)
 * - Vận hành viên Máy nghiền (hoặc Máy trưởng / Máy phó / Lò trưởng / Lò phó):
 *   + Cụm 4: 12 công tơ than S1
 *   + Cụm 5: 12 công tơ than S2
 * - VHV NH3 - Lò hơi phụ:
 *   + Cụm 8: Tổng lượng NH3
 */
export function legacyCanEditCtktktGroup(
  user: SessionUser | null | undefined,
  group: CtktktFieldGroup,
): boolean {
  if (!user) return false;

  // 1. Quản trị hệ thống, Quản đốc, Phó Quản đốc có toàn quyền
  if (isAdminUser(user)) {
    return true;
  }

  const pos = (user.position || "").trim().toLowerCase();

  // 2. Lãnh đạo phân xưởng, Kỹ thuật viên, Thống kê có toàn quyền
  if (
    pos.includes("quản đốc") ||
    pos.includes("kỹ thuật viên") ||
    pos.includes("thống kê") ||
    user.role === "technician" ||
    user.role === "editor"
  ) {
    return true;
  }

  // 3. Trưởng ca / Giám sát có toàn quyền giám sát và nhập liệu trong ca
  if (user.role === "supervisor" || pos.includes("trưởng ca")) {
    return true;
  }

  // 4. Phân quyền chi tiết theo từng cương vị vận hành
  switch (group) {
    case "kpi_summary":
      return (
        pos.includes("trưởng kíp điện") ||
        pos.includes("tk lò máy") ||
        pos.includes("lò trưởng") ||
        pos.includes("máy trưởng")
      );

    case "tkd_trend":
      return pos.includes("trưởng kíp điện");

    case "tpd_tcd_power":
      return (
        pos.includes("trực phụ điện") ||
        pos.includes("trực chính điện") ||
        pos.includes("trưởng kíp điện")
      );

    case "lo_pho_oil":
      return (
        pos.includes("lò phó") ||
        pos.includes("lò trưởng") ||
        pos.includes("tk lò máy")
      );

    case "may_nghien_coal_s1":
    case "may_nghien_coal_s2":
      return (
        pos.includes("máy nghiền") ||
        pos.includes("lò phó") ||
        pos.includes("lò trưởng") ||
        pos.includes("máy phó") ||
        pos.includes("máy trưởng") ||
        pos.includes("tk lò máy")
      );

    case "steam_flow":
      return (
        pos.includes("trưởng kíp điện") ||
        pos.includes("tk lò máy") ||
        pos.includes("lò trưởng")
      );

    case "nh3_tank":
      return (
        pos.includes("nh3") ||
        pos.includes("lò hơi phụ") ||
        pos.includes("trưởng kíp điện")
      );

    case "nh3_dcs":
      return (
        pos.includes("lò trưởng") ||
        pos.includes("trưởng kíp điện")
      );

    case "td21":
      return (
        pos.includes("trực phụ điện") ||
        pos.includes("trực chính điện") ||
        pos.includes("trưởng kíp điện")
      );

    case "startup_shutdown":
      return (
        pos.includes("trưởng kíp điện") ||
        pos.includes("lò phó") ||
        pos.includes("lò trưởng") ||
        pos.includes("tk lò máy")
      );

    case "coal_blend_pmis":
      return (
        pos.includes("trưởng kíp điện") ||
        pos.includes("tk lò máy") ||
        pos.includes("hóa")
      );

    case "pmis_reports":
      return (
        pos.includes("trưởng kíp điện") ||
        pos.includes("thống kê") ||
        pos.includes("kỹ thuật")
      );

    default:
      return false;
  }
}

/**
 * Kiểm tra xem người dùng có quyền sửa ô cụ thể hay không
 */
export function canEditCtktktField(
  user: SessionUser | null | undefined,
  cell: string,
): boolean {
  if (!user) return false;
  if (cell === NH3_OPENING_STOCK_CELL) return false;
  const group = getCtktktFieldGroup(cell);
  if (!group) {
    // Nếu ô không thuộc nhóm nào đặc định, chỉ Admin/KTV/Trưởng ca được sửa
    return (
isAdminUser(user) || user.permissions.includes("edit_ctktkt") || user.permissions.includes("ctktkt_other_fields")
    );
  }
  return canEditCtktktGroup(user, group);
}

/**
 * Kiểm tra xem người dùng có ít nhất một quyền nhập liệu trên trang CTKTKT hay không
 */
export function canEditAnyCtktktField(user: SessionUser | null | undefined): boolean {
  return Boolean(user && (isAdminUser(user) || user.permissions.includes("edit_ctktkt") || user.permissions.includes("ctktkt_other_fields") || getEditableCtktktGroups(user).length));
}

export function getEditableCtktktGroups(user: SessionUser | null | undefined): CtktktFieldGroup[] {
  return (Object.keys(CTKTKT_GROUP_META) as CtktktFieldGroup[]).filter(group => canEditCtktktGroup(user, group));
}

/** Only explicit grants are authoritative after legacy conversion. */
export function canEditCtktktGroup(user: SessionUser | null | undefined, group: CtktktFieldGroup): boolean {
  return Boolean(user && (isAdminUser(user) || user.permissions.includes("edit_ctktkt") || user.permissions.includes(`ctktkt_${group}`)));
}

/** Proposal access does not grant direct edit or approval rights. */
export function canProposeCtktktCorrection(user: SessionUser | null | undefined, cell: string): boolean {
  if (!user || cell === NH3_OPENING_STOCK_CELL) return false;
  const coordinator = ['truong ca', 'truong kip dien'].includes(normalizeText(positionLabelOf(user.position || '')).replace(/ s[12]$/, '').trim());
  const group = getCtktktFieldGroup(cell);
  return canEditCtktktField(user, cell) || Boolean(coordinator && group && ['tpd_tcd_power','lo_pho_oil','may_nghien_coal_s1','may_nghien_coal_s2','td21'].includes(group));
}
