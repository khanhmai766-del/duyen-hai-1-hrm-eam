"use client";

import * as React from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Bell, Menu, Search, CornerDownLeft, ChevronRight, LogOut, LayoutGrid, Maximize, Minimize, UserCircle, ChevronDown, Repeat, Cpu, MapPin, KeyRound, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NAV_SECTIONS, normalizeText } from "@/lib/nav";
import { apiMutate } from "@/lib/fetcher";
import { useNotifications, NOTICE_TONE } from "@/hooks/useNotifications";
import { useMarkAnnouncementRead } from "@/hooks/useAnnouncements";
import { useReplacementAlerts } from "@/hooks/useReplacements";
import { ReplacementBadge } from "@/components/materials/replacement-badge";
import { useMyDashboard } from "@/hooks/useDashboard";
import { cn, initials } from "@/lib/utils";
import { toast } from "sonner";

// Tông màu gradient nhẹ cho từng ô trong bảng truy cập nhanh (gán theo chỉ số).
const GRID_TINTS = [
  "bg-gradient-to-br from-sky-100 to-sky-200 text-sky-700",
  "bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700",
  "bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700",
  "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700",
  "bg-gradient-to-br from-rose-100 to-rose-200 text-rose-700",
  "bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700",
  "bg-gradient-to-br from-teal-100 to-teal-200 text-teal-700",
  "bg-gradient-to-br from-orange-100 to-orange-200 text-orange-700",
  "bg-gradient-to-br from-cyan-100 to-cyan-200 text-cyan-700",
  "bg-gradient-to-br from-fuchsia-100 to-fuchsia-200 text-fuchsia-700",
  "bg-gradient-to-br from-lime-100 to-lime-200 text-lime-700",
  "bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700",
  "bg-gradient-to-br from-pink-100 to-pink-200 text-pink-700",
  "bg-gradient-to-br from-purple-100 to-purple-200 text-purple-700",
];

