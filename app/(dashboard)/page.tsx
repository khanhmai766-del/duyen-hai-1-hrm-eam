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
  X,
  Activity,
  Wrench,
  AlertTriangle,
  Clock,
  Undo2,
  Minus,
  ChevronDown,
} from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { StatCardSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { OPERATION_TYPE, OPERATION_TYPE_ORDER, SHIFT_TYPE, type ShiftTypeKey } from "@/lib/constants";
import { SUPPORT_LINKS, CONTROL_ROOM_CONTACTS, type SupportLinkGroup } from "@/lib/links";
import { normalizeText } from "@/lib/nav";
import { formatDateInput, initials, cn, parseDateInput } from "@/lib/utils";
import { weatherScene, PLANT_LOCATION } from "@/lib/weather";
import { positionImage } from "@/lib/position-image";
import { useMyDashboard, useWeather, useUserLocation, usePlaceInfo, useOperations, useCreateOperation, useUpdateOperation, useDeleteOperation, useSafeOperations, useUpdateSafeOperation, type MyDashboard, type OperationEvent } from "@/hooks/useDashboard";
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
    <div className="-mt-2 space-y-4 lg:-mt-4">
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
        {CONTROL_ROOM_CONTACTS.map((c) => (
          <a
            key={c.phone}
            href={`tel:${c.phone}`}
            className="grid min-h-11 grid-cols-1 items-start gap-1.5 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-accent hover:bg-accent/5 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-center 2xl:gap-2"
          >
            <span title={c.label} className="min-w-0 break-words text-[10.5px] font-semibold leading-snug text-ink sm:text-[11px] xl:text-[11.5px]">
              {c.label}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] font-semibold leading-none text-accent sm:text-[11px] xl:text-[11.5px]">
              <Phone className="h-3.5 w-3.5 shrink-0" /> {c.phone}
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
  const opensAdminAttendance = shouldOpenAdminAttendance(userPosition);
  const attendanceHref = opensAdminAttendance ? "/hr/admin-attendance" : "/hr/org-chart";
  const attendanceLabel = opensAdminAttendance
    ? "Chấm công hành chính"
    : "Điểm danh tại sơ đồ tổ chức ca";
  const positionHint = opensAdminAttendance ? "Hãy nhấn vào đây" : "Cương vị trực ca";
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

  // Quản đốc/Phó Quản đốc đã chấm công hành chính hôm nay → nền ảnh phòng điều khiển.
  // Tự reset về trạng thái thường sau 18h tối (theo giờ máy người dùng = giờ VN).
  const adminAttendanceActive = opensAdminAttendance && !!m?.adminCheckedInToday && new Date().getHours() < 18;
  if (adminAttendanceActive) {
    return (
      <Card className="relative h-full min-h-[230px] overflow-hidden border-0 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chucvu/cham-cong-hanh-chinh.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
        <div className="absolute right-3 top-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            ✓ Đã chấm công
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="text-xs font-medium text-white/85 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">Chấm công hành chính</div>
          <div className="truncate text-lg font-bold leading-tight [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">Đã điểm danh hôm nay</div>
          {userPosition && (
            <div className="truncate text-sm text-white/85 [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">{userPosition}</div>
          )}
        </div>
      </Card>
    );
  }

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
          <div className="mt-1 max-w-full truncate whitespace-nowrap text-sm font-medium text-muted-foreground">{positionHint}</div>
          {hasDutyPosition ? (
            <div className="mt-0.5 text-xs text-muted-foreground/70">{m?.unit ?? ""}</div>
          ) : m?.pendingPosition ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              Chờ Quản trị / Quản lý / Trưởng ca duyệt
            </span>
          ) : (
            <Link href={attendanceHref} className="mt-0.5 inline-flex max-w-full whitespace-nowrap text-xs text-accent hover:underline" onClick={(event) => event.stopPropagation()}>
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

/* ---- Safe operation ---- */
type SafeOperationUnit = "S1" | "S2";
const SAFE_OPERATION_UNITS: SafeOperationUnit[] = ["S1", "S2"];

type SafeOpRowKey = "safe" | "continuous" | "maintenance" | "incident" | "standby";
type EditableSafeOpRowKey = Exclude<SafeOpRowKey, "safe">;
const STOPPABLE_KEYS: EditableSafeOpRowKey[] = ["standby", "maintenance", "incident"];
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const SAFE_OPERATION_TIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  timeZone: VIETNAM_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  hour12: false,
});

const SAFE_OPERATION_ROWS: { key: SafeOpRowKey; label: string; icon: React.ElementType; color: string; bg: string; valueColor: string }[] = [
  { key: "safe", label: "Vận hành an toàn", icon: ShieldCheck, color: "text-emerald-700", bg: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200", valueColor: "text-emerald-700" },
  { key: "continuous", label: "Vận hành liên tục", icon: Activity, color: "text-blue-700", bg: "bg-blue-50 hover:bg-blue-100 border-blue-200", valueColor: "text-blue-800" },
  { key: "standby", label: "Ngừng dự phòng", icon: Clock, color: "text-blue-900", bg: "bg-sky-50 hover:bg-sky-100 border-sky-200", valueColor: "text-blue-900" },
  { key: "maintenance", label: "Ngừng sửa chữa bảo dưỡng", icon: Wrench, color: "text-orange-600", bg: "bg-orange-50 hover:bg-orange-100 border-orange-200", valueColor: "text-orange-600" },
  { key: "incident", label: "Ngừng sự cố", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 hover:bg-red-100 border-red-200", valueColor: "text-red-600" },
];

type EditingTarget = { unit: SafeOperationUnit; rowKey: EditableSafeOpRowKey; label: string } | null;
type ResetTarget = { unit: SafeOperationUnit; rowKey: EditableSafeOpRowKey; label: string } | null;

type TimeEntry = {
  id: string;
  start: string;   // datetime-local value
  end: string | null;
  reason: string | null;
  durationMs: number;
  added: boolean;   // already added to total?
};

/** Composite key for entries/totals maps */
function entryKey(unit: SafeOperationUnit, rowKey: SafeOpRowKey) {
  return `${unit}-${rowKey}`;
}

function durationMs(start: string, end: string) {
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime());
}

function formatDuration(ms: number) {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${days} ngày ${hours} giờ ${minutes} phút`;
}

function formatDateTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "--:-- --/--";
  const parts = SAFE_OPERATION_TIME_FORMATTER.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "--";
  return `${get("hour")}:${get("minute")} ${get("day")}/${get("month")}`;
}

function formatEntryRange(start: string, end: string | null) {
  return `${formatDateTime(start)} → ${end ? formatDateTime(end) : "Đang tính"}`;
}

function toVietnamDateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const vietnamTime = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    vietnamTime.getUTCFullYear(),
    pad(vietnamTime.getUTCMonth() + 1),
    pad(vietnamTime.getUTCDate()),
  ].join("-") + `T${pad(vietnamTime.getUTCHours())}:${pad(vietnamTime.getUTCMinutes())}`;
}

function vietnamCalendarYear(date: Date) {
  return new Date(date.getTime() + VIETNAM_OFFSET_MS).getUTCFullYear();
}

function vietnamYearStartInstant(year: number) {
  return new Date(Date.UTC(year, 0, 1) - VIETNAM_OFFSET_MS);
}

function SafeOperationCard({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = useSafeOperations();
  const updateSafeOperation = useUpdateSafeOperation();
  const events = data?.data ?? [];

  const [editing, setEditing] = React.useState<EditingTarget>(null);
  const [resetTarget, setResetTarget] = React.useState<ResetTarget>(null);
  const [draftStart, setDraftStart] = React.useState("");
  const [draftEnd, setDraftEnd] = React.useState("");
  const [draftReason, setDraftReason] = React.useState("");
  
  // Live clock for safe-operation elapsed calculation
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Compute entries and totals from events
  const entries: Record<string, TimeEntry[]> = {};
  const totals: Record<string, number> = {};
  const continuousStarts: Record<string, string> = {};

  for (const event of events) {
    if (event.category === "continuous") {
      continuousStarts[event.unit] = event.startedAt;
      continue;
    }
    const k = entryKey(event.unit as SafeOperationUnit, event.category as SafeOpRowKey);
    if (!entries[k]) entries[k] = [];
    
    const isOpenStop = !event.endedAt;
    const dur = event.startedAt
      ? Math.max(0, new Date(event.endedAt ?? now).getTime() - new Date(event.startedAt).getTime())
      : 0;
    
    entries[k].push({
      id: event.id,
      start: event.startedAt,
      end: event.endedAt,
      reason: event.reason,
      durationMs: dur,
      added: event.isAdded,
    });
    
    if (event.isAdded || isOpenStop) {
      totals[k] = (totals[k] ?? 0) + dur;
    }
  }

  function openTimeDialog(unit: SafeOperationUnit, rowKey: EditableSafeOpRowKey, label: string) {
    setEditing({ unit, rowKey, label });
    const openEntry = entries[entryKey(unit, rowKey)]?.find((entry) => !entry.end);
    setDraftStart(openEntry ? toVietnamDateTimeLocalValue(openEntry.start) : "");
    setDraftEnd("");
    setDraftReason(openEntry?.reason ?? "");
  }

  async function handleSave() {
    if (!editing) return;
    if (!draftStart) return toast.error("Vui lòng nhập thời gian bắt đầu");

    try {
      if (editing.rowKey === "continuous") {
        await updateSafeOperation.mutateAsync({ unit: editing.unit, action: "ADD_ENTRY", category: "continuous", start: draftStart });
        toast.success(`Đã lưu thời gian bắt đầu cho ${editing.label} - ${editing.unit}`);
        setEditing(null);
        return;
      }

      if (draftEnd && new Date(draftEnd) <= new Date(draftStart)) return toast.error("Thời gian kết thúc phải sau thời gian bắt đầu");
      if (draftEnd && (editing.rowKey === "maintenance" || editing.rowKey === "incident") && !draftReason.trim()) {
        return toast.error("Vui lòng nhập lý do");
      }

      await updateSafeOperation.mutateAsync({
        unit: editing.unit,
        action: "ADD_ENTRY",
        category: editing.rowKey,
        start: draftStart,
        end: draftEnd || undefined,
        reason: draftReason.trim() || undefined,
      });
      toast.success(draftEnd
        ? `Đã hoàn tất mốc thời gian cho ${editing.label} - ${editing.unit}`
        : `Đã lưu thời gian bắt đầu cho ${editing.label} - ${editing.unit}`);
      if (draftEnd) setDraftStart("");
      setDraftEnd("");
      if (draftEnd) setDraftReason("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function addEntryToTotal(unit: SafeOperationUnit, rowKey: EditableSafeOpRowKey, entryId: string) {
    try {
      await updateSafeOperation.mutateAsync({ unit, action: "TOGGLE_ENTRY", entryId, isAdded: true });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function undoEntry(unit: SafeOperationUnit, rowKey: EditableSafeOpRowKey, entryId: string) {
    try {
      await updateSafeOperation.mutateAsync({ unit, action: "TOGGLE_ENTRY", entryId, isAdded: false });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function removeEntry(unit: SafeOperationUnit, rowKey: EditableSafeOpRowKey, entryId: string) {
    try {
      await updateSafeOperation.mutateAsync({ unit, action: "REMOVE_ENTRY", entryId });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function confirmResetEntries() {
    if (!resetTarget) return;
    try {
      await updateSafeOperation.mutateAsync({ unit: resetTarget.unit, action: "RESET_CATEGORY", category: resetTarget.rowKey });
      toast.success(`Đã reset ${resetTarget.label} - ${resetTarget.unit}`);
      setResetTarget(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function getTotal(unit: SafeOperationUnit, rowKey: SafeOpRowKey) {
    return totals[entryKey(unit, rowKey)] ?? 0;
  }

  // Entries for the currently open dialog
  const dialogEntries = editing ? [...(entries[entryKey(editing.unit, editing.rowKey)] ?? [])].reverse() : [];

  /** Vận hành an toàn = (now - 1/1 năm nay) - tổng 3 mục ngừng */
  function getSafeTotal(unit: SafeOperationUnit) {
    const startOfYear = vietnamYearStartInstant(vietnamCalendarYear(now));
    const elapsedMs = Math.max(0, now.getTime() - startOfYear.getTime());
    const stopMs =
      getTotal(unit, "standby") +
      getTotal(unit, "maintenance") +
      getTotal(unit, "incident");
    return Math.max(0, elapsedMs - stopMs);
  }

  function getContinuousTotal(unit: SafeOperationUnit) {
    const startStr = continuousStarts[unit];
    if (!startStr) return 0;
    return Math.max(0, now.getTime() - new Date(startStr).getTime());
  }

  return (
    <Card className="overflow-hidden border-sky-200/90 bg-[#f8fcff] shadow-[0_18px_45px_rgba(14,74,140,0.10)]">
      <CardHeader className="relative overflow-hidden border-b-[3px] border-blue-800/90 p-0">
        <SafeOperationProcessStrip />
      </CardHeader>
      <CardContent className="grid gap-4 bg-[linear-gradient(180deg,#f7fcff_0%,#ffffff_42%)] p-3 lg:grid-cols-2 lg:p-4">
        {isLoading ? (
          <>
            <div className="h-96 rounded-lg border border-sky-200 bg-white/70" />
            <div className="h-96 rounded-lg border border-sky-200 bg-white/70" />
          </>
        ) : (
          SAFE_OPERATION_UNITS.map((unit) => (
            <SafeOperationUnitRow
              key={unit}
              unit={unit}
              canManage={canManage}
              onIconClick={openTimeDialog}
              getTotal={getTotal}
              getSafeTotal={getSafeTotal}
              getContinuousTotal={getContinuousTotal}
              isOperating={Boolean(continuousStarts[unit])}
            />
          ))
        )}
      </CardContent>

      {/* Dialog chọn mốc thời gian */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editing?.label} — {editing?.unit}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Thời gian bắt đầu</Label>
              <Input
                type="datetime-local"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
              />
            </div>
            {editing?.rowKey !== "continuous" && (
              <div className="space-y-2">
                <Label>Thời gian kết thúc</Label>
                <Input
                  type="datetime-local"
                  value={draftEnd}
                  onChange={(e) => setDraftEnd(e.target.value)}
                />
              </div>
            )}
            {(editing?.rowKey === "maintenance" || editing?.rowKey === "incident") && (
              <div className="space-y-2">
                <Label>Lý do</Label>
                <Textarea
                  value={draftReason}
                  onChange={(e) => setDraftReason(e.target.value)}
                  placeholder="Nhập lý do"
                  rows={3}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Hủy</Button>
            <Button onClick={handleSave} disabled={updateSafeOperation.isPending}>
              {updateSafeOperation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Lưu
            </Button>
          </DialogFooter>

          {/* Danh sách entries đã nhập (Cho các mục ngừng) */}
          {editing && editing.rowKey !== "continuous" && dialogEntries.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase text-slate-500">Các mốc đã nhập ({dialogEntries.length})</div>
                <button
                  type="button"
                  onClick={() => setResetTarget({ unit: editing.unit, rowKey: editing.rowKey, label: editing.label })}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
                  title="Xóa tất cả và reset về 0"
                >
                  <X className="h-3 w-3" />
                  Reset
                </button>
              </div>
              <div className="max-h-[min(36vh,20rem)] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
                {dialogEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-xs",
                      entry.added ? "bg-emerald-50/60 text-slate-400" : "bg-slate-50 text-slate-600",
                    )}
                  >
                    <span className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                      <span className="min-w-0 flex flex-col gap-0.5">
                        <span>{formatEntryRange(entry.start, entry.end)}</span>
                        {entry.reason && <span className="break-words text-[11px] text-slate-500">Lý do: {entry.reason}</span>}
                      </span>
                      <span className="font-medium text-slate-500">({formatDuration(entry.durationMs)})</span>
                    </span>
                    {!entry.end ? (
                      <button
                        type="button"
                        onClick={() => editing && removeEntry(editing.unit, editing.rowKey, entry.id)}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                        title="Xóa mốc này"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    ) : !entry.added ? (
                      <span className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => editing && addEntryToTotal(editing.unit, editing.rowKey, entry.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100"
                          title="Cộng vào tổng"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editing && removeEntry(editing.unit, editing.rowKey, entry.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                          title="Xóa mốc này"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => editing && undoEntry(editing.unit, editing.rowKey, entry.id)}
                        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                        title="Hoàn tác"
                      >
                        <Undo2 className="h-3 w-3" />
                        Hoàn tác
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reset cho Vận hành liên tục */}
          {editing && editing.rowKey === "continuous" && continuousStarts[editing.unit] && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase text-slate-500">
                  Đang đếm từ: {formatDateTime(continuousStarts[editing.unit])}
                </div>
                <button
                  type="button"
                  onClick={() => setResetTarget({ unit: editing.unit, rowKey: "continuous", label: "Vận hành liên tục" })}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
                  title="Xóa thời gian bắt đầu"
                >
                  <X className="h-3 w-3" />
                  Reset
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!resetTarget}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title="Xác nhận reset thời gian"
        description={
          resetTarget
            ? `Bạn có chắc muốn reset toàn bộ mốc thời gian của "${resetTarget.label}" - ${resetTarget.unit}? Thao tác này sẽ xóa các mốc đã nhập và không thể hoàn tác.`
            : undefined
        }
        confirmLabel="Reset"
        destructive
        loading={updateSafeOperation.isPending}
        onConfirm={confirmResetEntries}
      />
    </Card>
  );
}

function SafeOperationProcessStrip() {
  const stages = ["Nhiên liệu", "Lò hơi", "Tuabin - máy phát", "Điện năng", "Nhà máy nhiệt điện Duyên Hải 1"];

  return (
    <div className="relative">
      {/* Ảnh nền dây chuyền + tiêu đề overlay lên trên */}
      <div className="relative h-[120px] w-full overflow-hidden sm:h-[148px] lg:h-[172px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/safe-operation-bg.png"
          alt="Sơ đồ dây chuyền nhà máy nhiệt điện Duyên Hải 1: nhiên liệu, lò hơi, tuabin, điện năng"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        {/* Lớp phủ sáng phía trên giúp chữ tiêu đề nổi rõ, dễ đọc */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-gradient-to-b from-white via-white/70 to-transparent" />
        <CardTitle className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 pt-3 text-lg font-black uppercase leading-tight tracking-normal text-blue-900 sm:px-6 sm:text-xl lg:text-2xl">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white/90 text-blue-800 shadow-sm sm:h-12 sm:w-12">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <span>
            Thời gian vận hành an toàn
            <span className="ml-2 whitespace-nowrap align-middle text-xs font-semibold tracking-wider text-slate-500 sm:text-sm">Safe Operation</span>
          </span>
        </CardTitle>
      </div>
      {/* Chú thích các công đoạn */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t-[3px] border-blue-800/90 bg-white/95 px-2 py-1 sm:grid-cols-5">
        {stages.map((stage, index) => (
          <div
            key={stage}
            className={cn(
              "flex min-w-0 items-center justify-center gap-2",
              // Ô cuối (tên nhà máy, chuỗi dài) chiếm trọn hàng trên mobile để không gãy chữ mồ côi.
              index === stages.length - 1 && "col-span-2 sm:col-span-1"
            )}
          >
            {index > 0 && <span className="hidden h-px flex-1 border-t border-dotted border-blue-500 sm:block" />}
            <span className="text-center text-[10px] font-black uppercase leading-tight text-blue-900 sm:text-[11px] lg:text-xs">
              {stage}
            </span>
            {index < stages.length - 1 && <span className="hidden h-px flex-1 border-t border-dotted border-blue-500 sm:block" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function SafeOperationUnitRow({
  unit,
  canManage,
  onIconClick,
  getTotal,
  getSafeTotal,
  getContinuousTotal,
  isOperating,
}: {
  unit: SafeOperationUnit;
  canManage: boolean;
  onIconClick: (unit: SafeOperationUnit, rowKey: EditableSafeOpRowKey, label: string) => void;
  getTotal: (unit: SafeOperationUnit, rowKey: SafeOpRowKey) => number;
  getSafeTotal: (unit: SafeOperationUnit) => number;
  getContinuousTotal: (unit: SafeOperationUnit) => number;
  isOperating: boolean;
}) {
  // Thu gọn/mở rộng 3 dòng thời gian NGỪNG (dự phòng / sửa chữa / sự cố).
  const [showStops, setShowStops] = React.useState(false);
  const stopRows = SAFE_OPERATION_ROWS.filter((r) => STOPPABLE_KEYS.includes(r.key as EditableSafeOpRowKey));
  const stopTotalMs = getTotal(unit, "standby") + getTotal(unit, "maintenance") + getTotal(unit, "incident");

  const renderRow = ({ key, label, icon: Icon, color, bg, valueColor }: (typeof SAFE_OPERATION_ROWS)[number]) => {
    const isStoppable = key !== "safe" && STOPPABLE_KEYS.includes(key as EditableSafeOpRowKey);
    const totalMs =
      key === "safe"
        ? getSafeTotal(unit)
        : key === "continuous"
          ? getContinuousTotal(unit)
          : isStoppable
            ? getTotal(unit, key)
            : 0;
    const isPrimary = key === "safe" || key === "continuous";
    const isWarning = key === "maintenance" || key === "incident";

    return (
      <div
        key={key}
        className={cn(
          "grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2 border-b border-sky-100 last:border-b-0 sm:grid-cols-[3.75rem_minmax(0,0.78fr)_minmax(11rem,1.22fr)] sm:gap-2.5 xl:grid-cols-[4rem_minmax(0,0.86fr)_minmax(12rem,1.2fr)]",
          isPrimary ? "py-2.5" : "py-1.5",
        )}
      >
        <div className="flex justify-center">
          {key === "safe" ? (
            <div className={cn("inline-flex h-10 w-10 items-center justify-center rounded-lg border text-white shadow-sm", bg)} title={label}>
              <Icon className={cn(color, "h-5 w-5")} />
            </div>
          ) : canManage ? (
            <button
              type="button"
              onClick={() => onIconClick(unit, key as EditableSafeOpRowKey, label)}
              className={cn("inline-flex items-center justify-center rounded-lg border transition-all hover:-translate-y-0.5 hover:shadow-md", isPrimary ? "h-10 w-10" : "h-8 w-8", bg)}
              title={`Cài đặt ${label}`}
            >
              <Icon className={cn(color, isPrimary ? "h-5 w-5" : "h-4 w-4")} />
            </button>
          ) : (
            <div className={cn("inline-flex items-center justify-center rounded-lg border", isPrimary ? "h-10 w-10" : "h-8 w-8", bg)} title={label}>
              <Icon className={cn(color, isPrimary ? "h-5 w-5" : "h-4 w-4")} />
            </div>
          )}
        </div>
        <div className={cn("min-w-0 font-black leading-tight text-blue-950 sm:border-r sm:border-sky-300 sm:pr-4", isPrimary ? "text-sm lg:text-base" : "text-xs lg:text-sm")}>
          {label}
        </div>
        <div
          className={cn(
            "col-span-2 pl-[calc(3.5rem+0.5rem)] text-left font-black tabular-nums sm:col-span-1 sm:pl-4 sm:text-right",
            "whitespace-nowrap",
            isPrimary ? "text-[clamp(0.95rem,1.18vw,1.125rem)]" : "text-[clamp(0.82rem,1vw,1rem)]",
            valueColor,
            isWarning && "tracking-tight",
          )}
        >
          {formatDuration(totalMs)}
        </div>
      </div>
    );
  };

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-lg border border-sky-300/90 bg-white shadow-[0_14px_32px_rgba(14,116,144,0.10)] ring-1 ring-white">
      <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-3 sm:px-4">
        <div className="absolute inset-x-8 bottom-0 h-px bg-blue-800/55" />
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {/* Trái: TỔ MÁY (trên) + S1/S2 (dưới) */}
          <div className="flex shrink-0 flex-col leading-none">
            <span className="text-xs font-black uppercase tracking-wide text-blue-900 sm:text-sm">Tổ máy</span>
            <span className="mt-0.5 text-3xl font-black leading-none text-blue-900 drop-shadow-[0_2px_0_rgba(125,211,252,0.35)] sm:text-4xl">
              {unit}
            </span>
          </div>
          {/* Kế bên: trạng thái vận hành an toàn */}
          <div
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-black shadow-sm sm:gap-2 sm:px-3 sm:py-1 sm:text-sm",
              isOperating ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-slate-50 text-slate-600",
            )}
          >
            <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border shadow-sm sm:h-6 sm:w-6", isOperating ? "border-emerald-300 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-500")}>
              {isOperating ? <ShieldCheck className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            </span>
            {isOperating ? "Vận hành an toàn" : "Ngừng"}
          </div>
        </div>
        {/* Phải: thời gian vận hành an toàn (tự xuống hàng riêng khi màn hình hẹp) */}
        <span className="ml-auto whitespace-nowrap text-base font-black leading-none tabular-nums text-emerald-700 sm:text-2xl">
          {formatDuration(getSafeTotal(unit))}
        </span>
      </div>
      <div className="flex-1 px-3 py-1.5 sm:px-4">
        {/* Vận hành liên tục — luôn hiện */}
        <div className="relative my-1.5 overflow-hidden rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/60 to-white py-2 pl-4 pr-3">
          <div className="absolute inset-y-2 left-0 w-1.5 rounded-full bg-blue-500" />
          {/* Vận hành liên tục — gọn */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div className="flex items-center gap-2">
              {canManage ? (
                <button
                  type="button"
                  onClick={() => onIconClick(unit, "continuous", "Vận hành liên tục")}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 transition-all hover:-translate-y-0.5 hover:shadow-md"
                  title="Cài đặt Vận hành liên tục"
                >
                  <Activity className="h-4 w-4 text-blue-700" />
                </button>
              ) : (
                <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50" title="Vận hành liên tục">
                  <Activity className="h-4 w-4 text-blue-700" />
                </div>
              )}
              <span className="whitespace-nowrap text-sm font-black text-blue-950">Vận hành liên tục</span>
            </div>
            <span className="ml-auto whitespace-nowrap text-sm font-black tabular-nums text-blue-800 sm:text-base">{formatDuration(getContinuousTotal(unit))}</span>
          </div>
        </div>
        {/* Nút thu gọn / mở rộng chi tiết thời gian ngừng */}
        <button
          type="button"
          onClick={() => setShowStops((v) => !v)}
          className="flex w-full items-center justify-between gap-2 border-b border-sky-100 py-1.5 text-sm font-black text-blue-900 transition-colors hover:text-blue-700"
        >
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
              <Clock className="h-4 w-4 text-slate-500" />
            </span>
            {showStops ? "Ẩn chi tiết thời gian ngừng" : "Chi tiết thời gian ngừng"}
          </span>
          <span className="flex items-center gap-2">
            {!showStops && (
              <span className="text-xs font-bold text-slate-400">
                Tổng: {stopTotalMs > 0 ? formatDuration(stopTotalMs) : "Không có"}
              </span>
            )}
            <ChevronDown className={cn("h-4 w-4 text-blue-800 transition-transform", showStops && "rotate-180")} />
          </span>
        </button>
        {/* 3 dòng ngừng — chỉ hiện khi mở rộng */}
        {showStops && stopRows.map(renderRow)}
      </div>
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
          Lịch diễn tập sự cố, diễn tập PCCC ( Trưởng Ca cập nhập)
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
