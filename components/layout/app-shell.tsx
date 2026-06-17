"use client";

import * as React from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BroadcastModal } from "@/components/shared/broadcast-modal";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

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
        <main className="flex-1 p-4 md:p-6 lg:p-8 animate-fade-in">{children}</main>
      </div>

      {/* Thông báo hệ thống giữa màn hình (do Quản trị phát) */}
      <BroadcastModal />
    </div>
  );
}
