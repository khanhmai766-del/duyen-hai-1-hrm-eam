import { DEFECT_STATUS, type DefectStatusKey } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { deliverTelegramNotification, escapeTelegramHtml } from "@/lib/telegram";
import { formatVietnamDate, vietnamDayKey, vietnamDayWindow } from "@/lib/vietnam-time";

const MORNING_MAX_ITEMS = 15;
const EVENING_COMPLETED_MAX_ITEMS = 12;
const EVENING_LEVEL_ONE_MAX_ITEMS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

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

type DigestDefect = Awaited<ReturnType<typeof loadMorningDefects>>[number];

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

async function loadMorningDefects(now: Date) {
  const yesterday = vietnamDayWindow(now, -1);
  return prisma.defect.findMany({
    where: {
      detectedAt: { gte: yesterday.start, lt: yesterday.end },
      cancelledAt: null,
      syncState: { not: "MISSING" },
    },
    select: DEFECT_DIGEST_SELECT,
  });
}

async function loadEveningDefects(now: Date) {
  const today = vietnamDayWindow(now);
  return Promise.all([
    prisma.defect.findMany({
      where: {
        status: "DA_XU_LY",
        completedAt: { gte: today.start, lt: today.end },
        cancelledAt: null,
      },
      select: DEFECT_DIGEST_SELECT,
      orderBy: [{ completedAt: "desc" }, { id: "asc" }],
    }),
    prisma.defect.findMany({
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
    }),
  ]);
}

function summaryBySeverity(rows: DigestDefect[]) {
  return ["1", "2", "3", "4"].map((severity) => {
    const count = rows.filter((row) => row.severity === severity).length;
    const icon = severity === "1" ? "🔴" : severity === "2" ? "🟠" : severity === "3" ? "🟡" : "⚪";
    return `${icon} Mức ${severity}: <b>${count}</b>`;
  });
}

export async function buildMorningDefectDigest(now: Date = new Date()) {
  const yesterday = vietnamDayWindow(now, -1);
  const rows = await loadMorningDefects(now);
  rows.sort((a, b) =>
    severityRank(a.severity) - severityRank(b.severity)
    || (b.detectedAt?.getTime() ?? b.createdAt.getTime()) - (a.detectedAt?.getTime() ?? a.createdAt.getTime())
  );
  const shown = rows.slice(0, MORNING_MAX_ITEMS);
  const lines = [
    `☀️ <b>KHIẾM KHUYẾT PHÁT SINH NGÀY ${escapeTelegramHtml(formatVietnamDate(yesterday.start))}</b>`,
    `Tổng cộng: <b>${rows.length}</b> phiếu`,
    ...summaryBySeverity(rows),
  ];
  if (shown.length > 0) {
    lines.push("", ...shown.map((row, index) => `${index + 1}. ${defectLine(row)}`));
    if (rows.length > shown.length) lines.push("", `… và ${rows.length - shown.length} phiếu khác.`);
  } else {
    lines.push("", "Không có khiếm khuyết phát sinh trong ngày.");
  }
  lines.push("", `<a href="${escapeTelegramHtml(`${appUrl()}/defects`)}">Xem danh sách trên hệ thống</a>`);
  return { message: lines.join("\n"), count: rows.length, periodKey: vietnamDayKey(yesterday.start) };
}

export async function buildEveningDefectDigest(now: Date = new Date()) {
  const [completed, levelOne] = await loadEveningDefects(now);
  const shownCompleted = completed.slice(0, EVENING_COMPLETED_MAX_ITEMS);
  const shownLevelOne = levelOne.slice(0, EVENING_LEVEL_ONE_MAX_ITEMS);
  const lines = [
    `🌙 <b>BÁO CÁO XỬ LÝ KHIẾM KHUYẾT ${escapeTelegramHtml(formatVietnamDate(now))}</b>`,
    "",
    `✅ <b>Đã xử lý hôm nay: ${completed.length} phiếu</b>`,
  ];
  if (shownCompleted.length > 0) {
    lines.push(...shownCompleted.map((row, index) => `${index + 1}. ${defectLine(row)}`));
    if (completed.length > shownCompleted.length) lines.push(`… và ${completed.length - shownCompleted.length} phiếu khác.`);
  } else {
    lines.push("Không có phiếu được đánh dấu đã xử lý trong ngày.");
  }
  lines.push("", `🚨 <b>MỨC 1 CÒN TỒN ĐỌNG: ${levelOne.length} phiếu</b>`);
  if (shownLevelOne.length > 0) {
    lines.push(...shownLevelOne.map((row, index) =>
      `${index + 1}. ${defectLine(row, { includeStatus: true, includeAge: true, now })}`
    ));
    if (levelOne.length > shownLevelOne.length) lines.push(`… và ${levelOne.length - shownLevelOne.length} phiếu Mức 1 khác.`);
  } else {
    lines.push("Không còn phiếu Mức 1 tồn đọng.");
  }
  lines.push("", `<a href="${escapeTelegramHtml(`${appUrl()}/defects?severity=1`)}">Xem khiếm khuyết Mức 1</a>`);
  return {
    message: lines.join("\n"),
    completedCount: completed.length,
    levelOneCount: levelOne.length,
    periodKey: vietnamDayKey(now),
  };
}

export async function runMorningDefectDigest(params?: { now?: Date; dryRun?: boolean }) {
  const digest = await buildMorningDefectDigest(params?.now);
  const delivery = await deliverTelegramNotification({
    type: "DEFECT_MORNING_DIGEST",
    periodKey: digest.periodKey,
    message: digest.message,
    dryRun: params?.dryRun,
    now: params?.now,
  });
  return { ...digest, delivery };
}

export async function runEveningDefectDigest(params?: { now?: Date; dryRun?: boolean }) {
  const digest = await buildEveningDefectDigest(params?.now);
  const delivery = await deliverTelegramNotification({
    type: "DEFECT_EVENING_DIGEST",
    periodKey: digest.periodKey,
    message: digest.message,
    dryRun: params?.dryRun,
    now: params?.now,
  });
  return { ...digest, delivery };
}
