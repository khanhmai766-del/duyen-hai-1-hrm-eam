"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { CheckCircle2, UserCheck, Loader2, Phone, UserMinus, Tv, X, ClipboardCheck, Plus, ArrowLeft, Clock, Lock, Check, Repeat, Printer, QrCode, Copy, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useShift, useCheckInOrg, useRecallCheckIn, useApproveAttendance, useRemoveAssignment } from "@/hooks/useShifts";
import { useHcGroups, type HcMember, type HcGroup } from "@/hooks/useHcAttendance";
import { useCurrentPosition } from "@/hooks/useCurrentPosition";
import { useUsers } from "@/hooks/useUsers";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { SHIFT_TYPE, SHIFT_TYPE_ORDER } from "@/lib/constants";
import { ORG_CHIEF, ORG_LEADS, ORG_SEAT_TITLES, type OrgTone } from "@/lib/org-template";
import { normalizeText } from "@/lib/nav";
import { cn, initials } from "@/lib/utils";
import type { ShiftAssignmentWithUser, CheckInWithUser } from "@/types";

const HOURS_OPTIONS = [4, 6, 8];
const ORG_CHART_VIEWER_KEY = "pp:org-chart-viewer-active";
const VIEWER_REFRESH_INTERVAL_MS = 10_000;

const UNITS = ["Vận hành 1", "Vận hành 2"];

const MANAGEMENT_SEATS = [
  { title: "Quản đốc" },
  { title: "Phó quản đốc" },
  { title: "Kỹ thuật viên" },
  { title: "Thống kê" },
] as const;
const HC_SELF_CONTENT_PREFIX = "Hành chính - ";
const EXPANDED_ORG_SEAT_ROWS: Record<string, number> = {
  "I&C": 2,
};

function orgSeatGridSpan(title: string) {
  return EXPANDED_ORG_SEAT_ROWS[title] ?? 1;
}

const MANAGEMENT_TONE_STYLES: Record<
  (typeof MANAGEMENT_SEATS)[number]["title"],
  { cell: string; title: string; person: string; avatar: string }
> = {
  "Quản đốc": {
    cell: "border-rose-200 bg-rose-50/80 shadow-[0_12px_24px_-18px_rgba(225,29,72,0.55)]",
    title: "text-rose-700",
    person: "bg-white/85",
    avatar: "bg-rose-700",
  },
  "Phó quản đốc": {
    cell: "border-sky-200 bg-sky-50/85 shadow-[0_12px_24px_-18px_rgba(2,132,199,0.55)]",
    title: "text-sky-700",
    person: "bg-white/85",
    avatar: "bg-sky-700",
  },
  "Kỹ thuật viên": {
    cell: "border-emerald-200 bg-emerald-50/85 shadow-[0_12px_24px_-18px_rgba(5,150,105,0.55)]",
    title: "text-emerald-700",
    person: "bg-white/85",
    avatar: "bg-emerald-700",
  },
  "Thống kê": {
    cell: "border-amber-200 bg-amber-50/85 shadow-[0_12px_24px_-18px_rgba(217,119,6,0.5)]",
    title: "text-amber-700",
    person: "bg-white/85",
    avatar: "bg-amber-700",
  },
};

const CHECK_IN_SUCCESS_MESSAGES: Record<string, string[]> = {
  MORNING: [
    "Chào ca sáng! Hãy giữ tâm thế tỉnh táo, kỷ cương và hoàn thành xuất sắc ca trực hôm nay nhé 👍",
    "Chấm công ca sáng hoàn tất. Chúc ca trực suôn sẻ, dòng điện thông suốt ❤",
    "Điểm danh ca sáng thành công! Chúc bạn một ca trực an toàn, vận hành ổn định.🙌",
  ],
  AFTERNOON: [
    "Điểm danh ca chiều thành công! Chúc bạn luôn tập trung, bảo đảm an toàn vận hành.",
    "Chào ca chiều! Chúc bạn giữ vững năng lượng để hoàn thành tốt ca trực hôm nay. 💪",
    "Chấm công ca chiều hoàn tất. Kỷ cương vững vàng, vận hành an toàn, thông suốt. 👍",
  ],
  NIGHT: [
    "Điểm danh ca đêm thành công! Cảm ơn sự cống hiến thầm lặng của bạn. Chúc ca đêm an toàn tuyệt đối! ❤",
    "Chào ca đêm! Hãy luôn tỉnh táo, tuân thủ nghiêm ngặt quy trình an toàn để giữ vững dòng điện nhé. 💖",
    "Chấm công ca đêm hoàn tất. Chúc bạn một ca trực bình an, hoàn thành tốt nhiệm vụ. 🥰",
  ],
};

function randomCheckInSuccessMessage(shiftType: string) {
  const messages = CHECK_IN_SUCCESS_MESSAGES[shiftType] ?? CHECK_IN_SUCCESS_MESSAGES.MORNING;
  return messages[Math.floor(Math.random() * messages.length)];
}

/** Local YYYY-MM-DD (avoids the UTC shift of toISOString). */
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The shift currently in progress, by real clock time:
 *   06:00–13:59 → Sáng (MORNING)
 *   14:00–21:59 → Chiều (AFTERNOON)
 *   22:00–05:59 → Đêm (NIGHT)
 * The night shift crosses midnight, so between 00:00–05:59 it belongs to the
 * PREVIOUS calendar day (it started at 22:00 the day before).
 */
function realtimeShift(now: Date = new Date()): { date: string; shiftType: string } {
  const h = now.getHours();
  if (h >= 6 && h < 14) return { date: localDate(now), shiftType: "MORNING" };
  if (h >= 14 && h < 22) return { date: localDate(now), shiftType: "AFTERNOON" };
  // Night shift
  const d = new Date(now);
  if (h < 6) d.setDate(d.getDate() - 1); // early morning → previous day's night shift
  return { date: localDate(d), shiftType: "NIGHT" };
}

