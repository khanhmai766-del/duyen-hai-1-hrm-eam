"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dueText } from "@/components/maintenance/due-badge";
import { useCompletePlan, type MaintenancePlanItem } from "@/hooks/useMaintenance";
import { intervalLabel } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

/** Hộp thoại ghi nhận một lần thực hiện bảo trì → dời hạn kế tiếp. */
export function CompleteDialog({ plan, onClose }: { plan: MaintenancePlanItem | null; onClose: () => void }) {
  const complete = useCompletePlan();
  const [note, setNote] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [doneAt, setDoneAt] = React.useState(() => new Date().toISOString().slice(0, 10));

  React.useEffect(() => {
    if (plan) {
      setNote("");
      setCost("");
      setDoneAt(new Date().toISOString().slice(0, 10));
    }
  }, [plan]);

  async function submit() {
    if (!plan) return;
    try {
      await complete.mutateAsync({ id: plan.id, note, cost: cost || null, doneAt });
      toast.success("Đã ghi nhận thực hiện bảo trì");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={!!plan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Đánh dấu đã bảo trì</DialogTitle></DialogHeader>
        {plan && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="font-medium text-ink">{plan.title}</div>
              <div className="text-xs text-muted-foreground">{plan.device.code} — {plan.device.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Đến hạn hiện tại: {formatDate(plan.nextDueAt)} · {dueText(plan.nextDueAt)}. Sau khi ghi nhận, hạn kế tiếp sẽ dời {intervalLabel(plan.intervalDays).toLowerCase()}.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">Ngày thực hiện</Label>
                <Input type="date" value={doneAt} onChange={(e) => setDoneAt(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1.5 block">Chi phí (VND)</Label>
                <Input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">Ghi chú</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Kết quả, vật tư đã thay..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Huỷ</Button>
              <Button onClick={submit} disabled={complete.isPending}>
                {complete.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <CheckCircle2 className="h-4 w-4" /> Xác nhận
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
