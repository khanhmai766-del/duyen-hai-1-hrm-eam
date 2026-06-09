"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Plus, Trash2, ArrowLeft, Check, Loader2, UserCheck, UserMinus, ClipboardCheck, ChevronDown, Pencil, ClipboardList,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  useHcGroups, useCreateHcGroup, useUpdateHcGroup, useDeleteHcGroup,
  useHcCheckIn, useHcRecall, useHcApprove, type HcGroup,
} from "@/hooks/useHcAttendance";
import { cn, initials } from "@/lib/utils";

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function AdminAttendancePage() {
  const { data: session } = useSession();
  const canManage = ["ADMIN", "SUPERVISOR"].includes(session?.user?.role ?? "");
  const myId = session?.user?.id;

  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [addOpen, setAddOpen] = React.useState(false);

  const { data, isLoading } = useHcGroups(date);
  const groups = data?.data ?? [];

  return (
    <div className="space-y-6">
      <Link href="/hr" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Quản lý nhân sự / Ca vận hành
      </Link>

      <PageHeader title="Chấm công hành chính" description="Chấm công theo nhóm cho khối hành chính (HC) — dữ liệu lưu 5 tháng gần nhất">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Thời gian</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        {canManage && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Thêm nhóm
          </Button>
        )}
      </PageHeader>

      {isLoading ? (
        <CardSkeleton />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Chưa có nhóm chấm công"
          description={
            canManage
              ? 'Nhấn "Thêm nhóm" để tạo nhóm đi hành chính và bắt đầu chấm công theo ngày.'
              : "Chưa có nhóm chấm công hành chính cho ngày này."
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} canManage={canManage} myId={myId} />
          ))}
        </div>
      )}

      <GroupDialog open={addOpen} onOpenChange={setAddOpen} date={date} />
    </div>
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
          <div className="text-xs text-muted-foreground">{group.hours} giờ</div>
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
            <Button size="sm" variant="destructive" onClick={doRecall} disabled={recall.isPending}>
              {recall.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
              Thu hồi điểm danh
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
const HC_PRESETS = ["Diễn tập xử lý sự cố", "Diễn tập PCCC"];
const HC_OTHER = "Khác";

function GroupDialog({
  open, onOpenChange, date, group,
}: { open: boolean; onOpenChange: (o: boolean) => void; date: string; group?: HcGroup }) {
  const create = useCreateHcGroup();
  const update = useUpdateHcGroup();
  const isEdit = !!group;
  // `preset` is the dropdown choice; `custom` holds the free text when "Khác".
  const [preset, setPreset] = React.useState("");
  const [custom, setCustom] = React.useState("");
  const [hours, setHours] = React.useState(8);

  React.useEffect(() => {
    if (!open) return;
    const c = group?.content ?? "";
    if (HC_PRESETS.includes(c)) {
      setPreset(c);
      setCustom("");
    } else if (c) {
      setPreset(HC_OTHER);
      setCustom(c);
    } else {
      setPreset("");
      setCustom("");
    }
    setHours(group?.hours ?? 8);
  }, [open, group]);

  const dateLabel = date.split("-").reverse().join("-");
  const content = (preset === HC_OTHER ? custom : preset).trim();

  async function save() {
    if (!preset) return toast.error("Chọn nội dung");
    if (!content) return toast.error("Nhập nội dung");
    try {
      if (isEdit) {
        await update.mutateAsync({ id: group!.id, content, hours });
        toast.success("Đã cập nhật nhóm");
      } else {
        await create.mutateAsync({ date, content, hours });
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
          <Row label="Số giờ chấm công">
            <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Nội dung">
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger><SelectValue placeholder="Chọn nội dung" /></SelectTrigger>
              <SelectContent>
                {HC_PRESETS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                <SelectItem value={HC_OTHER}>{HC_OTHER}</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          {preset === HC_OTHER && (
            <Row label="Nội dung khác">
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Nhập nội dung..." autoFocus />
            </Row>
          )}
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
