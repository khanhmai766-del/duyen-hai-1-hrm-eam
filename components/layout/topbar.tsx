"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Menu, Search, CornerDownLeft, ChevronRight, LogOut, LayoutGrid, Maximize, Minimize, UserCircle, ChevronDown, Repeat, Cpu, MapPin, KeyRound, Loader2, ClipboardList, ExternalLink, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isStatisticsPosition, navItemAllowedForPosition, navSectionsForPosition, normalizeText } from "@/lib/nav";
import { apiMutate } from "@/lib/fetcher";
import { passwordPolicyMessage } from "@/lib/password-policy";
import { acknowledgeForumNotice, useNotifications, NOTICE_TONE } from "@/hooks/useNotifications";
import { useCurrentPosition } from "@/hooks/useCurrentPosition";
import { useReplacementAlerts } from "@/hooks/useReplacements";
import { ReplacementBadge } from "@/components/materials/replacement-badge";
import { useMyDashboard, useOperations } from "@/hooks/useDashboard";
import { useMeProfile } from "@/hooks/useUsers";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { useAdminMode } from "@/hooks/useAdminMode";
import { OPERATION_TYPE, ROLES, type RoleKey } from "@/lib/constants";
import { cn, initials, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { NavItem } from "@/lib/nav";

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
const NAV_ACCESS_LEVELS = ["read", "personal", "manage", "full"] as const;

/** Header mobile chỉ giữ tên lót cuối + tên để gọn mà vẫn đủ nhận diện người dùng. */
function mobileDisplayNameOf(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.slice(-2).join(" ") || fullName;
}

function navItemAllowed(
  item: NavItem,
  role: string | undefined,
  can: ReturnType<typeof useRbacAccess>["can"],
  adminMode = true,
  position?: Parameters<typeof navItemAllowedForPosition>[1]
) {
  if (!navItemAllowedForPosition(item, position, role)) return false;
  if (role === "ADMIN" && adminMode) return true;
  if (item.adminOnly) return false;
  if (item.permissionIds?.length) {
    return item.permissionIds.some((permissionId) => can(permissionId, [...NAV_ACCESS_LEVELS]));
  }
  return !item.adminOnly;
}

async function logout(callbackUrl = "/login") {
  try {
    localStorage.removeItem("pp:last-activity");
    sessionStorage.removeItem("pp:org-chart-viewer-active");
  } catch {
    // bỏ qua nếu storage không khả dụng
  }
  try {
    await fetch("/api/auth/logout-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "manual" }),
    }).catch(() => null);
    const result = await signOut({ callbackUrl, redirect: false });
    window.location.assign(result?.url ?? callbackUrl);
  } catch {
    window.location.assign(callbackUrl);
  }
}

