"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { AiCitation, AiPageContext } from "@/lib/ai-chat";
import { streamAiChat } from "@/lib/ai-chat-stream";

export const AI_CONVERSATIONS_KEY = ["ai-conversations"] as const;

export type AiConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
  expiresAt: string;
  messages: Array<{ role: string; content: string; createdAt: string }>;
};

type AiConversationDetail = {
  id: string;
  title: string | null;
  messages: Array<{ id: string; role: string; content: string; citations: unknown; rating: number | null; createdAt: string }>;
};

export type AiChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  /** Chỉ có ở câu trả lời. */
  state?: "pending" | "streaming" | "done" | "stopped" | "error";
  question?: string;
  statusLabel?: string;
  toolCalls?: number;
  startedAt?: number;
  citations?: AiCitation[];
  suggestions?: string[];
  error?: string;
  unsaved?: boolean;
  /** Id tin nhắn phía máy chủ — chỉ có khi đã lưu; thiếu id thì không gửi đánh giá được. */
  messageId?: string | null;
  /** 1 = hữu ích, -1 = chưa đúng. */
  rating?: number | null;
  /** Trang người dùng đang đứng lúc hỏi; giữ lại để bấm "Thử lại" gửi đúng ngữ cảnh cũ. */
  page?: AiPageContext | null;
};

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function useAiConversations(enabled: boolean) {
  return useQuery({
    queryKey: AI_CONVERSATIONS_KEY,
    queryFn: async () => (await apiGet<AiConversationSummary[]>("/api/ai/conversations")).data,
    enabled,
    staleTime: 30_000,
  });
}

