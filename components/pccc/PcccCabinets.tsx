"use client";
// TAB "TỦ CHỮA CHÁY (TCC)" — cùng khuôn bảng với trang Lịch sử sửa chữa (thẻ bọc,
// thanh công cụ, đầu bảng xanh EVN, nút "+" mở chi tiết, chân bảng phân trang).
//
// Header 2 tầng: nhóm linh kiện × trạng thái, như bảng gốc. Một nhóm ĐƯỢC PHÉP tích
// nhiều trạng thái cùng lúc; chỉ "Khả dụng" và "Bất khả dụng" loại trừ nhau (server
// tự bỏ tích ô đối lập — lib/pccc-status.ts).
//
// Các cột ít dùng khi đi kiểm tra được ẩn khỏi bảng, chỉ hiện trong khối chi tiết:
// Vị trí lắp đặt · Ghi chú · Ngày kiểm tra (kèm Tổ máy · SL/ĐVT · chữ ký).
import { Fragment, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EditableCell,
  StatusBadge,
  TickCell,
  componentTone,
  fmtDate,
} from "@/components/pccc/pccc-shared";
import {
  DetailField,
  DetailPanel,
  STICKY_EDGE,
  STICKY_TD,
  STICKY_TH,
  TABLE_SCROLLER,
  PcccTableCard,
  PlainHeader,
  RowExpander,
  SortHeader,
  TD_EXPAND,
  TD_ROW,
  TH_EXPAND,
  TH_NAVY,
  TR_HEAD,
  type SortState,
} from "@/components/pccc/pccc-table-card";
import { type CabinetRow, type PositionOption } from "@/hooks/usePccc";

