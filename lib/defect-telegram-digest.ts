import { DEFECT_STATUS, type DefectStatusKey } from "@/lib/constants";
import { outstandingDefectWhere } from "@/lib/defect-active-where";
import { DEFECT_RESOLVED_AUDIT_ACTION } from "@/lib/defect-audit";
import { prisma } from "@/lib/prisma";
import { deliverTelegramNotification, escapeTelegramHtml } from "@/lib/telegram";
import { formatVietnamDate, vietnamDayKey, vietnamDayWindow } from "@/lib/vietnam-time";
import { materialTicketReference } from "@/lib/material-ticket-sequence";

const SHIFT_NEW_MAX_ITEMS = 15;
const SHIFT_COMPLETED_MAX_ITEMS = 12;
const SHIFT_MATERIAL_MAX_ITEMS = 15;
const LEVEL_ONE_MAX_ITEMS = 20;
const WEEKLY_OLDEST_MAX_ITEMS = 5;
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
  sourceDeviceRaw: true,
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

function defectAgeMs(defect: DigestDefect, now: Date) {
  return Math.max(0, now.getTime() - (defect.detectedAt ?? defect.createdAt).getTime());
}

function defectLine(defect: DigestDefect, options?: { includeStatus?: boolean; includeAge?: boolean; highlightAge?: boolean; now?: Date }) {
  const identity = text(defect.requestNumber, "Chưa có số YC");
  const device = text(defect.node?.name ?? defect.sourceDeviceRaw ?? defect.device, "Chưa gắn thiết bị");
  const parts = [
    `<b>${escapeTelegramHtml(identity)}</b> · ${escapeTelegramHtml(defect.unit)}`,
    defect.severity ? `Mức ${escapeTelegramHtml(defect.severity)}` : null,
    options?.includeStatus
      ? escapeTelegramHtml(defect.postRepairAwaitingMaterial ? "Chờ vật tư sau xử lý" : statusLabel(defect.status))
      : null,
  ].filter(Boolean).join(" · ");
  const ageMs = defectAgeMs(defect, options?.now ?? new Date());
  const age = options?.includeAge
    ? ` · tồn ${Math.floor(ageMs / DAY_MS)} ngày`
    : "";
  const ageWarning = options?.highlightAge
    ? ageMs > 7 * DAY_MS
      ? " · 🔴 QUÁ 7 NGÀY"
      : ageMs > DAY_MS
        ? " · ⚠️ QUÁ 24 GIỜ"
        : ""
    : "";
  return [
    parts,
    `Thiết bị: ${escapeTelegramHtml(device)}${age}${ageWarning}`,
    `Nội dung: ${escapeTelegramHtml(shorten(defect.content))}`,
  ].join("\n");
}

/**
 * Id các phiếu website chuyển từ trạng thái khác sang Đã xử lý trong [start, end), lần chuyển
 * gần nhất xếp trước. Không dùng completedAt vì trường này còn bị ghi lại khi VHV xác nhận
 * lưu lịch sử phiếu đã ở Đã xử lý sẵn (đợt dọn tồn 14/09 làm số tuần đó phình lên 550).
 */
async function defectIdsResolvedOnWebsite(start: Date, end: Date) {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: DEFECT_RESOLVED_AUDIT_ACTION,
      entity: "Defect",
      entityId: { not: null },
      createdAt: { gte: start, lt: end },
    },
    select: { entityId: true },
    orderBy: { createdAt: "desc" },
  });
  return [...new Set(rows.flatMap((row) => (row.entityId ? [row.entityId] : [])))];
}

