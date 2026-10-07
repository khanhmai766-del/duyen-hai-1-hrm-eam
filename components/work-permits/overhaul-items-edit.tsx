"use client";

import { useState } from "react";
import { ListPlus, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { OverhaulContentField } from "@/components/work-permits/overhaul-item-picker";
import { useSaveOverhaulItems } from "@/hooks/useWorkPermits";
import { isOverhaulPaperPermit, overhaulItemsOf, type OverhaulItemSnapshot } from "@/lib/work-permit-overhaul";
import { formatPermitNumber, type PermitInput, type PermitRow } from "@/lib/work-permits";

/** Phiếu được bổ sung hạng mục: PCT giấy nhà thầu · Đại tu đã cấp, chưa kết thúc phiếu / huỷ. */
export function canEditOverhaulItems(permit: Pick<PermitRow, "teamType" | "contractorScope" | "format" | "status">) {
  return isOverhaulPaperPermit(permit) && ["ISSUED", "ACTIVE", "WAITING", "PAUSED"].includes(permit.status);
}

/**
 * Nút + hộp "Bổ sung hạng mục" cho PCT đại tu đã cấp — dùng được cả khi đang làm việc (nút "Chỉnh sửa" phiếu thì không).
 * Chỉ đổi danh sách hạng mục; nội dung công việc trên phiếu giấy giữ nguyên, phụ lục in kèm cập nhật theo.
 */
export function OverhaulItemsEditButton({ permit, className }: { permit: PermitRow; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!canEditOverhaulItems(permit)) return null;
  const count = overhaulItemsOf(permit.overhaulItems).length;
  return <>
    <Button type="button" variant="outline" size="sm" className={className ?? "h-8 text-xs"} onClick={() => setOpen(true)}>
      <ListPlus />{count ? "Bổ sung hạng mục" : "Chọn hạng mục đại tu"}
    </Button>
    {open && <OverhaulItemsDialog permit={permit} onClose={() => setOpen(false)} />}
  </>;
}

/** Hộp chọn / bổ sung hạng mục — dùng riêng được (menu "Hạng mục" trong chi tiết PCT). */
export function OverhaulItemsDialog({ permit, onClose }: { permit: PermitRow; onClose: () => void }) {
  const original = overhaulItemsOf(permit.overhaulItems);
  const [items, setItems] = useState<OverhaulItemSnapshot[]>(original);
  const save = useSaveOverhaulItems(permit.id);
  const [error, setError] = useState("");
  // Bộ chọn dùng biểu mẫu phiếu: khoá nhà thầu theo đơn vị công tác, loại PCT + cương vị theo phiếu, bỏ qua chính phiếu này.
  const form = { ...(permit as unknown as PermitInput), id: permit.id, overhaulItems: items };
  const key = (i: OverhaulItemSnapshot) => `${i.source}\u0000${i.sheet}\u0000${i.code}`;
  const changed = items.length !== original.length || items.some(i => !original.some(o => key(o) === key(i)));
  async function submit() {
    setError("");
    try {
      await save.mutateAsync({ version: permit.version, overhaulItems: items });
      toast.success("Đã cập nhật hạng mục đại tu của phiếu");
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Không lưu được hạng mục"); }
  }
  return <Dialog open onOpenChange={v => { if (!v && !save.isPending) onClose(); }}>
    <DialogContent className="max-w-2xl">
      <DialogTitle>Hạng mục đại tu · PCT {formatPermitNumber(permit)}</DialogTitle>
      <DialogDescription>Bổ sung hoặc bớt hạng mục cho phiếu đã cấp, kể cả khi đang làm việc (bấm × trên hạng mục để bớt, bớt hết cũng được). Hạng mục đã ghi tiến độ thì không bớt được. Thay đổi dùng ngay khi Cập nhật tiến độ / Kết thúc.</DialogDescription>
      <div className="space-y-3">
        <OverhaulContentField form={form} onApply={next => setItems(next)} />
        {!items.length && <p className="text-sm text-muted-foreground">{original.length ? "Đã bớt hết hạng mục — lưu thì phiếu ghi tiến độ bằng % chung." : "Chưa chọn hạng mục nào."}</p>}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>Huỷ</Button>
          <Button type="button" onClick={submit} disabled={save.isPending || !changed}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}Lưu hạng mục</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
