"use client";
// Khuôn bảng dùng chung cho các bảng PCCC — bám đúng bảng "Lịch sử sửa chữa"
// (components/repair/defect-history-tab.tsx) để hai trang trông như một hệ thống:
// thẻ bọc ngoài, thanh công cụ (số dòng + tìm kiếm), đầu bảng nền xanh EVN có sắp xếp,
// nút "+" mở chi tiết từng dòng, chân bảng đếm bản ghi + phân trang.
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const EVN_HEADER = "#00558F";
export const PCCC_PAGE_SIZES = [25, 50, 75, 100];

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir };

/**
 * Tiêu đề cột có sắp xếp, dùng trên nền xanh đầu bảng.
 * Mặc định CĂN GIỮA cho cả hai bảng PCCC — đặt ở đây thay vì rải `align="center"`
 * khắp các cột để không bỏ sót cột nào khi thêm cột mới.
 */
export function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "center",
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  align?: "left" | "center";
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex w-full items-center gap-1.5 text-[10.5px] font-semibold uppercase leading-tight tracking-wider text-white/90 transition-colors hover:text-white",
        align === "center" && "justify-center"
      )}
    >
      <span className="whitespace-nowrap">{label}</span>
      <Icon className={cn("h-3.5 w-3.5", active ? "text-white" : "text-white/50")} />
    </button>
  );
}

/** Tiêu đề cột không sắp xếp (các cột chỉ để nhập/hiển thị). Cũng căn giữa mặc định. */
export function PlainHeader({ label, align = "center" }: { label: string; align?: "left" | "center" }) {
  return (
    <span
      className={cn(
        "block whitespace-nowrap text-[10.5px] font-semibold uppercase leading-tight tracking-wider text-white/90",
        align === "center" && "text-center"
      )}
    >
      {label}
    </span>
  );
}

/** Nút "+" mở/thu chi tiết dòng — xanh lá khi đóng, xoay 45° màu xanh EVN khi mở. */
export function RowExpander({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-expanded={expanded}
      title={expanded ? "Thu gọn" : "Xem chi tiết"}
      className={cn(
        // Cỡ ăn theo cỡ chữ của bảng (13px) — nút to hơn sẽ đội chiều cao cả hàng.
        "inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-white shadow-sm transition-all duration-200",
        expanded ? "rotate-45 bg-[#00558F]" : "bg-emerald-600 hover:bg-emerald-700"
      )}
    >
      <Plus className="h-2.5 w-2.5" strokeWidth={3} />
    </button>
  );
}

/**
 * Một mục trong khối chi tiết: nhãn và giá trị NẰM CÙNG DÒNG cho gọn, không xếp dọc —
 * xếp dọc làm khối chi tiết cao gấp đôi mà vẫn thừa chỗ trống.
 */
export function DetailField({
  label,
  span,
  children,
}: {
  label: string;
  /** Trường dài thì cho chiếm 2 cột hoặc cả hàng, khỏi bị bóp trong 1 cột. */
  span?: 2 | "full";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-baseline gap-1.5",
        span === 2 && "sm:col-span-2",
        span === "full" && "col-span-full"
      )}
    >
      <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}:
      </span>
      <div className="min-w-0 flex-1 text-[12px] text-ink">{children ?? "—"}</div>
    </div>
  );
}

/** Chip một khiếm khuyết của linh kiện: "NHÓM · trạng thái", tô theo mức nặng nhẹ. */
export function FaultChip({ group, status, tone }: { group: string; status: string; tone: "watch" | "bad" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-tight",
        tone === "bad" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-800"
      )}
    >
      <span className="font-semibold uppercase tracking-wide">{group}</span>
      <span className="text-current/70">·</span>
      <span>{status}</span>
    </span>
  );
}

/**
 * Khối chi tiết của một dòng. Hai điểm quan trọng:
 *  - `sticky left-0`: bảng rộng ~1500px nên nếu để khối này giãn theo bề rộng bảng thì
 *    phải kéo ngang mới đọc hết. Dính vào lề trái để luôn nằm trong tầm nhìn.
 *  - `max-w`: giới hạn bề rộng để chữ không trải dài quá, và các mục xếp 3 cột đủ chặt.
 */