export function Topbar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const { data: session } = useSession();
  const rbac = useRbacAccess();
  const isSystemAdmin = session?.user?.role === "ADMIN";
  const [adminMode, setAdminMode] = useAdminMode();
  const currentPosition = useCurrentPosition();
  const router = useRouter();
  const queryClient = useQueryClient();
  const role = session?.user?.role;
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [notifTab, setNotifTab] = React.useState<"ops" | "repl" | "internal">("ops");
  const notifRef = React.useRef<HTMLDivElement>(null);
  const [gridOpen, setGridOpen] = React.useState(false);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const forcePasswordChange = Boolean(session?.user?.mustChangePassword);
  const profileRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  // Cảnh báo thay thế vật tư đã được "xem" (lưu client theo khóa id:nextDueAt).
  const [ackedReplKeys, setAckedReplKeys] = React.useState<Set<string>>(new Set());
  const { notices, loading: notifLoading } = useNotifications();
  const { data: alertsData, isLoading: alertsLoading } = useReplacementAlerts();
  // Sự kiện vận hành CHỈ nuôi nội dung tab "Nội bộ" trong chuông, không nằm trong số badge
  // (totalAlerts = notices + cảnh báo vật tư) → chỉ tải khi người dùng thực sự mở chuông.
  const { data: opsData, isLoading: opsLoading } = useOperations(undefined, { enabled: notifOpen });
  const { data: profileData } = useMeProfile();
  const profile = profileData?.data ?? null;
  // Tab Nội bộ trên chuông chỉ phản chiếu đúng các mục đang hiển thị trong
  // "Thông tin nội bộ" ở Overview: hôm nay hoặc sắp tới, không lấy lịch đã qua.
  const internalEvents = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (opsData?.data ?? [])
      .filter((e) => {
        const d = new Date(e.date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() >= today.getTime();
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [opsData]);
  const replAlerts = alertsData?.data ?? [];
  const replAlertKey = (a: (typeof replAlerts)[number]) => `${a.id}:${new Date(a.nextDueAt).getTime()}`;
  const activeReplAlerts = replAlerts.filter((a) => !ackedReplKeys.has(replAlertKey(a)));
  const totalAlerts = notices.length + activeReplAlerts.length;
  const { data: dash } = useMyDashboard();
  const displayName = session?.user?.name || profile?.name || "Tài khoản";
  const mobileDisplayName = mobileDisplayNameOf(displayName);
  const displayRole = role || profile?.role || "";
  const avatarUrl = dash?.data?.avatarUrl ?? profile?.avatarUrl ?? null;
  const accountSubtitle =
    currentPosition.position ||
    profile?.currentPosition ||
    profile?.position ||
    ROLES[displayRole as RoleKey]?.label ||
    displayRole ||
    "";
  const positionCarrier = React.useMemo(
    () => ({
      position: currentPosition.position || session?.user?.position || profile?.position,
      secondaryPosition: session?.user?.secondaryPosition || profile?.secondaryPosition,
      secondaryPosition2: session?.user?.secondaryPosition2 || profile?.secondaryPosition2,
      currentPosition: currentPosition.position || session?.user?.currentPosition || profile?.currentPosition,
    }),
    [
      currentPosition.position,
      profile?.currentPosition,
      profile?.position,
      profile?.secondaryPosition,
      profile?.secondaryPosition2,
      session?.user?.currentPosition,
      session?.user?.position,
      session?.user?.secondaryPosition,
      session?.user?.secondaryPosition2,
    ]
  );
  const navSections = React.useMemo(() => navSectionsForPosition(positionCarrier), [positionCarrier]);
  const statisticsNavRestricted = isStatisticsPosition(positionCarrier);

  React.useEffect(() => {
    if (forcePasswordChange) setPasswordOpen(true);
  }, [forcePasswordChange]);

  // Quick-launch shortcuts (app grid) — top-level nav respecting admin-only.
  const quickLinks = React.useMemo(
    () =>
      navSections.flatMap((s) =>
        s.items.flatMap((i) => {
          const children = i.children?.filter((child) => navItemAllowed(child, role, rbac.can, adminMode, positionCarrier));
          if (children) return children.map((child) => ({ label: child.label, href: child.href, icon: child.icon, external: child.external }));
          return navItemAllowed(i, role, rbac.can, adminMode, positionCarrier) ? [{ label: i.label, href: i.href, icon: i.icon, external: i.external }] : [];
        })
      ),
    [adminMode, navSections, positionCarrier, rbac.can, role]
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
      navSections.flatMap((s) =>
        s.items
          .map((i) => ({
            ...i,
            children: i.children?.filter((child) => navItemAllowed(child, role, rbac.can, adminMode, positionCarrier)),
          }))
          .filter((i) => (i.children ? i.children.length > 0 : navItemAllowed(i, role, rbac.can, adminMode, positionCarrier)))
          .flatMap((i) => {
            const own = i.children ? null : {
              label: i.label,
              href: i.href,
              icon: i.icon,
              external: i.external,
              section: s.title,
              hay: normalizeText(`${i.label} ${s.title} ${i.keywords ?? ""}`),
            };
            const kids = (i.children ?? []).map((c) => ({
              label: c.label,
              href: c.href,
              icon: c.icon,
              external: c.external,
              section: `${s.title} › ${i.label}`,
              hay: normalizeText(`${c.label} ${i.label} ${s.title} ${c.keywords ?? ""}`),
            }));
            return own ? [own, ...kids] : kids;
          })
      ),
    [adminMode, navSections, positionCarrier, rbac.can, role]
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

  function go(href: string, external?: boolean) {
    setQ("");
    setOpen(false);
    if (external) window.open(href, "_blank", "noopener,noreferrer");
    else router.push(href);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (results.length) go(results[0].href, results[0].external);
    else if (q.trim() && statisticsNavRestricted) toast.info("Chức vụ Thống kê chỉ tìm trong các mục được phân quyền");
    else if (q.trim()) go(`/devices?view=table&q=${encodeURIComponent(q.trim())}`);
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
      <div ref={boxRef} className="relative hidden min-w-0 sm:block sm:flex-none">
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
                          onClick={() => go(r.href, r.external)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink">{r.label}</span>
                            <span className="block truncate text-xs text-muted-foreground">{r.section}</span>
                          </span>
                          {r.external && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
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
                  {`Không tìm thấy. Nhấn Enter để tìm thiết bị "${q.trim()}".`}
                </div>
              )}
            </div>
          )}
      </div>

      <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto sm:gap-3">
        <div ref={notifRef} className="relative order-4 sm:order-none">
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
            <div className="fixed inset-x-2 top-[4.25rem] z-50 max-h-[calc(100dvh-5rem)] overflow-hidden rounded-xl border border-border bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-80">
              <div className="border-b border-border px-4 pt-2.5">
                <span className="text-sm font-semibold text-ink">Thông báo</span>
                {/* Tabs: tách biệt cảnh báo vận hành và cảnh báo thay thế vật tư */}
                <div className="mt-2 grid grid-cols-3 gap-1 sm:flex">
                  <NotifTab active={notifTab === "ops"} onClick={() => setNotifTab("ops")} label="Vận hành" count={notices.length} />
                  <NotifTab active={notifTab === "repl"} onClick={() => setNotifTab("repl")} label="Thay thế vật tư" count={activeReplAlerts.length} />
                  <NotifTab active={notifTab === "internal"} onClick={() => setNotifTab("internal")} label="Nội bộ" count={internalEvents.length} />
                </div>
              </div>

              {notifTab === "ops" && (
                <>
                  {notifLoading ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">Đang tải…</div>
                  ) : notices.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                      <Bell className="h-7 w-7 text-muted-foreground/40" />
                      <span className="text-sm text-muted-foreground">Không có thông báo vận hành mới</span>
                    </div>
                  ) : (
                    <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                      {notices.slice(0, 6).map((n) => {
                        const Icon = n.icon;
                        return (
                          <li key={n.id}>
                            <Link
                              href={n.href}
                              prefetch={false}
                              onClick={() => {
                                if (n.id.startsWith("forum-")) acknowledgeForumNotice(n.id.replace(/^forum-/, ""));
                                setNotifOpen(false);
                              }}
                              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                            >
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
                </>
              )}

              {notifTab === "repl" && (
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
                          <Link href={`/materials?track=${a.materialId}`} prefetch={false} onClick={() => setNotifOpen(false)} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
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

              {notifTab === "internal" && (
                <>
                  {opsLoading ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">Đang tải…</div>
                  ) : internalEvents.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                      <ClipboardList className="h-7 w-7 text-muted-foreground/40" />
                      <span className="text-sm text-muted-foreground">Chưa có thông tin nội bộ</span>
                    </div>
                  ) : (
                    <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                      {internalEvents.slice(0, 8).map((e) => {
                        const meta = OPERATION_TYPE[e.type as keyof typeof OPERATION_TYPE] ?? OPERATION_TYPE.OTHER;
                        return (
                          <li key={e.id}>
                            <Link href="/" prefetch={false} onClick={() => setNotifOpen(false)} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", meta.badge)}>
                                <ClipboardList className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-ink">{e.title}</span>
                                <span className="block truncate text-xs text-muted-foreground">{meta.label} · {formatDate(e.date)}</span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <Link href="/" prefetch={false} onClick={() => setNotifOpen(false)} className="flex w-full items-center justify-center gap-1 border-t border-border px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/5">
                    Xem tất cả <ChevronRight className="h-4 w-4" />
                  </Link>
                </>
              )}
            </div>
          )}
        </div>

        {isSystemAdmin && (
          <button
            type="button"
            role="switch"
            aria-checked={adminMode}
            onClick={() => {
              const next = !adminMode;
              setAdminMode(next);
              void queryClient.invalidateQueries();
              router.refresh();
              toast.success(next ? "Đã bật chế độ Quản trị" : "Đã chuyển sang chế độ Nghiệp vụ");
            }}
            className={cn(
              "relative hidden h-9 min-w-9 items-center justify-center gap-1.5 rounded-xl px-2 text-white shadow-lg ring-1 ring-white/50 transition-transform duration-200 before:absolute before:inset-x-1 before:top-0.5 before:h-1/3 before:rounded-t-lg before:bg-white/25 hover:scale-105 active:scale-95 sm:flex",
              adminMode
                ? "bg-gradient-to-br from-orange-400 to-orange-600 shadow-orange-500/30"
                : "bg-gradient-to-br from-slate-400 to-slate-600 shadow-slate-500/25"
            )}
            aria-label={adminMode ? "Tắt chế độ quản trị" : "Bật chế độ quản trị"}
            title={adminMode ? "Đang ở chế độ Quản trị — bấm để chuyển sang Nghiệp vụ" : "Đang ở chế độ Nghiệp vụ — bấm để bật Quản trị"}
          >
            <ShieldCheck className="relative h-[18px] w-[18px] drop-shadow-sm" />
            <span className="relative hidden text-[10px] font-black tracking-wide xl:inline">{adminMode ? "QT" : "NV"}</span>
            <span className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white", adminMode ? "bg-emerald-400" : "bg-slate-300")} />
          </button>
        )}

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
                      prefetch={false}
                      target={l.external ? "_blank" : undefined}
                      rel={l.external ? "noopener noreferrer" : undefined}
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

        {/* Desktop/tablet giữ nút giao diện; mobile dùng logo EVN làm lối về trang chủ. */}
        <div className="hidden sm:block">
          <ThemeToggle />
        </div>
        <Link
          href="/"
          prefetch={false}
          className="group relative isolate order-1 flex h-11 shrink-0 items-center gap-2 overflow-hidden rounded-[15px] border border-sky-300/30 bg-[linear-gradient(135deg,#061a36_0%,#0b376d_58%,#075b9a_100%)] py-1 pl-1 pr-2.5 shadow-[0_8px_22px_-10px_rgba(3,74,140,0.9)] ring-1 ring-white/70 transition duration-200 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_18%_-30%,rgba(125,211,252,0.65),transparent_48%)] after:pointer-events-none after:absolute after:-right-4 after:-top-7 after:h-14 after:w-14 after:rounded-full after:border after:border-white/10 hover:border-sky-200/60 hover:shadow-[0_10px_26px_-10px_rgba(2,132,199,0.95)] active:scale-[0.98] sm:hidden"
          aria-label="Về trang chủ"
          title="Về trang chủ"
        >
          <span className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-white/80 bg-white/95 shadow-[0_0_0_3px_rgba(56,189,248,0.12),0_5px_12px_-4px_rgba(0,0,0,0.55)] transition-transform duration-200 group-hover:scale-105">
            <Image src="/brand/4.png" alt="Logo EVN" width={28} height={28} className="h-7 w-7 object-contain" priority />
          </span>
          <span className="relative z-10 flex flex-col justify-center border-l border-white/20 pl-2 leading-none">
            <span className="whitespace-nowrap text-[7px] font-bold uppercase tracking-[0.18em] text-sky-200">Nhiệt Điện</span>
            <span className="mt-1 whitespace-nowrap text-[12px] font-black uppercase tracking-[0.04em] text-white [text-shadow:0_1px_8px_rgba(125,211,252,0.35)]">Duyên Hải 1</span>
            <span aria-hidden="true" className="mt-1 h-[2px] w-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-transparent opacity-90" />
          </span>
        </Link>

        <div className="order-2 ml-auto min-w-0 flex-1 text-right sm:hidden">
          <p className="whitespace-nowrap text-[12px] font-semibold leading-4 text-muted-foreground">
            Welcome back
          </p>
          <p className="flex min-w-0 items-center justify-end gap-1 whitespace-nowrap text-[17px] font-bold leading-5 tracking-tight text-ink">
            <span className="truncate">{mobileDisplayName}</span>
            <span className="shrink-0" aria-hidden="true">👋</span>
          </p>
        </div>

        {/* User profile — click to open the account menu */}
        <div ref={profileRef} className="relative order-3 sm:order-none sm:border-l sm:border-border sm:pl-3">
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-1.5 transition-colors hover:bg-muted"
            aria-label="Tài khoản"
          >
            <div className="hidden text-right leading-tight sm:block">
              <div className="max-w-[160px] truncate text-sm font-bold text-navy">{displayName}</div>
              {accountSubtitle && (
                <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {accountSubtitle}
                </div>
              )}
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-200 text-sm font-bold text-navy shadow-md ring-1 ring-white/70">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                initials(displayName)
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
                    <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    initials(displayName)
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-ink">{displayName}</div>
                  <div className="truncate text-xs text-muted-foreground">{accountSubtitle}</div>
                </div>
              </div>
              {/* Menu */}
              <div className="p-1.5">
                <Link
                  href="/account"
                  prefetch={false}
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
                    void logout("/login");
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
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} forced={forcePasswordChange} />
    </header>
  );
}

function ChangePasswordDialog({ open, onOpenChange, forced }: { open: boolean; onOpenChange: (open: boolean) => void; forced?: boolean }) {
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
    const policyError = passwordPolicyMessage(newPassword);
    if (policyError) {
      toast.error(policyError);
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
        description: forced ? "Vui lòng đăng nhập lại bằng mật khẩu mới." : "Bạn hãy dùng mật khẩu mới trong lần đăng nhập tiếp theo.",
      });
      if (forced) {
        void logout("/login");
        return;
      }
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
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (forced && !nextOpen) return;
      onOpenChange(nextOpen);
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <KeyRound className="h-4 w-4" />
            </span>
            {forced ? "Đổi mật khẩu bắt buộc" : "Đổi mật khẩu"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
            <Input
              id="currentPassword"
              type="password"
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
            Mật khẩu mới cần tối thiểu 8 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt và không được trùng với mật khẩu hiện tại.
          </p>
          <DialogFooter className="gap-2">
            {!forced && (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Hủy
              </Button>
            )}
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
        "relative -mb-px flex min-h-10 w-full items-center justify-center gap-1.5 border-b-2 px-1 py-2 text-center text-xs font-medium leading-tight transition-colors sm:min-h-0 sm:w-auto sm:px-2.5",
        active ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-ink"
      )}
    >
      <span className="min-w-0 break-words">{label}</span>
      {count > 0 && (
        <span className={cn("shrink-0 rounded-full px-1.5 text-[10px] font-bold", active ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground")}>
          {count}
        </span>
      )}
    </button>
  );
}
