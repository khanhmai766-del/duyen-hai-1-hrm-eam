"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { BellRing, Loader2, RadioTower } from "lucide-react";
import { toast } from "sonner";
import { useClaimGroundingReminder, useGroundingReminder, useOpenGroundingReminder } from "@/hooks/useGroundingReminder";
import { SHIFT_TYPE } from "@/lib/constants";
import { GROUNDING_SHIFT_HOURS } from "@/lib/grounding-inspection-schedule";
import type { GroundingReminder } from "@/lib/grounding-reminder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function GroundingShiftReminder() {
  const { data: session } = useSession();
  const query = useGroundingReminder();
  const { mutate: claim } = useClaimGroundingReminder();
  const openRegister = useOpenGroundingReminder();
  const [popup, setPopup] = React.useState<{ userId: string; reminder: GroundingReminder } | null>(null);
  const attempting = React.useRef(false);
  const retryAfter = React.useRef(0);
  const userId = session?.user?.id;
  const currentUser = React.useRef(userId);
  const reminder = query.data;

  React.useEffect(() => { currentUser.current = userId; }, [userId]);

  React.useEffect(() => {
    if (!userId || !reminder || reminder.shown) return;
    let disposed = false;
    const tryShow = () => {
      // Ưu tiên hộp đổi mật khẩu, thông báo quản trị hoặc biểu mẫu đang mở.
      if (disposed || attempting.current || Date.now() < retryAfter.current || document.visibilityState !== "visible"
        || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      attempting.current = true;
      claim(reminder.key, {
        onSuccess: (claimed) => {
          if (claimed && currentUser.current === userId && Date.now() < new Date(claimed.endsAt).getTime()) {
            setPopup({ userId, reminder: claimed });
          }
        },
        onError: () => { retryAfter.current = Date.now() + 30_000; },
        onSettled: () => { attempting.current = false; },
      });
    };
    // Đợi các hộp thoại ưu tiên mount xong; thử lại nếu đang bận nhập biểu mẫu.
    const timer = window.setInterval(tryShow, 1500);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [userId, reminder, claim]);

  React.useEffect(() => {
    if (!popup) return;
    const timer = window.setTimeout(() => setPopup(null), Math.max(0, new Date(popup.reminder.endsAt).getTime() - Date.now()));
    return () => window.clearTimeout(timer);
  }, [popup]);

  // GET vẫn trả tiến độ sau khi đã nhắc; đóng popup khi hết ca/hoàn thành/thu hồi điểm danh.
  const visible = !!reminder && popup?.userId === userId && reminder.key === popup?.reminder.key
    && reminder.pending > 0;
  if (!visible || !reminder) return null;

  const dismiss = () => setPopup(null);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl p-5 sm:p-6">
        <DialogHeader>
          <span className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700">
            <BellRing className="h-6 w-6" />
          </span>
          <DialogTitle className="pr-4 leading-snug">Nhắc kiểm tra tiếp địa &amp; chống sét</DialogTitle>
          <DialogDescription>
            Ca {SHIFT_TYPE[reminder.shiftType].label.toLowerCase()} · {GROUNDING_SHIFT_HOURS[reminder.shiftType]}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-ink">
          Cương vị anh/chị đang trực còn <strong className="text-amber-700">{reminder.pending} vị trí chưa xác nhận</strong>.
          Vui lòng kiểm tra và xác nhận trong ca.
        </p>
        <div className="max-h-[32vh] space-y-2 overflow-y-auto">
          {reminder.groups.map((group) => (
            <div key={`${group.positionCode}:${group.machine}`} className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
              <div className="flex items-start gap-2 text-sm font-semibold text-ink">
                <RadioTower className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <span>{group.position}{group.machine === "COMMON" ? " · Dùng chung" : ` ${group.machine}`}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Còn {group.pending}/{group.total} vị trí chưa xác nhận.</p>
              {group.workingPosition && <p className="mt-2 text-xs text-muted-foreground">Khi mở sổ, chuyển sang cương vị {group.workingPosition}.</p>}
              {reminder.groups.length > 1 && (
                <Button variant="outline" className="mt-2 h-10 w-full" disabled={openRegister.isPending}
                  onClick={() => openRegister.mutate(group, { onSuccess: dismiss, onError: (error) => toast.error(error.message) })}>
                  Mở tuyến kiểm tra
                </Button>
              )}
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="h-11" onClick={dismiss}>Đã hiểu</Button>
          {reminder.groups.length === 1 && (
            <Button className="h-14 text-base sm:h-11 sm:text-sm" disabled={openRegister.isPending}
              onClick={() => openRegister.mutate(reminder.groups[0], { onSuccess: dismiss, onError: (error) => toast.error(error.message) })}>
              {openRegister.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Đi kiểm tra
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
