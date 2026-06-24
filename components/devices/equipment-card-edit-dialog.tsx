"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImagePicker } from "@/components/shared/image-picker";
import { useEquipmentTree, useUpdateEquipmentNode } from "@/hooks/useEquipment";

/**
 * Hộp thoại chỉnh sửa thẻ thiết bị (một node trong cây): bổ sung thông tin, tài
 * liệu (link) và tối đa 1 hình ảnh. Lấy giá trị hiện tại từ cây theo seq.
 */
export function EquipmentCardEditDialog({
  seq,
  onOpenChange,
}: {
  seq: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data } = useEquipmentTree();
  const node = React.useMemo(
    () => (seq ? (data?.data ?? []).find((n) => n.seq === seq) ?? null : null),
    [data, seq]
  );
  const update = useUpdateEquipmentNode();

  const [form, setForm] = React.useState({ attachedInfo: "", documentUrl: "", imageUrl: "" });
  React.useEffect(() => {
    if (node) {
      setForm({
        attachedInfo: node.attachedInfo ?? "",
        documentUrl: node.documentUrl ?? "",
        imageUrl: node.imageUrl ?? "",
      });
    }
  }, [node]);

  async function save() {
    if (!seq) return;
    try {
      await update.mutateAsync({ seq, ...form });
      toast.success("Đã lưu thông tin thiết bị");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={!!seq} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa thẻ thiết bị</DialogTitle>
        </DialogHeader>
        {node && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <div className="font-mono text-xs font-bold text-navy">{node.seq}</div>
              <div className="font-semibold leading-tight text-ink">{node.name}</div>
            </div>
            <div>
              <Label className="mb-1.5 block">Thông tin thêm</Label>
              <Textarea
                value={form.attachedInfo}
                onChange={(e) => setForm((f) => ({ ...f, attachedInfo: e.target.value }))}
                rows={3}
                placeholder="Thông số, ghi chú, lý lịch…"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Tài liệu đính kèm (link)</Label>
              <Input
                value={form.documentUrl}
                onChange={(e) => setForm((f) => ({ ...f, documentUrl: e.target.value }))}
                placeholder="https://… (PDF / Google Drive)"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Hình ảnh (tối đa 1)</Label>
              <ImagePicker value={form.imageUrl} onChange={(v) => setForm((f) => ({ ...f, imageUrl: v }))} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={save} disabled={update.isPending || !node}>
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
