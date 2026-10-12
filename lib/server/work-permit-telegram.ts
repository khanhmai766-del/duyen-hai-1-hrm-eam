import { Prisma, type WorkPermit, type WorkPermitSession, type WorkPermitTelegramOutbox } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deliverTelegramNotification, telegramChatIds, telegramEnabled } from "@/lib/telegram";
import { buildOverhaulDailyMessage, buildOverhaulSessionMessage, openingDueAt, overhaulTelegramEligible, splitOverhaulTelegramMessage, type ProgressBaseline } from "@/lib/work-permit-telegram-report";
import { overhaulItemKey, overhaulItemsOf, type OverhaulItemSnapshot } from "@/lib/work-permit-overhaul";
import { loadDailyWorkingByCompany } from "@/lib/server/work-permit-daily-working";
import { permitWorkingDay } from "@/lib/work-permit-daily-people";
import { vietnamDayWindow } from "@/lib/vietnam-time";

const DELIVERY_TYPE = "OVERHAUL_WORK_PERMIT";
const STALE_MS = 10 * 60_000;
const RETRY_MS = 60_000;
const openKey = (id: string) => `S:${id}:OPEN`;
const endKey = (id: string) => `S:${id}:END`;

/** Bật riêng sau khi SQL hàng đợi đã được áp dụng; mặc định không phát sinh bản tin trên dev. */
export function overhaulTelegramEnabled() {
  return ["1", "true", "yes", "on"].includes(process.env.TELEGRAM_OVERHAUL_ENABLED?.trim().toLowerCase() ?? "");
}

function baselines(value: unknown): ProgressBaseline[] {
  return Array.isArray(value) ? value.filter((item): item is ProgressBaseline => item && typeof item === "object"
    && typeof item.code === "string" && typeof item.sheet === "string" && typeof item.source === "string" && typeof item.percent === "number") : [];
}
function frozenMessages(value: unknown): Record<string, string[]> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([, chunks]) => Array.isArray(chunks) && chunks.length > 0 && chunks.every(chunk => typeof chunk === "string"))
    ? Object.fromEntries(entries) as Record<string, string[]> : null;
}

export async function enqueueOverhaulOpening(tx: Prisma.TransactionClient, permit: WorkPermit, session: WorkPermitSession, previous: Map<string, number>) {
  if (!overhaulTelegramEnabled() || !overhaulTelegramEligible(permit)) return;
  const baseline = overhaulItemsOf(permit.overhaulItems).map(item => ({ source: item.source, sheet: item.sheet, code: item.code, percent: previous.get(overhaulItemKey(item)) ?? 0 }));
  const dueAt = openingDueAt(session.openedAt);
  await tx.workPermitTelegramOutbox.upsert({ where: { dedupeKey: openKey(session.id) }, update: {},
    create: { dedupeKey: openKey(session.id), permitId: permit.id, sessionId: session.id, kind: "OPEN", dueAt, nextAttemptAt: dueAt, baseline } });
}

/** Hạng mục bổ sung sau khi mở ngày: chụp % trước lần cập nhật đầu tiên của mục đó. */
export async function captureOverhaulTelegramBaseline(tx: Prisma.TransactionClient, sessionId: string, items: OverhaulItemSnapshot[], previous: Map<string, number>) {
  if (!overhaulTelegramEnabled()) return;
  const key = openKey(sessionId);
  await tx.$queryRaw`SELECT "id" FROM "WorkPermitTelegramOutbox" WHERE "dedupeKey" = ${key} FOR UPDATE`;
  const row = await tx.workPermitTelegramOutbox.findUnique({ where: { dedupeKey: key } });
  if (!row) return;
  const baseline = baselines(row.baseline);
  const known = new Set(baseline.map(overhaulItemKey));
  const added = items.filter(item => !known.has(overhaulItemKey(item)))
    .map(item => ({ source: item.source, sheet: item.sheet, code: item.code, percent: previous.get(overhaulItemKey(item)) ?? 0 }));
  if (added.length) await tx.workPermitTelegramOutbox.update({ where: { id: row.id }, data: { baseline: [...baseline, ...added] } });
}

/** Cùng transaction với kết thúc: chốt nội dung và huỷ lịch mở còn chờ, nên không mất sự kiện khi reload. */
export async function enqueueOverhaulEnding(tx: Prisma.TransactionClient, permit: WorkPermit, session: WorkPermitSession, now = new Date()) {
  if (!overhaulTelegramEnabled() || !overhaulTelegramEligible(permit)) return;
  const opening = await tx.workPermitTelegramOutbox.findUnique({ where: { dedupeKey: openKey(session.id) } });
  const baseline = baselines(opening?.baseline);
  await tx.workPermitTelegramOutbox.updateMany({ where: { dedupeKey: openKey(session.id), state: { in: ["PENDING", "FAILED"] } },
    data: { state: "CANCELED", completedAt: now } });
  await tx.workPermitTelegramOutbox.upsert({ where: { dedupeKey: endKey(session.id) }, update: {},
    create: { dedupeKey: endKey(session.id), permitId: permit.id, sessionId: session.id, kind: "END", dueAt: now, nextAttemptAt: now,
      message: buildOverhaulSessionMessage(permit, session, "END", baseline, now),
      combinedMessage: buildOverhaulSessionMessage(permit, session, "COMBINED", baseline, now) } });
}

