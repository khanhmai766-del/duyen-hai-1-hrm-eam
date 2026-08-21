"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Link2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchBar } from "@/components/shared/search-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UNIT_LABELS, MAX_VEHICLE_NUMBER_LENGTH } from "@/lib/chemical-inventory/constants";
import { positionsMatch } from "@/lib/position-catalog";
import {
  useChemicalReceipts,
  useCreateChemicalReceipt,
  useDeleteChemicalReceipt,
  useUpdateChemicalReceipt,
  type ChemicalItem,
  type ChemicalReceipt,
  type PermissionLevel,
} from "@/hooks/useChemicalInventory";
import { fmt, periodLabel, warningLabel } from "./shared";

/**
 * Tab "Phiếu nhập".
 *
 * Mặc định chỉ hiện tháng đang chọn — sổ Excel gộp nhiều năm vào một bảng dài là
 * thứ module này cố tình không lặp lại. Muốn xem tất cả phải bấm chủ đích.
 */

const PAGE_SIZE = 25;

export function ReceiptsTab({
  month,
  items,
  positions,
  level,
  actingPosition,
}: {
  month: string;
  items: ChemicalItem[];
  positions: { code: string; label: string }[];
  level: PermissionLevel;
  actingPosition: string | null;
}) {
  const [allMonths, setAllMonths] = useState(false);
  const [q, setQ] = useState("");
  const [itemId, setItemId] = useState("");
  const [position, setPosition] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ChemicalReceipt | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChemicalReceipt | null>(null);

  const filters = useMemo(
    () => ({
      month: allMonths ? undefined : month,
      itemId: itemId || undefined,
      position: position || undefined,
      q: q || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [allMonths, month, itemId, position, q, page]
  );

  const { data, isLoading, isError, refetch } = useChemicalReceipts(filters);
  const removeReceipt = useDeleteChemicalReceipt();

  const canManage = level === "manage" || level === "full";
  const canWrite = canManage || (level === "personal" && positions.some((p) => positionsMatch(p.code, actingPosition)));
  const canDelete = canManage;
  const canEditReceipt = (receipt: ChemicalReceipt) =>
    canManage || (level === "personal" && positionsMatch(receipt.receivingPosition, actingPosition));
  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Tìm biển số, cương vị, ghi chú…"
          className="w-full sm:w-72"
        />
        <select
          value={itemId}
          onChange={(e) => {
            setItemId(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Lọc theo hóa chất"
        >
          <option value="">Tất cả hóa chất</option>
          {items
            .filter((i) => i.itemType === "CHEMICAL")
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
        </select>
        <select
          value={position}
          onChange={(e) => {
            setPosition(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Lọc theo cương vị"
        >
          <option value="">Tất cả cương vị</option>
          {positions.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={allMonths}
            onChange={(e) => {
              setAllMonths(e.target.checked);
              setPage(1);
            }}
            className="h-4 w-4 rounded border-input"
          />
          Xem tất cả các tháng
        </label>
        {canWrite && (
          <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" /> Thêm phiếu
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Không tải được danh sách phiếu"
          action={{ label: "Thử lại", onClick: () => void refetch() }}
        />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          title={allMonths ? "Chưa có phiếu nhập nào" : `Tháng ${periodLabel(month)} chưa có phiếu nhập`}
          description={canWrite ? "Bấm “Thêm phiếu” để ghi chuyến xe đầu tiên." : undefined}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Ngày</th>
                  <th className="px-3 py-2 text-left font-semibold">Hóa chất</th>
                  <th className="px-3 py-2 text-left font-semibold">Biển số</th>
                  <th className="px-3 py-2 text-right font-semibold">Cân nhà máy</th>
                  <th className="px-3 py-2 text-right font-semibold">Cân nhà thầu</th>
                  <th className="px-3 py-2 text-right font-semibold">Công nhận</th>
                  <th className="px-3 py-2 text-left font-semibold">Cương vị</th>
                  <th className="w-20 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.receivedAt.split("-").reverse().join("/")}</td>
                    <td className="px-3 py-2">
                      <span className="block truncate">{r.itemName}</span>
                      {r.materialTicketId && (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-800">
                          <Link2 className="h-3 w-3" /> Từ phiếu vật tư
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="tabular-nums">{r.vehicleNumber ?? "—"}</span>
                      {r.vehicleRef && r.vehicleRef !== r.vehicleNumber && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground">sổ: {r.vehicleRef}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.plantWeight)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.contractorWeight)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {fmt(r.acceptedWeight)} <span className="text-[11px] text-muted-foreground">{UNIT_LABELS[r.baseUnit]}</span>
                    </td>
                    <td className="px-3 py-2">
                      {r.receivingPositionRaw ? (
                        <span
                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-900"
                          title={r.receivingPositionRaw}
                        >
                          <AlertTriangle className="h-3 w-3" /> Cần tách cương vị
                        </span>
                      ) : (
                        <span className="text-xs">{r.receivingPositionLabel ?? "—"}</span>
                      )}
                      {r.warnings.length > 0 && (
                        <span className="mt-0.5 block text-[11px] text-amber-800">
                          {r.warnings.map(warningLabel).join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      {canEditReceipt(r) && (
                        <button
                          type="button"
                          onClick={() => setEditing(r)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-ink"
                          aria-label="Sửa phiếu"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && r.deletable && (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(r)}
                          className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                          aria-label="Xóa phiếu"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {data.meta.total} phiếu · trang {data.meta.page}/{totalPages}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Trang trước
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Trang sau
              </Button>
            </div>
          </div>
        </>
      )}

      {editing && (
        <ReceiptDialog
          receipt={editing === "new" ? null : editing}
          month={month}
          items={items}
          positions={positions}
          level={level}
          actingPosition={actingPosition}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Xóa phiếu nhập"
        description={
          confirmDelete
            ? `Xóa chuyến xe ${confirmDelete.vehicleNumber ?? ""} ngày ${confirmDelete.receivedAt} (${fmt(confirmDelete.acceptedWeight)})? Tồn kho và đối chiếu hợp đồng sẽ được tính lại.`
            : undefined
        }
        confirmLabel="Xóa"
        loading={removeReceipt.isPending}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await removeReceipt.mutateAsync(confirmDelete.id);
            toast.success("Đã xóa phiếu nhập");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không xóa được");
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

/** Hộp tạo/sửa một chuyến xe. Khối lượng công nhận hiện ngay khi gõ hai số cân. */
function ReceiptDialog({
  receipt,
  month,
  items,
  positions,
  level,
  actingPosition,
  onClose,
}: {
  receipt: ChemicalReceipt | null;
  month: string;
  items: ChemicalItem[];
  positions: { code: string; label: string }[];
  level: PermissionLevel;
  actingPosition: string | null;
  onClose: () => void;
}) {
  const create = useCreateChemicalReceipt();
  const update = useUpdateChemicalReceipt();
  const chemicals = items.filter((i) => i.itemType === "CHEMICAL");
  const positionChoices =
    level === "personal" ? positions.filter((p) => positionsMatch(p.code, actingPosition)) : positions;
  const personalPosition = level === "personal" ? positionChoices[0]?.code ?? "" : "";

  const [form, setForm] = useState({
    itemId: receipt?.itemId ?? chemicals[0]?.id ?? "",
    receivedAt: receipt?.receivedAt ?? `${month}-01`,
    vehicleNumber: receipt?.vehicleNumber ?? "",
    plantWeight: receipt?.plantWeight === null || receipt?.plantWeight === undefined ? "" : String(receipt.plantWeight),
    contractorWeight:
      receipt?.contractorWeight === null || receipt?.contractorWeight === undefined ? "" : String(receipt.contractorWeight),
    // Quyền cá nhân luôn bị ghim vào cương vị đang đảm nhiệm; cấp quản lý dùng
    // cương vị mặc định của hóa chất nhưng vẫn có thể điều chỉnh.
    receivingPosition:
      receipt?.receivingPosition ??
      (personalPosition || chemicals.find((i) => i.id === (receipt?.itemId ?? chemicals[0]?.id))?.defaultPosition || ""),
    note: receipt?.note ?? "",
  });

  const plant = toNum(form.plantWeight);
  const contractor = toNum(form.contractorWeight);
  const accepted = plant !== null && contractor !== null ? Math.min(plant, contractor) : (plant ?? contractor);
  const onlyOneWeight = (plant === null) !== (contractor === null);
  const periodOfDate = form.receivedAt.slice(0, 7);
  const movesPeriod = periodOfDate !== month;
  const pending = create.isPending || update.isPending;

  const item = items.find((i) => i.id === form.itemId);

  async function submit() {
    const payload = {
      itemId: form.itemId,
      receivedAt: form.receivedAt,
      vehicleNumber: form.vehicleNumber || null,
      plantWeight: plant,
      contractorWeight: contractor,
      receivingPosition: form.receivingPosition || null,
      note: form.note || null,
    };
    try {
      if (receipt) {
        await update.mutateAsync({ id: receipt.id, ...payload });
        toast.success("Đã cập nhật phiếu nhập");
      } else {
        const res = await create.mutateAsync(payload);
        if (res.status === "linked") toast.warning(res.message ?? "Đã gắn vào phiếu có sẵn");
        else toast.success("Đã tạo phiếu nhập");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu thất bại");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{receipt ? "Sửa phiếu nhập" : "Thêm phiếu nhập"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ci-item">Hóa chất</Label>
              <select
                id="ci-item"
                value={form.itemId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  const nextDefault = personalPosition || chemicals.find((i) => i.id === nextId)?.defaultPosition || "";
                  setForm((f) => {
                    // Chỉ ghi đè khi ô đang trống hoặc đang giữ mặc định của hóa chất cũ —
                    // người dùng đã chọn tay thì tôn trọng lựa chọn đó.
                    const previousDefault = chemicals.find((i) => i.id === f.itemId)?.defaultPosition ?? "";
                    const keepManual = f.receivingPosition && f.receivingPosition !== previousDefault;
                    return { ...f, itemId: nextId, receivingPosition: keepManual ? f.receivingPosition : nextDefault };
                  });
                }}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {chemicals.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="ci-date">Ngày nhập</Label>
              <Input
                id="ci-date"
                type="date"
                value={form.receivedAt}
                onChange={(e) => setForm((f) => ({ ...f, receivedAt: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>

          {movesPeriod && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Ngày này thuộc tháng khác — phiếu sẽ chuyển sang kỳ <strong>{periodLabel(periodOfDate)}</strong>.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ci-plate">Biển số xe</Label>
              <Input
                id="ci-plate"
                value={form.vehicleNumber}
                maxLength={12}
                placeholder="51C-214.77"
                onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
                className="mt-1 tabular-nums"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Tối đa {MAX_VEHICLE_NUMBER_LENGTH} ký tự sau khi bỏ dấu gạch và dấu chấm.
              </span>
            </div>
            <div>
              <Label htmlFor="ci-position">Cương vị nhận</Label>
              <select
                id="ci-position"
                value={form.receivingPosition}
                onChange={(e) => setForm((f) => ({ ...f, receivingPosition: e.target.value }))}
                disabled={level === "personal"}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {level !== "personal" && <option value="">— Chưa xác định —</option>}
                {positionChoices.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ci-plant">Khối lượng cân nhà máy</Label>
              <Input
                id="ci-plant"
                inputMode="decimal"
                value={form.plantWeight}
                onChange={(e) => setForm((f) => ({ ...f, plantWeight: e.target.value }))}
                className="mt-1 text-right tabular-nums"
              />
            </div>
            <div>
              <Label htmlFor="ci-contractor">Khối lượng cân nhà thầu</Label>
              <Input
                id="ci-contractor"
                inputMode="decimal"
                value={form.contractorWeight}
                onChange={(e) => setForm((f) => ({ ...f, contractorWeight: e.target.value }))}
                className="mt-1 text-right tabular-nums"
              />
            </div>
          </div>

          <div
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2",
              accepted === null ? "bg-muted text-muted-foreground" : "bg-navy text-white"
            )}
          >
            <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Khối lượng được công nhận</span>
            <span className="text-lg font-medium tabular-nums">
              {fmt(accepted)} {item ? UNIT_LABELS[item.baseUnit] : ""}
            </span>
          </div>

          {onlyOneWeight && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Chỉ có một số cân nên không đối chứng được — bắt buộc ghi chú lý do.
            </p>
          )}

          <div>
            <Label htmlFor="ci-note">Ghi chú{onlyOneWeight && " (bắt buộc)"}</Label>
            <Textarea
              id="ci-note"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              rows={2}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Hủy
          </Button>
          <Button onClick={() => void submit()} disabled={pending || accepted === null || (onlyOneWeight && !form.note.trim())}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toNum(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