export default function OrgChartPage() {
  const initial = realtimeShift();
  const [date, setDate] = React.useState(initial.date);
  const [shiftType, setShiftType] = React.useState<string>(initial.shiftType);
  const [unit, setUnit] = React.useState<string>(UNITS[0]);
  // While true, date + shift follow the real clock; any manual change turns it off.
  const [autoFollow, setAutoFollow] = React.useState(true);

  // Re-evaluate the live shift each minute and switch automatically when the
  // clock crosses a shift boundary (only while auto-follow is on).
  React.useEffect(() => {
    if (!autoFollow) return;
    const tick = () => {
      const rt = realtimeShift();
      setDate(rt.date);
      setShiftType(rt.shiftType);
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [autoFollow]);

  const { data: session } = useSession();
  const [checkInOpen, setCheckInOpen] = React.useState(false);
  const [recallDone, setRecallDone] = React.useState(false);
  const [checkInSuccessMessage, setCheckInSuccessMessage] = React.useState("");
  const [viewer, setViewer] = React.useState(false);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [origin, setOrigin] = React.useState("");
  const recall = useRecallCheckIn();
  const rbac = useRbacAccess();

  const canApprove = rbac.can("shift-operation-approve", ["approve", "manage", "full"]);
  const currentMonthBounds = React.useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return {
      min: localDate(new Date(year, month, 1)),
      max: localDate(new Date(year, month + 1, 0)),
    };
  }, []);
  const selectedDateAllowed = date >= currentMonthBounds.min && date <= currentMonthBounds.max;
  const monthRestrictionTitle = "Chỉ được điểm danh, thu hồi hoặc duyệt ca trong tháng hiện tại";

  React.useEffect(() => {
    if (!checkInSuccessMessage) return;
    const timer = window.setTimeout(() => setCheckInSuccessMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [checkInSuccessMessage]);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  function showCheckInSuccessMessage() {
    setCheckInSuccessMessage(randomCheckInSuccessMessage(shiftType));
  }

  const dateLabel = date.split("-").reverse().join("-");
  const caLabel = `${SHIFT_TYPE[shiftType as keyof typeof SHIFT_TYPE]?.label ?? ""} ${dateLabel}`.trim();

  function openViewer() {
    setViewer(true);
    document.documentElement.requestFullscreen?.().catch(() => {}); // best-effort real fullscreen for TV
  }
  function closeViewer() {
    setViewer(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  const publicOrgChartUrl = `${origin}/public/org-chart`;
  async function copyPublicOrgChartUrl() {
    try {
      await navigator.clipboard.writeText(publicOrgChartUrl);
      toast.success("Đã sao chép link công khai");
    } catch {
      toast.error("Không sao chép được link");
    }
  }
  React.useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeViewer();
    const onFsChange = () => !document.fullscreenElement && setViewer(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [viewer]);
  React.useEffect(() => {
    if (!viewer) return;
    try {
      sessionStorage.setItem(ORG_CHART_VIEWER_KEY, "1");
    } catch {
      /* sessionStorage không khả dụng */
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      try {
        sessionStorage.removeItem(ORG_CHART_VIEWER_KEY);
      } catch {
        /* sessionStorage không khả dụng */
      }
      document.body.style.overflow = previousOverflow;
    };
  }, [viewer]);

  const { data, isLoading } = useShift(
    { date, shiftType, unit },
    { refetchInterval: viewer ? VIEWER_REFRESH_INTERVAL_MS : false }
  );
  const { data: hcGroupsData } = useHcGroups(date);
  const shift = data?.data;
  const hcGroups = hcGroupsData?.data ?? [];
  const assignments = (shift?.assignments ?? []) as ShiftAssignmentWithUser[];
  const checkIns = shift?.checkIns ?? [];
  const approved = assignments.filter((a) => a.isApproved).length;
  const attendanceLocked = Boolean(shift?.isAttendanceLocked);

  // Whether the logged-in user already has a seat in this shift → toggles the
  // "Điểm danh" (check in) ↔ "Thu hồi điểm danh" (recall) button.
  const isCheckedIn = assignments.some((a) => a.user?.id === session?.user?.id);
  // Sau khi được DUYỆT chấm công, user dưới quyền Quản trị/Trưởng ca không được
  // thu hồi điểm danh nữa (chỉ ADMIN / Trưởng ca mới thu hồi được).
  const myApproved = assignments.some((a) => a.user?.id === session?.user?.id && a.isApproved);
  const recallLocked = isCheckedIn && myApproved && !canApprove;
  // Duyệt hết khóa điểm danh thêm để chốt dữ liệu bảng công của ca.

  async function handleRecall() {
    try {
      await recall.mutateAsync({ date, shiftType, unit });
      setRecallDone(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="SƠ ĐỒ TỔ CHỨC CA VẬN HÀNH" description="Phân công vị trí trực vận hành theo ca">
        {assignments.length > 0 && (
          <Badge variant={approved === assignments.length ? "accent" : "secondary"} className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> {approved}/{assignments.length} đã duyệt
          </Badge>
        )}
        {canApprove && (
          <Button
            size="sm"
            onClick={() => setApproveOpen(true)}
            disabled={!selectedDateAllowed}
            title={!selectedDateAllowed ? monthRestrictionTitle : undefined}
            className="text-white hover:text-white [&_svg]:text-white"
          >
            <ClipboardCheck className="h-4 w-4" /> Duyệt chấm công
          </Button>
        )}
        {isCheckedIn ? (
          recallLocked ? (
            <Button
              size="sm"
              variant="outline"
              disabled
              className="cursor-not-allowed text-muted-foreground"
              title="Chấm công đã được Quản trị / Quản lý / Trưởng ca duyệt — bạn không thể thu hồi điểm danh"
            >
              <Lock className="h-4 w-4" /> Đã duyệt — khoá thu hồi
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleRecall}
              disabled={recall.isPending || !selectedDateAllowed}
              title={!selectedDateAllowed ? monthRestrictionTitle : undefined}
            >
              {recall.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
              Thu hồi điểm danh
            </Button>
          )
        ) : (
          <Button
            size="sm"
            variant={attendanceLocked || !selectedDateAllowed ? "outline" : "accent"}
            onClick={() => setCheckInOpen(true)}
            disabled={attendanceLocked || !selectedDateAllowed}
            className={attendanceLocked ? "cursor-not-allowed text-muted-foreground" : undefined}
            title={attendanceLocked ? "Ca trực đã duyệt hết — điểm danh đã khóa" : !selectedDateAllowed ? monthRestrictionTitle : undefined}
          >
            {attendanceLocked ? <Lock className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
            {attendanceLocked ? "Đã khóa điểm danh" : !selectedDateAllowed ? "Ngoài tháng hiện tại" : "Điểm danh"}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={openViewer}>
          <Tv className="h-4 w-4" /> Viewer
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}>
          <QrCode className="h-4 w-4" /> Link QR
        </Button>
      </PageHeader>

      <CheckInDialog open={checkInOpen} onOpenChange={setCheckInOpen} date={date} shiftType={shiftType} unit={unit} onSuccess={showCheckInSuccessMessage} />
      <CheckInSuccessOverlay message={checkInSuccessMessage} />
      <ApproveAttendanceDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        date={date}
        shiftType={shiftType}
        unit={unit}
        assignments={assignments}
      />
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link công khai sơ đồ ca</DialogTitle>
            <DialogDescription>
              Người ngoài không cần tài khoản có thể mở link cố định này để xem danh sách nhân sự ca hiện tại hoặc xem lại tối đa 1 ngày trước, bao gồm số điện thoại.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-lg border border-border bg-white p-3">
              {origin ? <QRCodeSVG value={publicOrgChartUrl} size={196} includeMargin /> : <div className="h-[196px] w-[196px]" />}
            </div>
            <div className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-center text-sm font-medium text-ink break-all">
              {publicOrgChartUrl}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={copyPublicOrgChartUrl} disabled={!origin}>
              <Copy className="h-4 w-4" /> Sao chép link
            </Button>
            <Button asChild disabled={!origin}>
              <a href="/public/org-chart" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" /> Mở thử
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recall success modal */}
      <Dialog open={recallDone} onOpenChange={setRecallDone}>
        <DialogContent className="max-w-xs">
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </span>
            <p className="text-base font-semibold text-ink">Đã thu hồi điểm danh</p>
            <Button className="mt-1 w-24" onClick={() => setRecallDone(false)}>Ok</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen presentation (Viewer) — for TV / projector. ESC to exit. */}
      {viewer && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[1000] flex h-dvh w-dvw flex-col overflow-hidden bg-white p-4">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-4">
            <div className="flex min-w-0 items-baseline gap-3">
              <h2 className="shrink-0 text-xl font-bold text-ink xl:text-2xl">Nhân sự trực ca vận hành</h2>
              <span className="min-w-0 truncate text-xs font-medium text-muted-foreground xl:text-sm">
                {caLabel} · {unit}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {assignments.length > 0 && (
                <Badge variant={approved === assignments.length ? "accent" : "secondary"} className="gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {approved}/{assignments.length} đã duyệt
                </Badge>
              )}
              <button
                onClick={closeViewer}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-ink"
              >
                <X className="h-4 w-4" /> Thoát
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <OrgTemplateChart assignments={assignments} checkIns={checkIns} hcGroups={hcGroups} presentation />
          </div>
        </div>,
        document.body
      )}

      {/* Controls */}
      <Card className="overflow-x-auto p-3">
        <div className="flex min-w-full items-center gap-x-3 gap-y-2 whitespace-nowrap">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Ngày:</span>
            <Input
              type="date"
              value={date}
              min={currentMonthBounds.min}
              max={currentMonthBounds.max}
              onChange={(e) => { setDate(e.target.value); setAutoFollow(false); }}
              className="h-9 w-44 shrink-0 bg-white text-sm"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Ca:</span>
            <div className="inline-flex rounded-lg border border-border bg-white p-0.5">
              {SHIFT_TYPE_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setShiftType(s); setAutoFollow(false); }}
                  className={cn("rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    shiftType === s ? "bg-navy text-white" : "text-muted-foreground hover:text-ink")}
                >
                  {SHIFT_TYPE[s].label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Đơn vị:</span>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Real-time follow indicator / restore button */}
          <div className="ml-auto flex shrink-0 items-center">
            {autoFollow ? (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="whitespace-nowrap">Theo thời gian thực</span>
              </span>
            ) : (
              <button
                onClick={() => setAutoFollow(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent hover:text-ink"
                title="Quay lại ca trực hiện tại theo giờ thực"
              >
                <Clock className="h-3.5 w-3.5" /> Về ca hiện tại
              </button>
            )}
          </div>
        </div>
      </Card>

      {isLoading ? <CardSkeleton /> : <OrgTemplateChart assignments={assignments} checkIns={checkIns} hcGroups={hcGroups} />}
    </div>
  );
}

function CheckInSuccessOverlay({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[1200] flex items-center justify-center px-5">
      <div className="w-full max-w-2xl animate-in fade-in-0 zoom-in-95 rounded-3xl border border-emerald-200/80 bg-white/95 px-7 py-6 text-center shadow-[0_28px_90px_-34px_rgba(15,23,42,0.65)] ring-1 ring-white/80 backdrop-blur-md sm:px-9">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-500/25 ring-1 ring-white/70">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <p className="mx-auto max-w-[58ch] text-[17px] font-extrabold leading-8 text-ink [text-wrap:balance] sm:text-xl sm:leading-9">
          {message}
        </p>
      </div>
    </div>
  );
}

function CheckInDialog({
  open,
  onOpenChange,
  date,
  shiftType,
  unit,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  date: string;
  shiftType: string;
  unit: string;
  onSuccess: () => void;
}) {
  const { data: session } = useSession();
  const currentPosition = useCurrentPosition();
  const { data: usersData } = useUsers();
  const checkIn = useCheckInOrg();

  const users = usersData?.data ?? [];
  const me = users.find((u) => u.id === session?.user?.id);
  // Cương vị options = the seat titles defined in the org-chart template, so the
  // chosen value always matches a seat the name can drop into.
  const positions = ORG_SEAT_TITLES;
  const preferredPosition = React.useMemo(() => {
    const candidates = [
      currentPosition.position,
      ...currentPosition.options,
      me?.position,
      me?.secondaryPosition,
      session?.user?.position,
    ].filter((value): value is string => !!value?.trim());

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeText(candidate);
      const exact = positions.find((seat) => normalizeText(seat) === normalizedCandidate);
      if (exact) return exact;
      const close = positions.find((seat) => {
        const normalizedSeat = normalizeText(seat);
        return normalizedCandidate.includes(normalizedSeat) || normalizedSeat.includes(normalizedCandidate);
      });
      if (close) return close;
    }
    return positions[0];
  }, [currentPosition.options, currentPosition.position, me?.position, me?.secondaryPosition, positions, session?.user?.position]);
  const orderedPositions = React.useMemo(
    () => [preferredPosition, ...positions.filter((seat) => seat !== preferredPosition)],
    [positions, preferredPosition]
  );

  const [position, setPosition] = React.useState("");
  const [hours, setHours] = React.useState(8);
  const [swap, setSwap] = React.useState(false);
  const [swapNote, setSwapNote] = React.useState("");

  // Ưu tiên cương vị của người thao tác; chỉ rơi về ghế đầu tiên khi không khớp.
  React.useEffect(() => {
    if (open) {
      setPosition(preferredPosition);
      setHours(8);
      setSwap(false);
      setSwapNote("");
    }
  }, [open, preferredPosition]);

  const dateLabel = date.split("-").reverse().join("-"); // YYYY-MM-DD → DD-MM-YYYY
  const caLabel = `${SHIFT_TYPE[shiftType as keyof typeof SHIFT_TYPE]?.label ?? ""} ${dateLabel}`.trim();

  async function save() {
    if (!position) return toast.error("Vui lòng chọn cương vị");
    try {
      await checkIn.mutateAsync({ date, shiftType, unit, positionLabel: position, hours, swap, swapNote: swap ? swapNote : "" });
      onOpenChange(false);
      onSuccess();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Điểm danh</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Row label="Ca trực">
            <span className="text-sm font-medium text-ink">{caLabel}</span>
          </Row>

          <Row label="Cương vị">
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {orderedPositions.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row label="Số giờ chấm công">
            <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOURS_OPTIONS.map((h) => (
                  <SelectItem key={h} value={String(h)}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row label="Trực đổi ca">
            <div className="flex items-center gap-5">
              {[{ v: true, t: "Có" }, { v: false, t: "Không" }].map((o) => (
                <label key={o.t} className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="swap"
                    checked={swap === o.v}
                    onChange={() => setSwap(o.v)}
                    className="h-4 w-4 accent-accent"
                  />
                  {o.t}
                </label>
              ))}
            </div>
          </Row>

          {swap && (
            <Row label="Ghi chú trực đổi ca">
              <Input
                value={swapNote}
                onChange={(e) => setSwapNote(e.target.value)}
                placeholder="Ghi chú đổi ca với ai, kíp nào - vào đây"
              />
            </Row>
          )}

          <Row label="Vận hành viên">
            <span className="text-sm font-medium text-ink">{session?.user?.name ?? "—"}</span>
          </Row>

          {/* Avatar */}
          <div className="flex justify-center">
            <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-lg bg-navy text-2xl font-bold text-white ring-1 ring-border">
              {me?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.avatarUrl} alt={session?.user?.name ?? ""} className="h-full w-full object-cover" />
              ) : (
                initials(session?.user?.name ?? "?")
              )}
            </div>
          </div>

          <Row label="Số điện thoại">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {me?.phone ?? "—"}
            </span>
          </Row>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={save} disabled={checkIn.isPending}>
            {checkIn.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <Label className="text-muted-foreground">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

const ATTENDANCE_FORM_ROWS = 34;

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrintDate(date: string) {
  const [year, month, day] = date.split("-");
  return day && month && year ? `${day}/${month}/${year}` : date;
}

function approvedAttendanceRows(assignments: ShiftAssignmentWithUser[]) {
  const order = new Map(ORG_SEAT_TITLES.map((title, index) => [title, index]));
  return [...assignments]
    .filter((a) => normalizeText(a.positionLabel) !== normalizeText(ORG_CHIEF))
    .sort((a, b) => {
      const bySeat = (order.get(a.positionLabel) ?? 999) - (order.get(b.positionLabel) ?? 999);
      if (bySeat !== 0) return bySeat;
      return a.user.name.localeCompare(b.user.name, "vi");
    })
    .slice(0, ATTENDANCE_FORM_ROWS);
}

function printAttendancePdf({
  assignments,
  date,
  shiftType,
  unit,
  targetWindow,
}: {
  assignments: ShiftAssignmentWithUser[];
  date: string;
  shiftType: string;
  unit: string;
  targetWindow?: Window | null;
}) {
  const rows = approvedAttendanceRows(assignments);
  const chief = assignments.find((a) => normalizeText(a.positionLabel) === normalizeText(ORG_CHIEF));
  const chiefSignature = chief?.user.signatureUrl
    ? `<img src="${escapeHtml(chief.user.signatureUrl)}" alt="Chữ ký ${escapeHtml(chief.user.name)}" />`
    : "";
  const chiefName = chief?.user.name ? escapeHtml(chief.user.name) : "&nbsp;";
  const emptyRows = Math.max(0, ATTENDANCE_FORM_ROWS - rows.length);
  const shiftLabel = SHIFT_TYPE[shiftType as keyof typeof SHIFT_TYPE]?.label ?? shiftType;
  const titleShift = shiftLabel.toUpperCase();
  const titleDate = `${formatPrintDate(date)} - ${unit}`;
  const bodyRows = [
    ...rows.map((assignment, index) => {
      const signature = assignment.user.signatureUrl
        ? `<img class="signature" src="${escapeHtml(assignment.user.signatureUrl)}" alt="Chữ ký ${escapeHtml(assignment.user.name)}" />`
        : "";
      return `
        <tr>
          <td class="stt-cell">${index + 1}</td>
          <td>${escapeHtml(assignment.user.name)}</td>
          <td>${escapeHtml(assignment.positionLabel)}</td>
          <td class="signature-cell">${signature}</td>
          <td></td>
        </tr>
      `;
    }),
    ...Array.from({ length: emptyRows }, () => "<tr><td></td><td></td><td></td><td></td><td></td></tr>"),
  ].join("");

  const html = `
    <!doctype html>
    <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <title>Danh sách phổ biến và sinh hoạt đầu ca - ${escapeHtml(titleShift)}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm 12.7mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            color: #000;
            background: #fff;
            font-family: "Times New Roman", Times, serif;
            font-size: 13pt;
          }
          .sheet { width: 100%; }
          .document-header {
            width: 100%;
            margin-bottom: 10px;
            border-collapse: collapse;
            table-layout: fixed;
          }
          .document-header td {
            height: 28px;
            border: 1px dotted #777;
            padding: 1px 6px;
            text-align: center;
            vertical-align: middle;
          }
          .document-header .agency {
            font-size: 11pt;
            line-height: 1.18;
          }
          .document-header .agency strong,
          .document-header .national strong {
            font-weight: 700;
          }
          .document-header .national {
            font-size: 10.5pt;
            line-height: 1;
          }
          .document-header .national strong {
            display: inline-block;
            white-space: nowrap;
          }
          .document-header .national .motto {
            display: inline-block;
            margin-top: 0;
            border-bottom: 1px solid #000;
            font-weight: 700;
            line-height: 1;
          }
          .document-header .place-date {
            font-size: 13pt;
            font-style: italic;
          }
          h1 {
            margin: 0;
            text-align: center;
            font-size: 14pt;
            font-weight: 700;
            text-transform: uppercase;
          }
          .date-line {
            margin: 3px 0 8px;
            text-align: center;
            font-size: 13pt;
            font-weight: 700;
          }
          .attendance-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          .attendance-table th,
          .attendance-table td {
            border: 1px solid #000;
            height: 18px;
            padding: 1px 5px;
            vertical-align: middle;
            font-size: 11pt;
          }
          .attendance-table th {
            text-align: center;
            font-size: 10pt;
            font-weight: 700;
            white-space: nowrap;
          }
          .attendance-table td:nth-child(1),
          .attendance-table td:nth-child(3),
          .attendance-table td:nth-child(4) {
            text-align: center;
          }
          .signature-cell {
            padding: 0 4px;
            text-align: center;
          }
          .signature {
            display: inline-block;
            max-width: 118px;
            max-height: 16px;
            object-fit: contain;
            vertical-align: middle;
          }
          .sign-off {
            margin-top: 10px;
            margin-left: auto;
            width: 230px;
            text-align: right;
            font-weight: 700;
          }
          .sign-title,
          .sign-name {
            text-align: center;
          }
          .sign-signature {
            display: flex;
            height: 42px;
            align-items: center;
            justify-content: center;
            margin-top: 4px;
          }
          .sign-signature img {
            max-width: 170px;
            max-height: 42px;
            object-fit: contain;
          }
          .sign-name {
            margin-top: 2px;
            font-size: 12pt;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <main class="sheet">
          <table class="document-header">
            <colgroup>
              <col style="width: 48%" />
              <col style="width: 52%" />
            </colgroup>
            <tr>
              <td>
                <div class="agency">
                  CÔNG TY NHIỆT ĐIỆN DUYÊN HẢI<br />
                  <strong>PHÂN XƯỞNG VẬN HÀNH 1</strong>
                </div>
              </td>
              <td>
                <div class="national">
                  <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br />
                  <span class="motto">Độc lập Tự do Hạnh phúc</span>
                </div>
              </td>
            </tr>
            <tr>
              <td></td>
              <td class="place-date">Vĩnh Long, ngày&nbsp;&nbsp;&nbsp;&nbsp;tháng&nbsp;&nbsp;&nbsp;&nbsp;năm</td>
            </tr>
          </table>
          <h1>DANH SÁCH PHỔ BIẾN VÀ SINH HOẠT ĐẦU CA: ${escapeHtml(titleShift)}</h1>
          <div class="date-line">NGÀY: ${escapeHtml(titleDate)}</div>
          <table class="attendance-table">
            <colgroup>
              <col style="width: 6%" />
              <col style="width: 36%" />
              <col style="width: 25%" />
              <col style="width: 20%" />
              <col style="width: 13%" />
            </colgroup>
            <thead>
              <tr>
                <th>STT</th>
                <th>HỌ TÊN VẬN HÀNH VIÊN</th>
                <th>CƯƠNG VỊ</th>
                <th>CHỮ KÝ</th>
                <th>GHI CHÚ</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
          <div class="sign-off">
            <div class="sign-title">KÝ TÊN</div>
            <div class="sign-signature">${chiefSignature}</div>
            <div class="sign-name">${chiefName}</div>
          </div>
        </main>
        <script>
          window.addEventListener("load", () => {
            setTimeout(() => {
              window.print();
            }, 250);
          });
        </script>
      </body>
    </html>
  `;

  const printWindow = targetWindow ?? window.open("", "_blank", "width=900,height=1100");
  if (!printWindow) {
    toast.error("Trình duyệt đã chặn cửa sổ xuất PDF. Vui lòng cho phép popup rồi thử lại.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

/* ---- Duyệt chấm công (ADMIN / Trưởng ca): full editable seat grid ---- */
function ApproveAttendanceDialog({
  open,
  onOpenChange,
  date,
  shiftType,
  unit,
  assignments,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  date: string;
  shiftType: string;
  unit: string;
  assignments: ShiftAssignmentWithUser[];
}) {
  const approve = useApproveAttendance();
  const remove = useRemoveAssignment();
  const assign = useCheckInOrg();
  const [picker, setPicker] = React.useState<string | null>(null); // seat title being filled
  const [confirmApproveOpen, setConfirmApproveOpen] = React.useState(false);

  const byTitle = React.useMemo(() => {
    const m = new Map<string, ShiftAssignmentWithUser[]>();
    assignments.forEach((a) => {
      const arr = m.get(a.positionLabel) ?? [];
      arr.push(a);
      m.set(a.positionLabel, arr);
    });
    return m;
  }, [assignments]);

  const total = assignments.length;
  const pending = assignments.filter((a) => !a.isApproved).length;

  async function approveAll() {
    try {
      const res: any = await approve.mutateAsync({ date, shiftType, unit });
      toast.success(`Đã duyệt ${res?.data?.approved ?? ""} chấm công và khóa điểm danh`.trim());
      setConfirmApproveOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function exportAttendancePdf() {
    printAttendancePdf({ assignments, date, shiftType, unit });
  }
  async function approveOne(id: string) {
    try {
      await approve.mutateAsync({ date, shiftType, unit, ids: [id] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function removeOne(id: string) {
    try {
      await remove.mutateAsync(id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function addUser(userId: string) {
    if (!picker) return;
    try {
      await assign.mutateAsync({ date, shiftType, unit, positionLabel: picker, userId });
      toast.success("Đã thêm vào cương vị");
      setPicker(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const seatProps = { byTitle, onAdd: setPicker, onApprove: approveOne, onRemove: removeOne };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl">
          {picker ? (
            // Drill-in: choose a person for the selected seat (avoids nested dialogs).
            <PersonnelPicker seat={picker} onBack={() => setPicker(null)} onPick={addUser} pending={assign.isPending} />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Duyệt chấm công</DialogTitle>
              </DialogHeader>

              <div className="text-sm text-muted-foreground">
                Tổng <span className="font-semibold text-ink">{total}</span> điểm danh · còn{" "}
                <span className="font-semibold text-warning">{pending}</span> chờ duyệt
              </div>

              <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                <EditableSeat title={ORG_CHIEF} tone="chief" {...seatProps} />
                <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
                  {ORG_LEADS.map((lead) => (
                    <div key={lead.title} className="min-w-[260px] space-y-2" style={{ flex: lead.columns.length }}>
                      <EditableSeat title={lead.title} tone={lead.tone} {...seatProps} />
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${lead.columns.length}, minmax(0, 1fr))` }}>
                        {lead.columns.map((col, i) => (
                          <div key={i} className="grid gap-2" style={{ gridAutoRows: "minmax(5.5rem, auto)" }}>
                            {col.map((seat) => (
                              <EditableSeat
                                key={seat}
                                title={seat}
                                tone={lead.tone}
                                style={{ gridRow: `span ${orgSeatGridSpan(seat)} / span ${orgSeatGridSpan(seat)}` }}
                                {...seatProps}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
                <Button onClick={() => setConfirmApproveOpen(true)} disabled={approve.isPending || total === 0}>
                  {approve.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <CheckCircle2 className="h-4 w-4" /> Duyệt hết
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmApproveOpen} onOpenChange={setConfirmApproveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận duyệt chấm công</DialogTitle>
            <DialogDescription>
              Duyệt toàn bộ {total} điểm danh của ca này và khóa người dùng tự điểm danh thêm.
              Người có quyền duyệt vẫn có thể bổ sung nhân sự khi có thay đổi đột xuất.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmApproveOpen(false)} disabled={approve.isPending}>
              Hủy
            </Button>
            <Button onClick={approveAll} disabled={approve.isPending || total === 0}>
              {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Xác nhận
            </Button>
            <Button type="button" variant="secondary" onClick={exportAttendancePdf} disabled={total === 0}>
              <Printer className="h-4 w-4" />
              Xuất PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditableSeat({
  title,
  tone,
  byTitle,
  onAdd,
  onApprove,
  onRemove,
  style,
}: {
  title: string;
  tone: OrgTone | "chief";
  byTitle: Map<string, ShiftAssignmentWithUser[]>;
  onAdd: (title: string) => void;
  onApprove: (id: string) => void;
  onRemove: (id: string) => void;
  style?: React.CSSProperties;
}) {
  const s = TONE_STYLES[tone];
  const occupants = byTitle.get(title) ?? [];
  return (
    <div className={cn("rounded-lg border px-2 py-2 text-center", s.cell)} style={style}>
      <div className={cn("text-[11px] font-semibold leading-tight", s.title)}>{title}</div>
      <div className="mt-1 space-y-1.5">
        {occupants.map((o) => (
          <div key={o.id} className="rounded-md bg-white/70 p-1.5">
            <div className={cn("text-xs font-bold leading-tight", o.isApproved ? "text-ink" : "text-warning")}>
              {o.user.name}
            </div>
            <div className="mt-1 flex items-center justify-center gap-1">
              {!o.isApproved && (
                <button
                  onClick={() => onApprove(o.id)}
                  className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-accent/90"
                >
                  Duyệt
                </button>
              )}
              <button
                onClick={() => onRemove(o.id)}
                className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-red-600"
              >
                Xóa
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => onAdd(title)}
        className="mt-1.5 inline-flex items-center gap-0.5 rounded border border-dashed border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:border-accent hover:text-accent"
      >
        <Plus className="h-3 w-3" /> Thêm
      </button>
    </div>
  );
}

/** Searchable personnel picker shown as a drill-in view of the approve dialog. */
function PersonnelPicker({
  seat,
  onBack,
  onPick,
  pending,
}: {
  seat: string;
  onBack: () => void;
  onPick: (userId: string) => void;
  pending: boolean;
}) {
  const { data } = useUsers();
  const users = data?.data ?? [];
  const [q, setQ] = React.useState("");
  const nq = normalizeText(q.trim());
  const filtered = nq
    ? users.filter((u) => normalizeText(`${u.name} ${u.employeeId} ${u.position ?? ""} ${u.secondaryPosition ?? ""}`).includes(nq))
    : users;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <button onClick={onBack} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-ink" aria-label="Quay lại">
            <ArrowLeft className="h-4 w-4" />
          </button>
          Chọn nhân sự — {seat}
        </DialogTitle>
      </DialogHeader>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên hoặc mã NV..." autoFocus />
      <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">Không tìm thấy nhân sự.</div>
        )}
        {filtered.slice(0, 80).map((u) => (
          <button
            key={u.id}
            disabled={pending}
            onClick={() => onPick(u.id)}
            className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-accent hover:bg-accent/5 disabled:opacity-50"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-[10px] font-bold text-white">
              {u.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.avatarUrl} alt={u.name} className="h-full w-full object-cover" />
              ) : (
                initials(u.name)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">
                {u.name} <span className="text-xs font-normal text-muted-foreground">({u.employeeId})</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {u.position ?? "—"}
                {u.secondaryPosition ? ` · Phụ: ${u.secondaryPosition}` : ""}
                {u.phone ? ` · ${u.phone}` : ""}
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
 * Template-driven org chart. The fixed seat grid (lib/org-template.ts) always
 * renders; check-ins fill the seat whose title matches the chosen cương vị.
 * ------------------------------------------------------------------------- */

const TONE_STYLES: Record<OrgTone | "chief", { bar: string; cell: string; title: string; block: string; filled: string }> = {
  chief: { bar: "bg-pink-50 border-pink-200", cell: "bg-pink-50/60 border-pink-200", title: "text-pink-700", block: "", filled: "border-pink-300 shadow-[0_10px_24px_-10px_rgba(236,72,153,0.5)]" },
  blue: { bar: "bg-blue-50 border-blue-200", cell: "bg-blue-50/50 border-blue-200", title: "text-blue-700", block: "bg-blue-50/30", filled: "border-blue-300 shadow-[0_10px_24px_-10px_rgba(37,99,235,0.5)]" },
  green: { bar: "bg-green-50 border-green-200", cell: "bg-green-50/50 border-green-200", title: "text-green-700", block: "bg-green-50/30", filled: "border-emerald-300 shadow-[0_10px_24px_-10px_rgba(16,185,129,0.5)]" },
};

function OrgTemplateChart({
  assignments,
  checkIns,
  hcGroups = [],
  presentation = false,
}: {
  assignments: ShiftAssignmentWithUser[];
  checkIns?: CheckInWithUser[];
  hcGroups?: HcGroup[];
  presentation?: boolean;
}) {
  // Group occupants by the exact seat title they checked into.
  const byTitle = React.useMemo(() => {
    const m = new Map<string, ShiftAssignmentWithUser[]>();
    assignments.forEach((a) => {
      const arr = m.get(a.positionLabel) ?? [];
      arr.push(a);
      m.set(a.positionLabel, arr);
    });
    return m;
  }, [assignments]);

  // VHV trực đổi ca: lấy từ check-in có ghi chú "trực đổi ca" (kèm ghi chú đổi với ai/kíp nào).
  const swapRows = React.useMemo(() => {
    const seatByUser = new Map(assignments.map((a) => [a.userId, a.positionLabel]));
    return (checkIns ?? [])
      .filter((c) => /trực đổi ca/i.test(c.note ?? ""))
      .map((c) => {
        const match = (c.note ?? "").match(/trực đổi ca:\s*(.+)$/i);
        return {
          id: c.id,
          name: c.user?.name ?? "—",
          seat: seatByUser.get(c.userId) ?? "",
          note: match ? match[1].trim() : "",
        };
      });
  }, [assignments, checkIns]);

  const now = useMinuteClock();
  const showManagementColumn = isManagementColumnTime(now);
  const managementSeatGroups = React.useMemo(() => managementSlotsFromHcGroups(hcGroups), [hcGroups]);

  return (
    <div
      className={cn(
        presentation
          ? "flex h-full min-h-0 flex-col gap-2 overflow-hidden rounded-xl border border-border bg-white p-2"
          : "space-y-4 overflow-x-auto rounded-xl border border-border bg-white p-4"
      )}
    >
      <div className={cn(presentation ? "flex min-h-0 flex-1 items-stretch gap-2" : "flex min-w-[1180px] items-stretch gap-4")}>
        <div className={cn(presentation ? "flex min-w-0 flex-1 flex-col gap-2" : "min-w-0 flex-1 space-y-4")}>
          {/* Chief */}
          <SeatBar title={ORG_CHIEF} occupants={byTitle.get(ORG_CHIEF)} tone="chief" presentation={presentation} />

          {/* Leads + their seat columns */}
          <div className={cn(presentation ? "flex min-h-0 flex-1 items-stretch gap-2" : "flex flex-col gap-4 lg:flex-row lg:items-stretch")}>
            {ORG_LEADS.map((lead) => (
              <div
                key={lead.title}
                className={cn(
                  presentation ? "flex min-w-0 flex-col gap-1.5 rounded-lg p-1.5" : "min-w-[260px] space-y-2 rounded-lg p-2",
                  TONE_STYLES[lead.tone].block
                )}
                style={{ flex: lead.columns.length }}
              >
                <SeatBar title={lead.title} occupants={byTitle.get(lead.title)} tone={lead.tone} presentation={presentation} />
                <div
                  className={cn(presentation ? "grid min-h-0 flex-1 gap-1.5" : "grid gap-2")}
                  style={{ gridTemplateColumns: `repeat(${lead.columns.length}, minmax(0, 1fr))` }}
                >
                  {lead.columns.map((col, i) => (
                    <div
                      key={i}
                      className={cn(presentation ? "grid min-h-0 gap-1.5" : "grid gap-2")}
                      style={{ gridAutoRows: presentation ? "minmax(0, 1fr)" : "minmax(5.5rem, auto)" }}
                    >
                      {col.map((seat) => (
                        <Seat
                          key={seat}
                          title={seat}
                          occupants={byTitle.get(seat)}
                          tone={lead.tone}
                          presentation={presentation}
                          style={{ gridRow: `span ${orgSeatGridSpan(seat)} / span ${orgSeatGridSpan(seat)}` }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {showManagementColumn && managementSeatGroups.length > 0 && (
          <ManagementColumn groups={managementSeatGroups} presentation={presentation} />
        )}
      </div>

      {/* Legend */}
      {!presentation && (
        <div className="border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="font-semibold text-ink">Quy tắc hiển thị: </span>
          <span className="font-semibold text-ink">Màu đen</span> = đã được duyệt;{" "}
          <span className="font-semibold text-warning">Họ &amp; tên màu cam</span> = chưa được duyệt.
        </div>
      )}

      {/* VHV trực đổi ca */}
      {!presentation && swapRows.length > 0 && (
        <div className={cn("shrink-0 rounded-lg border border-amber-200 bg-amber-50/60", presentation ? "p-2" : "p-3")}>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700">
            <Repeat className="h-3.5 w-3.5" /> VHV trực đổi ca
          </div>
          <div className="flex flex-wrap gap-2">
            {swapRows.map((r) => (
              <div key={r.id} className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs shadow-sm">
                <span className="font-semibold text-ink">{r.name}</span>
                {r.seat && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">{r.seat}</span>}
                {r.note && <span className="text-muted-foreground">· {r.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function useMinuteClock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 30000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function isManagementColumnTime(now: Date) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 7 * 60 + 30 && minutes <= 17 * 60;
}

function managementSlotsFromHcGroups(groups: HcGroup[]) {
  const members = groups
    .filter((group) => group.content.startsWith(HC_SELF_CONTENT_PREFIX))
    .flatMap((group) => group.members)
    .filter((member) => !member.isRegistered);

  const used = new Set<string>();
  return MANAGEMENT_SEATS
    .map((seat) => {
      const matched = members
        .filter((member) => !used.has(member.userId) && userMatchesManagementSeat(member, seat.title))
        .sort((a, b) => {
          const byCheckInTime = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          if (byCheckInTime !== 0) return byCheckInTime;
          return a.user.name.localeCompare(b.user.name, "vi");
        });

      matched.forEach((member) => used.add(member.userId));
      return { ...seat, members: matched };
    })
    .filter((seat) => seat.members.length > 0);
}

function memberPositionValues(member: HcMember) {
  return [member.user.position]
    .map((value) => normalizeText(value ?? ""))
    .filter(Boolean);
}

function userMatchesManagementSeat(member: HcMember, title: string) {
  const positions = memberPositionValues(member);
  const key = normalizeText(title);
  if (key === "quan doc") return positions.some((p) => p.includes("quan doc") && !p.includes("pho"));
  if (key === "pho quan doc") return positions.some((p) => p.includes("pho quan doc"));
  if (key === "ky thuat vien") return positions.some((p) => p.includes("ky thuat vien") || p.includes("ky thuat"));
  if (key === "thong ke") return positions.some((p) => p.includes("thong ke"));
  return positions.some((p) => p === key);
}

function ManagementColumn({
  groups,
  presentation = false,
}: {
  groups: Array<(typeof MANAGEMENT_SEATS)[number] & { members: HcMember[] }>;
  presentation?: boolean;
}) {
  return (
    <aside
      className={cn(
        "h-fit shrink-0 self-start rounded-xl border border-indigo-200 bg-indigo-50/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.75),0_18px_40px_-30px_rgba(79,70,229,0.65)]",
        presentation ? "w-[190px] p-1.5 xl:w-[220px]" : "w-[240px] p-2"
      )}
    >
      <div className={cn(presentation ? "flex min-h-0 flex-col gap-1.5" : "space-y-2")}>
        {groups.map((group) => (
          <div
            key={group.title}
            className={cn("rounded-lg border", MANAGEMENT_TONE_STYLES[group.title].cell, presentation ? "p-1.5" : "p-2")}
          >
            <div className={cn("font-extrabold leading-tight", MANAGEMENT_TONE_STYLES[group.title].title, presentation ? "text-[10px]" : "text-[11px]")}>
              {group.title}
            </div>
            <div className={cn(presentation ? "mt-1 space-y-1" : "mt-1.5 space-y-1.5")}>
              {group.members.map((member) => (
                <ManagementPerson key={member.id} member={member} tone={group.title} presentation={presentation} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function ManagementPerson({
  member,
  tone,
  presentation = false,
}: {
  member: HcMember;
  tone: (typeof MANAGEMENT_SEATS)[number]["title"];
  presentation?: boolean;
}) {
  const user = member.user;
  const s = MANAGEMENT_TONE_STYLES[tone];
  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-md text-left", s.person, presentation ? "px-1 py-0.5" : "px-2 py-1.5")}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ring-1 ring-white",
          s.avatar,
          presentation ? "h-11 w-11 text-xs xl:h-12 xl:w-12 xl:text-sm" : "h-12 w-12 text-xs"
        )}
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
        ) : (
          initials(user.name)
        )}
      </div>
      <div className="min-w-0">
        <div className={cn("break-words font-bold leading-snug text-ink", presentation ? "text-[9px] xl:text-[10px]" : "text-xs")} title={user.name}>
          {user.name}
        </div>
        {user.phone && (
          <div className={cn("mt-0.5 flex min-w-0 items-center gap-0.5 font-bold text-slate-950", presentation ? "text-[8px] xl:text-[9px]" : "text-[10px]")}>
            <Phone className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{user.phone}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Full-width header bar for the chief / lead rows. */
function SeatBar({
  title,
  occupants,
  tone,
  presentation = false,
}: {
  title: string;
  occupants?: ShiftAssignmentWithUser[];
  tone: OrgTone | "chief";
  presentation?: boolean;
}) {
  const s = TONE_STYLES[tone];
  const filled = !!occupants?.length;
  return (
    <div
      className={cn(
        "group shrink-0 rounded-lg border text-center transition-all duration-300",
        presentation ? "flex flex-col px-2 py-1.5" : "px-3 py-2",
        s.bar,
        filled && s.filled
      )}
    >
      <div className={cn(presentation ? "text-[10px] font-semibold leading-tight xl:text-xs" : "text-xs font-semibold", s.title)}>{title}</div>
      <Occupants occupants={occupants} center presentation={presentation} />
    </div>
  );
}

/** A single member seat cell. */
function Seat({
  title,
  occupants,
  tone,
  presentation = false,
  style,
}: {
  title: string;
  occupants?: ShiftAssignmentWithUser[];
  tone: OrgTone;
  presentation?: boolean;
  style?: React.CSSProperties;
}) {
  const s = TONE_STYLES[tone];
  const filled = !!occupants?.length;
  return (
    <div
      className={cn(
        "group relative rounded-xl border text-center transition-all duration-300",
        presentation ? "flex min-h-0 flex-1 flex-col overflow-hidden px-1.5 py-1" : "px-2 py-2.5",
        filled
          ? cn(s.cell, "hover:-translate-y-0.5", s.filled)
          : cn("border-dashed bg-muted/20 opacity-90", s.cell)
      )}
      style={style}
    >
      <div className={cn(presentation ? "text-[10px] font-semibold leading-tight xl:text-[11px]" : "text-[11px] font-semibold leading-tight", s.title)}>{title}</div>
      {filled ? (
        <Occupants occupants={occupants} presentation={presentation} stacked={presentation && orgSeatGridSpan(title) > 1} />
      ) : (
        <div className={cn("mt-1 text-muted-foreground/40", presentation ? "text-[10px]" : "text-[11px]")}>— trống —</div>
      )}
    </div>
  );
}

function Occupants({
  occupants,
  center,
  presentation = false,
  stacked = false,
}: {
  occupants?: ShiftAssignmentWithUser[];
  center?: boolean;
  presentation?: boolean;
  stacked?: boolean;
}) {
  if (!occupants?.length) {
    return center ? <div className={cn("mt-0.5 text-muted-foreground/40", presentation ? "text-[10px]" : "text-[11px]")}>— trống —</div> : null;
  }
  if (presentation) {
    if (stacked && occupants.length === 2) {
      return (
        <div className={cn("mt-1 flex w-full min-w-0 flex-col justify-center gap-1", !center && "min-h-0 flex-1")}>
          {occupants.map((o) => <CompactOccupant key={o.id} occupant={o} wide largeAvatar />)}
        </div>
      );
    }
    if (occupants.length === 3) {
      const ordered = [...occupants].sort((a, b) => a.user.name.length - b.user.name.length);
      const top = ordered.slice(0, 2);
      const bottom = ordered[2];
      return (
        <div className={cn("mt-0.5 grid w-full min-w-0 grid-cols-2 items-center gap-x-1 gap-y-0.5", !center && "min-h-0 flex-1")}>
          {top.map((o) => <CompactOccupant key={o.id} occupant={o} dense />)}
          <div className="col-span-2 flex justify-center">
            <CompactOccupant occupant={bottom} wide />
          </div>
        </div>
      );
    }
    if (occupants.length > 3) {
      return (
        <div className={cn("mt-0.5 grid w-full min-w-0 grid-cols-2 items-center gap-0.5", !center && "min-h-0 flex-1")}>
          {occupants.map((o) => <CompactOccupant key={o.id} occupant={o} dense />)}
        </div>
      );
    }
    return (
      <div
        className={cn("mt-0.5 grid w-full min-w-0 items-center gap-0.5", !center && "min-h-0 flex-1")}
        style={{ gridTemplateColumns: `repeat(${occupants.length}, minmax(0, 1fr))` }}
      >
        {occupants.map((o) => (
          <CompactOccupant key={o.id} occupant={o} alignAvatar={occupants.length === 1} largeAvatar={occupants.length === 1} />
        ))}
      </div>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-2">
      {occupants.map((o) => (
        <div
          key={o.id}
          className={cn("flex min-w-0 flex-col items-center [perspective:600px] animate-in fade-in zoom-in-95 duration-500", presentation && "w-full max-w-full")}
        >
          <div className="relative">
            {/* Vầng sáng công nghệ phía sau (hiện rõ khi hover) */}
            <span
              aria-hidden
              className={cn(
                "absolute -inset-1.5 rounded-full opacity-50 blur-[7px] transition-opacity duration-300 group-hover:opacity-90",
                o.isApproved ? "bg-emerald-400/40" : "bg-amber-400/40"
              )}
            />
            {/* Ảnh user 3D: viền gradient + bóng nổi, nghiêng/phóng khi hover */}
            <div
              className={cn(
                "relative flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-navy to-accent font-bold text-white shadow-[0_8px_18px_-6px_rgba(15,23,42,0.55)] ring-2 ring-white transition-transform duration-300 will-change-transform group-hover:scale-110 group-hover:[transform:rotateY(12deg)_rotateX(6deg)]",
                presentation ? "h-8 w-8 text-[9px] xl:h-10 xl:w-10 xl:text-[10px]" : "h-12 w-12 text-[11px]"
              )}
            >
              {o.user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.user.avatarUrl} alt={o.user.name} className="h-full w-full object-cover" />
              ) : (
                initials(o.user.name)
              )}
              {/* lớp bóng kính tạo chiều sâu 3D */}
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/35 to-transparent" />
            </div>
            {/* Chấm trạng thái điểm danh */}
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full text-white shadow ring-2 ring-white",
                presentation ? "h-3.5 w-3.5" : "h-4 w-4",
                o.isApproved ? "bg-emerald-500" : "bg-amber-500"
              )}
              title={o.isApproved ? "Đã được duyệt" : "Chưa được duyệt"}
            >
              {o.isApproved ? <Check className={cn(presentation ? "h-2 w-2" : "h-2.5 w-2.5")} /> : <Clock className={cn(presentation ? "h-2 w-2" : "h-2.5 w-2.5")} />}
            </span>
          </div>
          <span
            className={cn(
              "font-bold leading-tight",
              presentation ? "mt-1 block w-full max-w-full truncate px-1 text-[10px] xl:text-[11px]" : "mt-1.5 text-xs",
              o.isApproved ? "text-ink" : "text-warning"
            )}
            title={o.user.name}
          >
            {o.user.name}
          </span>
          {!presentation && o.user.phone && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-950">
              <Phone className="h-2.5 w-2.5" /> {o.user.phone}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function CompactOccupant({
  occupant,
  dense = false,
  wide = false,
  alignAvatar = false,
  largeAvatar = false,
}: {
  occupant: ShiftAssignmentWithUser;
  dense?: boolean;
  wide?: boolean;
  alignAvatar?: boolean;
  largeAvatar?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md px-1 py-0.5 text-left animate-in fade-in zoom-in-95 duration-500",
        alignAvatar && "mx-auto w-full max-w-[12rem] justify-start",
        wide ? "w-full max-w-[80%] justify-center" : !alignAvatar && "justify-center"
      )}
    >
      <div className="relative shrink-0">
        <div
          className={cn(
            "relative flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-navy to-accent font-bold text-white shadow-[0_6px_12px_-8px_rgba(15,23,42,0.55)] ring-1 ring-white",
            largeAvatar
              ? "h-10 w-10 text-[11px] xl:h-11 xl:w-11 xl:text-xs"
              : "h-7 w-7 text-[8px] xl:h-8 xl:w-8 xl:text-[9px]"
          )}
        >
          {occupant.user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={occupant.user.avatarUrl} alt={occupant.user.name} className="h-full w-full object-cover" />
          ) : (
            initials(occupant.user.name)
          )}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/35 to-transparent" />
        </div>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full text-white shadow ring-1 ring-white",
            largeAvatar ? "h-4 w-4" : "h-3 w-3",
            occupant.isApproved ? "bg-emerald-500" : "bg-amber-500"
          )}
          title={occupant.isApproved ? "Đã được duyệt" : "Chưa được duyệt"}
        >
          {occupant.isApproved ? <Check className={cn(largeAvatar ? "h-2.5 w-2.5" : "h-1.5 w-1.5")} /> : <Clock className={cn(largeAvatar ? "h-2.5 w-2.5" : "h-1.5 w-1.5")} />}
        </span>
      </div>
      <div className="min-w-0 text-left leading-none">
        <div
          className={cn(
            "min-w-0 font-bold leading-tight",
            dense ? "break-words text-[9px] xl:text-[10px]" : "truncate text-[10px] xl:text-[11px]",
            occupant.isApproved ? "text-ink" : "text-warning"
          )}
          title={occupant.user.name}
        >
          {occupant.user.name}
        </div>
        {occupant.user.phone && (
          <div className="mt-0.5 flex min-w-0 items-center gap-0.5 text-[8px] font-bold leading-none text-slate-950 xl:text-[9px]">
            <Phone className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{occupant.user.phone}</span>
          </div>
        )}
      </div>
    </div>
  );
}