/** Bản tin 0h của ngày vừa kết thúc: chỉ PCT/nhân sự thuộc đại tu, số hiệu mỗi PCT không trùng. */
export async function buildOverhaulDailyDigest(now = new Date()) {
  const day = permitWorkingDay(vietnamDayWindow(now, -1).start);
  const [daily, roster] = await Promise.all([
    loadDailyWorkingByCompany(day, now, true),
    prisma.workPermitPerson.groupBy({ by: ["company"], where: { scope: "OVERHAUL" }, _count: { _all: true } }),
  ]);
  const totals = new Map(roster.map(row => [row.company, row._count._all]));
  const contractors = [...daily.byCompany].filter(([, count]) => count > 0).map(([company, worked]) => ({
    company, worked, totalPersonnel: totals.get(company) ?? 0,
    permitNumbers: [...(daily.permitsByCompany.get(company)?.values() ?? [])].sort((a, b) => a.localeCompare(b, "vi", { numeric: true })),
  })).sort((a, b) => a.company.localeCompare(b.company, "vi"));
  return { day, contractors, message: contractors.length ? buildOverhaulDailyMessage(day, contractors) : null };
}

type Delivery = typeof deliverTelegramNotification;
export function terminalMessageForChat(openingWasSent: boolean, endMessage: string, combinedMessage: string | null) {
  return openingWasSent ? endMessage : combinedMessage || endMessage;
}

async function prepareMessages(row: WorkPermitTelegramOutbox, now: Date, db = prisma, dryRun = false) {
  const chats = telegramChatIds("overhaul");
  if (!chats.length) throw new Error("Chưa cấu hình TELEGRAM_OVERHAUL_CHAT_IDS");
  const frozen = frozenMessages(row.messages);
  // Ngừng gửi tới nhóm đã bị gỡ khỏi cấu hình, kể cả bản tin đang chờ thử lại.
  if (frozen) return { messages: Object.fromEntries(Object.entries(frozen).filter(([chat]) => chats.includes(chat))) };
  let message = row.message;
  if (row.kind === "OPEN") {
    const session = row.sessionId ? await db.workPermitSession.findUnique({ where: { id: row.sessionId }, include: { permit: true } }) : null;
    // Kết thúc đã được lưu trong cùng transaction với hàng đợi END. Không gửi một thông báo mở muộn.
    if (!session || session.endedAt) return { canceled: true as const };
    message = buildOverhaulSessionMessage(session.permit, session, "OPEN", baselines(row.baseline), now);
  }
  if (!message) throw new Error("Nội dung báo cáo PCT đang trống");
  const messages: Record<string, string[]> = {};
  if (row.kind === "END" && row.sessionId) {
    const opening = await db.workPermitTelegramOutbox.findUnique({ where: { dedupeKey: openKey(row.sessionId) } });
    if (opening?.state === "PROCESSING" && opening.claimedAt && opening.claimedAt.getTime() > now.getTime() - STALE_MS) return { deferred: true as const };
    // Dừng cả lịch mở bị treo/đang chờ thử lại trước khi quyết định nội dung cho từng nhóm.
    if (!dryRun && opening && opening.state !== "SUCCESS" && opening.state !== "CANCELED") return { cancelOpening: opening.id };
    const sent = await db.telegramNotificationLog.findMany({ where: {
      type: DELIVERY_TYPE, periodKey: { startsWith: `${openKey(row.sessionId)}:part:` }, status: "SENT", chatId: { in: chats },
    }, select: { chatId: true } });
    const openedChats = new Set(sent.map(log => log.chatId));
    for (const chat of chats) messages[chat] = splitOverhaulTelegramMessage(terminalMessageForChat(openedChats.has(chat), message, row.combinedMessage));
  } else {
    for (const chat of chats) messages[chat] = splitOverhaulTelegramMessage(message);
  }
  return { messages };
}

