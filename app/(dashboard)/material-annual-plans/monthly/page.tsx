"use client";

import * as React from "react";
import { toast } from "sonner";
import { CalendarDays, Download, Loader2, Pencil, Plus, Search, Trash2, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RbacProtectedRoute } from "@/components/shared/rbac-protected-route";
import { TablePageSizeSelector, TablePaginationFooter } from "@/components/shared/table-pagination-controls";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  useDeleteMonthlyRequest,
  useMaterialAnnualForecast,
  useMaterialMonthlyReport,
  useMaterialUsageDetail,
  useSaveMonthlyRequest,
} from "@/hooks/useMaterialAnnualPlans";
import type { MonthlyReportRow } from "@/lib/material-monthly-report";
import { normalizeText } from "@/lib/nav";

/**
 * Biểu QLVT.20 theo tháng — bản thay cho file Excel gõ tay.
 *
 * Ranh giới của màn hình này là điều quan trọng nhất: chỉ hai ô **H** (số lượng yêu cầu) và
 * **J** (mục đích, vị trí sử dụng) cho nhập. Kế hoạch năm, luỹ kế đã dùng, còn lại, tồn kho và
 * lưới T1..T12 đều là số hệ thống tính ra và hiển thị ở dạng chỉ đọc — đó là lý do bản Excel cũ
 * để lệch 41/238 dòng ở riêng cột "còn lại".
 */

const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 });
const fmt = (value: number | null | undefined) => (value === null || value === undefined ? "—" : nf.format(value));

const currentPeriod = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
};

export default function MaterialMonthlyReportPage() {
  return (
    <RbacProtectedRoute permissionId="material-manage" featureLabel="Biểu nhu cầu vật tư tháng">
      <MonthlyReportContent />
    </RbacProtectedRoute>
  );
}

