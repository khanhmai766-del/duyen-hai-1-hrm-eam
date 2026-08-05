/**
 * Khiếm khuyết thiết bị được tách làm hai phần theo đúng hai Google Sheet nguồn mà
 * n8n đồng bộ về: sheet Cơ và sheet Điện (xem N8N_DEFECT_SOURCES).
 *
 * Mỗi phần chỉ hiển thị phiếu của sheet tương ứng và chỉ cho lọc những loại yêu cầu
 * mà bộ phận đó thực sự dùng — "Môi Trường" có ở cả hai bên, còn "Hóa" là của Cơ.
 *
 * Dùng chung cho cả client (sidebar, bộ lọc) lẫn server (điều kiện truy vấn), nên
 * KHÔNG đọc biến môi trường ở đây; ánh xạ sang spreadsheet id nằm ở phía server.
 */
export const DEFECT_SECTION_KEYS = ["co", "dien"] as const;
export type DefectSectionKey = (typeof DEFECT_SECTION_KEYS)[number];

export const DEFECT_SECTIONS: Record<
  DefectSectionKey,
  {
    /** Khớp với N8nDefectSource để tra spreadsheet id ở server. */
    source: "CO" | "DIEN";
    label: string;
    /** Loại yêu cầu được phép lọc trong phần này; phần tử đầu là mặc định. */
    requestTypes: readonly string[];
  }
> = {
  co: {
    source: "CO",
    label: "Sheet Cơ - Hóa",
    requestTypes: ["Cơ", "Môi Trường", "Hóa"],
  },
  dien: {
    source: "DIEN",
    label: "Sheet Điện",
    requestTypes: ["Điện", "Môi Trường"],
  },
};

/** Phần mặc định khi URL không có tham số — giữ nguyên thói quen vào thẳng phần Cơ. */
export const DEFAULT_DEFECT_SECTION: DefectSectionKey = "co";

export function parseDefectSection(value?: string | null): DefectSectionKey {
  const raw = String(value ?? "").trim().toLowerCase();
  return (DEFECT_SECTION_KEYS as readonly string[]).includes(raw)
    ? (raw as DefectSectionKey)
    : DEFAULT_DEFECT_SECTION;
}

/** Loại yêu cầu mặc định của một phần (thẻ đang chọn khi mới vào). */
export function defaultRequestTypeOf(section: DefectSectionKey) {
  return DEFECT_SECTIONS[section].requestTypes[0];
}

/** Loại yêu cầu này có thuộc phần đang xem không — dùng để chặn giá trị lạ từ URL. */
export function isRequestTypeInSection(section: DefectSectionKey, requestType?: string | null) {
  const value = String(requestType ?? "").trim();
  if (!value || value === "ALL") return true;
  return DEFECT_SECTIONS[section].requestTypes.includes(value);
}
