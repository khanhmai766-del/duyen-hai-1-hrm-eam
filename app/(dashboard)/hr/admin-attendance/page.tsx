"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Plus, Trash2, ArrowLeft, Check, Loader2, UserCheck, UserMinus, ClipboardCheck, ChevronDown, Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  useHcGroups, useCreateHcGroup, useUpdateHcGroup, useDeleteHcGroup,
  useHcCheckIn, useHcRecall, useHcApprove, type HcGroup,
} from "@/hooks/useHcAttendance";
import { cn, initials } from "@/lib/utils";
import { HC_PERIOD_LABEL, normalizeHcPeriod } from "@/lib/hc-period";

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8];
const HC_SELF_PERIODS = [
  { value: "FULL_DAY", label: "Cả ngày", hours: 8, cutoff: "Trước 08h00" },
  { value: "MORNING", label: "Buổi sáng", hours: 4, cutoff: "Trước 08h00" },
  { value: "AFTERNOON", label: "Buổi chiều", hours: 4, cutoff: "Trước 13h30" },
  { value: "MORNING_OFF", label: "Ra ca sáng", hours: 3, cutoff: "Trước 14h30" },
] as const;
const HC_SELF_CONTENTS = HC_SELF_PERIODS.map((p) => `Hành chính - ${p.label}`);
const HC_RECALL_WINDOW_MS = 30 * 60 * 1000;
const MANAGED_GROUP_PERIODS: Array<{ value: "FULL_DAY" | "MORNING" | "AFTERNOON"; label: string }> = [
  { value: "FULL_DAY", label: "Cả ngày" },
  { value: "MORNING", label: "Buổi sáng" },
  { value: "AFTERNOON", label: "Buổi chiều" },
];

function isSelfHcGroup(group: HcGroup) {
  return HC_SELF_CONTENTS.includes(group.content);
}

function periodLabel(content: string) {
  return HC_SELF_PERIODS.find((p) => content === `Hành chính - ${p.label}`)?.label ?? "Hành chính";
}

function canRecallHcCheckIn(member?: { isRegistered?: boolean; createdAt?: string; updatedAt?: string } | null) {
  if (!member || member.isRegistered) return false;
  const markedAt = new Date(member.updatedAt || member.createdAt || "");
  if (Number.isNaN(markedAt.getTime())) return false;
  return Date.now() - markedAt.getTime() <= HC_RECALL_WINDOW_MS;
}

export default function AdminAttendancePage() {
  const { data: session } = useSession();
  const canManage = ["ADMIN", "SUPERVISOR"].includes(session?.user?.role ?? "");
  const myId = session?.user?.id;

  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [addOpen, setAddOpen] = React.useState(false);
  const [selfCheckInOpen, setSelfCheckInOpen] = React.useState(false);

  const { data, isLoading } = useHcGroups(date);
  const groups = data?.data ?? [];
  const selfHcGroups = groups.filter(isSelfHcGroup);
  const managedGroups = groups.filter((g) => !isSelfHcGroup(g));

  return (
    <div className="space-y-6">
      <Link href="/hr" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Quản lý nhân sự / Ca vận hành
      </Link>

      <PageHeader title="QUẢN LÝ HÀNH CHÍNH" description="Theo dõi nhân viên đi hành chính — dữ liệu lưu 1 tháng gần nhất">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Thời gian</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <Button variant="accent" onClick={() => setSelfCheckInOpen(true)} disabled={isLoading}>
          <UserCheck className="h-4 w-4" /> Chấm công hành chính
        </Button>
        {canManage && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Thêm nhóm
          </Button>
        )}
      </PageHeader>

      {isLoading ? (
        <CardSkeleton />
      ) : (
        <div className="space-y-4">
          <HanhChinhCard groups={selfHcGroups} myId={myId} />
          {managedGroups.map((g) => (
            <GroupCard key={g.id} group={g} canManage={canManage} myId={myId} />
          ))}
        </div>
      )}

      <GroupDialog open={addOpen} onOpenChange={setAddOpen} date={date} />
      <SelfAdministrativeCheckInDialog
        open={selfCheckInOpen}
        onOpenChange={setSelfCheckInOpen}
        date={date}
        groups={selfHcGroups}
        myId={myId}
      />
    </div>
  );
}