function MonthlyReportContent() {
  const rbac = useRbacAccess();
  const canEdit = rbac.can("material-manage", ["manage", "full"]);
  const [periodKey, setPeriodKey] = React.useState(currentPeriod);
  const [editing, setEditing] = React.useState<MonthlyReportRow | "new" | null>(null);
  const [usageTarget, setUsageTarget] = React.useState<{ row: MonthlyReportRow; month: number | null } | null>(null);
  const [forecastOpen, setForecastOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [groupFilter, setGroupFilter] = React.useState("");
  const [pageSize, setPageSize] = React.useState(10);
  const [page, setPage] = React.useState(1);

  const { data, isLoading, error } = useMaterialMonthlyReport(periodKey);
  const remove = useDeleteMonthlyRequest(periodKey);
  const year = Number(periodKey.slice(0, 4));
  const groupOptions = data?.groups ?? [];
  const selectedGroup = groupOptions.some((group) => group.group === groupFilter)
    ? groupFilter
    : (groupOptions[0]?.group ?? "");
  const filteredRows = React.useMemo(() => {
    const needle = normalizeText(query);
    return (data?.groups ?? []).filter((group) => group.group === selectedGroup).flatMap((group) => group.rows.map((row, index) => ({
      group: group.group,
      row,
      key: `${group.group}|${row.requestId ?? `plan-${row.materialNameKey}-${index}`}`,
    }))).filter(({ group, row }) => !needle || normalizeText(
      `${group} ${row.materialNameLabel} ${row.erpCode ?? ""} ${row.unitLabel} ${row.purpose ?? ""}`,
    ).includes(needle));
  }, [data?.groups, query, selectedGroup]);
  const pageRows = React.useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  );
  const pageGroups = React.useMemo(() => {
    const groups = new Map<string, typeof pageRows>();
    for (const item of pageRows) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
    return [...groups].map(([group, rows]) => ({ group, rows }));
  }, [pageRows]);

  React.useEffect(() => setPage(1), [pageSize, periodKey, query, selectedGroup]);
  React.useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    setPage((current) => Math.min(current, lastPage));
  }, [filteredRows.length, pageSize]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="TỔNG HỢP NHU CẦU VẬT TƯ"
      >
        <div className="flex shrink-0 items-center" aria-label="Chọn tháng xem nhu cầu vật tư">
          <div className="relative w-[176px] shrink-0">
            <Input
              type="month"
              lang="vi"
              className="h-10 w-full cursor-pointer rounded-xl bg-white pr-10 font-semibold [&::-webkit-calendar-picker-indicator]:opacity-0"
              value={periodKey}
              aria-label="Chọn tháng xem nhu cầu vật tư"
              title="Chọn tháng xem nhu cầu vật tư"
              onClick={(event) => event.currentTarget.showPicker?.()}
              onChange={(event) => event.target.value && setPeriodKey(event.target.value)}
            />
            <CalendarDays className="pointer-events-none absolute right-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>
        </div>
        <Button variant="outline" className="h-10 rounded-xl" onClick={() => setForecastOpen(true)}>
          <TrendingUp className="h-4 w-4" /> Dự toán {year + 1}
        </Button>
        <a href={`/api/material-annual-plans/monthly/export?period=${periodKey}`}>
          <Button variant="outline" className="h-10 rounded-xl"><Download className="h-4 w-4" /> Xuất QLVT.20</Button>
        </a>
        {canEdit && (
          <Button className="h-10 rounded-xl" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Khai nhu cầu</Button>
        )}
      </PageHeader>

      {isLoading && <p className="text-sm text-muted-foreground">Đang tải biểu tháng…</p>}
      {error && <p className="text-sm text-rose-600">{(error as Error).message}</p>}

      {data && (
        <>
          <div className="flex flex-col gap-2 px-1 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Chip label="Tổng dòng" value={data.summary.rowCount} />
              <Chip label="Nhu cầu" value={data.summary.requestRowCount} />
              <Chip label="Kế hoạch" value={data.summary.planOnlyRowCount} tone="amber" />
              {data.summary.requestedTotalByUnit.map((item) => (
                <Chip key={item.unitLabel} label={`Yêu cầu (${item.unitLabel})`} value={nf.format(item.quantity)} tone="sky" />
              ))}
            </div>
            <label className="relative w-full lg:w-[320px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 rounded-xl bg-white pl-9"
                placeholder="Tìm tên vật tư, mã ERP, nhóm…"
              />
            </label>
          </div>

          {filteredRows.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-14 text-center text-sm text-slate-500">
              Không có dòng phù hợp với nội dung tìm kiếm.
            </div>
          ) : pageGroups.map((group) => (
            <section key={group.group} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <select
                  value={selectedGroup}
                  onChange={(event) => setGroupFilter(event.target.value)}
                  aria-label="Chọn nhóm vật tư hiển thị"
                  className="h-9 w-full max-w-[460px] cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-center text-sm font-bold text-slate-800 shadow-sm outline-none transition [text-align-last:center] focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                >
                  {groupOptions.map((option) => (
                    <option key={option.group} value={option.group}>
                      {option.group} ({option.rows.length} dòng)
                    </option>
                  ))}
                </select>
                <TablePageSizeSelector value={pageSize} onChange={setPageSize} />
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full min-w-[1280px] text-[13px]">
                    <thead>
                      <tr className="h-12 whitespace-nowrap bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-0 align-middle text-left font-semibold">Mã / Tên vật tư</th>
                        <th className="px-2 py-0 align-middle text-center font-semibold">ĐVT</th>
                        <th className="px-2 py-0 align-middle text-right font-semibold">Kế hoạch năm</th>
                        <th className="px-2 py-0 align-middle text-right font-semibold">Luỹ kế đã dùng</th>
                        <th className="px-2 py-0 align-middle text-right font-semibold">Còn lại</th>
                        <th className="px-2 py-0 align-middle text-right font-semibold text-sky-700">Yêu cầu tháng</th>
                        <th className="px-2 py-0 align-middle text-right font-semibold">Tồn kho</th>
                        <th className="px-3 py-0 align-middle text-left font-semibold text-sky-700">Mục đích, vị trí</th>
                        <th className="px-2 py-0 align-middle text-center font-semibold">T1–T12</th>
                        <th className="px-2 py-0 align-middle" />
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map(({ row, key }) => (
                        <tr key={key} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-900">{row.materialNameLabel}</div>
                            <div className="text-[11px] text-slate-500">
                              {row.erpCode ?? "chưa có mã ERP"}
                              {row.route === "CHEMICAL" && <span className="ml-2 rounded bg-teal-50 px-1.5 py-0.5 font-semibold text-teal-700">tịnh kho</span>}
                              {row.requestId === null && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">chưa khai nhu cầu</span>}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center text-slate-600">{row.unitLabel}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmt(row.plannedQuantity)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {/* Bấm để xem chính những phiếu tạo nên con số này — thứ file Excel không làm được. */}
                            <button
                              type="button"
                              className="rounded px-1 font-semibold text-sky-700 underline-offset-2 hover:underline"
                              onClick={() => setUsageTarget({ row, month: null })}
                            >
                              {fmt(row.usedQuantity)}
                            </button>
                            {row.provisional && <span className="ml-1 text-[10px] text-amber-600">tạm tính</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold">{fmt(row.remainingQuantity)}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-bold text-sky-800">{fmt(row.requestedQuantity)}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-600">{fmt(row.stockQuantity)}</td>
                          <td className="px-3 py-2 text-slate-700">{row.purpose ?? <span className="text-slate-400">—</span>}</td>
                          <td className="px-2 py-2">
                            <div className="flex justify-center gap-[2px]">
                              {row.monthMarks.map((marked, monthIndex) => (
                                <button
                                  key={monthIndex}
                                  type="button"
                                  title={`Tháng ${monthIndex + 1}${marked ? " — bấm xem chi tiết" : " — không phát sinh"}`}
                                  disabled={!marked}
                                  onClick={() => setUsageTarget({ row, month: monthIndex + 1 })}
                                  className={`h-4 w-4 rounded-[3px] text-[9px] font-bold leading-4 ${
                                    marked ? "bg-sky-600 text-white hover:bg-sky-700" : "bg-slate-100 text-slate-300"
                                  }`}
                                >
                                  {monthIndex + 1}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right">
                            {canEdit && row.requestId && (
                              <div className="flex justify-end gap-1">
                                <button type="button" title="Sửa" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(row)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Xoá"
                                  className="rounded p-1 text-rose-500 hover:bg-rose-50"
                                  onClick={() => {
                                    if (!window.confirm(`Xoá dòng nhu cầu "${row.purpose}"?`)) return;
                                    remove.mutate(row.requestId!, {
                                      onSuccess: () => toast.success("Đã xoá dòng nhu cầu"),
                                      onError: (e) => toast.error((e as Error).message),
                                    });
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                            {canEdit && !row.requestId && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(row)}>
                                Khai nhu cầu
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </div>
            </section>
          ))}

          <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
            <TablePaginationFooter page={page} pageSize={pageSize} total={filteredRows.length} onPageChange={setPage} />
          </div>
        </>
      )}

      {editing && (
        <RequestDialog
          periodKey={periodKey}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {usageTarget && (
        <UsageDialog
          year={year}
          row={usageTarget.row}
          month={usageTarget.month}
          onClose={() => setUsageTarget(null)}
        />
      )}
      {forecastOpen && <ForecastDialog year={year + 1} onClose={() => setForecastOpen(false)} />}
    </div>
  );
}

function Chip({ label, value, tone = "slate" }: { label: string; value: React.ReactNode; tone?: "slate" | "amber" | "sky" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
  } as const;
  return (
    <span className={`rounded-full border px-3 py-1 font-semibold ${tones[tone]}`}>
      {label}: <b>{value}</b>
    </span>
  );
}

/** Hộp nhập ĐÚNG hai cột H và J (kèm định danh vật tư khi khai dòng mới). */
function RequestDialog({ periodKey, row, onClose }: { periodKey: string; row: MonthlyReportRow | null; onClose: () => void }) {
  const save = useSaveMonthlyRequest(periodKey);
  const [purpose, setPurpose] = React.useState(row?.purpose ?? "");
  const [quantity, setQuantity] = React.useState(row?.requestedQuantity ? String(row.requestedQuantity) : "");
  const [name, setName] = React.useState(row?.materialNameLabel ?? "");
  const [unit, setUnit] = React.useState(row?.unitLabel ?? "");
  const [erpCode, setErpCode] = React.useState(row?.erpCode ?? "");
  const [category, setCategory] = React.useState(row?.materialCategory ?? "III. Chai khí, hạt nhựa, dầu DO, hóa chất và vật tư phụ khác");
  const isEdit = Boolean(row?.requestId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{isEdit ? "Sửa nhu cầu tháng" : "Khai nhu cầu tháng"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!row && (
            <>
              <Field label="Nhóm vật tư">
                <select className="h-10 w-full rounded-lg border border-slate-200 px-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option>I. Dầu nhớt bôi trơn</option>
                  <option>II. Lọc dầu và lọc nước</option>
                  <option>III. Chai khí, hạt nhựa, dầu DO, hóa chất và vật tư phụ khác</option>
                </select>
              </Field>
              <Field label="Mã vật tư ERP (nếu có)"><Input value={erpCode} onChange={(e) => setErpCode(e.target.value)} /></Field>
            </>
          )}
          <Field label="Tên quy cách vật tư"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Đơn vị tính"><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
          <Field label="Số lượng yêu cầu trong tháng (cột H)">
            <Input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Mục đích, vị trí sử dụng (cột J)">
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Ví dụ: Bổ sung trạm dầu bôi trơn quạt khói" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
          <Button
            disabled={save.isPending}
            onClick={() => {
              save.mutate(
                {
                  ...(row?.requestId ? { id: row.requestId } : {}),
                  materialCategory: row?.materialCategory ?? category,
                  materialNameLabel: name,
                  unitLabel: unit,
                  erpCode: row?.erpCode ?? erpCode,
                  purpose,
                  quantity: Number(quantity),
                },
                {
                  onSuccess: () => { toast.success(isEdit ? "Đã cập nhật nhu cầu" : "Đã khai nhu cầu"); onClose(); },
                  onError: (e) => toast.error((e as Error).message),
                },
              );
            }}
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Danh sách phiếu tạo nên con số luỹ kế của một dòng. */
function UsageDialog({ year, row, month, onClose }: { year: number; row: MonthlyReportRow; month: number | null; onClose: () => void }) {
  const { data, isLoading } = useMaterialUsageDetail({
    year, category: row.materialCategory, nameKey: row.materialNameKey, month,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {row.materialNameLabel} — {month ? `tháng ${month}` : "cả năm"} {year}
          </DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Đang tra cứu…</p>}
        {data && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Chip label="Tổng đã dùng" value={`${nf.format(data.total)} ${row.unitLabel}`} tone="sky" />
              <Chip label="Trong đó phát sinh ngoài lịch" value={`${nf.format(data.unplannedTotal)} ${row.unitLabel}`} tone="amber" />
              <Chip label="Số lần" value={data.rows.length} />
            </div>
            {data.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có lần sử dụng nào được ghi nhận trong kỳ này.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[860px] text-[13px]">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 text-left font-semibold">Ngày thay</th>
                      <th className="px-2 py-2 text-right font-semibold">Đã dùng</th>
                      <th className="px-3 py-2 text-left font-semibold">Thiết bị / vị trí</th>
                      <th className="px-3 py-2 text-left font-semibold">Chứng từ</th>
                      <th className="px-3 py-2 text-left font-semibold">Phiếu vật tư</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {new Date(item.replacedAt).toLocaleDateString("vi-VN")}
                          {item.unplanned && <div className="text-[10px] font-semibold text-amber-600">phát sinh</div>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold">{fmt(item.usedQuantity)}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {item.deviceLabel ?? "—"}
                          {item.systemLabel && <div className="text-[11px] text-slate-500">{item.systemLabel}</div>}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-slate-600">
                          {item.requestNumber && <div>SYC {item.requestNumber}</div>}
                          {item.pctNumber && <div>PCT/LCT {item.pctNumber}</div>}
                          {item.bbntDoNumber && (
                            <div>
                              BBNT DO {item.bbntDoNumber}
                              {item.bbntDoUrl && <a className="ml-1 text-sky-700 underline" href={item.bbntDoUrl} target="_blank" rel="noreferrer">tải</a>}
                            </div>
                          )}
                          {item.deliveryNoteNumber && <div>PGH {item.deliveryNoteNumber}</div>}
                        </td>
                        <td className="px-3 py-2 text-[12px]">
                          {item.ticketNumber ?? <span className="text-slate-400">—</span>}
                          {item.doneByName && <div className="text-slate-500">{item.doneByName}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Dự toán năm sau — ba thành phần để rời, không gộp sẵn. */
function ForecastDialog({ year, onClose }: { year: number; onClose: () => void }) {
  const { data, isLoading } = useMaterialAnnualForecast(year, true);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle>Dự toán nhu cầu vật tư năm {year}</DialogTitle></DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Đang tính dự toán…</p>}
        {data && (
          <div className="space-y-3">
            <p className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-[12.5px] text-sky-900">
              Nhu cầu = (định kỳ + bình quân phát sinh {data.lookbackYears} năm) × hệ số dự phòng − tồn chuyển năm.
              Ba thành phần để rời để giải trình được căn cứ của từng con số.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Chip label="Dòng dự toán" value={data.summary.rowCount} />
              <Chip label="Chỉ có định kỳ" value={data.summary.scheduledOnlyRows} />
              <Chip label="Chỉ có phát sinh" value={data.summary.unplannedOnlyRows} tone="amber" />
              <Chip label="Chưa có căn cứ" value={data.summary.rowsWithoutHistory} tone="amber" />
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[980px] text-[13px]">
                <thead>
                  <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 text-left font-semibold">Vật tư</th>
                    <th className="px-2 py-2 text-right font-semibold">Định kỳ</th>
                    <th className="px-2 py-2 text-right font-semibold">BQ phát sinh</th>
                    <th className="px-2 py-2 text-right font-semibold">Hệ số</th>
                    <th className="px-2 py-2 text-right font-semibold">Tồn chuyển năm</th>
                    <th className="px-2 py-2 text-right font-semibold">Nhu cầu {year}</th>
                    <th className="px-2 py-2 text-right font-semibold">KH {data.baseYear}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={`${row.materialCategory}|${row.materialNameKey}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900">{row.materialNameLabel}</div>
                        <div className="text-[11px] text-slate-500">{row.materialCategory}</div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {fmt(row.scheduledDemand)}
                        {row.scheduledPointCount > 0 && <div className="text-[10px] text-slate-500">{row.scheduledPointCount} điểm</div>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {fmt(row.unplannedAverage)}
                        <div className="text-[10px] text-slate-500">{row.unplannedYears} năm</div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-600">×{row.bufferRatio}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-600">{fmt(row.carryOverStock)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-bold text-sky-800">{fmt(row.netDemand)} {row.unitLabel}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">{fmt(row.currentPlannedQuantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
