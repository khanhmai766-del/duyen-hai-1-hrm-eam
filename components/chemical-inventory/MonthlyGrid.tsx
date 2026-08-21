"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { UNIT_LABELS } from "@/lib/chemical-inventory/constants";
import { positionsMatch } from "@/lib/position-catalog";
import {
  useUpdateChemicalReadings,
  type MonthlyGrid as MonthlyGridData,
  type PermissionLevel,
} from "@/hooks/useChemicalInventory";
import { fmt, periodLabel, warningLabel, SaveDot, type SaveState } from "./shared";

/**
 * Lưới tồn kho tháng: 16 mặt hàng × 7 cương vị.
 *
 * Chỉ ô tồn cuối theo cương vị mới gõ được. Bốn cột bên phải (tổng tồn cuối, tồn
 * đầu, nhập, sử dụng) là số DẪN XUẤT — nền xám, chỉ đọc, để không ai tưởng sửa được.
 *
 * Dòng NH3 khóa hẳn: ô tồn cuối của nó sinh ra từ bản đọc ngày 31 trong nhật ký.
 * Đây chính là công đoạn chép tay mà module này bỏ đi.
 */

export function MonthlyGrid({
  grid,
  month,
  level,
  actingPosition,
  onOpenDaily,
}: {
  grid: MonthlyGridData;
  month: string;
  level: PermissionLevel;
  actingPosition: string | null;
  onOpenDaily: (itemId: string) => void;
}) {
  const update = useUpdateChemicalReadings();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const locked = grid.period.status === "LOCKED";
  const canWrite = level === "personal" || level === "manage" || level === "full";

  // Đổi tháng thì bỏ hết bản nháp — nếu không, số của tháng cũ sẽ hiện đè lên tháng mới.
  useEffect(() => {
    setDrafts({});
    setStates({});
    setErrors({});
  }, [month]);

  function cellKey(itemId: string, position: string) {
    return `${itemId}|${position}`;
  }

  /** Mức `personal` chỉ sửa được ô của đúng cương vị đang trực. */
  function canEditCell(row: MonthlyGridData["rows"][number], position: string) {
    if (!canWrite || locked || !row.editable) return false;
    if (level === "personal") return positionsMatch(actingPosition, position);
    return true;
  }

  async function commitCell(row: MonthlyGridData["rows"][number], position: string, raw: string) {
    const key = cellKey(row.itemId, position);
    const stored = row.cells[position]?.quantity ?? null;
    const text = raw.trim().replace(",", ".");
    const value = text === "" ? null : Number(text);

    if (value !== null && !Number.isFinite(value)) {
      setStates((s) => ({ ...s, [key]: "error" }));
      setErrors((e) => ({ ...e, [key]: "Phải là số hợp lệ" }));
      return;
    }
    if (value !== null && value < 0) {
      setStates((s) => ({ ...s, [key]: "error" }));
      setErrors((e) => ({ ...e, [key]: "Không được âm" }));
      return;
    }
    if (value === stored) {
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      return;
    }

    setStates((s) => ({ ...s, [key]: "saving" }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });

    try {
      await update.mutateAsync({
        periodKey: month,
        readings: [{ itemId: row.itemId, positionCode: position, quantity: value }],
      });
      setStates((s) => ({ ...s, [key]: "saved" }));
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
    } catch (err) {
      setStates((s) => ({ ...s, [key]: "error" }));
      const message = err instanceof Error ? err.message : "Lưu thất bại";
      setErrors((e) => ({ ...e, [key]: message }));
      toast.error(message);
    }
  }

  return (
    <div className="space-y-3">
      {locked && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <Lock className="h-4 w-4 shrink-0" />
          Kỳ {periodLabel(month)} đã khóa sổ — số liệu chỉ xem, không sửa được.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="sticky left-0 z-30 min-w-[220px] border-b border-r border-border bg-muted px-3 py-2 text-left font-semibold">
                Tên hóa chất
              </th>
              <th className="border-b border-border px-2 py-2 text-left font-semibold">Đơn vị</th>
              {grid.positions.map((p) => (
                <th key={p.code} className="border-b border-border px-2 py-2 text-right font-semibold" title={p.label}>
                  {p.label}
                </th>
              ))}
              <th className="border-b border-l border-border bg-slate-100 px-2 py-2 text-right font-semibold">Tổng tồn cuối</th>
              <th className="border-b border-border bg-slate-100 px-2 py-2 text-right font-semibold">Tồn đầu</th>
              <th className="border-b border-border bg-slate-100 px-2 py-2 text-right font-semibold">Nhập</th>
              <th className="border-b border-border bg-slate-100 px-2 py-2 text-right font-semibold">Sử dụng</th>
              <th className="border-b border-border px-2 py-2 text-left font-semibold">Cảnh báo</th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => {
              const rowWarnings = row.warnings;
              return (
                <tr key={row.itemId} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 min-w-[220px] border-r border-border bg-white px-3 py-1.5 text-left font-medium text-ink"
                  >
                    <span className="block truncate">{row.name}</span>
                    {row.trackingMode === "DAILY" && (
                      <button
                        type="button"
                        onClick={() => onOpenDaily(row.itemId)}
                        className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-accent underline-offset-2 hover:underline"
                      >
                        <CalendarDays className="h-3 w-3" />
                        Tự động từ nhật ký ngày
                      </button>
                    )}
                  </th>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs text-muted-foreground">
                    {UNIT_LABELS[row.baseUnit]}
                  </td>

                  {grid.positions.map((p) => {
                    const key = cellKey(row.itemId, p.code);
                    const cell = row.cells[p.code];
                    const editable = canEditCell(row, p.code);
                    const draft = drafts[key];
                    const shown = draft !== undefined ? draft : cell?.quantity === null || cell?.quantity === undefined ? "" : String(cell.quantity);

                    // Ô ghi bằng chữ (mức bồn đo mm): hiện nguyên văn, không cho gõ đè.
                    if (cell?.rawText) {
                      return (
                        <td key={p.code} className="px-2 py-1.5 text-right">
                          <span className="text-[11px] text-amber-800" title={cell.rawText}>
                            {cell.rawText.replace(/\s+/g, " ").trim()}
                          </span>
                        </td>
                      );
                    }

                    return (
                      <td key={p.code} className="px-1 py-1 text-right">
                        {editable ? (
                          <div className="relative">
                            <Input
                              inputMode="decimal"
                              value={shown}
                              onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                              onBlur={(e) => void commitCell(row, p.code, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") {
                                  setDrafts((d) => {
                                    const next = { ...d };
                                    delete next[key];
                                    return next;
                                  });
                                }
                              }}
                              className={cn(
                                "h-8 w-full min-w-[86px] px-1.5 text-right text-sm tabular-nums",
                                states[key] === "error" && "border-red-500"
                              )}
                              aria-label={`${row.name} — ${p.label}`}
                            />
                            <SaveDot state={states[key] ?? "idle"} />
                            {errors[key] && <span className="mt-0.5 block text-[10px] text-red-600">{errors[key]}</span>}
                          </div>
                        ) : (
                          <span
                            className={cn("block px-1.5 tabular-nums", !row.editable && "text-muted-foreground")}
                            title={row.editable ? undefined : "Ô này do hệ thống tính từ nhật ký ngày"}
                          >
                            {cell?.quantity === null || cell?.quantity === undefined ? "—" : fmt(cell.quantity)}
                          </span>
                        )}
                      </td>
                    );
                  })}

                  <DerivedCell value={row.closingTotal} bold />
                  <DerivedCell value={row.openingTotal} />
                  <DerivedCell value={row.receivedTotal} />
                  <DerivedCell value={row.consumedTotal} negativeIsWarning />

                  <td className="px-2 py-1.5">
                    {rowWarnings.length > 0 ? (
                      <span className="text-[11px] leading-4 text-amber-800">
                        {rowWarnings.map(warningLabel).join(" · ")}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Ô nền xám là số dẫn xuất, không sửa được. Ô trống hiện dấu “—” nghĩa là <strong>chưa đo</strong>, khác hẳn số 0.
        {level === "personal" && actingPosition && (
          <> Bạn đang ở mức nhập theo cương vị, chỉ sửa được cột <strong>{actingPosition}</strong>.</>
        )}
      </p>
    </div>
  );
}

function DerivedCell({
  value,
  bold,
  negativeIsWarning,
}: {
  value: number | null;
  bold?: boolean;
  negativeIsWarning?: boolean;
}) {
  const negative = negativeIsWarning && value !== null && value < 0;
  return (
    <td
      className={cn(
        "border-l border-border/50 bg-slate-50 px-2 py-1.5 text-right tabular-nums",
        bold && "font-semibold",
        negative && "font-semibold text-red-700"
      )}
      title={negative ? "Lượng sử dụng âm — giữ nguyên giá trị để đối chiếu, không tự sửa về 0" : undefined}
    >
      {value === null ? "—" : fmt(value)}
    </td>
  );
}
