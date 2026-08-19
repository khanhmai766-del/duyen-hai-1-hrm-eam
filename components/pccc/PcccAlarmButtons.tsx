"use client";
// TAB "NÚT NHẤN BÁO CHÁY (NNBC)" — cùng khuôn bảng với tab Tủ chữa cháy: header 2
// tầng (nhóm × trạng thái), một nhóm tích được nhiều trạng thái cùng lúc, chỉ ô đầu
// và ô cuối loại trừ nhau (server tự bỏ tích ô đối lập — lib/pccc-status.ts).
//
// Khác tủ chữa cháy ở ba chỗ:
//  - có cột "Người giám sát" (cấp giám sát, không phải tên người);
//  - KHÔNG có "Số YCSC" — sheet nguồn không có cột này;
//  - cột "Ghi chú khác" là NHẬT KÝ nhiều đợt kiểm tra, dài hàng chục dòng, nên đẩy
//    hẳn xuống khối chi tiết chứ không nhét vào bảng.
import { Fragment, useEffect, useRef, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditableCell, StatusBadge, TickCell, componentTone, SignatureStamp } from "@/components/pccc/pccc-shared";
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
import {
  canEditPcccAdminField,
  canEditPcccRow,
  pcccLockReason,
  type AlarmButtonRow,
  type PcccWriteScopeMeta,
  type PositionOption,
} from "@/hooks/usePccc";

const STATUS_COL_WIDTH = 68;
const TIER2_HEIGHT = 52;

