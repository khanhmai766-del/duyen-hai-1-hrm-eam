"use client";
// TAB "BÌNH CHỮA CHÁY (BCC)" — cùng khuôn bảng với trang Lịch sử sửa chữa:
// thẻ bọc + thanh công cụ (số dòng / tìm kiếm), đầu bảng xanh EVN có sắp xếp, nút "+"
// mở chi tiết dòng, chân bảng đếm bản ghi + phân trang.
//
// Các cột ÍT DÙNG KHI ĐI KIỂM TRA được ẩn khỏi bảng và chỉ hiện trong khối chi tiết:
// Vị trí lắp đặt · Nguồn gốc/NSX · Ghi chú · Ngày kiểm tra (kèm Tổ máy · SL · ĐVT).
// Vẫn sửa được ngay trong khối chi tiết khi đang ở chế độ "Sửa bảng".
//
// Thứ tự cột ở đây là THỨ TỰ HIỂN THỊ, KHÁC thứ tự cột gốc dùng khi xuất Excel.
import { Fragment, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditableCell, ToneSelectCell, fmtDate } from "@/components/pccc/pccc-shared";
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
import {
  BCC_TINH_TRANG_NGOAI_OPTIONS,
  BCC_VI_TRI_HIEN_TAI_OPTIONS,
  apSuatOptions,
  hanThayTheTone,
  tinhTrangOptions,
} from "@/lib/pccc-status";
import { type ExtinguisherRow, type PositionOption } from "@/hooks/usePccc";

/** Số cột của hàng dữ liệu — dùng cho colSpan của hàng chi tiết và hàng rỗng. */
const COL_COUNT = 13;

/**
 * 5 cột đầu ĐÓNG BĂNG khi cuộn ngang: nút chi tiết, mã thiết bị, chủng loại, tình
 * trạng, áp suất — đủ để luôn biết đang xem bình nào và nó đang thế nào.
 * `left` phải cộng dồn ĐÚNG bề rộng các cột trước, nên bề rộng cột khai ở đây thay vì
 * rải rác trong JSX.
 */
const FROZEN = {
  expand: { w: 42, left: 0 },
  ma: { w: 190, left: 42 },
  chungLoai: { w: 110, left: 232 },
  tinhTrang: { w: 150, left: 342 },
  apSuat: { w: 165, left: 492 },
} as const;

