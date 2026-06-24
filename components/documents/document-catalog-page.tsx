"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, FileText, Loader2, Minus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { AnnualBackupExport, type BackupColumn } from "@/components/shared/annual-backup-export";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useDevices } from "@/hooks/useDevices";
import { usePositions } from "@/hooks/useUsers";
import {
  type DigitalDocument,
  type DigitalDocumentUser,
  type DocumentCategory,
  useDeleteDocument,
  useDocuments,
  useUpsertDocument,
} from "@/hooks/useDocuments";
import { blockForPosition, isSelectableManagingPosition } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { announcementPositionLabel, announcementPositionOptions } from "@/lib/positions";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

type DocumentForm = {
  title: string;
  decisionNumber: string;
  documentUrl: string;
  reason: string;
  progress: string;
  note: string;
  managingPosition: string;
  recordDate: string;
  archiveYear: string;
  attachmentUrls: string[];
};

const EMPTY_FORM: DocumentForm = {
  title: "",
  decisionNumber: "",
  documentUrl: "",
  reason: "",
  progress: "",
  note: "",
  managingPosition: "",
  recordDate: "",
  archiveYear: "",
  attachmentUrls: [],
};

const COMMON_POSITION = "Chung";
const ALL_FILTER = "__ALL__";
const PAGE_SIZE_OPTIONS = ["10", "20", "50"];

function blockForDocumentPosition(position?: string | null): string {
  return position?.trim() === COMMON_POSITION ? COMMON_POSITION : blockForPosition(position);
}

function documentPositionLabel(position?: string | null): string {
  const value = position?.trim();
  if (!value) return "";
  return value === COMMON_POSITION ? COMMON_POSITION : announcementPositionLabel(value);
}

function documentPositionMatches(position: string | null | undefined, filter: string) {
  return normalizeText(documentPositionLabel(position)) === normalizeText(filter);
}

function documentManagementBlock(item: { managingPosition?: string | null; managementBlock?: string | null }): string {
  return item.managingPosition?.trim() === COMMON_POSITION
    ? COMMON_POSITION
    : item.managementBlock || blockForDocumentPosition(item.managingPosition);
}

interface DocumentCatalogPageProps {
  category: DocumentCategory;
  title: string;
  description: string;
  nameLabel: string;
  nameOptions?: Array<{ label: string; value: string }>;
  codeLabel: string;
  linkLabel?: string;
  requireLink?: boolean;
  addLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  showEquipmentScope?: boolean;
  showCodeField?: boolean;
  afterHeader?: React.ReactNode;
  tagLabel?: string;
  tagOptions?: Array<{ label: string; value: string }>;
  requireTag?: boolean;
  dateLabel?: string;
  dateInputType?: "date" | "datetime-local";
  requireDate?: boolean;
  contentMode?: "link" | "text";
  contentPlaceholder?: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  progressLabel?: string;
  progressPlaceholder?: string;
  noteLabel?: string;
  notePlaceholder?: string;
  summaryLabel?: string;
  summaryField?: "documentUrl" | "reason" | "progress";
  attachmentLabel?: string;
  maxAttachments?: number;
  defaultName?: string;
  yearLabel?: string;
  yearOptions?: string[];
  requireYear?: boolean;
  historyTableLayout?: boolean;
  showPaginationFooter?: boolean;
  allowStaffEdit?: boolean;
  showAnnualBackupExport?: boolean;
  backupSubtitle?: string;
  backupFilenamePrefix?: string;
  wideNameNarrowLinkLayout?: boolean;
}

