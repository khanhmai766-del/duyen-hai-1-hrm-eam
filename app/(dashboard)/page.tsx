"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  CalendarCheck,
  Briefcase,
  ShieldCheck,
  Plus,
  Loader2,
  ExternalLink,
  Phone,
  Link2,
  CalendarDays,
  Trash2,
  Pencil,
} from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { StatCardSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OPERATION_TYPE, OPERATION_TYPE_ORDER, can, SHIFT_TYPE, type ShiftTypeKey } from "@/lib/constants";
import { Bar3DDefs, barFill } from "@/components/shared/bar-3d";
import { SUPPORT_LINKS, CONTROL_ROOM_CONTACTS, type SupportLinkGroup } from "@/lib/links";
import { initials, cn } from "@/lib/utils";
import { weatherScene, PLANT_LOCATION } from "@/lib/weather";
import { positionImage } from "@/lib/position-image";
import { useMyDashboard, useWeather, useUserLocation, usePlaceInfo, useOperations, useCreateOperation, useUpdateOperation, useDeleteOperation, type MyDashboard, type OperationEvent } from "@/hooks/useDashboard";
import { toast } from "sonner";

/** Tracks browser connectivity via `navigator.onLine` + online/offline events.
   Starts `true` to match SSR markup, then syncs to the real value on mount. */
function useOnline() {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const me = useMyDashboard();

  // Live connectivity status — online while signed in & connected, offline when
  // the network/wifi drops (or on sign-out, when this screen is no longer shown).
  const online = useOnline();

  const m = me.data?.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Welcome back, {session?.user?.name ?? ""} 👋
          </h1>
        </div>
        {/* Safety slogan ticker — two messages alternating every 30s */}
        <SafetyTicker />
      </div>

      {/* Stat row — all four cards stretch to the user-photo card's height */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-stretch">
        {/* 1 — Current user: full-bleed photo with overlaid name/title */}
        <Card className="relative min-h-[230px] overflow-hidden border-0 text-white">
          {m?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-navy text-3xl font-bold text-white/90">
              {initials(session?.user?.name ?? "?")}
            </div>
          )}
          {/* Legibility gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
          {/* Connectivity badge */}
          <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-xs font-medium backdrop-blur">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                online ? "bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400 animate-pulse" : "bg-slate-400"
              )}
            />
            {online ? "Online" : "Offline"}
          </div>
          {/* Name + position */}
          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="truncate text-lg font-bold leading-tight [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]">
              {session?.user?.name ?? "—"}
            </div>
            <div className="truncate text-sm text-white/85 [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]">
              {session?.user?.position ?? session?.user?.employeeId}
            </div>
          </div>
        </Card>

        {/* 2 — Working days this month */}
        {me.isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            label="Ngày công trong tháng"
            value={m?.workingDays ?? 0}
            icon={CalendarCheck}
            tint="green"
            hint="Đã được Trưởng ca xác nhận"
            bgCover="/brand/ngay-cong.jpg"
          />
        )}

        {/* 3 — Current duty position (with system control-screen background) */}
        <DutyPositionCard m={m} loading={me.isLoading} />

        {/* 4 — Live weather, with location-photo background */}
        <WeatherCard />
      </div>

      {/* Body: left column (Activity + Operation info), right column (Links + Contact).
          Both columns stretch to the same height; the lower card in each grows to fill. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-stretch">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <ActivityCard />
          <div className="flex flex-1 [&>*]:h-full [&>*]:w-full">
            <OperationInfoCard canManage={can(session?.user?.role, "manageOperations")} />
          </div>
        </div>
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="flex flex-1 [&>*]:h-full [&>*]:w-full">
            <SupportLinksCard />
          </div>
          <ContactCard />
        </div>
      </div>
    </div>
  );
}

/* ---- Safety slogan ticker: two messages, each shown once per 30s, alternating ---- */
const SAFETY_MESSAGES = [
  "⚠ Vận Hành 1: An toàn để sản xuất. Sản xuất phải an toàn",
  "⏱ Check-In / Check-Out đúng thời gian quy định",
];

function SafetyTicker() {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SAFETY_MESSAGES.length), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative h-12 flex-1 overflow-hidden rounded-xl bg-transparent">
      <div className="absolute inset-0 flex items-center justify-end">
        {/* key={idx} remounts the span on each swap so the float-in/out replays */}
        <span
          key={idx}
          className="safety-marquee whitespace-nowrap bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text px-4 text-base font-extrabold uppercase tracking-wide text-transparent sm:text-lg"
        >
          {SAFETY_MESSAGES[idx]}
        </span>
      </div>
    </div>
  );
}

