"use client";
// Tab 7 · Tra cứu toàn bộ ô.
import { Search, Lock } from "lucide-react";
import { COAL_STOCK_24H_START_CELL } from "@/modules/ctktkt/lib/coal-stock";
import { canEditCtktktField } from "@/modules/ctktkt/lib/ctktkt-permissions";
import { editableFields, format } from "./shared";
import type { CtktktReportCtx } from "./use-ctktkt-report";

export function CtktktAllFieldsTab({ ctx }: { ctx: CtktktReportCtx }) {
  const { user, canEditSelectedDate, search, setSearch, isFirstDayOfMonth, coalStock, pmisCoalStock, renderCellInput } = ctx;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
        <div className="flex items-center gap-2">
          <label className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 text-xs text-slate-600 focus-within:border-indigo-500 focus-within:bg-white">
            <Search className="size-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm mã ô (W8, M9...) hoặc tên..."
              className="w-56 bg-transparent outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            )}
          </label>
          <span className="text-xs text-slate-500">
            Hiển thị {editableFields.length} ô nhập tay
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 max-h-[600px] overflow-y-auto p-1">
        {editableFields
          .filter(f => {
            if (!search.trim()) return true;
            const q = search.trim().toLowerCase();
            return (
              f.cell.toLowerCase().includes(q) ||
              (f.label && f.label.toLowerCase().includes(q))
            );
          })
          .map(f => {
            const canEditThis = canEditSelectedDate && canEditCtktktField(user, f.cell);
            return (
              <div
                key={f.cell}
                className={`flex items-center justify-between gap-2 rounded-lg border p-1.5 text-xs ${
                          canEditThis
                            ? "border-slate-200 bg-white hover:border-indigo-300"
                            : "border-slate-200 bg-slate-100/70"
                        }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <code className="font-mono text-[10px] font-bold text-slate-700">
                      {f.cell}
                    </code>
                    {!canEditThis && <Lock className="size-2.5 text-slate-400" />}
                  </div>
                  <span
                    className="text-[10px] text-slate-600 truncate block leading-tight"
                    title={f.label}
                  >
                    {f.label}
                  </span>
                </div>
                <div className="w-20 shrink-0">
                  {renderCellInput(f.cell, {
                    compact: true,
                    readOnlyValue: isFirstDayOfMonth
                      ? undefined
                      : f.cell === COAL_STOCK_24H_START_CELL
                        ? coalStock.stock === null ? "" : format(coalStock.stock)
                        : f.cell === "W86"
                          ? pmisCoalStock.stock === null ? "" : format(pmisCoalStock.stock)
                          : undefined,
                  })}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
