import { vibrationAccessFor, type VibrationUserLike } from "@/lib/vibration/position-access";

/**
 * Chức danh giám sát (Trưởng ca, TK Lò máy, Trưởng kíp điện, KTV, Phó quản đốc, Quản đốc, Kỹ sư)
 * được xem và sửa toàn bộ trang Theo dõi dầu mỡ, không giới hạn cương vị phụ trách (chủ dự án 2026-11).
 * Dùng chung bộ nhận diện chức danh với phần độ rung.
 */
export function isLubricantSupervisor(user: VibrationUserLike | null | undefined) {
  return !!user && (user.role === "ADMIN" || vibrationAccessFor(user).supervisor);
}
