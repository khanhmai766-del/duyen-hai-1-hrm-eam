"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, UserCheck, Network, Users, ArrowRight, Phone, ChevronRight, Sunrise, Sunset, Moon, CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchBar } from "@/components/shared/search-bar";
import { normalizeText } from "@/lib/nav";
import { useShift } from "@/hooks/useShifts";
import { useUsers } from "@/hooks/useUsers";
import { useHcGroups } from "@/hooks/useHcAttendance";
import { SHIFT_TYPE, realtimeShift, type ShiftTypeKey } from "@/lib/constants";
import { cn, initials } from "@/lib/utils";
import type { SafeUser } from "@/types";

const LINKS: { href: string; icon: typeof CalendarDays; title: string; desc: string; cover?: string }[] = [
  { href: "/hr/org-chart", icon: Network, title: "Nhân sự trực ca vận hành", desc: "Phân công vị trí trực", cover: "/brand/sodo-tochuc.webp" },
  { href: "/hr/shift-roster", icon: CalendarDays, title: "Lịch trực ca", desc: "Phân ca theo tháng", cover: "/brand/lich-truc-ca.jpg" },
];

// "Ca vận hành" background by real-time shift (Sáng / Chiều / Đêm).
const SHIFT_BG: Record<ShiftTypeKey, string> = {
  MORNING: "/brand/ca-sang.jpg",
  AFTERNOON: "/brand/ca-chieu.jpg",
  NIGHT: "/brand/ca-dem.jpg",
};

// Icon theo ca: Sáng → bình minh, Chiều → hoàng hôn, Đêm → mặt trăng.
const SHIFT_ICON: Record<ShiftTypeKey, typeof CalendarDays> = {
  MORNING: Sunrise,
  AFTERNOON: Sunset,
  NIGHT: Moon,
};

