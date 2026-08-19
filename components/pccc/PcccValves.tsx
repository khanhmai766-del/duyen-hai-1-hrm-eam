"use client";
// TAB "VAN CHỮA CHÁY" — gồm cả van Deluge lẫn van Alarm, phân biệt bằng cột "Loại van".
//
// Cùng khuôn với tab Bình chữa cháy (một ô tình trạng chọn đơn, không có khối ô tích),
// nhưng vốn từ tình trạng là RIÊNG của van: mức giữa là cả một câu dài ("Có suy giảm
// chức năng nhưng vẫn sử dụng được khi có sự cố") nên trên bảng hiện dạng nhãn ngắn,
// đầy đủ chữ nằm ở tooltip và khối chi tiết.
import { Fragment, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditableCell, StatusBadge, SignatureStamp } from "@/components/pccc/pccc-shared";
import {
  DetailField,
  DetailPanel,
  STICKY_EDGE,
  STICKY_TD,
  STICKY_TH,
  TABLE_SCROLLER,
  PcccTableCard,
  PlainHeader,
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
import { VALVE_TINH_TRANG_OPTIONS } from "@/lib/pccc-status";
import {
  canEditPcccAdminField,
  canEditPcccRow,
  pcccLockReason,
  type ValveRow,
  type PcccWriteScopeMeta,
  type PositionOption,
} from "@/hooks/usePccc";

/**
 * Nhãn NGẮN hiện trên bảng. Mức giữa dài 56 ký tự — để nguyên thì cột tình trạng nuốt
 * hết bề ngang bảng. Giá trị THẬT lưu trong DB vẫn là câu đầy đủ, chỉ đổi chữ hiển thị.
 */
const SHORT_LABEL: Record<string, string> = {
  "Có suy giảm chức năng nhưng vẫn sử dụng được khi có sự cố": "Suy giảm, vẫn dùng được",
};
const shortLabel = (v: string | null) => (v ? SHORT_LABEL[v] ?? v : v);

export function PcccValves({
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
  rows: ValveRow[];
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
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  onSearchChange: (v: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const cuongViOptions = cuongViList.map((o) => o.label);
  const canEdit = canManage && editing;
  const canEditAdminField = canEdit && canEditPcccAdminField(writeScope);

  const FROZEN = {
    expand: { w: 42, left: 0 },
    maKks: { w: 128, left: 42 },
  } as const;

  // + | Mã KKS | Tên van | Loại | Vị trí | Cương vị | Giám sát | Tình trạng | Số YCSC | Người kiểm tra
  const colCount = 10;

  function save(row: ValveRow, field: string, value: unknown) {
    onDraftChange(row.id, field, value);
  }

  return (
    <PcccTableCard
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Mã KKS, tên van, vị trí…"
      page={page}
      pageCount={pageCount}
      total={total}
      filtered={filtered}
      onPageChange={onPageChange}
      toolbarExtra={toolbarExtra}
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
      <Table className="min-w-[1360px]" wrapperClassName={TABLE_SCROLLER}>
        <TableHeader>
          <TableRow className={TR_HEAD}>
            <TableHead className={cn(TH_NAVY, TH_EXPAND, STICKY_TH)} style={{ left: FROZEN.expand.left }} />
            <TableHead
              className={cn(TH_NAVY, STICKY_TH, STICKY_EDGE)}
              style={{ left: FROZEN.maKks.left, width: FROZEN.maKks.w, minWidth: FROZEN.maKks.w }}
            >
              <SortHeader label="Mã KKS van" sortKey="maKks" sort={sort} onSort={onSort} align="left" />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[280px]")}>
              <SortHeader label="Tên van" sortKey="tenVan" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[90px]")}>
              <SortHeader label="Loại van" sortKey="loaiVan" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[165px]")}>
              <SortHeader label="Vị trí" sortKey="viTri" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[145px]")}>
              <SortHeader label="Cương vị quản lý" sortKey="cuongVi" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[115px]")}>
              <PlainHeader label="Người giám sát" />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[175px]")}>
              <SortHeader label="Tình trạng" sortKey="tinhTrang" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[95px]")}>
              <SortHeader label="Số YCSC" sortKey="soYcsc" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[125px]")}>
              <SortHeader label="Người kiểm tra" sortKey="nguoiKiemTra" sort={sort} onSort={onSort} />
            </TableHead>
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
            const rowBg = rowBackground({ index, expanded, dirty: Boolean(rowDraft) });
            const tinhTrang = val("tinhTrang", r.tinhTrang);

            return (
              <Fragment key={r.id}>
                <TableRow className={cn(rowBg, ROW_HOVER)}>
                  <TableCell className={cn(TD_EXPAND, STICKY_TD, rowBg)} style={{ left: FROZEN.expand.left }}>
                    <RowExpander expanded={expanded} onToggle={() => setExpandedId(expanded ? null : r.id)} />
                  </TableCell>
                  <TableCell
                    className={cn(TD_ROW, STICKY_TD, STICKY_EDGE, rowBg, "whitespace-nowrap text-left font-medium")}
                    style={{ left: FROZEN.maKks.left }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {r.maKks}
                      {canEdit && !rowEditable && (
                        <Lock className="size-3 shrink-0 text-slate-400" aria-label="Ngoài phạm vi cương vị của bạn" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className={cn(TD_ROW, dirty("tenVan"))}>
                    <EditableCell
                      value={val("tenVan", r.tenVan)}
                      wrap
                      disabled={!rowEditable}
                      lockedReason={lockReason()}
                      onSave={(v) => save(r, "tenVan", v || null)}
                    />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap text-center", dirty("loaiVan"))}>
                    <EditableCell
                      value={val("loaiVan", r.loaiVan)}
                      align="center"
                      type="select"
                      options={["DELUGE", "ALARM"]}
                      disabled={!rowEditable || !canEditAdminField}
                      lockedReason={lockReason(true)}
                      onSave={(v) => save(r, "loaiVan", v || null)}
                    />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, dirty("viTri"))}>
                    <EditableCell
                      value={val("viTri", r.viTri)}
                      wrap
                      disabled={!rowEditable}
                      lockedReason={lockReason()}
                      onSave={(v) => save(r, "viTri", v || null)}
                    />
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
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap text-center", dirty("nguoiGiamSat"))}>
                    <EditableCell
                      value={val("nguoiGiamSat", r.nguoiGiamSat)}
                      align="center"
                      disabled={!rowEditable || !canEditAdminField}
                      lockedReason={lockReason(true)}
                      onSave={(v) => save(r, "nguoiGiamSat", v || null)}
                    />
                  </TableCell>
                  {/* Ô chọn 3 mức riêng của van. Bảng hiện nhãn ngắn, chữ đầy đủ ở tooltip. */}
                  <TableCell className={cn(TD_ROW, "text-center", dirty("tinhTrang"))} title={tinhTrang ?? undefined}>
                    {rowEditable ? (
                      <EditableCell
                        value={tinhTrang}
                        align="center"
                        type="select"
                        options={[...VALVE_TINH_TRANG_OPTIONS]}
                        lockedReason={lockReason()}
                        onSave={(v) => save(r, "tinhTrang", v || null)}
                      />
                    ) : (
                      <StatusBadge status={shortLabel(tinhTrang)} />
                    )}
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "text-center", dirty("soYcsc"))}>
                    <EditableCell value={val("soYcsc", r.soYcsc)} disabled={!rowEditable} lockedReason={lockReason()} onSave={(v) => save(r, "soYcsc", v || null)} />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap text-center", dirty("nguoiKiemTra"))}>
                    <EditableCell
                      value={val("nguoiKiemTra", r.nguoiKiemTra)}
                      disabled={!rowEditable || !canEditAdminField}
                      lockedReason={lockReason(true)}
                      onSave={(v) => save(r, "nguoiKiemTra", v || null)}
                    />
                  </TableCell>
                </TableRow>

                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={colCount} className="bg-slate-50/80 p-0">
                      <DetailPanel>
                        <DetailField label="Tình trạng (đầy đủ)" span={2}>
                          <StatusBadge status={tinhTrang} />
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
                        <DetailField label="Mô tả" span="full">
                          <EditableCell
                            value={val("moTa", r.moTa)}
                            wrap
                            disabled={!rowEditable}
                            lockedReason={lockReason()}
                            onSave={(v) => save(r, "moTa", v || null)}
                          />
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