export function DetailPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky left-0 w-[min(100%,1120px)] border-l-[3px] border-[#00558F] bg-slate-50/80 py-2 pl-3 pr-4">
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function Pager({ page, totalPages, onGo }: { page: number; totalPages: number; onGo: (p: number) => void }) {
  const items: Array<number | "gap"> = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) items.push(i);
    else if (Math.abs(i - page) === 2) items.push("gap");
  }
  const btn = "h-8 min-w-8 rounded-lg border border-border px-2 font-mono text-[13px] font-semibold transition-colors";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className={cn(btn, "text-muted-foreground hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40")}
        disabled={page <= 1}
        onClick={() => onGo(page - 1)}
        aria-label="Trang trước"
      >
        <ChevronLeft className="mx-auto h-4 w-4" />
      </button>
      {items.map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === page}
            onClick={() => onGo(item)}
            className={cn(
              btn,
              item === page ? "border-[#00558F] bg-[#00558F] text-white" : "text-muted-foreground hover:border-accent hover:text-accent"
            )}
          >
            {item}
          </button>
        )
      )}
      <button
        type="button"
        className={cn(btn, "text-muted-foreground hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40")}
        disabled={page >= totalPages}
        onClick={() => onGo(page + 1)}
        aria-label="Trang sau"
      >
        <ChevronRight className="mx-auto h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Thẻ bọc một bảng PCCC: thanh công cụ trên, bảng ở giữa (tự cuộn ngang), chân bảng
 * đếm bản ghi + phân trang. Phân trang/tìm kiếm/sắp xếp đều chạy Ở SERVER (bảng có
 * hàng nghìn dòng, không tải hết về client như bảng lịch sử sửa chữa).
 */