export function DocumentCatalogPage({
  category,
  title,
  description,
  nameLabel,
  nameOptions = [],
  codeLabel,
  linkLabel = "Link tài liệu liên kết",
  requireLink = true,
  addLabel,
  emptyTitle,
  emptyDescription,
  showEquipmentScope = false,
  showCodeField = true,
  afterHeader,
  tagLabel,
  tagOptions = [],
  requireTag = false,
  dateLabel,
  dateInputType = "date",
  requireDate = false,
  contentMode = "link",
  contentPlaceholder,
  reasonLabel,
  reasonPlaceholder,
  progressLabel,
  progressPlaceholder,
  noteLabel,
  notePlaceholder,
  summaryLabel,
  summaryField,
  attachmentLabel,
  maxAttachments = 0,
  defaultName = "",
  yearLabel,
  yearOptions = [],
  requireYear = false,
  historyTableLayout = false,
  showPaginationFooter = false,
  allowStaffEdit = false,
  showAnnualBackupExport = false,
  backupSubtitle,
  backupFilenamePrefix,
  wideNameNarrowLinkLayout = false,
}: DocumentCatalogPageProps) {
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const isAdmin = userRole === "ADMIN";
  const canEdit = isAdmin || (allowStaffEdit && (userRole === "SUPERVISOR" || userRole === "TECHNICIAN"));
  const canDelete = isAdmin;
  const hasActions = canEdit || canDelete;
  const docs = useDocuments(category);
  const devices = useDevices({});
  const userPositions = usePositions();
  const upsert = useUpsertDocument();
  const remove = useDeleteDocument();
  const [q, setQ] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DigitalDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DigitalDocument | null>(null);
  const [form, setForm] = React.useState<DocumentForm>(EMPTY_FORM);
  const [positionFilter, setPositionFilter] = React.useState(ALL_FILTER);
  const [blockFilter, setBlockFilter] = React.useState(ALL_FILTER);
  const [yearFilter, setYearFilter] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState(ALL_FILTER);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [pageSize, setPageSize] = React.useState(10);
  const [pageIndex, setPageIndex] = React.useState(1);
  const managementBlock = showEquipmentScope ? blockForDocumentPosition(form.managingPosition) : "";
  const hasTagField = Boolean(tagLabel && tagOptions.length);
  const hasNameOptions = nameOptions.length > 0;
  const hasReasonField = Boolean(reasonLabel);
  const hasProgressField = Boolean(progressLabel);
  const hasNoteField = Boolean(noteLabel);
  const hasDateField = Boolean(dateLabel);
  const hasAttachmentField = Boolean(attachmentLabel && maxAttachments > 0);
  const hasYearField = Boolean(yearLabel && yearOptions.length);
  const isCompactArchiveForm = hasNameOptions && hasYearField && hasTagField && hasDateField;
  const useHistoryFormLayout = historyTableLayout && !isCompactArchiveForm;
  const baseColumnCount = historyTableLayout ? 1 : 3;
  const visibleContentColumns = historyTableLayout ? 0 : 1;
  const visibleAttachmentColumns = historyTableLayout ? 1 : hasAttachmentField ? 1 : 0;
  const tableColumnCount =
    baseColumnCount +
    (hasActions ? 1 : 0) +
    (showEquipmentScope ? 2 : 0) +
    (showCodeField ? 1 : 0) +
    (hasTagField ? 1 : 0) +
    (hasDateField ? 1 : 0) +
    visibleContentColumns +
    visibleAttachmentColumns +
    (hasYearField ? 1 : 0);

  const positionOptions = React.useMemo(
    () =>
      announcementPositionOptions([
        ...(devices.data?.data ?? []).map((device) => device.managingPosition),
        ...userPositions,
      ]).filter((value) => value !== COMMON_POSITION && isSelectableManagingPosition(value)),
    [devices.data?.data, userPositions]
  );
  const blockOptions = React.useMemo(
    () => Array.from(new Set(positionOptions.map((position) => blockForDocumentPosition(position)).filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi")),
    [positionOptions]
  );
  const activeYearFilter = hasYearField ? yearFilter || yearOptions[0] || "" : "";
  const formYearOptions = React.useMemo(
    () => Array.from(new Set([...yearOptions, activeYearFilter].filter(Boolean))).sort((a, b) => Number(b) - Number(a)),
    [activeYearFilter, yearOptions]
  );

  React.useEffect(() => {
    setExpandedId(null);
    setPageIndex(1);
  }, [category, q, historyTableLayout, yearFilter, tagFilter]);

  React.useEffect(() => {
    if (!hasYearField) {
      setYearFilter("");
      return;
    }
    setYearFilter((current) => (current && yearOptions.includes(current) ? current : yearOptions[0] ?? ""));
  }, [hasYearField, yearOptions]);

  const rows = React.useMemo(() => {
    const source = docs.data?.data ?? [];
    const needle = q.trim().toLowerCase();
    return source.filter((item) => {
      if (hasYearField && activeYearFilter && item.managingPosition !== activeYearFilter) return false;
      if (hasTagField && tagFilter !== ALL_FILTER && item.decisionNumber !== tagFilter) return false;
      if (showEquipmentScope && positionFilter !== ALL_FILTER && !documentPositionMatches(item.managingPosition, positionFilter)) return false;
      const itemBlock = documentManagementBlock(item);
      if (showEquipmentScope && blockFilter !== ALL_FILTER && itemBlock !== blockFilter) return false;
      if (!needle) return true;
      return [item.title, item.decisionNumber, item.documentUrl, item.reason, item.progress, item.note, documentPositionLabel(item.managingPosition), itemBlock]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [docs.data?.data, q, hasYearField, activeYearFilter, hasTagField, tagFilter, showEquipmentScope, positionFilter, blockFilter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(pageIndex, pageCount);
  const rowStart = rows.length ? (currentPage - 1) * pageSize : 0;
  const paginatedRows = showPaginationFooter ? rows.slice(rowStart, rowStart + pageSize) : rows;
  const displayFrom = rows.length ? rowStart + 1 : 0;
  const displayTo = rows.length ? Math.min(rowStart + pageSize, rows.length) : 0;
  const backupRows = React.useMemo(() => docs.data?.data ?? [], [docs.data?.data]);
  const backupColumns = React.useMemo<BackupColumn<DigitalDocument>[]>(() => {
    const columns: BackupColumn<DigitalDocument>[] = [
      { key: "stt", header: "STT", width: 6, align: "center", value: (_row, index) => index + 1 },
      { key: "title", header: nameLabel, width: historyTableLayout ? 24 : 32, value: (item) => item.title },
    ];

    if (hasTagField) {
      columns.push({ key: "unit", header: tagLabel ?? "Tổ máy", width: 10, align: "center", value: (item) => item.decisionNumber });
    }
    if (hasYearField) {
      columns.push({ key: "year", header: yearLabel ?? "Năm", width: 9, align: "center", value: (item) => item.managingPosition });
    }
    if (hasDateField) {
      columns.push({
        key: "recordDate",
        header: dateLabel ?? "Ngày ghi nhận",
        width: dateInputType === "datetime-local" ? 20 : 16,
        align: "center",
        value: (item) => formatArchiveRecordDate(item.managementBlock, dateInputType),
      });
    }
    if (hasReasonField) {
      columns.push({ key: "reason", header: reasonLabel ?? "Nguyên nhân", width: 34, value: (item) => item.reason });
    }
    if (hasProgressField) {
      columns.push({ key: "progress", header: progressLabel ?? "Tiến trình", width: 40, value: (item) => item.progress });
    }
    columns.push({
      key: "content",
      header: linkLabel,
      width: contentMode === "text" ? 42 : 36,
      value: (item) => item.documentUrl,
    });
    if (hasNoteField) {
      columns.push({ key: "note", header: noteLabel ?? "Ghi chú", width: 30, value: (item) => item.note });
    }
    if (hasAttachmentField) {
      columns.push({
        key: "attachments",
        header: attachmentLabel ?? "Hình ảnh",
        width: 12,
        align: "center",
        value: (item) => (item.attachmentUrls?.length ? `${item.attachmentUrls.length} hình` : "-"),
      });
    }
    columns.push({
      key: "updatedBy",
      header: "Người cập nhật",
      width: 22,
      value: (item) => item.updatedBy?.name || item.createdBy?.name,
    });
    return columns;
  }, [
    nameLabel,
    historyTableLayout,
    hasTagField,
    tagLabel,
    hasYearField,
    yearLabel,
    hasDateField,
    dateLabel,
    dateInputType,
    hasReasonField,
    reasonLabel,
    hasProgressField,
    progressLabel,
    linkLabel,
    contentMode,
    hasNoteField,
    noteLabel,
    hasAttachmentField,
    attachmentLabel,
  ]);

  React.useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount));
  }, [pageCount]);

  function shiftYear(delta: number) {
    const current = Number(activeYearFilter || new Date().getFullYear());
    setYearFilter(String(current + delta));
  }

  function openCreate() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      title: defaultName || nameOptions[0]?.value || "",
      decisionNumber: hasTagField ? tagOptions[0]?.value ?? "" : "",
      archiveYear: hasYearField ? yearOptions[0] ?? "" : "",
    });
    setFormOpen(true);
  }

  function openEdit(item: DigitalDocument) {
    setEditing(item);
    setForm({
      title: item.title,
      decisionNumber: item.decisionNumber ?? "",
      documentUrl: item.documentUrl,
      reason: item.reason ?? "",
      progress: item.progress ?? "",
      note: item.note ?? "",
      managingPosition: showEquipmentScope ? documentPositionLabel(item.managingPosition) || COMMON_POSITION : item.managingPosition ?? "",
      recordDate: showEquipmentScope ? "" : normalizeRecordDateForInput(item.managementBlock, dateInputType),
      archiveYear: showEquipmentScope ? "" : item.managingPosition ?? "",
      attachmentUrls: item.attachmentUrls ?? [],
    });
    setFormOpen(true);
  }

  async function submit() {
    try {
      await upsert.mutateAsync({
        id: editing?.id,
        category,
        title: form.title,
        decisionNumber: form.decisionNumber,
        documentUrl: form.documentUrl,
        reason: hasReasonField ? form.reason || null : null,
        progress: hasProgressField ? form.progress || null : null,
        note: hasNoteField ? form.note || null : null,
        managingPosition: showEquipmentScope ? form.managingPosition || COMMON_POSITION : hasYearField ? form.archiveYear || null : null,
        managementBlock: showEquipmentScope ? managementBlock : hasDateField ? form.recordDate || null : null,
        attachmentUrls: hasAttachmentField ? form.attachmentUrls : [],
      });
      setFormOpen(false);
      toast.success(editing ? "Đã cập nhật tài liệu" : "Đã thêm tài liệu");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    event.target.value = "";
    if (!selected.length) return;

    const availableSlots = Math.max(maxAttachments - form.attachmentUrls.length, 0);
    if (availableSlots <= 0) {
      toast.error(`Chỉ được tải tối đa ${maxAttachments} hình ảnh`);
      return;
    }
    if (selected.length > availableSlots) {
      toast.error(`Chỉ được tải tối đa ${maxAttachments} hình ảnh`);
    }

    const images = await Promise.all(selected.slice(0, availableSlots).map(readImageAsDataUrl));
    setForm((state) => ({ ...state, attachmentUrls: [...state.attachmentUrls, ...images].slice(0, maxAttachments) }));
  }

  function removeAttachment(index: number) {
    setForm((state) => ({ ...state, attachmentUrls: state.attachmentUrls.filter((_, itemIndex) => itemIndex !== index) }));
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description}>
        {showAnnualBackupExport && isAdmin && (
          <AnnualBackupExport
            rows={backupRows}
            columns={backupColumns}
            dateAccessor={(item) => item.managementBlock || item.createdAt}
            yearAccessor={(item) => item.managingPosition}
            yearOptions={formYearOptions}
            title={title}
            subtitle={backupSubtitle}
            filenamePrefix={backupFilenamePrefix ?? "thu-muc-luu-tru"}
          />
        )}
        {isAdmin && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {addLabel}
          </Button>
        )}
      </PageHeader>
      {afterHeader}

      <Card className="p-4">
        <div className={cn("grid gap-3", hasYearField || hasTagField ? "xl:grid-cols-[1fr_auto]" : "xl:grid-cols-[1fr_220px_190px]")}>
          <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="pl-9"
            placeholder={`Tìm theo ${nameLabel.toLowerCase()}, số hiệu, link tài liệu...`}
          />
          </div>
          {(hasTagField || hasYearField) && (
            <div className="flex flex-wrap items-center gap-2">
              {hasTagField && (
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger className="h-10 w-40" aria-label={`Lọc theo ${tagLabel?.toLowerCase() ?? "tổ máy"}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>Tất cả tổ máy</SelectItem>
                    {tagOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {hasYearField && (
                <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => shiftYear(-1)} aria-label="Năm trước">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                value={activeYearFilter}
                onChange={(event) => setYearFilter(event.target.value)}
                className="h-10 w-32 text-center font-medium"
                aria-label="Lọc theo năm"
              />
              <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => shiftYear(1)} aria-label="Năm sau">
                <ChevronRight className="h-4 w-4" />
              </Button>
                </div>
              )}
            </div>
          )}
          {showEquipmentScope && (
            <>
              <Select value={positionFilter} onValueChange={setPositionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Lọc cương vị" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>Tất cả cương vị</SelectItem>
                  {positionOptions.map((position) => (
                    <SelectItem key={position} value={position}>
                      {position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Lọc khối quản lý" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>Tất cả khối</SelectItem>
                  {blockOptions.map((block) => (
                    <SelectItem key={block} value={block}>
                      {block}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className={cn((historyTableLayout || wideNameNarrowLinkLayout) && "overflow-x-auto")}>
        <Table className={cn(historyTableLayout && "min-w-[900px] table-fixed", wideNameNarrowLinkLayout && "min-w-[1120px] table-fixed")}>
          <TableHeader className={cn(historyTableLayout && "bg-muted/40")}>
            <TableRow className={cn("bg-muted/40 hover:bg-muted/40 [&_th]:whitespace-nowrap [&_th]:text-center", historyTableLayout && "hover:bg-transparent")}>
              <TableHead className={cn("w-16 whitespace-nowrap text-center", historyTableLayout && "w-[170px] text-[11px] font-semibold uppercase tracking-normal text-muted-foreground")}>
                {historyTableLayout ? nameLabel : "STT"}
              </TableHead>
              {!historyTableLayout && <TableHead className={cn("whitespace-nowrap text-center", wideNameNarrowLinkLayout && "w-[390px]")}>{nameLabel}</TableHead>}
              {historyTableLayout && hasTagField && <TableHead className="w-[92px] text-center text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">{tagLabel}</TableHead>}
              {hasYearField && <TableHead className={cn("w-[110px] text-center", historyTableLayout && "w-[82px] text-[11px] font-semibold uppercase tracking-normal text-muted-foreground")}>{yearLabel}</TableHead>}
              {showEquipmentScope && <TableHead className="w-[170px] text-center">Cương vị</TableHead>}
              {showEquipmentScope && <TableHead className="w-[160px] text-center">Khối quản lý</TableHead>}
              {hasDateField && (
                <TableHead className={cn("w-[150px] text-center", historyTableLayout && "w-[320px] text-[11px] font-semibold uppercase tracking-normal text-muted-foreground")}>
                  {historyTableLayout ? summaryLabel ?? progressLabel ?? linkLabel : dateLabel}
                </TableHead>
              )}
              {historyTableLayout && (
                <TableHead className="w-[128px] text-center text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">Người cập nhật</TableHead>
              )}
              {!historyTableLayout && hasTagField && <TableHead className="w-[120px] text-center">{tagLabel}</TableHead>}
              {showCodeField && <TableHead className={cn("w-[180px] text-center", wideNameNarrowLinkLayout && "w-[150px]")}>{codeLabel}</TableHead>}
              {!historyTableLayout && <TableHead className={cn(wideNameNarrowLinkLayout && "w-[210px]")}>{linkLabel}</TableHead>}
              {!historyTableLayout && hasAttachmentField && <TableHead className="w-[160px] text-center">{attachmentLabel}</TableHead>}
              {hasActions && <TableHead className={cn("w-[120px] text-center", historyTableLayout && "w-[96px] text-[11px] font-semibold uppercase tracking-normal text-muted-foreground")}>Thao tác</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.isLoading ? (
              <TableRow>
                <TableCell colSpan={tableColumnCount} className="h-32 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : paginatedRows.length ? (
              paginatedRows.map((item, index) => {
                const expanded = historyTableLayout && expandedId === item.id;
                const rowAttachmentUrls = (item.attachmentUrls ?? []).filter(Boolean);
                const rowUser = item.updatedBy?.id || item.updatedBy?.name ? item.updatedBy : item.createdBy;
                const historySummary =
                  summaryField === "reason" ? item.reason : summaryField === "progress" || hasProgressField ? item.progress : item.documentUrl;
                const detailSummaryLabel = hasProgressField ? progressLabel : summaryLabel ?? linkLabel;
                const detailSummary = hasProgressField ? item.progress : historySummary;
                return (
                <React.Fragment key={item.id}>
                <TableRow
                  className={cn(historyTableLayout && "cursor-pointer hover:bg-muted/30")}
                  onClick={() => historyTableLayout && setExpandedId(expanded ? null : item.id)}
                >
                  <TableCell className={cn("text-center font-semibold text-muted-foreground", historyTableLayout && "px-3 py-3 text-[13px]")}>
                    {historyTableLayout ? (
                      <div className="flex items-center justify-center gap-2.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedId(expanded ? null : item.id);
                          }}
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-colors",
                            expanded ? "bg-rose-500" : "bg-emerald-500"
                          )}
                          title={expanded ? "Thu gọn" : "Mở chi tiết"}
                        >
                          {expanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        </button>
                        <div className="min-w-0 leading-tight">
                          <div className="truncate text-[13px] font-semibold text-ink" title={item.title}>{item.title}</div>
                        </div>
                      </div>
                    ) : (
                      rowStart + index + 1
                    )}
                  </TableCell>
                  {!historyTableLayout && (
                    <TableCell className={cn(wideNameNarrowLinkLayout && "align-top")}>
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-accent">
                          <FileText className="h-4 w-4" />
                        </div>
                        <span className={cn("font-semibold text-ink", wideNameNarrowLinkLayout && "line-clamp-3 whitespace-normal leading-5")}>
                          {item.title}
                        </span>
                      </div>
                    </TableCell>
                  )}
                  {historyTableLayout && hasTagField && (
                    <TableCell className="px-3 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex h-7 min-w-10 items-center justify-center rounded-full px-3 text-xs font-bold",
                          unitBadgeClass(item.decisionNumber)
                        )}
                      >
                        {item.decisionNumber || "—"}
                      </span>
                    </TableCell>
                  )}
                  {hasYearField && <TableCell className={cn("text-center font-semibold text-muted-foreground", historyTableLayout && "px-3 py-3 text-[13px]")}>{item.managingPosition || "—"}</TableCell>}
                  {showEquipmentScope && (
                    <TableCell className="text-center text-muted-foreground">{documentPositionLabel(item.managingPosition) || "—"}</TableCell>
                  )}
                  {showEquipmentScope && (
                    <TableCell className="text-center text-muted-foreground">{documentManagementBlock(item)}</TableCell>
                  )}
                  {hasDateField && (
                    <TableCell
                      className={cn(
                        "text-center text-muted-foreground",
                        historyTableLayout && "px-3 py-3 text-[13px]",
                        historyTableLayout && summaryField !== "reason" && "text-left"
                      )}
                    >
                      {historyTableLayout ? (
                        <span className={cn("line-clamp-2 whitespace-pre-wrap text-ink", summaryField === "reason" && "mx-auto text-center")}>
                          {historySummary || "—"}
                        </span>
                      ) : item.managementBlock ? (
                        formatArchiveRecordDate(item.managementBlock, dateInputType)
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  )}
                  {historyTableLayout && (
                    <TableCell className="px-3 py-3">
                      <DocumentUserAvatar user={rowUser} />
                    </TableCell>
                  )}
                  {!historyTableLayout && hasTagField && (
                    <TableCell className={cn("text-center", historyTableLayout && "px-3 py-3")}>
                      <span
                        className={cn(
                          "inline-flex h-7 min-w-10 items-center justify-center rounded-full px-3 text-xs font-bold",
                          unitBadgeClass(item.decisionNumber)
                        )}
                      >
                        {item.decisionNumber || "—"}
                      </span>
                    </TableCell>
                  )}
                  {showCodeField && <TableCell className="text-center text-muted-foreground">{item.decisionNumber || "—"}</TableCell>}
                  {!historyTableLayout && (
                    <TableCell className={cn(wideNameNarrowLinkLayout && "align-top")}>
                      {contentMode === "text" ? (
                        <span className={cn("block max-w-[420px] whitespace-pre-wrap text-sm text-ink", wideNameNarrowLinkLayout && "max-w-full")}>{item.documentUrl}</span>
                      ) : !item.documentUrl ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <a
                          href={item.documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            "inline-flex max-w-[360px] items-center gap-2 truncate text-sm font-medium text-accent hover:underline",
                            wideNameNarrowLinkLayout && "max-w-full"
                          )}
                        >
                          <ExternalLink className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.documentUrl}</span>
                        </a>
                      )}
                    </TableCell>
                  )}
                  {!historyTableLayout && hasAttachmentField && (
                    <TableCell>
                      {item.attachmentUrls?.length ? (
                        <div className="flex justify-center gap-2">
                          {item.attachmentUrls.slice(0, maxAttachments).map((url, imageIndex) => (
                            <a
                              key={`${item.id}-${imageIndex}`}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="block h-10 w-12 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`${attachmentLabel} ${imageIndex + 1}`} className="h-full w-full object-cover" />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="flex justify-center text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  {hasActions && (
                    <TableCell className={cn(historyTableLayout && "px-2 py-3")}>
                      <div className="flex items-center justify-center gap-1">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEdit(item);
                            }}
                            title="Sửa tài liệu"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget(item);
                            }}
                            title="Xóa tài liệu"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
                {historyTableLayout && expanded && (
                  <TableRow className="bg-white hover:bg-white">
                    <TableCell colSpan={tableColumnCount} className="border-t bg-white px-7 py-4">
                      <div className="grid gap-2 text-[13px] leading-6 text-ink">
                        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                          <span className="font-semibold">Tên thư mục:</span>
                          <span>{item.title || "—"}</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                          <span className="font-semibold">Năm:</span>
                          <span>{item.managingPosition || "—"}</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                          <span className="font-semibold">Ngày ghi nhận:</span>
                          <span>{formatArchiveRecordDate(item.managementBlock, dateInputType)}</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                          <span className="font-semibold">Tổ máy:</span>
                          <span>{item.decisionNumber || "—"}</span>
                        </div>
                        {hasReasonField && (
                          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                            <span className="font-semibold">{reasonLabel}:</span>
                            <span className="whitespace-pre-wrap">{item.reason || "—"}</span>
                          </div>
                        )}
                        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                          <span className="font-semibold">{detailSummaryLabel}:</span>
                          <span className="whitespace-pre-wrap">{detailSummary || "—"}</span>
                        </div>
                        {hasProgressField && (
                          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                            <span className="font-semibold">{linkLabel}:</span>
                            {contentMode === "text" ? (
                              <span className="whitespace-pre-wrap">{item.documentUrl || "—"}</span>
                            ) : item.documentUrl ? (
                              <a
                                href={item.documentUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="inline-flex max-w-[520px] items-center gap-2 truncate text-sm font-medium text-accent hover:underline"
                              >
                                <ExternalLink className="h-4 w-4 shrink-0" />
                                <span className="truncate">{item.documentUrl}</span>
                              </a>
                            ) : (
                              <span>—</span>
                            )}
                          </div>
                        )}
                        {hasNoteField && (
                          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                            <span className="font-semibold">{noteLabel}:</span>
                            <span className="whitespace-pre-wrap">{item.note || "—"}</span>
                          </div>
                        )}
                        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                          <span className="font-semibold">Người cập nhật:</span>
                          <span>{rowUser?.name || "—"}</span>
                        </div>
                        {hasAttachmentField && (
                          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                            <span className="font-semibold">Hình ảnh biên bản:</span>
                            {rowAttachmentUrls.length ? (
                              <div className="flex flex-wrap gap-2">
                                {rowAttachmentUrls.slice(0, maxAttachments).map((url, imageIndex) => (
                                  <a
                                    key={`detail-${item.id}-${imageIndex}`}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block h-16 w-20 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt={`Hình ảnh biên bản ${imageIndex + 1}`} className="h-full w-full object-cover" />
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <span>—</span>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                </React.Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={tableColumnCount} className="p-0">
                  <EmptyState title={emptyTitle} description={emptyDescription} icon={FileText} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
        {showPaginationFooter && !docs.isLoading && (
          <div className="flex flex-col gap-3 border-t border-border bg-white px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>
              Hiển thị {displayFrom}-{displayTo} trong tổng số {rows.length} bản ghi
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span>Hiển thị</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPageIndex(1);
                  setExpandedId(null);
                }}
              >
                <SelectTrigger className="h-9 w-[72px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>dòng</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={currentPage <= 1}
                onClick={() => {
                  setPageIndex(1);
                  setExpandedId(null);
                }}
                aria-label="Trang đầu"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={currentPage <= 1}
                onClick={() => {
                  setPageIndex((page) => Math.max(1, page - 1));
                  setExpandedId(null);
                }}
                aria-label="Trang trước"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="inline-flex h-9 min-w-12 items-center justify-center rounded-md bg-muted px-3 text-sm font-semibold text-ink">
                {currentPage}/{pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={currentPage >= pageCount}
                onClick={() => {
                  setPageIndex((page) => Math.min(pageCount, page + 1));
                  setExpandedId(null);
                }}
                aria-label="Trang sau"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={currentPage >= pageCount}
                onClick={() => {
                  setPageIndex(pageCount);
                  setExpandedId(null);
                }}
                aria-label="Trang cuối"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className={cn("max-w-xl", isCompactArchiveForm && "max-w-lg")}>
          <DialogHeader>
            <DialogTitle>{editing ? "Chỉnh sửa tài liệu" : addLabel}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div
              className={cn(
                "grid gap-4",
                isCompactArchiveForm
                  ? "sm:grid-cols-[minmax(0,1fr)_128px]"
                  : useHistoryFormLayout && hasTagField
                  ? "sm:grid-cols-[1fr_150px]"
                  : hasYearField && "sm:grid-cols-[1fr_160px]"
              )}
            >
              <div className="grid gap-1.5">
                <Label>{nameLabel} *</Label>
                {hasNameOptions ? (
                  <Select value={form.title} onValueChange={(value) => setForm((state) => ({ ...state, title: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Chọn ${nameLabel.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {nameOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.title}
                    onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))}
                    placeholder={`Nhập ${nameLabel.toLowerCase()}...`}
                  />
                )}
              </div>
              {useHistoryFormLayout && hasTagField && (
                <div className="grid gap-1.5">
                  <Label>{tagLabel}{requireTag ? " *" : ""}</Label>
                  <div className="flex flex-wrap gap-2">
                    {tagOptions.map((option) => {
                      const active = form.decisionNumber === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setForm((state) => ({ ...state, decisionNumber: option.value }))}
                          className={cn(
                            "inline-flex h-9 min-w-16 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition-colors",
                            active
                              ? "border-navy bg-navy text-white shadow-sm"
                              : "border-slate-200 bg-white text-muted-foreground hover:border-navy/40 hover:text-navy"
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {hasYearField && (!historyTableLayout || isCompactArchiveForm) && (
                <div className="grid gap-1.5">
                  <Label>{yearLabel}{requireYear ? " *" : ""}</Label>
                  <Select
                    value={form.archiveYear}
                    onValueChange={(value) => setForm((state) => ({ ...state, archiveYear: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn năm" />
                    </SelectTrigger>
                    <SelectContent>
                      {formYearOptions.map((year) => (
                        <SelectItem key={year} value={year}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {showEquipmentScope && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Cương vị</Label>
                  <Select
                    value={form.managingPosition || COMMON_POSITION}
                    onValueChange={(value) => setForm((state) => ({ ...state, managingPosition: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn cương vị" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={COMMON_POSITION}>Chung</SelectItem>
                      {positionOptions.map((position) => (
                        <SelectItem key={position} value={position}>
                          {position}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Khối quản lý</Label>
                  <Input value={managementBlock} readOnly className="bg-muted/60" />
                </div>
              </div>
            )}
            {((hasTagField && (!historyTableLayout || isCompactArchiveForm)) || hasDateField || (hasYearField && useHistoryFormLayout)) && (
              <div
                className={cn(
                  "grid gap-4",
                  isCompactArchiveForm
                    ? "sm:grid-cols-[180px_minmax(0,1fr)]"
                    : hasDateField && hasYearField && useHistoryFormLayout
                    ? "sm:grid-cols-[minmax(0,1fr)_160px]"
                    : hasDateField && hasTagField && !historyTableLayout && "sm:grid-cols-2"
                )}
              >
                {hasTagField && (!historyTableLayout || isCompactArchiveForm) && (
                  <div className="grid min-w-0 gap-1.5">
                    <Label>{tagLabel}{requireTag ? " *" : ""}</Label>
                    <div className="flex flex-nowrap gap-2">
                      {tagOptions.map((option) => {
                        const active = form.decisionNumber === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setForm((state) => ({ ...state, decisionNumber: option.value }))}
                            className={cn(
                              "inline-flex h-9 min-w-16 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition-colors",
                              active
                                ? "border-navy bg-navy text-white shadow-sm"
                                : "border-slate-200 bg-white text-muted-foreground hover:border-navy/40 hover:text-navy"
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {hasDateField && (
                  <div className="grid min-w-0 gap-1.5">
                    <Label>{dateLabel}{requireDate ? " *" : ""}</Label>
                    <Input
                      type={dateInputType}
                      value={form.recordDate}
                      onChange={(event) => setForm((state) => ({ ...state, recordDate: event.target.value }))}
                      className="w-full min-w-0"
                    />
                  </div>
                )}
                {hasYearField && useHistoryFormLayout && (
                  <div className="grid min-w-0 gap-1.5">
                    <Label>{yearLabel}{requireYear ? " *" : ""}</Label>
                    <Select
                      value={form.archiveYear}
                      onValueChange={(value) => setForm((state) => ({ ...state, archiveYear: value }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Chọn năm" />
                      </SelectTrigger>
                      <SelectContent>
                        {formYearOptions.map((year) => (
                          <SelectItem key={year} value={year}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
            <div className={cn("grid gap-1.5", !showCodeField && "hidden")}>
              <Label>{codeLabel}</Label>
              <Input
                value={form.decisionNumber}
                onChange={(event) => setForm((state) => ({ ...state, decisionNumber: event.target.value }))}
                placeholder={`Nhập ${codeLabel.toLowerCase()}...`}
              />
            </div>
            {hasReasonField && (
              <div className="grid gap-1.5">
                <Label>{reasonLabel}</Label>
                <Input
                  value={form.reason}
                  onChange={(event) => setForm((state) => ({ ...state, reason: event.target.value }))}
                  placeholder={reasonPlaceholder ?? "Nhập nguyên nhân..."}
                />
              </div>
            )}
            {hasProgressField && (
              <div className="grid gap-1.5">
                <Label>{progressLabel}</Label>
                <Textarea
                  value={form.progress}
                  onChange={(event) => setForm((state) => ({ ...state, progress: event.target.value }))}
                  placeholder={progressPlaceholder ?? "Nhập tiến trình..."}
                  className="min-h-20 resize-y"
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label>{linkLabel}{requireLink ? " *" : ""}</Label>
              {contentMode === "text" ? (
                <Textarea
                  value={form.documentUrl}
                  onChange={(event) => setForm((state) => ({ ...state, documentUrl: event.target.value }))}
                  placeholder={contentPlaceholder ?? "Nhập nội dung..."}
                  className="min-h-24 resize-y"
                />
              ) : (
                <Input
                  value={form.documentUrl}
                  onChange={(event) => setForm((state) => ({ ...state, documentUrl: event.target.value }))}
                  placeholder={contentPlaceholder ?? "https://... hoặc link Google Drive / PDF"}
                />
              )}
            </div>
            {hasNoteField && (
              <div className="grid gap-1.5">
                <Label>{noteLabel}</Label>
                <Textarea
                  value={form.note}
                  onChange={(event) => setForm((state) => ({ ...state, note: event.target.value }))}
                  placeholder={notePlaceholder ?? "Nhập ghi chú..."}
                  className="min-h-20 resize-y"
                />
              </div>
            )}
            {hasAttachmentField && (
              <div className="grid gap-1.5">
                <Label>{attachmentLabel}</Label>
                <Input type="file" accept="image/*" multiple onChange={handleAttachmentChange} />
                <div className="text-xs text-muted-foreground">Tối đa {maxAttachments} hình ảnh.</div>
                {form.attachmentUrls.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {form.attachmentUrls.map((url, imageIndex) => (
                      <div key={`${url}-${imageIndex}`} className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`${attachmentLabel} ${imageIndex + 1}`} className="h-28 w-full object-cover" />
                        <button
                          type="button"
                          aria-label="Xóa hình ảnh"
                          onClick={() => removeAttachment(imageIndex)}
                          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-600 shadow-sm hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={submit}
              disabled={
                upsert.isPending ||
                !form.title.trim() ||
                (requireLink && !form.documentUrl.trim()) ||
                (requireTag && !form.decisionNumber.trim()) ||
                (requireDate && !form.recordDate.trim()) ||
                (requireYear && !form.archiveYear.trim())
              }
            >
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Lưu thay đổi" : "Thêm mới"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Xóa tài liệu?"
        description={deleteTarget ? `Xóa "${deleteTarget.title}" khỏi danh mục?` : undefined}
        confirmLabel="Xóa"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await remove.mutateAsync({ id: deleteTarget.id, category });
            setDeleteTarget(null);
            toast.success("Đã xóa tài liệu");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function normalizeRecordDateForInput(value: string | null | undefined, inputType: "date" | "datetime-local") {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (inputType === "date") return raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00`;
  return raw.slice(0, 16);
}

function formatArchiveRecordDate(value: string | null | undefined, inputType: "date" | "datetime-local") {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  return inputType === "datetime-local" && raw.includes("T") ? formatDateTime(raw) : formatDate(raw);
}

function DocumentUserAvatar({ user }: { user?: DigitalDocumentUser | null }) {
  if (!user?.name) return <span className="flex justify-center text-muted-foreground">—</span>;

  return (
    <div className="flex justify-center" title={`${user.name}${user.position ? ` · ${user.position}` : ""}`} aria-label={`Người cập nhật: ${user.name}`}>
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function unitBadgeClass(unit: string | null | undefined) {
  if (unit === "S1") return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
  if (unit === "S2") return "bg-orange-100 text-orange-700 ring-1 ring-orange-200";
  return "bg-muted text-muted-foreground";
}
