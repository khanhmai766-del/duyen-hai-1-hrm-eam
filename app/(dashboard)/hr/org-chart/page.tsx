"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { CheckCircle2, UserCheck, Loader2, Phone, UserMinus, Tv, X, ClipboardCheck, Plus, ArrowLeft, Clock, Lock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useShift, useCheckInOrg, useRecallCheckIn, useApproveAttendance, useRemoveAssignment } from "@/hooks/useShifts";
import { useUsers } from "@/hooks/useUsers";
import { SHIFT_TYPE, SHIFT_TYPE_ORDER } from "@/lib/constants";
import { ORG_CHIEF, ORG_LEADS, ORG_SEAT_TITLES, type OrgTone } from "@/lib/org-template";
import { normalizeText } from "@/lib/nav";
import { cn, initials } from "@/lib/utils";
import type { ShiftAssignmentWithUser } from "@/types";

const HOURS_OPTIONS = [4, 6, 8, 10, 12];

const UNITS = ["Vận hành 1", "Vận hành 2"];

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
  const [viewer, setViewer] = React.useState(false);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const recall = useRecallCheckIn();

  // Only Quản trị (ADMIN) and Trưởng ca (SUPERVISOR) may approve attendance.
  const canApprove = ["ADMIN", "SUPERVISOR"].includes(session?.user?.role ?? "");

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

  const { data, isLoading } = useShift({ date, shiftType, unit });
  const shift = data?.data;
  const assignments = (shift?.assignments ?? []) as ShiftAssignmentWithUser[];
  const approved = assignments.filter((a) => a.isApproved).length;

  // Whether the logged-in user already has a seat in this shift → toggles the
  // "Điểm danh" (check in) ↔ "Thu hồi điểm danh" (recall) button.
  const isCheckedIn = assignments.some((a) => a.user?.id === session?.user?.id);
  // Sau khi được DUYỆT chấm công, user dưới quyền Quản trị/Trưởng ca không được
  // thu hồi điểm danh nữa (chỉ ADMIN / Trưởng ca mới thu hồi được).
  const myApproved = assignments.some((a) => a.user?.id === session?.user?.id && a.isApproved);
  const recallLocked = isCheckedIn && myApproved && !canApprove;
  // Khi ca đã được duyệt (có người đã duyệt) → khoá điểm danh với user thường;
  // chỉ Quản trị / Trưởng ca được thêm/xoá nhân sự.
  const shiftLocked = approved > 0;
  const checkInLocked = shiftLocked && !canApprove;

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
      <PageHeader title="Sơ đồ tổ chức ca vận hành" description="Phân công vị trí trực vận hành theo ca">
        {assignments.length > 0 && (
          <Badge variant={approved === assignments.length ? "accent" : "secondary"} className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> {approved}/{assignments.length} đã duyệt
          </Badge>
        )}
        {canApprove && (
          <Button
            onClick={() => setApproveOpen(true)}
            className="bg-amber-400 text-amber-950 hover:bg-amber-500"
          >
            <ClipboardCheck className="h-4 w-4" /> Duyệt chấm công
          </Button>
        )}
        {isCheckedIn ? (
          recallLocked ? (
            <Button
              variant="outline"
              disabled
              className="cursor-not-allowed text-muted-foreground"
              title="Chấm công đã được Quản trị / Trưởng ca duyệt — bạn không thể thu hồi điểm danh"
            >
              <Lock className="h-4 w-4" /> Đã duyệt — khoá thu hồi
            </Button>
          ) : (
            <Button variant="destructive" onClick={handleRecall} disabled={recall.isPending}>
              {recall.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
              Thu hồi điểm danh
            </Button>
          )
        ) : checkInLocked ? (
          <Button
            variant="outline"
            disabled
            className="cursor-not-allowed text-muted-foreground"
            title="Ca trực đã được Quản trị / Trưởng ca duyệt — đã khoá điểm danh"
          >
            <Lock className="h-4 w-4" /> Đã duyệt — khoá điểm danh
          </Button>
        ) : (
          <Button variant="accent" onClick={() => setCheckInOpen(true)}><UserCheck className="h-4 w-4" /> Điểm danh</Button>
        )}
      </PageHeader>

      <CheckInDialog open={checkInOpen} onOpenChange={setCheckInOpen} date={date} shiftType={shiftType} unit={unit} />
      <ApproveAttendanceDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        date={date}
        shiftType={shiftType}
        unit={unit}
        assignments={assignments}
      />

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
      {viewer && (
        <div className="fixed inset-0 z-[100] flex flex-col overflow-auto bg-white p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-ink">Sơ đồ tổ chức ca vận hành</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {caLabel} · {unit}
              </p>
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
                <X className="h-4 w-4" /> Thoát (ESC)
              </button>
            </div>
          </div>
          <div className="flex-1 text-[1.05rem]">
            <OrgTemplateChart assignments={assignments} />
          </div>
        </div>
      )}

      {/* Controls */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Ngày</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setAutoFollow(false); }}
              className="w-44"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Ca</label>
            <div className="flex gap-1 rounded-lg border border-border p-1">
              {SHIFT_TYPE_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => { setShiftType(s); setAutoFollow(false); }}
                  className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    shiftType === s ? "bg-navy text-white" : "text-muted-foreground hover:bg-muted")}
                >
                  {SHIFT_TYPE[s].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Đơn vị</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="h-10 rounded-md border border-input bg-white px-3 text-sm">
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          {/* Real-time follow indicator / restore button */}
          <div className="mb-0.5 self-end">
            {autoFollow ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Theo thời gian thực
              </span>
            ) : (
              <button
                onClick={() => setAutoFollow(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent hover:text-ink"
                title="Quay lại ca trực hiện tại theo giờ thực"
              >
                <Clock className="h-3.5 w-3.5" /> Về ca hiện tại
              </button>
            )}
          </div>

          <Button variant="outline" className="ml-auto" onClick={openViewer}>
            <Tv className="h-4 w-4" /> Viewer
          </Button>
        </div>
      </Card>

      {isLoading ? <CardSkeleton /> : <OrgTemplateChart assignments={assignments} />}
    </div>
  );
}

