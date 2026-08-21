"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  useChemicalDailyLog,
  useCreateChemicalReceipt,
  useDeleteChemicalReceipt,
  useSaveChemicalDailyReading,
  type DailyLogRow,
  type PermissionLevel,
} from "@/hooks/useChemicalInventory";
import { UNIT_LABELS } from "@/lib/chemical-inventory/constants";
import { positionsMatch } from "@/lib/position-catalog";
import { fmt, periodLabel, warningLabel } from "./shared";

/**
 * Nhật ký NH3 theo ngày.
 *
 * Bố cục mượn từ NH3Tracker.jsx do người dùng cung cấp — dải 31 ngày bên trái,
 * phương trình cân bằng làm trung tâm, bảng xe, khối kiểm tra — nhưng dựng lại
 * hoàn toàn bằng Tailwind + primitive của repo. Cố ý KHÔNG mang theo bảng màu và
 * font riêng của tệp mẫu: trang này phải trông giống phần còn lại của phần mềm.
 *
 * Người trực chỉ nhập MỘT số mỗi ngày là tồn 24h. Tồn 00h lấy từ ngày trước, lượng
 * nhập cộng từ các chuyến xe, lượng đã dùng do máy tính — không ô nào trong ba ô đó
 * gõ tay được.
 */

const DAY_MS = 86_400_000;

