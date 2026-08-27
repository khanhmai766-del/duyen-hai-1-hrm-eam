"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Lock, LockOpen, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UNIT_LABELS } from "@/lib/chemical-inventory/constants";
import {
  useChemicalInventory,
  useLockChemicalPeriod,
  useOpenChemicalPeriod,
  useUnlockChemicalPeriod,
  useUpdatePeriodGeneration,
} from "@/hooks/useChemicalInventory";
import { MonthlyGrid } from "./MonthlyGrid";
import { Nh3DailyLog } from "./Nh3DailyLog";
import { ReceiptsTab } from "./ReceiptsTab";
import { AnnualTab } from "./AnnualTab";
import { ContractsTab } from "./ContractsTab";
import { ImportHistoryTab } from "./ImportHistoryTab";
import { ImportDialog } from "./ImportDialog";
import { fmt, periodLabel, warningLabel, PeriodStatusBadge, UNIT_GROUPS } from "./shared";

/**
 * Trang "Tồn kho hóa chất".
 *
 * Toàn bộ trang làm việc trong ngữ cảnh MỘT THÁNG đang chọn — đó là điểm khác căn
 * bản so với sổ Excel gộp nhiều năm vào một bảng dài.
 */

function currentPeriodKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftPeriod(periodKey: string, delta: number) {
  const [year, month] = periodKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function ChemicalInventoryPage() {
  const [month, setMonth] = useState(currentPeriodKey);
  const [tab, setTab] = useState("overview");
  const [year, setYear] = useState(() => Number(currentPeriodKey().slice(0, 4)));
  const [dailyItemId, setDailyItemId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [generationDraft, setGenerationDraft] = useState("");

  const { data, isLoading, isError, refetch } = useChemicalInventory(month);
  const openPeriod = useOpenChemicalPeriod();
  const lockPeriod = useLockChemicalPeriod();
  const unlockPeriod = useUnlockChemicalPeriod();
  const saveGeneration = useUpdatePeriodGeneration();

  const grid = data?.grid;
  const meta = data?.meta;
  const level = meta?.level ?? "read";
  const locked = grid?.period.status === "LOCKED";
  const canManage = level === "manage" || level === "full";
  const canUnlock = level === "full";

  // Mặt hàng theo dõi hằng ngày — hiện chỉ NH3, nhưng không hardcode mã.
  const dailyItems = useMemo(() => (meta?.items ?? []).filter((i) => i.trackingMode === "DAILY"), [meta]);

  useEffect(() => {
    if (!dailyItemId && dailyItems.length > 0) setDailyItemId(dailyItems[0].id);
  }, [dailyItems, dailyItemId]);

  useEffect(() => {
    setGenerationDraft(grid?.period.generationMwh === null || grid?.period.generationMwh === undefined ? "" : String(grid.period.generationMwh));
  }, [grid?.period.generationMwh, month]);

  async function handleOpenPeriod() {
    try {
      await openPeriod.mutateAsync(month);
      toast.success(`Đã mở kỳ ${periodLabel(month)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không mở được kỳ");
    }
  }

  async function handleSaveGeneration() {
    if (!canManage) return;
    const text = generationDraft.trim().replace(",", ".");
    const value = text === "" ? null : Number(text);
    if (value !== null && !Number.isFinite(value)) {
      toast.error("Sản lượng phải là số hợp lệ");
      return;
    }
    try {
      await saveGeneration.mutateAsync({ periodKey: month, generationMwh: value });
      toast.success("Đã lưu sản lượng điện");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu thất bại");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="TỊNH KHO HÓA CHẤT"
        description={
          grid
            ? `Sổ theo dõi hóa chất và nhiên liệu của Phân xưởng Vận hành 1 — kỳ ${periodLabel(month)}`
            : "Sổ theo dõi hóa chất và nhiên liệu của Phân xưởng Vận hành 1"
        }
      >
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setMonth(shiftPeriod(month, -1))} aria-label="Tháng trước">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[76px] text-center text-sm font-semibold tabular-nums">{periodLabel(month)}</span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setMonth(shiftPeriod(month, 1))} aria-label="Tháng sau">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {grid && <PeriodStatusBadge status={grid.period.status} />}

        {grid && !grid.period.exists && canManage && (
          <Button size="sm" variant="soft" onClick={() => void handleOpenPeriod()} disabled={openPeriod.isPending}>
            {openPeriod.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Mở kỳ {periodLabel(month)}
          </Button>
        )}

        {canManage && (
          <Button size="sm" variant="soft" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1 h-4 w-4" /> Nhập từ Excel
          </Button>
        )}

        {grid?.period.exists && canManage && !locked && (
          <Button size="sm" variant="soft" onClick={() => setConfirmLock(true)}>
            <Lock className="mr-1 h-4 w-4" /> Khóa sổ tháng
          </Button>
        )}

        {locked && canUnlock && (
          <Button size="sm" variant="outline" onClick={() => setConfirmUnlock(true)}>
            <LockOpen className="mr-1 h-4 w-4" /> Mở khóa
          </Button>
        )}
      </PageHeader>

      {/* ---------------- KPI ---------------- */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : isError || !grid || !meta ? (
        <EmptyState
          icon={AlertTriangle}
          title="Không tải được dữ liệu tồn kho"
          description="Kiểm tra kết nối rồi thử lại."
          action={{ label: "Thử lại", onClick: () => void refetch() }}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {/* Mỗi đơn vị một thẻ riêng — kg, tấn và lít không cộng chung được. */}
            {UNIT_GROUPS.map((group) => {
              const totals = grid.totalsByUnit[group.unit];
              return (
                <div key={group.unit} className="rounded-xl border border-border bg-white p-4">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label} · tồn cuối kỳ
                  </span>
                  <span className="mt-1 block text-2xl font-semibold tabular-nums text-ink">
                    {fmt(totals?.closing ?? null, 0)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">{UNIT_LABELS[group.unit]}</span>
                  </span>
                  <span className="mt-1 block text-[11px] tabular-nums text-muted-foreground">
                    Nhập {fmt(totals?.received ?? null, 0)} · Sử dụng {fmt(totals?.consumed ?? null, 0)}
                  </span>
                </div>
              );
            })}

            <div className="rounded-xl border border-border bg-navy p-4 text-white">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/70">
                Suất hao đầu cực NH3
              </span>
              <span className="mt-1 block text-2xl font-semibold tabular-nums">
                {grid.specificConsumption === null ? "—" : grid.specificConsumption.toFixed(3)}
                <span className="ml-1 text-xs font-normal text-white/70">kg/MWh</span>
              </span>
              <div className="mt-2 flex items-center gap-1">
                <Input
                  inputMode="decimal"
                  value={generationDraft}
                  disabled={!canManage || locked || !grid.period.exists}
                  onChange={(e) => setGenerationDraft(e.target.value)}
                  onBlur={() => void handleSaveGeneration()}
                  placeholder="Sản lượng S1+S2"
                  className="h-7 border-white/30 bg-white/10 text-right text-xs tabular-nums text-white placeholder:text-white/50"
                  aria-label="Sản lượng điện S1+S2 (MWh)"
                />
                <span className="text-[10px] text-white/70">MWh</span>
              </div>
            </div>

            <div
              className={cn(
                "rounded-xl border p-4",
                grid.warningCount > 0 ? "border-amber-300 bg-amber-50" : "border-border bg-white"
              )}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Mặt hàng có cảnh báo
              </span>
              <span
                className={cn(
                  "mt-1 block text-2xl font-semibold tabular-nums",
                  grid.warningCount > 0 ? "text-amber-900" : "text-ink"
                )}
              >
                {grid.warningCount}
                <span className="ml-1 text-xs font-normal text-muted-foreground">/ {grid.rows.length}</span>
              </span>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {grid.warningCount > 0 ? "Xem cột Cảnh báo ở tab Tồn theo cương vị" : "Không có sai lệch cần đối chiếu"}
              </span>
            </div>
          </div>

          {!grid.period.exists && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Kỳ {periodLabel(month)} chưa được mở nên chưa nhập được số liệu.
                {canManage ? " Bấm “Mở kỳ” ở đầu trang." : " Liên hệ người quản lý để mở kỳ."}
              </span>
            </div>
          )}

          {/* ---------------- Tabs ---------------- */}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex w-full flex-wrap justify-start">
              <TabsTrigger value="overview">Tổng quan</TabsTrigger>
              {dailyItems.length > 0 && <TabsTrigger value="daily">Nhật ký NH3</TabsTrigger>}
              <TabsTrigger value="grid">Tồn theo cương vị</TabsTrigger>
              <TabsTrigger value="receipts">Phiếu nhập</TabsTrigger>
              <TabsTrigger value="annual">Tổng hợp năm</TabsTrigger>
              <TabsTrigger value="contracts">Hợp đồng</TabsTrigger>
              {canManage && <TabsTrigger value="history">Lịch sử đồng bộ</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <OverviewTab grid={grid} onOpenTab={setTab} />
            </TabsContent>

            {dailyItems.length > 0 && (
              <TabsContent value="daily" className="mt-4">
                {dailyItems.length > 1 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {dailyItems.map((item) => (
                      <Button
                        key={item.id}
                        size="sm"
                        variant={dailyItemId === item.id ? "default" : "outline"}
                        onClick={() => setDailyItemId(item.id)}
                      >
                        {item.name}
                      </Button>
                    ))}
                  </div>
                )}
                <Nh3DailyLog
                  month={month}
                  itemId={dailyItemId}
                  level={level}
                  actingPosition={meta.actingPosition}
                  onGoToReceipts={() => setTab("receipts")}
                />
              </TabsContent>
            )}

            <TabsContent value="grid" className="mt-4">
              <MonthlyGrid
                grid={grid}
                month={month}
                level={level}
                actingPosition={meta.actingPosition}
                onOpenDaily={(itemId) => {
                  setDailyItemId(itemId);
                  setTab("daily");
                }}
              />
            </TabsContent>

            <TabsContent value="receipts" className="mt-4">
              <ReceiptsTab
                month={month}
                items={meta.items}
                positions={grid.positions}
                level={level}
                actingPosition={meta.actingPosition}
              />
            </TabsContent>

            <TabsContent value="annual" className="mt-4">
              <AnnualTab year={year} onChangeYear={setYear} />
            </TabsContent>

            <TabsContent value="contracts" className="mt-4">
              <ContractsTab year={year} items={meta.items} level={level} onChangeYear={setYear} />
            </TabsContent>

            {canManage && (
              <TabsContent value="history" className="mt-4">
                <ImportHistoryTab />
              </TabsContent>
            )}
          </Tabs>
        </>
      )}

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} level={level} />

      <ConfirmDialog
        open={confirmLock}
        onOpenChange={setConfirmLock}
        title={`Khóa sổ kỳ ${periodLabel(month)}`}
        description="Sau khi khóa, không ai thêm/sửa/xóa được phiếu nhập lẫn số liệu tồn của tháng này."
        confirmLabel="Khóa sổ"
        destructive={false}
        loading={lockPeriod.isPending}
        onConfirm={async () => {
          try {
            await lockPeriod.mutateAsync({ periodKey: month });
            toast.success(`Đã khóa sổ kỳ ${periodLabel(month)}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không khóa được");
          }
          setConfirmLock(false);
        }}
      />

      <ConfirmDialog
        open={confirmUnlock}
        onOpenChange={(open) => {
          setConfirmUnlock(open);
          if (!open) setUnlockReason("");
        }}
        title={`Mở khóa kỳ ${periodLabel(month)}`}
        description="Mở lại sổ đã chốt là sửa số liệu quyết toán. Ghi rõ lý do để lưu vào nhật ký."
        confirmLabel="Mở khóa"
        loading={unlockPeriod.isPending}
        confirmDisabled={!unlockReason.trim()}
        onConfirm={async () => {
          try {
            await unlockPeriod.mutateAsync({ periodKey: month, reason: unlockReason.trim() });
            toast.success("Đã mở khóa kỳ");
            setUnlockReason("");
            setConfirmUnlock(false);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không mở khóa được");
          }
        }}
      >
        <Input
          value={unlockReason}
          onChange={(e) => setUnlockReason(e.target.value)}
          placeholder="Lý do mở khóa (bắt buộc)"
          aria-label="Lý do mở khóa"
        />
      </ConfirmDialog>
    </div>
  );
}

/** Tab Tổng quan: nhìn nhanh mặt hàng nào có sai lệch cần xử lý. */
function OverviewTab({
  grid,
  onOpenTab,
}: {
  grid: NonNullable<ReturnType<typeof useChemicalInventory>["data"]>["grid"];
  onOpenTab: (tab: string) => void;
}) {
  const flagged = grid.rows.filter((r) => r.warnings.length > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* `min-w-0`: thiếu nó thì bảng 5 cột bên dưới ép giãn cả ô lưới, kéo THEO cả
          thẻ "Cần đối chiếu" bên cạnh rộng ra 405px và làm cả trang cuộn ngang. */}
      <div className="min-w-0 rounded-xl border border-border bg-white p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink">Cân đối trong kỳ</h3>
        <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[300px] text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="py-1.5 text-left font-semibold">Mặt hàng</th>
              <th className="py-1.5 text-right font-semibold">Tồn đầu</th>
              <th className="py-1.5 text-right font-semibold">Nhập</th>
              <th className="py-1.5 text-right font-semibold">Sử dụng</th>
              <th className="py-1.5 text-right font-semibold">Tồn cuối</th>
            </tr>
          </thead>
          <tbody>
            {grid.rows
              .filter((r) => r.itemType === "CHEMICAL")
              .map((r) => (
                <tr key={r.itemId} className="border-b border-border/50 last:border-0">
                  <td className="max-w-[110px] truncate py-1.5 pr-2 sm:max-w-[180px]">{r.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(r.openingTotal, 0)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(r.receivedTotal, 0)}</td>
                  <td className={cn("py-1.5 text-right tabular-nums", r.consumedTotal !== null && r.consumedTotal < 0 && "font-semibold text-red-700")}>
                    {fmt(r.consumedTotal, 0)}
                  </td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{fmt(r.closingTotal, 0)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Đơn vị: kg. Nhiên liệu xem ở tab Tồn theo cương vị.</p>
      </div>

      <div className="min-w-0 rounded-xl border border-border bg-white p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink">Cần đối chiếu</h3>
        {flagged.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Không có mặt hàng nào cần đối chiếu trong kỳ này.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {flagged.map((r) => (
              <li key={r.itemId} className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                <span className="block text-sm font-medium text-ink">{r.name}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-amber-900">
                  {r.warnings.map(warningLabel).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => onOpenTab("grid")}
          className="mt-3 text-xs text-accent underline-offset-2 hover:underline"
        >
          Mở bảng tồn theo cương vị →
        </button>
      </div>
    </div>
  );
}
