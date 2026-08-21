"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UNIT_LABELS } from "@/lib/chemical-inventory/constants";
import {
  useChemicalContracts,
  useDeleteChemicalContract,
  useUpsertChemicalContract,
  type ChemicalContract,
  type ChemicalItem,
  type PermissionLevel,
} from "@/hooks/useChemicalInventory";
import { fmt } from "./shared";

/**
 * Tab "Hợp đồng".
 *
 * Cột "Đã nhận" luôn cộng lại từ phiếu nhập, KHÔNG lấy từ số lưu sẵn — cột đó trong
 * sổ Excel gốc trộn lẫn lượng sử dụng từ tháng 9 trở đi. Thiếu hụt cũng đã sửa lại
 * chiều dấu: sổ cũ tính (còn lại − nhu cầu), ra thặng dư chứ không phải thiếu hụt.
 */

export function ContractsTab({
  year,
  items,
  level,
  onChangeYear,
}: {
  year: number;
  items: ChemicalItem[];
  level: PermissionLevel;
  onChangeYear: (y: number) => void;
}) {
  const { data, isLoading, isError, refetch } = useChemicalContracts(year);
  const remove = useDeleteChemicalContract();
  const [editing, setEditing] = useState<ChemicalContract | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChemicalContract | null>(null);

  const canManage = level === "manage" || level === "full";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onChangeYear(year - 1)}>
            ← {year - 1}
          </Button>
          <span className="min-w-[64px] text-center text-sm font-semibold tabular-nums">{year}</span>
          <Button size="sm" variant="outline" onClick={() => onChangeYear(year + 1)}>
            {year + 1} →
          </Button>
        </div>
        {canManage && (
          <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" /> Thêm hợp đồng
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : isError ? (
        <EmptyState icon={AlertTriangle} title="Không tải được hợp đồng" action={{ label: "Thử lại", onClick: () => void refetch() }} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title={`Chưa có hợp đồng năm ${year}`}
          description={
            canManage
              ? "Tệp nguồn chỉ có hợp đồng năm 2025 và không có dòng NH3 — hợp đồng các năm khác phải nhập tay."
              : "Chưa có dữ liệu hợp đồng cho năm này."
          }
          action={canManage ? { label: "Thêm hợp đồng", onClick: () => setEditing("new") } : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Hàng hóa</th>
                <th className="px-3 py-2 text-left font-semibold">Mã vật tư ERP</th>
                <th className="px-3 py-2 text-right font-semibold">Khối lượng HĐ</th>
                <th className="px-3 py-2 text-right font-semibold">Đã nhận</th>
                <th className="px-3 py-2 text-right font-semibold">Còn lại</th>
                <th className="px-3 py-2 text-right font-semibold">Nhu cầu</th>
                <th className="px-3 py-2 text-left font-semibold">Đối chiếu</th>
                <th className="min-w-[150px] px-3 py-2 text-left font-semibold">Tiến độ nhận</th>
                <th className="w-20 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => {
                const short = c.shortfall > 0;
                return (
                  <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <span className="block font-medium">{c.itemName}</span>
                      {c.supplier && <span className="text-[11px] text-muted-foreground">{c.supplier}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{c.materialCode ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(c.contractQuantity)} <span className="text-[11px] text-muted-foreground">{UNIT_LABELS[c.baseUnit]}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(c.received)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{fmt(c.remaining)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(c.forecastDemand)}</td>
                    <td className="px-3 py-2">
                      {short ? (
                        <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-800">
                          <AlertTriangle className="h-3 w-3" /> Thiếu {fmt(c.shortfall)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                          Dư {fmt(c.surplus)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="h-2 w-full overflow-hidden rounded-sm bg-muted" aria-hidden="true">
                        <div
                          className={cn("h-full rounded-sm", short ? "bg-red-500" : "bg-accent")}
                          style={{ width: `${Math.round(c.progress * 100)}%` }}
                        />
                      </div>
                      <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                        {Math.round(c.progress * 100)}% khối lượng hợp đồng
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing(c)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-ink"
                            aria-label="Sửa hợp đồng"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(c)}
                            className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                            aria-label="Xóa hợp đồng"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        “Đã nhận” được cộng lại từ phiếu nhập trong năm, không lấy từ số lưu sẵn.
      </p>

      {editing && (
        <ContractDialog
          contract={editing === "new" ? null : editing}
          year={year}
          items={items}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Xóa hợp đồng"
        description={confirmDelete ? `Xóa hợp đồng ${confirmDelete.itemName} năm ${confirmDelete.year}?` : undefined}
        confirmLabel="Xóa"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await remove.mutateAsync(confirmDelete.id);
            toast.success("Đã xóa hợp đồng");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không xóa được");
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

function ContractDialog({
  contract,
  year,
  items,
  onClose,
}: {
  contract: ChemicalContract | null;
  year: number;
  items: ChemicalItem[];
  onClose: () => void;
}) {
  const upsert = useUpsertChemicalContract();
  const chemicals = items.filter((i) => i.itemType === "CHEMICAL");
  const [form, setForm] = useState({
    itemId: contract?.itemId ?? chemicals[0]?.id ?? "",
    materialCode: contract?.materialCode ?? "",
    supplier: contract?.supplier ?? "",
    origin: contract?.origin ?? "",
    contractQuantity: contract ? String(contract.contractQuantity) : "",
    forecastDemand: contract ? String(contract.forecastDemand) : "0",
  });

  const quantity = Number(form.contractQuantity.replace(",", "."));
  const demand = Number(form.forecastDemand.replace(",", "."));
  const valid = Number.isFinite(quantity) && quantity >= 0 && Number.isFinite(demand) && demand >= 0 && form.itemId;

  return (
    <Dialog open onOpenChange={(open) => !open && !upsert.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{contract ? "Sửa hợp đồng" : `Thêm hợp đồng năm ${year}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="cc-item">Hàng hóa</Label>
            <select
              id="cc-item"
              value={form.itemId}
              onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {chemicals.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cc-code">Mã vật tư ERP</Label>
              <Input
                id="cc-code"
                value={form.materialCode}
                onChange={(e) => setForm((f) => ({ ...f, materialCode: e.target.value }))}
                className="mt-1 tabular-nums"
                placeholder="1.61.06.038.VIE.00.000"
              />
            </div>
            <div>
              <Label htmlFor="cc-supplier">Nhà cung cấp</Label>
              <Input
                id="cc-supplier"
                value={form.supplier}
                onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="cc-origin">NSX / Xuất xứ</Label>
            <Input
              id="cc-origin"
              value={form.origin}
              onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))}
              className="mt-1"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cc-qty">Khối lượng hợp đồng</Label>
              <Input
                id="cc-qty"
                inputMode="decimal"
                value={form.contractQuantity}
                onChange={(e) => setForm((f) => ({ ...f, contractQuantity: e.target.value }))}
                className="mt-1 text-right tabular-nums"
              />
            </div>
            <div>
              <Label htmlFor="cc-demand">Nhu cầu đến cuối năm</Label>
              <Input
                id="cc-demand"
                inputMode="decimal"
                value={form.forecastDemand}
                onChange={(e) => setForm((f) => ({ ...f, forecastDemand: e.target.value }))}
                className="mt-1 text-right tabular-nums"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={upsert.isPending}>
            Hủy
          </Button>
          <Button
            disabled={!valid || upsert.isPending}
            onClick={async () => {
              try {
                await upsert.mutateAsync({
                  id: contract?.id,
                  year,
                  itemId: form.itemId,
                  materialCode: form.materialCode || null,
                  supplier: form.supplier || null,
                  origin: form.origin || null,
                  contractQuantity: quantity,
                  forecastDemand: demand,
                });
                toast.success("Đã lưu hợp đồng");
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Lưu thất bại");
              }
            }}
          >
            {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
