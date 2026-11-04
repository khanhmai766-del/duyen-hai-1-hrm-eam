export const CTKTKT_COAL_ADJUSTMENT_FIELDS = [
  { cell: "W28", section: "coal_meters", sectionLabel: "Hiệu chỉnh cân than", label: "S1 Ca 1 (00h-08h)", row: 28, column: 23 },
  { cell: "Y28", section: "coal_meters", sectionLabel: "Hiệu chỉnh cân than", label: "S1 Ca 2 (08h-16h)", row: 28, column: 25 },
  { cell: "AA28", section: "coal_meters", sectionLabel: "Hiệu chỉnh cân than", label: "S1 Ca 3 (16h-24h)", row: 28, column: 27 },
  { cell: "AG28", section: "coal_meters", sectionLabel: "Hiệu chỉnh cân than", label: "S2 Ca 1 (00h-08h)", row: 28, column: 33 },
  { cell: "AI28", section: "coal_meters", sectionLabel: "Hiệu chỉnh cân than", label: "S2 Ca 2 (08h-16h)", row: 28, column: 35 },
  { cell: "AK28", section: "coal_meters", sectionLabel: "Hiệu chỉnh cân than", label: "S2 Ca 3 (16h-24h)", row: 28, column: 37 },
] as const;

export const CTKTKT_COAL_ADJUSTMENT_NOTE_FIELDS = [
  { cell: "COAL_ADJ_NOTE_S1", section: "coal_meters", sectionLabel: "Hiệu chỉnh cân than", label: "Lý do hiệu chỉnh S1", row: 28, column: 29 },
  { cell: "COAL_ADJ_NOTE_S2", section: "coal_meters", sectionLabel: "Hiệu chỉnh cân than", label: "Lý do hiệu chỉnh S2", row: 28, column: 39 },
] as const;

export const CTKTKT_WATER_ADJUSTMENT_FIELDS = [
  { cell: "WATER_ADJ_S1", section: "tkd_trend", sectionLabel: "Công tơ nước demin DCS", label: "Hiệu chỉnh nước demin S1 (m³)", row: 72, column: 29 },
  { cell: "WATER_ADJ_S2", section: "tkd_trend", sectionLabel: "Công tơ nước demin DCS", label: "Hiệu chỉnh nước demin S2 (m³)", row: 73, column: 29 },
] as const;

export const CTKTKT_WATER_ADJUSTMENT_NOTE_FIELDS = [
  { cell: "WATER_ADJ_NOTE_S1", section: "tkd_trend", sectionLabel: "Công tơ nước demin DCS", label: "Lý do hiệu chỉnh nước S1", row: 72, column: 30 },
  { cell: "WATER_ADJ_NOTE_S2", section: "tkd_trend", sectionLabel: "Công tơ nước demin DCS", label: "Lý do hiệu chỉnh nước S2", row: 73, column: 30 },
] as const;

