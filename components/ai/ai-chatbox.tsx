"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  ArrowUp, Check, ChevronLeft, Copy, Cpu, History, Maximize2, Minimize2, Package,
  RotateCcw, Search, Sparkles, Square, SquarePen, Trash2, TriangleAlert, X,
  type LucideIcon,
} from "lucide-react";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import {
  useAiChat,
  useAiConversations,
  useDeleteAiConversation,
  type AiChatMessage,
  type AiConversationSummary,
} from "@/hooks/useAiChat";
import { AiMarkdown } from "@/components/ai/ai-markdown";
import { normalizeText } from "@/lib/nav";
import { cn } from "@/lib/utils";

const MAX_QUESTION = 2_000;

type Starter = { text: string; send: boolean };

const STARTER_GROUPS: Array<{ label: string; icon: LucideIcon; items: Starter[] }> = [
  {
    label: "Khiếm khuyết",
    icon: TriangleAlert,
    items: [
      { text: "Khiếm khuyết chưa xử lý của thiết bị tôi quản lý?", send: true },
      { text: "Khiếm khuyết mức 1 và 2 phát sinh trong 7 ngày qua", send: true },
    ],
  },
  {
    label: "Thiết bị",
    icon: Cpu,
    items: [{ text: "Lịch sử sửa chữa của thiết bị ", send: false }],
  },
  {
    label: "Vật tư",
    icon: Package,
    items: [{ text: "Vật tư nào sắp đến hạn thay trong 45 ngày tới?", send: true }],
  },
];

export function AiChatbox() {
  const rbac = useRbacAccess();
  if (rbac.isLoading || !rbac.can("ai-chat", ["read", "personal", "manage", "full"])) return null;
  return <AiChatPanel />;
}

function isPhone() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
}