export function Nh3DailyLog({
  month,
  itemId,
  level,
  actingPosition,
  onGoToReceipts,
}: {
  month: string;
  itemId: string | null;
  level: PermissionLevel;
  actingPosition: string | null;
  onGoToReceipts: () => void;
}) {
  const { data, isLoading, isError, refetch } = useChemicalDailyLog(month, itemId);
  const saveReading = useSaveChemicalDailyReading();
  const createReceipt = useCreateChemicalReceipt();
  const deleteReceipt = useDeleteChemicalReceipt();

  const [selectedDay, setSelectedDay] = useState(1);
  const [draft, setDraft] = useState<string>("");
  const [truckDraft, setTruckDraft] = useState({ plate: "", plant: "", contractor: "" });
  const [confirmTruck, setConfirmTruck] = useState<{ id: string; label: string } | null>(null);

  const canManage = level === "manage" || level === "full";
  const canWrite = canManage || (level === "personal" && positionsMatch(actingPosition, data?.item.defaultPosition));
  const locked = data?.period.status === "LOCKED";
  const editable = canWrite && !locked;
  const canDelete = canManage && !locked;

  const row: DailyLogRow | undefined = data?.rows.find((r) => r.day === selectedDay);

  // Quy đổi hiển thị: lưu kg, người trực quen đọc theo tấn.
  const factor = data && data.item.displayUnit === "TON" && data.item.baseUnit === "KG" ? 1000 : 1;
  const unit = data ? UNIT_LABELS[data.item.displayUnit ?? data.item.baseUnit] : "";
  const toDisplay = (v: number | null) => (v === null ? null : v / factor);

  useEffect(() => {
    setDraft(row?.closingStock === null || row?.closingStock === undefined ? "" : String(toDisplay(row.closingStock)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.closingStock, selectedDay, month, itemId]);

  const parsedDraft = useMemo(() => {
    const text = draft.trim().replace(",", ".");
    if (!text) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : NaN;
  }, [draft]);

  const draftInvalid = typeof parsedDraft === "number" && Number.isNaN(parsedDraft);
  const dirty = row ? String(toDisplay(row.closingStock) ?? "") !== draft.trim() : false;

  /**
   * Lượng đã dùng hiện ngay khi gõ, chưa cần lưu — người trực thấy số âm là biết
   * gõ nhầm trước khi bấm nút.
   */
  const previewUsed = useMemo(() => {
    if (!row) return null;
    if (parsedDraft === null || draftInvalid) return row.used === null ? null : row.used / factor;
    if (row.openingStock === null) return null;
    return row.openingStock / factor + (row.importedToday ?? 0) / factor - (parsedDraft as number);
  }, [row, parsedDraft, draftInvalid, factor]);

  const maxUsed = useMemo(
    () => Math.max(1, ...(data?.rows ?? []).map((r) => r.used ?? 0)),
    [data]
  );

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Skeleton className="h-[520px] w-full rounded-xl" />
        <Skeleton className="h-[520px] w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon={XCircle}
        title="Không tải được nhật ký"
        description="Kiểm tra kết nối rồi thử lại."
        action={{ label: "Thử lại", onClick: () => void refetch() }}
      />
    );
  }

  if (!data.period.exists) {
    return (
      <EmptyState
        title={`Kỳ ${periodLabel(month)} chưa được mở`}
        description="Mở kỳ ở đầu trang trước khi ghi nhật ký."
      />
    );
  }

  async function handleSave() {
    if (!row || !itemId || draftInvalid) return;
    try {
      await saveReading.mutateAsync({
        date: row.date,
        itemId,
        positionCode: data?.item.defaultPosition ?? "AUX_BOILER_NH3",
        quantity: parsedDraft === null ? null : (parsedDraft as number) * factor,
      });
      toast.success(`Đã lưu tồn 24h ngày ${row.day}/${periodLabel(month)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu thất bại");
    }
  }

  async function handleAddTruck() {
    if (!row || !itemId) return;
    const plant = Number(truckDraft.plant.replace(",", "."));
    const contractor = Number(truckDraft.contractor.replace(",", "."));
    if (!Number.isFinite(plant) || !Number.isFinite(contractor)) {
      toast.error("Phải nhập cả hai số cân");
      return;
    }
    try {
      const res = await createReceipt.mutateAsync({
        itemId,
        receivedAt: row.date,
        vehicleNumber: truckDraft.plate || null,
        plantWeight: plant * factor,
        contractorWeight: contractor * factor,
        receivingPosition: data?.item.defaultPosition ?? "AUX_BOILER_NH3",
      });
      setTruckDraft({ plate: "", plant: "", contractor: "" });
      if (res.status === "linked") {
        toast.warning(res.message ?? "Chuyến xe này đã được ghi trước đó — đã gắn vào phiếu cũ");
      } else {
        toast.success("Đã ghi chuyến xe");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không ghi được chuyến xe");
    }
  }

  const gaugePercent =
    data.item.tankCapacity && row?.closingStock !== null && row?.closingStock !== undefined
      ? Math.min(100, Math.max(0, (row.closingStock / data.item.tankCapacity) * 100))
      : 0;
  const lowMark =
    data.item.tankCapacity && data.item.lowStockThreshold
      ? (data.item.lowStockThreshold / data.item.tankCapacity) * 100
      : null;

  const daysOfStock =
    row?.closingStock !== null && row?.closingStock !== undefined && data.medianUsage && data.medianUsage > 0
      ? Math.floor(row.closingStock / data.medianUsage)
      : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[264px_1fr] lg:items-start">
      {/* ---------------- Dải 31 ngày ---------------- */}
      <nav
        className="max-h-[280px] overflow-y-auto rounded-xl border border-border bg-white lg:max-h-[calc(100vh-260px)]"
        aria-label="Chọn ngày"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-muted/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
          <span>Ngày</span>
          <span>Đã dùng · {unit}</span>
        </div>
        {data.rows.map((r) => {
          const active = r.day === selectedDay;
          return (
            <button
              key={r.day}
              type="button"
              onClick={() => setSelectedDay(r.day)}
              aria-current={active}
              className={cn(
                "relative grid w-full grid-cols-[28px_1fr_64px] items-center gap-2 border-b border-border/60 px-3 py-1.5 text-left transition-colors hover:bg-muted",
                active && "bg-sky-50"
              )}
            >
              {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden="true" />}
              <span className={cn("text-xs tabular-nums", active ? "font-semibold text-accent" : "text-muted-foreground")}>
                {String(r.day).padStart(2, "0")}
              </span>
              <span className="h-1.5 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
                <span
                  className={cn("block h-full rounded-sm", active ? "bg-accent" : "bg-navy/60")}
                  style={{ width: `${Math.max(0, Math.min(100, ((r.used ?? 0) / maxUsed) * 100))}%` }}
                />
              </span>
              <span className="text-right text-xs tabular-nums">{r.used ? fmt(toDisplay(r.used), 2) : "—"}</span>
              {r.warnings.length > 0 && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" title={r.warnings.map(warningLabel).join("; ")} />
              )}
            </button>
          );
        })}
      </nav>

      {/* ---------------- Vùng nhập liệu ---------------- */}
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h3 className="text-xl font-bold tracking-tight text-ink">
            {String(selectedDay).padStart(2, "0")}/{periodLabel(month)}
          </h3>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{data.item.name}</span>
          {locked && <span className="text-xs font-semibold text-emerald-700">Kỳ đã khóa sổ — chỉ xem</span>}
        </div>

        {/* --- Phương trình cân bằng --- */}
        <section className="rounded-xl border border-border border-t-[3px] border-t-navy bg-white p-4">
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_minmax(140px,1.1fr)]">
            <Field label="Tồn 00h00">
              <ReadonlyBox value={fmt(toDisplay(row?.openingStock ?? null))} />
            </Field>
            <Operator>+</Operator>
            <Field label="Nhập trong ngày">
              <ReadonlyBox value={fmt(toDisplay(row?.importedToday ?? null))} />
            </Field>
            <Operator>−</Operator>
            <Field label="Tồn 24h00">
              <Input
                inputMode="decimal"
                value={draft}
                disabled={!editable}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !draftInvalid) void handleSave();
                }}
                className={cn("h-11 text-right text-lg tabular-nums", draftInvalid && "border-red-500")}
                aria-label="Tồn 24h00"
              />
            </Field>
            <Operator>=</Operator>
            <div
              className={cn(
                "rounded-md px-3 py-2",
                previewUsed !== null && previewUsed < 0 ? "bg-red-600 text-white" : "bg-navy text-white"
              )}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/70">
                Đã dùng · {unit}
              </span>
              <span className="block text-right text-xl font-medium tabular-nums">{fmt(previewUsed)}</span>
            </div>
          </div>

          {draftInvalid && <p className="mt-2 text-sm text-red-600">Tồn 24h phải là số hợp lệ.</p>}

          <p className="mt-3 text-xs text-muted-foreground">
            Tồn đầu ngày lấy tự động từ tồn 24h ngày trước. Lượng nhập cộng từ các chuyến xe bên dưới.
            Cả hai ô đều không nhập tay được.
          </p>

          {/* --- Mức bồn --- */}
          {data.item.tankCapacity && (
            <div className="mt-4 border-t border-border pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Mức bồn cuối ngày
              </span>
              <div className="relative mt-1.5 h-5 overflow-hidden rounded-md bg-muted">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-accent to-navy transition-[width] duration-300"
                  style={{ width: `${gaugePercent}%` }}
                />
                {lowMark !== null && (
                  <span className="absolute inset-y-0 w-px bg-red-500" style={{ left: `${lowMark}%` }} title="Ngưỡng tồn thấp" />
                )}
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="tabular-nums">
                  {fmt(toDisplay(row?.closingStock ?? null), 1)} / {fmt(toDisplay(data.item.tankCapacity), 0)} {unit}
                </span>
                <span>
                  {daysOfStock !== null
                    ? `Đủ dùng khoảng ${daysOfStock} ngày ở mức tiêu thụ trung vị tháng`
                    : "Chưa đủ dữ liệu để dự báo"}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* --- Bảng xe --- */}
        <section className="rounded-xl border border-border bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <h4 className="text-sm font-bold uppercase tracking-wider text-ink">Xe nhập trong ngày</h4>
            <span className="text-xs text-muted-foreground">{row?.trucks.length ?? 0} xe</span>
            <button type="button" onClick={onGoToReceipts} className="ml-auto text-xs text-accent underline-offset-2 hover:underline">
              Xem toàn bộ phiếu nhập
            </button>
          </div>

          {row && row.trucks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="w-10 px-4 py-2 text-left font-semibold">#</th>
                    <th className="px-4 py-2 text-left font-semibold">Biển số</th>
                    <th className="px-4 py-2 text-right font-semibold">Cân nhà máy</th>
                    <th className="px-4 py-2 text-right font-semibold">Cân nhà thầu</th>
                    <th className="px-4 py-2 text-right font-semibold">Công nhận · {unit}</th>
                    <th className="w-12 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {row.trucks.map((t, i) => (
                    <tr key={t.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 text-xs tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2">
                        <span className="font-medium tabular-nums">{t.vehicleNumber ?? "—"}</span>
                        {t.vehicleRef && t.vehicleRef !== t.vehicleNumber && (
                          <span className="ml-2 text-[11px] text-muted-foreground">sổ ghi: {t.vehicleRef}</span>
                        )}
                        {t.materialTicketId && (
                          <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-800">Từ phiếu vật tư</span>
                        )}
                        {t.warnings.length > 0 && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-700" title={t.warnings.map(warningLabel).join("; ")}>
                            <AlertTriangle className="h-3 w-3" />
                            {t.warnings.map(warningLabel).join("; ")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(toDisplay(t.plantWeight), 2)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(toDisplay(t.contractorWeight), 2)}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{fmt(toDisplay(t.acceptedWeight), 2)}</td>
                      <td className="px-2 py-2 text-right">
                        {canDelete && !t.materialTicketId && (
                          <button
                            type="button"
                            onClick={() => setConfirmTruck({ id: t.id, label: `${t.vehicleNumber ?? "chuyến xe"} ngày ${shortLabel(row.date)}` })}
                            className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                            aria-label="Xóa chuyến xe"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50">
                    <td colSpan={4} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Tổng nhập trong ngày
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{fmt(toDisplay(row.importedToday), 2)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Ngày này chưa ghi nhận xe nhập. Nếu có xe về, điền biển số và hai số cân bên dưới.
            </p>
          )}

          {editable && (
            <div className="grid gap-2 border-t border-border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Input
                placeholder="Biển số (tối đa 8 ký tự)"
                value={truckDraft.plate}
                onChange={(e) => setTruckDraft((s) => ({ ...s, plate: e.target.value }))}
                className="h-9"
                aria-label="Biển số xe"
              />
              <Input
                placeholder={`Cân nhà máy (${unit})`}
                inputMode="decimal"
                value={truckDraft.plant}
                onChange={(e) => setTruckDraft((s) => ({ ...s, plant: e.target.value }))}
                className="h-9 text-right tabular-nums"
                aria-label="Khối lượng cân nhà máy"
              />
              <Input
                placeholder={`Cân nhà thầu (${unit})`}
                inputMode="decimal"
                value={truckDraft.contractor}
                onChange={(e) => setTruckDraft((s) => ({ ...s, contractor: e.target.value }))}
                className="h-9 text-right tabular-nums"
                aria-label="Khối lượng cân nhà thầu"
              />
              <Button size="sm" variant="soft" onClick={() => void handleAddTruck()} disabled={createReceipt.isPending}>
                {createReceipt.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                Thêm xe
              </Button>
            </div>
          )}
        </section>

        {/* --- Kiểm tra --- */}
        <section>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Kiểm tra số liệu</span>
          <div className="mt-2 space-y-1.5">
            {row && row.warnings.length > 0 ? (
              row.warnings.map((code) => (
                <div
                  key={code}
                  className="flex items-start gap-2 border-l-[3px] border-amber-500 bg-amber-50/60 px-3 py-2 text-sm text-amber-900"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{warningLabel(code)}</span>
                </div>
              ))
            ) : row?.closingStock !== null && row?.closingStock !== undefined ? (
              <div className="flex items-start gap-2 border-l-[3px] border-emerald-600 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Cân bằng khối lượng hợp lệ.</span>
              </div>
            ) : (
              <div className="border-l-[3px] border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Chưa ghi tồn 24h cho ngày này.
              </div>
            )}
          </div>
        </section>

        {/* --- Thao tác --- */}
        {editable && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void handleSave()} disabled={!dirty || draftInvalid || saveReading.isPending}>
              {saveReading.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu ngày {String(selectedDay).padStart(2, "0")}
            </Button>
            {selectedDay < data.rows.length && (
              <Button variant="soft" onClick={() => setSelectedDay(selectedDay + 1)}>
                Sang ngày {String(selectedDay + 1).padStart(2, "0")} →
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              Đối chiếu tháng: tồn đầu {fmt(toDisplay(data.monthOpening))} + nhập {fmt(toDisplay(data.monthReceived))} − tồn cuối{" "}
              {fmt(toDisplay(data.monthClosing))} = {fmt(toDisplay(data.monthConsumed))} {unit}
            </span>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmTruck)}
        onOpenChange={(open) => !open && setConfirmTruck(null)}
        title="Xóa chuyến xe"
        description={`Xóa ${confirmTruck?.label ?? ""}? Lượng nhập trong ngày và tồn kho sẽ được tính lại.`}
        confirmLabel="Xóa"
        onConfirm={async () => {
          if (!confirmTruck) return;
          try {
            await deleteReceipt.mutateAsync(confirmTruck.id);
            toast.success("Đã xóa chuyến xe");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không xóa được");
          }
          setConfirmTruck(null);
        }}
      />
    </div>
  );
}

function shortLabel(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ReadonlyBox({ value }: { value: string }) {
  return (
    <div className="flex h-11 items-center justify-end rounded-md border border-dashed border-border bg-muted/50 px-3 text-lg tabular-nums text-muted-foreground">
      {value}
    </div>
  );
}

function Operator({ children }: { children: React.ReactNode }) {
  return <span className="hidden pb-3 text-center text-lg text-muted-foreground sm:block">{children}</span>;
}
