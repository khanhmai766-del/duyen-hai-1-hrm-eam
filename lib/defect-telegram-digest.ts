import { DEFECT_STATUS, type DefectStatusKey } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { deliverTelegramNotification, escapeTelegramHtml } from "@/lib/telegram";
import { formatVietnamDate, vietnamDayKey, vietnamDayWindow } from "@/lib/vietnam-time";

const SHIFT_NEW_MAX_ITEMS = 15;
const SHIFT_COMPLETED_MAX_ITEMS = 12;
const LEVEL_ONE_MAX_ITEMS = 20;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const DEFECT_DIGEST_SELECT = {
  id: true,
  unit: true,
  requestNumber: true,
  requestType: true,
  severity: true,
  status: true,
  content: true,
  system: true,
  device: true,
  detectedAt: true,
  completedAt: true,
  createdAt: true,
  postRepairAwaitingMaterial: true,
  node: { select: { name: true } },
} as const;

type DigestDefect = Awaited<ReturnType<typeof loadLevelOneDefects>>[number];
type DefectShift = "night" | "morning" | "afternoon";

const SHIFT_LABELS: Record<DefectShift, string> = {
  night: "CA ĐÊM",
  morning: "CA SÁNG",
  afternoon: "CA CHIỀU",
};

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://duyenhai1.vn").replace(/\/$/, "");
}

