export type EquipmentDashboardDueStatus = "OVERDUE" | "DUE_SOON" | "OK";

export type EquipmentDashboardSystemRow = {
  name: string;
  devices: number;
  defects: number;
  warning: number;
};

export type EquipmentDashboardPositionRow = {
  name: string;
  value: number;
};

export type EquipmentDashboardStatusRow = {
  name: string;
  value: number;
};

export type EquipmentDashboardSignalRow = {
  code: string;
  name: string;
  system: string;
  managingPosition: string;
  repairCount: number;
  openDefectCount: number;
  replacementWarn: number;
  signalTotal: number;
  riskScore: number;
  recommendation: string;
};

export type EquipmentDashboardReplacementRow = {
  id: string;
  material: string;
  device: string;
  system: string;
  nextDueAt: string;
  daysLeft: number;
  status: EquipmentDashboardDueStatus;
};

export type EquipmentDashboardMonthlyRow = {
  month: string;
  detected: number;
  handled: number;
};

export type EquipmentDashboardData = {
  totalSystemDevices: number;
  systems: string[];
  positions: string[];
  openDefectCount: number;
  urgentDefectCount: number;
  dueGroups: Record<EquipmentDashboardDueStatus, number>;
  materialSummary: {
    totalGroups: number;
    categoryCount: number;
  };
  systemRowsByPosition: Record<string, EquipmentDashboardSystemRow[]>;
  positionRows: EquipmentDashboardPositionRow[];
  statusRows: EquipmentDashboardStatusRow[];
  defectChartRows: EquipmentDashboardSignalRow[];
  replacementChartRows: EquipmentDashboardSignalRow[];
  upcomingReplacements: EquipmentDashboardReplacementRow[];
  currentYear: number;
  monthlyTrendByRequestType: Record<string, EquipmentDashboardMonthlyRow[]>;
  repairYearCounts: Array<{ year: string; repairs: number }>;
};

export type EquipmentDashboardMeta = {
  cache: "HIT" | "MISS";
  durationMs: number;
  generatedAt: string;
};