/* ---- Operation support links (from LinkDH1.xlsx) ---- */
function SupportLinksCard() {
  const [tab, setTab] = React.useState<SupportLinkGroup>("ops");
  const links = SUPPORT_LINKS.filter((l) => l.group === tab);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-accent" /> Danh mục LINK hỗ trợ
        </CardTitle>
        <div className="inline-flex shrink-0 rounded-lg border border-border bg-white p-0.5">
          <SupportLinkTab active={tab === "ops"} onClick={() => setTab("ops")} label="Vận hành" />
          <SupportLinkTab active={tab === "personal"} onClick={() => setTab("personal")} label="Cá nhân" />
        </div>
      </CardHeader>
      {/* Scroll area sized to ~8 entries; the rest scroll. */}
      <CardContent className="max-h-[404px] space-y-1.5 overflow-y-auto pr-1">
        {links.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">Chưa có đường link nào trong nhóm này.</p>
        ) : (
          links.map((l, i) => (
            <a
              key={l.href + i}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-accent hover:bg-accent/5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-xs font-semibold text-accent">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium uppercase text-ink">{l.name}</span>
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />
            </a>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SupportLinkTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-navy text-white" : "text-muted-foreground hover:text-ink"
      )}
    >
      {label}
    </button>
  );
}

