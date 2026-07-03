"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { CheckCircle2, Clock, LogIn, LogOut, Loader2, ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useShift, useCheckIn, useApproveCheckIn, useCreateHandover } from "@/hooks/useShifts";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { CHECKIN_STATUS, SHIFT_TYPE } from "@/lib/constants";
import { formatDateInput, formatTime, initials, cn } from "@/lib/utils";
import type { CheckInWithUser, ShiftAssignmentWithUser } from "@/types";

export default function CheckInPage() {
  const { data: session } = useSession();
  const rbac = useRbacAccess();
  const canApproveCheckIn = rbac.can("shift-operation-approve", ["approve", "manage", "full"]);
  const date = formatDateInput();
  const { data, isLoading } = useShift({ date });
  const shift = data?.data;
  const checkIn = useCheckIn();
  const approve = useApproveCheckIn();
  const handover = useCreateHandover();

  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [issues, setIssues] = React.useState("");

  const checkIns = (shift?.checkIns ?? []) as CheckInWithUser[];
  const assignments = (shift?.assignments ?? []) as ShiftAssignmentWithUser[];

  async function doAction(userId: string, action: string) {
    if (!shift) return;
    try {
      await checkIn.mutateAsync({ shiftId: shift.id, userId, action });
      toast.success(action === "CHECK_IN" ? "Đã điểm danh vào" : "Đã điểm danh ra");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function submitHandover(e: React.FormEvent) {
    e.preventDefault();
    if (!shift || !from || !to) return toast.error("Chọn người bàn giao và nhận");
    try {
      await handover.mutateAsync({ shiftId: shift.id, fromUserId: from, toUserId: to, notes, issues });
      toast.success("Đã lưu biên bản bàn giao ca");
      setNotes(""); setIssues("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (isLoading) return <div className="grid gap-6 lg:grid-cols-2"><CardSkeleton /><CardSkeleton /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Điểm danh & Bàn giao ca"
        description={shift ? `Ca ${SHIFT_TYPE[shift.shiftType as keyof typeof SHIFT_TYPE]?.label} · ${shift.unit}` : "Ca hôm nay"} />

      {!shift ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Chưa có ca trực hôm nay.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Check-in list */}
          <Card>
            <CardHeader><CardTitle>Điểm danh ca hiện tại</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {checkIns.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu điểm danh.</p>}
              {checkIns.map((c) => {
                const meta = CHECKIN_STATUS[c.status as keyof typeof CHECKIN_STATUS];
                return (
                  <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">
                      {initials(c.user.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{c.user.name}</div>
                      <div className="text-xs text-muted-foreground">{c.user.position}</div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div className="flex items-center gap-1"><LogIn className="h-3 w-3" /> {formatTime(c.checkInAt)}</div>
                      <div className="flex items-center gap-1"><LogOut className="h-3 w-3" /> {formatTime(c.checkOutAt)}</div>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", meta?.badge)}>{meta?.label ?? c.status}</span>
                    <div className="flex flex-col gap-1">
                      {!c.checkInAt && (
                        <Button size="sm" variant="outline" onClick={() => doAction(c.userId, "CHECK_IN")} disabled={checkIn.isPending}>
                          Vào
                        </Button>
                      )}
                      {c.checkInAt && !c.checkOutAt && (
                        <Button size="sm" variant="ghost" onClick={() => doAction(c.userId, "CHECK_OUT")} disabled={checkIn.isPending}>
                          Ra
                        </Button>
                      )}
                      {canApproveCheckIn && !c.approvedBy && (
                        <Button size="sm" variant="ghost" title="Duyệt" onClick={async () => {
                          try { await approve.mutateAsync(c.id); toast.success("Đã duyệt điểm danh"); }
                          catch (e) { toast.error((e as Error).message); }
                        }}>
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        </Button>
                      )}
                      {c.approvedBy && <CheckCircle2 className="h-4 w-4 text-success" />}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Handover form */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" /> Bàn giao ca</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={submitHandover} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1.5 block">Người bàn giao</Label>
                    <Select value={from} onValueChange={setFrom}>
                      <SelectTrigger><SelectValue placeholder="Chọn..." /></SelectTrigger>
                      <SelectContent>
                        {assignments.map((a) => <SelectItem key={a.user.id} value={a.user.id}>{a.user.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1.5 block">Người nhận ca</Label>
                    <Select value={to} onValueChange={setTo}>
                      <SelectTrigger><SelectValue placeholder="Chọn..." /></SelectTrigger>
                      <SelectContent>
                        {assignments.map((a) => <SelectItem key={a.user.id} value={a.user.id}>{a.user.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5 block">Nội dung bàn giao</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Tình trạng vận hành, thông số chính..." />
                </div>
                <div>
                  <Label className="mb-1.5 block">Tồn đọng / Vấn đề cần lưu ý</Label>
                  <Textarea value={issues} onChange={(e) => setIssues(e.target.value)} rows={3} placeholder="Các sự cố chưa xử lý..." />
                </div>
                <Button type="submit" className="w-full" disabled={handover.isPending}>
                  {handover.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Lưu biên bản bàn giao
                </Button>
              </form>

              {shift.handovers && shift.handovers.length > 0 && (
                <div className="mt-5 space-y-2 border-t border-border pt-4">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Biên bản gần đây</div>
                  {shift.handovers.map((h: any) => (
                    <div key={h.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> {formatTime(h.handoverAt)}
                      </div>
                      {h.notes && <p className="mt-1 text-ink">{h.notes}</p>}
                      {h.issues && <p className="mt-1 text-warning">⚠ {h.issues}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