export function PcccAlarmButtons({
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
  rows: AlarmButtonRow[];
  groups: { label: string; statuses: string[] }[];
  cuongViList: PositionOption[];
  canManage: boolean;
  writeScope?: PcccWriteScopeMeta;
  loading?: boolean;
  editing: boolean;
  draft: Record<string, Record<string, unknown>>;
  onDraftChange: (rowId: string, field: string, value: unknown) => void;
  onToggleComponent: (row: AlarmButtonRow, groupLabel: string, status: string, nextChecked: boolean) => void;
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
  // Tầng 2 của đầu bảng phải dính ngay dưới tầng 1 — đo chiều cao thật thay vì đóng
  // cứng một con số, xem ghi chú cùng chỗ ở PcccCabinets.
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

  // Đóng băng nút chi tiết + MÃ KKS. Mã KKS ngắn (7 ký tự) nên vùng cố định gọn, còn
  // nhiều chỗ cho khối ô tích.
  const FROZEN = {
    expand: { w: 42, left: 0 },
    maKks: { w: 122, left: 42 },
  } as const;

  const componentCols = groups.reduce((n, g) => n + g.statuses.length, 0);
  // + | Mã KKS | Vị trí | Cương vị | Giám sát | Tình trạng | <ô tích> | Người kiểm tra
  const colCount = 6 + componentCols + 1;

  function save(row: AlarmButtonRow, field: string, value: unknown) {
    onDraftChange(row.id, field, value);
  }

  return (
    <PcccTableCard
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Mã KKS, khu vực, vị trí…"
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
      <Table className="min-w-[1395px]" wrapperClassName={TABLE_SCROLLER}>
        <TableHeader>
          <TableRow ref={headRowRef} className={TR_HEAD}>
            <TableHead rowSpan={2} className={cn(TH_NAVY, TH_EXPAND, STICKY_TH)} style={{ left: FROZEN.expand.left }} />
            <TableHead
              rowSpan={2}
              className={cn(TH_NAVY, STICKY_TH, STICKY_EDGE)}
              style={{ left: FROZEN.maKks.left, width: FROZEN.maKks.w, minWidth: FROZEN.maKks.w }}
            >
              <SortHeader label="Mã KKS" sortKey="maKks" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[240px]")}>
              <SortHeader label="Vị trí cụ thể" sortKey="viTri" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[145px]")}>
              <SortHeader label="Cương vị quản lý" sortKey="cuongVi" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[115px]")}>
              <PlainHeader label="Người giám sát" />
            </TableHead>
            <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[128px]")}>
              <SortHeader label="Tình trạng" sortKey="tinhTrangTongThe" sort={sort} onSort={onSort} />
            </TableHead>
            {groups.map((g) => (
              <TableHead key={g.label} colSpan={g.statuses.length} className={cn(TH_NAVY, "text-center")} title={g.statuses.join(" · ")}>
                <PlainHeader label={g.label} align="center" />
              </TableHead>
            ))}
            <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[125px]")}>
              <SortHeader label="Người kiểm tra" sortKey="nguoiKiemTra" sort={sort} onSort={onSort} />
            </TableHead>
          </TableRow>
          <TableRow className={TR_HEAD}>
            {groups.flatMap((g) =>
              g.statuses.map((st) => (
                <TableHead
                  key={`${g.label}-${st}`}
                  title={st}
                  className={cn(TH_NAVY, "px-1 text-center align-middle")}
                  style={{ top: tier1Height, height: TIER2_HEIGHT, width: STATUS_COL_WIDTH, minWidth: STATUS_COL_WIDTH }}
                >
                  <span className="block whitespace-normal text-[10px] font-medium normal-case leading-[1.15] tracking-normal text-white/90">
                    {st}
                  </span>
                </TableHead>
              ))
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
                    className={cn(TD_ROW, STICKY_TD, STICKY_EDGE, rowBg, "whitespace-nowrap text-center font-medium")}
                    style={{ left: FROZEN.maKks.left }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {r.maKks}
                      {canEdit && !rowEditable && (
                        <Lock className="size-3 shrink-0 text-slate-400" aria-label="Ngoài phạm vi cương vị của bạn" />
                      )}
                    </span>
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
                  {/* Cấp giám sát là phân công cố định, chỉ ADMIN đổi — như bảng bình chữa cháy. */}
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap text-center", dirty("nguoiGiamSat"))}>
                    <EditableCell
                      value={val("nguoiGiamSat", r.nguoiGiamSat)}
                      align="center"
                      disabled={!rowEditable || !canEditAdminField}
                      lockedReason={lockReason(true)}
                      onSave={(v) => save(r, "nguoiGiamSat", v || null)}
                    />
                  </TableCell>
                  {/* Dẫn xuất từ các ô tích → chỉ đọc, server tính lại lúc lưu. */}
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap text-center")}>
                    <StatusBadge status={r.tinhTrangTongThe} />
                  </TableCell>

                  {groups.flatMap((g) =>
                    g.statuses.map((status, i) => {
                      const checked = tick(g.label, status);
                      return (
                        <TableCell
                          key={`${r.id}-${g.label}-${status}`}
                          style={{ width: STATUS_COL_WIDTH, minWidth: STATUS_COL_WIDTH }}
                          className={cn(TD_ROW, "text-center", i === 0 && "border-l border-slate-200", dirty(`comp:${g.label}|${status}`))}
                          title={`${g.label} — ${status}`}
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

                  <TableCell className={cn(TD_ROW, "whitespace-nowrap border-l border-slate-200", dirty("nguoiKiemTra"))}>
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
                        <DetailField label="Tên khu vực Layout" span={2}>
                          <EditableCell
                            value={val("tenKhuVuc", r.tenKhuVuc)}
                            wrap
                            disabled={!rowEditable}
                            lockedReason={lockReason()}
                            onSave={(v) => save(r, "tenKhuVuc", v || null)}
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

                        {/* Nhật ký kiểm tra nhiều đợt, giữ nguyên văn từ sheet gốc (có cả
                            số PCT và ngày của các đợt trước) — chiếm cả hàng vì rất dài. */}
                        <DetailField label="Ghi chú khác" span="full">
                          <EditableCell
                            value={val("khac", r.khac)}
                            wrap
                            disabled={!rowEditable}
                            lockedReason={lockReason()}
                            onSave={(v) => save(r, "khac", v || null)}
                          />
                        </DetailField>

                        <DetailField label="Hạng mục đang lỗi" span="full">
                          {faults.length === 0 ? (
                            <span className="text-emerald-700">Không có — nút nhấn, chuông và đèn đều tác động bình thường</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {faults.map((f) => (
                                <FaultChip key={`${f.groupLabel}-${f.status}`} group={f.groupLabel} status={f.status} tone={f.severe ? "bad" : "watch"} />
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