/** Claim bằng CAS, lease 10 phút; mỗi đoạn/nhóm có khoá gửi riêng, retry không gửi lại đoạn đã SENT. */
export async function runOverhaulTelegramOutbox(params: { now?: Date; dryRun?: boolean; permitId?: string; deliver?: Delivery; db?: typeof prisma } = {}) {
  const now = params.now ?? new Date();
  const db = params.db ?? prisma;
  if (!params.dryRun && (!overhaulTelegramEnabled() || !telegramEnabled())) return { enabled: false, processed: 0, results: [] };
  const rows = await db.workPermitTelegramOutbox.findMany({ where: {
    ...(params.permitId ? { permitId: params.permitId } : {}), dueAt: { lte: now },
    OR: [{ state: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
      { state: "PROCESSING", claimedAt: { lte: new Date(now.getTime() - STALE_MS) } }],
  }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 10 });
  const results: Array<{ key: string; state: string; messages?: Record<string, string[]> }> = [];
  const started = Date.now();
  for (const candidate of rows) {
    if (Date.now() - started > 40_000) break;
    if (params.dryRun) {
      const preview = await prepareMessages(candidate, now, db, true);
      results.push({ key: candidate.dedupeKey, state: preview.canceled ? "CANCELED" : preview.messages ? "PREVIEW" : "WAITING", ...(preview.messages ? { messages: preview.messages } : {}) });
      continue;
    }
    const claimedAt = new Date();
    const claimed = await db.workPermitTelegramOutbox.updateMany({ where: { id: candidate.id,
      OR: [{ state: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
        { state: "PROCESSING", claimedAt: { lte: new Date(now.getTime() - STALE_MS) } }] },
      data: { state: "PROCESSING", claimedAt, attemptCount: { increment: 1 } } });
    if (!claimed.count) continue;
    const owned = { id: candidate.id, state: "PROCESSING", claimedAt };
    try {
      const row = await db.workPermitTelegramOutbox.findUniqueOrThrow({ where: { id: candidate.id } });
      let prepared = await prepareMessages(row, now, db);
      if (prepared.cancelOpening) {
        await db.workPermitTelegramOutbox.updateMany({ where: { id: prepared.cancelOpening,
          OR: [{ state: { in: ["PENDING", "FAILED"] } }, { state: "PROCESSING", claimedAt: { lte: new Date(now.getTime() - STALE_MS) } }] },
          data: { state: "CANCELED", completedAt: now } });
        prepared = await prepareMessages(row, now, db);
      }
      if (prepared.canceled) {
        await db.workPermitTelegramOutbox.updateMany({ where: owned, data: { state: "CANCELED", completedAt: now } });
        results.push({ key: row.dedupeKey, state: "CANCELED" });
        continue;
      }
      if (!prepared.messages) {
        await db.workPermitTelegramOutbox.updateMany({ where: owned, data: { state: "PENDING", nextAttemptAt: new Date(now.getTime() + RETRY_MS) } });
        results.push({ key: row.dedupeKey, state: "WAITING" });
        continue;
      }
      const saved = await db.workPermitTelegramOutbox.updateMany({ where: owned, data: { messages: prepared.messages } });
      if (!saved.count) continue;
      let complete = true;
      const errors: string[] = [];
      deliveryLoop: for (const [chat, chunks] of Object.entries(prepared.messages)) {
        for (const [index, message] of chunks.entries()) {
          if (Date.now() - started > 40_000) {
            complete = false;
            errors.push("Đã hết thời gian của lượt gửi; các đoạn còn lại được giữ để thử tiếp");
            break deliveryLoop;
          }
          const result = await (params.deliver ?? deliverTelegramNotification)({ type: DELIVERY_TYPE,
            periodKey: `${row.dedupeKey}:part:${index}`, message, chatIds: [chat], now });
          if (!result.allSucceeded) { complete = false; errors.push(...result.errors); break; }
        }
      }
      const state = complete ? "SUCCESS" : "FAILED";
      await db.workPermitTelegramOutbox.updateMany({ where: owned, data: { state,
        completedAt: complete ? now : null, lastError: complete ? null : errors.join("; ").slice(0, 2000) || "Chưa gửi xong tới mọi nhóm",
        nextAttemptAt: new Date(now.getTime() + RETRY_MS) } });
      results.push({ key: row.dedupeKey, state });
    } catch (error) {
      await db.workPermitTelegramOutbox.updateMany({ where: owned, data: { state: "FAILED", nextAttemptAt: new Date(now.getTime() + RETRY_MS),
        lastError: (error instanceof Error ? error.message : "Không gửi được báo cáo PCT").slice(0, 2000) } });
      results.push({ key: candidate.dedupeKey, state: "FAILED" });
    }
  }
  return { enabled: true, processed: results.length, results };
}

export async function runOverhaulDailyDigest(params: { now?: Date; dryRun?: boolean } = {}) {
  const now = params.now ?? new Date();
  if (!params.dryRun && !overhaulTelegramEnabled()) return { enabled: false };
  const digest = await buildOverhaulDailyDigest(now);
  if (params.dryRun || !digest.message) return { ...digest, dryRun: Boolean(params.dryRun) };
  // Nội dung ngày được chốt một lần. Lỗi Telegram được timer mỗi phút thử lại với đúng bản chốt.
  await prisma.workPermitTelegramOutbox.upsert({ where: { dedupeKey: `D:${digest.day}` }, update: {},
    create: { dedupeKey: `D:${digest.day}`, kind: "DAILY", dueAt: now, nextAttemptAt: now, message: digest.message } });
  return { ...digest, delivery: await runOverhaulTelegramOutbox({ now }) };
}

export async function pushOverhaulTelegramQuietly(permitId: string) {
  try { return await runOverhaulTelegramOutbox({ permitId }); }
  catch (error) { console.error("[telegram overhaul] Không xử lý được hàng đợi PCT đại tu", error); return null; }
}