// Các ô nhập tay để trống trong workbook mẫu không xuất hiện trong
// CTKTKT_INPUT_FIELDS (danh sách sinh tự động từ workbook). Khai báo rõ tại đây
// để giao diện, API lưu và trang "Tất cả trường" dùng cùng một nguồn dữ liệu.
export const CTKTKT_BLANK_TEMPLATE_INPUT_FIELDS = [
  { cell: "I35", section: "kpi_summary", sectionLabel: "Chỉ tiêu KTKT tổng hợp", label: "Lượng dầu nhập (tấn)", row: 35, column: 9 },
  { cell: "E39", section: "kpi_summary", sectionLabel: "Chỉ tiêu KTKT tổng hợp", label: "Suất hao bi nghiền than S1 (g/tấn than)", row: 39, column: 5 },
  { cell: "H39", section: "kpi_summary", sectionLabel: "Chỉ tiêu KTKT tổng hợp", label: "Suất hao bi nghiền than S2 (g/tấn than)", row: 39, column: 8 },

  { cell: "M15", section: "power_meters", sectionLabel: "Bảng TKĐ trend DCS", label: "P TD 21 (MW) · 06h", row: 15, column: 13 },
  { cell: "N15", section: "power_meters", sectionLabel: "Bảng TKĐ trend DCS", label: "P TD 21 (MW) · 10h", row: 15, column: 14 },
  { cell: "O15", section: "power_meters", sectionLabel: "Bảng TKĐ trend DCS", label: "P TD 21 (MW) · 14h", row: 15, column: 15 },
  { cell: "P15", section: "power_meters", sectionLabel: "Bảng TKĐ trend DCS", label: "P TD 21 (MW) · 18h", row: 15, column: 16 },
  { cell: "Q15", section: "power_meters", sectionLabel: "Bảng TKĐ trend DCS", label: "P TD 21 (MW) · 22h", row: 15, column: 17 },
  { cell: "R15", section: "power_meters", sectionLabel: "Bảng TKĐ trend DCS", label: "P TD 21 (MW) · 24h", row: 15, column: 18 },
  { cell: "M16", section: "power_meters", sectionLabel: "Bảng TKĐ trend DCS", label: "Q TD 21 (MVAr) · 06h", row: 16, column: 13 },
  { cell: "N16", section: "power_meters", sectionLabel: "Bảng TKĐ trend DCS", label: "Q TD 21 (MVAr) · 10h", row: 16, column: 14 },
  { cell: "R16", section: "power_meters", sectionLabel: "Bảng TKĐ trend DCS", label: "Q TD 21 (MVAr) · 24h", row: 16, column: 18 },

  { cell: "STARTUP_UNIT", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Tổ máy sự kiện", row: 0, column: 0 },
  { cell: "STARTUP_EVENT", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Loại sự kiện", row: 0, column: 0 },
  { cell: "STARTUP_EVENTS_JSON", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Danh sách sự kiện tổ máy", row: 0, column: 0 },
  { cell: "STARTUP_OIL_START_TIME", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Giờ bắt đầu đốt dầu", row: 0, column: 0 },
  { cell: "STARTUP_GRID_SYNC_TIME", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Giờ hòa lưới / tách lưới", row: 0, column: 0 },
  { cell: "STARTUP_MIN_LOAD_TIME", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Giờ cắt dầu", row: 0, column: 0 },
  { cell: "STARTUP_MIN_LOAD_MW", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Tải tối thiểu khi cắt dầu (MW)", row: 0, column: 0 },
  { cell: "C87", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu cấp lò · Bắt đầu đốt dầu", row: 87, column: 3 },
  { cell: "E87", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu cấp lò · Hòa lưới", row: 87, column: 5 },
  { cell: "F87", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu cấp lò · Tách lưới", row: 87, column: 6 },
  { cell: "G87", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu cấp lò · Cắt dầu kết thúc khởi động", row: 87, column: 7 },
  { cell: "H87", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu cấp lò · Tách lưới II", row: 87, column: 8 },
  { cell: "C88", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu hồi về · Bắt đầu đốt dầu", row: 88, column: 3 },
  { cell: "D88", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu hồi về · Cắt dầu do sự cố", row: 88, column: 4 },
  { cell: "E88", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu hồi về · Hòa lưới", row: 88, column: 5 },
  { cell: "F88", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu hồi về · Tách lưới", row: 88, column: 6 },
  { cell: "G88", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu hồi về · Cắt dầu kết thúc khởi động", row: 88, column: 7 },
  { cell: "H88", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu về lò · Tách lưới II", row: 88, column: 8 },
  { cell: "C93", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu cấp lò hơi phụ · Khởi động", row: 93, column: 3 },
  { cell: "D93", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu cấp lò hơi phụ · Ngừng đốt lò", row: 93, column: 4 },
  { cell: "E93", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu cấp lò hơi phụ · Hòa lưới I", row: 93, column: 5 },
  { cell: "F93", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu cấp lò hơi phụ · Tách lưới I", row: 93, column: 6 },
  { cell: "G93", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu cấp lò hơi phụ · Hòa lưới II", row: 93, column: 7 },
  { cell: "H93", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu cấp lò hơi phụ · Tách lưới II", row: 93, column: 8 },
  { cell: "C94", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu về lò hơi phụ · Khởi động", row: 94, column: 3 },
  { cell: "D94", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu về lò hơi phụ · Ngừng đốt lò", row: 94, column: 4 },
  { cell: "E94", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu về lò hơi phụ · Hòa lưới I", row: 94, column: 5 },
  { cell: "F94", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu về lò hơi phụ · Tách lưới I", row: 94, column: 6 },
  { cell: "G94", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu về lò hơi phụ · Hòa lưới II", row: 94, column: 7 },
  { cell: "H94", section: "startup_shutdown", sectionLabel: "Khởi động / Ngừng tổ máy", label: "Dầu về lò hơi phụ · Tách lưới II", row: 94, column: 8 },
  // Ô nhập theo giờ của workbook gốc mà file mẫu cũ không có số (thêm 26/09/2026).
  { cell: "M24", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Tỷ trọng dầu cấp lò hơi phụ ở 15°C (kg/l) · 06h", row: 24, column: 13 },
  { cell: "N24", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Tỷ trọng dầu cấp lò hơi phụ ở 15°C (kg/l) · 10h", row: 24, column: 14 },
  { cell: "O24", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Tỷ trọng dầu cấp lò hơi phụ ở 15°C (kg/l) · 14h", row: 24, column: 15 },
  { cell: "P24", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Tỷ trọng dầu cấp lò hơi phụ ở 15°C (kg/l) · 18h", row: 24, column: 16 },
  { cell: "Q24", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Tỷ trọng dầu cấp lò hơi phụ ở 15°C (kg/l) · 22h", row: 24, column: 17 },
  { cell: "R24", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Tỷ trọng dầu cấp lò hơi phụ ở 15°C (kg/l) · 24h", row: 24, column: 18 },
  { cell: "M25", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ dầu cấp lò hơi phụ (lít) · 06h", row: 25, column: 13 },
  { cell: "N25", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ dầu cấp lò hơi phụ (lít) · 10h", row: 25, column: 14 },
  { cell: "O25", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ dầu cấp lò hơi phụ (lít) · 14h", row: 25, column: 15 },
  { cell: "P25", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ dầu cấp lò hơi phụ (lít) · 18h", row: 25, column: 16 },
  { cell: "Q25", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ dầu cấp lò hơi phụ (lít) · 22h", row: 25, column: 17 },
  { cell: "R25", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ dầu cấp lò hơi phụ (lít) · 24h", row: 25, column: 18 },
  { cell: "M31", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Tỷ trọng dầu hồi lò hơi phụ ở 15°C (kg/l) · 06h", row: 31, column: 13 },
  { cell: "N31", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Tỷ trọng dầu hồi lò hơi phụ ở 15°C (kg/l) · 10h", row: 31, column: 14 },
  { cell: "O31", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Tỷ trọng dầu hồi lò hơi phụ ở 15°C (kg/l) · 14h", row: 31, column: 15 },
  { cell: "P31", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Tỷ trọng dầu hồi lò hơi phụ ở 15°C (kg/l) · 18h", row: 31, column: 16 },
  { cell: "Q31", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Tỷ trọng dầu hồi lò hơi phụ ở 15°C (kg/l) · 22h", row: 31, column: 17 },
  { cell: "R31", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Tỷ trọng dầu hồi lò hơi phụ ở 15°C (kg/l) · 24h", row: 31, column: 18 },
  { cell: "M32", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ dầu hồi lò hơi phụ (lít) · 06h", row: 32, column: 13 },
  { cell: "N32", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ dầu hồi lò hơi phụ (lít) · 10h", row: 32, column: 14 },
  { cell: "O32", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ dầu hồi lò hơi phụ (lít) · 14h", row: 32, column: 15 },
  { cell: "P32", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ dầu hồi lò hơi phụ (lít) · 18h", row: 32, column: 16 },
  { cell: "Q32", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ dầu hồi lò hơi phụ (lít) · 22h", row: 32, column: 17 },
  { cell: "R32", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ dầu hồi lò hơi phụ (lít) · 24h", row: 32, column: 18 },
  { cell: "M44", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thô B · 06h", row: 44, column: 13 },
  { cell: "N44", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thô B · 10h", row: 44, column: 14 },
  { cell: "O44", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thô B · 14h", row: 44, column: 15 },
  { cell: "P44", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thô B · 18h", row: 44, column: 16 },
  { cell: "Q44", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thô B · 22h", row: 44, column: 17 },
  { cell: "R44", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thô B · 24h", row: 44, column: 18 },
  { cell: "M45", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thủy cục A · 06h", row: 45, column: 13 },
  { cell: "N45", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thủy cục A · 10h", row: 45, column: 14 },
  { cell: "O45", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thủy cục A · 14h", row: 45, column: 15 },
  { cell: "P45", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thủy cục A · 18h", row: 45, column: 16 },
  { cell: "Q45", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thủy cục A · 22h", row: 45, column: 17 },
  { cell: "R45", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thủy cục A · 24h", row: 45, column: 18 },
  { cell: "M46", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thủy cục B · 06h", row: 46, column: 13 },
  { cell: "N46", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thủy cục B · 10h", row: 46, column: 14 },
  { cell: "O46", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thủy cục B · 14h", row: 46, column: 15 },
  { cell: "P46", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thủy cục B · 18h", row: 46, column: 16 },
  { cell: "Q46", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thủy cục B · 22h", row: 46, column: 17 },
  { cell: "R46", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Công tơ nước thủy cục B · 24h", row: 46, column: 18 },
  { cell: "M52", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 1 (m) · 06h", row: 52, column: 13 },
  { cell: "N52", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 1 (m) · 10h", row: 52, column: 14 },
  { cell: "O52", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 1 (m) · 14h", row: 52, column: 15 },
  { cell: "P52", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 1 (m) · 18h", row: 52, column: 16 },
  { cell: "Q52", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 1 (m) · 22h", row: 52, column: 17 },
  { cell: "R52", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 1 (m) · 24h", row: 52, column: 18 },
  { cell: "M53", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 2 (m) · 06h", row: 53, column: 13 },
  { cell: "N53", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 2 (m) · 10h", row: 53, column: 14 },
  { cell: "O53", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 2 (m) · 14h", row: 53, column: 15 },
  { cell: "P53", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 2 (m) · 18h", row: 53, column: 16 },
  { cell: "Q53", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 2 (m) · 22h", row: 53, column: 17 },
  { cell: "R53", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 2 (m) · 24h", row: 53, column: 18 },
  { cell: "M54", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 3 (m) · 06h", row: 54, column: 13 },
  { cell: "N54", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 3 (m) · 10h", row: 54, column: 14 },
  { cell: "O54", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 3 (m) · 14h", row: 54, column: 15 },
  { cell: "P54", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 3 (m) · 18h", row: 54, column: 16 },
  { cell: "Q54", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 3 (m) · 22h", row: 54, column: 17 },
  { cell: "R54", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 3 (m) · 24h", row: 54, column: 18 },
  { cell: "M55", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 4 (m) · 06h", row: 55, column: 13 },
  { cell: "N55", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 4 (m) · 10h", row: 55, column: 14 },
  { cell: "O55", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 4 (m) · 14h", row: 55, column: 15 },
  { cell: "P55", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 4 (m) · 18h", row: 55, column: 16 },
  { cell: "Q55", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 4 (m) · 22h", row: 55, column: 17 },
  { cell: "R55", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 4 (m) · 24h", row: 55, column: 18 },
  { cell: "M56", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 5 (m) · 06h", row: 56, column: 13 },
  { cell: "N56", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 5 (m) · 10h", row: 56, column: 14 },
  { cell: "O56", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 5 (m) · 14h", row: 56, column: 15 },
  { cell: "P56", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 5 (m) · 18h", row: 56, column: 16 },
  { cell: "Q56", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 5 (m) · 22h", row: 56, column: 17 },
  { cell: "R56", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Mực bồn dầu HFO 5 (m) · 24h", row: 56, column: 18 },
  { cell: "M60", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Bồn dầu HFO 1 · mức dầu 06h", row: 60, column: 13 },
  { cell: "N60", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Bồn dầu HFO 1 · nhiệt độ 06h", row: 60, column: 14 },
  { cell: "O60", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Bồn dầu HFO 1 · mức dầu 14h", row: 60, column: 15 },
  { cell: "P60", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Bồn dầu HFO 1 · nhiệt độ 14h", row: 60, column: 16 },
  { cell: "Q60", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Bồn dầu HFO 1 · mức dầu 22h", row: 60, column: 17 },
  { cell: "R60", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Bồn dầu HFO 1 · nhiệt độ 22h", row: 60, column: 18 },
  { cell: "M61", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Bồn dầu HFO 2 · mức dầu 06h", row: 61, column: 13 },
  { cell: "M62", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Bồn dầu HFO 3 · mức dầu 06h", row: 62, column: 13 },
  { cell: "M63", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Bồn dầu HFO 4 · mức dầu 06h", row: 63, column: 13 },
  { cell: "M64", section: "water_oil", sectionLabel: "Nước, dầu HFO và hơi", label: "Bồn dầu HFO 5 · mức dầu 06h", row: 64, column: 13 },
] as const;

// Công tơ và mức bồn theo giờ: workbook gốc được chép từ sheet ngày trước rồi sửa số,
// nên ô bỏ trống khi xuất file lấy số của ngày gần nhất trước đó.
export const CTKTKT_CARRY_FORWARD_INPUT_CELLS = new Set<string>(["M24", "N24", "O24", "P24", "Q24", "R24", "M25", "N25", "O25", "P25", "Q25", "R25", "M31", "N31", "O31", "P31", "Q31", "R31", "M32", "N32", "O32", "P32", "Q32", "R32", "M44", "N44", "O44", "P44", "Q44", "R44", "M45", "N45", "O45", "P45", "Q45", "R45", "M46", "N46", "O46", "P46", "Q46", "R46", "M52", "N52", "O52", "P52", "Q52", "R52", "M53", "N53", "O53", "P53", "Q53", "R53", "M54", "N54", "O54", "P54", "Q54", "R54", "M55", "N55", "O55", "P55", "Q55", "R55", "M56", "N56", "O56", "P56", "Q56", "R56", "M60", "N60", "O60", "P60", "Q60", "R60", "M61", "M62", "M63", "M64", "N61", "O61", "P61", "Q61", "R61", "N62", "O62", "P62", "Q62", "R62", "N63", "O63", "P63", "Q63", "R63", "N64", "O64", "P64", "Q64", "R64"]);

// Giờ vận hành / sửa chữa / sự cố / dự phòng lũy kế (hàng 68–69). X68 đã có trong danh sách sinh từ workbook.
// Ngày không nhập sẽ giữ số của ngày gần nhất trước đó khi xuất file.
export const CTKTKT_OPERATING_HOURS_CELLS = ["W68", "X68", "Y68", "Z68", "W69", "X69", "Y69", "Z69"] as const;
export const CTKTKT_OPERATING_HOURS_FIELDS = [
  { cell: "W68", section: "kpi_summary", sectionLabel: "Thời gian vận hành tổ máy", label: "S1 · Giờ vận hành lũy kế", row: 68, column: 23 },
  { cell: "Y68", section: "kpi_summary", sectionLabel: "Thời gian vận hành tổ máy", label: "S1 · Giờ sự cố lũy kế", row: 68, column: 25 },
  { cell: "Z68", section: "kpi_summary", sectionLabel: "Thời gian vận hành tổ máy", label: "S1 · Giờ dự phòng lũy kế", row: 68, column: 26 },
  { cell: "W69", section: "kpi_summary", sectionLabel: "Thời gian vận hành tổ máy", label: "S2 · Giờ vận hành lũy kế", row: 69, column: 23 },
  { cell: "X69", section: "kpi_summary", sectionLabel: "Thời gian vận hành tổ máy", label: "S2 · Giờ sửa chữa lũy kế", row: 69, column: 24 },
  { cell: "Y69", section: "kpi_summary", sectionLabel: "Thời gian vận hành tổ máy", label: "S2 · Giờ sự cố lũy kế", row: 69, column: 25 },
  { cell: "Z69", section: "kpi_summary", sectionLabel: "Thời gian vận hành tổ máy", label: "S2 · Giờ dự phòng lũy kế", row: 69, column: 26 },
] as const;

// Chỉ nhập tại ngày 01; các ngày sau tự tính trong lib/coal-stock.ts.
export const CTKTKT_COAL_STOCK_FIELDS = [
  { cell: "COAL_STOCK_24H_START", section: "kpi_summary", sectionLabel: "Chỉ tiêu KTKT tổng hợp", label: "Than tồn kho 24h ngày đầu tháng (t)", row: 0, column: 0 },
] as const;

export const CTKTKT_NH3_DCS_ADJUSTMENT_FIELDS = [
  { cell: "NH3_DCS_RESET_S1", section: "nh3_dcs", sectionLabel: "Tổng lượng NH3 dùng trong ngày theo công tơ DCS", label: "S1 · Hiệu chỉnh công tơ khi reset (tấn)", row: 0, column: 0 },
  { cell: "NH3_DCS_RESET_S2", section: "nh3_dcs", sectionLabel: "Tổng lượng NH3 dùng trong ngày theo công tơ DCS", label: "S2 · Hiệu chỉnh công tơ khi reset (tấn)", row: 0, column: 0 },
] as const;

export const CTKTKT_TEXT_INPUT_CELLS = new Set<string>([
  ...CTKTKT_COAL_ADJUSTMENT_NOTE_FIELDS.map(field => field.cell),
  ...CTKTKT_WATER_ADJUSTMENT_NOTE_FIELDS.map(field => field.cell),
  "STARTUP_UNIT",
  "STARTUP_EVENT",
  "STARTUP_EVENTS_JSON",
  "STARTUP_OIL_START_TIME",
  "STARTUP_GRID_SYNC_TIME",
  "STARTUP_MIN_LOAD_TIME",
]);
export const CTKTKT_NON_WORKBOOK_INPUT_CELLS = new Set<string>([
  ...CTKTKT_TEXT_INPUT_CELLS,
  ...CTKTKT_WATER_ADJUSTMENT_FIELDS.map(field => field.cell),
  ...CTKTKT_COAL_STOCK_FIELDS.map(field => field.cell),
  ...CTKTKT_NH3_DCS_ADJUSTMENT_FIELDS.map(field => field.cell),
  "STARTUP_UNIT",
  "STARTUP_EVENT",
  "STARTUP_EVENTS_JSON",
  "STARTUP_OIL_START_TIME",
  "STARTUP_GRID_SYNC_TIME",
  "STARTUP_MIN_LOAD_TIME",
  "STARTUP_MIN_LOAD_MW",
]);

export function normalizeCtktktInputValue(cell: string, rawValue: unknown) {
  const value = String(rawValue ?? "").trim();
  return CTKTKT_TEXT_INPUT_CELLS.has(cell) || cell === "T181"
    ? value
    : value.replace(/\s+/g, "").replace(",", ".");
}

export function getCtktktCoalAdjustmentNotes(row: Record<string, string>) {
  const notes: Record<string, string> = {};
  const s1 = row["KTKT:COAL_ADJ_NOTE_S1"]?.trim();
  const s2 = row["KTKT:COAL_ADJ_NOTE_S2"]?.trim();
  if (s1) for (const cell of ["W28", "Y28", "AA28"]) notes[cell] = `Lý do hiệu chỉnh S1: ${s1}`;
  if (s2) for (const cell of ["AG28", "AI28", "AK28"]) notes[cell] = `Lý do hiệu chỉnh S2: ${s2}`;
  return notes;
}

export function getCtktktWaterAdjustments(row: Record<string, string>) {
  const parseNum = (v?: string) => {
    if (!v) return 0;
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  return {
    adjS1: parseNum(row["KTKT:WATER_ADJ_S1"]),
    adjS2: parseNum(row["KTKT:WATER_ADJ_S2"]),
    noteS1: row["KTKT:WATER_ADJ_NOTE_S1"]?.trim() || "",
    noteS2: row["KTKT:WATER_ADJ_NOTE_S2"]?.trim() || "",
  };
}

export const CTKTKT_COAL_BLEND_FIELDS = [] as const;

export const CTKTKT_EXTRA_INPUT_FIELDS = [
  ...CTKTKT_BLANK_TEMPLATE_INPUT_FIELDS,
  ...CTKTKT_COAL_ADJUSTMENT_FIELDS,
  ...CTKTKT_COAL_ADJUSTMENT_NOTE_FIELDS,
  ...CTKTKT_WATER_ADJUSTMENT_FIELDS,
  ...CTKTKT_WATER_ADJUSTMENT_NOTE_FIELDS,
  ...CTKTKT_COAL_STOCK_FIELDS,
  ...CTKTKT_NH3_DCS_ADJUSTMENT_FIELDS,
  ...CTKTKT_OPERATING_HOURS_FIELDS,
  ...CTKTKT_COAL_BLEND_FIELDS,
] as const;

export const CTKTKT_LEGACY_UNUSED_COAL_BLEND_CELLS = new Set([
  "AI83", "AL83", "AI84", "AL84", "AI85", "AL85",
  "AL87", "AL88", "AL89", "AL90", "AL91", "AL92",
  "AN87", "AN88", "AN89", "AN90", "AN91", "AN92",
  "AO87", "AO88", "AO89", "AO90", "AO91", "AO92",
]);
