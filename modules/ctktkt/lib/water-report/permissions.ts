import { isAdminUser, type SessionUser } from "../auth/session";

export type WaterColumnGroup =
  | "meta"         // Ngày, Giờ, Kíp, Trưởng ca
  | "electricity"  // Công tơ điện nhận ca S1, S2
  | "water_intake" // Số nước nhận ca S1, S2 & Nước cấp vào bình ngưng S1, S2
  | "resin_water"; // Lượng nước tái sinh hạt S1, S2 (24h)

/**
 * Kiểm tra quyền nhập liệu theo từng cột cụ thể cho trang Theo dõi lượng nước:
 * - Admin / Quản trị: Toàn quyền nhập/sửa tất cả cột.
 * - Công tơ điện nhận ca: Trưởng kíp điện, Trực chính điện, Trực phụ điện.
 * - Số nước nhận ca & Nước cấp vào bình ngưng: Trưởng kíp điện.
 * - Lượng nước tái sinh hạt S1/S2: VHV trợ thủ (hoặc Trợ thủ).
 * - Trưởng ca: Được quản lý phân ca, chọn Trưởng ca, Kíp.
 */
export function legacyCanEditWaterField(user: SessionUser | null | undefined, group: WaterColumnGroup): boolean {
  if (!user) return false;

  // 1. Quản trị hệ thống hoặc Ban Quản đốc có toàn quyền
  if (isAdminUser(user)) {
    return true;
  }

  // Quyền chức năng do Quản trị viên cấp cho phép quản lý toàn bộ trang Nước.
  // Các vị trí vận hành cũ bên dưới vẫn giữ đúng phạm vi từng nhóm cột.
  if (user.permissions?.includes("edit_water")) return true;

  const pos = (user.position || "").trim().toLowerCase();
  const isLeader = pos.includes("trưởng ca") || user.role === "supervisor";

  switch (group) {
    case "meta":
      // Trưởng ca, Trưởng kíp điện hoặc Admin được chọn ca, kíp
      return isLeader || pos.includes("trưởng kíp điện");

    case "electricity":
      // Trưởng kíp điện, Trực chính điện, Trực phụ điện
      return (
        isLeader ||
        pos.includes("trưởng kíp điện") ||
        pos.includes("trực chính điện") ||
        pos.includes("trực phụ điện")
      );

    case "water_intake":
      // Số nước nhận ca và Nước cấp vào bình ngưng: Trưởng kíp điện
      return isLeader || pos.includes("trưởng kíp điện");

    case "resin_water":
      // Lượng nước tái sinh hạt S1/S2: VHV trợ thủ (hoặc Trợ thủ)
      return isLeader || pos.includes("trợ thủ");

    default:
      return false;
  }
}

/**
 * Kiểm tra xem người dùng có ít nhất một quyền nhập liệu trên trang Nước hay không
 */
export function canEditAnyWaterField(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  return (
    canEditWaterField(user, "meta") ||
    canEditWaterField(user, "electricity") ||
    canEditWaterField(user, "water_intake") ||
    canEditWaterField(user, "resin_water")
  );
}

export function canEditWaterField(user: SessionUser | null | undefined, group: WaterColumnGroup): boolean {
  return Boolean(user && (isAdminUser(user) || user.permissions.includes("edit_water") || user.permissions.includes(`water_${group}`)));
}

export function canDeleteWaterShift(user: SessionUser | null | undefined): boolean {
  return Boolean(user && (isAdminUser(user) || (user.permissions.includes("edit_water") && (user.role === "supervisor" || (user.position || "").toLowerCase().includes("trưởng ca")))));
}