export function PcccExtinguishers({
  rows,
  cuongViList,
  giamSatList,
  canManage,
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
  search,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
}: {
  rows: ExtinguisherRow[];
  cuongViList: PositionOption[];
  giamSatList: PositionOption[];
  canManage: boolean;
  loading?: boolean;
  editing: boolean;
  draft: Record<string, Record<string, unknown>>;
  onDraftChange: (rowId: string, field: string, value: unknown, row: ExtinguisherRow) => void;
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
  const cuongViOptions = cuongViList.map((o) => o.label);
  const giamSatOptions = giamSatList.map((o) => o.label);
  const canEdit = canManage && editing;

  // Ghi vào BẢN NHÁP, không gọi API. Lưu 1 lượt khi bấm "Lưu".
  function save(row: ExtinguisherRow, field: string, value: string) {
    onDraftChange(row.id, field, value === "" ? null : value, row);
  }

  return (
    <PcccTableCard
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Mã thiết bị, vị trí, ghi chú…"
      page={page}
      pageCount={pageCount}
      total={total}
      filtered={filtered}
      onPageChange={onPageChange}
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
          <TableRow className={TR_HEAD}>
            <TableHead className={cn(TH_NAVY, TH_EXPAND, STICKY_TH)} style={{ left: FROZEN.expand.left }} />
            <TableHead
              className={cn(TH_NAVY, STICKY_TH)}
              style={{ left: FROZEN.ma.left, width: FROZEN.ma.w, minWidth: FROZEN.ma.w }}
            >
              <SortHeader label="Mã thiết bị" sortKey="ma" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead
              className={cn(TH_NAVY, STICKY_TH)}
              style={{ left: FROZEN.chungLoai.left, width: FROZEN.chungLoai.w, minWidth: FROZEN.chungLoai.w }}
            >
              <SortHeader label="Chủng loại" sortKey="chungLoai" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead
              className={cn(TH_NAVY, STICKY_TH)}
              style={{ left: FROZEN.tinhTrang.left, width: FROZEN.tinhTrang.w, minWidth: FROZEN.tinhTrang.w }}
            >
              <SortHeader label="Tình trạng" sortKey="tinhTrang" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead
              className={cn(TH_NAVY, STICKY_TH, STICKY_EDGE)}
              style={{ left: FROZEN.apSuat.left, width: FROZEN.apSuat.w, minWidth: FROZEN.apSuat.w }}
            >
              <SortHeader label="Áp suất / KL" sortKey="apSuat" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "min-w-[150px]")}>
              <PlainHeader label="Tình trạng ngoài" />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[130px]")}>
              <SortHeader label="Vị trí hiện tại" sortKey="viTriHienTai" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[160px]")}>
              <SortHeader label="Cương vị quản lý" sortKey="cuongVi" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[105px]")}>
              <PlainHeader label="Ngày SX" align="center" />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[85px]")}>
              <PlainHeader label="Số năm SD" align="center" />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[115px]")}>
              <SortHeader label="Đến hạn thay" sortKey="denHanThayThe" sort={sort} onSort={onSort} align="center" />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[115px]")}>
              <PlainHeader label="Thay gần nhất" align="center" />
            </TableHead>
            <TableHead className={cn(TH_NAVY, "w-[130px]")}>
              <SortHeader label="Người kiểm tra" sortKey="nguoiKiemTra" sort={sort} onSort={onSort} />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && !loading && (
            <TableRow>
              <TableCell colSpan={COL_COUNT} className="py-12 text-center text-sm text-muted-foreground">
                Không tìm thấy bản ghi phù hợp.
              </TableCell>
            </TableRow>
          )}
          {rows.map((base) => {
            const rowDraft = draft[base.id];
            // Hiển thị giá trị đang sửa (nếu có) thay cho giá trị đã lưu
            const r = (rowDraft ? { ...base, ...rowDraft } : base) as ExtinguisherRow;
            const dirty = (field: string) => (rowDraft && field in rowDraft ? "bg-amber-100/60" : "");
            const expanded = expandedId === r.id;
            // Nền của các ô đóng băng: phải đục và phải khớp màu hàng, xem STICKY_TD.
            const frozenBg = expanded ? "bg-sky-50" : rowDraft ? "bg-amber-50" : "bg-white";
            return (
              <Fragment key={r.id}>
                <TableRow
                  className={cn(
                    expanded ? "bg-sky-50/70 hover:bg-sky-50/70" : "hover:bg-sky-50/40",
                    rowDraft && "bg-amber-50/50"
                  )}
                >
                  <TableCell className={cn(TD_EXPAND, STICKY_TD, frozenBg)} style={{ left: FROZEN.expand.left }}>
                    <RowExpander expanded={expanded} onToggle={() => setExpandedId(expanded ? null : r.id)} />
                  </TableCell>
                  <TableCell
                    className={cn(TD_ROW, STICKY_TD, frozenBg, "whitespace-nowrap font-medium")}
                    style={{ left: FROZEN.ma.left }}
                  >
                    {r.ma}
                  </TableCell>
                  <TableCell
                    className={cn(TD_ROW, STICKY_TD, frozenBg, "whitespace-nowrap")}
                    style={{ left: FROZEN.chungLoai.left }}
                  >
                    {r.chungLoai}
                  </TableCell>
                  {/* Tình trạng: danh sách bị áp suất ràng buộc — áp suất cảnh báo thì
                      không còn lựa chọn "Khả dụng" (quy tắc của file Excel gốc). */}
                  <TableCell
                    className={cn(TD_ROW, STICKY_TD, frozenBg, dirty("tinhTrang"))}
                    style={{ left: FROZEN.tinhTrang.left }}
                  >
                    <ToneSelectCell
                      value={r.tinhTrang}
                      options={tinhTrangOptions(r.apSuat)}
                      disabled={!canEdit}
                      onChange={(v) => save(r, "tinhTrang", v)}
                    />
                  </TableCell>
                  {/* Áp suất: bình CO2 đo theo khối lượng, MFZ/Foam theo vạch áp */}
                  <TableCell
                    className={cn(TD_ROW, STICKY_TD, STICKY_EDGE, frozenBg, dirty("apSuat"))}
                    style={{ left: FROZEN.apSuat.left }}
                  >
                    <ToneSelectCell
                      value={r.apSuat}
                      options={apSuatOptions(r.chungLoai)}
                      disabled={!canEdit}
                      onChange={(v) => save(r, "apSuat", v)}
                    />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, dirty("tinhTrangNgoai"))}>
                    <EditableCell
                      value={r.tinhTrangNgoai}
                      type="select"
                      options={BCC_TINH_TRANG_NGOAI_OPTIONS as unknown as string[]}
                      disabled={!canEdit}
                      onSave={(v) => save(r, "tinhTrangNgoai", v)}
                    />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, dirty("viTriHienTai"))}>
                    <EditableCell
                      value={r.viTriHienTai}
                      type="select"
                      options={BCC_VI_TRI_HIEN_TAI_OPTIONS as unknown as string[]}
                      disabled={!canEdit}
                      onSave={(v) => save(r, "viTriHienTai", v)}
                    />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap", dirty("cuongVi"))}>
                    <EditableCell
                      value={r.cuongVi}
                      type="select"
                      options={cuongViOptions}
                      disabled={!canEdit}
                      onSave={(v) => save(r, "cuongVi", v)}
                    />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap", dirty("ngaySx"))}>
                    <EditableCell value={r.ngaySx} type="date" disabled={!canEdit} onSave={(v) => save(r, "ngaySx", v)} />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "text-right", dirty("thoiGianSd"))}>
                    <EditableCell
                      value={r.thoiGianSd}
                      type="number"
                      align="right"
                      disabled={!canEdit}
                      onSave={(v) => save(r, "thoiGianSd", v)}
                    />
                  </TableCell>
                  {/* Dẫn xuất từ ngày SX + số năm → không cho sửa tay. Tô đỏ nếu quá hạn,
                      vàng nếu còn dưới 30 ngày (giống bản demo). */}
                  <TableCell
                    className={cn(
                      TD_ROW,
                      "whitespace-nowrap text-center",
                      hanThayTheTone(r.denHanThayThe) === "bad"
                        ? "bg-rose-50 font-semibold text-rose-700"
                        : hanThayTheTone(r.denHanThayThe) === "watch"
                          ? "bg-amber-50 font-medium text-amber-700"
                          : "text-muted-foreground"
                    )}
                  >
                    {fmtDate(r.denHanThayThe)}
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap", dirty("thoiGianThayGanNhat"))}>
                    <EditableCell
                      value={r.thoiGianThayGanNhat}
                      type="date"
                      disabled={!canEdit}
                      onSave={(v) => save(r, "thoiGianThayGanNhat", v)}
                    />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap", dirty("nguoiKiemTra"))}>
                    <EditableCell value={r.nguoiKiemTra} disabled={!canEdit} onSave={(v) => save(r, "nguoiKiemTra", v)} />
                  </TableCell>
                </TableRow>

                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={COL_COUNT} className="bg-slate-50/80 p-0">
                      <DetailPanel>
                        <DetailField label="Vị trí lắp đặt">
                          <EditableCell value={r.viTri} disabled={!canEdit} onSave={(v) => save(r, "viTri", v)} />
                        </DetailField>
                        <DetailField label="Nguồn gốc / NSX">
                          <EditableCell value={r.nguonGoc} disabled={!canEdit} onSave={(v) => save(r, "nguonGoc", v)} />
                        </DetailField>
                        <DetailField label="Cấp giám sát">
                          <EditableCell
                            value={r.nguoiGiamSat}
                            type="select"
                            options={giamSatOptions}
                            disabled={!canEdit}
                            onSave={(v) => save(r, "nguoiGiamSat", v)}
                          />
                        </DetailField>
                        <DetailField label="Ngày kiểm tra">
                          <EditableCell value={r.ngayKiemTra} type="date" disabled={!canEdit} onSave={(v) => save(r, "ngayKiemTra", v)} />
                        </DetailField>
                        <DetailField label="Ghi chú">
                          <EditableCell value={r.ghiChu} disabled={!canEdit} onSave={(v) => save(r, "ghiChu", v)} />
                        </DetailField>
                        {/* Tổ máy và SL/ĐVT KHÔNG hiển thị: SL luôn là "1 Bình", còn tổ
                            máy đã có ô lọc riêng. Hai trường vẫn lưu trong DB và vẫn
                            dùng để lọc + xuất Excel. */}
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