function AiChatPanel() {
  const { data: session } = useSession();
  const chat = useAiChat();
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<"chat" | "history">("chat");
  const [expanded, setExpanded] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const stickToBottom = React.useRef(true);

  const firstName = session?.user?.name?.trim().split(/\s+/).pop() ?? "";
  const position = session?.user?.currentPosition || session?.user?.position || "";

  const focusInput = React.useCallback(() => {
    // Trên điện thoại, tự focus làm bàn phím bật lên che nửa màn hình.
    if (!window.matchMedia("(pointer: fine)").matches) return;
    window.setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  React.useEffect(() => {
    if (open && view === "chat") focusInput();
  }, [open, view, focusInput]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (view === "history") setView("chat");
      else setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, view]);

  React.useEffect(() => {
    const container = scrollRef.current;
    if (container && stickToBottom.current) container.scrollTop = container.scrollHeight;
  }, [chat.messages, view]);

  React.useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [draft]);

  function send(text = draft) {
    if (!text.trim() || chat.busy) return;
    stickToBottom.current = true;
    void chat.ask(text);
    setDraft("");
  }

  function pickStarter(starter: Starter) {
    if (starter.send) return send(starter.text);
    setDraft(starter.text);
    window.setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(starter.text.length, starter.text.length);
    }, 0);
  }

  function newConversation() {
    chat.reset();
    setDraft("");
    setView("chat");
    focusInput();
  }

  function openConversation(id: string) {
    stickToBottom.current = true;
    setView("chat");
    void chat.openConversation(id);
  }

  const lastAssistantId = [...chat.messages].reverse().find((message) => message.role === "ASSISTANT")?.id;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Đóng trợ lý AI" : "Mở trợ lý AI DH1 OPS INSIGHT"}
        aria-expanded={open}
        className={cn(
          "fixed bottom-[calc(5.6rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-navy text-white shadow-lg shadow-navy/25 transition hover:bg-[#28507f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 md:bottom-6 md:right-6",
          open && "max-sm:hidden"
        )}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        {!open && chat.busy && (
          <span className="absolute right-0 top-0 h-3 w-3 animate-pulse rounded-full bg-electric ring-2 ring-white" />
        )}
      </button>

      <section
        aria-label="Trợ lý AI DH1 OPS INSIGHT"
        inert={!open}
        className={cn(
          "fixed inset-0 z-50 flex flex-col overflow-hidden bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] transition-[opacity,transform] duration-200 dark:bg-slate-950",
          "sm:inset-auto sm:bottom-24 sm:right-6 sm:z-40 sm:rounded-2xl sm:p-0 sm:shadow-2xl sm:shadow-slate-900/20 sm:ring-1 sm:ring-slate-900/10 dark:sm:ring-white/10",
          expanded
            ? "sm:h-[min(860px,calc(100dvh-8rem))] sm:w-[min(760px,calc(100vw-3rem))]"
            : "sm:h-[min(640px,calc(100dvh-8rem))] sm:w-[420px]",
          open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        )}
      >
        <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
          {view === "history" ? (
            <IconButton label="Quay lại hội thoại" onClick={() => setView("chat")}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy text-white">
              <Sparkles className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[13px] font-semibold tracking-wide text-slate-900 dark:text-white">
              {view === "history" ? "Hội thoại gần đây" : "DH1 OPS INSIGHT"}
            </h2>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {view === "history" ? "Tự động xoá sau 14 ngày" : "Trợ lý tra cứu vận hành · chỉ đọc dữ liệu"}
            </p>
          </div>
          {view === "chat" && (
            <IconButton label="Lịch sử hội thoại" onClick={() => setView("history")}>
              <History className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton label="Cuộc hội thoại mới" onClick={newConversation}>
            <SquarePen className="h-4 w-4" />
          </IconButton>
          <IconButton label={expanded ? "Thu nhỏ khung" : "Mở rộng khung"} onClick={() => setExpanded((value) => !value)} className="max-sm:hidden">
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </IconButton>
          <IconButton label="Đóng" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </IconButton>
        </header>

        {view === "history" ? (
          <HistoryView
            activeId={chat.conversationId}
            onOpen={openConversation}
            onDeletedActive={newConversation}
          />
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={(event) => {
                const target = event.currentTarget;
                stickToBottom.current = target.scrollHeight - target.scrollTop - target.clientHeight < 80;
              }}
              className="flex-1 overflow-y-auto"
            >
              <div className={cn("mx-auto flex min-h-full flex-col px-4 py-5", expanded && "sm:max-w-[680px]")}>
                {chat.loadingConversation ? (
                  <ConversationSkeleton />
                ) : chat.loadError ? (
                  <p className="my-auto rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                    {chat.loadError}
                  </p>
                ) : chat.messages.length === 0 ? (
                  <EmptyState firstName={firstName} position={position} onPick={pickStarter} />
                ) : (
                  <div className="space-y-6">
                    {chat.messages.map((message) => message.role === "USER" ? (
                      <div key={message.id} className="flex justify-end">
                        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-navy px-3.5 py-2 text-[13px] leading-6 text-white">
                          {message.content}
                        </div>
                      </div>
                    ) : (
                      <AssistantMessage
                        key={message.id}
                        message={message}
                        busy={chat.busy}
                        isLast={message.id === lastAssistantId}
                        onRetry={() => chat.retry(message.id)}
                        onEdit={() => {
                          setDraft(message.question ?? "");
                          inputRef.current?.focus();
                        }}
                        onAsk={send}
                        onNavigate={() => {
                          if (isPhone()) setOpen(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <footer className="border-t border-slate-200 px-3 pb-2 pt-3 dark:border-slate-800">
              <div className={cn("mx-auto", expanded && "sm:max-w-[680px]")}>
                <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white py-1.5 pl-3 pr-1.5 transition focus-within:border-electric focus-within:ring-2 focus-within:ring-electric/15 dark:border-slate-700 dark:bg-slate-900">
                  <textarea
                    ref={inputRef}
                    value={draft}
                    rows={1}
                    maxLength={MAX_QUESTION}
                    aria-label="Câu hỏi cho trợ lý AI"
                    placeholder="Hỏi về khiếm khuyết, thiết bị, vật tư…"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      // isComposing: đang gõ Telex/VNI thì Enter là chốt chữ, không phải gửi.
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        send();
                      }
                    }}
                    className="max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1 text-[13px] leading-6 text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                  />
                  {chat.busy ? (
                    <button
                      type="button"
                      onClick={chat.stop}
                      aria-label="Dừng trả lời"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-800 text-white transition hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900"
                    >
                      <Square className="h-3 w-3 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => send()}
                      disabled={!draft.trim()}
                      aria-label="Gửi câu hỏi"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy text-white transition hover:bg-[#28507f] disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="mt-1.5 flex justify-between gap-2 px-1 text-[11px] text-slate-400">
                  <span>AI có thể sai — hãy đối chiếu hồ sơ nguồn trước khi quyết định.</span>
                  {draft.length > MAX_QUESTION - 200 && <span className="tabular-nums">{draft.length}/{MAX_QUESTION}</span>}
                </p>
              </div>
            </footer>
          </>
        )}
      </section>
    </>
  );
}

function IconButton({
  label, onClick, className, children,
}: { label: string; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
        className
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ firstName, position, onPick }: { firstName: string; position: string; onPick: (starter: Starter) => void }) {
  return (
    <div className="my-auto py-2">
      <p className="text-lg font-semibold text-slate-900 dark:text-white">{firstName ? `Chào ${firstName},` : "Xin chào,"}</p>
      <p className="mt-1 text-[13px] leading-6 text-slate-500 dark:text-slate-400">
        Hỏi về khiếm khuyết, lịch sử sửa chữa hay vật tư thay thế. Trợ lý chỉ đọc dữ liệu
        {position ? <> cương vị <span className="font-medium text-slate-700 dark:text-slate-200">{position}</span></> : " bạn"} được phép xem và luôn dẫn nguồn để đối chiếu.
      </p>
      <div className="mt-6 space-y-4">
        {STARTER_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              <group.icon className="h-3.5 w-3.5" />
              {group.label}
            </p>
            <div className="space-y-1.5">
              {group.items.map((starter) => (
                <button
                  key={starter.text}
                  type="button"
                  onClick={() => onPick(starter)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-[13px] leading-5 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  {starter.send ? starter.text : `${starter.text.trim()}…`}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function useElapsedSeconds(startedAt: number | undefined) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1_000)) : 0;
}

function PendingStatus({ message }: { message: AiChatMessage }) {
  const seconds = useElapsedSeconds(message.startedAt);
  return (
    <div className="flex items-center gap-2.5 text-[13px] text-slate-500 dark:text-slate-400" role="status" aria-live="polite">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-electric/50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-electric" />
      </span>
      <span className="min-w-0 truncate">{message.statusLabel ?? "Đang gửi câu hỏi"}…</span>
      {!!message.toolCalls && <span className="shrink-0 text-slate-400">· {message.toolCalls} lượt tra cứu</span>}
      {seconds >= 5 && <span className="ml-auto shrink-0 text-xs tabular-nums text-slate-400">{seconds} giây</span>}
    </div>
  );
}

function AssistantMessage({
  message, busy, isLast, onRetry, onEdit, onAsk, onNavigate,
}: {
  message: AiChatMessage;
  busy: boolean;
  isLast: boolean;
  onRetry: () => void;
  onEdit: () => void;
  onAsk: (text: string) => void;
  onNavigate: () => void;
}) {
  const citations = message.citations ?? [];
  const waiting = message.state === "pending" || (message.state === "streaming" && !message.content);
  return (
    <div className="group">
      {waiting ? (
        <PendingStatus message={message} />
      ) : message.content ? (
        <AiMarkdown text={message.content} streaming={message.state === "streaming"} />
      ) : null}

      {message.state === "stopped" && (
        <p className="mt-1 text-xs text-slate-500">
          {message.content ? "Đã dừng — câu trả lời chưa hoàn tất và không được lưu." : "Đã dừng câu hỏi này."}
        </p>
      )}

      {message.state === "error" && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-900/50 dark:bg-red-950/30">
          <p className="flex gap-2 text-[13px] leading-5 text-red-800 dark:text-red-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {message.error}
          </p>
          {isLast && message.question && (
            <div className="mt-2 flex flex-wrap gap-2 pl-6">
              <button
                type="button"
                onClick={onRetry}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-red-800 ring-1 ring-red-200 transition hover:bg-red-100 disabled:opacity-50 dark:bg-transparent dark:text-red-200 dark:ring-red-900/60"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Thử lại
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-950/50"
              >
                Sửa câu hỏi
              </button>
            </div>
          )}
        </div>
      )}

      {message.unsaved && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Không lưu được vào lịch sử hội thoại.</p>
      )}

      {citations.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">Nguồn đối chiếu</p>
          <div className="flex flex-wrap gap-1.5">
            {citations.map((citation, index) => (
              <Link
                key={`${citation.sourceType}:${citation.sourceId}`}
                href={citation.url}
                title={citation.title}
                onClick={onNavigate}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 py-1 pl-1 pr-2 text-xs text-slate-700 transition hover:border-electric/40 hover:bg-blue-50 hover:text-navy dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
              >
                <span className="grid h-4 min-w-4 place-items-center rounded bg-white px-1 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                  {index + 1}
                </span>
                <span className="max-w-[240px] truncate">{citation.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {message.state === "done" && message.content && (
        <div className="mt-2 flex items-center gap-1 transition sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100">
          <CopyButton text={message.content} />
        </div>
      )}

      {isLast && message.state === "done" && !!message.suggestions?.length && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {message.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={busy}
              onClick={() => onAsk(suggestion)}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => setCopied(true), () => toast.error("Không sao chép được câu trả lời"));
      }}
      aria-label="Sao chép câu trả lời"
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Đã chép" : "Sao chép"}
    </button>
  );
}

function ConversationSkeleton() {
  return (
    <div className="space-y-6" aria-label="Đang mở hội thoại">
      {[0, 1].map((row) => (
        <div key={row} className="space-y-3">
          <div className="ml-auto h-9 w-2/3 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayBucket(iso: string, now: Date) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = new Date(iso).getTime();
  if (time >= startOfToday) return "Hôm nay";
  if (time >= startOfToday - DAY_MS) return "Hôm qua";
  if (time >= startOfToday - 6 * DAY_MS) return "7 ngày qua";
  return "Cũ hơn";
}

function HistoryView({
  activeId, onOpen, onDeletedActive,
}: { activeId: string | null; onOpen: (id: string) => void; onDeletedActive: () => void }) {
  const conversations = useAiConversations(true);
  const remove = useDeleteAiConversation();
  const [search, setSearch] = React.useState("");
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  const groups = React.useMemo(() => {
    const needle = normalizeText(search.trim());
    const now = new Date();
    const map = new Map<string, AiConversationSummary[]>();
    for (const conversation of conversations.data ?? []) {
      if (needle && !normalizeText(conversation.title ?? "").includes(needle)) continue;
      const bucket = dayBucket(conversation.updatedAt, now);
      map.set(bucket, [...(map.get(bucket) ?? []), conversation]);
    }
    return [...map.entries()];
  }, [conversations.data, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pt-3">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 focus-within:border-electric dark:border-slate-800">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo tiêu đề"
            aria-label="Tìm hội thoại"
            className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {conversations.isLoading ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2].map((row) => <div key={row} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}
          </div>
        ) : conversations.isError ? (
          <p className="px-2 text-[13px] text-red-700 dark:text-red-300">{(conversations.error as Error).message}</p>
        ) : groups.length === 0 ? (
          <p className="px-2 py-10 text-center text-[13px] text-slate-500">
            {search ? "Không có hội thoại khớp từ khoá." : "Chưa có hội thoại đã lưu."}
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map(([bucket, items]) => (
              <div key={bucket}>
                <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">{bucket}</p>
                {items.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={cn(
                      "group flex items-center rounded-lg transition hover:bg-slate-50 dark:hover:bg-slate-900",
                      conversation.id === activeId && "bg-slate-100 dark:bg-slate-900"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(conversation.id)}
                      className="flex min-w-0 flex-1 items-baseline gap-3 px-2 py-2 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800 dark:text-slate-100">
                        {conversation.title || "Tra cứu dữ liệu"}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                        {new Date(conversation.updatedAt).toLocaleString("vi-VN", bucket === "Hôm nay"
                          ? { hour: "2-digit", minute: "2-digit" }
                          : { day: "2-digit", month: "2-digit" })}
                      </span>
                    </button>
                    {confirmId === conversation.id ? (
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(conversation.id, {
                          onSuccess: () => {
                            setConfirmId(null);
                            if (conversation.id === activeId) onDeletedActive();
                          },
                          onError: (error) => toast.error((error as Error).message),
                        })}
                        className="mr-1.5 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                      >
                        Xoá
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(conversation.id)}
                        aria-label="Xoá hội thoại"
                        title="Xoá hội thoại"
                        className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
