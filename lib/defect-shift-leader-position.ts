import { normalizeText } from "@/lib/nav";

/**
 * Người đang đi Trưởng ca phải có cương vị Trưởng ca ở một trong các cương vị
 * chính, phụ hoặc hiện tại. Quy tắc này được dùng chung cho giao diện và API.
 */
export function isDefectShiftLeaderCandidatePosition(value: string | null | undefined) {
  const position = normalizeText(value ?? "");
  return position === "truong ca";
}