export default function HrOverviewPage() {
  // Current operating shift by real clock — drives the "Ca vận hành" card + its
  // background, and which shift the "Đang trực ca" count refers to.
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const { date, shiftType: curShift } = realtimeShift(now);

  const { data: shiftData } = useShift({ date, shiftType: curShift });
  const { data: usersData } = useUsers();
  const shift = shiftData?.data;
  const users = usersData?.data ?? [];
  // "Đang trực ca" = số người trong ca hiện tại đã được Quản trị / Trưởng ca duyệt chấm công.
  const onDuty = shift?.assignments.filter((a) => a.isApproved).length ?? 0;

  // "Chấm công hành chính" = số lượt chấm công hành chính HÔM NAY đã được
  // Quản trị / Trưởng ca duyệt (m.isApproved trên các nhóm hành chính trong ngày).
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const { data: hcData } = useHcGroups(today);
  const approvedHc =
    hcData?.data?.reduce((sum, g) => sum + g.members.filter((m) => m.isApproved).length, 0) ?? 0;

  const [detailOpen, setDetailOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const PREVIEW_COUNT = 6;

  // Search the full list by name or position (accent-insensitive).
  const filtered = React.useMemo(() => {
    const k = normalizeText(q);
    if (!k) return users;
    return users.filter((u) => normalizeText(`${u.name} ${u.position ?? ""}`).includes(k));
  }, [users, q]);

  return (
    <div className="space-y-6">
      <PageHeader title="QUẢN LÝ NHÂN SỰ / CA VẬN HÀNH" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tổng nhân sự" value={users.length} icon={Users} tint="navy" bgCover="/brand/1.jpg" />
        <StatCard label="Đang trực ca" value={onDuty} icon={UserCheck} tint="green" bgCover="/brand/duyenhai-card.jpg" />
        <Link href="/hr/admin-attendance" className="block h-full">
          <StatCard label="Quản lý hành chính" value={approvedHc} icon={Network} tint="blue" bgCover="/brand/cham-cong-hc.jpg" cta="Mở" />
        </Link>
        <Link href="/hr/admin-registration" className="block h-full">
          <StatCard label="Đăng ký đi hành chính" value="HC" icon={CalendarPlus} tint="amber" bgCover="/brand/cham-cong-hc.jpg" cta="Đăng ký" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {LINKS.slice(0, 1).map((l) => {
          const Icon = l.icon;
          const cover = !!l.cover;
          return (
            <Link key={l.href} href={l.href} className="group">
              <Card className={cn("relative h-full min-h-[132px] overflow-hidden transition-shadow hover:shadow-md", cover && "border-0 text-white")}>
                {cover && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={l.cover}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 h-full w-full select-none object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25" />
                  </>
                )}
                <CardContent className={cn("relative p-4", cover && "[text-shadow:0_1px_6px_rgba(0,0,0,0.6)]")}>
                  <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg", cover ? "bg-white/20 text-white ring-1 ring-white/30 backdrop-blur" : "bg-accent/10 text-accent")}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className={cn("mt-2 font-semibold", cover ? "text-white" : "text-ink")}>{l.title}</h3>
                  <p className={cn("text-sm", cover ? "text-white/85" : "text-muted-foreground")}>{l.desc}</p>
                  <span className={cn("mt-2 inline-flex items-center gap-1 text-sm", cover ? "text-white" : "text-accent")}>Mở <ArrowRight className="h-3.5 w-3.5" /></span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        <ShiftOverviewCard shiftType={curShift} />
        {LINKS.slice(1).map((l) => {
          const Icon = l.icon;
          const cover = !!l.cover;
          return (
            <Link key={l.href} href={l.href} className="group">
              <Card className={cn("relative h-full min-h-[132px] overflow-hidden transition-shadow hover:shadow-md", cover && "border-0 text-white")}>
                {cover && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={l.cover}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 h-full w-full select-none object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25" />
                  </>
                )}
                <CardContent className={cn("relative p-4", cover && "[text-shadow:0_1px_6px_rgba(0,0,0,0.6)]")}>
                  <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg", cover ? "bg-white/20 text-white ring-1 ring-white/30 backdrop-blur" : "bg-accent/10 text-accent")}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className={cn("mt-2 font-semibold", cover ? "text-white" : "text-ink")}>{l.title}</h3>
                  <p className={cn("text-sm", cover ? "text-white/85" : "text-muted-foreground")}>{l.desc}</p>
                  <span className={cn("mt-2 inline-flex items-center gap-1 text-sm", cover ? "text-white" : "text-accent")}>Mở <ArrowRight className="h-3.5 w-3.5" /></span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Danh sách nhân sự</CardTitle>
          {users.length > PREVIEW_COUNT && (
            <Button variant="outline" size="sm" onClick={() => setDetailOpen(true)}>
              Chi tiết <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {users.slice(0, PREVIEW_COUNT).map((u) => (
            <PersonCard key={u.id} u={u} />
          ))}
        </CardContent>
      </Card>

      {/* Full staff list */}
      <Dialog open={detailOpen} onOpenChange={(o) => { setDetailOpen(o); if (!o) setQ(""); }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader className="flex-row flex-wrap items-center justify-between gap-3 pr-8">
            <DialogTitle>Danh sách nhân sự ({filtered.length})</DialogTitle>
            <SearchBar
              value={q}
              onChange={setQ}
              placeholder="Tìm theo tên hoặc chức vụ..."
              className="w-full sm:w-72"
            />
          </DialogHeader>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Không tìm thấy nhân sự phù hợp.
            </div>
          ) : (
            <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((u) => (
                <PersonCard key={u.id} u={u} />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

function ShiftOverviewCard({ shiftType }: { shiftType: ShiftTypeKey }) {
  const Icon = SHIFT_ICON[shiftType];
  return (
    <Card className="relative h-full min-h-[132px] overflow-hidden border-0 text-white transition-shadow hover:shadow-md">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SHIFT_BG[shiftType]}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full select-none object-cover transition-transform duration-500 hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25" />
      <CardContent className="relative p-4 [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/20 text-white ring-1 ring-white/30 backdrop-blur">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="mt-2 font-semibold text-white">Ca vận hành</h3>
        <p className="text-sm text-white/85">{SHIFT_TYPE[shiftType].label}</p>
        <span className="mt-2 inline-flex items-center gap-1 text-sm text-white">Theo thời gian thực</span>
      </CardContent>
    </Card>
  );
}

/* ---- Staff card: photo · name · position · phone ---- */
function PersonCard({ u }: { u: SafeUser }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-accent/40 hover:bg-accent/5">
      {u.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={u.avatarUrl} alt={u.name} className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-border" />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
          {initials(u.name)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-ink">{u.name}</div>
        <div className="truncate text-xs font-medium text-accent">{u.position ?? "—"}</div>
        <div className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Phone className="h-3.5 w-3.5 shrink-0" /> {u.phone ?? "—"}
        </div>
      </div>
    </div>
  );
}
