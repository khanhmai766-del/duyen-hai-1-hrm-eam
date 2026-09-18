import { prisma } from "@/lib/prisma";

const TELEGRAM_API_TIMEOUT_MS = 15_000;
const TELEGRAM_MESSAGE_SAFE_LENGTH = 3_800;
const DELIVERY_STALE_MS = 10 * 60 * 1000;
const MAX_ERROR_LENGTH = 2_000;

type TelegramApiResponse = {
  ok?: boolean;
  description?: string;
  parameters?: { retry_after?: number };
  result?: { message_id?: number };
};

export type TelegramDeliveryResult = {
  enabled: boolean;
  allSucceeded: boolean;
  sent: number;
  skipped: number;
  busy: number;
  failed: number;
  errors: string[];
};

function envEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function telegramEnabled() {
  return envEnabled(process.env.TELEGRAM_ALERT_ENABLED);
}

export function telegramChatIds() {
  return Array.from(new Set(
    (process.env.TELEGRAM_CHAT_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  ));
}

export function escapeTelegramHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function splitTelegramMessage(message: string, maxLength = TELEGRAM_MESSAGE_SAFE_LENGTH) {
  const trimmed = message.trim();
  if (trimmed.length <= maxLength) return trimmed ? [trimmed] : [];

  const chunks: string[] = [];
  let rest = trimmed;
  while (rest.length > maxLength) {
    const candidate = rest.slice(0, maxLength);
    const splitAt = Math.max(candidate.lastIndexOf("\n\n"), candidate.lastIndexOf("\n"));
    const end = splitAt >= Math.floor(maxLength * 0.6) ? splitAt : maxLength;
    chunks.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTelegramChunk(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("Chưa cấu hình TELEGRAM_BOT_TOKEN");

  let lastError = "Telegram từ chối gửi tin nhắn";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Không kết nối được Telegram";
      if (attempt < 3) await wait(attempt * 1_000);
      continue;
    }

    const body = await response.json().catch(() => ({})) as TelegramApiResponse;
    if (response.ok && body.ok) return body.result?.message_id ?? null;
    lastError = body.description?.trim() || `Telegram trả HTTP ${response.status}`;
    if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
      const retryMs = Math.min(10_000, Math.max(1_000, (body.parameters?.retry_after ?? attempt) * 1_000));
      await wait(retryMs);
      continue;
    }
    break;
  }
  throw new Error(lastError);
}

export async function sendTelegramMessage(chatId: string, message: string) {
  const chunks = splitTelegramMessage(message);
  if (chunks.length === 0) throw new Error("Nội dung Telegram đang trống");
  const messageIds: Array<number | null> = [];
  for (const chunk of chunks) messageIds.push(await sendTelegramChunk(chatId, chunk));
  return messageIds;
}

async function claimDelivery(type: string, periodKey: string, chatId: string, now: Date) {
  const created = await prisma.telegramNotificationLog.createMany({
    data: [{ type, periodKey, chatId, status: "PENDING", attemptCount: 1, attemptedAt: now }],
    skipDuplicates: true,
  });
  if (created.count === 1) {
    const row = await prisma.telegramNotificationLog.findUniqueOrThrow({
      where: { type_periodKey_chatId: { type, periodKey, chatId } },
      select: { id: true },
    });
    return { id: row.id, state: "CLAIMED" as const };
  }

  const existing = await prisma.telegramNotificationLog.findUnique({
    where: { type_periodKey_chatId: { type, periodKey, chatId } },
    select: { id: true, status: true, attemptedAt: true },
  });
  if (!existing) return { id: null, state: "BUSY" as const };
  if (existing.status === "SENT") return { id: existing.id, state: "SENT" as const };

  const staleBefore = new Date(now.getTime() - DELIVERY_STALE_MS);
  const claimed = await prisma.telegramNotificationLog.updateMany({
    where: {
      id: existing.id,
      OR: [
        { status: "FAILED" },
        { status: "PENDING", attemptedAt: { lte: staleBefore } },
      ],
    },
    data: {
      status: "PENDING",
      attemptedAt: now,
      attemptCount: { increment: 1 },
      error: null,
    },
  });
  return { id: existing.id, state: claimed.count === 1 ? "CLAIMED" as const : "BUSY" as const };
}

export async function deliverTelegramNotification(params: {
  type: string;
  periodKey: string;
  message: string;
  dryRun?: boolean;
  now?: Date;
}): Promise<TelegramDeliveryResult> {
  const chatIds = telegramChatIds();
  if (!telegramEnabled()) {
    return { enabled: false, allSucceeded: false, sent: 0, skipped: 0, busy: 0, failed: 0, errors: [] };
  }
  if (chatIds.length === 0) {
    return {
      enabled: true,
      allSucceeded: false,
      sent: 0,
      skipped: 0,
      busy: 0,
      failed: 1,
      errors: ["Chưa cấu hình TELEGRAM_CHAT_IDS"],
    };
  }
  if (params.dryRun) {
    return { enabled: true, allSucceeded: true, sent: 0, skipped: chatIds.length, busy: 0, failed: 0, errors: [] };
  }

  const now = params.now ?? new Date();
  let sent = 0;
  let skipped = 0;
  let busy = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const chatId of chatIds) {
    const claim = await claimDelivery(params.type, params.periodKey, chatId, now);
    if (claim.state === "SENT") {
      skipped += 1;
      continue;
    }
    if (claim.state === "BUSY" || !claim.id) {
      busy += 1;
      continue;
    }
    try {
      await sendTelegramMessage(chatId, params.message);
      await prisma.telegramNotificationLog.update({
        where: { id: claim.id },
        data: { status: "SENT", sentAt: new Date(), error: null },
      });
      sent += 1;
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Không gửi được Telegram").slice(0, MAX_ERROR_LENGTH);
      await prisma.telegramNotificationLog.update({
        where: { id: claim.id },
        data: { status: "FAILED", error: message },
      });
      failed += 1;
      errors.push(`${chatId}: ${message}`);
    }
  }

  return {
    enabled: true,
    allSucceeded: failed === 0 && busy === 0 && sent + skipped === chatIds.length,
    sent,
    skipped,
    busy,
    failed,
    errors,
  };
}
