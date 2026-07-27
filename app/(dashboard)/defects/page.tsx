"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { DefectSyncRun } from "@prisma/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, Wrench, CircleSlash, CircleDashed, CirclePause, Package, Plus, X, Pencil, Trash2, CheckCircle2, BellRing, RefreshCw, CloudDownload, CloudOff, Minus, Search, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { defectDetailQuery, useDefect, useDefects, useDefectSyncStatus, useDeleteDefect, useRemindDefect, useSyncDefects, type DefectItem } from "@/hooks/useDefects";
import { usePositions } from "@/hooks/useUsers";
import {
  DEFECT_STATUS,
  DEFECT_STATUS_ORDER,
  DEFECT_SEVERITY,
  DEFECT_SEVERITY_ORDER,
  DEFECT_REQUEST_TYPES,
  defectSeverityCriteriaLabels,
  isSelectableManagingPosition,
} from "@/lib/constants";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { formatDate, initials, cn } from "@/lib/utils";

const PAGE_SIZES = [10, 25, 50, 100];
const OTHER_REQUEST_TYPES = DEFECT_REQUEST_TYPES.filter((type) => type !== "Cơ" && type !== "Điện");
const DefectForm = dynamic(
  () => import("@/components/defects/defect-form").then((module) => module.DefectForm),
  { ssr: false }
);
const CompleteDefectDialog = dynamic(
  () => import("@/components/defects/complete-defect-dialog").then((module) => module.CompleteDefectDialog),
  { ssr: false }
);

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function DefectsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const deviceSeqFilter = searchParams.get("deviceSeq")?.trim() ?? "";
  const unitFromUrl = searchParams.get("unit")?.toUpperCase();
  const requestFromUrl = searchParams.get("requestType")?.trim();
  const positionFromUrl = searchParams.get("position")?.trim();
  const statusFromUrl = searchParams.get("status")?.trim();
  const severityFromUrl = searchParams.get("severity")?.trim();
  const searchFromUrl = searchParams.get("q")?.trim();
  const pageSizeFromUrl = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const pageFromUrl = Number.parseInt(searchParams.get("page") ?? "", 10);
  const rbac = useRbacAccess();
  const canManage = rbac.can("defect-manage", ["create", "manage", "full"]);
  const canDelete = rbac.can("defect-close", ["approve", "manage", "full"]);

  const del = useDeleteDefect();
  const remind = useRemindDefect();
  const sync = useSyncDefects();
  const canRunSync = rbac.can("defect-manage", ["full"]);
  const canViewSync = rbac.can("defect-manage", ["manage", "full"]);
  const syncStatus = useDefectSyncStatus(canViewSync);
  const latestSyncRun = syncStatus.data?.data?.[0];
  const syncRunning = latestSyncRun?.status === "RUNNING";
  const observedSyncRef = React.useRef<{ id: string; status: string } | null>(null);

  React.useEffect(() => {
    if (!latestSyncRun) return;
    const previous = observedSyncRef.current;
    const justFinished =
      latestSyncRun.status !== "RUNNING" &&
      previous !== null &&
      (previous.id !== latestSyncRun.id || previous.status === "RUNNING");

    observedSyncRef.current = { id: latestSyncRun.id, status: latestSyncRun.status };
    if (justFinished) {
      void queryClient.invalidateQueries({ queryKey: ["defects"] });
      if (latestSyncRun.status === "SUCCESS") {
        toast.success("n8n đã đồng bộ khiếm khuyết thành công");
      } else if (latestSyncRun.status === "FAILED") {
        toast.error(latestSyncRun.error || "Lượt đồng bộ n8n thất bại");
      }
    }
  }, [latestSyncRun, queryClient]);

  // Cương vị lấy từ "Chức vụ" của Quản lý người dùng (bỏ trùng);
  // loại Quản đốc / Phó quản đốc / Kỹ thuật viên / Thống kê khỏi bộ lọc.
  const positions = usePositions().filter(isSelectableManagingPosition);

  // Bộ lọc (Tổ máy / Yêu cầu / Cương vị) — áp dụng cho cả KPI lẫn bảng.
  // Tổ máy không có "Tất cả" — mặc định S1.
  const [unitFilter, setUnitFilter] = React.useState<"S1" | "S2" | "COMMON">(
    unitFromUrl === "S1" || unitFromUrl === "S2" || unitFromUrl === "COMMON" ? unitFromUrl : "S1"
  );
  const [requestFilter, setRequestFilter] = React.useState(requestFromUrl || "Cơ");
  const [positionFilter, setPositionFilter] = React.useState(positionFromUrl || "ALL");
  const [statusFilter, setStatusFilter] = React.useState(statusFromUrl || "ALL");
  const [severityFilter, setSeverityFilter] = React.useState(severityFromUrl || "ALL");
  const [tableSearch, setTableSearch] = React.useState(searchFromUrl || "");
  const [pageSize, setPageSize] = React.useState(
    PAGE_SIZES.includes(pageSizeFromUrl) ? pageSizeFromUrl : 10
  );
  const [page, setPage] = React.useState(pageFromUrl > 0 ? pageFromUrl : 1);
  const deferredSearch = useDebouncedValue(tableSearch.trim(), 350);
  const listParams = React.useMemo(() => ({
    page,
    limit: pageSize,
    unit: unitFilter,
    requestType: requestFilter,
    position: positionFilter,
    status: statusFilter,
    severity: severityFilter,
    q: deferredSearch,
    deviceSeq: deviceSeqFilter,
  }), [page, pageSize, unitFilter, requestFilter, positionFilter, statusFilter, severityFilter, deferredSearch, deviceSeqFilter]);
  const { data, isLoading, isFetching } = useDefects(listParams);
  const pagedDefects = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;
  const scopeTotal = data?.meta?.scopeTotal ?? 0;
  const firstShown = total ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, total);
  const deviceDisplayName = pagedDefects.find((item) => item.deviceSeq === deviceSeqFilter)?.node?.name;
  React.useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  React.useEffect(() => {
    const query = new URLSearchParams();
    if (deviceSeqFilter) query.set("deviceSeq", deviceSeqFilter);
    if (unitFilter !== "S1") query.set("unit", unitFilter);
    if (requestFilter !== "Cơ") query.set("requestType", requestFilter);
    if (positionFilter !== "ALL") query.set("position", positionFilter);
    if (statusFilter !== "ALL") query.set("status", statusFilter);
    if (severityFilter !== "ALL") query.set("severity", severityFilter);
    if (deferredSearch) query.set("q", deferredSearch);
    if (pageSize !== 10) query.set("limit", String(pageSize));
    if (page > 1) query.set("page", String(page));
    const suffix = query.toString();
    router.replace(`/defects${suffix ? `?${suffix}` : ""}`, { scroll: false });
  }, [
    deferredSearch,
    deviceSeqFilter,
    page,
    pageSize,
    positionFilter,
    requestFilter,
    router,
    severityFilter,
    statusFilter,
    unitFilter,
  ]);

  const isFiltered = deviceSeqFilter !== "" || unitFilter !== "S1" || requestFilter !== "Cơ" || positionFilter !== "ALL" || statusFilter !== "ALL" || severityFilter !== "ALL" || tableSearch.trim() !== "";
  function resetFilters() {
    router.replace("/defects", { scroll: false });
    setUnitFilter("S1");
    setRequestFilter("Cơ");
    setPositionFilter("ALL");
    setStatusFilter("ALL");
    setSeverityFilter("ALL");
    setTableSearch("");
  }

  const chuaXuLy = data?.meta?.kpi?.chuaXuLy ?? 0;
  const coPct = data?.meta?.kpi?.coPct ?? 0;
  const choVatTu = data?.meta?.kpi?.choVatTu ?? 0;
  const choNgungMay = data?.meta?.kpi?.choNgungMay ?? 0;
  const tonDong = data?.meta?.kpi?.tonDong ?? 0;
  function toggleStatus(s: string) {
    setStatusFilter((cur) => (cur === s ? "ALL" : s));
  }

  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DefectItem | null>(null);
  const [delTarget, setDelTarget] = React.useState<DefectItem | null>(null);
  const [completeTarget, setCompleteTarget] = React.useState<DefectItem | null>(null);
  const [remindTarget, setRemindTarget] = React.useState<DefectItem | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = React.useState<string | null>(null);

  function openCreate() { setEditTarget(null); setFormOpen(true); }
  async function loadDefectDetail(id: string) {
    setDetailLoadingId(id);
    try {
      const result = await queryClient.fetchQuery(defectDetailQuery(id));
      return result.data;
    } catch (error) {
      toast.error((error as Error).message);
      return null;
    } finally {
      setDetailLoadingId(null);
    }
  }
  async function openEdit(d: DefectItem) {
    const detail = await loadDefectDetail(d.id);
    if (!detail) return;
    setEditTarget(detail);
    setFormOpen(true);
  }
  async function openComplete(d: DefectItem) {
    const detail = await loadDefectDetail(d.id);
    if (detail) setCompleteTarget(detail);
  }
  React.useEffect(() => {
    setExpandedId(null);
    setPage(1);
  }, [deviceSeqFilter, unitFilter, requestFilter, positionFilter, statusFilter, severityFilter, tableSearch, pageSize]);

  return (
    <div className="space-y-6">
      <PageHeader title="KHIẾM KHUYẾT THIẾT BỊ" description="Theo dõi sự cố & khiếm khuyết thiết bị đang tồn đọng">
        {canRunSync && (
          <Button
            variant="outline"
            disabled={sync.isPending || syncStatus.isLoading || syncRunning}
            onClick={async () => {
              try {
                const result = await sync.mutateAsync();
                toast.success(result.message);
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            {sync.isPending || syncRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
            {syncRunning ? "n8n đang đồng bộ…" : "Đồng bộ bằng n8n"}
          </Button>
        )}
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Thêm mới
          </Button>
        )}
      </PageHeader>

      {canViewSync && latestSyncRun && (
        <DefectSyncSummary run={latestSyncRun} />
      )}

      {deviceSeqFilter && (
        <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Đang lọc theo thiết bị</p>
            <p className="truncate font-semibold text-ink">
              {deviceDisplayName ?? "Thiết bị"}
              <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">{deviceSeqFilter}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="bg-white">
              <Link href={`/devices/${encodeURIComponent(deviceSeqFilter)}`}>Về lý lịch thiết bị</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.replace("/defects", { scroll: false })}>
              Bỏ lọc thiết bị
            </Button>
          </div>
        </div>
      )}

      {!isLoading && scopeTotal > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 xl:flex-nowrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Tổ máy:</span>
            <div className="inline-flex rounded-lg border border-border bg-white p-0.5">
              {(["S1", "S2", "COMMON"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnitFilter(u)}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                    unitFilter === u ? "bg-navy text-white" : "text-muted-foreground hover:text-ink"
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Yêu cầu:</span>
            <div className="inline-flex rounded-lg border border-border bg-white p-0.5">
              {(["Cơ", "Điện"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setRequestFilter(type)}
                  className={cn(
                    "h-8 rounded-md px-4 text-sm font-medium transition-colors",
                    requestFilter === type ? "bg-navy text-white" : "text-muted-foreground hover:text-ink"
                  )}
                >
                  {type}
                </button>
              ))}
              <Select
                value={OTHER_REQUEST_TYPES.includes(requestFilter as (typeof OTHER_REQUEST_TYPES)[number]) ? requestFilter : ""}
                onValueChange={setRequestFilter}
              >
                <SelectTrigger
                  className={cn(
                    "h-8 w-auto min-w-[92px] rounded-md border-0 px-4 shadow-none focus:ring-0",
                    OTHER_REQUEST_TYPES.includes(requestFilter as (typeof OTHER_REQUEST_TYPES)[number])
                      ? "bg-navy text-white"
                      : "text-muted-foreground hover:text-ink"
                  )}
                  aria-label="Chọn loại yêu cầu khác"
                >
                  <SelectValue placeholder="Khác" />
                </SelectTrigger>
                <SelectContent>
                  {OTHER_REQUEST_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Cương vị:</span>
            <Select value={positionFilter} onValueChange={setPositionFilter}>
              <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả</SelectItem>
                {positions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isFiltered && (
            <button onClick={resetFilters} className="text-sm font-medium text-accent hover:underline">
              Xoá bộ lọc
            </button>
          )}

          <div className="relative ml-auto w-full shrink-0 sm:w-64 xl:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Tìm trong bảng..."
              className="h-9 pl-9"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <DefectKpi label="Chưa thực hiện" value={chuaXuLy} icon={CircleDashed} tone="rose" active={statusFilter === "CHUA_XU_LY"} onClick={() => toggleStatus("CHUA_XU_LY")} />
        <DefectKpi label="Đang thực hiện" value={coPct} icon={Wrench} tone="sky" active={statusFilter === "CO_PCT"} onClick={() => toggleStatus("CO_PCT")} />
        <DefectKpi label="Chờ vật tư" value={choVatTu} icon={Package} tone="amber" active={statusFilter === "CHO_VAT_TU"} onClick={() => toggleStatus("CHO_VAT_TU")} />
        <DefectKpi label="Chờ ngừng máy" value={choNgungMay} icon={CirclePause} tone="orange" active={statusFilter === "CHO_NGUNG_MAY"} onClick={() => toggleStatus("CHO_NGUNG_MAY")} />
        <DefectKpi label="Tồn đọng" value={tonDong} icon={CircleSlash} tone="violet" active={statusFilter === "TON_DONG"} onClick={() => toggleStatus("TON_DONG")} />
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : total === 0 ? (
        scopeTotal === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Chưa có khiếm khuyết"
            description="Nhấn “Thêm mới” để ghi nhận khiếm khuyết thiết bị."
            action={canManage ? { label: "Thêm mới", onClick: openCreate } : undefined}
          />
        ) : (
          <EmptyState
            icon={ShieldAlert}
            title="Không có khiếm khuyết phù hợp"
            description="Không có khiếm khuyết nào khớp bộ lọc. Thử bỏ bớt điều kiện."
            action={{ label: "Xoá bộ lọc", onClick: resetFilters }}
          />
        )
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <Table className="min-w-[1500px] table-fixed">
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[96px] whitespace-nowrap px-2 text-center">Tổ máy</TableHead>
                <TableHead className="w-[150px] text-center">Số yêu cầu</TableHead>
                <TableHead className="w-[180px] text-center">Cương vị</TableHead>
                <TableHead className="w-[240px] text-center">Nội dung</TableHead>
                <TableHead className="w-[110px] text-center">
                  <ColumnFilter
                    label="Mức độ"
                    value={severityFilter}
                    options={DEFECT_SEVERITY_ORDER.map((s) => ({ value: s, label: DEFECT_SEVERITY[s] }))}
                    onChange={setSeverityFilter}
                  />
                </TableHead>
                <TableHead className="w-[150px] text-center">
                  <ColumnFilter
                    label="Tình trạng"
                    value={statusFilter}
                    options={[
                      { value: "SOURCE_MISSING", label: "Không còn trên Google Sheet" },
                      { value: "TON_DONG", label: "Tồn đọng" },
                      ...DEFECT_STATUS_ORDER
                        .filter((s) => s !== "DA_XU_LY")
                        .map((s) => ({ value: s, label: DEFECT_STATUS[s].label })),
                    ]}
                    onChange={setStatusFilter}
                  />
                </TableHead>
                <TableHead className="w-[180px] text-center">Kết quả sửa chữa</TableHead>
                <TableHead className="w-[100px] text-center">Nhắc lại</TableHead>
                <TableHead className="w-[120px] text-center">Phát hiện</TableHead>
                <TableHead className="w-[110px] text-center">Người cập nhật</TableHead>
                <TableHead className="w-[110px] text-center">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedDefects.map((d) => {
                const expanded = expandedId === d.id;
                return (
                  <React.Fragment key={d.id}>
                    <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(expanded ? null : d.id)}>
                      <TableCell className="whitespace-nowrap px-3 py-3 text-[13px] font-semibold text-ink">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(expanded ? null : d.id);
                            }}
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-colors",
                              expanded ? "bg-rose-500" : "bg-emerald-500"
                            )}
                            title={expanded ? "Thu gọn" : "Mở chi tiết"}
                          >
                            {expanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                          </button>
                          <span>{d.unit}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-[13px] text-ink">
                        <div className="truncate" title={d.requestNumber ?? undefined}>{d.requestNumber || "—"}</div>
                        {d.sourceType === "GOOGLE_SHEETS" && (
                          <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Google Sheet</span>
                            {d.syncState === "MISSING" && (
                              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-700 ring-1 ring-rose-200">
                                Không còn nguồn
                              </span>
                            )}
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                                d.deviceSeq
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-orange-100 text-orange-700"
                              )}
                            >
                              {d.deviceSeq ? "Đã ánh xạ" : "Chưa ánh xạ"}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-[13px] text-muted-foreground">
                        <div className="truncate" title={d.system ?? undefined}>{d.system ?? "—"}</div>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-[13px] text-ink">
                        <div className="whitespace-pre-wrap break-words text-left leading-6">
                          {d.content || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center">
                        {d.severity ? (
                          <span title={DEFECT_SEVERITY[d.severity as keyof typeof DEFECT_SEVERITY]} className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", SEVERITY_TONE[d.severity] ?? "bg-muted text-ink")}>{d.severity}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center">
                        {d.syncState === "MISSING" ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800 ring-1 ring-rose-200"
                            title="Dòng dữ liệu này không còn xuất hiện trong lần đồng bộ Google Sheet gần nhất"
                          >
                            <CloudOff className="h-3.5 w-3.5" />
                            Không còn trên Google Sheet
                          </span>
                        ) : d.pendingHistory ? (
                          <span
                            className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-200"
                            title={`Hệ thống sẽ chốt lịch sử vào ${formatDate(d.pendingHistory.finalizeAt)}`}
                          >
                            Chờ chốt lịch sử · {formatDate(d.pendingHistory.finalizeAt)}
                          </span>
                        ) : d.postRepairAwaitingMaterial ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                            Tồn đọng · Chờ vật tư
                          </span>
                        ) : (
                          <DefectStatusBadge status={d.status} />
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-[12px]">
                        {d.repairResultRaw ? (
                          <span
                            className={cn(
                              "inline-flex max-w-full rounded-lg px-2 py-1 font-semibold leading-4",
                              d.sourceStatusMismatch
                                ? "bg-red-100 text-red-700 ring-1 ring-red-200"
                                : "bg-emerald-50 text-emerald-700"
                            )}
                            title={d.sourceStatusMismatch
                              ? `Kết quả sửa chữa không khớp tình trạng hiện tại: ${d.sourceStatusRaw || "—"}`
                              : d.repairResultRaw}
                          >
                            <span className="line-clamp-2">{d.repairResultRaw}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-[13px]">
                        <span className={cn("font-semibold", d.reminderCount > 0 ? "text-amber-700" : "text-muted-foreground")}>
                          {d.reminderCount} lần
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-3 text-center text-[13px] text-muted-foreground">{formatDate(d.detectedAt)}</TableCell>
                      <TableCell className="px-3 py-3 text-center">
                        <DefectUserAvatar user={d.createdBy} />
                      </TableCell>
                      <TableCell className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {canManage && (
                            (d.sourceType === "GOOGLE_SHEETS" && !!d.deviceSeq && !d.pendingHistory && !d.postRepairAwaitingMaterial && d.syncState !== "CONFIRMED" && d.status === "DA_XU_LY") ||
                            (d.sourceType !== "GOOGLE_SHEETS" && d.status !== "DA_XU_LY")
                          ) && (
                            <Button disabled={detailLoadingId === d.id} variant="ghost" size="icon" title="Hoàn thành" className="text-muted-foreground hover:bg-green-50 hover:text-green-600" onClick={(e) => { e.stopPropagation(); void openComplete(d); }}><CheckCircle2 className="h-4 w-4" /></Button>
                          )}
                          {canManage && d.sourceType !== "GOOGLE_SHEETS" && d.status !== "DA_XU_LY" && (
                            <Button variant="ghost" size="icon" title="Nhắc lại" className="text-muted-foreground hover:bg-amber-50 hover:text-amber-700" onClick={(e) => { e.stopPropagation(); setRemindTarget(d); }}><BellRing className="h-4 w-4" /></Button>
                          )}
                          {canManage && (
                            <Button disabled={detailLoadingId === d.id} variant="ghost" size="icon" title={d.sourceType === "GOOGLE_SHEETS" ? "Ánh xạ thiết bị" : "Sửa"} onClick={(e) => { e.stopPropagation(); void openEdit(d); }}><Pencil className="h-4 w-4" /></Button>
                          )}
                          {canDelete && d.sourceType !== "GOOGLE_SHEETS" && (
                            <Button variant="ghost" size="icon" title="Xoá" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDelTarget(d); }}><Trash2 className="h-4 w-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={11} className="px-6 py-4">
                          <ExpandedDefectDetails id={d.id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
          </div>
          <div className="flex flex-col gap-3 border-t border-border p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div>
              Hiển thị {firstShown}-{lastShown} trong tổng số {total} bản ghi
              {isFiltered && <span> sau lọc</span>}
              {isFetching && <span className="ml-2 text-blue-600">· Đang cập nhật…</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:ml-auto">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Hiển thị</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-8 rounded-md border border-input bg-white px-2 text-sm font-medium text-ink"
                  aria-label="Số dòng mỗi trang"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>dòng</span>
              </div>
              <PageButton icon={ChevronsLeft} label="Trang đầu" disabled={page <= 1} onClick={() => setPage(1)} />
              <PageButton icon={ChevronLeft} label="Trang trước" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} />
              <span className="mx-2 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-ink">
                {page}/{totalPages}
              </span>
              <PageButton icon={ChevronRight} label="Trang sau" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} />
              <PageButton icon={ChevronsRight} label="Trang cuối" disabled={page >= totalPages} onClick={() => setPage(totalPages)} />
            </div>
          </div>
        </Card>
      )}

      {/* Panel nhập khiếm khuyết (trượt từ phải) */}
      {formOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setFormOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-xl animate-in slide-in-from-right">
            <div className="flex items-center gap-2 border-b border-border p-4">
              <button onClick={() => setFormOpen(false)} className="rounded-md p-1.5 hover:bg-muted" aria-label="Đóng"><X className="h-5 w-5" /></button>
              <h2 className="text-lg font-bold text-ink">
                {editTarget?.sourceType === "GOOGLE_SHEETS" ? "Ánh xạ thiết bị" : editTarget ? "Sửa khiếm khuyết" : "Nhập khiếm khuyết"}
              </h2>
            </div>
            <DefectForm
              defect={editTarget}
              onDone={() => setFormOpen(false)}
              onMappingSaved={(updated) => {
                setFormOpen(false);
                setEditTarget(null);
                if (updated.status === "DA_XU_LY" && !updated.pendingHistory && !updated.postRepairAwaitingMaterial && updated.syncState !== "CONFIRMED") {
                  setCompleteTarget(updated);
                }
              }}
              onCancel={() => setFormOpen(false)}
            />
          </div>
        </div>
      )}

      <CompleteDefectDialog defect={completeTarget} onClose={() => setCompleteTarget(null)} />

      <ConfirmDialog
        open={!!remindTarget}
        onOpenChange={(open) => !open && setRemindTarget(null)}
        title="Xác nhận nhắc lại?"
        description={remindTarget
          ? `Ghi nhận lần nhắc thứ ${remindTarget.reminderCount + 1}${remindTarget.requestNumber ? ` cho yêu cầu “${remindTarget.requestNumber}”` : ""}.`
          : undefined}
        confirmLabel="Nhắc lại"
        destructive={false}
        loading={remind.isPending}
        onConfirm={async () => {
          if (!remindTarget) return;
          try {
            const updated = await remind.mutateAsync(remindTarget.id);
            toast.success(`Đã ghi nhận nhắc lại lần ${updated.reminderCount}`);
            setRemindTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="Xoá khiếm khuyết?"
        description={delTarget ? `Xoá khiếm khuyết${delTarget.requestNumber ? ` “${delTarget.requestNumber}”` : ""}? Hành động này không thể hoàn tác.` : undefined}
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={async () => {
          if (!delTarget) return;
          try {
            await del.mutateAsync(delTarget.id);
            toast.success("Đã xoá khiếm khuyết");
            setDelTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function PageButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// Màu mức độ khiếm khuyết: 1 đỏ · 2 cam · 3 vàng · 4 xám.
const SEVERITY_TONE: Record<string, string> = {
  "1": "bg-red-100 text-red-700",
  "2": "bg-orange-100 text-orange-700",
  "3": "bg-yellow-100 text-yellow-800",
  "4": "bg-gray-100 text-gray-600",
};

function DefectSyncSummary({ run }: { run: DefectSyncRun }) {
  const running = run.status === "RUNNING";
  const success = run.status === "SUCCESS";
  const label = running ? "Đang đồng bộ" : success ? "Đồng bộ thành công" : "Đồng bộ thất bại";
  const sourceLabel = run.expectedSources
    .map((source) => source === "CO" ? "Cơ" : source === "DIEN" ? "Điện" : source)
    .join(", ");

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between",
        running && "border-sky-200 bg-sky-50/80",
        success && "border-emerald-200 bg-emerald-50/70",
        !running && !success && "border-rose-200 bg-rose-50/80"
      )}
      role="status"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            running && "animate-pulse bg-sky-500",
            success && "bg-emerald-500",
            !running && !success && "bg-rose-500"
          )}
        />
        <div className="min-w-0">
          <div className="font-semibold text-ink">{label}</div>
          <div className="truncate text-xs text-muted-foreground">
            {sourceLabel || "Không xác định nguồn"} · bắt đầu{" "}
            {new Intl.DateTimeFormat("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date(run.startedAt))}
          </div>
        </div>
      </div>
      {!running && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
          <span>Đọc {run.readCount.toLocaleString("vi-VN")}</span>
          <span>Mới {run.createdCount.toLocaleString("vi-VN")}</span>
          <span>Cập nhật {run.updatedCount.toLocaleString("vi-VN")}</span>
          <span>Không đổi {run.unchangedCount.toLocaleString("vi-VN")}</span>
          {run.missingCount > 0 && <span>Không còn nguồn {run.missingCount.toLocaleString("vi-VN")}</span>}
        </div>
      )}
      {!running && !success && run.error && (
        <div className="max-w-xl text-xs font-medium text-rose-700">{run.error}</div>
      )}
    </div>
  );
}

// Bộ lọc gắn trên tiêu đề cột (nút phễu + danh sách lựa chọn), giống bảng Thiết bị.
function ColumnFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const active = value !== "ALL";
  return (
    <div className="inline-flex h-8 items-center justify-center gap-1">
      <span className="whitespace-nowrap">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-6 w-6 rounded-full border border-transparent text-muted-foreground transition-colors hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700",
              active && "border-blue-200 bg-blue-50 text-blue-700 shadow-sm shadow-blue-100"
            )}
            title={`Lọc theo ${label.toLowerCase()}`}
            aria-label={`Lọc theo ${label.toLowerCase()}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
          <DropdownMenuItem
            className={cn("justify-between text-sm", value === "ALL" && "bg-blue-50 text-blue-700")}
            onClick={() => onChange("ALL")}
          >
            <span>Tất cả</span>
            {value === "ALL" && <span className="text-xs font-bold">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="max-h-64 overflow-y-auto">
            {options.map((o) => (
              <DropdownMenuItem
                key={o.value}
                className={cn("justify-between gap-3 text-sm", value === o.value && "bg-blue-50 text-blue-700")}
                onClick={() => onChange(o.value)}
              >
                <span className="truncate">{o.label}</span>
                {value === o.value && <span className="text-xs font-bold">✓</span>}
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ExpandedDefectDetails({ id }: { id: string }) {
  const detail = useDefect(id);
  if (detail.isLoading) {
    return <div className="py-6 text-center text-sm text-muted-foreground">Đang tải chi tiết…</div>;
  }
  if (detail.isError || !detail.data?.data) {
    return <div className="py-6 text-center text-sm font-medium text-rose-700">Không tải được chi tiết khiếm khuyết</div>;
  }
  return <DefectExpandedDetails defect={detail.data.data} />;
}

function DefectExpandedDetails({ defect }: { defect: DefectItem }) {
  const severityCriteria = defectSeverityCriteriaLabels(
    defect.severity,
    defect.severityCriteria
  );
  const severity = severityCriteria.length > 0
    ? severityCriteria.map((criterion) => `Mức ${defect.severity} · ${criterion}`).join("\n")
    : defect.severity
      ? DEFECT_SEVERITY[defect.severity as keyof typeof DEFECT_SEVERITY] ?? defect.severity
      : "—";
  const status = DEFECT_STATUS[defect.status as keyof typeof DEFECT_STATUS]?.label ?? defect.status;
  const detailCardClass = "w-full space-y-2 rounded-xl border border-border/70 bg-white/70 p-3 shadow-sm";

  return (
    <div className="grid gap-5 px-1 py-1 text-[13px] leading-5 lg:grid-cols-2">
      <div className={detailCardClass}>
        <DetailLine label="Số yêu cầu" value={defect.requestNumber || "—"} />
        <DetailLine label="Yêu cầu" value={defect.requestType || "—"} />
        <DetailLine label="Tổ máy" value={defect.unit || "—"} />
        <DetailLine label="Cương vị" value={defect.system || "—"} />
        <DetailLine label="Trưởng ca" value={defect.shiftLeaderName || "—"} />
        {defect.sourceType === "GOOGLE_SHEETS" && (
          <DetailLine label="Thiết bị theo nguồn" value={defect.sourceDeviceRaw || "—"} multiline />
        )}
        <DetailLine label="Thiết bị đã ánh xạ" value={defect.device || "—"} />
        <DetailLine
          label="Thiết bị liên quan"
          value={defect.relatedDevices.length > 0
            ? defect.relatedDevices.map((item) => `${item.device.name} (${item.deviceSeq})`).join("\n")
            : "—"}
          multiline
        />
        <DetailLine label="Nội dung" value={defect.content || "—"} multiline />
      </div>
      <div className={detailCardClass}>
        <DetailLine label="Mức độ" value={severity} multiline={severityCriteria.length > 0} />
        <DetailLine label="Tình trạng" value={status} />
        <DetailLine label="Ảnh hưởng PCCC" value={defect.fireSafetyImpact || "—"} />
        <DetailLine label="Môi trường, ATVSLĐ" value={defect.environmentSafetyImpact || "—"} />
        <DetailLine label="Ngày phát hiện" value={formatDate(defect.detectedAt)} />
        <DetailLine label="Số lần nhắc lại" value={`${defect.reminderCount} lần`} />
        <DetailLine label="Ngày nhắc gần nhất" value={defect.lastRemindedAt ? formatDate(defect.lastRemindedAt) : "—"} />
        {defect.sourceType === "GOOGLE_SHEETS" && (
          <>
            <DetailLine label="Nội dung nhắc lại" value={defect.reminderRaw || "—"} multiline />
            <DetailLine label="Sửa chữa lặp lại" value={defect.repeatedRepairRaw || "—"} multiline />
            <DetailLine
              label="Trạng thái đồng bộ"
              value={defect.syncState === "MISSING" ? "⚠ Không còn trên Google Sheet" : "Đang có trên Google Sheet"}
            />
            {defect.pendingHistory && (
              <>
                <DetailLine label="Xác nhận chờ lịch sử" value={formatDate(defect.pendingHistory.startedAt)} />
                <DetailLine label="Dự kiến chốt lịch sử" value={formatDate(defect.pendingHistory.finalizeAt)} />
              </>
            )}
            <DetailLine label="Trạng thái nguồn" value={defect.sourceStatusRaw || "—"} />
            <DetailLine
              label="Kết quả sửa chữa"
              value={defect.sourceStatusMismatch
                ? `⚠ ${defect.repairResultRaw || "—"} (khác tình trạng VH1)`
                : defect.repairResultRaw || "—"}
              multiline
            />
            <DetailLine label="Đồng bộ gần nhất" value={formatDate(defect.sourceSyncedAt)} />
          </>
        )}
        <DetailLine label="Ghi chú" value={defect.note || "—"} multiline />
        <DetailLine label="Người cập nhật cuối" value={defect.createdBy?.name || "—"} />
        {defect.images.length > 0 && (
          <div className="pt-1">
            <div className="mb-2 font-semibold text-ink">Hình ảnh:</div>
            <div className="flex flex-wrap gap-2">
              {defect.images.map((src, index) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Ảnh khiếm khuyết ${index + 1}`} className="h-20 w-20 rounded-lg border border-border object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailLine({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-3">
      <div className="whitespace-nowrap font-semibold text-ink">{label}:</div>
      <div className={cn("min-w-0 text-ink", multiline ? "whitespace-pre-wrap break-words" : "truncate")} title={!multiline ? value : undefined}>
        {value}
      </div>
    </div>
  );
}

function DefectUserAvatar({ user }: { user?: DefectItem["createdBy"] | null }) {
  if (!user) return <span className="text-sm text-muted-foreground">—</span>;

  return (
    <div
      className="flex justify-center"
      title={`${user.name}${user.position ? ` · ${user.position}` : ""}`}
      aria-label={`Người cập nhật khiếm khuyết gần nhất: ${user.name}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-[11px] font-bold text-white shadow-sm ring-1 ring-border">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
        ) : (
          initials(user.name)
        )}
      </span>
    </div>
  );
}

const KPI_TONES = {
  rose: { bg: "from-rose-50 to-rose-100", num: "text-rose-600", icon: "text-rose-400", shadow: "shadow-rose-500/25 hover:shadow-rose-500/40" },
  sky: { bg: "from-sky-50 to-sky-100", num: "text-sky-600", icon: "text-sky-400", shadow: "shadow-sky-500/25 hover:shadow-sky-500/40" },
  amber: { bg: "from-amber-50 to-amber-100", num: "text-amber-600", icon: "text-amber-400", shadow: "shadow-amber-500/25 hover:shadow-amber-500/40" },
  orange: { bg: "from-orange-50 to-orange-100", num: "text-orange-700", icon: "text-orange-500", shadow: "shadow-orange-500/25 hover:shadow-orange-500/40" },
  green: { bg: "from-emerald-50 to-emerald-100", num: "text-emerald-700", icon: "text-emerald-500", shadow: "shadow-emerald-500/25 hover:shadow-emerald-500/40" },
  violet: { bg: "from-violet-50 to-violet-100", num: "text-violet-600", icon: "text-violet-400", shadow: "shadow-violet-500/25 hover:shadow-violet-500/40" },
} as const;

/**
 * KPI card 3D: nghiêng theo con trỏ (perspective tilt), phân lớp chiều sâu
 * (số & icon nổi lên bằng translateZ), bóng màu + lớp bóng kính.
 */
function DefectKpi({ value, label, icon: Icon, tone, active, onClick }: { value: number; label: string; icon: any; tone: keyof typeof KPI_TONES; active?: boolean; onClick?: () => void }) {
  const t = KPI_TONES[tone];
  const ref = React.useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = React.useState("perspective(900px)");

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (0.5 - py) * 9;
    const ry = (px - 0.5) * 11;
    setTilt(`perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(1.035)`);
  }

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } }}
      onMouseMove={onMove}
      onMouseLeave={() => setTilt("perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)")}
      style={{ transform: tilt, transformStyle: "preserve-3d" }}
      className={cn(
        "group relative flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-gradient-to-br px-6 py-5 shadow-lg ring-1 transition-[transform,box-shadow] duration-200 will-change-transform hover:shadow-2xl focus:outline-none",
        t.bg,
        t.shadow,
        active ? "ring-2 ring-navy ring-offset-2" : "ring-white/60"
      )}
    >
      {/* lớp bóng kính ở trên */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/60 via-transparent to-transparent opacity-70" />
      <div className="relative min-w-0" style={{ transform: "translateZ(28px)" }}>
        <div className={cn("text-[42px] font-extrabold leading-none tracking-tight", t.num)} style={{ textShadow: "0 2px 4px rgba(0,0,0,0.08)" }}>
          {value}
        </div>
        <div className="mt-2.5 truncate text-sm font-semibold text-muted-foreground">{label}</div>
      </div>
      <Icon
        className={cn("relative h-16 w-16 shrink-0 drop-shadow-md transition-transform duration-200 group-hover:scale-110", t.icon)}
        strokeWidth={1.5}
        style={{ transform: "translateZ(48px)" }}
      />
    </div>
  );
}

function DefectStatusBadge({ status }: { status: string }) {
  const meta = DEFECT_STATUS[status as keyof typeof DEFECT_STATUS];
  if (!meta) return <span className="text-xs">{status}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", meta.badge)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}