/* ---- Control-room contacts ---- */
function ContactCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-accent" /> Thông tin liên lạc
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {CONTROL_ROOM_CONTACTS.map((c, i) => (
          <a
            key={i}
            href={`tel:${c.phone}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-accent hover:bg-accent/5"
          >
            <span className="text-sm font-medium text-ink">{c.label}</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-accent">
              <Phone className="h-3.5 w-3.5" /> {c.phone}
            </span>
          </a>
        ))}
      </CardContent>
    </Card>
  );
}

/* ---- Current duty position, with the system control-screen as background ---- */
function DutyPositionCard({ m, loading }: { m?: MyDashboard; loading: boolean }) {
  // The seat title to display — approved first, otherwise the pending one.
  const label = m?.position ?? m?.pendingPosition ?? null;
  const isPending = !m?.position && !!m?.pendingPosition;
  const img = positionImage(label);
  // Ngày điểm danh (ngày + loại ca) của cương vị đang hiển thị.
  const shiftLabel = m?.dutyShiftType ? SHIFT_TYPE[m.dutyShiftType as ShiftTypeKey]?.label : null;
  const dutyDate = m?.dutyDate
    ? `${shiftLabel ? `Ca ${shiftLabel} · ` : ""}${new Date(m.dutyDate).toLocaleDateString("vi-VN")}`
    : null;

  // Image variant: full-bleed control screen + legibility gradient + white text.
  if (img) {
    return (
      <Card className="relative h-full min-h-[230px] overflow-hidden border-0 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
        <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
          {dutyDate && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
              <CalendarDays className="h-3 w-3" /> {dutyDate}
            </span>
          )}
          {isPending && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2.5 py-1 text-[11px] font-semibold text-amber-950 backdrop-blur">
              Chờ duyệt
            </span>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="text-xs font-medium text-white/80 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
            Cương vị trực ca
          </div>
          <div className="truncate text-lg font-bold leading-tight [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">
            {label}
          </div>
          {m?.unit && (
            <div className="truncate text-sm text-white/85 [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">{m.unit}</div>
          )}
        </div>
      </Card>
    );
  }

  // Plain variant: no assigned seat (or a seat without a dedicated image).
  return (
    <Card className="h-full bg-navy/5">
      <CardContent className="flex h-full flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-secondary to-[#4a3219] text-white shadow-lg ring-1 ring-white/40 before:absolute before:inset-x-1 before:top-0.5 before:h-1/3 before:rounded-t-lg before:bg-white/25">
            <Briefcase className="relative h-5 w-5" />
          </div>
          {dutyDate && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              <CalendarDays className="h-3 w-3" /> {dutyDate}
            </span>
          )}
        </div>
        <div className="mt-4">
          <div className="text-xl font-bold leading-tight text-ink">
            {label ?? (loading ? "…" : "Chưa điểm danh")}
          </div>
          <div className="mt-1 text-sm font-medium text-muted-foreground">Cương vị trực ca</div>
          {m?.position ? (
            <div className="mt-0.5 text-xs text-muted-foreground/70">{m?.unit ?? ""}</div>
          ) : m?.pendingPosition ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              Chờ Trưởng ca / Quản trị duyệt
            </span>
          ) : (
            <Link href="/hr/org-chart" className="mt-0.5 inline-block text-xs text-accent hover:underline">
              Điểm danh tại sơ đồ tổ chức ca →
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---- Live weather card — follows the user's GPS location: weather + place name
   + representative photos (Wikimedia Commons), falling back to the Duyên Hải
   plant when geolocation is unavailable. Photos cross-fade. ---- */
const FALLBACK_BACKDROPS = ["/brand/ba-dong.jpg", "/brand/duyen-hai-plant.jpg"];

function WeatherCard() {
  const loc = useUserLocation();
  const coords = loc.data ?? undefined; // undefined → hooks default to plant location
  const weather = useWeather(coords);
  const place = usePlaceInfo(coords);
  const data = weather.data;

  const scene = weatherScene(data?.current.weather_code);
  const locationName = place.data?.name ?? PLANT_LOCATION.name;
  const backdrops = place.data?.images?.length ? place.data.images : FALLBACK_BACKDROPS;

  const [bg, setBg] = React.useState(0);
  React.useEffect(() => {
    setBg(0); // restart slideshow when the set of photos changes
    if (backdrops.length < 2) return;
    const t = setInterval(() => setBg((i) => (i + 1) % backdrops.length), 8000);
    return () => clearInterval(t);
  }, [backdrops]);

  return (
    <Card className="relative h-full overflow-hidden border-0 text-white">
      {/* Cross-fading location photos */}
      {backdrops.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden
          className={cn(
            "absolute inset-0 h-full w-full select-none object-cover object-top transition-opacity duration-1000",
            i === bg ? "opacity-100" : "opacity-0"
          )}
        />
      ))}
      {/* Dark gradient so the white text stays legible over any photo */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25" />
      <CardContent className="relative flex h-full flex-col justify-between p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-2xl shadow-inner ring-1 ring-white/30 backdrop-blur">
          {scene.icon}
        </div>
        <div className="mt-4 [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">
          <div className="text-[40px] font-bold leading-none">
            {data ? `${Math.round(data.current.temperature_2m)}°C` : "—"}
          </div>
          <div className="mt-2 text-sm font-semibold text-white/90">
            {data ? scene.label : "Đang tải..."}
          </div>
          <div className="mt-0.5 text-xs text-white/75">
            {data
              ? `${locationName} · ${Math.round(data.daily.temperature_2m_min[0])}–${Math.round(data.daily.temperature_2m_max[0])}°C`
              : locationName}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---- Activity (attendance) bar chart with month picker ---- */
const VN_MONTHS = ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"];

/** A clear "Hôm nay" pill drawn at the top of the today reference line. */
function renderTodayLabel({ viewBox }: { viewBox?: { x: number; y: number } }) {
  if (!viewBox) return <g />;
  const w = 52;
  const h = 18;
  const cx = Math.max(viewBox.x, 34 + w / 2); // keep the pill clear of the Y axis
  return (
    <g>
      <rect x={cx - w / 2} y={0} width={w} height={h} rx={9} fill="#2563EB" />
      <text
        x={cx}
        y={h / 2 + 0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontWeight={600}
        fill="#ffffff"
      >
        Hôm nay
      </text>
    </g>
  );
}

function ActivityCard() {
  const today = new Date();
  const [year, setYear] = React.useState(today.getFullYear());
  const [month, setMonth] = React.useState(today.getMonth() + 1); // 1-12
  const [open, setOpen] = React.useState(false);

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const { data, isLoading } = useMyDashboard(monthStr);
  const m = data?.data;
  const daysInMonth = m?.daysInMonth ?? new Date(year, month, 0).getDate();
  // Mark "today" only when the chart is showing the current month/year.
  const todayDay =
    year === today.getFullYear() && month === today.getMonth() + 1 ? today.getDate() : null;
  const shiftSet = new Set(m?.attendanceDays ?? []);
  const adminMap = new Map((m?.adminDays ?? []).map((a) => [a.day, a.hours]));
  // Two attendance series per day: shift duty (8h per approved shift, red) and
  // administrative check-ins (logged hours, yellow). Days with neither stay empty.
  const chart = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    return {
      day,
      shift: shiftSet.has(day) ? 8 : 0,
      admin: adminMap.get(day) ?? 0,
    };
  });

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle>Activity</CardTitle>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-accent hover:text-ink"
                title="Chọn tháng"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {VN_MONTHS[month - 1]}/{year}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56" align="start">
              <div className="mb-2 flex items-center justify-between">
                <button className="rounded p-1 hover:bg-muted" onClick={() => setYear((y) => y - 1)}>‹</button>
                <span className="text-sm font-semibold text-ink">{year}</span>
                <button
                  className="rounded p-1 hover:bg-muted disabled:opacity-30"
                  onClick={() => setYear((y) => Math.min(today.getFullYear(), y + 1))}
                  disabled={year >= today.getFullYear()}
                >
                  ›
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {VN_MONTHS.map((label, i) => {
                  const mNum = i + 1;
                  const future = year === today.getFullYear() && mNum > today.getMonth() + 1;
                  const active = mNum === month;
                  return (
                    <button
                      key={label}
                      disabled={future}
                      onClick={() => {
                        setMonth(mNum);
                        setOpen(false);
                      }}
                      className={cn(
                        "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                        active ? "bg-navy text-white" : "hover:bg-muted",
                        future && "cursor-not-allowed opacity-30"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#DC2626]" /> Trực ca
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#F59E0B]" /> Hành chính
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[240px]" />
        ) : (
          // Horizontal scroll on narrow screens keeps every day legible (each
          // day gets a fixed min slot); on wide screens it fills the card.
          <div className="overflow-x-auto pb-1">
            <div className="chart-3d h-[240px] min-w-[620px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} barCategoryGap="22%" barGap={1.5} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                  {Bar3DDefs({ colors: ["#DC2626", "#F59E0B"] })}
                  <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="day"
                    interval={0}
                    tick={{ fontSize: 10 }}
                    tickMargin={6}
                    tickLine={{ stroke: "#cbd5e1" }}
                    axisLine={{ stroke: "#cbd5e1" }}
                    height={22}
                  />
                  <YAxis
                    domain={[0, 8]}
                    ticks={[0, 2, 4, 6, 8]}
                    tick={{ fontSize: 10 }}
                    width={30}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickFormatter={(v) => `${v}h`}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                    labelFormatter={(label) => `Ngày ${label}`}
                    formatter={(v: number, name) => [v > 0 ? `${v}h` : "—", name]}
                  />
                  {todayDay != null && (
                    <ReferenceLine
                      x={todayDay}
                      stroke="#2563EB"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                      label={renderTodayLabel}
                    />
                  )}
                  <Bar dataKey="shift" name="Trực ca" radius={[3, 3, 0, 0]} maxBarSize={9} fill={barFill("#DC2626")} />
                  <Bar dataKey="admin" name="Hành chính" radius={[3, 3, 0, 0]} maxBarSize={9} fill={barFill("#F59E0B")} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---- Operation info (drills) ---- */
// Tông màu thẻ diễn tập theo ngày: sắp tới (vàng) · đúng hôm nay (xanh) · đã qua (xám).
const EVENT_TONES = {
  future: { card: "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10", date: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" },
  today: { card: "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10", date: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200" },
  past: { card: "border-border", date: "bg-muted text-ink" },
} as const;

function eventDateTone(date: string | Date): keyof typeof EVENT_TONES {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() > today.getTime()) return "future";
  if (d.getTime() === today.getTime()) return "today";
  return "past";
}

// Định dạng ngày về YYYY-MM-DD theo giờ địa phương cho <input type="date">.
function toDateInputValue(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function OperationInfoCard({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = useOperations();
  const create = useCreateOperation();
  const update = useUpdateOperation();
  const del = useDeleteOperation();
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ type: "DRILL_INCIDENT", title: "", date: "", note: "" });
  const events = data?.data ?? [];

  function openCreate() {
    setEditingId(null);
    setForm({ type: "DRILL_INCIDENT", title: "", date: "", note: "" });
    setOpen(true);
  }
  function openEdit(ev: OperationEvent) {
    setEditingId(ev.id);
    setForm({ type: ev.type, title: ev.title, date: toDateInputValue(ev.date), note: ev.note ?? "" });
    setOpen(true);
  }

  async function remove(id: string) {
    try {
      await del.mutateAsync(id);
      toast.success("Đã xoá nội dung vận hành");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function submit() {
    if (!form.title || !form.date) return toast.error("Nhập tiêu đề và ngày");
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, ...form });
        toast.success("Đã cập nhật thông tin vận hành");
      } else {
        await create.mutateAsync(form);
        toast.success("Đã thêm thông tin vận hành");
      }
      setOpen(false);
      setEditingId(null);
      setForm({ type: "DRILL_INCIDENT", title: "", date: "", note: "" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>Thông tin nội bộ</CardTitle>
        {canManage && (
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Thêm
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs text-muted-foreground">
          Lịch diễn tập sự cố, diễn tập PCCC (do Trưởng ca cập nhật) — lưu dữ liệu 3 tháng gần nhất.
        </p>
        {isLoading ? (
          <div className="h-24" />
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <ShieldCheck className="h-8 w-8 text-muted-foreground/50" />
            Chưa có lịch diễn tập.
          </div>
        ) : (
          // Scroll area: ~4 entries visible by default.
          <div className="max-h-[296px] space-y-2 overflow-y-auto pr-1">
            {events.map((e) => {
              const meta = OPERATION_TYPE[e.type as keyof typeof OPERATION_TYPE] ?? OPERATION_TYPE.OTHER;
              const tone = EVENT_TONES[eventDateTone(e.date)];
              return (
                <div key={e.id} className={cn("group flex items-start gap-3 rounded-lg border p-3", tone.card)}>
                  <div className={cn("flex w-12 shrink-0 flex-col items-center rounded-md py-1.5", tone.date)}>
                    <span className="text-lg font-bold leading-none">{new Date(e.date).getDate()}</span>
                    <span className="text-[10px] uppercase opacity-70">Th{new Date(e.date).getMonth() + 1}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}>{meta.label}</span>
                    </div>
                    <div className="mt-1 font-medium text-ink">{e.title}</div>
                    {e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => openEdit(e)}
                        title="Sửa"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(e.id)}
                        title="Xoá"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Sửa thông tin vận hành" : "Thêm thông tin vận hành"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block">Loại</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATION_TYPE_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>{OPERATION_TYPE[t].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Tiêu đề</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1.5 block">Ngày</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1.5 block">Ghi chú</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
