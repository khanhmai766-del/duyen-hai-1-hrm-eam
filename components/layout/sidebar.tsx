"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Clock, ChevronDown, LifeBuoy, Phone, ShieldCheck } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { useUsers } from "@/hooks/useUsers";
import { NAV_SECTIONS as SECTIONS, type NavItem } from "@/lib/nav";

function pathActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(base + "/");
}

export function Sidebar({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { data: session } = useSession();
  const role = session?.user?.role;

  // Live date/time clock (moved here from the topbar).
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  // Admin contacts shown in the help tooltip.
  const { data: usersData } = useUsers();
  const admins = (usersData?.data ?? []).filter((u) => u.role === "ADMIN");

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
    <div className="flex h-full w-full flex-col bg-white">
      {/* Logo — bấm để về trang chủ (Overview) */}
      <Link
        href="/"
        onClick={onNavigate}
        aria-label="Về trang chủ"
        className={cn("flex h-16 items-center justify-center gap-2.5 border-b border-border transition-colors hover:bg-muted/50", collapsed ? "px-2" : "px-5")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/4.png" alt="EVNGENCO1" className="h-9 w-9 shrink-0 object-contain" />
        {!collapsed && <span className="text-lg font-bold leading-tight text-navy">VẬN HÀNH 1</span>}
      </Link>

      {/* Nav */}
      <nav className={cn("flex-1 space-y-6 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
        {SECTIONS.map((section) => {
          const items = section.items.filter((i) => !i.adminOnly || role === "ADMIN");
          if (!items.length) return null;
          return (
            <div key={section.title}>
              {collapsed ? (
                <div className="mx-2 mb-2 border-t border-border" />
              ) : (
                <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {section.title}
                </div>
              )}
              <div className="space-y-1">
                {items.map((item) => (
                  <NavEntry key={item.href + item.label} item={item} onNavigate={onNavigate} collapsed={collapsed} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Help + Date/time footer */}
      <div className={cn("space-y-2 border-t border-border", collapsed ? "p-2" : "p-4")}>
        {/* Help icon (hover → admin contacts) + copyright */}
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          <div className="group relative shrink-0">
          <button
            className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-500/30 ring-1 ring-white/50 transition-transform duration-200 before:absolute before:inset-x-1 before:top-0.5 before:h-1/3 before:rounded-t-lg before:bg-white/30 hover:scale-105"
            aria-label="Trợ giúp"
          >
            <LifeBuoy className="relative h-[18px] w-[18px] drop-shadow-sm" />
          </button>
          {/* Tooltip card */}
          <div className="pointer-events-none absolute bottom-0 left-full z-50 ml-3 w-64 origin-bottom-left scale-95 rounded-xl border border-border bg-white p-3 opacity-0 shadow-xl transition-all duration-150 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100">
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
            <span className="flex-1 text-center text-[11px] leading-tight text-muted-foreground">
              © 2026 — Phân xưởng Vận hành 1
            </span>
          )}
        </div>

        {/* Date / time (moved from the topbar) */}
        <div
          title={timeStr}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg bg-muted/50 text-sm font-medium text-muted-foreground",
            collapsed ? "h-10" : "py-2.5"
          )}
        >
          <Clock className="h-4 w-4 text-accent" />
          {!collapsed && timeStr}
        </div>
      </div>
    </div>
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

  // Collapsed rail: every item is an icon-only link (parents jump to first child).
  if (collapsed) {
    const href = hasChildren ? item.children![0].href : item.href;
    return (
      <Link
        href={href}
        onClick={onNavigate}
        title={item.label}
        className={cn(
          "flex items-center justify-center rounded-lg py-2.5 transition-colors",
          active ? "bg-[#EFF6FF] text-navy" : "text-muted-foreground hover:bg-muted hover:text-ink"
        )}
      >
        <Icon className="h-5 w-5" />
      </Link>
    );
  }

  if (!hasChildren) {
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-lg border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors",
          active ? "border-l-accent bg-[#EFF6FF] text-navy" : "text-muted-foreground hover:bg-muted hover:text-ink"
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
        {item.label}
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors",
          childActive ? "text-navy" : "text-muted-foreground hover:bg-muted hover:text-ink"
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
          {item.children!.map((c) => {
            const ChildIcon = c.icon;
            const cActive = pathActive(pathname, c.href);
            return (
              <Link
                key={c.href}
                href={c.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  cActive ? "bg-[#EFF6FF] font-medium text-navy" : "text-muted-foreground hover:bg-muted hover:text-ink"
                )}
              >
                <ChildIcon className="h-4 w-4" />
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
