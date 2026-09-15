import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { hasAssignedPermissionLevel } from "@/lib/rbac-permissions";
import { createAiCapability } from "@/lib/ai-auth";
import {
  AI_CHAT_HISTORY_LIMIT,
  AI_CHAT_MAX_QUESTION_LENGTH,
  aiConversationExpiry,
  cleanupExpiredAiConversations,
  sanitizeAiCitations,
} from "@/lib/ai-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activeUsers = new Set<string>();

function timeoutMs() {
  const value = Number(process.env.AI_CHAT_TIMEOUT_MS ?? 45_000);
  return Number.isFinite(value) ? Math.min(60_000, Math.max(5_000, value)) : 45_000;
}

function titleFromQuestion(question: string) {
  return question.replace(/\s+/g, " ").trim().slice(0, 80);
}

async function requireAiChatPermission(user: { id?: string; role?: string }) {
  if (!(await hasAssignedPermissionLevel(user, "ai-chat", ["read", "personal", "manage", "full"]))) {
    throw fail("Bạn chưa được phân quyền sử dụng trợ lý AI", 403);
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

    const conversationId = conversation?.id ?? randomUUID();
    const webhookUrl = process.env.N8N_AI_CHAT_WEBHOOK_URL?.trim();
    const webhookToken = process.env.N8N_AI_CHAT_TOKEN?.trim();
    if (!webhookUrl || !webhookToken) return fail("Trợ lý AI chưa được cấu hình", 503);
    const capability = createAiCapability({
      userId: user.id,
      conversationId,
      role: user.role,
      systemRole: user.systemRole,
      position: user.currentPosition ?? user.position,
    });

    activeUsers.add(user.id);
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${webhookToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          question,
          conversationId,
          capability,
          history: [...(conversation?.messages ?? [])].reverse(),
          user: { name: user.name, position: user.currentPosition ?? user.position ?? null },
        }),
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(timeoutMs())]),
      });
      const raw = await response.text();
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        console.error("[ai chat] n8n trả dữ liệu không phải JSON", response.status);
        return fail("Trợ lý AI trả dữ liệu không hợp lệ", 502);
      }
      if (!response.ok) {
        console.error("[ai chat] n8n từ chối yêu cầu", response.status, String(payload.error ?? ""));
        return fail("Trợ lý AI tạm thời không phản hồi. Vui lòng thử lại sau", 502);
      }
      const answer = String(payload.answer ?? payload.output ?? "").trim();
      if (!answer) return fail("Trợ lý AI chưa tạo được câu trả lời", 502);
      const citations = sanitizeAiCitations(payload.citations ?? payload.sources, conversationId);
      const suggestions = Array.isArray(payload.suggestions)
        ? payload.suggestions.map((value) => String(value).trim().slice(0, 160)).filter(Boolean).slice(0, 4)
        : [];
      const now = new Date();
      const expiresAt = aiConversationExpiry(now);
      await prisma.$transaction(async (tx) => {
        await tx.aiConversation.upsert({
          where: { id: conversationId },
          create: { id: conversationId, userId: user.id, title: titleFromQuestion(question), expiresAt },
          update: { expiresAt },
        });
        await tx.aiMessage.createMany({
          data: [
            { conversationId, role: "USER", content: question },
            { conversationId, role: "ASSISTANT", content: answer, citations },
          ],
        });
      });
      await audit(user.id, "AI_CHAT_QUERY", "AiConversation", conversationId, `Tra cứu AI thành công · ${citations.length} nguồn`);
      return ok({ conversationId, answer, citations, suggestions, expiresAt });
    } catch (error) {
      if (error instanceof Response) throw error;
      if ((error as Error)?.name === "AbortError" || (error as Error)?.name === "TimeoutError") {
        return fail("Trợ lý AI xử lý quá lâu. Câu hỏi chưa được lưu, vui lòng thử lại", 504);
      }
      console.error("[ai chat]", error);
      return fail("Không kết nối được trợ lý AI. Câu hỏi chưa được lưu", 502);
    } finally {
      activeUsers.delete(user.id);
    }
  });
}
