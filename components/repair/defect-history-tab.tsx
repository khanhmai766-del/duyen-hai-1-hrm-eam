"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
  Trash2,
  X,
  Plus,
  Pencil,
  FileClock,
  Filter,
  Check,
  UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { AnnualBackupExport } from "@/components/shared/annual-backup-export";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DefectHistoryDialog } from "@/components/repair/defect-history-dialog";
import { DefectExpandedDetailsById } from "@/components/defects/defect-expanded-details";
import { LockChip } from "@/components/shared/lock-chip";
import { PendingHistoryEditDialog } from "@/components/repair/pending-history-edit-dialog";
import { useDefectHistory, useDeleteDefectHistory, type DefectHistoryFilters, type DefectHistoryItem } from "@/hooks/useDefectHistory";
import { usePositions } from "@/hooks/useUsers";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { DEFECT_REQUEST_TYPES, DEFECT_UNITS, isSelectableManagingPosition } from "@/lib/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, initials, cn } from "@/lib/utils";
import { normalizeText } from "@/lib/nav";

type SortKey = "workOrderNumber" | "performedAt" | "unit" | "content" | "system" | "device" | "createdBy" | "locked" | "requestType";
type SortDir = "asc" | "desc";

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Phiếu đã xác nhận lưu lịch sử nằm ở đây với trạng thái Chờ chốt, nên mặc
 * định mở đúng nhóm đó — VHV vừa bấm lưu là thấy ngay phiếu của mình.
 */
const HISTORY_STATUSES = [
  { value: "PENDING" as const, label: "Chờ chốt" },
  { value: "FINALIZED" as const, label: "Đã chốt" },
];
type HistoryStatusFilter = (typeof HISTORY_STATUSES)[number]["value"];

