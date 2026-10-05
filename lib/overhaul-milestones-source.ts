import { OVERHAUL_CAMPAIGN, type MilestoneInput } from "./overhaul-milestones";

/** Đối chiếu PL2. Mốc đường găng SCL S2-DH1 2026.xls, sheet LH-TB S2-DH1.
 * Ngày đại tu 1 = 06/10/2026 (file gốc ghi 07/10; dời sớm 1 ngày theo yêu cầu 05/10/2026 — khớp ngày bắt đầu các tab
 * tiến độ đại tu trên Google Sheets). Khoảng ngày lấy hai đầu ngoặc, không lấy mũi tên giữa nhãn. */
export const OVERHAUL_DAY_ONE = "2026-10-06";
const ROWS: Array<[string, number, number | null, string]> = [
  ["tach-luoi", 1, null, "Tách lưới"],
  ["sua-ap-luc-lo", 2, null, "Sửa chữa hệ thống áp lực lò hơi và các hệ thống liên quan (APH, GGH, SCR)"],
  ["ha-tam-chan-bth", 8, null, "Hạ tấm chắn đầu hút BTH, thực hiện đại tu hệ thống nước tuần hoàn"],
  ["ngung-tro-truc", 10, null, "Ngừng trở trục tuabin"],
  ["rut-rotor-may-phat", 21, null, "Rút rotor máy phát"],
  ["cau-rotor-hip", 22, null, "Cẩu rotor HIP"],
  ["nghiem-thu-fgd", 40, null, "Nghiệm thu sơn đường khói FGD"],
  ["nghiem-thu-tuan-hoan", 43, null, "Nghiệm thu sơn ống tuần hoàn, điền nước tuần hoàn, điền nước vào đường ống"],
  ["hoan-thanh-phan-dien", 45, null, "Hoàn thành đại tu phần điện cho cả lò hơi và tuabin"],
  ["nghiem-thu-diesel", 47, null, "Nghiệm thu hệ thống Diesel khẩn"],
  ["nghiem-thu-ap-luc", 47, null, "Nghiệm thu hệ thống áp lực, điền nước bao hơi"],
  ["nap-khi-may-phat", 49, null, "Nạp khí nén thử hao, kiểm tra rò rỉ máy phát"],
  ["hoan-thanh-module", 50, null, "Hoàn thành thay thế module catalyst, APH, GGH, tháo giáo trong lò"],
  ["khoi-dong-lam-mat", 51, null, "Khởi động hệ thống nước làm mát tuần hoàn"],
  ["tro-truc-tuabin", 52, null, "Trở trục tuabin"],
  ["chan-khong-bfpt", 53, null, "Tạo chân không bình ngưng, thử nghiệm BFPT"],
  ["dot-lo", 54, null, "Đốt lò lần đầu"],
  ["xung-dong-tuabin", 56, null, "Xung động tuabin lần đầu"],
  ["hoa-dien", 57, null, "Hòa điện lần đầu"],
  ["kha-dung", 59, null, "Khả dụng sau đại tu"],
  ["lam-mat-lo", 1, 5, "Làm mát lò, kiểm tra đục xỉ"],
  ["thao-ggh", 3, 18, "Tháo GGH"],
  ["scbd-mba", 5, 35, "Thực hiện SCBD MBA chính"],
  ["lap-gian-giao", 6, 12, "Lắp giàn giáo lò"],
  ["thao-tuabin-may-phat", 11, 26, "Tháo tuabin và máy phát"],
  ["son-ggh", 19, 36, "Sơn bên trong GGH"],
  ["cau-bom-cap", 22, 31, "Khoảng thời gian cẩu tháo bơm cấp đại tu, cân đối cẩu với nhóm máy phát"],
  ["lap-tuabin-may-phat", 27, 49, "Lắp tuabin và máy phát"],
  ["lap-module-ggh", 37, 49, "Lắp module GGH"],
  ["nghiem-thu-thiet-bi", 44, 46, "Nghiệm thu các thiết bị liên quan chuẩn bị nén nước lò (bơm tuần hoàn, bơm mạch kín, bơm ngưng, bơm cấp)"],
  ["nen-nuoc-lo", 47, 49, "Nén nước lò"],
  ["flushing-nhot", 50, 52, "Flushing hệ thống nhớt bôi trơn"],
  ["co2-h2", 53, 54, "Đưa CO₂ và H₂ thông thổi máy phát"],
  ["thu-nghiem", 57, 59, "Thử nghiệm sau đại tu"],
];

/** Ngày lịch yyyy-mm-dd của "Ngày đại tu n" (n = 1 → 06/10/2026). */
export function overhaulDayDate(day: number) {
  return new Date(Date.parse(`${OVERHAUL_DAY_ONE}T00:00:00Z`) + (day - 1) * 86_400_000).toISOString().slice(0, 10);
}
const dayDate = overhaulDayDate;
/** Số ngày trên bảng tiến độ (khớp cột "Ngày 1…60" của các tab Sheet). */
export const OVERHAUL_DAY_COUNT = 60;

export const S2_MILESTONES_SOURCE = ROWS.map(([key, start, end, title], index): MilestoneInput & {
  sourceKey: string; campaign: string; sortOrder: number;
} => ({
  sourceKey: `pl2-s2-2026:${key}`, campaign: OVERHAUL_CAMPAIGN, sortOrder: index + 1,
  title, startDate: dayDate(start), endDate: end ? dayDate(end) : null, note: null,
}));
