"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAddLubricantSupplement, useDeleteLubricantSupplement, useLubricantSupplementHistory, type LubricantSupplementInput, type ReplacementItem,
} from "@/hooks/useReplacements";
import { formatDate, formatDateInput } from "@/lib/utils";

export type SupplementRow = { date: string; quantity: string; materialId: string; note: string };
export type SupplementOil = { id: string; name: string; unit: string };

export const emptySupplementRow = (materialId = ""): SupplementRow => ({ date: formatDateInput(), quantity: "", materialId, note: "" });

/** Dòng nhập một lần bổ sung: ngày, khối lượng (ĐVT theo dầu), dầu (chính/thay thế), ghi chú. */
export function SupplementFields({ row, oils, onChange, onRemove }: {
  row: SupplementRow;
  oils: SupplementOil[];
  onChange: (row: SupplementRow) => void;
  onRemove?: () => void;
}) {
  const oil = oils.find((item) => item.id === row.materialId) ?? oils[0];
  return (
    <div className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-[9rem_8rem_1fr] sm:items-end">
      <div>
        <Label className="mb-1 block text-xs">Ngày bổ sung</Label>
        <Input type="date" max={formatDateInput()} value={row.date} aria-label="Ngày bổ sung" onChange={(event) => onChange({ ...row, date: event.target.value })} />
      </div>
      <div>
        <Label className="mb-1 block text-xs">Khối lượng</Label>
        <div className="flex items-center gap-1.5">
          <Input type="number" min={0} step="any" value={row.quantity} aria-label="Khối lượng bổ sung" onChange={(event) => onChange({ ...row, quantity: event.target.value })} />
          <span className="shrink-0 text-xs text-muted-foreground">{oil?.unit ?? ""}</span>
        </div>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <Label className="mb-1 block text-xs">Dầu</Label>
        <Select value={oil?.id ?? ""} onValueChange={(value) => onChange({ ...row, materialId: value })} disabled={oils.length < 2}>
          <SelectTrigger aria-label="Dầu bổ sung"><SelectValue placeholder="Chọn dầu chính trước" /></SelectTrigger>
          <SelectContent>{oils.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="col-span-2 flex items-center gap-2 sm:col-span-3">
        <Input value={row.note} maxLength={500} placeholder="Ghi chú (tuỳ chọn)" aria-label="Ghi chú bổ sung" onChange={(event) => onChange({ ...row, note: event.target.value })} />
        {onRemove && (
          <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-destructive" aria-label="Bỏ dòng bổ sung" onClick={onRemove}>
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Chuẩn hoá dòng nhập → body POST; trả lỗi tiếng Việt nếu sai. */
export function supplementPayload(row: SupplementRow, replacementId: string, fallbackMaterialId?: string): { error: string } | { value: LubricantSupplementInput } {
  if (!row.date) return { error: "Nhập ngày bổ sung" };
  if (row.date > formatDateInput()) return { error: "Ngày bổ sung không được ở tương lai" };
  const quantity = row.quantity.trim() === "" ? null : Number(row.quantity);
  if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) return { error: "Khối lượng bổ sung phải từ 0 trở lên" };
  return {
    value: { replacementId, date: row.date, quantity, materialId: row.materialId || fallbackMaterialId, note: row.note.trim() || undefined },
  };
}

export const pointOils = (point: ReplacementItem): SupplementOil[] => [
  { id: point.material.id, name: point.material.name, unit: point.material.unit },
  ...(point.alternateMaterials ?? []).map(({ id, name, unit }) => ({ id, name, unit })),
];

const quantityLabel = (value: number) => Number(value.toFixed(2)).toLocaleString("vi-VN");

/** Lịch sử bổ sung của một điểm + form thêm lần mới (khi `canEdit`). */
export function LubricantSupplementDialog({ point, canEdit, onClose }: {
  point: ReplacementItem | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const history = useLubricantSupplementHistory(point?.id ?? null);
  const add = useAddLubricantSupplement();
  const remove = useDeleteLubricantSupplement();
  const [row, setRow] = React.useState(() => emptySupplementRow());
  const [lastPoint, setLastPoint] = React.useState<string | null>(null);
  if ((point?.id ?? null) !== lastPoint) {
    setLastPoint(point?.id ?? null);
    setRow(emptySupplementRow());
  }
  const oils = point ? pointOils(point) : [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!point) return;
    const payload = supplementPayload(row, point.id, point.material.id);
    if ("error" in payload) return void toast.error(payload.error);
    try {
      await add.mutateAsync(payload.value);
      toast.success("Đã ghi lần bổ sung");
      setRow(emptySupplementRow());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không ghi được lần bổ sung");
    }
  }

  async function removeItem(id: string) {
    if (!window.confirm("Xoá lần bổ sung nhập tay này?")) return;
    try {
      await remove.mutateAsync(id);
      toast.success("Đã xoá lần bổ sung");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không xoá được");
    }
  }

  const items = history.data ?? [];
  return (
    <Dialog open={!!point} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lịch sử bổ sung — {point?.device?.name ?? point?.location ?? point?.material.name}</DialogTitle>
        </DialogHeader>
        {history.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : history.isError ? (
          <p className="text-sm text-destructive">Không tải được lịch sử bổ sung.</p>
        ) : items.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Chưa có lần bổ sung nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Lịch sử bổ sung">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="py-1 pr-2">Ngày</th><th className="pr-2">Khối lượng</th><th className="hidden pr-2 sm:table-cell">Dầu</th><th className="pr-2">Nguồn</th><th className="pr-2">Ghi chú</th><th /></tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.source}-${item.id}`} className="border-t align-top">
                    <td className="whitespace-nowrap py-1.5 pr-2">{formatDate(item.date)}</td>
                    <td className="whitespace-nowrap pr-2">{item.quantity != null ? `${quantityLabel(item.quantity)} ${item.unit ?? ""}`.trim() : "—"}</td>
                    <td className="hidden pr-2 sm:table-cell">{item.materialName ?? "—"}</td>
                    <td className="pr-2">
                      {item.sourceLabel}
                      {item.byName && <div className="text-[11px] text-muted-foreground">{item.byName}</div>}
                    </td>
                    <td className="max-w-[10rem] break-words pr-2">{item.note ?? ""}</td>
                    <td className="text-right">
                      {item.deletable && canEdit && (
                        <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" aria-label={`Xoá lần bổ sung ${formatDate(item.date)}`}
                          disabled={remove.isPending} onClick={() => removeItem(item.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && point && (
          <form onSubmit={submit} className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Thêm lần bổ sung</p>
            <SupplementFields row={row} oils={oils} onChange={setRow} />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={add.isPending}>
                {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Ghi bổ sung
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
