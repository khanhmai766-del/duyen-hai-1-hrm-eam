"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown, Clock, LifeBuoy, Phone, ShieldCheck } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { useUsers } from "@/hooks/useUsers";
import { NAV_SECTIONS as SECTIONS, type NavItem } from "@/lib/nav";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { usePeakMode } from "@/hooks/usePeakMode";
import { isPeakBlockedHref } from "@/lib/peak-mode";

const NAV_ACCESS_LEVELS = ["read", "own", "create", "approve", "manage", "full"] as const;

function pathActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(base + "/");
}

function sectionHasActiveItem(pathname: string, items: NavItem[]) {
  return items.some((item) => {
    if (pathActive(pathname, item.href)) return true;
    return item.children?.some((child) => pathActive(pathname, child.href)) ?? false;
  });
}

export function Sidebar({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const rbac = useRbacAccess();
  const peakMode = usePeakMode();
  const pathname = usePathname();
  const [closedSections, setClosedSections] = React.useState<Record<string, boolean>>({});

  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const { data: usersData } = useUsers();
  const admins = (usersData?.data ?? []).filter((u) => u.role === "ADMIN");

  React.useEffect(() => {
    for (const section of SECTIONS) {
      if (sectionHasActiveItem(pathname, section.items)) {
        setClosedSections((state) => (state[section.title] ? { ...state, [section.title]: false } : state));
      }
    }
  }, [pathname]);

  const timeStr = now
    ? now.toLocaleString("vi-VN", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_58%,#fff8ed_100%)] dark:bg-[linear-gradient(180deg,#0b1220_0%,#0f172a_58%,#17120b_100%)]">
      <div className={cn("border-b border-blue-100/80 dark:border-slate-800/80", collapsed ? "p-2" : "p-3")}>
        <Link
          href="/"
          prefetch={false}
          onClick={onNavigate}
          aria-label="Về trang chủ"
          className={cn(
            "group relative flex items-center overflow-hidden rounded-2xl transition-all duration-200",
            collapsed
              ? "h-12 justify-center"
              : "gap-3 px-3 py-3 bg-[linear-gradient(135deg,#173b73_0%,#1d6fd6_58%,#f59e0b_135%)] text-white shadow-[0_18px_35px_-22px_rgba(15,23,42,0.9)] ring-1 ring-white/70 hover:-translate-y-0.5 hover:shadow-[0_22px_40px_-22px_rgba(29,78,216,0.9)] dark:ring-white/10"
          )}
        >
          {!collapsed && <span className="absolute inset-x-0 top-0 h-1/2 bg-white/12" />}
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_20px_-12px_rgba(15,23,42,0.75)] ring-1 ring-white/70 dark:bg-slate-950 dark:ring-sky-300/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/4.png" alt="EVNGENCO1" className="h-8 w-8 object-contain" />
          </span>
          {!collapsed && (
            <>
              <span className="relative min-w-0 flex-1">
                <span className="block text-base font-extrabold leading-tight tracking-wide">VẬN HÀNH 1</span>
                <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.11em] text-blue-50/90">
                  Digital Operations
                </span>
              </span>
              <PowerGridMark />
            </>
          )}
        </Link>
      </div>

      <nav className={cn("flex-1 space-y-5 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
        {SECTIONS.map((section) => {
          const items = section.items
            .map((item) => {
              const children = item.children?.filter((child) => navItemAllowed(child, role, rbac.can) && !(peakMode.restrictHeavyRoutes && isPeakBlockedHref(child.href)));
              return children ? { ...item, children } : item;
            })
            .filter((item) => !(peakMode.restrictHeavyRoutes && isPeakBlockedHref(item.href)) && (navItemAllowed(item, role, rbac.can) || !!item.children?.length));
          if (!items.length) return null;
          const sectionClosed = !!closedSections[section.title];
          return (
            <div key={section.title}>
              {collapsed ? (
                <div className="mx-2 mb-2 border-t border-blue-100 dark:border-slate-800" />
              ) : (
                <div className="px-2 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.18)]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
                      {section.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => setClosedSections((state) => ({ ...state, [section.title]: !sectionClosed }))}
                      className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-blue-100 transition-all hover:text-accent hover:shadow-md dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:text-sky-300"
                      aria-label={sectionClosed ? `Sổ ${section.title}` : `Thu gọn ${section.title}`}
                      title={sectionClosed ? "Sổ danh mục" : "Thu gọn danh mục"}
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", sectionClosed && "-rotate-90")} />
                    </button>
                    <span className="h-px flex-1 bg-gradient-to-r from-blue-100 to-transparent dark:from-slate-700" />
                  </div>
                </div>
              )}
              {(!sectionClosed || collapsed) && (
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <NavEntry key={item.href + item.label} item={item} onNavigate={onNavigate} collapsed={collapsed} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className={cn("space-y-1.5 border-t border-blue-100/80 bg-white/70 dark:border-slate-800/80 dark:bg-slate-950/60", collapsed ? "p-2" : "p-3")}>
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          <div className="group relative shrink-0">
            <button
              className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-700 text-white shadow-lg shadow-blue-500/30 ring-1 ring-white/50 transition-transform duration-200 before:absolute before:inset-x-1 before:top-0.5 before:h-1/3 before:rounded-t-lg before:bg-white/30 hover:scale-105"
              aria-label="Trợ giúp"
            >
              <LifeBuoy className="relative h-4 w-4 drop-shadow-sm" />
            </button>
            <div className="pointer-events-none absolute bottom-0 left-full z-50 ml-3 w-64 origin-bottom-left scale-95 rounded-xl border border-border bg-white p-3 opacity-0 shadow-xl transition-all duration-150 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 dark:bg-slate-900">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
                <ShieldCheck className="h-3.5 w-3.5" /> Hỗ trợ · Quản trị viên
              </div>
              {admins.length === 0 ? (
                <p className="text-xs text-muted-foreground">Chưa có thông tin quản trị viên.</p>
              ) : (
                <ul className="space-y-2">
                  {admins.map((a) => (
                    <li key={a.id} className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-[10px] font-bold text-white">
                        {a.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.avatarUrl} alt={a.name} className="h-full w-full object-cover" />
                        ) : (
                          initials(a.name)
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{a.name}</span>
                        {a.phone ? (
                          <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                            <Phone className="h-3 w-3" /> {a.phone}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {!collapsed && (
            <span className="flex-1 text-center text-[10.5px] leading-tight text-muted-foreground">
              © 2026 — Phân xưởng Vận hành 1
            </span>
          )}
        </div>

        <div
          title={timeStr}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white/80 text-sm font-semibold text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-300",
            collapsed ? "h-10" : "py-2"
          )}
        >
          <Clock className="h-4 w-4 text-accent" />
          {!collapsed && timeStr}
        </div>
      </div>
    </div>
  );
}

function navItemAllowed(item: NavItem, role: string | undefined, can: ReturnType<typeof useRbacAccess>["can"]) {
  if (!item.adminOnly) return true;
  if (role === "ADMIN") return true;
  return (item.permissionIds ?? []).some((permissionId) => can(permissionId, [...NAV_ACCESS_LEVELS]));
}

function PowerGridMark() {
  return (
    <span
      className="relative flex h-9 w-9 shrink-0 items-center justify-center text-amber-300 transition-transform duration-200 group-hover:scale-105"
      aria-hidden="true"
    >
      <svg viewBox="0 0 36 36" className="h-8 w-8 drop-shadow-[0_1px_3px_rgba(15,23,42,0.55)]">
        <polygon points="18,2.5 31.4,10.25 31.4,25.75 18,33.5 4.6,25.75 4.6,10.25" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        <polygon points="20,8 12,19 17.5,19 15,28.5 24,16 18.5,16" fill="currentColor" />
      </svg>
    </span>
  );
}

function NavEntry({ item, onNavigate, collapsed = false }: { item: NavItem; onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const Icon = item.icon;
  const hasChildren = !!item.children?.length;
  const childActive = hasChildren && item.children!.some((c) => pathActive(pathname, c.href));
  const active = pathActive(pathname, item.href) || childActive;
  const [open, setOpen] = React.useState(childActive);

  React.useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  if (collapsed) {
    const href = hasChildren ? item.children![0].href : item.href;
    return (
      <Link
        href={href}
        prefetch={false}
        onClick={onNavigate}
        title={item.label}
        className={cn(
          "group flex h-11 items-center justify-center rounded-xl transition-all duration-200",
          active
            ? "bg-white text-navy shadow-[0_12px_24px_-18px_rgba(30,64,175,0.8)] ring-1 ring-blue-100 dark:bg-slate-800 dark:text-sky-100 dark:ring-sky-400/20"
            : "text-slate-500 hover:bg-white hover:text-accent hover:shadow-sm dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-200"
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200",
            active
              ? "bg-gradient-to-br from-blue-500 to-blue-800 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_-10px_rgba(30,64,175,0.95)]"
              : "bg-white text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_18px_-16px_rgba(15,23,42,0.75)] ring-1 ring-blue-100 group-hover:text-accent dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:group-hover:text-sky-300"
          )}
        >
          <Icon className="h-[17px] w-[17px] drop-shadow-sm" />
        </span>
      </Link>
    );
  }

  if (!hasChildren) {
    return (
      <Link
        href={item.href}
        prefetch={false}
        onClick={onNavigate}
        className={cn(
          "group relative flex min-h-[42px] items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold leading-tight transition-all duration-200",
          active
            ? "bg-white text-navy shadow-[0_16px_30px_-24px_rgba(30,64,175,0.9)] ring-1 ring-blue-100 dark:bg-slate-800 dark:text-sky-100 dark:ring-sky-400/20"
            : "text-slate-600 hover:bg-white hover:text-navy hover:shadow-sm hover:ring-1 hover:ring-blue-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-sky-100 dark:hover:ring-sky-400/20"
        )}
      >
        {active && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.55)]" />}
        <span
          className={cn(
            "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
            active
              ? "bg-gradient-to-br from-blue-500 to-blue-800 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_20px_-12px_rgba(30,64,175,0.95)]"
              : "bg-white text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_18px_-16px_rgba(15,23,42,0.75)] ring-1 ring-blue-100 group-hover:-translate-y-0.5 group-hover:text-accent group-hover:shadow-[0_12px_22px_-16px_rgba(30,64,175,0.65)] dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:group-hover:text-sky-300"
          )}
        >
          <Icon className="h-[17px] w-[17px] drop-shadow-sm" />
        </span>
        <span className="min-w-0 flex-1">{item.label}</span>
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "group relative flex min-h-[42px] w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold leading-tight transition-all duration-200",
          childActive
            ? "bg-white text-navy shadow-[0_16px_30px_-24px_rgba(30,64,175,0.9)] ring-1 ring-blue-100 dark:bg-slate-800 dark:text-sky-100 dark:ring-sky-400/20"
            : "text-slate-600 hover:bg-white hover:text-navy hover:shadow-sm hover:ring-1 hover:ring-blue-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-sky-100 dark:hover:ring-sky-400/20"
        )}
      >
        {childActive && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.55)]" />}
        <span
          className={cn(
            "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
            childActive
              ? "bg-gradient-to-br from-blue-500 to-blue-800 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_20px_-12px_rgba(30,64,175,0.95)]"
              : "bg-white text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_18px_-16px_rgba(15,23,42,0.75)] ring-1 ring-blue-100 group-hover:-translate-y-0.5 group-hover:text-accent group-hover:shadow-[0_12px_22px_-16px_rgba(30,64,175,0.65)] dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:group-hover:text-sky-300"
          )}
        >
          <Icon className="h-[17px] w-[17px] drop-shadow-sm" />
        </span>
        <span className="min-w-0 flex-1 text-left">{item.label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="ml-4 mt-1.5 space-y-1 border-l border-blue-100 pl-3 dark:border-slate-700">
          {item.children!.map((c) => {
            const ChildIcon = c.icon;
            const cActive = pathActive(pathname, c.href);
            return (
              <Link
                key={c.href}
                href={c.href}
                prefetch={false}
                onClick={onNavigate}
                className={cn(
                  "group flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium leading-tight transition-colors",
                  cActive
                    ? "bg-white text-navy shadow-sm ring-1 ring-blue-100 dark:bg-slate-800 dark:text-sky-100 dark:ring-sky-400/20"
                    : "text-slate-500 hover:bg-white hover:text-navy dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-100"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ring-1 ring-blue-100",
                    cActive ? "bg-blue-600 text-white" : "bg-white text-slate-500 group-hover:text-accent dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:group-hover:text-sky-300"
                  )}
                >
                  <ChildIcon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">{c.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
