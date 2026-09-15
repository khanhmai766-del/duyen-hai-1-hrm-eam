"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bot, ChevronLeft, Clock3, ExternalLink, History, MessageCircleMore,
  Plus, Send, ShieldCheck, Square, X,
} from "lucide-react";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { cn } from "@/lib/utils";
import type { AiCitation } from "@/lib/ai-chat";

type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: AiCitation[];
  suggestions?: string[];
};

type ConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
  messages: Array<{ content: string }>;
};

const STARTERS = [
  "Khiếm khuyết chưa xử lý của thiết bị tôi quản lý?",
  "Vật tư nào sắp đến hạn thay trong 45 ngày tới?",
  "Tìm lịch sử sửa chữa theo tên thiết bị",
];

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function AiChatbox() {
  const rbac = useRbacAccess();
  const permitted = rbac.can("ai-chat", ["read", "personal", "manage", "full"]);
  const [open, setOpen] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [question, setQuestion] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
  }, [open]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  React.useEffect(() => {
    if (!open || !permitted) return;
    void loadConversations();
  }, [open, permitted]);

  React.useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  async function readResponse<T>(response: Response) {
    const payload = await response.json().catch(() => null) as { data?: T; error?: string | null } | null;
    if (!response.ok || payload?.error) throw new Error(payload?.error || "Không nhận được dữ liệu từ máy chủ");
    return payload?.data as T;
  }

  async function loadConversations() {
    try {
      const response = await fetch("/api/ai/conversations", { cache: "no-store" });
      setConversations(await readResponse<ConversationSummary[]>(response));
    } catch {
      // Danh sách cũ là tiện ích phụ; không chặn cuộc trò chuyện mới.
    }
  }

  async function openConversation(id: string) {
    setError(null);
    try {
      const response = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await readResponse<{ id: string; messages: Array<{ id: string; role: string; content: string; citations: unknown }> }>(response);
      setConversationId(data.id);
      setMessages(data.messages.map((message) => ({
        id: message.id,
        role: message.role === "USER" ? "USER" : "ASSISTANT",
        content: message.content,
        citations: Array.isArray(message.citations) ? message.citations as AiCitation[] : [],
      })));
      setShowHistory(false);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  function newConversation() {
    controllerRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setQuestion("");
    setError(null);
    setLoading(false);
    setShowHistory(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function submit(rawQuestion = question) {
    const value = rawQuestion.trim();
    if (!value || loading) return;
    const userMessage: ChatMessage = { id: uid(), role: "USER", content: value };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: value, conversationId }),
        signal: controller.signal,
      });
      const result = await readResponse<{
        conversationId: string;
        answer: string;
        citations: AiCitation[];
        suggestions: string[];
      }>(response);
      setConversationId(result.conversationId);
      setMessages((current) => [...current, {
        id: uid(), role: "ASSISTANT", content: result.answer, citations: result.citations,
        suggestions: result.suggestions,
      }]);
      void loadConversations();
    } catch (cause) {
      if ((cause as Error).name !== "AbortError") setError((cause as Error).message);
      // Backend không lưu câu hỏi lỗi; bỏ cả bong bóng tạm để giao diện phản ánh đúng lịch sử.
      setMessages((current) => current.filter((message) => message.id !== userMessage.id));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setLoading(false);
    }
  }

  function stop() {
    controllerRef.current?.abort();
  }

  if (rbac.isLoading || !permitted) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Đóng trợ lý AI" : "Mở trợ lý AI"}
        aria-expanded={open}
        className={cn(
          "fixed bottom-[calc(5.6rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br from-[#102f5d] via-[#174d8f] to-[#1d74c9] text-white shadow-[0_18px_45px_-16px_rgba(15,47,93,0.85)] ring-1 ring-blue-200/70 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_24px_52px_-16px_rgba(23,77,143,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 md:bottom-6 md:right-6",
          open && "rotate-3 scale-95 bg-slate-800"
        )}
      >
        <span className="absolute inset-x-1 top-1 h-1/3 rounded-xl bg-white/15" />
        {open ? <X className="relative h-6 w-6" /> : <MessageCircleMore className="relative h-7 w-7" />}
        {!open && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-[#174d8f]" />}
      </button>

      <section
        aria-label="DH1 OPS INSIGHT AI Assistant for Operations"
        className={cn(
          "fixed inset-x-2 bottom-[calc(9.6rem+env(safe-area-inset-bottom))] z-40 flex h-[min(680px,calc(100dvh-11rem))] origin-bottom-right flex-col overflow-hidden rounded-[26px] border border-blue-100 bg-[#f8fbff] shadow-[0_28px_80px_-28px_rgba(15,23,42,0.65)] ring-1 ring-white transition-all duration-200 dark:border-slate-700 dark:bg-slate-950 dark:ring-slate-800 sm:left-auto sm:right-4 sm:w-[410px] md:bottom-24 md:right-6",
          open ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-5 scale-95 opacity-0"
        )}
      >
        <header className="relative overflow-hidden bg-[linear-gradient(125deg,#102f5d_0%,#174d8f_64%,#d88718_145%)] px-4 pb-4 pt-3.5 text-white">
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="relative flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/14 shadow-inner ring-1 ring-white/25 backdrop-blur">
              <Bot className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="min-w-0 leading-tight">
                  <span className="block text-[13px] font-extrabold tracking-wide">DH1 OPS INSIGHT</span>{" "}
                  <span className="mt-1 block text-[10px] font-medium text-blue-100">AI Assistant for Operations</span>
                </h2>
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-blue-100">Tra cứu khiếm khuyết · thiết bị · vật tư</p>
            </div>
            <button type="button" onClick={() => setShowHistory((value) => !value)} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15 transition hover:bg-white/20" aria-label="Lịch sử hội thoại">
              {showHistory ? <ChevronLeft className="h-4 w-4" /> : <History className="h-4 w-4" />}
            </button>
            <button type="button" onClick={newConversation} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15 transition hover:bg-white/20" aria-label="Cuộc hội thoại mới">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </header>

        {showHistory ? (
          <div className="flex-1 overflow-y-auto p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Hội thoại gần đây</h3>
                <p className="text-[11px] text-slate-500">Tự động xóa sau 14 ngày</p>
              </div>
              <Clock3 className="h-4 w-4 text-amber-500" />
            </div>
            <div className="space-y-2">
              {conversations.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">Chưa có hội thoại đã lưu.</p>
              ) : conversations.map((conversation) => (
                <button key={conversation.id} type="button" onClick={() => void openConversation(conversation.id)} className="w-full rounded-2xl border border-blue-100 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                  <span className="block truncate text-sm font-bold text-slate-800 dark:text-slate-100">{conversation.title || "Tra cứu dữ liệu"}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">{conversation.messages[0]?.content}</span>
                  <span className="mt-2 block text-[10px] font-medium text-slate-400">{new Date(conversation.updatedAt).toLocaleString("vi-VN")}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4">
              {messages.length === 0 && (
                <div className="flex min-h-full flex-col justify-center py-4">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] border border-blue-100 bg-white text-navy shadow-[0_18px_45px_-24px_rgba(15,47,93,.55)] dark:border-slate-700 dark:bg-slate-900 dark:text-sky-300">
                    <ShieldCheck className="h-7 w-7" />
                  </div>
                  <h3 className="mt-4 text-center text-base font-extrabold text-slate-900 dark:text-white">Hỏi trên dữ liệu bạn được phép xem</h3>
                  <p className="mx-auto mt-1.5 max-w-[310px] text-center text-xs leading-5 text-slate-500">Trợ lý chỉ đọc dữ liệu và luôn dẫn về hồ sơ nguồn để đối chiếu.</p>
                  <div className="mt-5 space-y-2">
                    {STARTERS.map((starter) => (
                      <button key={starter} type="button" onClick={() => void submit(starter)} className="group flex w-full items-start gap-2.5 rounded-2xl border border-blue-100 bg-white px-3 py-2.5 text-left text-xs font-medium leading-5 text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-sm bg-amber-400 transition group-hover:rotate-45" />
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <article key={message.id} className={cn("flex", message.role === "USER" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[88%]", message.role === "USER" && "text-right")}>
                    <div className={cn(
                      "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-left text-[13px] leading-5 shadow-sm",
                      message.role === "USER"
                        ? "rounded-br-md bg-navy text-white"
                        : "rounded-bl-md border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    )}>{message.content}</div>
                    {!!message.citations?.length && (
                      <div className="mt-2 space-y-1.5 text-left">
                        {message.citations.map((citation) => (
                          <Link key={`${citation.sourceType}:${citation.sourceId}`} href={citation.url} className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-2.5 py-2 text-[11px] font-semibold text-blue-800 transition hover:border-blue-300 hover:bg-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-sky-300">
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{citation.title}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                    {!!message.suggestions?.length && (
                      <div className="mt-2 flex flex-wrap gap-1.5 text-left">
                        {message.suggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => void submit(suggestion)}
                            disabled={loading}
                            className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md border border-blue-100 bg-white px-3.5 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      <span className="flex gap-1"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-600 [animation-delay:-.3s]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-.15s]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400" /></span>
                      Đang tra cứu hồ sơ…
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && <div className="mx-4 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

            <footer className="border-t border-blue-100 bg-white/90 p-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 shadow-inner focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:focus-within:ring-blue-900/50">
                <textarea
                  ref={inputRef}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value.slice(0, 2_000))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                  rows={1}
                  placeholder="Hỏi về khiếm khuyết, thiết bị, vật tư…"
                  className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[13px] leading-5 text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                  disabled={loading}
                />
                {loading ? (
                  <button type="button" onClick={stop} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-600 text-white shadow-md transition hover:bg-red-700" aria-label="Dừng trả lời"><Square className="h-4 w-4 fill-current" /></button>
                ) : (
                  <button type="button" onClick={() => void submit()} disabled={!question.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-navy to-blue-600 text-white shadow-md transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Gửi câu hỏi"><Send className="h-4 w-4" /></button>
                )}
              </div>
              <p className="mt-1.5 text-center text-[9.5px] text-slate-400">AI có thể sai · Luôn đối chiếu hồ sơ nguồn trước khi quyết định</p>
            </footer>
          </>
        )}
      </section>
    </>
  );
}
