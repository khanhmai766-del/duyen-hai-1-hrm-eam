"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
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
import { apiGet } from "@/lib/fetcher";
import { cn, initials } from "@/lib/utils";

const HC_SELF_PERIODS = [
  { value: "FULL_DAY", label: "Cả ngày" },
  { value: "MORNING", label: "Buổi sáng" },
  { value: "MORNING_OFF", label: "Ra ca sáng" },
  { value: "AFTERNOON", label: "Buổi chiều" },
] as const;
const HC_SELF_CONTENTS = HC_SELF_PERIODS.map((period) => `Hành chính - ${period.label}`);
const APPROVE_PERMISSION_ID = "shift-operation-approve";
const APPROVE_PERMISSION_VALUES = new Set(["approve", "manage", "full"]);

interface RbacConfig {
  permissions?: Array<{ id: string; matrix?: Record<string, string> }>;
  userOverrides?: Array<{ userId: string; permissionId: string; roleId?: string; value?: string }>;
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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
  return new Date(date).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function periodLabel(content: string) {
  return HC_SELF_PERIODS.find((period) => content === `Hành chính - ${period.label}`)?.label ?? "Hành chính";
}

function hasAssignedApprovePermission(config: RbacConfig | undefined, userId: string | undefined, role: string | undefined) {
  if (!config || !userId) return false;
  const permission = config.permissions?.find((item) => item.id === APPROVE_PERMISSION_ID);
  if (APPROVE_PERMISSION_VALUES.has(permission?.matrix?.[role ?? ""] ?? "none")) return true;
  return (config.userOverrides ?? []).some((override) => {
    if (override.userId !== userId) return false;
    if (override.permissionId === APPROVE_PERMISSION_ID) return APPROVE_PERMISSION_VALUES.has(override.value ?? "none");
    if (override.permissionId !== "__ROLE_PROFILE__" || !override.roleId) return false;
    return APPROVE_PERMISSION_VALUES.has(override.value ?? "none") || APPROVE_PERMISSION_VALUES.has(permission?.matrix?.[override.roleId] ?? "none");
  });
}

export default function AdministrativeRegistrationPage() {
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const rbacQuery = useQuery({
    queryKey: ["rbac-config"],
    queryFn: () => apiGet<RbacConfig>("/api/rbac"),
    enabled: !!session?.user,
  });
  const canManage =
    ["ADMIN", "TECHNICIAN"].includes(session?.user?.role ?? "") ||
    hasAssignedApprovePermission(rbacQuery.data?.data, myId, session?.user?.role);
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
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-accent" /> Thông tin đăng ký
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={save} className="space-y-4">
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
            <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Đăng ký phải gửi trước 16h30. Sau khi gửi không thể tự hủy. Người có quyền duyệt có thể duyệt hoặc hủy đăng ký.
            </div>
            {!registrationOpen && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                Đã quá 16h30, không thể gửi đăng ký đi hành chính mới trong hôm nay.
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button asChild variant="outline">
                <Link href="/hr">Huỷ</Link>
              </Button>
              <Button type="submit" disabled={checkIn.isPending || !!myRegistration || !registrationOpen}>
                {checkIn.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {myRegistration ? "Đã đăng ký" : "Gửi đăng ký"}
              </Button>
            </div>
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
            {registrations.map((registration) => (
              <RegistrationRow key={registration.id} registration={registration} canManage={canManage} myId={myId} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RegistrationRow({ registration, canManage, myId }: { registration: HcRegistration; canManage: boolean; myId?: string }) {
  const approve = useHcApprove();
  const cancelRegistration = useHcCancelRegistration();
  const updateNote = useHcUpdateRegistrationNote();
  const [editing, setEditing] = React.useState(false);
  const [note, setNote] = React.useState(registration.note ?? "");

  React.useEffect(() => {
    setNote(registration.note ?? "");
  }, [registration.note]);

  async function approveOne() {
    try {
      await approve.mutateAsync({ groupId: registration.group.id, ids: [registration.id] });
      toast.success("Đã duyệt đăng ký đi hành chính");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function cancelOne() {
    try {
      await cancelRegistration.mutateAsync(registration.id);
      toast.success("Đã hủy đăng ký đi hành chính");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function saveNote() {
    try {
      await updateNote.mutateAsync({ groupId: registration.group.id, id: registration.id, note });
      toast.success("Đã cập nhật nội dung công việc");
      setEditing(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  const canEditNote = canManage || registration.userId === myId;

  return (
    <div className="grid gap-3 p-4 lg:grid-cols-[150px_1fr_auto] lg:items-start">
      <div>
        <div className="text-sm font-semibold text-ink">{formatDateLabel(registration.group.date)}</div>
        <div className="text-xs text-accent">{periodLabel(registration.group.content)}</div>
        <Badge variant={registration.isApproved ? "accent" : "secondary"} className="mt-2 gap-1.5">
          {registration.isApproved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
          {registration.isApproved ? "Đã duyệt" : "Chờ duyệt"}
        </Badge>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-3">
          {registration.user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={registration.user.avatarUrl} alt={registration.user.name} className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-border" />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
              {initials(registration.user.name)}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink">{registration.user.name}</div>
            <div className="truncate text-xs text-muted-foreground">{registration.user.position ?? "—"}</div>
          </div>
        </div>

        {editing ? (
          <div className="mt-3 space-y-2">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={saveNote} disabled={updateNote.isPending}>
                {updateNote.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu nội dung
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Huỷ</Button>
            </div>
          </div>
        ) : (
          <div className={cn("mt-3 rounded-md px-3 py-2 text-sm", registration.note ? "bg-amber-50 text-amber-950" : "bg-muted text-muted-foreground")}>
            {registration.note || "Chưa có nội dung công việc."}
          </div>
        )}
      </div>

      {(canManage || canEditNote) && (
        <div className="flex flex-wrap gap-2 lg:w-40 lg:flex-col">
          {canManage && !registration.isApproved && (
            <Button size="sm" variant="accent" onClick={approveOne} disabled={approve.isPending}>
              {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Duyệt
            </Button>
          )}
          {canEditNote && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Sửa nội dung
            </Button>
          )}
          {canManage && (
            <Button size="sm" variant="destructive" onClick={cancelOne} disabled={cancelRegistration.isPending}>
              {cancelRegistration.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Hủy đăng ký
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
