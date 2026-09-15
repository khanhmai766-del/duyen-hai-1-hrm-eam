import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, requireUser } from "@/lib/api";
import { hasAssignedPermissionLevel } from "@/lib/rbac-permissions";
import { createAiCapability } from "@/lib/ai-auth";
import { aiError, type AiErrorCode } from "@/lib/ai-webhook-response";
import { relayN8nResponse, type AiRelayResult } from "@/lib/ai-chat-relay";
import { AiQueueTimeoutError, createAiChatQueue } from "@/lib/ai-chat-queue";
import {
  AI_MAX_CITATIONS,
  aiRequestCitations,
  closeAiRequest,
  openAiRequest,
  subscribeAiRequest,
} from "@/lib/ai-request-registry";
import type { AiChatStreamEvent } from "@/lib/ai-chat-stream";
import {
  AI_CHAT_HISTORY_LIMIT,
  AI_CHAT_MAX_QUESTION_LENGTH,
  aiConversationExpiry,
  cleanupExpiredAiConversations,
  sanitizeAiCitations,
  type AiCitation,
} from "@/lib/ai-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function envNumber(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/**
 * Không nhận được byte nào từ n8n trong khoảng này thì dừng. n8n phát keepalive mỗi 30 giây
 * khi streaming nên sàn 35 giây; với workflow JSON kiểu cũ đây cũng là thời gian chờ cả câu.
 */
const IDLE_TIMEOUT_MS = envNumber("AI_CHAT_TIMEOUT_MS", 45_000, 35_000, 90_000);
/** Trần cả lượt hỏi, kể cả các lần thử lại — phải dưới hạn 120 giây của capability. */
const TOTAL_TIMEOUT_MS = 110_000;
/**
 * Hàng đợi (lib/ai-chat-queue.ts): gói miễn phí giới hạn lượt gọi mô hình mỗi phút, một câu hỏi
 * tốn 2–3 lượt. Mặc định 3 câu chạy cùng lúc, 8 câu bắt đầu mỗi phút — Gemini gánh phần đầu,
 * phần vượt 429 chuyển sang Groq dự phòng; ai tới sau chờ tối đa 60 giây.
 */
const aiChatQueue = createAiChatQueue({
  maxConcurrent: envNumber("AI_CHAT_MAX_CONCURRENT", 3, 1, 10),
  maxPerWindow: envNumber("AI_CHAT_MAX_PER_MINUTE", 8, 1, 60),
  timeoutMs: 60_000,
});
/**
 * Ngữ cảnh hội thoại gửi kèm: 3 cặp hỏi–đáp gần nhất, mỗi tin 400 ký tự là đủ ý chính. Lịch sử
 * được gửi lại ở MỌI vòng suy luận nên tốn token gấp nhiều lần — Groq dự phòng chỉ 8.000 token/phút.
 */
const HISTORY_MESSAGES_FOR_MODEL = 6;
const HISTORY_MESSAGE_LIMIT = 400;
/** nginx của website cắt kết nối im lặng quá 60 giây (proxy_read_timeout). */
const PING_INTERVAL_MS = 15_000;
/** Chỉ thử lại khi CHƯA phát chữ nào — đã hiện nửa câu thì thử lại sẽ ra câu khác. */
const RETRYABLE = new Set<AiErrorCode>(["AI_PROVIDER_UNAVAILABLE", "AI_PROVIDER_RATE_LIMITED", "AI_CONNECTION_FAILED"]);
const RETRY_DELAYS_MS = [2_000, 5_000];

const activeUsers = new Set<string>();

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function titleFromQuestion(question: string) {
  return question.replace(/\s+/g, " ").trim().slice(0, 80);
}

function errorEvent(code: AiErrorCode, partial = false): AiChatStreamEvent {
  return { type: "error", code, message: aiError(code).message, partial };
}