export function useDeleteAiConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate<{ id: string }>(`/api/ai/conversations/${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AI_CONVERSATIONS_KEY }),
  });
}

/**
 * Trạng thái một cuộc hội thoại AI trên trình duyệt.
 *
 * Câu hỏi lỗi KHÔNG bị xoá khỏi màn hình như bản cũ — người dùng thấy lỗi ngay dưới câu hỏi và
 * bấm Thử lại. Máy chủ chỉ lưu cặp hỏi–đáp đã trả lời xong, nên `conversationId` chỉ nhận id
 * sau khi lưu thành công; trước đó gửi tiếp vẫn là hội thoại mới, không bị 404.
 */
export function useAiChat() {
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<AiChatMessage[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [loadingConversation, setLoadingConversation] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);
  const conversationRef = React.useRef<string | null>(null);
  const busyRef = React.useRef(false);
  // Bản mới nhất của danh sách tin nhắn cho `rate` đọc: `rate` chỉ chạy từ sự kiện bấm nút, nên
  // cập nhật trong effect là đủ sớm, mà không phải tạo lại hàm mỗi khi có thêm một mẩu chữ.
  const messagesRef = React.useRef<AiChatMessage[]>([]);

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const patch = React.useCallback(
    (id: string, update: Partial<AiChatMessage> | ((message: AiChatMessage) => Partial<AiChatMessage>)) => {
      setMessages((list) => list.map((message) => (
        message.id === id ? { ...message, ...(typeof update === "function" ? update(message) : update) } : message
      )));
    },
    []
  );

  const ask = React.useCallback(async (
    rawQuestion: string,
    options?: { retryOf?: string; page?: AiPageContext | null }
  ) => {
    const question = rawQuestion.trim();
    if (!question || busyRef.current) return;
    const retryOf = options?.retryOf;
    const page = options?.page ?? null;
    busyRef.current = true;
    setBusy(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    const assistantId = uid();
    const pending: AiChatMessage = {
      id: assistantId,
      role: "ASSISTANT",
      content: "",
      state: "pending",
      question,
      toolCalls: 0,
      startedAt: Date.now(),
      page,
    };
    setMessages((list) => retryOf
      ? [...list.filter((message) => message.id !== retryOf), pending]
      : [...list, { id: uid(), role: "USER", content: question }, pending]);

    try {
      await streamAiChat({ question, conversationId: conversationRef.current, page }, (event) => {
        switch (event.type) {
          case "status":
            patch(assistantId, { statusLabel: event.label });
            break;
          case "tool":
            patch(assistantId, (message) => ({ statusLabel: event.label, toolCalls: (message.toolCalls ?? 0) + 1 }));
            break;
          case "delta":
            patch(assistantId, (message) => ({ state: "streaming", content: message.content + event.text }));
            break;
          case "done":
            if (event.saved) {
              conversationRef.current = event.conversationId;
              setConversationId(event.conversationId);
              void queryClient.invalidateQueries({ queryKey: AI_CONVERSATIONS_KEY });
            }
            patch(assistantId, {
              state: "done",
              content: event.answer,
              citations: event.citations,
              suggestions: event.suggestions,
              statusLabel: undefined,
              unsaved: !event.saved,
              messageId: event.messageId,
              rating: null,
            });
            break;
          case "error":
            patch(assistantId, { state: "error", error: event.message, statusLabel: undefined });
            break;
          default:
            break;
        }
      }, controller.signal);
    } catch (cause) {
      if (controller.signal.aborted) {
        patch(assistantId, { state: "stopped", statusLabel: undefined });
      } else {
        patch(assistantId, {
          state: "error",
          statusLabel: undefined,
          error: (cause as Error)?.message || "Không kết nối được trợ lý AI. Câu hỏi chưa được lưu, vui lòng thử lại.",
        });
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      busyRef.current = false;
      setBusy(false);
    }
  }, [patch, queryClient]);

  const retry = React.useCallback((assistantId: string) => {
    const failed = messages.find((message) => message.id === assistantId);
    if (failed?.question) void ask(failed.question, { retryOf: assistantId, page: failed.page });
  }, [ask, messages]);

  /**
   * Chấm một câu trả lời. Bấm lại đúng nút đang chọn là bỏ đánh giá.
   *
   * Cập nhật lạc quan rồi hoàn tác nếu máy chủ từ chối — đánh giá là thao tác phụ, không đáng
   * bắt người dùng chờ vòng quay.
   */
  const rate = React.useCallback(async (localId: string, value: 1 | -1) => {
    const message = messagesRef.current.find((item) => item.id === localId);
    if (!message?.messageId) return;
    const previous = message.rating ?? null;
    const next = previous === value ? 0 : value;
    patch(localId, { rating: next === 0 ? null : next });
    try {
      await apiMutate(`/api/ai/messages/${encodeURIComponent(message.messageId)}/rating`, "PUT", { rating: next });
    } catch (cause) {
      patch(localId, { rating: previous });
      throw cause;
    }
  }, [patch]);

  const stop = React.useCallback(() => controllerRef.current?.abort(), []);

  const reset = React.useCallback(() => {
    controllerRef.current?.abort();
    conversationRef.current = null;
    setConversationId(null);
    setMessages([]);
    setLoadError(null);
  }, []);

  const openConversation = React.useCallback(async (id: string) => {
    controllerRef.current?.abort();
    setLoadError(null);
    setLoadingConversation(true);
    try {
      const { data } = await apiGet<AiConversationDetail>(`/api/ai/conversations/${encodeURIComponent(id)}`);
      conversationRef.current = data.id;
      setConversationId(data.id);
      setMessages(data.messages.map((message) => message.role === "USER"
        ? { id: message.id, role: "USER", content: message.content }
        : {
            id: message.id,
            role: "ASSISTANT",
            content: message.content,
            state: "done",
            citations: Array.isArray(message.citations) ? message.citations as AiCitation[] : [],
            messageId: message.id,
            rating: message.rating,
          }));
    } catch (cause) {
      setLoadError((cause as Error).message);
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  return { conversationId, messages, busy, loadingConversation, loadError, ask, retry, rate, stop, reset, openConversation };
}
