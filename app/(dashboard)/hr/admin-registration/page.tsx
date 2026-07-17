"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Archive, ArrowLeft, CalendarPlus, Check, CheckCircle2, Clock3, Loader2, Pencil, Search, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useHcApprove,
  useHcCancelRegistration,
  useHcCheckIn,
  useHcGroups,
  useHcRegistrations,
  useHcUpdateRegistrationNote,
  type HcRegistration,
} from "@/hooks/useHcAttendance";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { hcRetentionDescription, hcRetentionStartInput } from "@/lib/hc-retention";
import { normalizeText } from "@/lib/nav";
import { cn, initials } from "@/lib/utils";

const HC_SELF_PERIODS = [
  { value: "FULL_DAY", label: "Cả ngày" },
  { value: "MORNING", label: "Buổi sáng" },
  { value: "MORNING_OFF", label: "Ra ca sáng" },
  { value: "AFTERNOON", label: "Buổi chiều" },
] as const;
const HC_SELF_CONTENTS = HC_SELF_PERIODS.map((period) => `Hành chính - ${period.label}`);
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

type CancelTarget =
  | { type: "reject"; registration: HcRegistration }
  | { type: "cancel"; registration: HcRegistration };

function registrationStatus(registration: Pick<HcRegistration, "registrationStatus" | "isApproved">) {
  return registration.registrationStatus || (registration.isApproved ? "APPROVED" : "PENDING");
}

function registrationStatusLabel(registration: Pick<HcRegistration, "registrationStatus" | "isApproved">) {
  const status = registrationStatus(registration);
  if (status === "APPROVED") return "Đã duyệt";
  if (status === "REJECTED") return "Không duyệt";
  if (status === "CANCELLED") return "Đã hủy";
  return "Chờ duyệt";
}

function registrationStatusClass(registration: Pick<HcRegistration, "registrationStatus" | "isApproved">) {
  const status = registrationStatus(registration);
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "bg-red-50 text-red-700";
  if (status === "CANCELLED") return "bg-slate-200 text-slate-700";
  return "bg-amber-50 text-amber-700";
}

