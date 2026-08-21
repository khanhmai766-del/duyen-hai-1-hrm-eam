import type { DefectSyncRun } from "@prisma/client";

export const DEFECT_SYNC_DESTINATIONS = [
  { key: "CO", label: "Cơ", source: "CO", sourceLabel: "Sheet Cơ", sheetName: "DH1" },
  { key: "HOA", label: "Hóa", source: "CO", sourceLabel: "Sheet Cơ", sheetName: "VH1_HOA" },
  { key: "DIEN", label: "Điện / I&C", source: "DIEN", sourceLabel: "Sheet Điện", sheetName: "DH1" },
  { key: "MOI_TRUONG_CO", label: "Môi Trường – Cơ", source: "CO", sourceLabel: "Sheet Cơ", sheetName: "DH1 MTruong" },
  { key: "MOI_TRUONG_DIEN", label: "Môi Trường – Điện", source: "DIEN", sourceLabel: "Sheet Điện", sheetName: "DH1 qt OL" },
] as const;

export type DefectSyncHealthLevel = "HEALTHY" | "WARNING" | "ERROR";

export type DefectSyncHealthIssue = {
  level: Exclude<DefectSyncHealthLevel, "HEALTHY">;
  message: string;
};

export type DefectSyncHealth = {
  level: DefectSyncHealthLevel;
  issues: DefectSyncHealthIssue[];
  queue: {
    waiting: number;
    failed: number;
    stale: number;
    processing: number;
    oldestWaitingAt: Date | null;
  };
  sources: Array<{
    source: "CO" | "DIEN";
    label: string;
    configuredBy: "ENVIRONMENT" | "PRODUCTION_DEFAULT";
    lastSuccessAt: Date | null;
  }>;
  destinations: Array<{
    key: string;
    label: string;
    source: "CO" | "DIEN";
    sourceLabel: string;
    sheetName: string;
    configured: boolean;
  }>;
};

type TrafficMetrics = {
  waiting: number;
  failed: number;
  staleWaiting: number;
  processing: number;
  oldestWaitingAt: Date | null;
};

const RUN_TIMEOUT_MS = 30 * 60 * 1000;

export function buildDefectSyncHealth(params: {
  latestRun: DefectSyncRun | null;
  metrics: TrafficMetrics;
  spreadsheetIds: Record<"CO" | "DIEN", string>;
  lastSuccessAt: Record<"CO" | "DIEN", Date | null>;
  now?: Date;
}): DefectSyncHealth {
  const now = params.now ?? new Date();
  const issues: DefectSyncHealthIssue[] = [];
  const coId = params.spreadsheetIds.CO.trim();
  const dienId = params.spreadsheetIds.DIEN.trim();

  if (!coId) issues.push({ level: "ERROR", message: "Chưa cấu hình Google Sheet Cơ" });
  if (!dienId) issues.push({ level: "ERROR", message: "Chưa cấu hình Google Sheet Điện" });
  if (coId && dienId && coId === dienId) {
    issues.push({ level: "ERROR", message: "Google Sheet Cơ và Điện đang dùng cùng một ID" });
  }

  const latestRun = params.latestRun;
  if (latestRun?.status === "FAILED") {
    issues.push({
      level: "ERROR",
      message: latestRun.error?.trim() || "Lượt nhận dữ liệu Google Sheet gần nhất thất bại",
    });
  }
  if (
    latestRun?.status === "RUNNING"
    && now.getTime() - latestRun.startedAt.getTime() > RUN_TIMEOUT_MS
  ) {
    issues.push({ level: "ERROR", message: "Lượt nhận dữ liệu đang chạy quá 30 phút" });
  }
  if (params.metrics.failed > 0) {
    issues.push({
      level: "ERROR",
      message: `${params.metrics.failed} thay đổi ghi sang Google Sheet đang lỗi`,
    });
  }
  if (params.metrics.staleWaiting > 0) {
    issues.push({
      level: "WARNING",
      message: `${params.metrics.staleWaiting} thay đổi chờ ghi sang Sheet quá 15 phút`,
    });
  } else if (params.metrics.waiting > 0) {
    issues.push({
      level: "WARNING",
      message: `${params.metrics.waiting} thay đổi đang chờ ghi sang Google Sheet`,
    });
  }

  const level: DefectSyncHealthLevel = issues.some((issue) => issue.level === "ERROR")
    ? "ERROR"
    : issues.length > 0
      ? "WARNING"
      : "HEALTHY";

  const destinations = DEFECT_SYNC_DESTINATIONS.map((destination) => ({
    ...destination,
    configured: Boolean(params.spreadsheetIds[destination.source].trim()),
  }));

  return {
    level,
    issues,
    queue: {
      waiting: params.metrics.waiting,
      failed: params.metrics.failed,
      stale: params.metrics.staleWaiting,
      processing: params.metrics.processing,
      oldestWaitingAt: params.metrics.oldestWaitingAt,
    },
    sources: [
      {
        source: "CO",
        label: "Sheet Cơ",
        configuredBy: process.env.N8N_DEFECT_CO_SPREADSHEET_ID?.trim()
          ? "ENVIRONMENT"
          : "PRODUCTION_DEFAULT",
        lastSuccessAt: params.lastSuccessAt.CO,
      },
      {
        source: "DIEN",
        label: "Sheet Điện",
        configuredBy: process.env.N8N_DEFECT_DIEN_SPREADSHEET_ID?.trim()
          ? "ENVIRONMENT"
          : "PRODUCTION_DEFAULT",
        lastSuccessAt: params.lastSuccessAt.DIEN,
      },
    ],
    destinations,
  };
}