function text(value: string | null | undefined, fallback = "—") {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function shorten(value: string | null | undefined, maxLength = 110) {
  const normalized = text(value);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trimEnd()}…` : normalized;
}

function severityRank(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 4 ? parsed : 9;
}

function statusLabel(value: string) {
  return DEFECT_STATUS[value as DefectStatusKey]?.label ?? value;
}

function formatVietnamTime(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

function formatShiftRange(start: Date, end: Date) {
  const startDate = formatVietnamDate(start);
  const endDate = formatVietnamDate(end);
  const startText = `${formatVietnamTime(start)} ${startDate}`;
  const endText = startDate === endDate ? formatVietnamTime(end) : `${formatVietnamTime(end)} ${endDate}`;
  return `${startText} – ${endText}`;
}

/** Ca gần nhất đã kết thúc, an toàn cả khi timer chạy trễ vài phút. */
export function latestCompletedDefectShift(now: Date = new Date()) {
  const todayStart = vietnamDayWindow(now).start;
  const candidates: Array<{ shift: DefectShift; start: Date; end: Date }> = [];
  for (const dayOffset of [-1, 0]) {
    const dayStart = new Date(todayStart.getTime() + dayOffset * DAY_MS);
    candidates.push(
      {
        shift: "night",
        start: new Date(dayStart.getTime() - 2 * HOUR_MS),
        end: new Date(dayStart.getTime() + 6 * HOUR_MS),
      },
      {
        shift: "morning",
        start: new Date(dayStart.getTime() + 6 * HOUR_MS),
        end: new Date(dayStart.getTime() + 14 * HOUR_MS),
      },
      {
        shift: "afternoon",
        start: new Date(dayStart.getTime() + 14 * HOUR_MS),
        end: new Date(dayStart.getTime() + 22 * HOUR_MS),
      },
    );
  }
  const completed = candidates
    .filter((candidate) => candidate.end.getTime() <= now.getTime())
    .sort((a, b) => b.end.getTime() - a.end.getTime())[0];
  if (!completed) throw new Error("Không xác định được ca đã kết thúc gần nhất");
  return completed;
}

function defectLine(defect: DigestDefect, options?: { includeStatus?: boolean; includeAge?: boolean; now?: Date }) {
  const identity = text(defect.requestNumber, "Chưa có số YC");
  const device = text(defect.node?.name ?? defect.device, "Chưa gắn thiết bị");
  const parts = [
    `<b>${escapeTelegramHtml(identity)}</b> · ${escapeTelegramHtml(defect.unit)}`,
    defect.severity ? `Mức ${escapeTelegramHtml(defect.severity)}` : null,
    options?.includeStatus
      ? escapeTelegramHtml(defect.postRepairAwaitingMaterial ? "Chờ vật tư sau xử lý" : statusLabel(defect.status))
      : null,
  ].filter(Boolean).join(" · ");
  const detected = defect.detectedAt ?? defect.createdAt;
  const age = options?.includeAge
    ? ` · tồn ${Math.max(0, Math.floor(((options.now ?? new Date()).getTime() - detected.getTime()) / DAY_MS))} ngày`
    : "";
  return [
    parts,
    `Thiết bị: ${escapeTelegramHtml(device)}${age}`,
    `Nội dung: ${escapeTelegramHtml(shorten(defect.content))}`,
  ].join("\n");
}

async function loadShiftDefects(start: Date, end: Date) {
  return Promise.all([
    prisma.defect.findMany({
      where: {
        detectedAt: { gte: start, lt: end },
        cancelledAt: null,
        syncState: { not: "MISSING" },
      },
      select: DEFECT_DIGEST_SELECT,
      orderBy: [{ detectedAt: "desc" }, { id: "asc" }],
    }),
    prisma.defect.findMany({
      where: {
        status: "DA_XU_LY",
        completedAt: { gte: start, lt: end },
        cancelledAt: null,
      },
      select: DEFECT_DIGEST_SELECT,
      orderBy: [{ completedAt: "desc" }, { id: "asc" }],
    }),
  ]);
}

async function loadLevelOneDefects() {
  return prisma.defect.findMany({
    where: {
      severity: "1",
      cancelledAt: null,
      syncState: "ACTIVE",
      OR: [
        { status: { not: "DA_XU_LY" } },
        { postRepairAwaitingMaterial: true },
      ],
    },
    select: DEFECT_DIGEST_SELECT,
    orderBy: [{ detectedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
}

function summaryBySeverity(rows: DigestDefect[]) {
  return ["1", "2", "3", "4"].map((severity) => {
    const count = rows.filter((row) => row.severity === severity).length;
    const icon = severity === "1" ? "🔴" : severity === "2" ? "🟠" : severity === "3" ? "🟡" : "⚪";
    return `${icon} Mức ${severity}: <b>${count}</b>`;
  });
}

export async function buildShiftDefectDigest(now: Date = new Date()) {
  const window = latestCompletedDefectShift(now);
  const [created, completed] = await loadShiftDefects(window.start, window.end);
  created.sort((a, b) =>
    severityRank(a.severity) - severityRank(b.severity)
    || (b.detectedAt?.getTime() ?? b.createdAt.getTime()) - (a.detectedAt?.getTime() ?? a.createdAt.getTime())
  );
  const shownCreated = created.slice(0, SHIFT_NEW_MAX_ITEMS);
  const shownCompleted = completed.slice(0, SHIFT_COMPLETED_MAX_ITEMS);
  const lines = [
    `📋 <b>BÁO CÁO KHIẾM KHUYẾT ${SHIFT_LABELS[window.shift]}</b>`,
    `Thời gian: ${escapeTelegramHtml(formatShiftRange(window.start, window.end))}`,
    "",
    `🆕 <b>Phát sinh trong ca: ${created.length} phiếu</b>`,
    ...summaryBySeverity(created),
  ];
  if (shownCreated.length > 0) {
    lines.push("", ...shownCreated.map((row, index) => `${index + 1}. ${defectLine(row)}`));
    if (created.length > shownCreated.length) lines.push("", `… và ${created.length - shownCreated.length} phiếu khác.`);
  } else {
    lines.push("Không có khiếm khuyết phát sinh trong ca.");
  }
  lines.push("", `✅ <b>Đã xử lý xong trong ca: ${completed.length} phiếu</b>`);
  if (shownCompleted.length > 0) {
    lines.push(...shownCompleted.map((row, index) => `${index + 1}. ${defectLine(row)}`));
    if (completed.length > shownCompleted.length) lines.push(`… và ${completed.length - shownCompleted.length} phiếu khác.`);
  } else {
    lines.push("Không có phiếu được đánh dấu đã xử lý trong ca.");
  }
  lines.push("", `<a href="${escapeTelegramHtml(`${appUrl()}/defects`)}">Xem danh sách trên hệ thống</a>`);
  return {
    message: lines.join("\n"),
    createdCount: created.length,
    completedCount: completed.length,
    periodKey: `${vietnamDayKey(window.start)}:${window.shift}`,
    shift: window.shift,
    start: window.start,
    end: window.end,
  };
}

export async function buildLevelOneDefectDigest(now: Date = new Date()) {
  const rows = await loadLevelOneDefects();
  const shown = rows.slice(0, LEVEL_ONE_MAX_ITEMS);
  const lines = [
    "🚨 <b>KHIẾM KHUYẾT MỨC 1 CÒN TỒN ĐỌNG</b>",
    `Thời điểm: 07:00 ngày ${escapeTelegramHtml(formatVietnamDate(now))}`,
    `Tổng cộng: <b>${rows.length} phiếu</b>`,
  ];
  if (shown.length > 0) {
    lines.push("", ...shown.map((row, index) =>
      `${index + 1}. ${defectLine(row, { includeStatus: true, includeAge: true, now })}`
    ));
    if (rows.length > shown.length) lines.push("", `… và ${rows.length - shown.length} phiếu Mức 1 khác.`);
  } else {
    lines.push("", "Không còn phiếu Mức 1 tồn đọng.");
  }
  lines.push("", `<a href="${escapeTelegramHtml(`${appUrl()}/defects?severity=1`)}">Xem khiếm khuyết Mức 1</a>`);
  return { message: lines.join("\n"), count: rows.length, periodKey: vietnamDayKey(now) };
}

export async function runShiftDefectDigest(params?: { now?: Date; dryRun?: boolean }) {
  const digest = await buildShiftDefectDigest(params?.now);
  const delivery = await deliverTelegramNotification({
    type: "DEFECT_SHIFT_DIGEST",
    periodKey: digest.periodKey,
    message: digest.message,
    dryRun: params?.dryRun,
    now: params?.now,
  });
  return { ...digest, delivery };
}

export async function runLevelOneDefectDigest(params?: { now?: Date; dryRun?: boolean }) {
  const digest = await buildLevelOneDefectDigest(params?.now);
  const delivery = await deliverTelegramNotification({
    type: "DEFECT_LEVEL_ONE_DIGEST",
    periodKey: digest.periodKey,
    message: digest.message,
    dryRun: params?.dryRun,
    now: params?.now,
  });
  return { ...digest, delivery };
}
