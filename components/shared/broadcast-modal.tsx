"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { Megaphone, X, Check } from "lucide-react";
import { useBroadcasts } from "@/hooks/useBroadcast";
import { formatDateTime } from "@/lib/utils";

const STORAGE_KEY = "broadcast-dismissed";

/**
 * Hộp thoại "Thông báo hệ thống" hiện giữa màn hình cho mọi user sau khi đăng
 * nhập. Hiển thị thông báo đang bật do Quản trị tạo; user đóng để dùng web (ẩn
 * trong phiên hiện tại), lần đăng nhập sau lại hiện cho tới khi Quản trị tắt/xoá.
 */
export function BroadcastModal() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const mustChangePassword = Boolean(session?.user?.mustChangePassword);
  const { data } = useBroadcasts();
  const active = (data?.data ?? []).find((b) => b.isActive) ?? null;
  const key = active ? `${active.id}:${active.updatedAt}` : "";

  const [ready, setReady] = React.useState(false);
  const [dismissedKey, setDismissedKey] = React.useState("");

  React.useEffect(() => {
    try {
      setDismissedKey(sessionStorage.getItem(STORAGE_KEY) ?? "");
    } catch {
      /* sessionStorage không khả dụng */
    }
    setReady(true);
  }, []);

  // Admin chỉ quản lý ở trang Quản trị — không nhận popup. Các user khác nhận
  // mỗi lần đăng nhập cho tới khi admin ngừng/xoá thông báo.
  // Nếu người dùng bắt buộc đổi mật khẩu lần đầu/hết hạn, ưu tiên popup đổi mật khẩu
  // để họ hoàn tất trước; thông báo hệ thống sẽ hiện ở lần đăng nhập/phiên sau.
  const open = ready && !isAdmin && !mustChangePassword && !!active && key !== dismissedKey;

  function dismiss() {
    try {
      sessionStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* bỏ qua */
    }
    setDismissedKey(key);
  }

  if (!open || !active) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm animate-fade-in" onClick={dismiss} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="broadcast-title"
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 dark:bg-card"
      >
        {/* Header gradient */}
        <div className="relative flex items-center gap-3 bg-gradient-to-br from-[#183a63] via-[#1264c8] to-[#00a6c8] px-5 py-4 text-white">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur">
            <Megaphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 text-lg font-bold leading-tight text-white">Ban Quản Trị Thông Báo</div>
          <button
            onClick={dismiss}
            className="absolute right-3 top-3 rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-5">
          <h2 id="broadcast-title" className="text-lg font-bold leading-snug text-ink">
            {active.title}
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{active.body}</p>
          <div className="border-t border-border/70 pt-3 text-xs text-muted-foreground">
            {active.createdByName ? <span className="font-medium text-ink">{active.createdByName}</span> : "Quản trị viên"}
            {" · "}
            {formatDateTime(active.updatedAt)}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <button
            onClick={dismiss}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#183a63] to-[#1264c8] px-4 py-2 text-sm font-semibold text-white shadow-md transition-transform hover:-translate-y-px active:translate-y-0"
          >
            <Check className="h-4 w-4" /> Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}
