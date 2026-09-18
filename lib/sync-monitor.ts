import type { SyncMonitor } from "@prisma/client";
import { getDefectSyncTrafficMetrics } from "@/lib/defect-two-way-sync";
import { prisma } from "@/lib/prisma";
import { deliverTelegramNotification, escapeTelegramHtml } from "@/lib/telegram";
import { formatVietnamDateTime } from "@/lib/vietnam-time";

export const SYNC_MONITOR_STATUSES = ["UNKNOWN", "RUNNING", "SUCCESS", "FAILED"] as const;
export type SyncMonitorStatus = (typeof SYNC_MONITOR_STATUSES)[number];

const MINUTE_MS = 60_000;
const MAX_MONITOR_KEY_LENGTH = 100;
const MAX_MONITOR_NAME_LENGTH = 200;
const MAX_ERROR_LENGTH = 2_000;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function alertAfterMinutes() {
  return positiveInteger(process.env.TELEGRAM_SYNC_ALERT_AFTER_MINUTES, 30);
}

function reminderMinutes() {
  return positiveInteger(process.env.TELEGRAM_SYNC_REMINDER_MINUTES, 240);
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export async function reportSyncMonitor(params: {
  key: string;
  name: string;
  status: SyncMonitorStatus;
  error?: string | null;
  occurredAt?: Date;
  expectedIntervalMinutes?: number;
  alertAfterMinutes?: number;
}) {
  const key = cleanText(params.key, MAX_MONITOR_KEY_LENGTH).toUpperCase();
  const name = cleanText(params.name, MAX_MONITOR_NAME_LENGTH);
  if (!key || !/^[A-Z0-9_-]+$/.test(key)) throw new Error("Mã luồng đồng bộ không hợp lệ");
  if (!name) throw new Error("Thiếu tên luồng đồng bộ");
  if (!SYNC_MONITOR_STATUSES.includes(params.status)) throw new Error("Trạng thái đồng bộ không hợp lệ");
  const occurredAt = params.occurredAt ?? new Date();
  if (!Number.isFinite(occurredAt.getTime())) throw new Error("Thời điểm đồng bộ không hợp lệ");
  const error = cleanText(params.error, MAX_ERROR_LENGTH) || null;
  const expectedInterval = Math.max(0, Math.floor(params.expectedIntervalMinutes ?? 0));
  const alertMinutes = Math.max(1, Math.floor(params.alertAfterMinutes ?? alertAfterMinutes()));

  const statusData = params.status === "RUNNING"
    ? { lastStartedAt: occurredAt }
    : params.status === "SUCCESS"
      ? { lastSuccessAt: occurredAt, lastError: null }
      : params.status === "FAILED"
        ? { lastFailedAt: occurredAt, lastError: error || "Luồng đồng bộ báo thất bại" }
        : {};
  return prisma.syncMonitor.upsert({
    where: { key },
    create: {
      key,
      name,
      status: params.status,
      expectedIntervalMinutes: expectedInterval,
      alertAfterMinutes: alertMinutes,
      ...statusData,
    },
    update: {
      name,
      status: params.status,
      expectedIntervalMinutes: expectedInterval,
      alertAfterMinutes: alertMinutes,
      ...statusData,
    },
  });
}

async function reconcileDefectSourceMonitor(now: Date) {
  const latest = await prisma.defectSyncRun.findFirst({ orderBy: { startedAt: "desc" } });
  if (!latest) {
    return prisma.syncMonitor.upsert({
      where: { key: "DEFECT_SHEET_TO_WEB" },
      create: {
        key: "DEFECT_SHEET_TO_WEB",
        name: "Google Sheet → Khiếm khuyết",
        status: "UNKNOWN",
        alertAfterMinutes: alertAfterMinutes(),
      },
      update: { name: "Google Sheet → Khiếm khuyết", alertAfterMinutes: alertAfterMinutes() },
    });
  }
  return reportSyncMonitor({
    key: "DEFECT_SHEET_TO_WEB",
    name: "Google Sheet → Khiếm khuyết",
    status: latest.status as SyncMonitorStatus,
    occurredAt: latest.status === "RUNNING" ? latest.startedAt : latest.finishedAt ?? now,
    error: latest.error,
  });
}

async function reconcileDefectOutboxMonitor(now: Date) {
  const metrics = await getDefectSyncTrafficMetrics();
  if (metrics.failed > 0 || metrics.staleWaiting > 0) {
    const detail = [
      metrics.failed > 0 ? `${metrics.failed} thay đổi đang lỗi` : null,
      metrics.staleWaiting > 0 ? `${metrics.staleWaiting} thay đổi chờ quá 15 phút` : null,
    ].filter(Boolean).join("; ");
    return reportSyncMonitor({
      key: "DEFECT_WEB_TO_SHEET",
      name: "Khiếm khuyết → Google Sheet",
      status: "FAILED",
      occurredAt: metrics.oldestWaitingAt ?? now,
      error: detail,
    });
  }
  if (metrics.waiting > 0) {
    return reportSyncMonitor({
      key: "DEFECT_WEB_TO_SHEET",
      name: "Khiếm khuyết → Google Sheet",
      status: "RUNNING",
      occurredAt: metrics.oldestWaitingAt ?? now,
    });
  }
  return reportSyncMonitor({
    key: "DEFECT_WEB_TO_SHEET",
    name: "Khiếm khuyết → Google Sheet",
    status: "SUCCESS",
    occurredAt: now,
  });
}

async function reconcileBuiltInMonitors(now: Date) {
  await Promise.all([
    reconcileDefectSourceMonitor(now),
    reconcileDefectOutboxMonitor(now),
  ]);
}

type MonitorFailure = { since: Date; reason: string };

function monitorFailure(monitor: SyncMonitor, now: Date): MonitorFailure | null {
  if (monitor.status === "FAILED") {
    return {
      since: monitor.lastFailedAt ?? monitor.updatedAt,
      reason: monitor.lastError?.trim() || "Luồng đồng bộ báo thất bại",
    };
  }
  if (monitor.status === "RUNNING" && monitor.lastStartedAt) {
    if (now.getTime() - monitor.lastStartedAt.getTime() >= monitor.alertAfterMinutes * MINUTE_MS) {
      return { since: monitor.lastStartedAt, reason: "Lượt đồng bộ chạy quá thời gian cho phép" };
    }
    return null;
  }
  if (monitor.expectedIntervalMinutes > 0 && monitor.lastSuccessAt) {
    const expectedAt = new Date(monitor.lastSuccessAt.getTime() + monitor.expectedIntervalMinutes * MINUTE_MS);
    if (now.getTime() - expectedAt.getTime() >= monitor.alertAfterMinutes * MINUTE_MS) {
      return { since: expectedAt, reason: "Không ghi nhận lượt đồng bộ thành công đúng lịch" };
    }
  }
  return null;
}

function durationLabel(from: Date, to: Date) {
  const minutes = Math.max(0, Math.floor((to.getTime() - from.getTime()) / MINUTE_MS));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

function alertMessage(monitor: SyncMonitor, failure: MonitorFailure, now: Date, reminder = false) {
  return [
    reminder ? "🟠 <b>NHẮC LẠI SỰ CỐ ĐỒNG BỘ</b>" : "🔴 <b>CẢNH BÁO ĐỒNG BỘ</b>",
    `Luồng: <b>${escapeTelegramHtml(monitor.name)}</b>`,
    `Lỗi liên tục: ${escapeTelegramHtml(durationLabel(failure.since, now))}`,
    `Bắt đầu: ${escapeTelegramHtml(formatVietnamDateTime(failure.since))}`,
    monitor.lastSuccessAt
      ? `Thành công gần nhất: ${escapeTelegramHtml(formatVietnamDateTime(monitor.lastSuccessAt))}`
      : "Thành công gần nhất: Chưa có dữ liệu",
    `Lỗi: ${escapeTelegramHtml(failure.reason)}`,
  ].join("\n");
}

function recoveredMessage(monitor: SyncMonitor, incidentStartedAt: Date, now: Date) {
  return [
    "🟢 <b>ĐỒNG BỘ ĐÃ PHỤC HỒI</b>",
    `Luồng: <b>${escapeTelegramHtml(monitor.name)}</b>`,
    `Thời gian gián đoạn: ${escapeTelegramHtml(durationLabel(incidentStartedAt, now))}`,
    `Phục hồi lúc: ${escapeTelegramHtml(formatVietnamDateTime(now))}`,
  ].join("\n");
}

export async function runSyncMonitorJob(params?: { now?: Date; dryRun?: boolean }) {
  const now = params?.now ?? new Date();
  if (!params?.dryRun) await reconcileBuiltInMonitors(now);
  const monitors = await prisma.syncMonitor.findMany({
    where: { enabled: true },
    orderBy: { key: "asc" },
  });
  const results: Array<Record<string, unknown>> = [];

  for (let current of monitors) {
    const failure = monitorFailure(current, now);
    if (!failure) {
      if (current.alertedAt && current.incidentStartedAt) {
        const message = recoveredMessage(current, current.incidentStartedAt, now);
        const delivery = await deliverTelegramNotification({
          type: "SYNC_RECOVERED",
          periodKey: `${current.key}:${current.incidentStartedAt.toISOString()}`,
          message,
          dryRun: params?.dryRun,
          now,
        });
        if (!params?.dryRun && delivery.allSucceeded) {
          await prisma.syncMonitor.update({
            where: { key: current.key },
            data: {
              incidentStartedAt: null,
              alertedAt: null,
              lastReminderAt: null,
              recoveredAt: now,
            },
          });
        }
        results.push({ key: current.key, action: "RECOVERED", message, delivery });
      } else if (current.incidentStartedAt && !params?.dryRun) {
        await prisma.syncMonitor.update({
          where: { key: current.key },
          data: { incidentStartedAt: null, alertedAt: null, lastReminderAt: null, recoveredAt: now },
        });
        results.push({ key: current.key, action: "CLEARED_BEFORE_ALERT" });
      } else {
        results.push({ key: current.key, action: "HEALTHY" });
      }
      continue;
    }

    const incidentStartedAt = current.incidentStartedAt ?? failure.since;
    if (!current.incidentStartedAt && !params?.dryRun) {
      current = await prisma.syncMonitor.update({
        where: { key: current.key },
        data: { incidentStartedAt, recoveredAt: null },
      });
    }
    const dueAt = incidentStartedAt.getTime() + current.alertAfterMinutes * MINUTE_MS;
    if (now.getTime() < dueAt) {
      results.push({ key: current.key, action: "WAITING_THRESHOLD", dueAt: new Date(dueAt) });
      continue;
    }

    if (!current.alertedAt) {
      const message = alertMessage(current, failure, now);
      const delivery = await deliverTelegramNotification({
        type: "SYNC_ALERT",
        periodKey: `${current.key}:${incidentStartedAt.toISOString()}`,
        message,
        dryRun: params?.dryRun,
        now,
      });
      if (!params?.dryRun && delivery.allSucceeded) {
        await prisma.syncMonitor.update({ where: { key: current.key }, data: { alertedAt: now } });
      }
      results.push({ key: current.key, action: "ALERT", message, delivery });
      continue;
    }

    const lastNotice = current.lastReminderAt ?? current.alertedAt;
    const intervalMs = reminderMinutes() * MINUTE_MS;
    if (now.getTime() - lastNotice.getTime() >= intervalMs) {
      const reminderNumber = Math.max(1, Math.floor((now.getTime() - current.alertedAt.getTime()) / intervalMs));
      const message = alertMessage(current, failure, now, true);
      const delivery = await deliverTelegramNotification({
        type: "SYNC_REMINDER",
        periodKey: `${current.key}:${incidentStartedAt.toISOString()}:${reminderNumber}`,
        message,
        dryRun: params?.dryRun,
        now,
      });
      if (!params?.dryRun && delivery.allSucceeded) {
        await prisma.syncMonitor.update({ where: { key: current.key }, data: { lastReminderAt: now } });
      }
      results.push({ key: current.key, action: "REMINDER", message, delivery });
      continue;
    }
    results.push({ key: current.key, action: "ALREADY_ALERTED" });
  }

  return { checkedAt: now, monitors: results };
}
