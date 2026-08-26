"use client";
// BẢNG CON "CUỘN VÒI CHỮA CHÁY (CVCC)" — nằm dưới tab Tủ chữa cháy, đúng như bản demo.
//
// Cùng khuôn ô tích với tủ chữa cháy, nhưng khác hai chỗ có chủ đích:
//  1. Tình trạng tổng thể chỉ HAI mức Đạt/Không đạt (TB 5100/TB-NĐDH ngày 14/8/2026),
//     trong khi tủ vẫn ba mức vì văn bản không đề cập tới tủ.
//  2. Hai ô đầu/cuối mỗi nhóm đổi CHỮ HIỂN THỊ thành "Đạt"/"Không đạt"; KEY lưu trong
//     DB vẫn là vốn từ gốc của tủ ("Khả dụng"/"Bất khả dụng"/"Hư hỏng nặng…") vì dữ
//     liệu được sao từ tủ cha — đổi key là làm sai phần sao chép.
//
// Đây cũng là bảng DUY NHẤT của module cho thêm/xoá dòng bằng tay: cuộn vòi không có
// trong Excel gốc nên số lượng thực tế mỗi tủ chỉ hiện trường mới biết.
import { Fragment, useEffect, useRef, useState } from "react";
import { Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditableCell, InspectionMark, StatusBadge, TickCell, componentTone, SignatureStamp } from "@/components/pccc/pccc-shared";
import {
  DetailField,
  DetailPanel,
  STICKY_EDGE,
  STICKY_TD,
  STICKY_TH,
  TABLE_SCROLLER,
  PcccTableCard,
  PlainHeader,
  FaultChip,
  ROW_HOVER,
  RowExpander,
  SortHeader,
  rowBackground,
  TD_EXPAND,
  TD_ROW,
  TH_EXPAND,
  TH_NAVY,
  TR_HEAD,
  type SortState,
} from "@/components/pccc/pccc-table-card";
import { deriveCabinetStatus, hoseReelLabelDisplay } from "@/lib/pccc-status";
import {
  canEditPcccAdminField,
  canEditPcccRow,
  pcccLockReason,
  type HoseReelRow,
  type PcccWriteScopeMeta,
  type PositionOption,
} from "@/hooks/usePccc";

const STATUS_COL_WIDTH = 68;
const TIER2_HEIGHT = 52;