function CheckInDialog({
  open,
  onOpenChange,
  date,
  shiftType,
  unit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  date: string;
  shiftType: string;
  unit: string;
}) {
  const { data: session } = useSession();
  const { data: usersData } = useUsers();
  const checkIn = useCheckInOrg();

  const users = usersData?.data ?? [];
  const me = users.find((u) => u.id === session?.user?.id);
  // Cương vị options = the seat titles defined in the org-chart template, so the
  // chosen value always matches a seat the name can drop into.
  const positions = ORG_SEAT_TITLES;

  const [position, setPosition] = React.useState("");
  const [hours, setHours] = React.useState(8);
  const [swap, setSwap] = React.useState(false);

  // Default to the seat matching the user's chức danh, else the first seat.
  React.useEffect(() => {
    if (open) {
      const own = me?.position ?? session?.user?.position ?? "";
      setPosition(positions.includes(own) ? own : positions[0]);
      setHours(8);
      setSwap(false);
    }
  }, [open, me?.position, session?.user?.position, positions]);

  const dateLabel = date.split("-").reverse().join("-"); // YYYY-MM-DD → DD-MM-YYYY
  const caLabel = `${SHIFT_TYPE[shiftType as keyof typeof SHIFT_TYPE]?.label ?? ""} ${dateLabel}`.trim();

  async function save() {
    if (!position) return toast.error("Vui lòng chọn cương vị");
    try {
      await checkIn.mutateAsync({ date, shiftType, unit, positionLabel: position, hours, swap });
      toast.success(`Đã điểm danh: ${position}`);
      onOpenChange(false);
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
                {positions.map((p) => (
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
      toast.success(`Đã duyệt ${res?.data?.approved ?? ""} chấm công`.trim());
    } catch (e) {
      toast.error((e as Error).message);
    }
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
                        <div key={i} className="flex flex-col gap-2">
                          {col.map((seat) => (
                            <EditableSeat key={seat} title={seat} tone={lead.tone} {...seatProps} />
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
              <Button onClick={approveAll} disabled={approve.isPending || pending === 0}>
                {approve.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <CheckCircle2 className="h-4 w-4" /> Duyệt hết
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditableSeat({
  title,
  tone,
  byTitle,
  onAdd,
  onApprove,
  onRemove,
}: {
  title: string;
  tone: OrgTone | "chief";
  byTitle: Map<string, ShiftAssignmentWithUser[]>;
  onAdd: (title: string) => void;
  onApprove: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const s = TONE_STYLES[tone];
  const occupants = byTitle.get(title) ?? [];
  return (
    <div className={cn("rounded-lg border px-2 py-2 text-center", s.cell)}>
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
    ? users.filter((u) => normalizeText(`${u.name} ${u.employeeId}`).includes(nq))
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
              <div className="truncate text-xs text-muted-foreground">{u.position ?? "—"}{u.phone ? ` · ${u.phone}` : ""}</div>
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

const TONE_STYLES: Record<OrgTone | "chief", { bar: string; cell: string; title: string; block: string }> = {
  chief: { bar: "bg-pink-50 border-pink-200", cell: "bg-pink-50/60 border-pink-200", title: "text-pink-700", block: "" },
  blue: { bar: "bg-blue-50 border-blue-200", cell: "bg-blue-50/50 border-blue-200", title: "text-blue-700", block: "bg-blue-50/30" },
  green: { bar: "bg-green-50 border-green-200", cell: "bg-green-50/50 border-green-200", title: "text-green-700", block: "bg-green-50/30" },
};

function OrgTemplateChart({ assignments }: { assignments: ShiftAssignmentWithUser[] }) {
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

  return (
    <div className="space-y-4 overflow-x-auto rounded-xl border border-border bg-white p-4">
      {/* Chief */}
      <SeatBar title={ORG_CHIEF} occupants={byTitle.get(ORG_CHIEF)} tone="chief" />

      {/* Leads + their seat columns */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {ORG_LEADS.map((lead) => (
          <div
            key={lead.title}
            className={cn("min-w-[260px] space-y-2 rounded-lg p-2", TONE_STYLES[lead.tone].block)}
            style={{ flex: lead.columns.length }}
          >
            <SeatBar title={lead.title} occupants={byTitle.get(lead.title)} tone={lead.tone} />
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${lead.columns.length}, minmax(0, 1fr))` }}>
              {lead.columns.map((col, i) => (
                <div key={i} className="flex flex-col gap-2">
                  {col.map((seat) => (
                    <Seat key={seat} title={seat} occupants={byTitle.get(seat)} tone={lead.tone} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="font-semibold text-ink">Quy tắc hiển thị: </span>
        <span className="font-semibold text-ink">Màu đen</span> = đã được duyệt;{" "}
        <span className="font-semibold text-warning">Họ &amp; tên màu cam</span> = chưa được duyệt.
      </div>
    </div>
  );
}

/** Full-width header bar for the chief / lead rows. */
function SeatBar({ title, occupants, tone }: { title: string; occupants?: ShiftAssignmentWithUser[]; tone: OrgTone | "chief" }) {
  const s = TONE_STYLES[tone];
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-center", s.bar)}>
      <div className={cn("text-xs font-semibold", s.title)}>{title}</div>
      <Occupants occupants={occupants} center />
    </div>
  );
}

/** A single member seat cell. */
function Seat({ title, occupants, tone }: { title: string; occupants?: ShiftAssignmentWithUser[]; tone: OrgTone }) {
  const s = TONE_STYLES[tone];
  return (
    <div className={cn("rounded-lg border px-2 py-2 text-center", s.cell)}>
      <div className={cn("text-[11px] font-semibold leading-tight", s.title)}>{title}</div>
      {occupants?.length ? (
        <Occupants occupants={occupants} />
      ) : (
        <div className="mt-1 text-[11px] text-muted-foreground/40">— trống —</div>
      )}
    </div>
  );
}

function Occupants({ occupants, center }: { occupants?: ShiftAssignmentWithUser[]; center?: boolean }) {
  if (!occupants?.length) {
    return center ? <div className="mt-0.5 text-[11px] text-muted-foreground/40">— trống —</div> : null;
  }
  return (
    <div className="mt-1 space-y-1.5">
      {occupants.map((o) => (
        <div key={o.id} className="flex flex-col items-center">
          <div className="mb-0.5 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-navy text-[10px] font-bold text-white">
            {o.user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.user.avatarUrl} alt={o.user.name} className="h-full w-full object-cover" />
            ) : (
              initials(o.user.name)
            )}
          </div>
          <span className={cn("text-xs font-bold leading-tight", o.isApproved ? "text-ink" : "text-warning")}>{o.user.name}</span>
          {o.user.phone && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Phone className="h-2.5 w-2.5" /> {o.user.phone}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