function vietnamDateInput(date: Date | string = new Date()) {
  const value = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addCalendarDays(dateInput: string, days: number) {
  const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateInput;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function isBeforeRegistrationCutoff(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VIETNAM_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(map.hour) * 60 + Number(map.minute) < 16 * 60 + 30;
}

function formatDateLabel(date: string) {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function periodLabel(content: string) {
  return HC_SELF_PERIODS.find((period) => content === `Hành chính - ${period.label}`)?.label ?? "Hành chính";
}

function registrationDateKey(registration: HcRegistration) {
  return vietnamDateInput(registration.group.date);
}

function groupedRegistrations(registrations: HcRegistration[]) {
  const map = new Map<string, HcRegistration[]>();
  for (const registration of registrations) {
    const key = registrationDateKey(registration);
    const items = map.get(key) ?? [];
    items.push(registration);
    map.set(key, items);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      registrations: items.sort((a, b) => {
        const periodOrder = periodLabel(a.group.content).localeCompare(periodLabel(b.group.content), "vi");
        if (periodOrder !== 0) return periodOrder;
        return a.user.name.localeCompare(b.user.name, "vi");
      }),
    }));
}

export default function AdministrativeRegistrationPage() {
  const { data: session } = useSession();
  const rbac = useRbacAccess();
  const myId = session?.user?.id;
  const canManage = rbac.can("hc-attendance-approve", ["approve", "manage", "full"]);
  const [now, setNow] = React.useState(() => new Date());
  const registrationOpen = isBeforeRegistrationCutoff(now);
  const today = React.useMemo(() => vietnamDateInput(now), [now]);
  const minRegisterDate = React.useMemo(() => addCalendarDays(today, 2), [today]);
  const historyFrom = React.useMemo(() => hcRetentionStartInput(now), [now]);
  const historyTo = React.useMemo(() => addCalendarDays(today, -1), [today]);
  const checkIn = useHcCheckIn();
  const [registerDate, setRegisterDate] = React.useState(minRegisterDate);
  const [period, setPeriod] = React.useState<(typeof HC_SELF_PERIODS)[number]["value"]>("FULL_DAY");
  const [note, setNote] = React.useState("");
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const { data: groupsData } = useHcGroups(registerDate);
  const { data: registrationsData, isLoading: registrationsLoading } = useHcRegistrations(today);
  const { data: historyData, isLoading: historyLoading } = useHcRegistrations(historyFrom, historyTo);
  const myDayRegistration = React.useMemo(() => {
    const groups = groupsData?.data ?? [];
    return groups
      .filter((group) => HC_SELF_CONTENTS.includes(group.content))
      .flatMap((group) => group.members.map((member) => ({ group, member })))
      .find(({ member }) => member.userId === myId && member.isRegistered);
  }, [groupsData, myId]);
  const myRegistration = myDayRegistration && ["PENDING", "APPROVED"].includes(registrationStatus(myDayRegistration.member))
    ? myDayRegistration
    : undefined;
  const canResubmit = myDayRegistration?.member.registrationStatus === "CANCELLED"
    || (myDayRegistration?.member.registrationStatus === "REJECTED" && myDayRegistration.member.rejectionCount < 2);
  const resubmitBlocked = myDayRegistration?.member.registrationStatus === "REJECTED" && myDayRegistration.member.rejectionCount >= 2;

  React.useEffect(() => {
    if (!myDayRegistration) {
      setNote("");
      return;
    }
    const currentPeriod = HC_SELF_PERIODS.find((item) => myDayRegistration.group.content === `Hành chính - ${item.label}`);
    setPeriod(currentPeriod?.value ?? "FULL_DAY");
    setNote(canResubmit ? myDayRegistration.member.note ?? "" : "");
  }, [canResubmit, myDayRegistration]);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (registerDate < minRegisterDate) setRegisterDate(minRegisterDate);
  }, [minRegisterDate, registerDate]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!registrationOpen) return toast.error("Chỉ được đăng ký đi hành chính trước 16h30");
    if (myRegistration) return toast.error("Cập nhật nội dung tại danh sách đăng ký phía dưới");
    if (resubmitBlocked) return toast.error("Đăng ký ngày này không thể gửi lại");
    try {
      await checkIn.mutateAsync({ date: registerDate, period, note });
      toast.success(canResubmit ? "Đã gửi lại đăng ký đi hành chính" : "Đã gửi đăng ký đi hành chính");
      setNote("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/hr" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Lịch làm việc
      </Link>

      <PageHeader title="ĐĂNG KÝ ĐI HÀNH CHÍNH" description="Gửi đăng ký trước tối thiểu 2 ngày, trước 16h30 và chờ người có quyền duyệt" />

      <Card className="overflow-hidden">
        <CardHeader className="grid gap-3 border-b border-border lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0 space-y-2">
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-accent" /> Thông tin đăng ký
            </CardTitle>
            <div className="max-w-3xl space-y-1 rounded-md bg-amber-50 px-3 py-1.5 text-xs leading-5 text-amber-900 ring-1 ring-amber-100">
              <p>Đăng ký phải gửi trước 16h30. Sau khi gửi không thể tự hủy. Người có quyền duyệt có thể duyệt hoặc hủy đăng ký.</p>
              <p>Đọc kỹ và thực hiện đúng theo ô nội dung công việc.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
              <Archive className="h-4 w-4" /> Kho lưu trữ
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{historyData?.data.length ?? 0}</Badge>
            </Button>
            <Button type="submit" form="hc-registration-form" disabled={checkIn.isPending || !!myRegistration || !!resubmitBlocked || !registrationOpen}>
              {checkIn.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {myRegistration ? "Đã đăng ký" : resubmitBlocked ? "Không thể đăng ký lại" : canResubmit ? "Đăng ký lại" : "Gửi đăng ký"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <form id="hc-registration-form" onSubmit={save} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[220px_220px_1fr]">
              <div>
                <Label className="mb-1.5 block text-muted-foreground">Ngày đăng ký</Label>
                <Input
                  type="date"
                  value={registerDate}
                  min={minRegisterDate}
                  onChange={(e) => {
                    setRegisterDate(e.target.value);
                    setNote("");
                  }}
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-muted-foreground">Buổi</Label>
                <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)} disabled={!!myRegistration}>
                  <SelectTrigger><SelectValue placeholder="Chọn buổi" /></SelectTrigger>
                  <SelectContent>
                    {HC_SELF_PERIODS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-muted-foreground">Nội dung công việc</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Chỉ điền nội dung khi đã được phân công, và ghi rõ tên Người phân công công việc. Nếu chưa được phân công thì để trống"
                  disabled={!!myRegistration}
                />
              </div>
            </div>
            {myRegistration && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {registrationStatus(myRegistration.member) === "APPROVED" ? (
                  <Badge variant="accent" className="gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Đã duyệt
                  </Badge>
                ) : registrationStatus(myRegistration.member) === "REJECTED" ? (
                  <Badge variant="secondary" className="gap-1.5 bg-red-50 text-red-700"><X className="h-3.5 w-3.5" /> Không duyệt</Badge>
                ) : registrationStatus(myRegistration.member) === "CANCELLED" ? (
                  <Badge variant="secondary" className="gap-1.5"><X className="h-3.5 w-3.5" /> Đã hủy</Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" /> Chờ duyệt
                  </Badge>
                )}
                <span>Bạn đã đăng ký ngày này. Cập nhật nội dung tại danh sách đăng ký phía dưới.</span>
              </div>
            )}
            {canResubmit && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {myDayRegistration?.member.registrationStatus === "CANCELLED"
                  ? "Đăng ký đã bị hủy. Bạn có thể điều chỉnh nội dung công việc và đăng ký lại."
                  : "Đăng ký chưa được duyệt lần đầu. Bạn có thể điều chỉnh nội dung công việc và đăng ký lại một lần."}
              </div>
            )}
            {resubmitBlocked && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                Đăng ký ngày này đã không được duyệt 2 lần và không thể đăng ký lại.
              </div>
            )}
            {!registrationOpen && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                Đã quá 16h30, không thể gửi đăng ký đi hành chính mới trong hôm nay.
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <RegistrationList
        registrations={registrationsData?.data ?? []}
        isLoading={registrationsLoading}
        canManage={canManage}
        myId={myId}
      />
      <RegistrationHistoryList
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        registrations={historyData?.data ?? []}
        isLoading={historyLoading}
        from={historyFrom}
        to={historyTo}
      />
    </div>
  );
}

