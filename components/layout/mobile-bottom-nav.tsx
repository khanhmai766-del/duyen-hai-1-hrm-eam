"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  CalendarDays,
  ChevronRight,
  Grid3X3,
  MoreHorizontal,
  Package,
  ScanLine,
  Search,
  ShieldAlert,
  UserCircle,
  Wrench,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminMode } from "@/hooks/useAdminMode";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import {
  navItemAllowedForPosition,
  navSectionsForPosition,
  normalizeText,
  type NavItem,
  type NavSection,
} from "@/lib/nav";
import { cn } from "@/lib/utils";

const NAV_ACCESS_LEVELS = ["read", "personal", "manage", "full"] as const;
const PRIMARY_PATHS = ["/hr", "/defects", "/devices/scan", "/replacement-procedures"];

function routeMatches(pathname: string, href: string) {
  const base = href.split("?")[0];
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}

function itemAllowed(
  item: NavItem,
  role: string | undefined,
  can: ReturnType<typeof useRbacAccess>["can"],
  adminMode: boolean,
  position: Parameters<typeof navItemAllowedForPosition>[1]
) {
  if (!navItemAllowedForPosition(item, position, role)) return false;
  if (role === "ADMIN" && adminMode) return true;
  if (item.adminOnly) return false;
  if (item.permissionIds?.length) {
    return item.permissionIds.some((permissionId) => can(permissionId, [...NAV_ACCESS_LEVELS]));
  }
  return true;
}

type MoreSection = { title: string; items: NavItem[] };

function sectionTitle(section: NavSection) {
  if (section.title === "Quản lý người dùng") return "Tổng quan & hệ thống";
  if (section.title === "Quản lý thiết bị") return "Thiết bị & vận hành";
  return section.title.replace(/^QUẢN LÝ /, "").replace(/^TIỆN ÍCH$/, "Tiện ích");
}

