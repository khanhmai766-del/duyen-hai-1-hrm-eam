"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { replDueText } from "@/components/materials/replacement-badge";
import { useRecordReplacement, type ReplacementItem } from "@/hooks/useReplacements";
import { replacementIntervalLabel } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

/** Hộp thoại ghi nhận một lần thay thế vật tư → dời hạn kế tiếp. */
export function RecordReplacementDialog({ point, onClose }: { point: ReplacementItem | null; onClose: () => void }) {
  const record = useRecordReplacement();
  const [replacedAt, setReplacedAt] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = React.useState("");
  const [note, setNote] = React.useState("");
  const [deductStock, setDeductStock] = React.useState(true);

  React.useEffect(() => {
    if (point) {
      setReplacedAt(new Date().toISOString().slice(0, 10));
      setQuantity("");
      setNote("");
      setDeductStock(true);
    }
  }, [point]);

  async function submit() {
    if (!point) return;
    try {
      await record.mutateAsync({ id: point.id, replacedAt, quantity: quantity || null, note, deductStock });
      toast.success("Đã ghi nhận thay thế vật tư");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const target = point?.device ? `${point.device.code} — ${point.device.name}` : point?.location ?? "—";

  return (
    <Dialog open={!!point} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Ghi nhận thay thế vật tư</DialogTitle></DialogHeader>
        {point && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="font-medium text-ink">{point.material.code} — {point.material.name}</div>
              <div className="text-xs text-muted-foreground">Áp dụng: {target}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Đến hạn hiện tại: {formatDate(point.nextDueAt)} · {replDueText(point.nextDueAt)}. Sau khi ghi nhận, hạn kế tiếp dời {replacementIntervalLabel(point.intervalMonths)}.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">Ngày thay thế</Label>
                <Input type="date" value={replacedAt} onChange={(e) => setReplacedAt(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1.5 block">Số lượng dùng ({point.material.unit})</Label>
                <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <Checkbox checked={deductStock} onCheckedChange={(v) => setDeductStock(v === true)} />
              Trừ số lượng đã dùng vào tồn kho
            </label>
            <div>
              <Label className="mb-1.5 block">Ghi chú</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Tình trạng, người thực hiện..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Huỷ</Button>
              <Button onClick={submit} disabled={record.isPending}>
                {record.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <CheckCircle2 className="h-4 w-4" /> Xác nhận
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
