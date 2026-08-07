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
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EditableCell,
  MachineCell,
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
import { usePcccSign, usePcccUpdate, type CabinetRow, type PositionOption } from "@/hooks/usePccc";

export function PcccCabinets({
  rows,
  groups,
  cuongViList,
  canManage,
  loading,
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
  const update = usePcccUpdate("CABINET");
  const sign = usePcccSign();

  // 4 cột đầu đóng băng khi cuộn ngang — khối ô ☑ rất rộng, không đóng băng thì cuộn
  // sang giữa là không còn biết đang xem tủ nào.
  const FROZEN = {
    expand: { w: 42, left: 0 },
    stt: { w: 60, left: 42 },
    ma: { w: 230, left: 102 },
    ten: { w: 260, left: 332 },
  } as const;

  const componentCols = groups.reduce((n, g) => n + g.statuses.length, 0);
  // + | STT | Mã | Tên | Cương vị | Tình trạng | <ô linh kiện> | Số YCSC | Người kiểm tra
  const colCount = 6 + componentCols + 2;

  function save(row: CabinetRow, patch: Record<string, unknown>, label: string) {
    update.mutate(
      { id: row.id, patch },
      {
        onSuccess: (res) => toast.success(res?.signatureCleared ? `${label} — chữ ký đã bị xoá, cần ký lại` : label),
        onError: (e: Error) => toast.error(e.message),
      }
    );
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
        loading || update.isPending ? (
          <span className="inline-flex items-center gap-1.5 text-[12px]">
            <Loader2 className="size-3 animate-spin" /> Đang đồng bộ…
          </span>
        ) : null
      }
    >
      <Table className="min-w-[1500px]" wrapperClassName={TABLE_SCROLLER}>
        <TableHeader>
          <TableRow className={TR_HEAD}>
            <TableHead rowSpan={2} className={cn(TH_NAVY, TH_EXPAND, STICKY_TH)} style={{ left: FROZEN.expand.left }} />
            <TableHead
              rowSpan={2}
              className={cn(TH_NAVY, STICKY_TH)}
              style={{ left: FROZEN.stt.left, width: FROZEN.stt.w, minWidth: FROZEN.stt.w }}
            >
              <SortHeader label="STT" sortKey="stt" sort={sort} onSort={onSort} align="center" />
            </TableHead>
            <TableHead
              rowSpan={2}
              className={cn(TH_NAVY, STICKY_TH)}
              style={{ left: FROZEN.ma.left, width: FROZEN.ma.w, minWidth: FROZEN.ma.w }}
            >
              <SortHeader label="Mã thiết bị" sortKey="ma" sort={sort} onSort={onSort} />
            </TableHead>
            <TableHead
              rowSpan={2}
              className={cn(TH_NAVY, STICKY_TH, STICKY_EDGE)}
              style={{ left: FROZEN.ten.left, width: FROZEN.ten.w, minWidth: FROZEN.ten.w }}
            >
              <SortHeader label="Tên / Loại tủ" sortKey="ten" sort={sort} onSort={onSort} />
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
                <TableHead key={`${g.label}-${st}`} title={st} className={cn(TH_NAVY, "top-[41px] w-8 text-center")}>
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
            const frozenBg = expanded ? "bg-sky-50" : "bg-white";
            return (
              <Fragment key={r.id}>
                <TableRow className={expanded ? "bg-sky-50/70 hover:bg-sky-50/70" : "hover:bg-sky-50/40"}>
                  <TableCell className={cn(TD_EXPAND, STICKY_TD, frozenBg)} style={{ left: FROZEN.expand.left }}>
                    <RowExpander expanded={expanded} onToggle={() => setExpandedId(expanded ? null : r.id)} />
                  </TableCell>
                  <TableCell
                    className={cn(TD_ROW, STICKY_TD, frozenBg, "text-center tabular-nums text-muted-foreground")}
                    style={{ left: FROZEN.stt.left }}
                  >
                    {r.stt ?? ""}
                  </TableCell>
                  <TableCell
                    className={cn(TD_ROW, STICKY_TD, frozenBg, "whitespace-nowrap font-medium")}
                    style={{ left: FROZEN.ma.left }}
                  >
                    {r.ma}
                  </TableCell>
                  <TableCell className={cn(TD_ROW, STICKY_TD, STICKY_EDGE, frozenBg)} style={{ left: FROZEN.ten.left }}>
                    <EditableCell value={r.ten} disabled={!canManage} onSave={(v) => save(r, { ten: v }, `Đã lưu ${r.ma}`)} />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap")}>
                    <EditableCell
                      value={r.cuongVi}
                      type="select"
                      options={cuongViOptions}
                      disabled={!canManage}
                      onSave={(v) => save(r, { cuongVi: v }, `Đã lưu ${r.ma}`)}
                    />
                  </TableCell>
                  {/* Dẫn xuất từ các ô ☑ → chỉ đọc */}
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap")}>
                    <StatusBadge status={r.tinhTrangTongThe} />
                  </TableCell>

                  {groups.flatMap((g) =>
                    g.statuses.map((status, i) => {
                      const comp = r.components.find((c) => c.groupLabel === g.label && c.status === status);
                      return (
                        <TableCell
                          key={`${r.id}-${g.label}-${status}`}
                          className={cn(TD_ROW, "text-center", i === 0 && "border-l border-slate-200")}
                          title={`${g.label} — ${status}`}
                        >
                          <TickCell
                            checked={comp?.checked ?? false}
                            tone={componentTone(i, g.statuses.length)}
                            disabled={!canManage || update.isPending}
                            onToggle={() =>
                              save(
                                r,
                                { components: [{ groupLabel: g.label, status, checked: !(comp?.checked ?? false) }] },
                                `${r.ma}: ${g.label} — ${status}`
                              )
                            }
                          />
                        </TableCell>
                      );
                    })
                  )}

                  <TableCell className={cn(TD_ROW, "border-l border-slate-200")}>
                    <EditableCell value={r.soYcsc} disabled={!canManage} onSave={(v) => save(r, { soYcsc: v }, `Đã lưu ${r.ma}`)} />
                  </TableCell>
                  <TableCell className={cn(TD_ROW, "whitespace-nowrap")}>
                    <EditableCell
                      value={r.nguoiKiemTra}
                      disabled={!canManage}
                      onSave={(v) => save(r, { nguoiKiemTra: v }, `Đã lưu ${r.ma}`)}
                    />
                  </TableCell>
                </TableRow>

                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={colCount} className="bg-slate-50/80 p-0">
                      <DetailPanel>
                        <DetailField label="Vị trí lắp đặt">
                          <EditableCell value={r.viTri} disabled={!canManage} onSave={(v) => save(r, { viTri: v }, `Đã lưu ${r.ma}`)} />
                        </DetailField>
                        <DetailField label="Ngày kiểm tra">
                          <EditableCell
                            value={r.ngayKiemTra}
                            type="date"
                            disabled={!canManage}
                            onSave={(v) => save(r, { ngayKiemTra: v }, `Đã lưu ${r.ma}`)}
                          />
                        </DetailField>
                        <DetailField label="Ghi chú">
                          <EditableCell value={r.ghiChu} disabled={!canManage} onSave={(v) => save(r, { ghiChu: v }, `Đã lưu ${r.ma}`)} />
                        </DetailField>
                        <DetailField label="Tổ máy">
                          <MachineCell
                            value={r.machine}
                            disabled={!canManage}
                            onSave={(v) => save(r, { machine: v }, `Đã lưu ${r.ma}`)}
                          />
                        </DetailField>
                        <DetailField label="Số lượng / ĐVT">
                          {r.sl ?? "—"} {r.dvt ?? ""}
                        </DetailField>
                        <DetailField label="Chi tiết linh kiện đang lỗi">
                          {r.components.filter((c) => c.checked && c.statusOrder > 0).length === 0
                            ? "Không có"
                            : r.components
                                .filter((c) => c.checked && c.statusOrder > 0)
                                .map((c) => `${c.groupLabel}: ${c.status}`)
                                .join(" · ")}
                        </DetailField>
                        <DetailField label="Chữ ký">
                          {r.signature ? (
                            <button
                              type="button"
                              disabled={!canManage || sign.isPending}
                              onClick={() =>
                                sign.mutate(
                                  { targetType: "CABINET", targetId: r.id, remove: true },
                                  { onError: (e: Error) => toast.error(e.message) }
                                )
                              }
                              className="text-emerald-700 underline decoration-dotted"
                            >
                              {r.signature.signerName} · {fmtDate(r.signature.signedAt)}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!canManage || sign.isPending}
                              onClick={() =>
                                sign.mutate(
                                  { targetType: "CABINET", targetId: r.id },
                                  { onError: (e: Error) => toast.error(e.message) }
                                )
                              }
                              className="text-accent underline decoration-dotted"
                            >
                              Ký xác nhận
                            </button>
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
