"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { ShieldAlert, Wrench, CircleSlash, CircleDashed, Package, Plus, X, Pencil, Trash2, CheckCircle2, Minus, Search, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ExportButton } from "@/components/shared/export-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DefectForm } from "@/components/defects/defect-form";
import { CompleteDefectDialog } from "@/components/defects/complete-defect-dialog";
import { useDefects, useDeleteDefect, type DefectItem } from "@/hooks/useDefects";
import { useDevices } from "@/hooks/useDevices";
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
import { normalizeText } from "@/lib/nav";

const PAGE_SIZES = [10, 25, 50, 100];

export default function DefectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deviceSeqFilter = searchParams.get("deviceSeq")?.trim() ?? "";
  const unitFromUrl = searchParams.get("unit")?.toUpperCase();
  const { data: session } = useSession();
  const rbac = useRbacAccess();
  const canManage = rbac.can("defect-manage", ["create", "manage", "full"]);
  const canDelete = rbac.can("defect-close", ["approve", "manage", "full"]);

  const { data, isLoading } = useDefects();
  const del = useDeleteDefect();
  const allDefects = data?.data ?? [];

  // Tên thiết bị theo mã (để file xuất ghi rõ tên thay vì mã).
  const { data: devicesData } = useDevices({});
  const deviceNameByCode = React.useMemo(
    () => new Map((devicesData?.data ?? []).map((dv) => [dv.code, dv.name])),
    [devicesData]
  );

  // Cương vị lấy từ "Chức vụ" của Quản lý người dùng (bỏ trùng);
  // loại Quản đốc / Phó quản đốc / Kỹ thuật viên / Thống kê khỏi bộ lọc.
  const positions = usePositions().filter(isSelectableManagingPosition);

  // Bộ lọc (Tổ máy / Yêu cầu / Cương vị) — áp dụng cho cả KPI lẫn bảng.
  const [unitFilter, setUnitFilter] = React.useState<"ALL" | "S1" | "S2" | "COMMON">(
    unitFromUrl === "S1" || unitFromUrl === "S2" || unitFromUrl === "COMMON" ? unitFromUrl : "ALL"
  );
  const [requestFilter, setRequestFilter] = React.useState("ALL");
  const [positionFilter, setPositionFilter] = React.useState("ALL");
  const defects = allDefects.filter(
    (d) =>
      (!deviceSeqFilter || d.deviceSeq === deviceSeqFilter || (!d.deviceSeq && d.device === deviceSeqFilter)) &&
      (unitFilter === "ALL" || d.unit === unitFilter) &&
      (requestFilter === "ALL" || d.requestType === requestFilter) &&
      (positionFilter === "ALL" || d.system === positionFilter)
  );
  // Lọc theo tình trạng (card KPI hoặc bộ lọc trên cột) và mức độ (bộ lọc trên cột).
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [severityFilter, setSeverityFilter] = React.useState("ALL");
  const displayedDefects = defects.filter(
    (d) =>
      (statusFilter === "ALL" || d.status === statusFilter) &&
      (severityFilter === "ALL" || d.severity === severityFilter)
  );

  // Tìm nội dung trong bảng (không ảnh hưởng KPI) — so khớp không dấu.
  const [tableSearch, setTableSearch] = React.useState("");
  const [pageSize, setPageSize] = React.useState(25);
  const [page, setPage] = React.useState(1);
  const searchedDefects = React.useMemo(() => {
    const q = normalizeText(tableSearch.trim());
    if (!q) return displayedDefects;
    return displayedDefects.filter((d) =>
      normalizeText([d.requestNumber, d.requestType, d.unit, d.system, d.device, d.content, d.note, d.createdBy?.name].filter(Boolean).join(" ")).includes(q)
    );
  }, [displayedDefects, tableSearch]);

  // Phân trang bảng.
  const totalPages = Math.max(1, Math.ceil(searchedDefects.length / pageSize));
  const pagedDefects = searchedDefects.slice((page - 1) * pageSize, page * pageSize);
  const firstShown = searchedDefects.length ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, searchedDefects.length);
  React.useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const isFiltered = deviceSeqFilter !== "" || unitFilter !== "ALL" || requestFilter !== "ALL" || positionFilter !== "ALL" || statusFilter !== "ALL" || severityFilter !== "ALL" || tableSearch.trim() !== "";
  function resetFilters() {
    router.replace("/defects", { scroll: false });
    setUnitFilter("ALL");
    setRequestFilter("ALL");
    setPositionFilter("ALL");
    setStatusFilter("ALL");
    setSeverityFilter("ALL");
    setTableSearch("");
  }

  // KPI đếm theo bộ lọc (tổ máy/yêu cầu/cương vị), KHÔNG theo statusFilter.
  const chuaXuLy = defects.filter((d) => d.status === "CHUA_XU_LY").length;
  const coPct = defects.filter((d) => d.status === "CO_PCT").length;
  const choVatTu = defects.filter((d) => d.status === "CHO_VAT_TU").length;
  const tonDong = defects.filter((d) => d.status !== "DA_XU_LY").length;
  function toggleStatus(s: string) {
    setStatusFilter((cur) => (cur === s ? "ALL" : s));
  }

  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DefectItem | null>(null);
  const [delTarget, setDelTarget] = React.useState<DefectItem | null>(null);
  const [completeTarget, setCompleteTarget] = React.useState<DefectItem | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  function openCreate() { setEditTarget(null); setFormOpen(true); }
  function openEdit(d: DefectItem) { setEditTarget(d); setFormOpen(true); }
  React.useEffect(() => {
    setExpandedId(null);
    setPage(1);
  }, [deviceSeqFilter, unitFilter, requestFilter, positionFilter, statusFilter, severityFilter, tableSearch, pageSize]);

  return (
    <div className="space-y-6">
      <PageHeader title="KHIẾM KHUYẾT THIẾT BỊ" description="Theo dõi sự cố & khiếm khuyết thiết bị đang tồn đọng">
        <ExportButton
          rows={searchedDefects.map((d) => ({
            unit: d.unit,
            device: deviceNameByCode.get(d.device ?? "") ?? d.device ?? "",
            cuongVi: d.system ?? "",
            severity: d.severity ? DEFECT_SEVERITY[d.severity as keyof typeof DEFECT_SEVERITY] : "",
            requestType: d.requestType ?? "",
            requestNumber: d.requestNumber ?? "",
            content: d.content ?? "",
            status: DEFECT_STATUS[d.status as keyof typeof DEFECT_STATUS]?.label ?? d.status,
            detectedAt: formatDate(d.detectedAt),
            note: d.note ?? "",
          }))}
          widths={{ unit: 8, cuongVi: 16, requestNumber: 12, status: 14 }}
          filename="khiem-khuyet-thiet-bi"
        />
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Thêm mới
          </Button>
        )}
      </PageHeader>

      {deviceSeqFilter && (
        <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Đang lọc theo thiết bị</p>
            <p className="truncate font-semibold text-ink">
              {deviceNameByCode.get(deviceSeqFilter) ?? "Thiết bị"}
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

      {!isLoading && allDefects.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Tổ máy:</span>
            <div className="inline-flex rounded-lg border border-border bg-white p-0.5">
              {(["ALL", "S1", "S2", "COMMON"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnitFilter(u)}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                    unitFilter === u ? "bg-navy text-white" : "text-muted-foreground hover:text-ink"
                  )}
                >
                  {u === "ALL" ? "Tất cả" : u}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Yêu cầu:</span>
            <Select value={requestFilter} onValueChange={setRequestFilter}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả</SelectItem>
                {DEFECT_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
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

          <div className="relative ml-auto w-full sm:w-72">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DefectKpi label="Chưa thực hiện" value={chuaXuLy} icon={CircleDashed} tone="rose" active={statusFilter === "CHUA_XU_LY"} onClick={() => toggleStatus("CHUA_XU_LY")} />
        <DefectKpi label="Đang thực hiện" value={coPct} icon={Wrench} tone="sky" active={statusFilter === "CO_PCT"} onClick={() => toggleStatus("CO_PCT")} />
        <DefectKpi label="Chờ vật tư" value={choVatTu} icon={Package} tone="amber" active={statusFilter === "CHO_VAT_TU"} onClick={() => toggleStatus("CHO_VAT_TU")} />
        <DefectKpi label="Khiếm khuyết tồn đọng" value={tonDong} icon={CircleSlash} tone="violet" active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")} />
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : searchedDefects.length === 0 ? (
        allDefects.length === 0 ? (
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
          <Table className="min-w-[1100px] table-fixed">
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[96px] whitespace-nowrap px-2 text-center">Tổ máy</TableHead>
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
                    options={DEFECT_STATUS_ORDER.map((s) => ({ value: s, label: DEFECT_STATUS[s].label }))}
                    onChange={setStatusFilter}
                  />
                </TableHead>
                <TableHead className="w-[120px] text-center">Phát hiện</TableHead>
                <TableHead className="w-[110px] text-center">Người nhập</TableHead>
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
                      <TableCell className="px-3 py-3 text-center text-[13px] text-muted-foreground">
                        <div className="truncate" title={d.system ?? undefined}>{d.system ?? "—"}</div>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-[13px] text-ink">
                        <div className="truncate" title={d.content ?? undefined}>{d.content || "—"}</div>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center">
                        {d.severity ? (
                          <span title={DEFECT_SEVERITY[d.severity as keyof typeof DEFECT_SEVERITY]} className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", SEVERITY_TONE[d.severity] ?? "bg-muted text-ink")}>{d.severity}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center"><DefectStatusBadge status={d.status} /></TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-3 text-center text-[13px] text-muted-foreground">{formatDate(d.detectedAt)}</TableCell>
                      <TableCell className="px-3 py-3 text-center">
                        <DefectUserAvatar user={d.createdBy} />
                      </TableCell>
                      <TableCell className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {canManage && d.status !== "DA_XU_LY" && (
                            <Button variant="ghost" size="icon" title="Hoàn thành" className="text-muted-foreground hover:bg-green-50 hover:text-green-600" onClick={(e) => { e.stopPropagation(); setCompleteTarget(d); }}><CheckCircle2 className="h-4 w-4" /></Button>
                          )}
                          {canManage && (
                            <Button variant="ghost" size="icon" title="Sửa" onClick={(e) => { e.stopPropagation(); openEdit(d); }}><Pencil className="h-4 w-4" /></Button>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="icon" title="Xoá" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDelTarget(d); }}><Trash2 className="h-4 w-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={8} className="px-6 py-4">
                          <DefectExpandedDetails defect={d} />
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
              Hiển thị {firstShown}-{lastShown} trong tổng số {searchedDefects.length} bản ghi
              {isFiltered && <span> sau lọc</span>}
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
              <h2 className="text-lg font-bold text-ink">{editTarget ? "Sửa khiếm khuyết" : "Nhập khiếm khuyết"}</h2>
            </div>
            <DefectForm
              defect={editTarget}
              onDone={() => setFormOpen(false)}
              onCancel={() => setFormOpen(false)}
            />
          </div>
        </div>
      )}

      <CompleteDefectDialog defect={completeTarget} onClose={() => setCompleteTarget(null)} />

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
        <DetailLine label="Thiết bị" value={defect.device || "—"} />
        <DetailLine label="Nội dung" value={defect.content || "—"} multiline />
      </div>
      <div className={detailCardClass}>
        <DetailLine label="Mức độ" value={severity} multiline={severityCriteria.length > 0} />
        <DetailLine label="Tình trạng" value={status} />
        <DetailLine label="Ảnh hưởng PCCC" value={defect.fireSafetyImpact || "—"} />
        <DetailLine label="Môi trường, ATVSLĐ" value={defect.environmentSafetyImpact || "—"} />
        <DetailLine label="Ngày phát hiện" value={formatDate(defect.detectedAt)} />
        <DetailLine label="Ghi chú" value={defect.note || "—"} multiline />
        <DetailLine label="Người ghi nhận" value={defect.createdBy?.name || "—"} />
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
      aria-label={`Người nhập khiếm khuyết: ${user.name}`}
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
