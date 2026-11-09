"use client";
// Tab 5 · Cụm 11 — công tơ theo sự kiện khởi động/ngừng.
import { CTKTKT_EVENT_POWER_ROWS, CTKTKT_OPERATION_ELECTRICAL_POINTS, CTKTKT_OPERATION_POINT_LABELS, ctktktOperationEventId, ctktktOperationOilCells, ctktktOperationPowerColumn, type CtktktOperationKind, type CtktktOperationPoint, type CtktktOperationUnit } from "@/modules/ctktkt/lib/ctktkt-operation-events";
import { STARTUP_UNITS, OPERATION_KINDS, format } from "./shared";
import type { CtktktReportCtx } from "./use-ctktkt-report";

export function CtktktStartupShutdownTab({ ctx }: { ctx: CtktktReportCtx }) {
  const { operationUnit, setOperationUnit, operationKind, setOperationKind, loading, saving, operationEvents, selectedOperationEvent, selectedOperationOil, canEditOperationEvents, addOperationEvent, deleteOperationEvent, updateOperationPoint } = ctx;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 shadow-xs">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 pb-3">
          <div>
            <h3 className="text-sm font-black text-amber-950">
              Công tơ điện khi khởi động / ngừng tổ máy
            </h3>
            <p className="text-xs text-amber-900">
              Chọn tổ máy và sự kiện. Mỗi mốc giờ có một bảng chỉ số công tơ; số liệu được đưa về đúng cột sự kiện trong sheet ngày.
            </p>
          </div>
          <span className="rounded-md bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">
            TKĐ · TCĐ · TPĐ
          </span>
        </div>

        <div className="grid gap-3 rounded-lg border border-amber-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1 text-xs font-bold text-amber-950">
            Tổ máy
            <select value={operationUnit} onChange={event => setOperationUnit(event.target.value as CtktktOperationUnit)} disabled={loading || saving} className="h-9 rounded-lg border border-amber-200 bg-white px-2 text-sm">
              {STARTUP_UNITS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-amber-950">
            Sự kiện
            <select value={operationKind} onChange={event => setOperationKind(event.target.value as CtktktOperationKind)} disabled={loading || saving} className="h-9 rounded-lg border border-amber-200 bg-white px-2 text-sm">
              {OPERATION_KINDS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {!selectedOperationEvent && (
            <button type="button" onClick={addOperationEvent} disabled={!canEditOperationEvents || loading || saving} className="h-9 rounded-lg bg-amber-700 px-4 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-50">
              Tạo bảng sự kiện
            </button>
          )}
        </div>

        {operationEvents.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {operationEvents.map(event => {
              const label = OPERATION_KINDS.find(item => item.value === event.kind)?.label || event.kind;
              const selected = event.unit === operationUnit && event.kind === operationKind;
              return (
                <button key={ctktktOperationEventId(event.unit, event.kind)} type="button" onClick={() => { setOperationUnit(event.unit); setOperationKind(event.kind); }} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selected ? "border-amber-700 bg-amber-700 text-white" : "border-amber-200 bg-white text-amber-900 hover:bg-amber-50"}`}>
                  {event.unit} · {label}
                </button>
              );
            })}
          </div>
        )}

        {!selectedOperationEvent ? (
          <div className="rounded-lg border border-dashed border-amber-300 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-600">
            Chọn tổ máy và loại sự kiện rồi tạo bảng để nhập. Mỗi loại sự kiện của mỗi tổ máy có một bảng trong ngày.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
              <div className="text-xs font-bold text-sky-950">Mốc thời gian · {selectedOperationEvent.unit} · {OPERATION_KINDS.find(item => item.value === selectedOperationEvent.kind)?.label}</div>
              <button type="button" onClick={() => deleteOperationEvent(selectedOperationEvent)} disabled={!canEditOperationEvents || loading || saving} className="rounded-md px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50">Xóa bảng sự kiện</button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(Object.keys(CTKTKT_OPERATION_POINT_LABELS[selectedOperationEvent.kind]) as CtktktOperationPoint[]).map(point => {
                const reading = selectedOperationEvent.points[point];
                return (
                  <label key={point} className="grid gap-1 rounded-lg border border-sky-200 bg-white p-3 text-xs font-bold text-slate-700">
                    {CTKTKT_OPERATION_POINT_LABELS[selectedOperationEvent.kind][point]}
                    <input type="datetime-local" value={reading?.time || ""} onChange={event => updateOperationPoint(point, { time: event.target.value })} disabled={!canEditOperationEvents || loading || saving} className="h-9 min-w-0 rounded-md border border-slate-300 px-2 font-medium disabled:bg-slate-100" />
                  </label>
                );
              })}
            </div>

            {CTKTKT_OPERATION_ELECTRICAL_POINTS[selectedOperationEvent.kind].length > 0 && (
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b bg-slate-50 px-3 py-2">
                  <h4 className="text-xs font-black text-slate-800">Bảng công tơ máy phát và máy biến áp · sheet ngày, dòng 59–83</h4>
                  <p className="mt-0.5 text-[10px] text-slate-500">Mốc và số liệu sẽ xuất theo đúng cột sự kiện S1/S2 trong biểu mẫu.</p>
                </div>
                <div className="max-h-[440px] overflow-auto">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead className="sticky top-0 z-10 bg-white text-[10px] text-slate-500 shadow-sm">
                      <tr>
                        <th className="sticky left-0 z-20 min-w-64 bg-white px-3 py-2 text-left">Công tơ / ô Excel</th>
                        {CTKTKT_OPERATION_ELECTRICAL_POINTS[selectedOperationEvent.kind].map(point => (
                          <th key={point} className="min-w-40 border-l px-2 py-2 text-center">
                            {CTKTKT_OPERATION_POINT_LABELS[selectedOperationEvent.kind][point]}
                            <span className="mt-1 block font-normal text-slate-400">{selectedOperationEvent.points[point]?.time.replace("T", " ") || "Chưa chọn thời điểm"}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {CTKTKT_EVENT_POWER_ROWS.map(item => (
                        <tr key={item.row} className="odd:bg-white even:bg-slate-50/60">
                          <th className="sticky left-0 z-[1] bg-inherit px-3 py-1.5 text-left font-semibold text-slate-700">{item.label}</th>
                          {CTKTKT_OPERATION_ELECTRICAL_POINTS[selectedOperationEvent.kind].map(point => {
                            const column = ctktktOperationPowerColumn(selectedOperationEvent, point);
                            const cell = column ? `${column}${item.row}` : "";
                            const enabled = canEditOperationEvents && (!((item.row === 83) && !(selectedOperationEvent.kind === "startup" && point === "grid_sync")));
                            const value = selectedOperationEvent.points[point]?.power[String(item.row)] || "";
                            return (
                              <td key={point} className="border-l px-2 py-1.5">
                                {enabled ? (
                                  <>
                                    <input type="number" step="any" value={value} onChange={event => updateOperationPoint(point, { power: { ...(selectedOperationEvent.points[point]?.power || {}), [item.row]: event.target.value } })} disabled={loading || saving} className="h-8 w-full rounded border border-[#173b64] px-2 text-center font-mono text-sm font-bold focus:border-[#173b64] focus:outline-none disabled:bg-slate-100" />
                                    <code className="mt-0.5 block text-center text-[9px] text-slate-400">{cell}</code>
                                  </>
                                ) : <span className="block py-1 text-center text-slate-300">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="overflow-hidden rounded-xl border border-orange-200 bg-white">
              <div className="border-b border-orange-100 bg-orange-50/70 px-3 py-2">
                <h4 className="text-xs font-black text-orange-950">Bảng công tơ dầu và thời điểm · sheet ngày, dòng 85–110</h4>
                <p className="mt-0.5 text-[10px] text-orange-800">Số tiêu thụ theo từng giai đoạn tính đúng công thức của mẫu Excel; các ô công thức vẫn được giữ khi xuất.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="bg-white text-[10px] text-slate-500">
                    <tr>
                      <th className="min-w-56 px-3 py-2 text-left">Công tơ dầu / ô Excel</th>
                      {ctktktOperationOilCells(selectedOperationEvent).map(item => (
                        <th key={item.point} className="min-w-36 border-l px-2 py-2 text-center">
                          {CTKTKT_OPERATION_POINT_LABELS[selectedOperationEvent.kind][item.point]}
                          <span className="mt-1 block font-normal text-slate-400">{selectedOperationEvent.points[item.point]?.time.replace("T", " ") || "Chưa chọn thời điểm"}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {([
                      { key: "oilFeed", label: "Công tơ dầu cấp lò" },
                      { key: "oilReturn", label: "Công tơ dầu hồi lò" },
                    ] as const).map(row => (
                      <tr key={row.key}>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">{row.label}</th>
                        {ctktktOperationOilCells(selectedOperationEvent).map(item => {
                          const value = selectedOperationEvent.points[item.point]?.[row.key] || "";
                          const cell = row.key === "oilFeed" ? item.feedCell : item.returnCell;
                          return (
                            <td key={item.point} className="border-l px-2 py-1.5">
                              <input type="number" step="any" value={value} onChange={event => updateOperationPoint(item.point, { [row.key]: event.target.value })} disabled={!canEditOperationEvents || loading || saving} className="h-8 w-full rounded border border-[#173b64] px-2 text-center font-mono text-sm font-bold focus:border-[#173b64] focus:outline-none disabled:bg-slate-100" />
                              <code className="mt-0.5 block text-center text-[9px] text-slate-400">{cell}</code>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-2 border-t border-orange-100 bg-orange-50/50 p-3 sm:grid-cols-3">
                {selectedOperationOil?.phases.map((value, index) => (
                  <div key={index} className="rounded-lg border border-orange-100 bg-white p-2 text-center">
                    <div className="text-[10px] font-semibold text-slate-500">{selectedOperationEvent.kind === "startup" ? index === 0 ? "Từ khởi động đến hòa lưới" : "Từ hòa lưới đến cắt dầu" : "Lượng dầu của sự kiện"}</div>
                    <div className="mt-1 text-sm font-black text-orange-900">{format(value)} tấn</div>
                  </div>
                ))}
                <div className="rounded-lg border border-orange-200 bg-white p-2 text-center">
                  <div className="text-[10px] font-bold text-orange-900">Tổng dầu sự kiện</div>
                  <div className="mt-1 text-sm font-black text-orange-950">{format(selectedOperationOil?.total)} tấn</div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