export function PcccCabinets({
  rows,
  groups,
  cuongViList,
  canManage,
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
  search,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
}: {
  rows: CabinetRow[];
  groups: { label: string; statuses: string[] }[];
  cuongViList: PositionOption[];
  canManage: boolean;
  loading?: boolean;
  /** Bảng chỉ mở khoá khi bấm "Sửa bảng" — giống tab Bình chữa cháy. */
  editing: boolean;
  /**
   * Sửa đổi chưa lưu. Ô ☑ được lưu trong cùng bản nháp với khoá dạng
   * `comp:<nhóm>|<trạng thái>` để một dòng gom được cả trường thường lẫn nhiều ô tích.
   */
  draft: Record<string, Record<string, unknown>>;
  onDraftChange: (rowId: string, field: string, value: unknown) => void;
  onToggleComponent: (row: CabinetRow, groupLabel: string, status: string, nextChecked: boolean) => void;
  sort: SortState;
  onSort: (key: string) => void;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  filtered?: boolean;
  search: string;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  onSearchChange: (v: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Đầu bảng 2 TẦNG: tầng 2 (OK/!/✕) phải dính ngay DƯỚI tầng 1, nên `top` của nó bằng
  // chiều cao THỰC TẾ của tầng 1. Đóng cứng một con số là sớm muộn cũng lệch (đổi cỡ
  // chữ, thu phóng, tên nhóm dài xuống 2 dòng) — lệch thì tầng 2 chồm lên và để lọt
  // một vạch nội dung hàng phía trên nó.
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

  // Chỉ đóng băng nút chi tiết + MÃ THIẾT BỊ khi cuộn ngang. Tên/Loại tủ dài (~260px)
  // nên nếu đóng băng luôn thì vùng cố định chiếm gần một phần ba màn hình, còn ít chỗ
  // cho khối ô ☑ — mã thiết bị là đủ để biết đang xem tủ nào.
  const FROZEN = {
    expand: { w: 42, left: 0 },
    ma: { w: 230, left: 42 },
  } as const;

  const componentCols = groups.reduce((n, g) => n + g.statuses.length, 0);
  // + | Mã | Cương vị | Tình trạng | <ô linh kiện> | Số YCSC | Người kiểm tra
  const colCount = 4 + componentCols + 2;

  /** Ghi vào BẢN NHÁP, không gọi API. Lưu một lượt khi bấm "Lưu". */
  function save(row: CabinetRow, field: string, value: unknown) {
    onDraftChange(row.id, field, value);
  }

  return (
    <PcccTableCard
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Mã thiết bị, tên tủ, vị trí…"
      page={page}
      pageCount={pageCount}
      total={total}
      filtered={filtered}
      onPageChange={onPageChange}
      toolbarExtra={
        <span className="ml-2 flex flex-wrap items-center gap-x-3 text-[11px]">
          <span>
            <b className="text-emerald-700">OK</b> = khả dụng
          </span>
          <span>
            <b className="text-amber-700">!</b> = lỗi nhẹ
          </span>
          <span>
            <b className="text-rose-700">✕</b> = hư hỏng nặng
          </span>
        </span>
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
      <Table className="min-w-[1500px]" wrapperClassName={TABLE_SCROLLER}>
        <TableHeader>
          <TableRow ref={headRowRef} className={TR_HEAD}>
            <TableHead rowSpan={2} className={cn(TH_NAVY, TH_EXPAND, STICKY_TH)} style={{ left: FROZEN.expand.left }} />
            <TableHead
              rowSpan={2}
              className={cn(TH_NAVY, STICKY_TH, STICKY_EDGE)}
              style={{ left: FROZEN.ma.left, width: FROZEN.ma.w, minWidth: FROZEN.ma.w }}
            >
              <SortHeader label="Mã thiết bị" sortKey="ma" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[160px]")}>
              <SortHeader label="Cương vị quản lý" sortKey="cuongVi" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[135px]")}>
              <SortHeader label="Tình trạng" sortKey="tinhTrangTongThe" sort={sort} onSort={onSort} />
            </TableHead>
            {groups.map((g) => (
              <TableHead
                key={g.label}
                colSpan={g.statuses.length}
                className={cn(TH_NAVY, "text-center")}
                title={g.statuses.join(" · ")}
              >
                <PlainHeader label={g.label} align="center" />
              </TableHead>
            ))}
            <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[100px]")}>
              <SortHeader label="Số YCSC" sortKey="soYcsc" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead rowSpan={2} className={cn(TH_NAVY, "w-[130px]")}>
              <SortHeader label="Người kiểm tra" sortKey="nguoiKiemTra" sort={sort} onSort={onSort} />
            </TableHead>
          </TableRow>
          <TableRow className={TR_HEAD}>
            {groups.flatMap((g) =>
              g.statuses.map((st, i) => (
                <TableHead
                  key={`${g.label}-${st}`}
                  title={st}
                  className={cn(TH_NAVY, "w-8 text-center")}
                  style={{ top: tier1Height }}
                >
                  {/* Cột đầu = khả dụng, cột cuối = nặng nhất → ký hiệu ngắn cho gọn */}
                  <span className="text-[10px] font-semibold text-white/80">
                    {i === 0 ? "OK" : i === g.statuses.length - 1 ? "✕" : "!"}
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
          {rows.map((r) => {
            const expanded = expandedId === r.id;
            const rowDraft = draft[r.id];
            const dirty = (field: string) => (rowDraft && field in rowDraft ? "bg-amber-100/60" : "");
            /** Giá trị đang sửa (nếu có) thay cho giá trị đã lưu. */
            const val = <T,>(field: string, saved: T) => (rowDraft && field in rowDraft ? (rowDraft[field] as T) : saved);
            /** Ô ☑ hiệu lực: lấy từ bản nháp nếu người dùng vừa bấm. */
            const tick = (groupLabel: string, status: string) => {
              const key = `comp:${groupLabel}|${status}`;
              if (rowDraft && key in rowDraft) return Boolean(rowDraft[key]);
              return r.components.find((c) => c.groupLabel === groupLabel && c.status === status)?.checked ?? false;
            };
            const frozenBg = expanded ? "bg-sky-50" : rowDraft ? "bg-amber-50" : "bg-white";
            return (
              <Fragment key={r.id}>
                <TableRow className={expanded ? "bg-sky-50/70 hover:bg-sky-50/70" : "hover:bg-sky-50/40"}>
                  <TableCell className={cn(TD_EXPAND, STICKY_TD, frozenBg)} style={{ left: FROZEN.expand.left }}>
                    <RowExpander expanded={expanded} onToggle={() => setExpandedId(expanded ? null : r.id)} />
                  </TableCell>
                  <TableCell
                    className={cn(TD_ROW, STICKY_TD, STICKY_EDGE, frozenBg, "whitespace-nowrap font-medium")}
                    style={{ left: FROZEN.ma.left }}
                  >
                    {r.ma}
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap", dirty("cuongVi"))}>
                    <EditableCell
                      value={val("cuongVi", r.cuongVi)}
                      type="select"
                      options={cuongViOptions}
                      disabled={!canEdit}
                      onSave={(v) => save(r, "cuongVi", v || null)}
                    />
                  </TableCell>
                  {/* Dẫn xuất từ các ô ☑ → chỉ đọc. Đang sửa thì server tính lại lúc lưu. */}
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap")}>
                    <StatusBadge status={r.tinhTrangTongThe} />
                  </TableCell>

                  {groups.flatMap((g) =>
                    g.statuses.map((status, i) => {
                      const checked = tick(g.label, status);
                      return (
                        <TableCell
                          key={`${r.id}-${g.label}-${status}`}
                          className={cn(
                            TD_ROW,
                            "text-center",
                            i === 0 && "border-l border-slate-200",
                            dirty(`comp:${g.label}|${status}`)
                          )}
                          title={`${g.label} — ${status}`}
                        >
                          <TickCell
                            checked={checked}
                            tone={componentTone(i, g.statuses.length)}
                            disabled={!canEdit}
                            onToggle={() => onToggleComponent(r, g.label, status, !checked)}
                          />
                        </TableCell>
                      );
                    })
                  )}

                  <TableCell className={cn(TD_ROW, "border-l border-slate-200", dirty("soYcsc"))}>
                    <EditableCell value={val("soYcsc", r.soYcsc)} disabled={!canEdit} onSave={(v) => save(r, "soYcsc", v || null)} />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap", dirty("nguoiKiemTra"))}>
                    <EditableCell
                      value={val("nguoiKiemTra", r.nguoiKiemTra)}
                      disabled={!canEdit}
                      onSave={(v) => save(r, "nguoiKiemTra", v || null)}
                    />
                  </TableCell>
                </TableRow>

                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={colCount} className="bg-slate-50/80 p-0">
                      <DetailPanel>
                        <DetailField label="Tên / Loại tủ">
                          <EditableCell value={val("ten", r.ten)} disabled={!canEdit} onSave={(v) => save(r, "ten", v || null)} />
                        </DetailField>
                        <DetailField label="Vị trí lắp đặt">
                          <EditableCell value={val("viTri", r.viTri)} disabled={!canEdit} onSave={(v) => save(r, "viTri", v || null)} />
                        </DetailField>
                        <DetailField label="Ngày kiểm tra">
                          <EditableCell
                            value={val("ngayKiemTra", r.ngayKiemTra)}
                            type="date"
                            disabled={!canEdit}
                            onSave={(v) => save(r, "ngayKiemTra", v || null)}
                          />
                        </DetailField>
                        <DetailField label="Ghi chú">
                          <EditableCell value={val("ghiChu", r.ghiChu)} disabled={!canEdit} onSave={(v) => save(r, "ghiChu", v || null)} />
                        </DetailField>
                        {/* Tổ máy và SL/ĐVT KHÔNG hiển thị — xem ghi chú cùng chỗ ở tab
                            Bình chữa cháy. Dữ liệu vẫn còn trong DB. */}
                        <DetailField label="Chi tiết linh kiện đang lỗi">
                          {r.components.filter((c) => c.checked && c.statusOrder > 0).length === 0
                            ? "Không có"
                            : r.components
                                .filter((c) => c.checked && c.statusOrder > 0)
                                .map((c) => `${c.groupLabel}: ${c.status}`)
                                .join(" · ")}
                        </DetailField>
                        {/* Chỉ đọc — sẽ làm lại theo hướng chọn nhiều dòng rồi ký một
                            lượt, giống tab Bình chữa cháy. API ký vẫn còn nguyên. */}
                        <DetailField label="Chữ ký">
                          {r.signature ? `${r.signature.signerName} · ${fmtDate(r.signature.signedAt)}` : "Chưa ký"}
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