/* ---- Daily administrative attendance summary ---- */
function HanhChinhCard({ groups, myId }: { groups: HcGroup[]; myId?: string }) {
  const recall = useHcRecall();
  const entries = groups.flatMap((group) =>
    group.members
      .map((member) => ({
        ...member,
        groupId: group.id,
        period: periodLabel(group.content),
      }))
  );

  async function doRecall(groupId: string) {
    try {
      await recall.mutateAsync(groupId);
      toast.success("Đã thu hồi điểm danh hành chính");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <div className="font-semibold text-ink">Hành chính</div>
          <div className="text-xs text-muted-foreground">Nhân viên đi hành chính trong ngày</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={entries.length > 0 ? "accent" : "secondary"} className="gap-1.5">
            <UserCheck className="h-3.5 w-3.5" /> {entries.length} đã ghi nhận
          </Badge>
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          Chưa có ai đi hành chính hôm nay.
        </div>
      ) : (
        <div className="flex flex-wrap gap-4 p-4">
          {entries.map((m) => (
            <div key={m.id} className="flex w-40 flex-col items-center text-center">
              <div className="relative h-14 w-14">
                <div className={cn(
                  "flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-white ring-2",
                  m.isApproved ? "ring-emerald-400" : "ring-border"
                )}>
                  {m.user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.user.avatarUrl} alt={m.user.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-navy">{initials(m.user.name)}</span>
                  )}
                </div>
                {m.isApproved && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </div>
              <div className="mt-1.5 line-clamp-2 text-xs font-medium text-ink">{m.user.name}</div>
              <div className="text-[11px] text-accent">{m.period}</div>
              {m.isRegistered && (
                <Badge variant={m.isApproved ? "accent" : "secondary"} className="mt-1 text-[10px]">
                  {m.isApproved ? "Đã duyệt" : "Chờ duyệt"}
                </Badge>
              )}
              {m.note && (
                <div className="mt-2 w-full rounded-md bg-amber-50 px-2 py-1.5 text-left text-[11px] leading-4 text-amber-900">
                  <span className="block whitespace-pre-wrap break-words">{m.note}</span>
                </div>
              )}
              {m.userId === myId && !m.isRegistered && (
                canRecallHcCheckIn(m) ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => doRecall(m.groupId)}
                    disabled={recall.isPending}
                    className="mt-2 h-7 px-2 text-[11px]"
                  >
                    {recall.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />}
                    Thu hồi
                  </Button>
                ) : (
                  <div className="mt-2 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">
                    Quá 30 phút
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---- One administrative group ---- */
function GroupCard({ group, canManage, myId }: { group: HcGroup; canManage: boolean; myId?: string }) {
  const approve = useHcApprove();
  const checkIn = useHcCheckIn();
  const recall = useHcRecall();
  const del = useDeleteHcGroup();
  const [editOpen, setEditOpen] = React.useState(false);
  const [checkInOpen, setCheckInOpen] = React.useState(false);

  const approved = group.members.filter((m) => m.isApproved).length;
  const mine = group.members.find((m) => m.userId === myId);
  const canRecallMine = canRecallHcCheckIn(mine);

  async function doApprove() {
    if (!group.members.length) return toast.error("Nhóm chưa có ai điểm danh");
    try {
      const r = await approve.mutateAsync({ groupId: group.id });
      toast.success(`Đã duyệt chấm công (${(r as any).approved})`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function doRecall() {
    try {
      await recall.mutateAsync(group.id);
      toast.success("Đã thu hồi điểm danh");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function doDelete() {
    try {
      await del.mutateAsync(group.id);
      toast.success("Đã xoá nhóm đi hành chính");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <div className="font-semibold text-ink">
            Chủ trì {group.createdBy.name} · {group.content}
          </div>
          <div className="text-xs text-muted-foreground">
            {HC_PERIOD_LABEL[normalizeHcPeriod(group.period)]} · {group.hours} giờ
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={approved === group.members.length && group.members.length > 0 ? "accent" : "secondary"} className="gap-1.5">
            <Check className="h-3.5 w-3.5" /> {approved}/{group.members.length} đã duyệt
          </Badge>
          {canManage && (
            <Button size="sm" onClick={doApprove} disabled={approve.isPending}
              className="bg-amber-400 text-amber-950 hover:bg-amber-500">
              {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              Duyệt chấm công
            </Button>
          )}
          {mine ? (
            <Button size="sm" variant="destructive" onClick={doRecall} disabled={recall.isPending || !canRecallMine}>
              {recall.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
              {canRecallMine ? "Thu hồi điểm danh" : "Quá 30 phút"}
            </Button>
          ) : (
            <Button size="sm" variant="accent" onClick={() => setCheckInOpen(true)}>
              <UserCheck className="h-4 w-4" /> Điểm danh
            </Button>
          )}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">Quản lý <ChevronDown className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Chỉnh sửa</DropdownMenuItem>
                <DropdownMenuItem onClick={doDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4" /> Xoá nhóm
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Members */}
      {group.members.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">Chưa có ai điểm danh nhóm này.</div>
      ) : (
        <div className="flex flex-wrap gap-4 p-4">
          {group.members.map((m) => (
            <div key={m.id} className="flex w-28 flex-col items-center text-center">
              <div className="relative h-14 w-14">
                <div className={cn(
                  "flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-white ring-2",
                  m.isApproved ? "ring-emerald-400" : "ring-border"
                )}>
                  {m.user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.user.avatarUrl} alt={m.user.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-navy">{initials(m.user.name)}</span>
                  )}
                </div>
                {m.isApproved && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </div>
              <div className="mt-1.5 line-clamp-2 text-xs font-medium text-ink">{m.user.name}</div>
              <div className="text-[11px] text-accent">{m.hours} giờ</div>
            </div>
          ))}
        </div>
      )}

      <GroupDialog open={editOpen} onOpenChange={setEditOpen} date={group.date.slice(0, 10)} group={group} />
      <CheckInDialog open={checkInOpen} onOpenChange={setCheckInOpen} group={group} />
    </Card>
  );
}

/* ---- Create / edit group dialog ---- */
function GroupDialog({
  open, onOpenChange, date, group,
}: { open: boolean; onOpenChange: (o: boolean) => void; date: string; group?: HcGroup }) {
  const create = useCreateHcGroup();
  const update = useUpdateHcGroup();
  const isEdit = !!group;
  const [content, setContent] = React.useState("");
  const [hours, setHours] = React.useState(8);
  const [period, setPeriod] = React.useState<"FULL_DAY" | "MORNING" | "AFTERNOON">("FULL_DAY");

  React.useEffect(() => {
    if (!open) return;
    setContent(group?.content ?? "");
    setHours(group?.hours ?? 8);
    const current = normalizeHcPeriod(group?.period);
    setPeriod(current === "AFTERNOON" || current === "MORNING" ? current : "FULL_DAY");
  }, [open, group]);

  const dateLabel = date.split("-").reverse().join("-");
  const cleanContent = content.trim();

  async function save() {
    if (!cleanContent) return toast.error("Nhập nội dung");
    try {
      if (isEdit) {
        await update.mutateAsync({ id: group!.id, content: cleanContent, hours, period });
        toast.success("Đã cập nhật nhóm");
      } else {
        await create.mutateAsync({ date, content: cleanContent, hours, period });
        toast.success("Đã tạo nhóm hành chính");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Chỉnh sửa nhóm hành chính" : "Tạo nhóm hành chính"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Row label="Thời gian">
            <span className="text-sm font-medium text-ink">{dateLabel}</span>
          </Row>
          <Row label="Buổi">
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MANAGED_GROUP_PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Số giờ chấm công">
            <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Nội dung">
            <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Nhập nội dung..." autoFocus />
          </Row>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Self administrative check-in from page action ---- */
function SelfAdministrativeCheckInDialog({
  open, onOpenChange, date, groups, myId,
}: { open: boolean; onOpenChange: (o: boolean) => void; date: string; groups: HcGroup[]; myId?: string }) {
  const checkIn = useHcCheckIn();
  const [period, setPeriod] = React.useState<(typeof HC_SELF_PERIODS)[number]["value"]>("FULL_DAY");
  const [workNote, setWorkNote] = React.useState("");

  const myCheckIn = React.useMemo(
    () => groups.flatMap((g) => g.members.map((m) => ({ member: m, group: g }))).find((entry) => entry.member.userId === myId),
    [groups, myId]
  );

  React.useEffect(() => {
    if (!open) return;
    const current = myCheckIn
      ? HC_SELF_PERIODS.find((p) => myCheckIn.group.content === `Hành chính - ${p.label}`)
      : undefined;
    setPeriod(current?.value ?? "FULL_DAY");
    setWorkNote(myCheckIn?.member.note ?? "");
  }, [open, myCheckIn]);

  async function save() {
    try {
      await checkIn.mutateAsync({ date, period, workNote });
      toast.success(myCheckIn ? "Đã cập nhật chấm công hành chính" : "Đã chấm công hành chính");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chấm công hành chính</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Row label="Buổi">
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger><SelectValue placeholder="Chọn buổi" /></SelectTrigger>
              <SelectContent>
                {HC_SELF_PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label} ({p.cutoff})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Nội dung công việc">
            <Textarea
              value={workNote}
              onChange={(e) => setWorkNote(e.target.value)}
              rows={3}
              placeholder="Nhập nội dung công việc nếu có..."
            />
          </Row>
          {myCheckIn && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Bạn đã chấm công {periodLabel(myCheckIn.group.content).toLowerCase()}, có thể cập nhật lại.
            </div>
          )}
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Thời gian chấm công: cả ngày và buổi sáng trước 08h00; buổi chiều trước 13h30; ra ca sáng trước 14h30.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={save} disabled={checkIn.isPending}>
            {checkIn.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Self check-in dialog (pick hours) ---- */
function CheckInDialog({ open, onOpenChange, group }: { open: boolean; onOpenChange: (o: boolean) => void; group: HcGroup }) {
  const checkIn = useHcCheckIn();
  const [hours, setHours] = React.useState(group.hours);

  React.useEffect(() => {
    if (open) setHours(group.hours);
  }, [open, group.hours]);

  async function save() {
    try {
      await checkIn.mutateAsync({ groupId: group.id, hours });
      toast.success("Đã điểm danh xong");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Điểm danh công tác hành chính</DialogTitle>
        </DialogHeader>
        <Row label="Số giờ chấm công">
          <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <SelectTrigger><SelectValue placeholder="--- Chọn ---" /></SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h}</SelectItem>)}
            </SelectContent>
          </Select>
        </Row>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={save} disabled={checkIn.isPending}>
            {checkIn.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
      <Label className="text-muted-foreground">{label}</Label>
      <div>{children}</div>
    </div>
  );
}
