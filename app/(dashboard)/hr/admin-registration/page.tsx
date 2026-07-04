"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, CalendarPlus, Check, CheckCircle2, Clock3, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { cn, formatDateInput, formatDate as formatVietnamDate, initials, parseDateInput } from "@/lib/utils";

const HC_SELF_PERIODS = [
  { value: "FULL_DAY", label: "Cả ngày" },
  { value: "MORNING", label: "Buổi sáng" },
  { value: "MORNING_OFF", label: "Ra ca sáng" },
  { value: "AFTERNOON", label: "Buổi chiều" },
] as const;
const HC_SELF_CONTENTS = HC_SELF_PERIODS.map((period) => `Hành chính - ${period.label}`);

function addCalendarDays(from: Date, days: number) {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function isBeforeRegistrationCutoff(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setHours(16, 30, 0, 0);
  return now.getTime() < cutoff.getTime();
}

function formatDateLabel(date: string) {
  return formatVietnamDate(parseDateInput(date));
}

function periodLabel(content: string) {
  return HC_SELF_PERIODS.find((period) => content === `Hành chính - ${period.label}`)?.label ?? "Hành chính";
}

function registrationDateKey(registration: HcRegistration) {
  return formatDateInput(parseDateInput(registration.group.date));
}

export default function AdministrativeRegistrationPage() {
  const { data: session } = useSession();
  const rbac = useRbacAccess();
  const myId = session?.user?.id;
  const canManage = rbac.can("hc-attendance-approve", ["approve", "manage", "full"]);
  const [now, setNow] = React.useState(() => new Date());
  const registrationOpen = isBeforeRegistrationCutoff(now);
  const minRegisterDate = React.useMemo(() => formatDateInput(addCalendarDays(new Date(), 2)), []);
  const checkIn = useHcCheckIn();
  const [registerDate, setRegisterDate] = React.useState(minRegisterDate);
  const [period, setPeriod] = React.useState<(typeof HC_SELF_PERIODS)[number]["value"]>("FULL_DAY");
  const [note, setNote] = React.useState("");
  const { data: groupsData } = useHcGroups(registerDate);
  const { data: registrationsData, isLoading: registrationsLoading } = useHcRegistrations(formatDateInput(new Date()));
  const myRegistration = React.useMemo(() => {
    const groups = groupsData?.data ?? [];
    return groups
      .filter((group) => HC_SELF_CONTENTS.includes(group.content))
      .flatMap((group) => group.members.map((member) => ({ group, member })))
      .find(({ member }) => member.userId === myId && member.isRegistered);
  }, [groupsData, myId]);

  React.useEffect(() => {
    if (!myRegistration) {
      setNote("");
      return;
    }
    const currentPeriod = HC_SELF_PERIODS.find((item) => myRegistration.group.content === `Hành chính - ${item.label}`);
    setPeriod(currentPeriod?.value ?? "FULL_DAY");
  }, [myRegistration]);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!registrationOpen) return toast.error("Chỉ được đăng ký đi hành chính trước 16h30");
    if (myRegistration) return toast.error("Cập nhật nội dung tại danh sách đăng ký phía dưới");
    try {
      await checkIn.mutateAsync({ date: registerDate, period, note });
      toast.success("Đã gửi đăng ký đi hành chính");
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
            <div className="max-w-3xl rounded-md bg-amber-50 px-3 py-1.5 text-xs leading-5 text-amber-900 ring-1 ring-amber-100">
              Đăng ký phải gửi trước 16h30. Sau khi gửi không thể tự hủy. Người có quyền duyệt có thể duyệt hoặc hủy đăng ký.
            </div>
          </div>
          <div className="flex shrink-0 justify-end gap-2">
            <Button asChild variant="outline">
              <Link href="/hr">Huỷ</Link>
            </Button>
            <Button type="submit" form="hc-registration-form" disabled={checkIn.isPending || !!myRegistration || !registrationOpen}>
              {checkIn.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {myRegistration ? "Đã đăng ký" : "Gửi đăng ký"}
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
                  placeholder="Nếu chưa được phân công thì để trống"
                  disabled={!!myRegistration}
                />
              </div>
            </div>
            {myRegistration && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {myRegistration.member.isApproved ? (
                  <Badge variant="accent" className="gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Đã duyệt
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" /> Chờ duyệt
                  </Badge>
                )}
                <span>Bạn đã đăng ký ngày này. Cập nhật nội dung tại danh sách đăng ký phía dưới.</span>
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
  const groups = React.useMemo(() => {
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
  }, [registrations]);

  return (
    <Card className="overflow-hidden">
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
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const approvedCount = registrations.filter((registration) => registration.isApproved).length;
  const pendingRegistrations = registrations.filter((registration) => !registration.isApproved);
  const editableRegistrations = registrations.filter((registration) => canManage || registration.userId === myId);
  const canEditNote = editableRegistrations.length > 0;

  React.useEffect(() => {
    setNotes(Object.fromEntries(registrations.map((registration) => [registration.id, registration.note ?? ""])));
  }, [registrations]);

  async function approveDateGroup() {
    try {
      const byGroup = new Map<string, string[]>();
      for (const registration of pendingRegistrations) {
        byGroup.set(registration.group.id, [...(byGroup.get(registration.group.id) ?? []), registration.id]);
      }
      for (const [groupId, ids] of byGroup) {
        await approve.mutateAsync({ groupId, ids });
      }
      toast.success("Đã duyệt đăng ký đi hành chính trong ngày");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function cancelDateGroup() {
    try {
      for (const registration of registrations) {
        await cancelRegistration.mutateAsync(registration.id);
      }
      toast.success("Đã hủy đăng ký đi hành chính trong ngày");
    } catch (err) {
      toast.error((err as Error).message);
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
        <Badge variant={pendingRegistrations.length ? "secondary" : "accent"} className="gap-1.5">
          {pendingRegistrations.length ? <Clock3 className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {pendingRegistrations.length ? `${pendingRegistrations.length} chờ duyệt` : "Đã duyệt"}
        </Badge>
        {approvedCount > 0 && pendingRegistrations.length > 0 && (
          <div className="text-xs font-medium text-accent">{approvedCount}/{registrations.length} đã duyệt</div>
        )}
        {(canManage || canEditNote) && (
          <div className="space-y-2 border-t border-dashed border-slate-200 pt-3">
            {canManage && pendingRegistrations.length > 0 && (
              <Button className="w-full justify-center" size="sm" variant="accent" onClick={approveDateGroup} disabled={approve.isPending}>
                {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Duyệt
              </Button>
            )}
            {canEditNote && (
              <Button className="w-full justify-center" size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Sửa nội dung
              </Button>
            )}
            {canManage && (
              <Button className="w-full justify-center" size="sm" variant="destructive" onClick={cancelDateGroup} disabled={cancelRegistration.isPending}>
                {cancelRegistration.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Hủy đăng ký
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3 min-[1800px]:grid-cols-4">
          {registrations.map((registration) => (
            <div key={registration.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start gap-3">
                {registration.user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={registration.user.avatarUrl} alt={registration.user.name} className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-border" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                    {initials(registration.user.name)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">{registration.user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{registration.user.position ?? "—"}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                      {periodLabel(registration.group.content)}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", registration.isApproved ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                      {registration.isApproved ? "Đã duyệt" : "Chờ duyệt"}
                    </span>
                  </div>
                </div>
              </div>
              <div className={cn("mt-2 rounded-md px-3 py-2 text-xs leading-5", registration.note ? "bg-amber-50 text-amber-950" : "bg-muted text-muted-foreground")}>
                {registration.note || "Chưa có nội dung công việc."}
              </div>
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

    </div>
  );
}
