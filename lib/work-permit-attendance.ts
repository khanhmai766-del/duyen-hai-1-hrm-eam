/*
 * Vào / ra vị trí làm việc của nhân viên trong MỘT lần làm việc nhà thầu — dùng chung client/server.
 *
 * Mỗi người trong `WorkPermitSession.members` mang `attendance`: các lượt [vào, ra]. Ra rồi vào lại thì
 * thêm lượt mới (giống mẫu PCT giấy ghi một dòng cho mỗi lần vào). Giờ luôn lấy theo ĐỒNG HỒ SERVER.
 * Người chưa có `attendance` (lần làm việc mở trước khi có tính năng) coi như KHÔNG theo dõi — không tính
 * vào "đang trong khu vực" và không chặn kết thúc lần làm việc.
 */
export type AttendanceVisit = { in: string; out: string | null };
type WithAttendance = { attendance?: AttendanceVisit[] | null };

/** Có theo dõi vào/ra (đã có ít nhất một lượt vào). */
export function attendanceTracked(member: WithAttendance) {
  return Array.isArray(member.attendance) && member.attendance.length > 0;
}
/** Đang ở trong khu vực: lượt cuối chưa có giờ ra. */
export function attendanceInside(member: WithAttendance) {
  const visits = member.attendance;
  return Array.isArray(visits) && visits.length > 0 && !visits[visits.length - 1].out;
}
export function lastVisit(member: WithAttendance) {
  const visits = member.attendance;
  return Array.isArray(visits) && visits.length ? visits[visits.length - 1] : null;
}
/** Quét lại cùng thẻ trong khoảng này sau khi VÀO thì không tự ghi RA (chống quét đúp / bấm nhầm). */
export const ATTENDANCE_MIN_STAY_MS = 60_000;

export type AttendanceOutcome = "IN" | "OUT" | "ADDED" | "ALREADY_IN" | "TOO_SOON";
