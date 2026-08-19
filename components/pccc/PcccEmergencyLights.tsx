"use client";
// TAB "ĐÈN SỰ CỐ" — dùng chung cho ĐÈN EXIT và ĐÈN CHIẾU SÁNG SỰ CỐ, chuyển qua lại
// bằng nút gạt ở thanh công cụ (do trang cha truyền vào `toolbarExtra`). Hai sheet
// nguồn có hình dạng dữ liệu giống hệt nhau nên một bảng là đủ; tách đôi chỉ nhân
// đôi code và làm thanh tab dài thêm.
//
// Ba cột "Tên khu vực Layout" / "Mã bảng vẽ" / "Số lượng khu vực" là dữ liệu CẤP KHU
// VỰC dùng chung cho nhiều đèn (trong Excel là ô merge), nên hiển thị CHỈ ĐỌC — sửa
// lẻ trên một dòng sẽ làm khu vực đó tự mâu thuẫn với chính nó.
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
import { LIGHT_TINH_TRANG_OPTIONS } from "@/lib/pccc-status";
import {
  canEditPcccAdminField,
  canEditPcccRow,
  pcccLockReason,
  type EmergencyLightRow,
  type PcccWriteScopeMeta,
  type PositionOption,
} from "@/hooks/usePccc";

export function PcccEmergencyLights({
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
  rows: EmergencyLightRow[];
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
    maKks: { w: 122, left: 42 },
  } as const;

  // + | Mã KKS | Khu vực | Mã bản vẽ | SL | Cương vị | Giám sát | Tình trạng | Kết quả test | Người kiểm tra
  const colCount = 10;

  function save(row: EmergencyLightRow, field: string, value: unknown) {
    onDraftChange(row.id, field, value);
  }

  return (
    <PcccTableCard
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Mã KKS, khu vực, mã bản vẽ…"
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
      <Table className="min-w-[1370px]" wrapperClassName={TABLE_SCROLLER}>
        <TableHeader>
          <TableRow className={TR_HEAD}>
            <TableHead className={cn(TH_NAVY, TH_EXPAND, STICKY_TH)} style={{ left: FROZEN.expand.left }} />
            <TableHead
              className={cn(TH_NAVY, STICKY_TH, STICKY_EDGE)}
              style={{ left: FROZEN.maKks.left, width: FROZEN.maKks.w, minWidth: FROZEN.maKks.w }}
            >
              <SortHeader label="Mã KKS" sortKey="maKks" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[300px]")}>
              <SortHeader label="Tên khu vực Layout" sortKey="tenKhuVuc" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[145px]")}>
              <SortHeader label="Mã bảng vẽ" sortKey="maBanVe" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[62px] text-center")}>
              <PlainHeader label="SL khu vực" align="center" />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[140px]")}>
              <SortHeader label="Cương vị quản lý" sortKey="cuongVi" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[115px]")}>
              <PlainHeader label="Người giám sát" />
            </TableHead>
            {/* Nhãn dài nhất là "Không có đèn" — 118px vừa đủ, rộng hơn là thừa khoảng trắng. */}
            <TableHead className={cn(TH_NAVY, "w-[118px]")}>
              <SortHeader label="Tình trạng" sortKey="tinhTrang" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[300px]")}>
              <PlainHeader label="Kết quả test gần nhất" />
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
                  {/* Ba cột cấp khu vực — chỉ đọc, xem ghi chú đầu file. */}
                  <TableCell className={cn(TD_ROW, "text-[12.5px] text-slate-600")}>{r.tenKhuVuc ?? "—"}</TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap text-center text-[12.5px] text-slate-600")}>{r.maBanVe ?? "—"}</TableCell>
                  <TableCell className={cn(TD_ROW, "text-center tabular-nums text-slate-600")}>{r.soLuongKhuVuc ?? "—"}</TableCell>
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
                  <TableCell className={cn(TD_ROW, "text-center", dirty("tinhTrang"))}>
                    {rowEditable ? (
                      <EditableCell
                        value={tinhTrang}
                        align="center"
                        type="select"
                        options={[...LIGHT_TINH_TRANG_OPTIONS]}
                        lockedReason={lockReason()}
                        onSave={(v) => save(r, "tinhTrang", v || null)}
                      />
                    ) : (
                      <StatusBadge status={tinhTrang} />
                    )}
                  </TableCell>
                  {/* Nguyên văn ô tháng gần nhất của sheet nguồn — có cả số phiếu YCSC. */}
                  <TableCell className={cn(TD_ROW, dirty("ketQuaTest"))}>
                    <EditableCell
                      value={val("ketQuaTest", r.ketQuaTest)}
                      wrap
                      disabled={!rowEditable}
                      lockedReason={lockReason()}
                      onSave={(v) => save(r, "ketQuaTest", v || null)}
                    />
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
                        <DetailField label="Ghi chú">
                          <EditableCell
                            value={val("ghiChu", r.ghiChu)}
                            wrap
                            disabled={!rowEditable}
                            lockedReason={lockReason()}
                            onSave={(v) => save(r, "ghiChu", v || null)}
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
