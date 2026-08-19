"use client";

import { Fragment, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditableCell, SignatureStamp, StatusBadge } from "@/components/pccc/pccc-shared";
import {
  DetailField,
  DetailPanel,
  PcccTableCard,
  ROW_HOVER,
  RowExpander,
  SortHeader,
  STICKY_EDGE,
  STICKY_TD,
  STICKY_TH,
  TABLE_SCROLLER,
  TD_EXPAND,
  TD_ROW,
  TH_EXPAND,
  TH_NAVY,
  TR_HEAD,
  rowBackground,
  type SortState,
} from "@/components/pccc/pccc-table-card";
import { DAT_KHONG_DAT_OPTIONS } from "@/lib/pccc-status";
import {
  canEditPcccAdminField,
  canEditPcccRow,
  pcccLockReason,
  type FireControlCabinetRow,
  type PcccWriteScopeMeta,
  type PositionOption,
} from "@/hooks/usePccc";

export function PcccFireControlCabinets({
  rows,
  cuongViList,
  canManage,
  writeScope,
  loading,
  editing,
  draft,
  onDraftChange,
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
  rows: FireControlCabinetRow[];
  cuongViList: PositionOption[];
  canManage: boolean;
  writeScope?: PcccWriteScopeMeta;
  loading?: boolean;
  editing: boolean;
  draft: Record<string, Record<string, unknown>>;
  onDraftChange: (rowId: string, field: string, value: unknown) => void;
  sort: SortState;
  onSort: (key: string) => void;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  filtered?: boolean;
  toolbarExtra?: React.ReactNode;
  search: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSearchChange: (value: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const canEdit = canManage && editing;
  const canEditAdminField = canEdit && canEditPcccAdminField(writeScope);
  const cuongViOptions = cuongViList.map((item) => item.label);
  const frozen = { expand: { left: 0 }, ma: { left: 42, width: 250 } } as const;
  const colCount = 7;

  return (
    <PcccTableCard
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Mã thiết bị, hệ thống, vị trí, ghi chú…"
      page={page}
      pageCount={pageCount}
      total={total}
      filtered={filtered}
      onPageChange={onPageChange}
      toolbarExtra={toolbarExtra}
      footerNote={
        !editing && canManage ? (
          <span className="text-[12px]">Bảng đang khoá — bấm <b>Sửa bảng</b> để mở khoá.</span>
        ) : loading ? (
          <span className="inline-flex items-center gap-1.5 text-[12px]"><Loader2 className="size-3 animate-spin" /> Đang tải…</span>
        ) : null
      }
    >
      <Table className="min-w-[1180px]" wrapperClassName={TABLE_SCROLLER}>
        <TableHeader>
          <TableRow className={TR_HEAD}>
            <TableHead className={cn(TH_NAVY, TH_EXPAND, STICKY_TH)} style={{ left: frozen.expand.left }} />
            <TableHead
              className={cn(TH_NAVY, STICKY_TH, STICKY_EDGE)}
              style={{ left: frozen.ma.left, width: frozen.ma.width, minWidth: frozen.ma.width }}
            >
              <SortHeader label="Mã thiết bị" sortKey="ma" sort={sort} onSort={onSort} align="left" />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[245px]")}>
              <SortHeader label="Hệ thống" sortKey="heThong" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[245px]")}>
              <SortHeader label="Vị trí hiện tại" sortKey="viTri" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[185px]")}>
              <SortHeader label="Cương vị quản lý" sortKey="cuongVi" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[110px]")}>
              <SortHeader label="Tổ máy" sortKey="machine" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[145px]")}>
              <SortHeader label="Tình trạng" sortKey="tinhTrang" sort={sort} onSort={onSort} />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && !loading && (
            <TableRow><TableCell colSpan={colCount} className="py-12 text-center text-sm text-muted-foreground">Không tìm thấy bản ghi phù hợp.</TableCell></TableRow>
          )}
          {rows.map((row, index) => {
            const expanded = expandedId === row.id;
            const rowEditable = canEdit && canEditPcccRow(writeScope, row);
            const rowDraft = draft[row.id];
            const dirty = (field: string) => (rowDraft && field in rowDraft ? "bg-amber-100/60" : "");
            const value = <T,>(field: string, saved: T) => (rowDraft && field in rowDraft ? (rowDraft[field] as T) : saved);
            const lockReason = (adminField = false) => (canEdit ? pcccLockReason(writeScope, row, adminField) : undefined);
            const rowBg = rowBackground({ index, expanded, dirty: Boolean(rowDraft) });
            const status = value("tinhTrang", row.tinhTrang);
            const save = (field: string, next: unknown) => onDraftChange(row.id, field, next);

            return (
              <Fragment key={row.id}>
                <TableRow className={cn(rowBg, ROW_HOVER)}>
                  <TableCell className={cn(TD_EXPAND, STICKY_TD, rowBg)} style={{ left: frozen.expand.left }}>
                    <RowExpander expanded={expanded} onToggle={() => setExpandedId(expanded ? null : row.id)} />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, STICKY_TD, STICKY_EDGE, rowBg, "whitespace-nowrap text-left font-medium")} style={{ left: frozen.ma.left }}>
                    <span className="inline-flex items-center gap-1">
                      {row.ma}
                      {canEdit && !rowEditable && <Lock className="size-3 shrink-0 text-slate-400" aria-label="Ngoài phạm vi cương vị của bạn" />}
                    </span>
                  </TableCell>
                  <TableCell className={cn(TD_ROW, dirty("heThong"))}>
                    <EditableCell value={value("heThong", row.heThong)} wrap disabled={!rowEditable || !canEditAdminField} lockedReason={lockReason(true)} onSave={(v) => save("heThong", v)} />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, dirty("viTri"))}>
                    <EditableCell value={value("viTri", row.viTri)} wrap disabled={!rowEditable} lockedReason={lockReason()} onSave={(v) => save("viTri", v || null)} />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "text-center", dirty("cuongVi"))}>
                    <EditableCell value={value("cuongVi", row.cuongVi)} align="center" type="select" options={cuongViOptions} disabled={!rowEditable || !canEditAdminField} lockedReason={lockReason(true)} onSave={(v) => save("cuongVi", v || null)} />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "text-center", dirty("machine"))}>
                    <EditableCell value={value("machine", row.machine)} align="center" type="select" options={["S1", "S2", "COMMON"]} disabled={!rowEditable || !canEditAdminField} lockedReason={lockReason(true)} onSave={(v) => save("machine", v)} />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "text-center", dirty("tinhTrang"))}>
                    {rowEditable ? (
                      <EditableCell value={status} align="center" type="select" options={[...DAT_KHONG_DAT_OPTIONS]} lockedReason={lockReason()} onSave={(v) => save("tinhTrang", v || null)} />
                    ) : <StatusBadge status={status} />}
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={colCount} className="bg-slate-50/80 p-0">
                      <DetailPanel>
                        <DetailField label="Ngày kiểm tra">
                          <EditableCell value={value("ngayKiemTra", row.ngayKiemTra)} type="date" disabled={!rowEditable || !canEditAdminField} lockedReason={lockReason(true)} onSave={(v) => save("ngayKiemTra", v || null)} />
                        </DetailField>
                        <DetailField label="Người kiểm tra">
                          <EditableCell value={value("nguoiKiemTra", row.nguoiKiemTra)} disabled={!rowEditable || !canEditAdminField} lockedReason={lockReason(true)} onSave={(v) => save("nguoiKiemTra", v || null)} />
                        </DetailField>
                        <DetailField label="Chữ ký"><SignatureStamp signature={row.signature} /></DetailField>
                        <DetailField label="Ghi chú" span="full">
                          <EditableCell value={value("ghiChu", row.ghiChu)} wrap disabled={!rowEditable} lockedReason={lockReason()} onSave={(v) => save("ghiChu", v || null)} />
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
