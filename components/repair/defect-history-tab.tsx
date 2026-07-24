"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Minus,
  Search,
  ShieldCheck,
  Trash2,
  X,
  Plus,
  Pencil,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { AnnualBackupExport } from "@/components/shared/annual-backup-export";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DefectHistoryDialog } from "@/components/repair/defect-history-dialog";
import { useDefectHistory, useDeleteDefectHistory, type DefectHistoryFilters, type DefectHistoryItem } from "@/hooks/useDefectHistory";
import { useDevices } from "@/hooks/useDevices";
import { usePositions } from "@/hooks/useUsers";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { DEFECT_UNITS, isSelectableManagingPosition } from "@/lib/constants";
import { formatDate, initials, cn } from "@/lib/utils";
import { normalizeText } from "@/lib/nav";

type SortKey = "workOrderNumber" | "performedAt" | "unit" | "content" | "system" | "device" | "createdBy";
type SortDir = "asc" | "desc";

const PAGE_SIZES = [10, 25, 50, 100];

export function DefectHistoryTab({ role }: { role?: string }) {
  const searchParams = useSearchParams();
  const deviceFromUrl = searchParams.get("device")?.trim() ?? "";
  const unitFromUrl = searchParams.get("unit")?.trim().toUpperCase() ?? "";
  const rbac = useRbacAccess();
  const canManage = rbac.can("defect-manage", ["create", "manage", "full"]);
  const canDelete = rbac.can("defect-close", ["approve", "manage", "full"]);
  // Loại Quản đốc / Phó quản đốc / Thống kê / Kỹ thuật viên khỏi bộ lọc cương vị.
  const positions = usePositions().filter(isSelectableManagingPosition);
  const { data: devicesData } = useDevices({});
  const deviceNameByCode = React.useMemo(
    () => new Map((devicesData?.data ?? []).map((d) => [d.code, d.name])),
    [devicesData]
  );
  const [filters, setFilters] = React.useState<DefectHistoryFilters>(() => ({
    ...(deviceFromUrl ? { device: deviceFromUrl } : {}),
    ...(["S1", "S2", "COMMON"].includes(unitFromUrl) ? { unit: unitFromUrl } : {}),
  }));
  const { data, isLoading } = useDefectHistory(filters);
  const del = useDeleteDefectHistory();
  const rows = data?.data ?? [];

  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [delTarget, setDelTarget] = React.useState<DefectHistoryItem | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DefectHistoryItem | null>(null);
  const [tableSearch, setTableSearch] = React.useState("");
  const [pageSize, setPageSize] = React.useState(10);
  const [page, setPage] = React.useState(1);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: SortDir }>({ key: "performedAt", dir: "desc" });

  function setFilter<K extends keyof DefectHistoryFilters>(k: K, v: string) {
    setFilters((f) => ({ ...f, [k]: v || undefined }));
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const visibleRows = React.useMemo(() => {
    const q = normalizeText(tableSearch);
    const searched = q
      ? rows.filter((r) =>
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
              r.content,
              r.createdBy?.name,
              r.createdBy?.position,
            ]
              .filter(Boolean)
              .join(" ")
          ).includes(q)
        )
      : rows;

    return [...searched].sort((a, b) => compareRows(a, b, sort.key, sort.dir, deviceNameByCode));
  }, [rows, tableSearch, sort, deviceNameByCode]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  React.useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);
  React.useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [filters, tableSearch, pageSize, sort]);

  const pagedRows = visibleRows.slice((page - 1) * pageSize, page * pageSize);
  const firstShown = visibleRows.length ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, visibleRows.length);
  const actionCol = canManage || canDelete;
  const detailColSpan = actionCol ? 7 : 6;
  const hasActiveFilters = Object.values(filters).some(Boolean) || tableSearch.trim().length > 0;
  const backupColumns = React.useMemo(
    () => [
      { key: "stt", header: "STT", width: 7, align: "center" as const, value: (_row: DefectHistoryItem, index: number) => index + 1 },
      { key: "workOrderNumber", header: "Số phiếu công tác", width: 26, value: (r: DefectHistoryItem) => r.workOrderNumber },
      { key: "requestType", header: "PCT", width: 12, align: "center" as const, value: (r: DefectHistoryItem) => r.requestType },
      { key: "performedAt", header: "Ngày kết thúc", width: 15, align: "center" as const, value: (r: DefectHistoryItem) => formatDate(r.performedAt) },
      { key: "unit", header: "Tổ máy", width: 10, align: "center" as const, value: (r: DefectHistoryItem) => r.unit },
      { key: "system", header: "Cương vị", width: 22, value: (r: DefectHistoryItem) => r.system },
      { key: "deviceName", header: "Tên thiết bị", width: 28, value: (r: DefectHistoryItem) => deviceNameByCode.get(r.device ?? "") ?? r.device },
      { key: "content", header: "Nội dung thực hiện", width: 36, value: (r: DefectHistoryItem) => r.content },
      { key: "result", header: "Kết quả thực hiện", width: 36, value: (r: DefectHistoryItem) => r.result },
      { key: "images", header: "Số ảnh", width: 9, align: "center" as const, value: (r: DefectHistoryItem) => r.images?.length ?? 0 },
      { key: "operator", header: "Vận hành viên", width: 24, value: (r: DefectHistoryItem) => r.createdBy?.name },
    ],
    [deviceNameByCode]
  );

  return (
    <div className="space-y-6">
      <PageHeader title="LỊCH SỬ SỬA CHỮA" description="Lịch sử khiếm khuyết thiết bị đã xử lý theo cương vị">
        <AnnualBackupExport
          rows={visibleRows}
          columns={backupColumns}
          dateAccessor={(row) => row.performedAt}
          title="LỊCH SỬ SỬA CHỮA"
          subtitle="Báo cáo backup lịch sử sửa chữa thiết bị theo năm"
          filenamePrefix="lich-su-sua-chua"
        />
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Thêm mới</Button>
        )}
      </PageHeader>

      <Card className="p-3 md:p-4">
        <div className="flex flex-nowrap items-center gap-3 overflow-x-auto pb-1 xl:overflow-visible xl:pb-0">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Cương vị:</span>
            <Select value={filters.system ?? "ALL"} onValueChange={(v) => setFilter("system", v === "ALL" ? "" : v)}>
              <SelectTrigger className="h-9 w-40 md:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả</SelectItem>
                {positions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Tổ máy:</span>
            <div className="inline-flex shrink-0 rounded-lg border border-border bg-white p-0.5">
              {(["ALL", ...DEFECT_UNITS] as const).map((u) => {
                const active = (filters.unit ?? "") === (u === "ALL" ? "" : u);
                return (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setFilter("unit", u === "ALL" ? "" : u)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      active ? "bg-navy text-white" : "text-muted-foreground hover:text-ink"
                    )}
                  >
                    {u === "ALL" ? "Tất cả" : u}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Từ ngày:</span>
              <Input type="date" value={filters.from ?? ""} onChange={(e) => setFilter("from", e.target.value)} className="h-9 w-40 bg-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Đến ngày:</span>
              <Input type="date" value={filters.to ?? ""} onChange={(e) => setFilter("to", e.target.value)} className="h-9 w-40 bg-white" />
            </div>
          </div>

          <div className="relative ml-auto w-64 min-w-64 shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Tìm trong bảng..."
              className="h-9 pl-9"
            />
          </div>
        </div>
      </Card>

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
          <div className="overflow-x-auto">
          <Table className="min-w-[1050px] table-fixed">
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[110px] text-center"><SortHeader label="Tổ máy" sortKey="unit" sort={sort} onSort={toggleSort} align="center" /></TableHead>
                <TableHead className="w-[240px] text-center"><SortHeader label="Nội dung thực hiện" sortKey="content" sort={sort} onSort={toggleSort} align="center" /></TableHead>
                <TableHead className="w-[130px] text-center"><SortHeader label="Ngày kết thúc" sortKey="performedAt" sort={sort} onSort={toggleSort} align="center" /></TableHead>
                <TableHead className="w-[150px] text-center"><SortHeader label="Cương vị" sortKey="system" sort={sort} onSort={toggleSort} align="center" /></TableHead>
                <TableHead className="w-[190px] text-center"><SortHeader label="Tên thiết bị" sortKey="device" sort={sort} onSort={toggleSort} align="center" /></TableHead>
                <TableHead className="w-[130px] text-center"><SortHeader label="Người cập nhật" sortKey="createdBy" sort={sort} onSort={toggleSort} align="center" /></TableHead>
                {actionCol && <TableHead className="w-[96px] text-center text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">Thao tác</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={detailColSpan} className="py-10 text-center text-sm text-muted-foreground">
                    Không tìm thấy bản ghi phù hợp.
                  </TableCell>
                </TableRow>
              ) : (
                pagedRows.map((r) => {
                  const expanded = expandedId === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(expanded ? null : r.id)}>
                        <TableCell className="whitespace-nowrap px-3 py-3 text-[13px] font-semibold text-ink">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedId(expanded ? null : r.id);
                              }}
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-colors",
                                expanded ? "bg-rose-500" : "bg-emerald-500"
                              )}
                              title={expanded ? "Thu gọn" : "Mở chi tiết"}
                            >
                              {expanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            </button>
                            <span>{r.unit}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-center text-[13px] text-ink">
                          <div className="truncate" title={r.content ?? undefined}>{r.content || "—"}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3 py-3 text-center text-[13px] text-muted-foreground">{formatDate(r.performedAt)}</TableCell>
                        <TableCell className="px-3 py-3 text-center text-[13px] text-muted-foreground">
                          <div className="truncate" title={r.system ?? undefined}>{r.system ?? "—"}</div>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-center text-[13px]">
                          <div className="truncate font-semibold text-ink" title={deviceNameByCode.get(r.device ?? "") ?? r.device ?? undefined}>
                            {deviceNameByCode.get(r.device ?? "") ?? r.device ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-3">
                          <UserByline user={r.createdBy} createdAt={r.createdAt} />
                        </TableCell>
                        {actionCol && (
                          <TableCell className="px-2 py-3">
                            <div className="flex items-center justify-center gap-1">
                              {canManage && (
                                <Button variant="ghost" size="icon" title="Sửa" onClick={(e) => { e.stopPropagation(); setEditTarget(r); }}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button variant="ghost" size="icon" title="Xoá" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDelTarget(r); }}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                      {expanded && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={detailColSpan} className="px-6 py-4">
                            <ExpandedDetails row={r} onImage={setLightbox} />
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
          <div className="flex flex-col gap-3 border-t border-border p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div>
              Hiển thị {firstShown}-{lastShown} trong tổng số {visibleRows.length} bản ghi
              {tableSearch.trim() && <span> sau lọc</span>}
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

      <DefectHistoryDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DefectHistoryDialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)} record={editTarget} />

      {/* Lightbox xem ảnh lớn */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightbox && (
            <div className="relative">
              <button onClick={() => setLightbox(null)} className="absolute right-2 top-2 rounded-full bg-ink/70 p-1 text-white hover:bg-ink" aria-label="Đóng">
                <X className="h-4 w-4" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lightbox} alt="Ảnh khiếm khuyết" className="max-h-[80vh] w-full rounded-md object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>

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
  if (key === "createdBy") return row.createdBy?.name ?? "";
  if (key === "workOrderNumber") return row.workOrderNumber ?? "";
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
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  align?: "left" | "center";
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex w-full items-center gap-1 text-[11px] font-semibold uppercase leading-tight tracking-normal text-muted-foreground transition-colors hover:text-ink",
        align === "center" && "justify-center"
      )}
    >
      <span>{label}</span>
      <Icon className={cn("h-3.5 w-3.5", active && "text-accent")} />
    </button>
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

function ExpandedDetails({ row, onImage }: { row: DefectHistoryItem; onImage: (src: string) => void }) {
  return (
    <div className="max-w-[760px] space-y-2 px-1 py-1 text-[13px] leading-5">
      <DetailLine label="Số Phiếu Công Tác" value={row.workOrderNumber || "—"} />
        {(row.requestType || row.requestNumber) && (
          <DetailLine
            label="Loại / Số yêu cầu"
            value={[row.requestType ? `PCT: ${row.requestType}` : null, row.requestNumber ? `YC: ${row.requestNumber}` : null]
              .filter(Boolean)
              .join("   ·   ")}
          />
        )}
        <DetailLine
          label="Thiết bị liên quan"
          value={row.relatedDevices.length > 0
            ? row.relatedDevices.map((item) => `${item.device.name} (${item.deviceSeq})`).join("\n")
            : "—"}
          multiline
        />
        <DetailLine label="Nội dung thực hiện" value={row.content || "—"} multiline />
        <DetailLine label="Kết quả thực hiện" value={row.result || "—"} multiline />
      <div className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-3">
        <div className="whitespace-nowrap font-semibold text-ink">Hình ảnh kèm theo:</div>
        <div>
          {row.images.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {row.images.map((src, i) => (
                <button key={i} type="button" onClick={() => onImage(src)} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Ảnh ${i + 1}`} className="h-14 w-14 rounded-md border border-border object-cover transition-transform hover:scale-105" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <DetailLine label="Vận hành viên" value={row.createdBy?.name || "—"} />
    </div>
  );
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