function mergeCitations(...groups: AiCitation[][]) {
  const seen = new Set<string>();
  return groups.flat().filter((citation) => {
    const key = `${citation.sourceType}:${citation.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, AI_MAX_CITATIONS);
}

async function requireAiChatPermission(user: { id?: string; role?: string }) {
  if (!(await hasAssignedPermissionLevel(user, "ai-chat", ["read", "personal", "manage", "full"]))) {
    throw fail("Bạn chưa được phân quyền sử dụng trợ lý AI", 403);
  }
}

type ChatUser = Awaited<ReturnType<typeof requireUser>>;

type ChatContext = {
  user: ChatUser;
  question: string;
  conversationId: string;
  isNewConversation: boolean;
  history: Array<{ role: string; content: string }>;
  webhookUrl: string;
  webhookToken: string;
  send: (event: AiChatStreamEvent) => void;
  signal: AbortSignal;
};

type AttemptOutcome = { result: AiRelayResult; streamedChars: number; citations: AiCitation[] };

async function runAttempt(ctx: ChatContext, startedAt: number): Promise<AttemptOutcome> {
  const requestId = randomUUID();
  openAiRequest(requestId, { userId: ctx.user.id, conversationId: ctx.conversationId });
  const unsubscribe = subscribeAiRequest(requestId, (event) => ctx.send({ type: "tool", label: event.label }));
  const deadline = AbortSignal.timeout(Math.max(5_000, TOTAL_TIMEOUT_MS - (Date.now() - startedAt)));
  let streamedChars = 0;
  try {
    const response = await fetch(ctx.webhookUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ctx.webhookToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        question: ctx.question,
        conversationId: ctx.conversationId,
        capability: createAiCapability({
          userId: ctx.user.id,
          conversationId: ctx.conversationId,
          role: ctx.user.role,
          systemRole: ctx.user.systemRole,
          position: ctx.user.currentPosition ?? ctx.user.position,
          requestId,
        }),
        history: ctx.history,
        user: { name: ctx.user.name, position: ctx.user.currentPosition ?? ctx.user.position ?? null },
      }),
      signal: AbortSignal.any([ctx.signal, deadline]),
    });
    const result = await relayN8nResponse(response, (text) => {
      streamedChars += text.length;
      ctx.send({ type: "delta", text });
    }, { idleMs: IDLE_TIMEOUT_MS });
    return { result, streamedChars, citations: result.ok ? aiRequestCitations(requestId, result.answer) : [] };
  } catch (error) {
    if (ctx.signal.aborted) throw error;
    const code: AiErrorCode = deadline.aborted ? "AI_TIMEOUT" : "AI_CONNECTION_FAILED";
    if (code === "AI_CONNECTION_FAILED") console.error("[ai chat] không gọi được n8n:", (error as Error)?.message);
    return { result: { ok: false, code }, streamedChars, citations: [] };
  } finally {
    unsubscribe();
    closeAiRequest(requestId);
  }
}

async function saveAndFinish(ctx: ChatContext, outcome: AttemptOutcome & { result: { ok: true } }) {
  const { answer, legacyPayload } = outcome.result;
  const citations = mergeCitations(
    outcome.citations,
    legacyPayload ? sanitizeAiCitations(legacyPayload.citations ?? legacyPayload.sources, ctx.conversationId) : []
  );
  const suggestions = Array.isArray(legacyPayload?.suggestions)
    ? legacyPayload.suggestions.map((value) => String(value).trim().slice(0, 160)).filter(Boolean).slice(0, 4)
    : [];
  const now = new Date();
  const expiresAt = aiConversationExpiry(now);
  let saved = true;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.aiConversation.upsert({
        where: { id: ctx.conversationId },
        create: { id: ctx.conversationId, userId: ctx.user.id, title: titleFromQuestion(ctx.question), expiresAt },
        update: { expiresAt },
      });
      await tx.aiMessage.createMany({
        data: [
          // Lệch 1 ms để câu hỏi luôn đứng trước câu trả lời khi sắp theo thời điểm tạo.
          { conversationId: ctx.conversationId, role: "USER", content: ctx.question, createdAt: new Date(now.getTime() - 1) },
          { conversationId: ctx.conversationId, role: "ASSISTANT", content: answer, citations, createdAt: now },
        ],
      });
    });
    await audit(ctx.user.id, "AI_CHAT_QUERY", "AiConversation", ctx.conversationId, `Tra cứu AI thành công · ${citations.length} nguồn`);
  } catch (error) {
    // Câu trả lời đã hiện trọn cho người dùng; lỗi lưu chỉ làm mất lịch sử, không nên xoá câu trả lời.
    saved = false;
    console.error("[ai chat] không lưu được hội thoại", error);
  }
  ctx.send({
    type: "done",
    conversationId: ctx.conversationId,
    answer,
    citations,
    suggestions,
    expiresAt: expiresAt.toISOString(),
    saved,
  });
}

async function answerQuestion(ctx: ChatContext) {
  ctx.send({ type: "meta", conversationId: ctx.conversationId });
  let release: () => void;
  try {
    release = await aiChatQueue.acquire(ctx.signal, (position) => ctx.send({
      type: "status",
      label: position <= 1 ? "Đang chờ lượt, bạn là người kế tiếp" : `Đang chờ lượt, còn ${position - 1} người phía trước`,
    }));
  } catch (error) {
    if (ctx.signal.aborted) return;
    if (!(error instanceof AiQueueTimeoutError)) throw error;
    ctx.send(errorEvent("AI_BUSY"));
    return;
  }
  const startedAt = Date.now();
  try {
    for (let attempt = 0; ; attempt += 1) {
      ctx.send({ type: "status", label: attempt === 0 ? "Đang phân tích câu hỏi" : "Đang thử lại" });
      const outcome = await runAttempt(ctx, startedAt);
      if (outcome.result.ok) {
        await saveAndFinish(ctx, outcome as AttemptOutcome & { result: { ok: true } });
        return;
      }
      const { code } = outcome.result;
      const delay = RETRY_DELAYS_MS[attempt];
      const canRetry = RETRYABLE.has(code) && outcome.streamedChars === 0 && delay !== undefined &&
        Date.now() - startedAt + delay < TOTAL_TIMEOUT_MS - 30_000;
      if (!canRetry) {
        console.error(`[ai chat] thất bại ${code} sau ${attempt + 1} lần`);
        ctx.send(errorEvent(code, outcome.streamedChars > 0));
        return;
      }
      ctx.send({
        type: "status",
        label: code === "AI_CONNECTION_FAILED"
          ? `Chưa kết nối được máy chủ AI, tự thử lại sau ${delay / 1000} giây`
          : `Dịch vụ AI đang bận, tự thử lại sau ${delay / 1000} giây`,
      });
      await sleep(delay, ctx.signal);
    }
  } finally {
    release();
  }
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireAiChatPermission(user);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const question = String(body?.question ?? "").replace(/\0/g, "").trim();
    if (!question) return fail("Vui lòng nhập câu hỏi");
    if (question.length > AI_CHAT_MAX_QUESTION_LENGTH) {
      return fail(`Câu hỏi được nhập tối đa ${AI_CHAT_MAX_QUESTION_LENGTH.toLocaleString("vi-VN")} ký tự`);
    }
    if (activeUsers.has(user.id)) return fail("Một câu hỏi khác của bạn đang được xử lý", 409);

    cleanupExpiredAiConversations();
    const requestedConversationId = String(body?.conversationId ?? "").trim();
    const conversation = requestedConversationId
      ? await prisma.aiConversation.findFirst({
          where: { id: requestedConversationId, userId: user.id, expiresAt: { gt: new Date() } },
          select: {
            id: true,
            messages: {
              orderBy: { createdAt: "desc" },
              take: AI_CHAT_HISTORY_LIMIT,
              select: { role: true, content: true },
            },
          },
        })
      : null;
    if (requestedConversationId && !conversation) return fail("Không tìm thấy cuộc hội thoại hoặc hội thoại đã hết hạn", 404);

    const webhookUrl = process.env.N8N_AI_CHAT_WEBHOOK_URL?.trim();
    const webhookToken = process.env.N8N_AI_CHAT_TOKEN?.trim();
    if (!webhookUrl || !webhookToken) return fail("Trợ lý AI chưa được cấu hình", 503);

    activeUsers.add(user.id);
    const clientGone = new AbortController();
    req.signal.addEventListener("abort", () => clientGone.abort(), { once: true });
    const encoder = new TextEncoder();
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: AiChatStreamEvent) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            closed = true;
          }
        };
        const ping = setInterval(() => send({ type: "ping" }), PING_INTERVAL_MS);
        void answerQuestion({
          user,
          question,
          conversationId: conversation?.id ?? randomUUID(),
          isNewConversation: !conversation,
          history: [...(conversation?.messages ?? [])].reverse().slice(-HISTORY_MESSAGES_FOR_MODEL).map((message) => ({
            role: message.role,
            content: message.content.length > HISTORY_MESSAGE_LIMIT
              ? `${message.content.slice(0, HISTORY_MESSAGE_LIMIT)}…`
              : message.content,
          })),
          webhookUrl,
          webhookToken,
          send,
          signal: clientGone.signal,
        })
          .catch((error: unknown) => {
            if (clientGone.signal.aborted) return;
            console.error("[ai chat]", error);
            send(errorEvent("AI_WORKFLOW_FAILED"));
          })
          .finally(() => {
            clearInterval(ping);
            activeUsers.delete(user.id);
            if (closed) return;
            closed = true;
            try {
              controller.close();
            } catch {
              // Trình duyệt đã đóng luồng trước.
            }
          });
      },
      cancel() {
        closed = true;
        clientGone.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        // nginx mặc định giữ đệm phản hồi proxy — thiếu header này chữ sẽ đổ về một cục ở cuối.
        "x-accel-buffering": "no",
      },
    });
  });
}