export function DefectHistoryTab({ role }: { role?: string }) {
  const searchParams = useSearchParams();
  const deviceFromUrl = searchParams.get("device")?.trim() ?? "";
  const deviceSeqFromUrl = searchParams.get("deviceSeq")?.trim() ?? "";
  const mappedUnitFromUrl = searchParams.get("mappedUnit")?.trim() ?? "";
  const includeDescendantsFromUrl = searchParams.get("includeDescendants")?.trim() ?? "";
  const unitFromUrl = searchParams.get("unit")?.trim().toUpperCase() ?? "";
  const rbac = useRbacAccess();
  const canCreate = rbac.can("defect-manage", ["personal", "manage", "full"]);
  const canManage = rbac.can("defect-manage", ["manage", "full"]);
  const canDelete = rbac.can("defect-history-delete", ["full"]);
  // Loại Quản đốc / Phó quản đốc / Thống kê / Kỹ thuật viên khỏi bộ lọc cương vị.
  const positions = usePositions().filter(isSelectableManagingPosition);
  const [filters, setFilters] = React.useState<DefectHistoryFilters>(() => ({
    ...(deviceFromUrl ? { device: deviceFromUrl } : {}),
    ...(deviceSeqFromUrl ? { deviceSeq: deviceSeqFromUrl } : {}),
    ...(mappedUnitFromUrl ? { mappedUnit: mappedUnitFromUrl } : {}),
    ...(includeDescendantsFromUrl ? { includeDescendants: includeDescendantsFromUrl } : {}),
    // Khi vào trang từ menu, mặc định hiển thị tổ máy S1.
    // Vẫn ưu tiên tham số URL để các liên kết mở sẵn S2/COMMON hoạt động như cũ.
    unit: ["S1", "S2", "COMMON"].includes(unitFromUrl) ? unitFromUrl : "S1",
  }));
  // Mặc định Cơ theo thói quen tra cứu; "ALL" để xem tất cả loại yêu cầu.
  const [requestTypeFilter, setRequestTypeFilter] = React.useState("Cơ");
  // "Yêu cầu" phải đi kèm lên server: lọc ở client thì trần HISTORY_TAKE đã cắt mất
  // dữ liệu trước khi client kịp lọc (S1 có 532 bản Cơ đã chốt, chỉ nhận về 300).
  const queryFilters = React.useMemo(
    () => ({ ...filters, ...(requestTypeFilter !== "ALL" ? { requestType: requestTypeFilter } : {}) }),
    [filters, requestTypeFilter]
  );
  const { data, isLoading } = useDefectHistory(queryFilters);
  const del = useDeleteDefectHistory();
  const rows = React.useMemo(() => data?.data ?? [], [data?.data]);
  // Tên thiết bị nay do /api/defect-history trả kèm (quan hệ node) — trước đây phải tải
  // TOÀN BỘ danh mục thiết bị (~10 MB) mỗi lần mở trang chỉ để dựng bảng tra mã → tên.
  const deviceNameByCode = React.useMemo(
    // Khoá theo r.device (mã snapshot) đúng như bảng tra cũ, để mọi chỗ dùng giữ nguyên.
    () => new Map((rows ?? []).flatMap((r) => (r.device && r.node ? [[r.device, r.node.name] as const] : []))),
    [rows]
  );

  const [delTarget, setDelTarget] = React.useState<DefectHistoryItem | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DefectHistoryItem | null>(null);
  const [tableSearch, setTableSearch] = React.useState("");
  const [pageSize, setPageSize] = React.useState(10);
  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState<HistoryStatusFilter>("PENDING");
  const [pendingEditDefectId, setPendingEditDefectId] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: SortDir }>({ key: "performedAt", dir: "desc" });

  function setFilter<K extends keyof DefectHistoryFilters>(k: K, v: string) {
    setFilters((f) => ({ ...f, [k]: v || undefined }));
  }

  /**
   * Xoá lọc về mặc định: tổ máy quay lại S1 (bộ lọc này luôn phải có một giá
   * trị), giữ nguyên các tham số đến từ URL để link mở sẵn thiết bị không hỏng.
   */
  function resetFilters() {
    setFilters((f) => ({
      ...(f.device ? { device: f.device } : {}),
      ...(f.deviceSeq ? { deviceSeq: f.deviceSeq } : {}),
      ...(f.mappedUnit ? { mappedUnit: f.mappedUnit } : {}),
      ...(f.includeDescendants ? { includeDescendants: f.includeDescendants } : {}),
      unit: "S1",
    }));
    setRequestTypeFilter("Cơ");
    setTableSearch("");
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const visibleRows = React.useMemo(() => {
    // Chờ chốt và Đã chốt là hai nhóm tách bạch: bản nháp chờ chốt hiện chi tiết
    // theo phiếu khiếm khuyết, bản đã chốt hiện chi tiết theo bản ghi lịch sử.
    const byStatus = rows
      .filter((r) => (statusFilter === "PENDING" ? r.historyStatus === "PENDING" : r.historyStatus !== "PENDING"))
      .filter((r) => requestTypeFilter === "ALL" || (r.requestType ?? "") === requestTypeFilter);
    const q = normalizeText(tableSearch);
    const searched = q
      ? byStatus.filter((r) =>
          normalizeText(
            [
              r.workOrderNumber,
              r.requestType,
              r.requestNumber,
              r.unit,
              r.system,
              r.device,
              deviceNameByCode.get(r.device ?? ""),
              r.result,
              r.defectContent,
              r.content,
              r.createdBy?.name,
              r.createdBy?.position,
            ]
              .filter(Boolean)
              .join(" ")
          ).includes(q)
        )
      : byStatus;

    return [...searched].sort((a, b) => compareRows(a, b, sort.key, sort.dir, deviceNameByCode));
  }, [rows, statusFilter, requestTypeFilter, tableSearch, sort, deviceNameByCode]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  React.useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);
  React.useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [filters, statusFilter, requestTypeFilter, tableSearch, pageSize, sort]);

  const pagedRows = visibleRows.slice((page - 1) * pageSize, page * pageSize);
  const firstShown = visibleRows.length ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, visibleRows.length);
  const actionCol = canManage || canDelete;
  // Mở rộng + Thiết bị + Loại yêu cầu + Tổ máy + Kết thúc + Người cập nhật
  // + Chốt lịch sử (+ Thao tác)
  const detailColSpan = actionCol ? 8 : 7;
  // Tổ máy LUÔN có giá trị (mặc định S1) nên không tính là đang lọc, nếu không
  // nút Xoá bộ lọc sẽ sáng vĩnh viễn và ô "Chưa có lịch sử" không bao giờ hiện.
  const hasActiveFilters =
    Boolean(filters.position || filters.from || filters.to || filters.workOrderNumber || filters.device || filters.deviceSeq)
    || (filters.unit ?? "S1") !== "S1"
    || requestTypeFilter !== "Cơ"
    || tableSearch.trim().length > 0;
  const backupColumns = React.useMemo(
    () => [
      { key: "stt", header: "STT", width: 7, align: "center" as const, value: (_row: DefectHistoryItem, index: number) => index + 1 },
      { key: "workOrderNumber", header: "Số phiếu công tác", width: 26, value: (r: DefectHistoryItem) => r.workOrderNumber },
      { key: "requestType", header: "PCT", width: 12, align: "center" as const, value: (r: DefectHistoryItem) => r.requestType },
      { key: "performedAt", header: "Ngày kết thúc", width: 15, align: "center" as const, value: (r: DefectHistoryItem) => formatDate(r.performedAt) },
      { key: "unit", header: "Tổ máy", width: 10, align: "center" as const, value: (r: DefectHistoryItem) => r.unit },
      { key: "system", header: "Cương vị", width: 22, value: (r: DefectHistoryItem) => r.system },
      { key: "deviceName", header: "Tên thiết bị", width: 28, value: (r: DefectHistoryItem) => deviceNameByCode.get(r.device ?? "") ?? r.device },
      { key: "defectContent", header: "Nội dung công tác", width: 36, value: (r: DefectHistoryItem) => r.defectContent },
      { key: "content", header: "Nội dung thực hiện", width: 36, value: (r: DefectHistoryItem) => r.content },
      { key: "result", header: "Kết quả thực hiện", width: 36, value: (r: DefectHistoryItem) => r.result },
      { key: "operator", header: "Vận hành viên", width: 24, value: (r: DefectHistoryItem) => r.createdBy?.name },
    ],
    [deviceNameByCode]
  );

  return (
    <div className="space-y-6">
      <PageHeader title="LỊCH SỬ SỬA CHỮA" description="Lịch sử khiếm khuyết thiết bị đã xử lý theo cương vị">
        <AnnualBackupExport
          rows={visibleRows.filter((row) => row.historyStatus !== "PENDING")}
          columns={backupColumns}
          dateAccessor={(row) => row.performedAt}
          title="LỊCH SỬ SỬA CHỮA"
          subtitle="Báo cáo backup lịch sử sửa chữa thiết bị theo năm"
          filenamePrefix="lich-su-sua-chua"
        />
        {canCreate && (
          <Button size="toolbar" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Thêm mới</Button>
        )}
      </PageHeader>

      {/* Thanh lọc theo bản mẫu lich-su-sua-chua: nhãn IN HOA cỡ nhỏ, các nút
          tổ máy dính liền thành một khối, nút Xoá bộ lọc đẩy sát phải. */}
      <Card className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <FilterLabel>Cương vị</FilterLabel>
          <Select value={filters.position ?? "ALL"} onValueChange={(v) => setFilter("position", v === "ALL" ? "" : v)}>
            <SelectTrigger className="h-8 w-40 rounded-md text-[13px] md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả</SelectItem>
              {positions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <FilterLabel>Trạng thái</FilterLabel>
          <div className="inline-flex overflow-hidden rounded-md border border-input bg-white">
            {HISTORY_STATUSES.map((option) => {
              const active = statusFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(option.value)}
                  className={cn(
                    "border-r border-input px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors last:border-r-0",
                    active ? "bg-[#00558F] text-white" : "text-ink/70 hover:bg-muted hover:text-ink"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <FilterLabel>Tổ máy</FilterLabel>
          <div className="inline-flex overflow-hidden rounded-md border border-input bg-white">
            {DEFECT_UNITS.map((u) => {
              const active = (filters.unit ?? "") === u;
              return (
                <button
                  key={u}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter("unit", u)}
                  className={cn(
                    "border-r border-input px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors last:border-r-0",
                    active ? "bg-[#00558F] text-white" : "text-ink/70 hover:bg-muted hover:text-ink"
                  )}
                >
                  {u}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <FilterLabel>Từ ngày</FilterLabel>
          <Input type="date" value={filters.from ?? ""} onChange={(e) => setFilter("from", e.target.value)} className="h-8 w-[150px] rounded-md bg-white text-[13px]" />
          <FilterLabel>Đến ngày</FilterLabel>
          <Input type="date" value={filters.to ?? ""} onChange={(e) => setFilter("to", e.target.value)} className="h-8 w-[150px] rounded-md bg-white text-[13px]" />
        </div>

        <button
          type="button"
          onClick={resetFilters}
          disabled={!hasActiveFilters}
          className="ml-auto h-8 rounded-md border border-input bg-white px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40"
        >
          Xoá bộ lọc
        </button>
      </Card>

      {/* Chạm trần truy vấn: nói thẳng ra thay vì âm thầm trả thiếu dòng. */}
      {data?.meta?.capped === true && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Kết quả đã chạm giới hạn truy vấn nên có thể chưa hiện đủ. Thu hẹp bằng
            cương vị, khoảng ngày hoặc loại yêu cầu để xem chính xác.
          </span>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : rows.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={ShieldCheck}
          title="Chưa có lịch sử khiếm khuyết"
          description="Khi một khiếm khuyết được bấm “Hoàn thành”, bản ghi sẽ xuất hiện ở đây."
        />
      ) : (
        <Card className="overflow-hidden">
          {/* Thanh công cụ của bảng: số dòng bên trái, tìm kiếm bên phải */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/25 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-lg border border-input bg-white px-2 text-sm font-medium text-ink"
                aria-label="Số dòng mỗi trang"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span>dòng</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Tìm kiếm:</span>
              <div className="relative w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Tên thiết bị, nội dung, số phiếu..."
                  className="h-9 rounded-xl pl-9"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
          <Table className="min-w-[1160px]">
            {/* Đầu bảng nền xanh EVN, dính khi cuộn dọc trong vùng bảng */}
            <TableHeader>
              <TableRow className="border-0 hover:bg-transparent [&>th]:border-r [&>th]:border-white/20 [&>th:last-child]:border-r-0">
                <TableHead className="w-[52px] bg-[#00558F]" />
                <TableHead className="min-w-[280px] bg-[#00558F]"><SortHeader label="Thiết bị" sortKey="device" sort={sort} onSort={toggleSort} /></TableHead>
                <TableHead className="w-[136px] min-w-[136px] bg-[#00558F] px-2">
                  <div className="flex items-center justify-center gap-1.5">
                    <SortHeader label="Yêu cầu" sortKey="requestType" sort={sort} onSort={toggleSort} align="center" inline />
                    <RequestTypeColumnFilter value={requestTypeFilter} onChange={setRequestTypeFilter} />
                  </div>
                </TableHead>
                <TableHead className="w-[96px] bg-[#00558F] px-2"><SortHeader label="Tổ máy" sortKey="unit" sort={sort} onSort={toggleSort} align="center" /></TableHead>
                <TableHead className="w-[130px] bg-[#00558F] px-2"><SortHeader label="Kết thúc" sortKey="performedAt" sort={sort} onSort={toggleSort} align="center" /></TableHead>
                <TableHead className="w-[160px] bg-[#00558F] px-2"><SortHeader label="Người cập nhật" sortKey="createdBy" sort={sort} onSort={toggleSort} align="center" /></TableHead>
                <TableHead className="w-[145px] bg-[#00558F] px-2"><SortHeader label="Chốt lịch sử" sortKey="locked" sort={sort} onSort={toggleSort} align="center" /></TableHead>
                {actionCol && (
                  <TableHead className="w-[92px] bg-[#00558F] px-2 text-center text-[11px] font-semibold uppercase tracking-wider text-white">
                    Thao tác
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={detailColSpan} className="py-12 text-center text-sm text-muted-foreground">
                    Không tìm thấy bản ghi phù hợp.
                  </TableCell>
                </TableRow>
              ) : (
                pagedRows.map((r) => {
                  const expanded = expandedId === r.id;
                  const deviceName = deviceNameByCode.get(r.device ?? "") ?? r.device ?? "—";
                  const pending = r.historyStatus === "PENDING";
                  return (
                    <React.Fragment key={r.id}>
                      <TableRow
                        className={cn("cursor-pointer", expanded ? "bg-sky-50/70 hover:bg-sky-50/70" : "hover:bg-sky-50/40")}
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                      >
                        <TableCell className="px-0 py-3 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(expanded ? null : r.id);
                            }}
                            aria-expanded={expanded}
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm transition-all duration-200",
                              expanded ? "rotate-45 bg-[#00558F]" : "bg-emerald-600 hover:bg-emerald-700"
                            )}
                            title={expanded ? "Thu gọn" : "Xem chi tiết"}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          <div className="font-semibold leading-snug text-ink" title={deviceName}>{deviceName}</div>
                          <div className="mt-0.5 font-mono text-[11.5px] tracking-tight text-muted-foreground">
                            {r.device || "chưa có KKS"}
                            {r.workOrderNumber ? ` · ${r.workOrderNumber}` : r.requestNumber ? ` · YC ${r.requestNumber}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-center">
                          {r.requestType ? (
                            <span className="inline-block rounded-md bg-sky-50 px-2.5 py-0.5 text-[12.5px] font-semibold text-[#00558F]">
                              {r.requestType}
                            </span>
                          ) : (
                            <span className="text-[13px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-center">
                          <UnitBadge unit={r.unit} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3 py-2.5 text-center font-mono text-[13px] font-semibold text-ink">
                          {formatDate(r.performedAt)}
                        </TableCell>
                        {/* Cương vị đã có ở panel chi tiết nên cột này chỉ còn người cập nhật. */}
                        <TableCell className="px-3 py-2.5">
                          <div className="flex justify-center">
                            <UserByline user={r.createdBy} createdAt={r.createdAt} />
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-center">
                          <LockChip pending={pending} />
                          {pending && (
                            <div className="mt-1 font-mono text-[11px] text-muted-foreground">hạn {formatDate(r.finalizeAt)}</div>
                          )}
                        </TableCell>
                        {actionCol && (
                          <TableCell className="px-2 py-2.5">
                            <div className="flex items-center justify-center gap-1">
                              {canManage && pending && r.pendingDefectId && (
                                // Thao tác này trước nằm ở bảng Khiếm khuyết; phiếu đã dời
                                // sang đây nên nút sửa thông tin chờ chốt phải theo cùng.
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Sửa thông tin lịch sử"
                                  className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                  onClick={(e) => { e.stopPropagation(); setPendingEditDefectId(r.pendingDefectId!); }}
                                >
                                  <FileClock className="h-4 w-4" />
                                </Button>
                              )}
                              {canManage && !pending && (
                                <Button variant="ghost" size="icon" title="Sửa" onClick={(e) => { e.stopPropagation(); setEditTarget(r); }}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {canDelete && !pending && (
                                <Button variant="ghost" size="icon" title="Xoá" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDelTarget(r); }}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                      {expanded && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={detailColSpan} className="bg-slate-50/80 p-0">
                            <div className="border-l-[3px] border-[#00558F] py-4 pl-6 pr-5">
                              {/* Chờ chốt: dữ liệu còn nằm ở phiếu khiếm khuyết nên hiện
                                  đúng 3 bảng của phiếu. Đã chốt: đọc từ bản ghi lịch sử. */}
                              {pending && r.pendingDefectId ? (
                                <DefectExpandedDetailsById id={r.pendingDefectId} />
                              ) : (
                                <ExpandedDetails row={r} deviceName={deviceName} />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border bg-muted/25 px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div>
              {visibleRows.length === 0 ? (
                "Không có bản ghi nào"
              ) : (
                <>
                  Hiển thị <b className="font-mono text-ink">{firstShown}</b>–<b className="font-mono text-ink">{lastShown}</b> trong tổng số{" "}
                  <b className="font-mono text-ink">{visibleRows.length}</b> bản ghi
                  {tableSearch.trim() && <span> sau lọc</span>}
                </>
              )}
            </div>
            <Pager page={page} totalPages={totalPages} onGo={setPage} />
          </div>
        </Card>
      )}

      <DefectHistoryDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DefectHistoryDialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)} record={editTarget} />
      {pendingEditDefectId && (
        <PendingHistoryEditDialog defectId={pendingEditDefectId} onClose={() => setPendingEditDefectId(null)} />
      )}


      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="Xoá bản ghi lịch sử?"
        description="Xoá bản ghi lịch sử khiếm khuyết này? Hành động không thể hoàn tác."
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={async () => {
          if (!delTarget) return;
          try {
            await del.mutateAsync(delTarget.id);
            toast.success("Đã xoá bản ghi");
            setDelTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function compareRows(a: DefectHistoryItem, b: DefectHistoryItem, key: SortKey, dir: SortDir, deviceNameByCode: Map<string, string>) {
  const av = sortValue(a, key, deviceNameByCode);
  const bv = sortValue(b, key, deviceNameByCode);
  const result = typeof av === "number" && typeof bv === "number"
    ? av - bv
    : String(av).localeCompare(String(bv), "vi", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? result : -result;
}

function sortValue(row: DefectHistoryItem, key: SortKey, deviceNameByCode: Map<string, string>): string | number {
  if (key === "performedAt") return new Date(row.performedAt).getTime();
  // Đã chốt xếp trước Chờ chốt khi sắp tăng dần.
  if (key === "locked") return row.historyStatus === "PENDING" ? 1 : 0;
  if (key === "createdBy") return row.createdBy?.name ?? "";
  if (key === "workOrderNumber") return row.workOrderNumber ?? "";
  if (key === "requestType") return row.requestType ?? "";
  if (key === "unit") return row.unit ?? "";
  if (key === "content") return row.content ?? "";
  if (key === "system") return row.system ?? "";
  return deviceNameByCode.get(row.device ?? "") ?? row.device ?? "";
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  inline = false,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  align?: "left" | "center";
  /** Bỏ w-full khi tiêu đề còn phải nhường chỗ cho nút lọc bên cạnh. */
  inline?: boolean;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase leading-tight tracking-wider text-white/90 transition-colors hover:text-white",
        !inline && "w-full",
        align === "center" && "justify-center"
      )}
    >
      <span className="whitespace-nowrap">{label}</span>
      <Icon className={cn("h-3.5 w-3.5", active ? "text-white" : "text-white/50")} />
    </button>
  );
}

/** Nhãn của một ô lọc: IN HOA, cỡ nhỏ, giãn chữ nhẹ — theo .flabel của bản mẫu. */
function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * Lọc theo loại yêu cầu ngay trên tiêu đề cột, dạng phễu — giống bộ lọc Kết quả
 * sửa chữa ở bảng Khiếm khuyết. Nền đầu bảng màu xanh nên nút đảo màu so với
 * bản ở trang kia để vẫn đọc được.
 */
function RequestTypeColumnFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const active = value !== "ALL";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Lọc theo loại yêu cầu"
          title={active ? `Đang lọc: ${value}` : "Lọc theo loại yêu cầu"}
          className={cn(
            "flex h-6 w-7 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
            active
              ? "border-white bg-white text-[#00558F] shadow-sm"
              : "border-white/40 bg-white/10 text-white/80 hover:bg-white/25 hover:text-white"
          )}
        >
          <Filter className="h-3.5 w-3.5" fill={active ? "currentColor" : "none"} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-[220px]">
        <DropdownMenuLabel>Loại yêu cầu</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange("ALL")} className="gap-2">
          <Check className={cn("h-4 w-4", value === "ALL" ? "opacity-100" : "opacity-0")} />
          Tất cả
        </DropdownMenuItem>
        {DEFECT_REQUEST_TYPES.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onChange(option)} className="gap-2">
            <Check className={cn("h-4 w-4 shrink-0", value === option ? "opacity-100" : "opacity-0")} />
            <span>{option}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Nhãn tổ máy: S1 xanh lá, S2 tím, dùng chung xám — theo mẫu lich-su-sua-chua. */
function UnitBadge({ unit }: { unit: string }) {
  const tone =
    unit === "S1"
      ? "bg-emerald-50 text-emerald-700"
      : unit === "S2"
        ? "bg-violet-100 text-violet-700"
        : "bg-slate-100 text-slate-500";
  return (
    <span className={cn("inline-block rounded px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-wider", tone)}>
      {unit}
    </span>
  );
}

/** Phân trang đánh số như bản mẫu: ‹ 1 2 … n › */
function Pager({ page, totalPages, onGo }: { page: number; totalPages: number; onGo: (p: number) => void }) {
  const items: Array<number | "gap"> = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) items.push(i);
    else if (Math.abs(i - page) === 2) items.push("gap");
  }
  const btn = "h-8 min-w-8 rounded-lg border border-border px-2 font-mono text-[13px] font-semibold transition-colors";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={cn(btn, "text-muted-foreground hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40")} disabled={page <= 1} onClick={() => onGo(page - 1)} aria-label="Trang trước">
        <ChevronLeft className="mx-auto h-4 w-4" />
      </button>
      {items.map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-muted-foreground">…</span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === page}
            onClick={() => onGo(item)}
            className={cn(btn, item === page ? "border-[#00558F] bg-[#00558F] text-white" : "text-muted-foreground hover:border-accent hover:text-accent")}
          >
            {item}
          </button>
        )
      )}
      <button type="button" className={cn(btn, "text-muted-foreground hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40")} disabled={page >= totalPages} onClick={() => onGo(page + 1)} aria-label="Trang sau">
        <ChevronRight className="mx-auto h-4 w-4" />
      </button>
    </div>
  );
}

function ExpandedDetails({ row, deviceName }: { row: DefectHistoryItem; deviceName: string }) {
  const repair = repairReferenceOf(row.sourceSnapshot);
  return (
    <div className="space-y-3 text-[13px] leading-5">
      {/* Lưới các trường ngắn — theo bố cục .dgrid của bản mẫu */}
      <div className="grid gap-x-7 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <DetailField label="Tên thiết bị" value={deviceName} />
        <DetailField label="Mã KKS" value={row.device || "—"} mono />
        <DetailField label="Số phiếu công tác" value={row.workOrderNumber || "—"} mono />
        {/* Loại yêu cầu đã lên thành cột riêng của bảng nên nhường chỗ này cho
            người cập nhật, khỏi phải kéo mắt xuống cuối lưới mới thấy. */}
        <DetailField label="Người cập nhật" value={row.createdBy?.name || "—"} />
        <DetailField label="Số yêu cầu" value={row.requestNumber || "—"} mono />
        <DetailField label="Cương vị" value={row.system || "—"} />
        <DetailField label="Tổ máy" value={row.mappedDeviceUnit || row.unit} />
        <DetailField label="Ngày kết thúc" value={formatDate(row.performedAt)} mono />
        {row.reminderCount > 0 && (
          <DetailField
            label="Nhắc lại"
            value={`${row.reminderCount} lần${row.lastRemindedAt ? ` · gần nhất ${formatDate(row.lastRemindedAt)}` : ""}`}
          />
        )}
      </div>

      <div className="max-w-[900px] space-y-2">
        <DetailLine
          label="Thiết bị liên quan"
          value={row.relatedDevices.length > 0
            ? row.relatedDevices
                .map((item) => `${item.device.name} (${item.deviceSeq} · ${item.mappedUnit ?? row.mappedDeviceUnit ?? row.unit})`)
                .join("\n")
            : "—"}
          multiline
        />
        <DetailLine label="Nội dung công tác" value={row.defectContent || "—"} multiline />
        <DetailLine label="Nội dung thực hiện" value={row.content || "—"} multiline />
        <DetailLine label="Kết quả thực hiện" value={row.result || "—"} multiline />
      </div>
      {repair && (
        <div className="mt-3 space-y-2 rounded-md border border-blue-100 bg-blue-50/60 p-3">
          <div className="font-semibold text-blue-800">Thông tin Sửa chữa từ Google Sheet · chỉ tham khảo</div>
          <DetailLine label="Số PCT/LCT" value={repair.repairOrderNumberRaw || "—"} />
          <DetailLine label="Ngày hoàn thành" value={formatSnapshotDate(repair.sourceCompletedAt)} />
          <DetailLine label="Người thực hiện" value={repair.repairPerformedByRaw || "—"} multiline />
          <DetailLine label="Nội dung đã thực hiện" value={repair.repairPerformedContentRaw || "—"} multiline />
          {repair.repairNoteRaw && (
            <DetailLine label="Ghi chú Sửa chữa" value={repair.repairNoteRaw} multiline />
          )}
        </div>
      )}
    </div>
  );
}

/** Ô nhãn trên / giá trị dưới trong lưới chi tiết (theo .dfield của bản mẫu). */
function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 truncate font-medium text-ink", mono && "font-mono text-[12.5px]")} title={value}>
        {value}
      </div>
    </div>
  );
}

type RepairReference = {
  repairOrderNumberRaw?: string;
  sourceCompletedAt?: string;
  repairPerformedByRaw?: string;
  repairPerformedContentRaw?: string;
  repairNoteRaw?: string;
};

function repairReferenceOf(value: unknown): RepairReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const text = (key: string) => typeof source[key] === "string" && source[key] ? source[key] as string : undefined;
  const repair = {
    repairOrderNumberRaw: text("repairOrderNumberRaw"),
    sourceCompletedAt: text("sourceCompletedAt"),
    repairPerformedByRaw: text("repairPerformedByRaw"),
    repairPerformedContentRaw: text("repairPerformedContentRaw"),
    repairNoteRaw: text("repairNoteRaw"),
  };
  return Object.values(repair).some(Boolean) ? repair : null;
}

function formatSnapshotDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
}

function DetailLine({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-3">
      <div className="whitespace-nowrap font-semibold text-ink">{label}:</div>
      <div className={cn("min-w-0 text-ink", multiline ? "whitespace-pre-wrap break-words" : "truncate")} title={!multiline ? value : undefined}>{value}</div>
    </div>
  );
}

function UserByline({
  user,
  createdAt,
}: {
  user?: DefectHistoryItem["createdBy"] | null;
  createdAt?: Date | string | null;
}) {
  if (!user) {
    return (
      <span className="flex justify-center text-sm text-muted-foreground" title="Không có thông tin người cập nhật">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
          <UserRound className="h-4 w-4" />
        </span>
      </span>
    );
  }

  return (
    <div
      className="flex justify-center"
      title={`${user.name}${user.position ? ` · ${user.position}` : ""} · ${formatDate(createdAt)}`}
      aria-label={`Người cập nhật: ${user.name}`}
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