export function MobileBottomNav({ onOpenAllMenu }: { onOpenAllMenu: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { can } = useRbacAccess();
  const [adminMode] = useAdminMode();
  const [defectOpen, setDefectOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const user = session?.user;
  const readOnlyDefects = user?.accessMode === "DEFECT_READ_ONLY";
  const canScanDevices = !readOnlyDefects && can("device-view", [...NAV_ACCESS_LEVELS]);
  const positionCarrier = React.useMemo(
    () => ({
      position: user?.position,
      secondaryPosition: user?.secondaryPosition,
      secondaryPosition2: user?.secondaryPosition2,
      currentPosition: user?.currentPosition,
    }),
    [user?.currentPosition, user?.position, user?.secondaryPosition, user?.secondaryPosition2]
  );

  const moreSections = React.useMemo<MoreSection[]>(() => {
    if (readOnlyDefects) return [];
    return navSectionsForPosition(positionCarrier)
      .map((section) => {
        const items = section.items.flatMap((item) => {
          if (PRIMARY_PATHS.some((path) => routeMatches(path, item.href))) return [];
          if (item.children?.length) {
            return item.children.filter((child) => itemAllowed(child, user?.role, can, adminMode, positionCarrier));
          }
          return itemAllowed(item, user?.role, can, adminMode, positionCarrier) ? [item] : [];
        });
        return { title: sectionTitle(section), items };
      })
      .filter((section) => section.items.length > 0);
  }, [adminMode, can, positionCarrier, readOnlyDefects, user?.role]);

  const filteredSections = React.useMemo(() => {
    const key = normalizeText(query);
    if (!key) return moreSections;
    return moreSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          normalizeText(`${item.label} ${item.keywords ?? ""} ${section.title}`).includes(key)
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [moreSections, query]);

  const moreActive =
    moreOpen || !PRIMARY_PATHS.some((path) => routeMatches(pathname, path));

  const openAllMenu = () => {
    setMoreOpen(false);
    onOpenAllMenu();
  };

  return (
    <>
      <nav
        aria-label="Điều hướng chính trên điện thoại"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_-18px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-950/95 lg:hidden"
      >
        <div className="mx-auto grid h-[68px] max-w-lg grid-cols-5 items-end px-1">
          <BottomLink href="/hr" label="Lịch làm việc" icon={CalendarDays} active={routeMatches(pathname, "/hr")} disabled={readOnlyDefects} />
          <BottomButton
            label="Khiếm khuyết"
            icon={ShieldAlert}
            active={defectOpen || routeMatches(pathname, "/defects")}
            onClick={() => setDefectOpen(true)}
          />
          {canScanDevices ? <Link
            href="/devices/scan"
            aria-label="Quét mã QR thiết bị"
            className="group flex min-h-16 flex-col items-center justify-end gap-1 pb-1.5 text-center"
          >
            <span
              className={cn(
                "flex h-[58px] w-[58px] -translate-y-2 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-[0_12px_28px_-8px_rgba(234,88,12,0.75)] ring-1 ring-orange-300 transition-transform active:scale-95 dark:border-slate-950",
                routeMatches(pathname, "/devices/scan") && "ring-4 ring-orange-200"
              )}
            >
              <ScanLine className="h-7 w-7" strokeWidth={2.4} />
            </span>
            <span className="-mt-2 text-[11px] font-bold leading-none text-orange-700 dark:text-orange-300">Quét QR</span>
          </Link> : <span
            aria-disabled="true"
            title="Tài khoản chưa được cấp quyền xem thiết bị"
            className="flex min-h-16 flex-col items-center justify-end gap-1 pb-1.5 text-center opacity-40 grayscale"
          >
            <span className="flex h-[58px] w-[58px] -translate-y-2 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg dark:border-slate-950">
              <ScanLine className="h-7 w-7" strokeWidth={2.4} />
            </span>
            <span className="-mt-2 text-[11px] font-bold leading-none text-orange-700 dark:text-orange-300">Quét QR</span>
          </span>}
          <BottomLink
            href="/replacement-procedures"
            label="Vật tư"
            icon={Package}
            active={routeMatches(pathname, "/replacement-procedures")}
            disabled={readOnlyDefects}
          />
          <BottomButton label="Thêm" icon={MoreHorizontal} active={moreActive} onClick={() => setMoreOpen(true)} />
        </div>
      </nav>

      <Dialog open={defectOpen} onOpenChange={setDefectOpen}>
        <MobileSheet>
          <DialogHeader>
            <DialogTitle>Chọn nhóm khiếm khuyết</DialogTitle>
            <DialogDescription>Mở danh sách khiếm khuyết theo đúng chuyên ngành.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <DialogClose asChild>
              <Link
                href="/defects?phan=co"
                className="flex min-h-20 items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 transition-colors active:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white"><Wrench className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-bold">Cơ – Hóa</span><span className="text-xs opacity-70">Thiết bị cơ khí và hóa</span></span>
                <ChevronRight className="h-5 w-5" />
              </Link>
            </DialogClose>
            <DialogClose asChild>
              <Link
                href="/defects?phan=dien"
                className="flex min-h-20 items-center gap-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950 transition-colors active:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white"><Zap className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-bold">Điện</span><span className="text-xs opacity-70">Thiết bị và hệ thống điện</span></span>
                <ChevronRight className="h-5 w-5" />
              </Link>
            </DialogClose>
          </div>
        </MobileSheet>
      </Dialog>

      <Dialog open={moreOpen} onOpenChange={(open) => { setMoreOpen(open); if (!open) setQuery(""); }}>
        <MobileSheet className="max-h-[82dvh] grid-rows-[auto_auto_1fr_auto] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Thêm chức năng</DialogTitle>
            <DialogDescription>Các mục dưới đây được hiển thị theo quyền tài khoản của bạn.</DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm chức năng..."
              aria-label="Tìm chức năng"
              className="h-11 w-full rounded-xl border border-input bg-muted/40 pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>

          <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
            <div className="mb-4 grid grid-cols-2 gap-2">
              <MoreLink href="/account" label="Tài khoản của tôi" icon={UserCircle} onNavigate={() => setMoreOpen(false)} />
              <button
                type="button"
                onClick={openAllMenu}
                className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-muted/30 p-3 text-left transition-colors active:bg-muted"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy text-white"><Grid3X3 className="h-5 w-5" /></span>
                <span className="text-sm font-semibold text-ink">Tất cả chức năng</span>
              </button>
            </div>

            {filteredSections.length ? filteredSections.map((section) => (
              <section key={section.title} className="mb-5">
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{section.title}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {section.items.map((item) => (
                    <MoreLink key={`${item.href}-${item.label}`} {...item} onNavigate={() => setMoreOpen(false)} />
                  ))}
                </div>
              </section>
            )) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {query ? "Không tìm thấy chức năng phù hợp." : "Tài khoản này không có thêm chức năng được cấp quyền."}
              </p>
            )}
          </div>
        </MobileSheet>
      </Dialog>
    </>
  );
}

function MobileSheet({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <DialogContent
      className={cn(
        "bottom-0 left-0 right-0 top-auto w-full max-w-none translate-x-0 translate-y-0 gap-4 rounded-t-[28px] border-x-0 border-b-0 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2",
        className
      )}
    >
      <div className="mx-auto -mt-2 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
      {children}
    </DialogContent>
  );
}

function BottomLink({ href, label, icon: Icon, active, disabled = false }: { href: string; label: string; icon: typeof CalendarDays; active: boolean; disabled?: boolean }) {
  const className = cn("flex min-h-16 flex-col items-center justify-end gap-1 pb-2 text-[10px] font-semibold transition-colors", active ? "text-accent" : "text-slate-500 dark:text-slate-400", disabled && "opacity-40 grayscale");
  const content = <><Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 2} /><span className="max-w-[70px] truncate">{label}</span></>;
  if (disabled) return <span aria-disabled="true" title="Tài khoản chưa được cấp quyền truy cập" className={className}>{content}</span>;
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={className}>{content}</Link>
  );
}

function BottomButton({ label, icon: Icon, active, onClick }: { label: string; icon: typeof MoreHorizontal; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={active} className={cn("flex min-h-16 w-full flex-col items-center justify-end gap-1 pb-2 text-[10px] font-semibold transition-colors", active ? "text-accent" : "text-slate-500 dark:text-slate-400")}>
      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 2} />
      <span className="max-w-[70px] truncate">{label}</span>
    </button>
  );
}

function MoreLink({ href, label, icon: Icon, external, onNavigate }: Pick<NavItem, "href" | "label" | "icon" | "external"> & { onNavigate: () => void }) {
  const className = "flex min-h-16 items-center gap-3 rounded-xl border border-border bg-muted/30 p-3 text-left transition-colors active:bg-muted";
  const content = <><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon className="h-5 w-5" /></span><span className="min-w-0 text-sm font-semibold leading-tight text-ink">{label}</span></>;
  if (external) return <a href={href} target="_blank" rel="noreferrer" onClick={onNavigate} className={className}>{content}</a>;
  return <Link href={href} onClick={onNavigate} className={className}>{content}</Link>;
}