export function PcccHoseReels({
  rows,
  groups,
  cuongViList,
  canManage,
  writeScope,
  loading,
  editing,
  draft,
  onDraftChange,
  onToggleComponent,
  inspectionSelectedIds,
  onInspectionToggle,
  onAdd,
  onDelete,
  sort,
  onSort,
  page,
  pageCount,
  pageSize,
  total,
  filtered,
  toolbarExtra,
  search,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
}: {
  rows: HoseReelRow[];
  groups: { label: string; statuses: string[] }[];
  cuongViList: PositionOption[];
  canManage: boolean;
  writeScope?: PcccWriteScopeMeta;
  loading?: boolean;
  editing: boolean;
  draft: Record<string, Record<string, unknown>>;
  onDraftChange: (rowId: string, field: string, value: unknown) => void;
  onToggleComponent: (row: HoseReelRow, groupLabel: string, status: string, nextChecked: boolean) => void;
  inspectionSelectedIds: Set<string>;
  onInspectionToggle: (rowId: string, checked: boolean) => void;
  /** Mở hộp thoại thêm cuộn vòi (chọn tủ cha + mã). Không truyền = ẩn nút. */
  onAdd?: () => void;
  /** Xoá hẳn một cuộn vòi. Ghi ngay, không chờ lưu bảng. */
  onDelete?: (row: HoseReelRow) => void;
  sort: SortState;
  onSort: (key: string) => void;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  filtered?: boolean;
  toolbarExtra?: React.ReactNode;
  search: string;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  onSearchChange: (v: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const headRowRef = useRef<HTMLTableRowElement>(null);
  const [tier1Height, setTier1Height] = useState(44);
  useEffect(() => {
    const el = headRowRef.current;
    if (!el) return;
    const measure = () => setTier1Height(Math.round(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [groups.length]);

  const cuongViOptions = cuongViList.map((o) => o.label);
  const canEdit = canManage && editing;
  const canEditAdminField = canEdit && canEditPcccAdminField(writeScope);

  const FROZEN = {
    expand: { w: 42, left: 0 },
    ma: { w: 235, left: 42 },
  } as const;

  const componentCols = groups.reduce((n, g) => n + g.statuses.length, 0);
  // + | Mã | Cương vị | Tình trạng | <ô tích> | Số YCSC | Người kiểm tra | (xoá)
  const colCount = 4 + componentCols + 2 + (onDelete ? 1 : 0);

  function save(row: HoseReelRow, field: string, value: unknown) {
    onDraftChange(row.id, field, value);
  }

  return (
    <PcccTableCard
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Mã cuộn vòi, mã tủ, vị trí…"
      page={page}
      pageCount={pageCount}
      total={total}
      filtered={filtered}
      onPageChange={onPageChange}
      toolbarExtra={
        <>
          {toolbarExtra}
          {onAdd && canManage && (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-[12.5px] font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              <Plus className="size-3.5" /> Thêm cuộn vòi
            </button>
          )}
        </>
      }
      footerNote={
        !editing && canManage ? (
          <span className="text-[12px]">
            Bảng đang khoá — bấm <b>Sửa bảng</b> để mở khoá.
          </span>
        ) : loading ? (
          <span className="inline-flex items-center gap-1.5 text-[12px]">
            <Loader2 className="size-3 animate-spin" /> Đang tải…
          </span>
        ) : null
      }
    >
      <Table className="min-w-[1285px]" wrapperClassName={TABLE_SCROLLER}>
        <TableHeader>
          <TableRow ref={headRowRef} className={TR_HEAD}>
            <TableHead rowSpan={2} className={cn(TH_NAVY, TH_EXPAND, STICKY_TH)} style={{ left: FROZEN.expand.left }} />
            <TableHead
              rowSpan={2}
              className={cn(TH_NAVY, STICKY_TH, STICKY_EDGE)}
              style={{ left: FROZEN.ma.left, width: FROZEN.ma.w, minWidth: FROZEN.ma.w }}
            >
              <SortHeader label="Mã cuộn vòi" sortKey="ma" sort={sort} onSort={onSort} align="left" />
            </TableHead>
            <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[145px]")}>
              <SortHeader label="Cương vị quản lý" sortKey="cuongVi" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[112px]")}>
              <SortHeader label="Tình trạng" sortKey="tinhTrangTongThe" sort={sort} onSort={onSort} />
            </TableHead>
            {groups.map((g) => (
              <TableHead key={g.label} colSpan={g.statuses.length} className={cn(TH_NAVY, "text-center")}>
                <PlainHeader label={g.label} align="center" />
              </TableHead>
            ))}
            <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[95px]")}>
              <SortHeader label="Số YCSC" sortKey="soYcsc" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[125px]")}>
              <SortHeader label="Người kiểm tra" sortKey="nguoiKiemTra" sort={sort} onSort={onSort} />
            </TableHead>
            {onDelete && <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[52px]")} />}
          </TableRow>
          <TableRow className={TR_HEAD}>
            {groups.flatMap((g) =>
              g.statuses.map((st) => {
                const shown = hoseReelLabelDisplay(st);
                return (
                  <TableHead
                    key={`${g.label}-${st}`}
                    title={shown === st ? st : `${shown} (dữ liệu gốc: ${st})`}
                    className={cn(TH_NAVY, "px-1 text-center align-middle")}
                    style={{ top: tier1Height, height: TIER2_HEIGHT, width: STATUS_COL_WIDTH, minWidth: STATUS_COL_WIDTH }}
                  >
                    <span className="block whitespace-normal text-[10px] font-medium normal-case leading-[1.15] tracking-normal text-white/90">
                      {shown}
                    </span>
                  </TableHead>
                );
              })
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && !loading && (
            <TableRow>
              <TableCell colSpan={colCount} className="py-12 text-center text-sm text-muted-foreground">
                Không tìm thấy bản ghi phù hợp.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r, index) => {
            const expanded = expandedId === r.id;
            const rowEditable = canEdit && canEditPcccRow(writeScope, r);
            const lockReason = (adminField = false) => (canEdit ? pcccLockReason(writeScope, r, adminField) : undefined);
            const rowDraft = draft[r.id];
            const dirty = (field: string) => (rowDraft && field in rowDraft ? "bg-amber-100/60" : "");
            const val = <T,>(field: string, saved: T) => (rowDraft && field in rowDraft ? (rowDraft[field] as T) : saved);
            const tick = (groupLabel: string, status: string) => {
              const key = `comp:${groupLabel}|${status}`;
              if (rowDraft && key in rowDraft) return Boolean(rowDraft[key]);
              return r.components.find((c) => c.groupLabel === groupLabel && c.status === status)?.checked ?? false;
            };
            // Hiển thị tình trạng theo các ô đang chỉnh, giống website PCCC nguồn.
            // Giá trị đã lưu chỉ được dùng khi dòng không có thay đổi nháp.
            const effectiveStatus = deriveCabinetStatus(
              r.components.map((component) => ({
                ...component,
                checked: tick(component.groupLabel, component.status),
              }))
            );
            const rowBg = rowBackground({ index, expanded, dirty: Boolean(rowDraft) });

            const statusCount = new Map<string, number>();
            for (const c of r.components) {
              statusCount.set(c.groupLabel, Math.max(statusCount.get(c.groupLabel) ?? 0, c.statusOrder + 1));
            }
            const faults = r.components
              .filter((c) => c.statusOrder > 0 && tick(c.groupLabel, c.status))
              .sort((a, b) => a.groupOrder - b.groupOrder || a.statusOrder - b.statusOrder)
              .map((c) => ({
                groupLabel: c.groupLabel,
                status: c.status,
                severe: c.statusOrder === (statusCount.get(c.groupLabel) ?? 1) - 1,
              }));

            return (
              <Fragment key={r.id}>
                <TableRow className={cn(rowBg, ROW_HOVER)}>
                  <TableCell className={cn(TD_EXPAND, STICKY_TD, rowBg)} style={{ left: FROZEN.expand.left }}>
                    <RowExpander expanded={expanded} onToggle={() => setExpandedId(expanded ? null : r.id)} />
                  </TableCell>
                  <TableCell
                    className={cn(TD_ROW, STICKY_TD, STICKY_EDGE, rowBg, "whitespace-nowrap text-left font-medium")}
                    style={{ left: FROZEN.ma.left }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {r.ma}
                      {canEdit && !rowEditable && (
                        <Lock className="size-3 shrink-0 text-slate-400" aria-label="Ngoài phạm vi cương vị của bạn" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap text-center", dirty("cuongVi"))}>
                    <EditableCell
                      value={val("cuongVi", r.cuongVi)}
                      align="center"
                      type="select"
                      options={cuongViOptions}
                      disabled={!rowEditable || !canEditAdminField}
                      lockedReason={lockReason(true)}
                      onSave={(v) => save(r, "cuongVi", v || null)}
                    />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap text-center")}>
                    <StatusBadge status={effectiveStatus} />
                  </TableCell>

                  {groups.flatMap((g) =>
                    g.statuses.map((status, i) => {
                      const checked = tick(g.label, status);
                      return (
                        <TableCell
                          key={`${r.id}-${g.label}-${status}`}
                          style={{ width: STATUS_COL_WIDTH, minWidth: STATUS_COL_WIDTH }}
                          className={cn(TD_ROW, "text-center", i === 0 && "border-l border-slate-200", dirty(`comp:${g.label}|${status}`))}
                          title={`${g.label} — ${hoseReelLabelDisplay(status)}`}
                        >
                          <TickCell
                            checked={checked}
                            tone={componentTone(i, g.statuses.length)}
                            disabled={!rowEditable}
                            lockedReason={lockReason()}
                            onToggle={() => onToggleComponent(r, g.label, status, !checked)}
                          />
                        </TableCell>
                      );
                    })
                  )}

                  <TableCell className={cn(TD_ROW, "border-l border-slate-200 text-center", dirty("soYcsc"))}>
                    <EditableCell value={val("soYcsc", r.soYcsc)} disabled={!rowEditable} lockedReason={lockReason()} onSave={(v) => save(r, "soYcsc", v || null)} />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap text-center", dirty("nguoiKiemTra"))}>
                    <InspectionMark checked={inspectionSelectedIds.has(r.id)} disabled={!canManage || !canEditPcccRow(writeScope, r)} onChange={(checked) => onInspectionToggle(r.id, checked)}>
                      <EditableCell value={val("nguoiKiemTra", r.nguoiKiemTra)} disabled={!rowEditable || !canEditAdminField} lockedReason={lockReason(true)} onSave={(v) => save(r, "nguoiKiemTra", v || null)} />
                    </InspectionMark>
                  </TableCell>
                  {onDelete && (
                    <TableCell className={cn(TD_ROW, "text-center")}>
                      <button
                        type="button"
                        disabled={!rowEditable}
                        onClick={() => onDelete(r)}
                        title={rowEditable ? "Xoá cuộn vòi này" : "Ngoài phạm vi cương vị của bạn"}
                        className="rounded-md p-1 text-slate-400 transition enabled:hover:bg-rose-50 enabled:hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>

                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={colCount} className="bg-slate-50/80 p-0">
                      <DetailPanel>
                        <DetailField label="Tên cuộn vòi">
                          <EditableCell
                            value={val("ten", r.ten)}
                            disabled={!rowEditable}
                            lockedReason={lockReason()}
                            onSave={(v) => save(r, "ten", v || null)}
                          />
                        </DetailField>
                        <DetailField label="Ngày kiểm tra">
                          <EditableCell
                            value={val("ngayKiemTra", r.ngayKiemTra)}
                            type="date"
                            disabled={!rowEditable || !canEditAdminField}
                            lockedReason={lockReason(true)}
                            onSave={(v) => save(r, "ngayKiemTra", v || null)}
                          />
                        </DetailField>
                        <DetailField label="Chữ ký">
                          <SignatureStamp signature={r.signature} />
                        </DetailField>

                        <DetailField label="Tủ chữa cháy cha" span={2}>
                          <span className="text-slate-700">
                            {r.cabinet.ma}
                            {r.cabinet.ten ? ` — ${r.cabinet.ten}` : ""}
                          </span>
                        </DetailField>
                        <DetailField label="Ghi chú">
                          <EditableCell
                            value={val("ghiChu", r.ghiChu)}
                            wrap
                            disabled={!rowEditable}
                            lockedReason={lockReason()}
                            onSave={(v) => save(r, "ghiChu", v || null)}
                          />
                        </DetailField>

                        <DetailField label="Hạng mục đang lỗi" span="full">
                          {faults.length === 0 ? (
                            <span className="text-emerald-700">Không có — cuộn ống và lăng phun đều đạt</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {faults.map((f) => (
                                <FaultChip
                                  key={`${f.groupLabel}-${f.status}`}
                                  group={f.groupLabel}
                                  status={hoseReelLabelDisplay(f.status)}
                                  tone={f.severe ? "bad" : "watch"}
                                />
                              ))}
                            </span>
                          )}
                        </DetailField>
                      </DetailPanel>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </PcccTableCard>
  );
}
