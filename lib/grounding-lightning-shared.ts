/** Giá trị dùng chung cho cả Client Component và API; không nhập thư viện chỉ chạy phía server. */
export const GROUNDING_TYPES = ["LIGHTNING", "GROUNDING"] as const;
export type GroundingType = (typeof GROUNDING_TYPES)[number];

export const GROUNDING_STATUSES = ["UNCHECKED", "NORMAL", "DEFECT"] as const;
export type GroundingStatus = (typeof GROUNDING_STATUSES)[number];

export const GROUNDING_TYPE_LABEL: Record<GroundingType, string> = {
  LIGHTNING: "Chống sét",
  GROUNDING: "Tiếp địa",
};

export const GROUNDING_STATUS_LABEL: Record<GroundingStatus, string> = {
  UNCHECKED: "Chưa kiểm tra",
  NORMAL: "Bình thường",
  DEFECT: "Có khiếm khuyết",
};
