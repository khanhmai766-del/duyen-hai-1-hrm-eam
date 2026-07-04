"use client";

import * as React from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BroadcastModal } from "@/components/shared/broadcast-modal";
import { PowerLoadingOverlay } from "@/components/shared/power-loading-overlay";
import { pathAllowedForPosition } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const loadingCount = useIsFetching() + useIsMutating();
  const positionCarrier = React.useMemo(
    () => ({
      position: session?.user?.position,
      secondaryPosition: session?.user?.secondaryPosition,
      currentPosition: session?.user?.currentPosition,
    }),
    [session?.user?.currentPosition, session?.user?.position, session?.user?.secondaryPosition]
  );
  const blockedByPosition = !pathAllowedForPosition(pathname, positionCarrier);

  React.useEffect(() => {
    if (blockedByPosition) router.replace("/");
  }, [blockedByPosition, router]);

  return (
    <div className="flex min-h-screen bg-warmwhite dark:bg-background">
      {/* Desktop sidebar — elevated above the AppShell background; collapses to an icon rail */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden bg-white shadow-[6px_0_28px_-10px_rgba(15,23,42,0.22)] ring-1 ring-border/50 transition-[width] duration-300 dark:bg-card dark:shadow-[8px_0_34px_-18px_rgba(0,0,0,0.75)] lg:block",
          collapsed ? "w-[76px]" : "w-[280px]"
        )}
      >
        <Sidebar collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40 dark:bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] border-r border-border bg-white shadow-xl dark:bg-card">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[padding] duration-300",
          collapsed ? "lg:pl-[76px]" : "lg:pl-[280px]"
        )}
      >
        <Topbar onMenuClick={() => setMobileOpen(true)} onToggleSidebar={() => setCollapsed((c) => !c)} />
        <main className="flex-1 p-4 md:p-6 lg:p-8 animate-fade-in">
          {blockedByPosition ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm font-medium text-amber-800 shadow-sm">
              Chức vụ Thống kê chỉ được truy cập các mục Quản lý người dùng và Quản lý vật tư.
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {/* Thông báo hệ thống giữa màn hình (do Quản trị phát) */}
      <BroadcastModal />
      <PageScrollButtons />
      <PowerLoadingOverlay active={loadingCount > 0} />
    </div>
  );
}

function PageScrollButtons() {
  const [scrollState, setScrollState] = React.useState({ canGoTop: false, canGoBottom: false });

  const scrollToTop = React.useCallback(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const scrollToBottom = React.useCallback(() => {
    const bottom = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    document.documentElement.scrollTop = bottom;
    document.body.scrollTop = bottom;
    window.scrollTo({ top: bottom, behavior: "smooth" });
  }, []);

  React.useEffect(() => {
    const updateScrollState = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      setScrollState({
        canGoTop: scrollTop > 360,
        canGoBottom: scrollTop + viewportHeight < scrollHeight - 360,
      });
    };

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      window.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, []);

  return (
    <div className="fixed right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2 sm:right-5">
      <ScrollButton icon={ArrowUp} label="Quay lại đầu trang" visible={scrollState.canGoTop} onClick={scrollToTop} />
      <ScrollButton icon={ArrowDown} label="Đi đến cuối trang" visible={scrollState.canGoBottom} onClick={scrollToBottom} />
    </div>
  );
}

function ScrollButton({
  icon: Icon,
  label,
  visible,
  onClick,
}: {
  icon: typeof ArrowUp;
  label: string;
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-gradient-to-br from-navy to-accent text-white shadow-[0_16px_34px_-18px_rgba(15,23,42,0.75)] ring-1 ring-blue-100/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_38px_-18px_rgba(29,78,216,0.85)] focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:border-slate-700 dark:ring-slate-700",
        visible ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
