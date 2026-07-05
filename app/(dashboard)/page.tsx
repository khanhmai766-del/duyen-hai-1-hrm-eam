"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
  Play,
  Equal,
  X,
  MoreHorizontal,
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OPERATION_TYPE, OPERATION_TYPE_ORDER, SHIFT_TYPE, type ShiftTypeKey } from "@/lib/constants";
import { SUPPORT_LINKS, CONTROL_ROOM_CONTACTS, type SupportLinkGroup } from "@/lib/links";
import { normalizeText } from "@/lib/nav";
import { formatDateInput, initials, cn, parseDateInput } from "@/lib/utils";
import { weatherScene, PLANT_LOCATION } from "@/lib/weather";
import { positionImage } from "@/lib/position-image";
import { useMyDashboard, useWeather, useUserLocation, usePlaceInfo, useOperations, useCreateOperation, useUpdateOperation, useDeleteOperation, useSafeOperations, useUpdateSafeOperation, type MyDashboard, type OperationEvent, type SafeOperationSetting } from "@/hooks/useDashboard";
import { useCurrentPosition } from "@/hooks/useCurrentPosition";
import { useRbacAccess } from "@/hooks/useRbacAccess";
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
  const currentPosition = useCurrentPosition();
  const rbac = useRbacAccess();
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

      <SafeOperationCard canManage={rbac.can("operation-events", ["manage", "full"])} />

      {/* Stat row — all four cards stretch to the user-photo card's height */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-stretch">
        {/* 1 — Current user: full-bleed photo with overlaid name/title */}
        <Link href="/account" className="group block h-full rounded-xl focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" aria-label="Mở thông tin cá nhân">
          <Card className="relative min-h-[230px] overflow-hidden border-0 text-white transition-shadow group-hover:shadow-md">
          {m?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
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
              {currentPosition.position || session?.user?.employeeId}
            </div>
          </div>
          </Card>
        </Link>

        {/* 2 — Working days this month */}
        <Link href="/hr/shift-roster?view=timesheet" className="block h-full rounded-xl focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" aria-label="Mở lịch trực ca, bảng công">
          {me.isLoading ? (
            <StatCardSkeleton />
          ) : (
            <StatCard
              label="Ngày công trong tháng"
              value={m?.workingDays ?? 0}
              icon={CalendarCheck}
              tint="green"
              hint="Quy đổi 8 giờ = 1 ngày công"
              bgCover="/brand/ngay-cong.jpg"
            />
          )}
        </Link>

        {/* 3 — Current duty position (with system control-screen background) */}
        <DutyPositionCard m={m} loading={me.isLoading} userPosition={currentPosition.position || session?.user?.position} />

        {/* 4 — Live weather, with location-photo background */}
        <WeatherCard />
      </div>

      {/* Body cards mirror the compact 3-panel dashboard layout: nội bộ · link · liên lạc. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.92fr)] lg:items-stretch">
        <div className="min-w-0 [&>*]:h-full">
          <OperationInfoCard canManage={rbac.can("operation-events", ["create", "manage", "full"])} />
        </div>
        <div className="min-w-0 [&>*]:h-full">
          <SupportLinksCard />
        </div>
        <div className="min-w-0 [&>*]:h-full">
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
    <Card className="h-full">
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
      <CardContent className="max-h-[296px] space-y-1.5 overflow-y-auto pr-1">
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
    <Card className="h-full">
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

const ADMIN_ATTENDANCE_CARD_POSITIONS = ["quan doc", "pho quan doc", "ky thuat vien", "thong ke"];

function shouldOpenAdminAttendance(position?: string | null) {
  const normalized = normalizeText(position ?? "");
  return ADMIN_ATTENDANCE_CARD_POSITIONS.some((item) => normalized.includes(item));
}

/* ---- Current duty position, with the system control-screen as background ---- */
function DutyPositionCard({
  m,
  loading,
  userPosition,
}: {
  m?: MyDashboard;
  loading: boolean;
  userPosition?: string | null;
}) {
  const router = useRouter();
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
  const hasDutyPosition = !!m?.position;
  const attendanceHref = shouldOpenAdminAttendance(userPosition) ? "/hr/admin-attendance" : "/hr/org-chart";
  const attendanceLabel = shouldOpenAdminAttendance(userPosition)
    ? "Chấm công hành chính"
    : "Điểm danh tại sơ đồ tổ chức ca";
  const canOpenAttendance = !hasDutyPosition && !m?.pendingPosition;
  const openAttendanceCard = () => {
    if (canOpenAttendance) router.push(attendanceHref);
  };
  const handleAttendanceKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canOpenAttendance) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      router.push(attendanceHref);
    }
  };

  const card = (
    <Card
      role={canOpenAttendance ? "link" : undefined}
      tabIndex={canOpenAttendance ? 0 : undefined}
      onClick={openAttendanceCard}
      onKeyDown={handleAttendanceKeyDown}
      className={cn(
        "h-full bg-navy/5",
        canOpenAttendance && "cursor-pointer transition-colors hover:border-accent/45 hover:bg-accent/5 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
      )}
    >
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
          {hasDutyPosition ? (
            <div className="mt-0.5 text-xs text-muted-foreground/70">{m?.unit ?? ""}</div>
          ) : m?.pendingPosition ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              Chờ Quản trị / Quản lý / Trưởng ca duyệt
            </span>
          ) : (
            <Link href={attendanceHref} className="mt-0.5 inline-block text-xs text-accent hover:underline" onClick={(event) => event.stopPropagation()}>
              {attendanceLabel} →
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return card;
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

/* ---- Safe operation realtime counter ---- */
type SafeOperationUnit = "S1" | "S2";
const SAFE_OPERATION_UNITS: SafeOperationUnit[] = ["S1", "S2"];
const SAFE_OPERATION_TIME_ZONE = "Asia/Ho_Chi_Minh";
const SAFE_OPERATION_IMAGE_SRC = process.env.NEXT_PUBLIC_SAFE_OPERATION_IMAGE_URL || "/brand/duyen-hai-plant.jpg";

function vietnamDateParts(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SAFE_OPERATION_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    day: get("day"),
    month: get("month"),
    year: get("year"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function dateTimeInputValue(value?: string | Date | null) {
  if (!value) return "";
  const parts = vietnamDateParts(value);
  if (!parts) return "";
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function parseSafeStartInput(value: string) {
  const raw = value.trim();
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+07:00`;
}

function formatSafeStart(value?: string | Date | null) {
  if (!value) return "Chưa thiết lập";
  const parts = vietnamDateParts(value);
  if (!parts) return "Chưa thiết lập";
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
}

function safeElapsedParts(startedAt?: string | Date | null, now = new Date(), pausedAt?: string | Date | null) {
  const start = startedAt ? new Date(startedAt) : null;
  if (!start || Number.isNaN(start.getTime())) return { days: 0, hours: 0, minutes: 0 };
  const pause = pausedAt ? new Date(pausedAt) : null;
  const effectiveNow = pause && !Number.isNaN(pause.getTime()) ? pause : now;
  const ms = Math.max(0, effectiveNow.getTime() - start.getTime());
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minuteMs = 60 * 1000;
  const days = Math.floor(ms / dayMs);
  const hours = Math.floor((ms % dayMs) / hourMs);
  const minutes = Math.floor((ms % hourMs) / minuteMs);
  return { days, hours, minutes };
}

function SafeOperationCard({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = useSafeOperations();
  const update = useUpdateSafeOperation();
  const settings = data?.data ?? [];
  const byUnit = React.useMemo(() => new Map(settings.map((item) => [item.unit, item])), [settings]);
  const [now, setNow] = React.useState(() => new Date());
  const [editingUnit, setEditingUnit] = React.useState<SafeOperationUnit | null>(null);
  const [draftStart, setDraftStart] = React.useState("");

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  function openStartDialog(unit: SafeOperationUnit) {
    setEditingUnit(unit);
    setDraftStart(dateTimeInputValue(byUnit.get(unit)?.startedAt) || dateTimeInputValue(new Date()));
  }

  async function saveStart() {
    if (!editingUnit) return;
    if (!draftStart) return toast.error("Chọn ngày bắt đầu vận hành an toàn");
    const startedAt = parseSafeStartInput(draftStart);
    if (!startedAt) return toast.error("Nhập thời gian theo định dạng DD/MM/YYYY HH:mm");
    try {
      await update.mutateAsync({ unit: editingUnit, action: "SET_START", startedAt });
      toast.success(`Đã cập nhật mốc vận hành an toàn ${editingUnit}`);
      setEditingUnit(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function togglePause(unit: SafeOperationUnit) {
    try {
      await update.mutateAsync({ unit, action: "TOGGLE_PAUSE" });
      toast.success("Đã cập nhật trạng thái bộ đếm");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function reset(unit: SafeOperationUnit) {
    try {
      await update.mutateAsync({ unit, action: "RESET" });
      toast.success(`Đã reset thời gian vận hành an toàn ${unit}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Card className="overflow-hidden border-emerald-200/80 bg-gradient-to-br from-white via-white to-emerald-50/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-normal text-emerald-700">
          <ShieldCheck className="h-4 w-4" />
          Thời gian vận hành an toàn (Safe Operation)
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-2">
        {isLoading ? (
          <>
            <div className="h-[118px] rounded-lg border border-emerald-100 bg-white/70" />
            <div className="h-[118px] rounded-lg border border-emerald-100 bg-white/70" />
          </>
        ) : (
          SAFE_OPERATION_UNITS.map((unit) => (
            <SafeOperationUnitRow
              key={unit}
              unit={unit}
              setting={byUnit.get(unit)}
              now={now}
              canManage={canManage}
              saving={update.isPending}
              onOpenStart={() => openStartDialog(unit)}
              onTogglePause={() => togglePause(unit)}
              onReset={() => reset(unit)}
            />
          ))
        )}
      </CardContent>
      <Dialog open={!!editingUnit} onOpenChange={(open) => !open && setEditingUnit(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nhập thời gian bắt đầu vận hành {editingUnit}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Ngày giờ bắt đầu</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={draftStart}
              onChange={(event) => setDraftStart(event.target.value)}
              placeholder="DD/MM/YYYY HH:mm"
            />
            <div className="text-xs text-muted-foreground">Ví dụ: 25/12/2025 14:00</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUnit(null)}>Hủy</Button>
            <Button onClick={saveStart} disabled={update.isPending}>
              {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SafeOperationUnitRow({
  unit,
  setting,
  now,
  canManage,
  saving,
  onOpenStart,
  onTogglePause,
  onReset,
}: {
  unit: SafeOperationUnit;
  setting?: SafeOperationSetting;
  now: Date;
  canManage: boolean;
  saving: boolean;
  onOpenStart: () => void;
  onTogglePause: () => void;
  onReset: () => void;
}) {
  const elapsed = safeElapsedParts(setting?.startedAt, now, setting?.pausedAt);
  const paused = Boolean(setting?.pausedAt);
  const hasStarted = Boolean(setting?.startedAt);
  return (
    <div className="relative grid gap-4 rounded-lg border border-emerald-200 bg-white/85 p-3 pr-12 shadow-sm md:grid-cols-[172px_minmax(0,1fr)] md:items-center">
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="absolute right-3 top-3 h-8 w-8 rounded-md bg-white/95 shadow-sm"
              disabled={saving}
              title="Tác vụ vận hành an toàn"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Tác vụ {unit}</DropdownMenuLabel>
            <DropdownMenuItem onClick={onOpenStart} disabled={saving}>
              <Play className="h-4 w-4 fill-current" />
              Nhập mốc bắt đầu
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePause} disabled={saving || !hasStarted}>
              <Equal className="h-4 w-4" />
              {paused ? "Tiếp tục bộ đếm" : "Tạm dừng bộ đếm"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onReset} disabled={saving} className="text-red-600 focus:text-red-700">
              <X className="h-4 w-4" />
              Reset về 0
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <div className="relative min-h-[104px] border-emerald-100 md:border-r md:pr-4">
        <div className="flex h-full items-center gap-3">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-emerald-50 ring-1 ring-emerald-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={SAFE_OPERATION_IMAGE_SRC}
              alt=""
              className="h-full w-full object-cover"
              onError={(event) => {
                event.currentTarget.src = "/brand/duyen-hai-plant.jpg";
              }}
            />
          </div>
          <div>
            <div className="whitespace-nowrap text-xs font-bold uppercase text-slate-700">Tổ máy</div>
            <div className="text-4xl font-extrabold leading-none text-emerald-700">{unit}</div>
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <div className="min-w-0">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-700">
              {hasStarted ? paused ? "Đang tạm dừng bộ đếm" : "Đang vận hành an toàn" : "Chưa bắt đầu bộ đếm"}
            </div>
            <div className="mt-1 grid min-w-0 grid-cols-3 gap-1 text-emerald-700 sm:gap-2">
              <ElapsedNumber value={elapsed.days} label="ngày" />
              <ElapsedNumber value={elapsed.hours} label="giờ" pad />
              <ElapsedNumber value={elapsed.minutes} label="phút" pad />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-100 pt-2">
          <span className="text-xs font-medium text-slate-600">Kể từ: {formatSafeStart(setting?.startedAt)}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold",
              hasStarted ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
            )}
          >
            {hasStarted ? <ShieldCheck className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {hasStarted ? "Không có sự cố" : "Tổ máy ngừng"}
          </span>
        </div>
      </div>
    </div>
  );
}

function ElapsedNumber({ value, label, pad = false }: { value: number; label: string; pad?: boolean }) {
  const display = pad ? String(value).padStart(2, "0") : String(value);
  const lengthClass =
    display.length >= 5
      ? "text-[clamp(1.65rem,2.3vw,2.35rem)]"
      : display.length >= 4
        ? "text-[clamp(1.8rem,2.65vw,2.65rem)]"
        : "text-[clamp(1.95rem,2.95vw,2.9rem)]";
  return (
    <div className="flex min-w-0 flex-col items-center justify-end border-r border-emerald-100 px-1.5 last:border-r-0">
      <span className={cn("block max-w-full whitespace-nowrap text-center font-extrabold leading-none tabular-nums tracking-normal", lengthClass)}>
        {display}
      </span>
      <span className="mt-1.5 block text-center text-[11px] font-bold leading-none text-slate-600 sm:text-xs">{label}</span>
    </div>
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
  const d = parseDateInput(date);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() > today.getTime()) return "future";
  if (d.getTime() === today.getTime()) return "today";
  return "past";
}

// Định dạng ngày về YYYY-MM-DD theo giờ địa phương cho <input type="date">.
function toDateInputValue(value: string | Date): string {
  return formatDateInput(value);
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
  const upcomingEvents = React.useMemo(
    () =>
      events
        .filter((event) => eventDateTone(event.date) !== "past")
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [events]
  );

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
          Lịch diễn tập sự cố, diễn tập PCCC (do Trưởng ca cập nhật) — lưu dữ liệu 1 tháng gần nhất.
        </p>
        {isLoading ? (
          <div className="h-24" />
        ) : upcomingEvents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <ShieldCheck className="h-8 w-8 text-muted-foreground/50" />
            Chưa có lịch diễn tập từ hôm nay trở đi.
          </div>
        ) : (
          // Scroll area: ~4 entries visible by default.
          <div className="max-h-[296px] space-y-2 overflow-y-auto pr-1">
            {upcomingEvents.map((e) => {
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
