import { normalizeText } from "@/lib/nav";

type HcRegistrationArchiveViewer = {
  role?: string | null;
  position?: string | null;
  currentPosition?: string | null;
};

const ARCHIVE_POSITIONS = ["quan doc", "pho quan doc", "thong ke"];

/**
 * Kho lưu trữ đăng ký đi hành chính chứa dữ liệu lịch sử của toàn đơn vị,
 * vì vậy quyền xem phải được kiểm tra ở cả giao diện và API.
 */
export function canViewHcRegistrationArchive(viewer: HcRegistrationArchiveViewer) {
  if (viewer.role?.toUpperCase() === "ADMIN") return true;

  const position = normalizeText(viewer.currentPosition ?? viewer.position ?? "");
  return ARCHIVE_POSITIONS.some((allowedPosition) =>
    position === allowedPosition || position.includes(allowedPosition)
  );
}