function RegistrationList({
  registrations,
  isLoading,
  canManage,
  myId,
}: {
  registrations: HcRegistration[];
  isLoading: boolean;
  canManage: boolean;
  myId?: string;
}) {
  const groups = React.useMemo(() => groupedRegistrations(registrations), [registrations]);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="border-b border-border">
        <CardTitle>Danh sách đăng ký ({registrations.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Đang tải danh sách đăng ký...</div>
        ) : registrations.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Chưa có đăng ký đi hành chính.</div>
        ) : (
          <div className="divide-y divide-border">
            {groups.map((group) => (
              <RegistrationDateRow key={group.date} date={group.date} registrations={group.registrations} canManage={canManage} myId={myId} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RegistrationHistoryList({
  open,
  onOpenChange,
  registrations,
  isLoading,
  from,
  to,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrations: HcRegistration[];
  isLoading: boolean;
  from: string;
  to: string;
}) {
  const [search, setSearch] = React.useState("");
  const filteredRegistrations = React.useMemo(() => {
    const q = normalizeText(search);
    if (!q) return registrations;
    return registrations.filter((registration) => normalizeText(registration.note ?? "").includes(q));
  }, [registrations, search]);
  const groups = React.useMemo(() => groupedRegistrations(filteredRegistrations).reverse(), [filteredRegistrations]);
  const hasValidRange = from <= to;

  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-accent" /> Kho lưu trữ đăng ký đi hành chính
            </DialogTitle>
            <DialogDescription>
              {hasValidRange ? `Từ ${formatDateLabel(from)} đến ${formatDateLabel(to)}. ` : ""}
              {hcRetentionDescription()}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:w-96">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo nội dung công việc..."
                className="pl-9"
              />
            </div>
            <div className="text-xs font-medium text-muted-foreground">
              Hiển thị {filteredRegistrations.length}/{registrations.length} bản ghi
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">Đang tải lịch sử đăng ký...</div>
          ) : !hasValidRange || registrations.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">Chưa có lịch sử đăng ký trong kỳ lưu trữ.</div>
          ) : filteredRegistrations.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">Không tìm thấy nội dung công việc phù hợp.</div>
          ) : (
            <div className="max-h-[58vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
              {groups.map((group) => (
                <div key={group.date} className="space-y-3 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-ink">{formatDateLabel(group.date)}</div>
                      <div className="text-xs text-muted-foreground">{group.registrations.length} nhân sự đăng ký</div>
                    </div>
                    <Badge variant={group.registrations.every((registration) => registration.isApproved) ? "accent" : "secondary"} className="gap-1.5">
                      {group.registrations.every((registration) => registration.isApproved) ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                      {group.registrations.every((registration) => registration.isApproved) ? "Đã duyệt" : "Có chờ duyệt"}
                    </Badge>
                  </div>
                  <div className="grid gap-2 lg:grid-cols-2">
                    {group.registrations.map((registration) => (
                      <div key={registration.id} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-ink">{registration.user.name}</div>
                            <div className="truncate text-xs text-muted-foreground">{registration.user.position ?? "—"}</div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                              {periodLabel(registration.group.content)}
                            </span>
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", registrationStatusClass(registration))}>
                              {registrationStatusLabel(registration)}
                            </span>
                          </div>
                        </div>
                        <div className={cn("mt-2 rounded-md px-2.5 py-1.5 text-xs leading-5", registration.note ? "bg-amber-50 text-amber-950" : "bg-muted text-muted-foreground")}>
                          {registration.note || "Chưa có nội dung công việc."}
                        </div>
                        {registrationStatus(registration) === "CANCELLED" && registration.cancellationReason && (
                          <div className="mt-2 rounded-md border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs leading-5 text-red-800">
                            <span className="font-semibold">Lý do hủy:</span> {registration.cancellationReason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
  );
}

function RegistrationDateRow({
  date,
  registrations,
  canManage,
  myId,
}: {
  date: string;
  registrations: HcRegistration[];
  canManage: boolean;
  myId?: string;
}) {
  const approve = useHcApprove();
  const cancelRegistration = useHcCancelRegistration();
  const updateNote = useHcUpdateRegistrationNote();
  const [editing, setEditing] = React.useState(false);
  const [reviewMode, setReviewMode] = React.useState(false);
  const [reviewingId, setReviewingId] = React.useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<CancelTarget | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [reviewNote, setReviewNote] = React.useState("");
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const approvedCount = registrations.filter((registration) => registrationStatus(registration) === "APPROVED").length;
  const pendingRegistrations = registrations.filter((registration) => registrationStatus(registration) === "PENDING");
  const completedWithOtherStatus = registrations.length - approvedCount - pendingRegistrations.length;
  const editableRegistrations = registrations.filter((registration) =>
    registrationStatus(registration) === "PENDING" && (canManage || registration.userId === myId)
  );
  const canEditNote = editableRegistrations.length > 0;

  React.useEffect(() => {
    setNotes(Object.fromEntries(registrations.map((registration) => [registration.id, registration.note ?? ""])));
  }, [registrations]);

  async function approveRegistration(registration: HcRegistration) {
    try {
      setReviewingId(registration.id);
      await approve.mutateAsync({ groupId: registration.group.id, ids: [registration.id] });
      toast.success(`Đã duyệt đăng ký của ${registration.user.name}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReviewingId(null);
    }
  }

  async function rejectRegistration(registration: HcRegistration, nextNote: string) {
    try {
      setReviewingId(registration.id);
      await cancelRegistration.mutateAsync({ checkInId: registration.id, action: "REJECT", note: nextNote });
      toast.success(`Đã không duyệt đăng ký của ${registration.user.name}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReviewingId(null);
    }
  }

  async function approveFromReview(registration: HcRegistration) {
    try {
      setReviewingId(registration.id);
      await approve.mutateAsync({ groupId: registration.group.id, ids: [registration.id], note: reviewNote });
      toast.success(`Đã duyệt đăng ký của ${registration.user.name}`);
      setCancelTarget(null);
      setReviewNote("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReviewingId(null);
    }
  }

  async function cancelRegistrationItem(registration: HcRegistration, reason: string) {
    try {
      setReviewingId(registration.id);
      await cancelRegistration.mutateAsync({ checkInId: registration.id, action: "CANCEL", reason });
      toast.success(`Đã hủy đăng ký của ${registration.user.name}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReviewingId(null);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    if (cancelTarget.type === "reject") {
      await rejectRegistration(cancelTarget.registration, reviewNote.trim());
      setCancelTarget(null);
      setReviewNote("");
      return;
    }
    if (cancelTarget.type === "cancel") {
      const reason = cancelReason.trim();
      await cancelRegistrationItem(cancelTarget.registration, reason);
      setCancelTarget(null);
      setCancelReason("");
      return;
    }
  }

  async function saveNotes() {
    try {
      for (const registration of editableRegistrations) {
        await updateNote.mutateAsync({ groupId: registration.group.id, id: registration.id, note: notes[registration.id] ?? "" });
      }
      toast.success("Đã cập nhật nội dung công việc");
      setEditing(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[170px_minmax(0,1fr)] xl:items-start">
      <div className="space-y-2">
        <div>
          <div className="text-base font-bold text-ink">{formatDateLabel(date)}</div>
          <div className="text-xs text-muted-foreground">{registrations.length} nhân sự đăng ký</div>
        </div>
        <Badge variant={pendingRegistrations.length || completedWithOtherStatus ? "secondary" : "accent"} className="gap-1.5">
          {pendingRegistrations.length ? <Clock3 className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {pendingRegistrations.length ? `${pendingRegistrations.length} chờ duyệt` : completedWithOtherStatus ? "Đã xử lý" : "Đã duyệt"}
        </Badge>
        {approvedCount > 0 && pendingRegistrations.length > 0 && (
          <div className="text-xs font-medium text-accent">{approvedCount}/{registrations.length} đã duyệt</div>
        )}
        {(canManage || canEditNote) && (
          <div className="space-y-2 border-t border-dashed border-slate-200 pt-3">
            {canManage && pendingRegistrations.length > 0 && (
              <Button className="w-full justify-center" size="sm" variant={reviewMode ? "outline" : "accent"} onClick={() => setReviewMode((open) => !open)}>
                <Check className="h-4 w-4" /> {reviewMode ? "Ẩn duyệt" : "Duyệt/Không duyệt"}
              </Button>
            )}
            {canEditNote && (
              <Button className="w-full justify-center" size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Sửa nội dung
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
          {registrations.map((registration) => (
            <div key={registration.id} className="relative min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              {canManage && reviewMode && registrationStatus(registration) === "PENDING" && (
                <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => approveRegistration(registration)}
                    disabled={registration.isApproved || reviewingId === registration.id}
                    title={registration.isApproved ? "Đã duyệt" : "Duyệt đăng ký"}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-emerald-300",
                      registration.isApproved
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-white text-emerald-600 ring-1 ring-emerald-200 hover:bg-emerald-500 hover:text-white hover:shadow-md",
                      reviewingId === registration.id && "cursor-wait opacity-60"
                    )}
                  >
                    {reviewingId === registration.id && approve.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setReviewNote(registration.note ?? ""); setCancelTarget({ type: "reject", registration }); }}
                    disabled={reviewingId === registration.id}
                    title="Không duyệt đăng ký"
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full bg-white text-red-600 ring-1 ring-red-200 transition-all hover:bg-red-500 hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-300",
                      reviewingId === registration.id && "cursor-wait opacity-60"
                    )}
                  >
                    {reviewingId === registration.id && cancelRegistration.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                </div>
              )}
              {canManage && !reviewMode && ["PENDING", "APPROVED"].includes(registrationStatus(registration)) && (
                <button
                  type="button"
                  onClick={() => setCancelTarget({ type: "cancel", registration })}
                  disabled={reviewingId === registration.id}
                  title={`Hủy đăng ký của ${registration.user.name}`}
                  className={cn(
                    "absolute right-3 top-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-full border border-red-200 bg-white/95 px-2.5 text-xs font-semibold text-red-600 shadow-sm transition-all hover:bg-red-500 hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-300",
                    reviewingId === registration.id && "cursor-wait opacity-60"
                  )}
                >
                  {reviewingId === registration.id && cancelRegistration.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  Hủy
                </button>
              )}
              <div className="flex items-start gap-3">
                {registration.user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={registration.user.avatarUrl} alt={registration.user.name} className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-border" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                    {initials(registration.user.name)}
                  </div>
                )}
                <div className={cn("min-w-0 flex-1", canManage && (reviewMode ? "pr-16" : "pr-20"))}>
                  <div className="truncate font-semibold text-ink">{registration.user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{registration.user.position ?? "—"}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                      {periodLabel(registration.group.content)}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", registrationStatusClass(registration))}>
                      {registrationStatusLabel(registration)}
                    </span>
                  </div>
                </div>
              </div>
              <div className={cn("mt-2 rounded-md px-3 py-2 text-xs leading-5", registration.note ? "bg-amber-50 text-amber-950" : "bg-muted text-muted-foreground")}>
                {registration.note || "Chưa có nội dung công việc."}
              </div>
              {registrationStatus(registration) === "CANCELLED" && registration.cancellationReason && (
                <div className="mt-2 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
                  <span className="font-semibold">Lý do hủy:</span> {registration.cancellationReason}
                </div>
              )}
            </div>
          ))}
        </div>

        {editing ? (
          <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-3">
            <div className="grid gap-3 lg:grid-cols-2">
              {editableRegistrations.map((registration) => (
                <div key={registration.id} className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">{registration.user.name}</Label>
                  <Textarea
                    value={notes[registration.id] ?? ""}
                    onChange={(e) => setNotes((state) => ({ ...state, [registration.id]: e.target.value }))}
                    rows={3}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={saveNotes} disabled={updateNote.isPending}>
                {updateNote.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu nội dung
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Huỷ</Button>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog
        open={cancelTarget?.type === "reject"}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setReviewNote("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Duyệt/Không duyệt đăng ký</DialogTitle>
            <DialogDescription>
              {cancelTarget?.type === "reject"
                ? `Có thể thay đổi nội dung công việc của ${cancelTarget.registration.user.name} trước khi quyết định.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`review-note-${date}`}>Thay đổi nội dung công việc</Label>
            <Textarea
              id={`review-note-${date}`}
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Nhập nội dung công việc muốn phân công..."
              rows={5}
              autoFocus
            />
            {cancelTarget?.type === "reject" && (
              <p className="text-xs leading-5 text-muted-foreground">
                Không duyệt lần đầu: người đăng ký được gửi lại một lần. Không duyệt lần hai: không thể đăng ký lại ngày này.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={approve.isPending || cancelRegistration.isPending}>Đóng</Button>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={confirmCancel}
                disabled={approve.isPending || cancelRegistration.isPending}
              >
                {cancelRegistration.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Không duyệt
              </Button>
              <Button
                onClick={() => cancelTarget?.type === "reject" && approveFromReview(cancelTarget.registration)}
                disabled={approve.isPending || cancelRegistration.isPending}
              >
                {approve.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Duyệt
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={cancelTarget?.type === "cancel"}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hủy đăng ký đi hành chính</DialogTitle>
            <DialogDescription>
              {cancelTarget?.type === "cancel" ? `Xác nhận hủy đăng ký của ${cancelTarget.registration.user.name}. Có thể ghi thêm lý do nếu cần.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`cancel-reason-${date}`}>Lý do hủy (nếu có)</Label>
            <Textarea
              id={`cancel-reason-${date}`}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Nhập lý do hủy đăng ký nếu có..."
              rows={4}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelRegistration.isPending}>Không hủy</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancelRegistration.isPending}>
              {cancelRegistration.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