/** Chỉ tính phiếu hiện vẫn ở Đã xử lý; phiếu bị mở lại hoặc hủy sau đó không tính. */
async function loadDefectsResolvedOnWebsite(start: Date, end: Date) {
  const ids = await defectIdsResolvedOnWebsite(start, end);
  if (ids.length === 0) return [];
  const rows = await prisma.defect.findMany({
    where: { id: { in: ids }, status: "DA_XU_LY", cancelledAt: null },
    select: DEFECT_DIGEST_SELECT,
  });
  const order = new Map(ids.map((id, index) => [id, index]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

async function countDefectsResolvedOnWebsite(start: Date, end: Date) {
  const ids = await defectIdsResolvedOnWebsite(start, end);
  if (ids.length === 0) return 0;
  return prisma.defect.count({
    where: { id: { in: ids }, status: "DA_XU_LY", cancelledAt: null },
  });
}

async function loadShiftDefects(start: Date, end: Date) {
  return Promise.all([
    // "Phát sinh trong ca" phải dựa vào createdAt (lúc hệ thống thực sự ghi
    // nhận phiếu, dù đồng bộ từ Sheet hay tạo trên web) chứ không phải
    // detectedAt — detectedAt chỉ là NGÀY lấy từ Sheet (không có giờ), luôn
    // được chuẩn hoá về ~7h sáng giờ VN nên không bao giờ rơi vào khung ca
    // chiều/ca đêm, khiến hai ca đó luôn báo 0 phiếu dù thực tế có phát sinh.
    prisma.defect.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        cancelledAt: null,
        syncState: { not: "MISSING" },
      },
      select: DEFECT_DIGEST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
    loadDefectsResolvedOnWebsite(start, end),
  ]);
}

function loadShiftMaterialTickets(start: Date, end: Date) {
  return prisma.materialTicket.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: {
      sequenceMonth: true,
      sequenceNumber: true,
      sequenceScope: true,
      unit: true,
      assignedPosition: true,
      materialCategory: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });
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
  const [[created, completed], materialTickets] = await Promise.all([
    loadShiftDefects(window.start, window.end),
    loadShiftMaterialTickets(window.start, window.end),
  ]);
  created.sort((a, b) =>
    severityRank(a.severity) - severityRank(b.severity)
    || b.createdAt.getTime() - a.createdAt.getTime()
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
  const shownMaterialTickets = materialTickets.slice(0, SHIFT_MATERIAL_MAX_ITEMS);
  lines.push("", `📦 <b>Phiếu vật tư mới tạo trong ca: ${materialTickets.length} phiếu</b>`);
  if (shownMaterialTickets.length > 0) {
    lines.push(...shownMaterialTickets.map((ticket, index) =>
      `${index + 1}. ${escapeTelegramHtml(materialTicketReference(ticket))} · ${escapeTelegramHtml(ticket.unit)} · ${escapeTelegramHtml(ticket.materialCategory ?? ticket.assignedPosition)} · ${escapeTelegramHtml(ticket.assignedPosition)}`
    ));
    if (materialTickets.length > shownMaterialTickets.length) {
      lines.push(`… và ${materialTickets.length - shownMaterialTickets.length} phiếu khác.`);
    }
  } else {
    lines.push("Không có phiếu vật tư mới tạo trong ca.");
  }
  lines.push("", `<a href="${escapeTelegramHtml(`${appUrl()}/defects`)}">Xem danh sách trên hệ thống</a>`);
  return {
    message: lines.join("\n"),
    createdCount: created.length,
    completedCount: completed.length,
    materialTicketCount: materialTickets.length,
    periodKey: `${vietnamDayKey(window.start)}:${window.shift}`,
    shift: window.shift,
    start: window.start,
    end: window.end,
  };
}

export async function buildLevelOneDefectDigest(now: Date = new Date()) {
  const rows = await loadLevelOneDefects();
  const shown = rows.slice(0, LEVEL_ONE_MAX_ITEMS);
  const olderThanOneDay = rows.filter((row) => defectAgeMs(row, now) > DAY_MS).length;
  const olderThanSevenDays = rows.filter((row) => defectAgeMs(row, now) > 7 * DAY_MS).length;
  const lines = [
    "🚨 <b>KHIẾM KHUYẾT MỨC 1 CÒN TỒN ĐỌNG</b>",
    `Thời điểm: 07:00 ngày ${escapeTelegramHtml(formatVietnamDate(now))}`,
    `Tổng cộng: <b>${rows.length} phiếu</b>`,
    `⚠️ Tồn trên 24 giờ: <b>${olderThanOneDay}</b>`,
    `🔴 Tồn trên 7 ngày: <b>${olderThanSevenDays}</b>`,
  ];
  if (shown.length > 0) {
    lines.push("", ...shown.map((row, index) =>
      `${index + 1}. ${defectLine(row, { includeStatus: true, includeAge: true, highlightAge: true, now })}`
    ));
    if (rows.length > shown.length) lines.push("", `… và ${rows.length - shown.length} phiếu Mức 1 khác.`);
  } else {
    lines.push("", "Không còn phiếu Mức 1 tồn đọng.");
  }
  lines.push("", `<a href="${escapeTelegramHtml(`${appUrl()}/defects?severity=1`)}">Xem khiếm khuyết Mức 1</a>`);
  return { message: lines.join("\n"), count: rows.length, periodKey: vietnamDayKey(now) };
}

function previousVietnamWeekWindow(now: Date) {
  const todayStart = vietnamDayWindow(now).start;
  const local = new Date(now.getTime() + 7 * HOUR_MS);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const end = new Date(todayStart.getTime() - daysSinceMonday * DAY_MS);
  return { start: new Date(end.getTime() - 7 * DAY_MS), end };
}

export async function buildWeeklyDefectDigest(now: Date = new Date()) {
  const week = previousVietnamWeekWindow(now);
  const [created, completed, outstanding] = await Promise.all([
    prisma.defect.findMany({
      where: {
        detectedAt: { gte: week.start, lt: week.end },
        cancelledAt: null,
        syncState: { not: "MISSING" },
      },
      select: DEFECT_DIGEST_SELECT,
    }),
    countDefectsResolvedOnWebsite(week.start, week.end),
    // Tồn = phiếu còn hiện trên trang Khiếm khuyết (dùng chung bộ lọc với web),
    // nhưng không tính phiếu đã xử lý bình thường còn lưu 14 ngày để xem lại.
    // Phiếu đã xử lý nhưng còn đánh dấu chờ vật tư vẫn là tồn đọng thực tế.
    prisma.defect.findMany({
      where: outstandingDefectWhere(now),
      select: DEFECT_DIGEST_SELECT,
      orderBy: [{ detectedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
  ]);
  // Dòng riêng, là một phần của tổng tồn.
  const awaitingMaterialCount = outstanding.filter(
    (row) => row.status === "CHO_VAT_TU" || row.postRepairAwaitingMaterial
  ).length;
  const deviceCounts = new Map<string, number>();
  for (const row of created) {
    const device = text(row.node?.name ?? row.sourceDeviceRaw ?? row.device, "Chưa gắn thiết bị");
    deviceCounts.set(device, (deviceCounts.get(device) ?? 0) + 1);
  }
  const topDevices = [...deviceCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "vi"))
    .slice(0, 3);
  const levelOneCount = outstanding.filter((row) => row.severity === "1").length;
  const oldest = outstanding.slice(0, WEEKLY_OLDEST_MAX_ITEMS);
  const lines = [
    "📊 <b>BÁO CÁO KHIẾM KHUYẾT TUẦN</b>",
    `Thời gian: ${escapeTelegramHtml(formatVietnamDate(week.start))} – ${escapeTelegramHtml(formatVietnamDate(new Date(week.end.getTime() - 1)))}`,
    "",
    `🆕 Phát sinh trong tuần: <b>${created.length} phiếu</b>`,
    `✅ Đã xử lý trong tuần: <b>${completed} phiếu</b>`,
    `📌 Tổng còn tồn hiện tại: <b>${outstanding.length} phiếu</b>`,
    `📦 Trong đó chờ vật tư: <b>${awaitingMaterialCount} phiếu</b>`,
    `🚨 Mức 1 còn tồn: <b>${levelOneCount} phiếu</b>`,
    "",
    "<b>Thiết bị phát sinh nhiều khiếm khuyết nhất:</b>",
    ...(topDevices.length > 0
      ? topDevices.map(([device, count], index) => `${index + 1}. ${escapeTelegramHtml(device)}: <b>${count}</b> phiếu`)
      : ["Không có khiếm khuyết phát sinh trong tuần."]),
    "",
    "<b>Khiếm khuyết tồn lâu nhất:</b>",
  ];
  if (oldest.length > 0) {
    lines.push(...oldest.map((row, index) =>
      `${index + 1}. ${defectLine(row, { includeStatus: true, includeAge: true, now })}`
    ));
  } else {
    lines.push("Không còn khiếm khuyết tồn đọng.");
  }
  lines.push("", `<a href="${escapeTelegramHtml(`${appUrl()}/reports`)}">Xem báo cáo trên hệ thống</a>`);
  return {
    message: lines.join("\n"),
    createdCount: created.length,
    completedCount: completed,
    outstandingCount: outstanding.length,
    awaitingMaterialCount,
    levelOneCount,
    periodKey: vietnamDayKey(week.start),
  };
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

export async function runWeeklyDefectDigest(params?: { now?: Date; dryRun?: boolean }) {
  const digest = await buildWeeklyDefectDigest(params?.now);
  const delivery = await deliverTelegramNotification({
    type: "DEFECT_WEEKLY_DIGEST",
    periodKey: digest.periodKey,
    message: digest.message,
    dryRun: params?.dryRun,
    now: params?.now,
  });
  return { ...digest, delivery };
}