export function PcccTableCard({
  pageSize,
  onPageSizeChange,
  search,
  onSearchChange,
  searchPlaceholder = "Tìm mã, vị trí, ghi chú…",
  page,
  pageCount,
  total,
  filtered,
  onPageChange,
  toolbarExtra,
  footerNote,
  children,
}: {
  pageSize: number;
  onPageSizeChange: (n: number) => void;
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  page: number;
  pageCount: number;
  total: number;
  /** true khi đang có bộ lọc/tìm kiếm — để ghi thêm "sau lọc" ở chân bảng. */
  filtered?: boolean;
  onPageChange: (p: number) => void;
  toolbarExtra?: React.ReactNode;
  footerNote?: React.ReactNode;
  children: React.ReactNode;
}) {
  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, total);

  return (
    <Card className="overflow-hidden">
      {/* Thanh công cụ: số dòng bên trái, tìm kiếm bên phải */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/25 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Hiển thị</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-lg border border-input bg-white px-2 text-sm font-medium text-ink"
            aria-label="Số dòng mỗi trang"
          >
            {PCCC_PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span>dòng</span>
          {toolbarExtra}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Tìm kiếm:</span>
          <div className="relative w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 rounded-xl pl-9"
            />
          </div>
        </div>
      </div>

      {/* KHÔNG bọc thêm div cuộn ở đây: <Table> đã tự bọc một div overflow-auto. Hai
          vùng cuộn lồng nhau làm sticky mất tác dụng (đầu bảng/cột đóng băng bám vào
          vùng trong, còn vùng ngoài mới là cái đang cuộn). Bảng tự truyền
          wrapperClassName để đặt chiều cao tối đa. */}
      {children}

      <div className="flex flex-col gap-3 border-t border-border bg-muted/25 px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div>
          {total === 0 ? (
            "Không có bản ghi nào"
          ) : (
            <>
              Hiển thị <b className="font-mono text-ink">{firstShown}</b>–<b className="font-mono text-ink">{lastShown}</b> trong tổng số{" "}
              <b className="font-mono text-ink">{total}</b> bản ghi
              {filtered && <span> sau lọc</span>}
            </>
          )}
          {footerNote && <span className="ml-2">{footerNote}</span>}
        </div>
        <Pager page={page} totalPages={Math.max(1, pageCount)} onGo={onPageChange} />
      </div>
    </Card>
  );
}

/** Lớp dùng cho mọi ô <th> nền xanh EVN, có vạch phân cách trắng mờ. */
export const TH_NAVY = "sticky top-0 z-10 bg-[#00558F] px-2 py-2.5 align-middle";

/** Vùng cuộn của bảng — dùng cho `wrapperClassName` của <Table>. */
export const TABLE_SCROLLER = "max-h-[calc(100vh-330px)] overflow-auto";

/**
 * Cột ĐÓNG BĂNG khi cuộn ngang. Ô tiêu đề vừa dính trên vừa dính trái nên phải nằm
 * trên cùng (z cao hơn), ô dữ liệu chỉ dính trái.
 *
 * Ô đóng băng BẮT BUỘC có nền đục, nếu để trong suốt thì các cột phía sau trượt qua
 * bên dưới sẽ hiện xuyên qua. Vì vậy màu nền của hàng (đang mở chi tiết / đang sửa)
 * phải được truyền vào từng ô đóng băng, không thừa hưởng từ <tr>.
 */
export const STICKY_TH = "sticky z-20";
/**
 * Ô đóng băng. `group-hover` là BẮT BUỘC: hover đổi màu trên <tr> KHÔNG lan tới các ô
 * này (nền của chúng là màu đục vẽ đè lên), thiếu nó thì vệt sáng khi trỏ chuột bị đứt
 * đúng ở ranh giới vùng cột cố định.
 */
export const STICKY_TD = "sticky z-[1] group-hover:bg-sky-50";
/** Vạch phân cách ở cột đóng băng cuối, cho thấy rõ ranh giới vùng đóng băng. */
export const STICKY_EDGE = "shadow-[inset_-1px_0_0_rgba(15,23,42,0.12)]";

/**
 * Màu nền của một hàng dữ liệu. Kẻ vạch XEN KẼ trắng / xám nhạt cho dễ dò theo hàng,
 * nhưng phải theo đúng thứ tự ưu tiên: dòng đang sửa (vàng) > dòng đang mở chi tiết
 * (xanh) > vạch xen kẽ.
 *
 * PHẢI dùng đúng giá trị này cho CẢ các ô đóng băng: nền ô đóng băng không thừa hưởng
 * từ <tr>, để lệch là nhìn thấy ngay một vệt màu khác ở vùng cột cố định.
 */
export function rowBackground({ index, expanded, dirty }: { index: number; expanded?: boolean; dirty?: boolean }) {
  if (dirty) return "bg-amber-50";
  if (expanded) return "bg-sky-50";
  return index % 2 === 1 ? "bg-slate-50/70" : "bg-white";
}

/** Màu khi trỏ chuột — đủ khác cả hai màu vạch để thấy rõ đang ở hàng nào.
 *  `group` để các ô đóng băng bắt được hover của hàng (xem STICKY_TD). */
export const ROW_HOVER = "group transition-colors hover:bg-sky-50";
export const TR_HEAD = "border-0 hover:bg-transparent [&>th]:border-r [&>th]:border-white/20 [&>th:last-child]:border-r-0";
// Ô dữ liệu: chốt cỡ chữ 12px. Không chốt thì các ô text thuần (mã thiết bị, chủng
// loại…) thừa hưởng text-sm = 14px của <table>, to hơn các ô sửa được → so le.
export const TD_ROW = "border-b border-slate-100 px-2 py-1 align-middle text-[12px]";

/**
 * Cột nút "+" mở chi tiết. PHẢI chốt bề rộng: bảng rộng hơn khung nhìn nên trình duyệt
 * co các cột lại, cột này không có chữ sẽ co về đúng bề rộng cái nút (18px) và trông
 * như nằm lọt ra ngoài bảng.
 */
export const TH_EXPAND = "w-[42px] min-w-[42px] max-w-[42px] px-0 text-center";
export const TD_EXPAND = "w-[42px] min-w-[42px] max-w-[42px] border-b border-slate-100 px-0 py-1 text-center align-middle text-[12px]";
