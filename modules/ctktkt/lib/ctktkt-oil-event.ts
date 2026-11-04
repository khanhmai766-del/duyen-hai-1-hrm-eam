export type CtktktOilEventCode = "startup" | "shutdown" | "incident_oil";

export type CtktktOilMeterColumn = {
  column: "C" | "D" | "E" | "F" | "G";
  label: string;
  timeCell: "STARTUP_OIL_START_TIME" | "STARTUP_GRID_SYNC_TIME" | "STARTUP_MIN_LOAD_TIME";
  timeLabel: string;
};

export const CTKTKT_OIL_EVENT_CONFIG: Record<CtktktOilEventCode, {
  label: string;
  columns: readonly CtktktOilMeterColumn[];
  phaseLabels: readonly string[];
}> = {
  startup: {
    label: "Khởi động",
    columns: [
      { column: "C", label: "Bắt đầu đốt dầu", timeCell: "STARTUP_OIL_START_TIME", timeLabel: "Giờ bắt đầu đốt dầu" },
      { column: "E", label: "Hòa lưới", timeCell: "STARTUP_GRID_SYNC_TIME", timeLabel: "Giờ hòa lưới" },
      { column: "G", label: "Cắt dầu kết thúc khởi động", timeCell: "STARTUP_MIN_LOAD_TIME", timeLabel: "Giờ cắt dầu kết thúc khởi động" },
    ],
    phaseLabels: ["Bắt đầu đốt dầu → hòa lưới", "Hòa lưới → cắt dầu kết thúc khởi động"],
  },
  shutdown: {
    label: "Ngừng",
    columns: [
      { column: "C", label: "Bắt đầu đốt dầu giảm tải", timeCell: "STARTUP_OIL_START_TIME", timeLabel: "Giờ bắt đầu đốt dầu giảm tải" },
      { column: "F", label: "Tách lưới", timeCell: "STARTUP_GRID_SYNC_TIME", timeLabel: "Giờ tách lưới" },
    ],
    phaseLabels: ["Bắt đầu đốt dầu giảm tải → tách lưới"],
  },
  incident_oil: {
    label: "Đốt dầu do sự cố",
    columns: [
      { column: "C", label: "Bắt đầu đốt dầu", timeCell: "STARTUP_OIL_START_TIME", timeLabel: "Giờ bắt đầu đốt dầu" },
      { column: "D", label: "Cắt dầu", timeCell: "STARTUP_MIN_LOAD_TIME", timeLabel: "Giờ cắt dầu khi hết sự cố" },
    ],
    phaseLabels: ["Bắt đầu đốt dầu → cắt dầu khi hết sự cố"],
  },
};

export function isCtktktOilEventCode(value: string): value is CtktktOilEventCode {
  return value === "startup" || value === "shutdown" || value === "incident_oil";
}