export function Topbar({ onMenuClick, onToggleSidebar }: { onMenuClick: () => void; onToggleSidebar?: () => void }) {
  const { data: session } = useSession();
  const router = useRouter();
  const role = session?.user?.role;
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [notifTab, setNotifTab] = React.useState<"ops" | "repl">("ops");
  const notifRef = React.useRef<HTMLDivElement>(null);
  const [gridOpen, setGridOpen] = React.useState(false);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const profileRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  // Cảnh báo thay thế vật tư đã được "xem" (lưu client theo khóa id:nextDueAt).
  const [ackedReplKeys, setAckedReplKeys] = React.useState<Set<string>>(new Set());
  const { notices, loading: notifLoading } = useNotifications();
  const markRead = useMarkAnnouncementRead();
  const { data: alertsData, isLoading: alertsLoading } = useReplacementAlerts();
  const replAlerts = alertsData?.data ?? [];
  const replAlertKey = (a: (typeof replAlerts)[number]) => `${a.id}:${new Date(a.nextDueAt).getTime()}`;
  const activeReplAlerts = replAlerts.filter((a) => !ackedReplKeys.has(replAlertKey(a)));
  const totalAlerts = notices.length + activeReplAlerts.length;
  const { data: dash } = useMyDashboard();
  const avatarUrl = dash?.data?.avatarUrl ?? null;

  // Quick-launch shortcuts (app grid) — top-level nav respecting admin-only.
  const quickLinks = React.useMemo(
    () =>
      NAV_SECTIONS.flatMap((s) => s.items)
        .filter((i) => !i.adminOnly || role === "ADMIN")
        .map((i) => ({ label: i.label, href: i.href, icon: i.icon })),
    [role]
  );

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }
  React.useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("repl-alert-acked");
      if (raw) setAckedReplKeys(new Set(JSON.parse(raw) as string[]));
    } catch {
      // bỏ qua nếu localStorage không khả dụng
    }
  }, []);

  // Flatten nav (respecting admin-only) into searchable targets across both groups.
  const targets = React.useMemo(
    () =>
      NAV_SECTIONS.flatMap((s) =>
        s.items
          .filter((i) => !i.adminOnly || role === "ADMIN")
          .flatMap((i) => {
            const own = {
              label: i.label,
              href: i.href,
              icon: i.icon,
              section: s.title,
              hay: normalizeText(`${i.label} ${s.title} ${i.keywords ?? ""}`),
            };
            const kids = (i.children ?? []).map((c) => ({
              label: c.label,
              href: c.href,
              icon: c.icon,
              section: `${s.title} › ${i.label}`,
              hay: normalizeText(`${c.label} ${i.label} ${s.title} ${c.keywords ?? ""}`),
            }));
            return [own, ...kids];
          })
      ),
    [role]
  );

  const nq = normalizeText(q);
  const results = nq ? targets.filter((t) => t.hay.includes(nq)).slice(0, 8) : [];

  React.useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (gridRef.current && !gridRef.current.contains(e.target as Node)) setGridOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function go(href: string) {
    setQ("");
    setOpen(false);
    router.push(href);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (results.length) go(results[0].href);
    else if (q.trim()) go(`/devices?view=table&q=${encodeURIComponent(q.trim())}`);
  }

  // "Xem tất cả" (tab Vận hành): đánh dấu đã đọc mọi mệnh lệnh đang hiển thị để
  // badge cảnh báo reset, rồi mở trang Mệnh lệnh sản xuất.
  async function handleViewAllOps() {
    setNotifOpen(false);
    const ids = notices.map((n) => n.id.replace(/^ann-/, ""));
    if (ids.length) {
      try {
        await Promise.all(ids.map((id) => markRead.mutateAsync(id)));
      } catch {
        // Không chặn điều hướng nếu một vài lượt đánh dấu lỗi.
      }
    }
    router.push("/notifications");
  }

  // "Mở lịch thay thế vật tư": đánh dấu đã xem mọi cảnh báo hiện tại (lưu client)
  // để badge reset, rồi mở trang Lịch thay thế vật tư. Khi vật tư sang chu kỳ mới
  // (nextDueAt đổi) cảnh báo sẽ xuất hiện lại.
  function handleViewAllRepl() {
    setNotifOpen(false);
    const next = new Set(replAlerts.map(replAlertKey));
    setAckedReplKeys(next);
    try {
      localStorage.setItem("repl-alert-acked", JSON.stringify([...next]));
    } catch {
      // bỏ qua nếu localStorage không khả dụng
    }
    router.push("/replacements");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur md:px-6">
      <button onClick={onMenuClick} className="rounded-md p-2 hover:bg-muted lg:hidden" aria-label="Menu">
        <Menu className="h-5 w-5" />
      </button>

      {/* Desktop sidebar collapse toggle */}
      <button
        onClick={onToggleSidebar}
        className="relative hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 ring-1 ring-white/50 transition-transform duration-200 before:absolute before:inset-x-1 before:top-0.5 before:h-1/3 before:rounded-t-lg before:bg-white/30 hover:scale-105 active:scale-95 lg:flex"
        aria-label="Thu gọn menu"
        title="Thu gọn / mở rộng menu"
      >
        <Menu className="relative h-[18px] w-[18px] drop-shadow-sm" />
      </button>

      {/* Global search — sits where the greeting used to be */}
      <div ref={boxRef} className="relative min-w-0 flex-1 sm:flex-none">
        <form onSubmit={onSubmit}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Tìm kiếm chức năng, thiết bị..."
            className="h-9 w-full rounded-full border border-input bg-warmwhite pl-9 pr-3 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20 sm:w-72 lg:w-80"
          />
        </form>

        {open && q.trim() && (
            <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
              {results.length ? (
                <ul className="max-h-80 overflow-y-auto py-1">
                  {results.map((r) => {
                    const Icon = r.icon;
                    return (
                      <li key={r.href + r.label}>
                        <button
                          onClick={() => go(r.href)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink">{r.label}</span>
                            <span className="block truncate text-xs text-muted-foreground">{r.section}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  <li className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CornerDownLeft className="h-3 w-3" /> Enter để mở mục đầu tiên
                    </span>
                  </li>
                </ul>
              ) : (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  Không tìm thấy. Nhấn Enter để tìm thiết bị “{q.trim()}”.
                </div>
              )}
            </div>
          )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen((o) => !o)}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30 ring-1 ring-white/50 transition-transform duration-200 before:absolute before:inset-x-1 before:top-0.5 before:h-1/3 before:rounded-t-lg before:bg-white/30 hover:scale-105 active:scale-95"
            aria-label="Thông báo"
          >
            <Bell className="relative h-[18px] w-[18px] drop-shadow-sm" />
            {totalAlerts > 0 && (
              <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-600 px-1 text-[10px] font-bold leading-[18px] text-white shadow ring-2 ring-white">
                {totalAlerts > 9 ? "9+" : totalAlerts}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
              <div className="border-b border-border px-4 pt-2.5">
                <span className="text-sm font-semibold text-ink">Thông báo</span>
                {/* Tabs: tách biệt cảnh báo vận hành và cảnh báo thay thế vật tư */}
                <div className="mt-2 flex gap-1">
                  <NotifTab active={notifTab === "ops"} onClick={() => setNotifTab("ops")} label="Vận hành" count={notices.length} />
                  <NotifTab active={notifTab === "repl"} onClick={() => setNotifTab("repl")} label="Thay thế vật tư" count={activeReplAlerts.length} />
                </div>
              </div>

              {notifTab === "ops" ? (
                <>
                  {notifLoading ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">Đang tải…</div>
                  ) : notices.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                      <Bell className="h-7 w-7 text-muted-foreground/40" />
                      <span className="text-sm text-muted-foreground">Không có mệnh lệnh sản xuất mới</span>
                    </div>
                  ) : (
                    <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                      {notices.slice(0, 6).map((n) => {
                        const Icon = n.icon;
                        return (
                          <li key={n.id}>
                            <Link href={n.href} onClick={() => setNotifOpen(false)} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", NOTICE_TONE[n.tone])}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-ink">{n.title}</span>
                                <span className="block truncate text-xs text-muted-foreground">{n.desc}</span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={handleViewAllOps}
                    className="flex w-full items-center justify-center gap-1 border-t border-border px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/5"
                  >
                    Xem tất cả <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  {alertsLoading ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">Đang tải…</div>
                  ) : activeReplAlerts.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                      <Repeat className="h-7 w-7 text-muted-foreground/40" />
                      <span className="text-sm text-muted-foreground">Không có vật tư đến hạn thay thế</span>
                    </div>
                  ) : (
                    <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                      {activeReplAlerts.slice(0, 8).map((a) => (
                        <li key={a.id}>
                          <Link href={`/materials?track=${a.materialId}`} onClick={() => setNotifOpen(false)} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                              <Repeat className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-ink">{a.material.code} — {a.material.name}</span>
                              <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                {a.device ? <Cpu className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                                {a.device ? a.device.code : a.location}
                              </span>
                            </span>
                            <ReplacementBadge nextDueAt={a.nextDueAt} withText className="shrink-0" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={handleViewAllRepl}
                    className="flex w-full items-center justify-center gap-1 border-t border-border px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/5"
                  >
                    Mở lịch thay thế vật tư <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* App-grid quick launcher */}
        <div ref={gridRef} className="relative hidden sm:block">
          <button
            onClick={() => setGridOpen((o) => !o)}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-indigo-600 text-white shadow-lg shadow-indigo-500/30 ring-1 ring-white/50 transition-transform duration-200 before:absolute before:inset-x-1 before:top-0.5 before:h-1/3 before:rounded-t-lg before:bg-white/30 hover:scale-105 active:scale-95"
            aria-label="Truy cập nhanh"
          >
            <LayoutGrid className="relative h-[18px] w-[18px] drop-shadow-sm" />
          </button>
          {gridOpen && (
            <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-xl border border-border bg-white p-2 shadow-lg">
              <div className="grid grid-cols-3 gap-1.5">
                {quickLinks.map((l, i) => {
                  const Icon = l.icon;
                  return (
                    <Link
                      key={l.href + l.label}
                      href={l.href}
                      onClick={() => setGridOpen(false)}
                      className="flex flex-col items-center gap-1.5 rounded-lg p-2.5 text-center transition-colors hover:bg-muted"
                    >
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-black/5", GRID_TINTS[i % GRID_TINTS.length])}>
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="line-clamp-2 text-[11px] font-medium leading-tight text-ink">{l.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          className="relative hidden h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-500/30 ring-1 ring-white/50 transition-transform duration-200 before:absolute before:inset-x-1 before:top-0.5 before:h-1/3 before:rounded-t-lg before:bg-white/30 hover:scale-105 active:scale-95 sm:flex"
          aria-label="Toàn màn hình"
          title={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
        >
          {isFullscreen ? (
            <Minimize className="relative h-[18px] w-[18px] drop-shadow-sm" />
          ) : (
            <Maximize className="relative h-[18px] w-[18px] drop-shadow-sm" />
          )}
        </button>

        {/* Light / dark theme toggle */}
        <ThemeToggle />

        {/* User profile — click to open the account menu */}
        <div ref={profileRef} className="relative border-l border-border pl-3">
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-1.5 transition-colors hover:bg-muted"
            aria-label="Tài khoản"
          >
            <div className="hidden text-right leading-tight sm:block">
              <div className="max-w-[160px] truncate text-sm font-bold text-navy">{session?.user?.name ?? "—"}</div>
              {(session?.user?.position || session?.user?.role) && (
                <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {session?.user?.position ?? session?.user?.role}
                </div>
              )}
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-200 text-sm font-bold text-navy shadow-md ring-1 ring-white/70">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={session?.user?.name ?? ""} className="h-full w-full object-cover" />
              ) : (
                initials(session?.user?.name ?? "?")
              )}
            </div>
            <ChevronDown className={cn("hidden h-4 w-4 text-muted-foreground transition-transform sm:block", profileOpen && "rotate-180")} />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-14 z-50 w-64 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-violet-100 to-indigo-200 text-sm font-bold text-navy ring-1 ring-white/70">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={session?.user?.name ?? ""} className="h-full w-full object-cover" />
                  ) : (
                    initials(session?.user?.name ?? "?")
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-ink">{session?.user?.name ?? "—"}</div>
                  <div className="truncate text-xs text-muted-foreground">{session?.user?.position ?? session?.user?.role}</div>
                </div>
              </div>
              {/* Menu */}
              <div className="p-1.5">
                <Link
                  href="/account"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted"
                >
                  <UserCircle className="h-[18px] w-[18px] text-accent" /> Tài khoản
                </Link>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    setPasswordOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted"
                >
                  <KeyRound className="h-[18px] w-[18px] text-amber-600" /> Đổi mật khẩu
                </button>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    signOut({ callbackUrl: "/login" });
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-red-50"
                >
                  <LogOut className="h-[18px] w-[18px]" /> Đăng xuất
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </header>
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [newPasswordVisible, setNewPasswordVisible] = React.useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNewPasswordVisible(false);
      setConfirmPasswordVisible(false);
      setLoading(false);
    }
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Mật khẩu mới cần tối thiểu 8 ký tự");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Xác nhận mật khẩu mới không khớp");
      return;
    }

    setLoading(true);
    try {
      await apiMutate("/api/me/password", "PUT", {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      toast.success("Đã đổi mật khẩu", {
        description: "Bạn hãy dùng mật khẩu mới trong lần đăng nhập tiếp theo.",
      });
      onOpenChange(false);
    } catch (error) {
      toast.error("Không thể đổi mật khẩu", {
        description: error instanceof Error ? error.message : "Vui lòng thử lại sau.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <KeyRound className="h-4 w-4" />
            </span>
            Đổi mật khẩu
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
            <Input
              id="currentPassword"
              type="text"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Mật khẩu mới</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={newPasswordVisible ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-16"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setNewPasswordVisible((visible) => !visible)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy focus:outline-none focus:ring-2 focus:ring-accent/30"
                  aria-label={newPasswordVisible ? "Ẩn mật khẩu mới" : "Hiển thị mật khẩu mới"}
                  aria-pressed={newPasswordVisible}
                >
                  {newPasswordVisible ? "Ẩn" : "Hiển thị"}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Nhập lại mật khẩu</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={confirmPasswordVisible ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-16"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setConfirmPasswordVisible((visible) => !visible)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy focus:outline-none focus:ring-2 focus:ring-accent/30"
                  aria-label={confirmPasswordVisible ? "Ẩn nhập lại mật khẩu" : "Hiển thị nhập lại mật khẩu"}
                  aria-pressed={confirmPasswordVisible}
                >
                  {confirmPasswordVisible ? "Ẩn" : "Hiển thị"}
                </button>
              </div>
            </div>
          </div>
          <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            Mật khẩu mới cần tối thiểu 8 ký tự và không được trùng với mật khẩu hiện tại.
          </p>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Hủy
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Cập nhật
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NotifTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative -mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors",
        active ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-ink"
      )}
    >
      {label}
      {count > 0 && (
        <span className={cn("rounded-full px-1.5 text-[10px] font-bold", active ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground")}>
          {count}
        </span>
      )}
    </button>
  );
}
