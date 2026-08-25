"use client";

import * as React from "react";
import {
  AlertTriangle,
  Beaker,
  CheckCircle2,
  FileSpreadsheet,
  ListFilter,
  Loader2,
  PackageSearch,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { RbacProtectedRoute } from "@/components/shared/rbac-protected-route";
import { TablePageSizeSelector, TablePaginationFooter } from "@/components/shared/table-pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useCommitMaterialAnnualPlan,
  useMaterialAnnualPlans,
  usePreviewMaterialAnnualPlan,
} from "@/hooks/useMaterialAnnualPlans";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import type { AnnualPlanImportPreview } from "@/lib/material-annual-plan-import";
import { normalizeText } from "@/lib/nav";
import { cn } from "@/lib/utils";

const formatQuantity = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const currentYear = new Date().getFullYear();

export default function MaterialAnnualPlansPage() {
  return (
    <RbacProtectedRoute permissionId="material-manage" featureLabel="Kế hoạch vật tư năm">
      <MaterialAnnualPlansContent />
    </RbacProtectedRoute>
  );
}

function MaterialAnnualPlansContent() {
  const rbac = useRbacAccess();
  const canImport = rbac.can("material-manage", ["manage", "full"]);
  const [year, setYear] = React.useState(currentYear);
  const [query, setQuery] = React.useState("");
  const [routeFilter, setRouteFilter] = React.useState<"ALL" | "CHEMICAL" | "MATERIAL">("ALL");
  const [groupFilter, setGroupFilter] = React.useState("ALL");
  const [pageSize, setPageSize] = React.useState(10);
  const [page, setPage] = React.useState(1);
  const [importOpen, setImportOpen] = React.useState(false);
  const { data, isLoading, error } = useMaterialAnnualPlans(year);
  const groupOptions = React.useMemo(
    () => [...new Set((data?.rows ?? []).map((row) => row.materialCategory).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "vi")),
    [data?.rows],
  );
  const rows = React.useMemo(() => {
    const needle = normalizeText(query);
    return (data?.rows ?? []).filter((row) =>
      (routeFilter === "ALL" || row.route === routeFilter)
      && (groupFilter === "ALL" || row.materialCategory === groupFilter)
      && (!needle || normalizeText(`${row.erpCode ?? ""} ${row.materialNameLabel} ${row.materialCategory}`).includes(needle)),
    );
  }, [data?.rows, groupFilter, query, routeFilter]);
  const pageRows = React.useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, rows],
  );

  React.useEffect(() => setPage(1), [groupFilter, pageSize, query, routeFilter, year]);
  React.useEffect(() => {
    if (groupFilter !== "ALL" && !groupOptions.includes(groupFilter)) setGroupFilter("ALL");
  }, [groupFilter, groupOptions]);
  React.useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(rows.length / pageSize));
    setPage((current) => Math.min(current, lastPage));
  }, [pageSize, rows.length]);

  return <div className="space-y-5">
    <PageHeader
      title="KẾ HOẠCH VẬT TƯ NĂM"
      description={`Sổ chỉ tiêu năm ${year}`}
    >
      <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm">
        Năm
        <select className="bg-transparent font-bold text-slate-950 outline-none" value={year} onChange={(event) => setYear(Number(event.target.value))}>
          {Array.from({ length: 6 }, (_, index) => currentYear - 2 + index).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      {canImport && <Button className="h-10 rounded-xl" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Nhập QLVT.20</Button>}
    </PageHeader>

    <Card className="overflow-hidden border-slate-200 shadow-[0_12px_36px_-28px_rgba(15,23,42,.55)]">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 p-4 lg:flex-row lg:items-center lg:justify-between">
        <TablePageSizeSelector value={pageSize} onChange={setPageSize} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-[280px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="h-10 rounded-xl bg-white pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã ERP hoặc tên vật tư…" />
          </label>
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            {(["ALL", "CHEMICAL", "MATERIAL"] as const).map((value) => <button
              key={value}
              type="button"
              onClick={() => setRouteFilter(value)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", routeFilter === value ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-900")}
            >{value === "ALL" ? "Tất cả" : value === "CHEMICAL" ? "Tịnh kho" : "Vật tư"}</button>)}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-sm">
          <colgroup>
            <col className="w-[180px]" />
            <col />
            <col className="w-[145px]" />
            <col className="w-[155px]" />
            <col className="w-[115px]" />
            <col className="w-[120px]" />
            <col className="w-[125px]" />
          </colgroup>
          <thead className="bg-[#12395c] text-[11px] uppercase tracking-[.05em] text-white">
            <tr className="h-12 whitespace-nowrap">
              <th className="px-4 py-0 align-middle text-left">
                <div className="flex items-center gap-2">
                  <span>Nhóm</span>
                  <label
                    className={cn(
                      "relative grid h-7 w-7 cursor-pointer place-items-center rounded-md transition",
                      groupFilter === "ALL"
                        ? "bg-white/10 text-white/75 hover:bg-white/20 hover:text-white"
                        : "bg-amber-400 text-slate-950 shadow-sm",
                    )}
                    title={groupFilter === "ALL" ? "Lọc theo nhóm vật tư" : `Đang lọc: ${groupFilter}`}
                  >
                    <ListFilter className="h-4 w-4" />
                    <select
                      value={groupFilter}
                      onChange={(event) => setGroupFilter(event.target.value)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                      aria-label="Lọc theo nhóm vật tư"
                    >
                      <option value="ALL">Tất cả nhóm</option>
                      {groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
                    </select>
                  </label>
                </div>
              </th>
              <th className="px-4 py-0 align-middle text-left">Mã / tên vật tư</th>
              <th className="px-3 py-0 align-middle text-right">Kế hoạch năm</th>
              <th className="px-3 py-0 align-middle text-right">Đã dùng đã chốt</th>
              <th className="px-3 py-0 align-middle text-right">Tạm tính</th>
              <th className="px-3 py-0 align-middle text-right">Còn lại</th>
              <th className="px-4 py-0 align-middle text-right">Tồn hiện có</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <TableMessage><Loader2 className="h-5 w-5 animate-spin" /> Đang tổng hợp hai mạch dữ liệu…</TableMessage>
              : error ? <TableMessage tone="bad"><AlertTriangle className="h-5 w-5" /> {(error as Error).message}</TableMessage>
              : rows.length === 0 ? <TableMessage><FileSpreadsheet className="h-5 w-5" /> {data?.rows.length ? "Không có dòng khớp bộ lọc" : "Chưa có kế hoạch — hãy nhập một sheet QLVT.20"}</TableMessage>
              : pageRows.map((row) => <tr key={row.id} className="align-top hover:bg-sky-50/40">
                <td className="max-w-[210px] px-4 py-3 text-xs font-semibold leading-5 text-slate-500">{row.materialCategory}</td>
                <td className="px-4 py-3">
                  <div className="font-bold text-slate-950">{row.materialNameLabel}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-sky-800">{row.erpCode ?? "Chưa khớp mã ERP"}</span>
                    <span>· {row.unitLabel || "Chưa có ĐVT"}</span>
                    {!row.materialId && row.route === "MATERIAL" && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Chưa gắn danh mục</Badge>}
                  </div>
                </td>
                <NumberCell value={row.plannedQuantity} unit={row.unitLabel} strong />
                <NumberCell value={row.usedQuantity} unit={row.unitLabel} />
                <NumberCell value={row.draftUsedQuantity} unit={row.unitLabel} draft />
                <NumberCell value={row.remainingQuantity} unit={row.unitLabel} strong negative={row.remainingQuantity < 0} />
                <NumberCell value={row.stockQuantity} unit={row.unitLabel} />
              </tr>)}
          </tbody>
        </table>
      </div>
      {!isLoading && !error && <TablePaginationFooter page={page} pageSize={pageSize} total={rows.length} onPageChange={setPage} />}
    </Card>

    <AnnualPlanImportDialog
      open={importOpen}
      onOpenChange={setImportOpen}
      onImported={(importedYear) => setYear(importedYear)}
    />
  </div>;
}

function NumberCell({ value, unit, strong, draft, negative }: { value: number; unit: string; strong?: boolean; draft?: boolean; negative?: boolean }) {
  return <td className={cn("whitespace-nowrap px-3 py-3 text-right tabular-nums", strong && "font-bold", draft ? "text-amber-600" : negative ? "text-red-600" : "text-slate-800")}>
    {formatQuantity(value)} <span className="text-[10px] font-medium text-slate-400">{unit}</span>
  </td>;
}

function TableMessage({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "bad" }) {
  return <tr><td colSpan={7}><div className={cn("flex items-center justify-center gap-2 px-4 py-14 text-sm", tone === "bad" ? "text-red-600" : "text-slate-500")}>{children}</div></td></tr>;
}

function AnnualPlanImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; onImported: (year: number) => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<AnnualPlanImportPreview | null>(null);
  const [resolutions, setResolutions] = React.useState<Record<string, number>>({});
  const inputRef = React.useRef<HTMLInputElement>(null);
  const previewMutation = usePreviewMaterialAnnualPlan();
  const commitMutation = useCommitMaterialAnnualPlan();

  const reset = React.useCallback(() => {
    setFile(null);
    setPreview(null);
    setResolutions({});
    previewMutation.reset();
    commitMutation.reset();
  }, [commitMutation, previewMutation]);

  function runPreview(nextFile: File, sheetName?: string | null) {
    previewMutation.mutate({ file: nextFile, sheetName }, {
      onSuccess: (result) => {
        setPreview(result);
        setResolutions({});
      },
      onError: (failure) => toast.error((failure as Error).message),
    });
  }

  const unresolved = preview?.conflicts.filter((conflict) => resolutions[conflict.key] === undefined).length ?? 0;
  const errorCount = preview?.issues.filter((issue) => issue.severity === "error").length ?? 0;

  return <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
    <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
      <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5">
        <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-emerald-700" /> Đối chiếu kế hoạch QLVT.20</DialogTitle>
        <DialogDescription>Hệ thống chỉ đọc B–E của một sheet. Mã lệch được báo cáo; mã có nhiều giá trị kế hoạch bắt buộc phải chốt trước khi ghi.</DialogDescription>
      </DialogHeader>

      <div className="max-h-[68vh] space-y-4 overflow-y-auto p-6">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            if (!selected) return;
            setFile(selected);
            setPreview(null);
            setResolutions({});
            runPreview(selected);
            event.target.value = "";
          }}
        />

        {!file ? <button type="button" onClick={() => inputRef.current?.click()} className="group flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-sky-400 hover:bg-sky-50">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-sky-700 shadow-sm group-hover:scale-105"><Upload className="h-5 w-5" /></span>
          <span className="font-bold text-slate-900">Chọn file QLVT.20 (.xlsx)</span>
          <span className="text-xs text-slate-500">File chỉ được đọc để đối chiếu; chưa ghi dữ liệu ở bước này.</span>
        </button> : <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><div className="truncate font-bold text-slate-950">{file.name}</div><div className="mt-1 text-xs text-slate-500">{(file.size / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} KB</div></div>
          <div className="flex items-center gap-2">
            {preview && <select
              className="h-10 max-w-[260px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none"
              value={preview.selectedSheet}
              onChange={(event) => runPreview(file, event.target.value)}
            >{preview.sheetNames.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}</select>}
            <Button variant="outline" className="rounded-xl" onClick={() => inputRef.current?.click()}>Đổi file</Button>
          </div>
        </div>}

        {previewMutation.isPending && <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 py-10 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Đang đọc và đối chiếu danh mục hệ thống…</div>}

        {preview && !previewMutation.isPending && <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PreviewMetric label="Dòng có kế hoạch" value={preview.summary.planRows} />
            <PreviewMetric label="Khớp mã ERP" value={preview.summary.erpMatchedRows} />
            <PreviewMetric label="Mã ERP lệch" value={preview.summary.unmatchedErpCodes} warning={preview.summary.unmatchedErpCodes > 0} />
            <PreviewMetric label="Mâu thuẫn" value={preview.summary.conflictCount} warning={preview.summary.conflictCount > 0} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4"><div className="flex items-center gap-2 font-bold text-teal-900"><Beaker className="h-4 w-4" /> {preview.summary.chemicalRows} dòng đi mạch tịnh kho</div><p className="mt-1 text-xs leading-5 text-teal-800">Khớp trực tiếp <code>ChemicalInventoryItem.materialCode</code>; chỉ kỳ LOCKED được cộng vào lũy kế chính thức.</p></div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 font-bold text-amber-900"><PackageSearch className="h-4 w-4" /> {preview.summary.materialRows} dòng đi mạch vật tư</div><p className="mt-1 text-xs leading-5 text-amber-800">Thực dùng lấy từ lịch sử quyết toán; dữ liệu lưu trữ <code>SHEET_VT</code> bị loại khỏi phép tính.</p></div>
          </div>

          {preview.conflicts.length > 0 && <section className="overflow-hidden rounded-xl border border-red-200">
            <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-3 font-bold text-red-900"><AlertTriangle className="h-4 w-4" /> Chọn chỉ tiêu cho từng mã mâu thuẫn ({unresolved} chưa chốt)</div>
            <div className="divide-y divide-red-100">
              {preview.conflicts.map((conflict) => <div key={conflict.key} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_260px] sm:items-center">
                <div><div className="font-semibold text-slate-900">{conflict.label}</div><div className="mt-1 text-xs text-slate-500">Dòng {conflict.rowNumbers.join(", ")}</div></div>
                <select
                  className={cn("h-10 rounded-xl border bg-white px-3 text-sm font-bold outline-none", resolutions[conflict.key] === undefined ? "border-red-300 text-red-700" : "border-emerald-300 text-emerald-800")}
                  value={resolutions[conflict.key] ?? ""}
                  onChange={(event) => setResolutions((current) => ({ ...current, [conflict.key]: Number(event.target.value) }))}
                >
                  <option value="">— Chọn kế hoạch đúng —</option>
                  {conflict.values.map((value) => <option key={value} value={value}>{formatQuantity(value)}</option>)}
                </select>
              </div>)}
            </div>
          </section>}

          {preview.issues.length > 0 && <section className="overflow-hidden rounded-xl border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-900">Báo cáo đối chiếu ({preview.issues.length})</div>
            <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
              {preview.issues.map((issue, index) => <div key={`${issue.code}-${issue.row ?? index}`} className="flex gap-3 px-4 py-2.5 text-sm">
                {issue.severity === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                <div><b className="text-slate-800">{issue.code}</b>{issue.row ? ` · dòng ${issue.row}` : ""}<div className="mt-0.5 text-xs text-slate-600">{issue.message}</div></div>
              </div>)}
            </div>
          </section>}
        </>}
      </div>

      <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
        <Button
          disabled={!file || !preview || unresolved > 0 || errorCount > 0 || previewMutation.isPending || commitMutation.isPending}
          onClick={() => {
            if (!file || !preview) return;
            commitMutation.mutate({ file, sheetName: preview.selectedSheet, expectedHash: preview.fileHash, resolutions }, {
              onSuccess: (result) => {
                toast.success(`Đã ghi ${result.total} dòng kế hoạch năm ${result.year}`);
                onImported(result.year);
                onOpenChange(false);
                reset();
              },
              onError: (failure) => toast.error((failure as Error).message),
            });
          }}
        >
          {commitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Ghi kế hoạch năm {preview?.detectedYear ?? ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function PreviewMetric({ label, value, warning }: { label: string; value: number; warning?: boolean }) {
  return <div className={cn("rounded-xl border px-4 py-3", warning ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50")}><div className="text-xs font-semibold text-slate-500">{label}</div><div className={cn("mt-1 text-xl font-black", warning ? "text-amber-700" : "text-slate-950")}>{value}</div></div>;
}
