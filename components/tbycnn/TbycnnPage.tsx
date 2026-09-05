"use client";
// =====================================================================
// TRANG "THIẾT BỊ YÊU CẦU NGHIÊM NGẶT VỀ ATLĐ" (TBYCNN) — Phân xưởng Vận hành 1
//
// Thay cho ứng dụng rời QuanLyThietBi_project (1 file HTML + localStorage): Postgres
// là nguồn sự thật duy nhất, có phân quyền và nhật ký truy vết, xuất Excel ở server.
//
// Bảng dùng CHUNG khuôn với module PCCC (`PcccTableCard`): thanh công cụ số dòng +
// tìm kiếm, đầu bảng xanh EVN có sắp xếp, nút "+" mở chi tiết từng dòng, chân bảng
// đếm bản ghi + phân trang. Nhờ khối chi tiết mà bảng chỉ còn 11 cột thay vì 17 —
// thông tin chính đọc được ngay, không phải kéo ngang.
//
// Khác bản cũ: BỎ dòng tiêu đề gộp theo danh mục. Có phân trang và sắp xếp thì dòng
// gộp không còn đúng nữa (mỗi trang cắt ngang một nhóm); danh mục thành MỘT CỘT
// sắp xếp/lọc được, tra cứu nhanh hơn hẳn cách cuộn tìm khối.
// =====================================================================
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Filter,
  Loader2,
  Download,
  Pencil,
  PenLine,
  Save,
  ShieldAlert,
  Wrench,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DetailField,
  DetailPanel,
  PCCC_PAGE_SIZES,
  PcccTableCard,
  ROW_HOVER,
  RowExpander,
  SortHeader,
  TABLE_SCROLLER,
  TD_EXPAND,
  TD_ROW,
  TH_EXPAND,
  TH_NAVY,
  TR_HEAD,
  type SortState,
} from "@/components/pccc/pccc-table-card";
import { normalizeText } from "@/lib/nav";
// Cùng danh mục tổ máy với PCCC — S1 | S2 | COMMON, nhãn hiển thị lấy từ một nguồn.
import { MACHINE_LABEL, PCCC_MACHINES } from "@/lib/pccc-position";
import { cn } from "@/lib/utils";
import {
  displayKdDate,
  formatVNDate,
  kdMatch,
  kdStatus,
  statusMatch,
  TBYCNN_KD_FILTERS,
  TBYCNN_KD_LABEL,
  TBYCNN_STATUS_FILTERS,
} from "@/lib/tbycnn";
import { EditableCell } from "@/components/pccc/pccc-shared";
import {
  downloadTbycnnExcel,
  downloadTbycnnPdf,
  fetchTbycnnPdfPreview,
  useSaveTbycnnBulk,
  useTbycnn,
  useTbycnnSign,
  useTbycnnSignPreview,
  type TbycnnEquipment,
  type TbycnnSignPreview,
} from "@/hooks/useTbycnn";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TbycnnSignDialog } from "@/components/tbycnn/TbycnnSignDialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const ALL = "__all__";
const COL_COUNT = 11;

/*
 * Hàng CAO HƠN một nhịp so với `TD_ROW` gốc.
 *
 * `TD_ROW` (py-1) được đặt cho bảng PCCC, nơi gần như ô nào cũng chứa `EditableCell` hay
 * badge — mấy thứ đó tự có đệm riêng nên hàng ở đó cao ~41px. Bảng này phần lớn là chữ
 * trần nên cùng một lớp lại ra hàng ~31px, nhìn chật và khó dò theo hàng. Bù lại bằng
 * đệm dọc ngay tại đây thay vì sửa `TD_ROW` dùng chung, kẻo bảng PCCC bị đội theo.
 */
const TD_TALL = cn(TD_ROW, "py-2.5");
const TD_EXPAND_TALL = cn(TD_EXPAND, "py-2.5");

/** Thứ tự gốc của hồ sơ nhà máy (cương vị → số La Mã → STT) — không phải một cột. */
const SOURCE_ORDER = "__source__";
const DEFAULT_SORT: SortState = { key: SOURCE_ORDER, dir: "asc" };

/**
 * Thẻ KPI bấm được: bấm là đặt luôn bộ lọc ra đúng tập dòng mà con số đang đếm.
 *
 * Bọc `StatCard` trong <button> thay vì thêm `onClick` vào chính nó: `StatCard` dùng
 * chung cho nhiều trang, đa số chỗ thẻ chỉ để đọc — thêm hành vi bấm vào bản dùng chung
 * là bắt mọi trang khác gánh theo.
 */
function KpiCard({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group/kpi block w-full rounded-xl text-left transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
        // Thẻ đang được dùng làm bộ lọc: viền đậm để biết bảng bên dưới đang cắt theo thẻ nào.
        active && "ring-2 ring-accent ring-offset-2"
      )}
    >
      {children}
    </button>
  );
}

function StatusBadge({ value }: { value: string }) {
  if (!value) return <span className="text-[11px] text-muted-foreground">Chưa cập nhật</span>;
  if (value === "Khả dụng") {
    return <Badge className="border-transparent bg-emerald-100 text-emerald-800">Khả dụng</Badge>;
  }
  if (value === "Không khả dụng") {
    return <Badge className="border-transparent bg-red-100 text-red-800">Không khả dụng</Badge>;
  }
  // Dòng hỗn hợp "3 khả dụng, 2 không khả dụng" → tách thành hai nhãn cạnh nhau.
  const m = value.match(/^(\d+)\s*khả dụng,\s*(\d+)\s*không khả dụng$/);
  if (m) {
    return (
      <span className="flex flex-wrap justify-center gap-1">
        <Badge className="border-transparent bg-emerald-100 text-emerald-800">{m[1]} tốt</Badge>
        <Badge className="border-transparent bg-red-100 text-red-800">{m[2]} hỏng</Badge>
      </span>
    );
  }
  return <Badge className="border-transparent bg-amber-100 text-amber-800">{value}</Badge>;
}

/**
 * Dấu chữ ký của một dòng: ảnh chữ ký số + họ tên + ngày ký. Ảnh lấy từ bản ĐÃ CHỐT lúc
 * ký, nên người ký đổi chữ ký trong hồ sơ về sau không làm sai bản ký cũ.
 */
function SignatureStamp({ signature }: { signature: TbycnnEquipment["signature"] }) {
  if (!signature) return <span className="text-[11px] text-muted-foreground">Chưa ký</span>;
  return (
    <span className="flex flex-col items-start gap-0.5 leading-tight">
      {signature.signatureUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signature.signatureUrl} alt="Chữ ký" className="h-9 max-w-[160px] object-contain" />
      )}
      <span className="text-[12px] font-medium text-ink">
        {signature.signerName}
        {signature.signerPosition ? ` · ${signature.signerPosition}` : ""}
      </span>
      <span className="text-[11px] text-muted-foreground">Ký ngày {formatVNDate(signature.signedAt)}</span>
    </span>
  );
}

/** Tổ máy: S1 / S2 tô nhạt để phân biệt nhanh, dùng chung thì để mờ. */
function MachineBadge({ machine }: { machine: string }) {
  if (machine === "COMMON") return <span className="text-[11px] text-muted-foreground">Common</span>;
  return (
    <Badge
      className={cn(
        "border-transparent font-mono",
        machine === "S1" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"
      )}
    >
      {machine}
    </Badge>
  );
}

/** Hạn kiểm định: đỏ khi quá hạn, hổ phách khi dưới 3 tháng. */
function KdCell({ row }: { row: TbycnnEquipment }) {
  const text = displayKdDate(row.kdTiepTheo, row.kdTiepTheoText);
  const status = kdStatus(row.kdTiepTheo);
  if (!text) return <span className="text-muted-foreground">—</span>;
  // Không parse được thành ngày ("Chưa dán tem", "06/26") → hiện mờ, không tô cảnh báo.
  if (!status) return <span className="text-muted-foreground">{text}</span>;
  const tone =
    status.type === "overdue"
      ? "font-semibold text-red-700"
      : status.type === "soon"
        ? "font-semibold text-amber-700"
        : "text-ink";
  return (
    <span className={tone} title={status.type === "overdue" ? `Quá hạn ${status.days} ngày` : `Còn ${status.days} ngày`}>
      {text}
    </span>
  );
}

/** Giá trị dùng để so khớp khi sắp xếp. Ô trống trả null để dồn xuống cuối. */
function sortValue(row: TbycnnEquipment, key: string): string | number | null {
  switch (key) {
    case "kdGanNhat":
      return row.kdGanNhat ? Date.parse(row.kdGanNhat) : null;
    case "kdTiepTheo":
      return row.kdTiepTheo ? Date.parse(row.kdTiepTheo) : null;
    case "soLuong":
      return row.soLuong;
    case "chuKyThu":
      return row.chuKyThu;
    default: {
      const value = (row as unknown as Record<string, unknown>)[key];
      return value == null || value === "" ? null : String(value);
    }
  }
}

export default function TbycnnPage() {
  const { data, isLoading, error } = useTbycnn();
  const [search, setSearch] = useState("");
  // Lọc cương vị theo MÃ chức danh (PositionCode), không theo nhãn: đổi cách viết nhãn
  // về sau không làm hỏng bộ lọc — cùng quy ước với PCCC (lib/pccc-position.ts).
  const [cuongViCode, setCuongViCode] = useState(ALL);
  const [machine, setMachine] = useState(ALL);
  const [danhMuc, setDanhMuc] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [kd, setKd] = useState(ALL);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PCCC_PAGE_SIZES[0]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  /** Bản nháp PDF đang mở để xem trước; `null` = chưa dựng bản nào. */
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);

  /**
   * Chế độ "SỬA BẢNG": bảng khoá theo mặc định, mở khoá mới sửa được. Mọi thay đổi giữ
   * trong `draft` (id → các trường đã đổi) rồi ghi MỘT LƯỢT — đi kiểm tra một vòng ghi
   * hàng chục thiết bị, lưu từng dòng là hàng chục lần chờ mạng và không huỷ cả loạt được.
   */
  const [tableEditing, setTableEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, Record<string, unknown>>>({});
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const saveBulk = useSaveTbycnnBulk();

  const [signOpen, setSignOpen] = useState(false);
  const [signPreview, setSignPreview] = useState<TbycnnSignPreview | null>(null);
  const previewSign = useTbycnnSignPreview();
  const sign = useTbycnnSign();

  const dirtyCount = Object.keys(draft).length;

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const canManage = Boolean(data?.canManage);

  /**
   * Danh sách cương vị của ô lọc: mỗi CHỨC DANH một mục, không nhân đôi theo tổ máy.
   * Dòng không khớp danh mục chức danh (cuongViCode = null) vẫn phải lọc được nên lấy
   * nhãn gốc làm khoá dự phòng.
   */
  const cuongViList = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.cuongViCode ?? r.khuVuc, r.cuongVi ?? r.khuVuc);
    return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "vi"));
  }, [rows]);

  /**
   * Nói rõ vì sao bảng chỉ có ngần này dòng. Không có câu này thì người dùng cương vị hẹp
   * mở sổ ra thấy 12 thiết bị thay vì 709 và tưởng dữ liệu bị mất.
   */
  const viewScope = data?.viewScope;
  const viewScopeLabel = !viewScope || viewScope.all
    ? ""
    : viewScope.labels.length
      ? ` · chỉ xem cương vị ${viewScope.labels.join(" · ")}`
      : " · tài khoản chưa gán cương vị nên chưa thấy thiết bị nào";

  const machineList = useMemo(() => {
    const used = new Set(rows.map((r) => r.machine));
    return PCCC_MACHINES.filter((m) => used.has(m));
  }, [rows]);
  const danhMucList = useMemo(
    () => [...new Set(rows.map((r) => r.danhMuc))].sort((a, b) => a.localeCompare(b, "vi")),
    [rows]
  );

  /**
   * PHẠM VI của các thẻ thống kê: đã lọc theo cương vị / tổ máy / danh mục / tìm kiếm
   * nhưng CHƯA lọc theo tình trạng và hạn kiểm định.
   *
   * Tách hai bước là bắt buộc để năm thẻ dùng được như bộ lọc: nếu tính thẻ trên tập đã
   * lọc tình trạng thì bấm "Quá hạn" xong, thẻ "Khả dụng" tụt về số của riêng phần quá
   * hạn — người dùng mất luôn điểm tựa để bấm sang thẻ khác.
   */
  const scoped = useMemo(() => {
    const q = normalizeText(search);
    return rows.filter((r) => {
      if (cuongViCode !== ALL && (r.cuongViCode ?? r.khuVuc) !== cuongViCode) return false;
      if (machine !== ALL && r.machine !== machine) return false;
      if (danhMuc !== ALL && r.danhMuc !== danhMuc) return false;
      if (!q) return true;
      // Cùng bộ trường tìm kiếm với bản cũ, thêm khử dấu để gõ không dấu vẫn ra.
      const haystack = normalizeText(
        [r.tenThietBi, r.maHieu, r.viTri, r.kks, r.ghiChu, r.chucDanhQuanLy, r.khiemKhuyet, r.cuongVi]
          .filter(Boolean)
          .join(" ")
      );
      return haystack.includes(q);
    });
  }, [rows, search, cuongViCode, machine, danhMuc]);

  const filtered = useMemo(
    () =>
      scoped.filter((r) => {
        if (status !== ALL && !statusMatch(r, status)) return false;
        if (kd !== ALL && !kdMatch(r.kdTiepTheo, kd)) return false;
        return true;
      }),
    [scoped, status, kd]
  );

  const sorted = useMemo(() => {
    // Thứ tự gốc do server trả sẵn — không sắp lại, giữ đúng bố cục hồ sơ nhà máy.
    if (sort.key === SOURCE_ORDER) return filtered;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      // Ô trống LUÔN xuống cuối, bất kể chiều sắp xếp: đảo chúng lên đầu thì sắp giảm
      // dần chỉ toàn dòng chưa nhập, không đọc được gì.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp =
        typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "vi");
      return cmp * factor;
    });
  }, [filtered, sort]);

  /**
   * Thẻ đếm bằng ĐÚNG vị từ mà bộ lọc dùng (`statusMatch` / `kdMatch`), không phải một
   * công thức riêng — bấm vào thẻ phải ra đúng chừng đó dòng, không hơn không kém.
   *
   * Hệ quả có chủ đích: một dòng hỗn hợp ("3 khả dụng, 2 không khả dụng") được tính vào
   * CẢ HAI thẻ Khả dụng và Có thiết bị hỏng, đúng quy tắc đã ghi ở `lib/tbycnn.ts` —
   * nó vừa có cái dùng được vừa có cái hỏng, giấu ở thẻ nào cũng sai.
   */
  const stats = useMemo(
    () => ({
      total: scoped.length,
      khaDung: scoped.filter((r) => statusMatch(r, "Khả dụng")).length,
      khongKhaDung: scoped.filter((r) => statusMatch(r, "Không khả dụng")).length,
      quaHan: scoped.filter((r) => kdMatch(r.kdTiepTheo, "overdue")).length,
      sapHan: scoped.filter((r) => kdMatch(r.kdTiepTheo, "soon")).length,
    }),
    [scoped]
  );

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize]);

  // Đổi bộ lọc / sắp xếp / số dòng thì về trang 1: giữ trang cũ rất dễ rơi vào trang
  // không còn dòng nào và bảng trông như bị rỗng.
  useEffect(() => {
    setPage(1);
  }, [search, cuongViCode, machine, danhMuc, status, kd, sort, pageSize]);

  // Số ô lọc đang bật — hiện thành huy hiệu trên nút "Bộ lọc" để biết bảng đang bị
  // cắt bớt mà không phải mở bảng chọn ra xem. Ô tìm kiếm KHÔNG tính vào đây: nó nằm
  // ngay trên thanh công cụ, người dùng luôn nhìn thấy chữ mình vừa gõ.
  const activeFilterCount = [cuongViCode, machine, danhMuc, status, kd].filter((v) => v !== ALL).length;
  const hasFilter = search !== "" || activeFilterCount > 0;

  function toggleSort(key: string) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  /**
   * Bấm một thẻ KPI = đặt bộ lọc ra đúng tập dòng thẻ đó đang đếm. Luôn RESET cả hai ô
   * tình trạng và hạn kiểm định trước: không reset thì bấm "Quá hạn" trong lúc đang lọc
   * "Khả dụng" sẽ ra giao của hai thứ, không khớp con số vừa bấm.
   *
   * Bấm lại đúng thẻ đang bật thì bỏ lọc — thẻ vừa là nút bật vừa là nút tắt.
   */
  function applyKpi(next: { status?: string; kd?: string } | null) {
    const already = (next?.status && next.status === status) || (next?.kd && next.kd === kd);
    setStatus(!next || already ? ALL : next.status ?? ALL);
    setKd(!next || already ? ALL : next.kd ?? ALL);
  }

  function clearFilters() {
    setSearch("");
    setCuongViCode(ALL);
    setMachine(ALL);
    setDanhMuc(ALL);
    setStatus(ALL);
    setKd(ALL);
  }

  /** Ghi một thay đổi vào bản nháp; đặt lại đúng giá trị cũ thì bỏ khỏi nháp. */
  function setDraftValue(row: TbycnnEquipment, field: string, value: unknown) {
    setDraft((prev) => {
      const current = { ...(prev[row.id] ?? {}) };
      const original = (row as unknown as Record<string, unknown>)[field] ?? null;
      const normalized = value === "" ? null : value;
      if (normalized === original) delete current[field];
      else current[field] = normalized;
      const next = { ...prev };
      if (Object.keys(current).length === 0) delete next[row.id];
      else next[row.id] = current;
      return next;
    });
  }

  /** Giá trị đang hiển thị = giá trị nháp (nếu có) đè lên giá trị đã lưu. */
  function draftedRow(row: TbycnnEquipment): TbycnnEquipment {
    const patch = draft[row.id];
    return patch ? ({ ...row, ...patch } as TbycnnEquipment) : row;
  }

  function beginEdit() {
    setDraft({});
    setTableEditing(true);
  }

  function cancelEdit() {
    setDraft({});
    setTableEditing(false);
  }

  async function saveEdits() {
    if (dirtyCount === 0) {
      cancelEdit();
      return;
    }
    try {
      const res = await saveBulk.mutateAsync(
        Object.entries(draft).map(([id, patch]) => ({ id, ...patch }))
      );
      toast.success(`Đã lưu ${res.saved} dòng`);
      cancelEdit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSaveConfirmOpen(false);
    }
  }

  /** Tham số ký = bộ lọc đang đặt trên màn hình; xem trước và ký thật phải khớp từng chữ. */
  function signInput() {
    return {
      cuongViCode: cuongViCode === ALL ? undefined : cuongViCode,
      machine: machine === ALL ? undefined : machine,
    };
  }

  function openSignDialog() {
    setSignPreview(null);
    // HOÃN một nhịp: menu Radix khi đóng trả lại tiêu điểm, chính cú đó bị hộp thoại
    // hiểu là "bấm ra ngoài" nên đóng luôn hộp thoại vừa mở.
    setTimeout(() => setSignOpen(true), 0);
    previewSign.mutate(signInput(), {
      onSuccess: setSignPreview,
      onError: (e: Error) => {
        setSignOpen(false);
        toast.error(e.message);
      },
    });
  }

  async function confirmSign(targetIds: string[]) {
    try {
      const res = await sign.mutateAsync({ ...signInput(), targetIds: targetIds.length ? targetIds : undefined });
      toast.success(`Đã ký ${res.signed} dòng · ${res.scopeLabel}`);
      setSignOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ký thất bại");
    }
  }

  /** Bộ lọc đang đặt, dùng CHUNG cho mọi lượt xuất — bấm nút nào cũng ra đúng phần đang xem. */
  function exportParams() {
    return {
      cuongViCode: cuongViCode === ALL ? undefined : cuongViCode,
      machine: machine === ALL ? undefined : machine,
    };
  }

  /** Excel tải thẳng: bảng số liệu mở ra sửa được, không có gì để "duyệt trước khi in". */
  async function handleExportExcel() {
    setExporting("excel");
    try {
      await downloadTbycnnExcel(exportParams());
      toast.success("Đã tải báo cáo Excel");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được báo cáo");
    } finally {
      setExporting(null);
    }
  }

  /**
   * BƯỚC 1 — dựng BẢN NHÁP và mở khung xem. Cùng luồng hai bước của sổ PCCC.
   *
   * Sổ này in ra là để trình đoàn kiểm tra ATLĐ ký: sai bộ lọc, thiếu một cương vị hay
   * hụt chữ ký là phải in lại cả tập. Soi trước rẻ hơn nhiều so với phát hiện sau khi in.
   * Bản nháp không ghi nhật ký nên xem đi xem lại bao nhiêu lần cũng không để lại rác.
   */
  async function previewPdf() {
    setExporting("pdf");
    try {
      const { blob, filename } = await fetchTbycnnPdfPreview(exportParams());
      // Thu hồi bản nháp cũ trước khi thay: mỗi lượt dựng là một blob nằm lại trong bộ
      // nhớ trình duyệt cho tới khi đóng tab, mà sổ đủ 709 dòng không nhẹ.
      setPdfPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), filename };
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không dựng được bản xem trước");
    } finally {
      setExporting(null);
    }
  }

  function closePdfPreview() {
    setPdfPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  /**
   * BƯỚC 2 — chốt in. DỰNG LẠI từ server thay vì tải xuống blob nháp đang cầm: chỉ lượt
   * này mới được ghi nhật ký "đã xuất PDF", và dựng lại thì bản tải về mang đúng số liệu
   * tại thời điểm bấm chốt, kể cả khi người khác vừa sửa sổ trong lúc bản nháp đang mở.
   */
  async function confirmPdf() {
    setExporting("pdf");
    try {
      await downloadTbycnnPdf(exportParams());
      closePdfPreview();
      toast.success("Đã tải bản in PDF");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được bản in");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Thiết bị yêu cầu nghiêm ngặt về ATLĐ"
        mobileTitle="Thiết bị YCNN"
        description={
          data?.period
            ? `Kỳ ${data.period.label} · ${rows.length} thiết bị của ${cuongViList.length} cương vị quản lý${viewScopeLabel}`
            : "Danh mục thiết bị yêu cầu nghiêm ngặt và hạn kiểm định"
        }
        hideDescriptionOnMobile
      >
        {/* Một cửa "Chỉnh sửa" gom hai tác vụ của người đi kiểm tra: sửa số liệu và ký
            xác nhận. Hai việc này luôn đi cùng một lượt đi hiện trường nên đặt cạnh nhau
            — cùng khuôn với trang PCCC. Đang mở khoá thì đổi thành cặp Huỷ / Lưu. */}
        {canManage &&
          (tableEditing ? (
            <>
              <Button variant="outline" size="toolbar" onClick={cancelEdit} disabled={saveBulk.isPending}>
                Huỷ
              </Button>
              {/* Không sửa gì thì đóng luôn chế độ sửa — hỏi "lưu 0 dòng?" là hỏi thừa. */}
              <Button
                size="toolbar"
                onClick={() => (dirtyCount === 0 ? saveEdits() : setSaveConfirmOpen(true))}
                disabled={saveBulk.isPending}
              >
                <Save className={cn("mr-1.5 size-4", saveBulk.isPending && "animate-pulse")} />
                {saveBulk.isPending ? "Đang lưu…" : dirtyCount > 0 ? `Lưu ${dirtyCount} dòng` : "Lưu"}
              </Button>
            </>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="soft" size="toolbar" className="group">
                  <Pencil className="mr-1.5 size-4 text-sky-600" />
                  Chỉnh sửa
                  <ChevronDown className="ml-1 size-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[268px]">
                <DropdownMenuLabel className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Thiết bị YCNN về ATLĐ · {data?.period?.label ?? "—"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={beginEdit} className="gap-2">
                  <Pencil className="size-4 text-sky-600" />
                  <span className="min-w-0">
                    <span className="block font-medium">Sửa bảng</span>
                    <span className="block text-[11px] text-muted-foreground">Mở khoá ô để sửa, lưu một lượt</span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={openSignDialog} className="gap-2">
                  <PenLine className="size-4 text-emerald-600" />
                  <span className="min-w-0">
                    <span className="block font-medium">Ký tên</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Ký xác nhận toàn bộ dòng thuộc cương vị của bạn
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        {/* Bộ lọc gom vào MỘT nút, bấm mới sổ bảng chọn — cùng khuôn với trang PCCC /
            Danh mục vật tư, và trả lại chiều cao cho bảng thay vì một hàng ô lọc luôn
            chiếm chỗ dù hầu hết thời gian không dùng tới. */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="soft" size="toolbar" className="group min-w-[112px] justify-between">
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-sky-600" />
                Bộ lọc
                {activeFilterCount > 0 && (
                  <span className="grid size-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-slate-200/90 bg-white p-0 shadow-[0_22px_55px_rgba(15,23,42,0.18)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-sky-100 bg-[linear-gradient(135deg,#f8fbff_0%,#edf7ff_58%,#f0fdfa_100%)] px-4 py-3.5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">Lọc nội dung bảng</p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">Thiết bị YCNN về ATLĐ</p>
              </div>
              {activeFilterCount > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-1.5 size-3.5" />
                  Xoá lọc
                </Button>
              )}
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-slate-600">Cương vị quản lý</Label>
                <Select value={cuongViCode} onValueChange={setCuongViCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Cương vị quản lý" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tất cả cương vị</SelectItem>
                    {cuongViList.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Tổ máy là chiều LỌC XEM riêng, KHÔNG phải một phần của nhãn cương vị:
                  cùng một chức danh đi vận hành được cả hai tổ (lib/pccc-position.ts). */}
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-slate-600">Tổ máy</Label>
                <Select value={machine} onValueChange={setMachine}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tổ máy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tất cả tổ máy</SelectItem>
                    {machineList.map((m) => (
                      <SelectItem key={m} value={m}>
                        {MACHINE_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-slate-600">Danh mục</Label>
                <Select value={danhMuc} onValueChange={setDanhMuc}>
                  <SelectTrigger>
                    <SelectValue placeholder="Danh mục" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tất cả danh mục</SelectItem>
                    {danhMucList.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-slate-600">Tình trạng</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tình trạng" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Mọi tình trạng</SelectItem>
                    {TBYCNN_STATUS_FILTERS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-slate-600">Hạn kiểm định</Label>
                <Select value={kd} onValueChange={setKd}>
                  <SelectTrigger>
                    <SelectValue placeholder="Hạn kiểm định" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Mọi hạn kiểm định</SelectItem>
                    {TBYCNN_KD_FILTERS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {TBYCNN_KD_LABEL[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {/* MỘT cửa xuất file, bấm mới sổ chọn định dạng — cùng khuôn với nút "Chỉnh sửa"
            và "Bộ lọc" ngay cạnh. Hai nút rời trước đây chiếm chỗ gấp đôi trên thanh công
            cụ mà mỗi lượt người dùng chỉ chọn một định dạng. Thứ tự PDF → Excel giữ nguyên
            để người dùng cũ không phải dò lại. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="toolbar"
              className="group"
              disabled={exporting !== null || isLoading}
            >
              {exporting !== null ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Xuất File
              <ChevronDown className="ml-1 size-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[248px]">
            <DropdownMenuLabel className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Thiết bị YCNN về ATLĐ · {data?.period?.label ?? "—"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void previewPdf()} className="gap-2">
              <FileText className="size-4 text-rose-600" />
              <span className="min-w-0">
                <span className="block font-medium">Xuất PDF</span>
                <span className="block text-[11px] text-muted-foreground">Xem trước rồi mới chốt in</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void handleExportExcel()} className="gap-2">
              <FileSpreadsheet className="size-4 text-emerald-600" />
              <span className="min-w-0">
                <span className="block font-medium">Xuất Excel</span>
                <span className="block text-[11px] text-muted-foreground">Bảng dữ liệu để lọc và tổng hợp</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      {error && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : "Không tải được dữ liệu"}
        </Card>
      )}

      {/* Năm thẻ vừa là thống kê vừa là lối lọc nhanh — bấm thẻ nào thì bảng bên dưới
          còn đúng chừng ấy dòng. Bấm lại thẻ đang bật để bỏ lọc.

          MỖI THẺ MỘT MÀU, và màu xếp theo mức nặng nhẹ chứ không rải ngẫu nhiên:
            navy  — Tổng thiết bị      : trung tính, không phải cảnh báo
            green — Khả dụng           : tốt
            amber — Có thiết bị hỏng   : đang có vấn đề thực tế
            red   — Quá hạn kiểm định  : NẶNG NHẤT, vi phạm quy định kiểm định → giữ riêng màu đỏ
            blue  — Sắp đến hạn        : mới là nhắc trước, chưa vi phạm
          Trước đây "có thiết bị hỏng" và "quá hạn" dùng chung màu đỏ nên nhìn lướt không
          phân biệt được hai việc khác hẳn nhau. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard active={status === ALL && kd === ALL} onClick={() => applyKpi(null)}>
          <StatCard compact label="Tổng thiết bị" value={stats.total} icon={Wrench} tint="navy" />
        </KpiCard>
        <KpiCard active={status === "Khả dụng"} onClick={() => applyKpi({ status: "Khả dụng" })}>
          <StatCard compact label="Khả dụng" value={stats.khaDung} icon={CheckCircle2} tint="green" />
        </KpiCard>
        <KpiCard active={status === "Không khả dụng"} onClick={() => applyKpi({ status: "Không khả dụng" })}>
          <StatCard compact label="Có thiết bị hỏng" value={stats.khongKhaDung} icon={ShieldAlert} tint="amber" />
        </KpiCard>
        <KpiCard active={kd === "overdue"} onClick={() => applyKpi({ kd: "overdue" })}>
          <StatCard compact label="Quá hạn kiểm định" value={stats.quaHan} icon={AlertTriangle} tint="red" />
        </KpiCard>
        <KpiCard active={kd === "soon"} onClick={() => applyKpi({ kd: "soon" })}>
          <StatCard compact label="Sắp đến hạn (<3 tháng)" value={stats.sapHan} icon={CalendarClock} tint="blue" />
        </KpiCard>
      </div>

      {isLoading ? (
        <Card className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </Card>
      ) : (
        <PcccTableCard
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Tên thiết bị, mã hiệu, KKS, vị trí…"
          page={page}
          pageCount={pageCount}
          total={sorted.length}
          filtered={hasFilter}
          onPageChange={setPage}
          toolbarExtra={
            sort.key !== SOURCE_ORDER ? (
              <Button variant="ghost" size="sm" onClick={() => setSort(DEFAULT_SORT)}>
                Về thứ tự hồ sơ gốc
              </Button>
            ) : null
          }
        >
          <Table className="min-w-[1540px]" wrapperClassName={TABLE_SCROLLER}>
            <TableHeader>
              <TableRow className={TR_HEAD}>
                <TableHead className={cn(TH_NAVY, TH_EXPAND, "lg:left-0 lg:z-20")} />
                {/* Tên thiết bị đóng băng: đây là cột định danh, thiếu nó thì cuộn ngang
                    xong không biết đang đọc dòng nào (vai trò của "Mã thiết bị" bên PCCC). */}
                <TableHead
                  className={cn(
                    TH_NAVY,
                    "left-0 z-20 w-[280px] min-w-[280px] shadow-[inset_-1px_0_0_rgba(15,23,42,0.18)] lg:left-[42px] lg:shadow-none"
                  )}
                >
                  <SortHeader label="Tên TBYCNN" sortKey="tenThietBi" sort={sort} onSort={toggleSort} align="left" />
                </TableHead>
                <TableHead className={cn(TH_NAVY, "w-[150px]")}>
                  <SortHeader label="Cương vị quản lý" sortKey="cuongVi" sort={sort} onSort={toggleSort} />
                </TableHead>
                <TableHead className={cn(TH_NAVY, "w-[190px]")}>
                  <SortHeader label="Danh mục" sortKey="danhMuc" sort={sort} onSort={toggleSort} />
                </TableHead>
                <TableHead className={cn(TH_NAVY, "w-[90px]")}>
                  <SortHeader label="Tổ máy" sortKey="machine" sort={sort} onSort={toggleSort} />
                </TableHead>
                <TableHead className={cn(TH_NAVY, "w-[170px]")}>
                  <SortHeader label="Mã hiệu" sortKey="maHieu" sort={sort} onSort={toggleSort} align="left" />
                </TableHead>
                <TableHead className={cn(TH_NAVY, "w-[140px]")}>
                  <SortHeader label="KKS" sortKey="kks" sort={sort} onSort={toggleSort} align="left" />
                </TableHead>
                <TableHead className={cn(TH_NAVY, "w-[85px]")}>
                  <SortHeader label="Chu kỳ thử" sortKey="chuKyThu" sort={sort} onSort={toggleSort} />
                </TableHead>
                <TableHead className={cn(TH_NAVY, "w-[115px]")}>
                  <SortHeader label="KĐ gần nhất" sortKey="kdGanNhat" sort={sort} onSort={toggleSort} />
                </TableHead>
                <TableHead className={cn(TH_NAVY, "w-[125px]")}>
                  <SortHeader label="KĐ tiếp theo" sortKey="kdTiepTheo" sort={sort} onSort={toggleSort} />
                </TableHead>
                <TableHead className={cn(TH_NAVY, "w-[150px]")}>
                  <SortHeader label="Tình trạng" sortKey="tinhTrang" sort={sort} onSort={toggleSort} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COL_COUNT} className="py-12 text-center text-sm text-muted-foreground">
                    Không tìm thấy thiết bị phù hợp.
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map((saved, index) => {
                const row = draftedRow(saved);
                const expanded = expandedId === row.id;
                const rowDirty = Boolean(draft[row.id]);
                // Ô nào đang sửa dở thì tô vàng để soát lại trước khi bấm Lưu.
                const dirty = (field: string) => (draft[row.id] && field in draft[row.id] ? "bg-amber-100/70" : "");
                /*
                 * Nền hàng PHẢI ĐỤC: ô đóng băng vẽ đè lên cột đang cuộn qua bên dưới, nền
                 * trong suốt là chữ của cột kia hiện xuyên qua. `rowBackground()` của PCCC
                 * trả bg-slate-50/70 nên không dùng lại được ở bảng rộng này.
                 */
                const rowBg = rowDirty ? "bg-amber-50" : expanded ? "bg-sky-50" : index % 2 === 1 ? "bg-slate-50" : "bg-white";
                // Sửa được hay không do SERVER quyết (phạm vi cương vị), không tự suy ở client.
                const editable = tableEditing && saved.canWrite;
                return (
                  <Fragment key={row.id}>
                    <TableRow className={cn(rowBg, ROW_HOVER)}>
                      <TableCell className={cn(TD_EXPAND_TALL, rowBg, "lg:sticky lg:left-0 lg:z-[1] lg:group-hover:bg-sky-50")}>
                        <RowExpander expanded={expanded} onToggle={() => setExpandedId(expanded ? null : row.id)} />
                      </TableCell>
                      <TableCell
                        className={cn(
                          TD_TALL,
                          rowBg,
                          "sticky left-0 z-[1] text-left font-medium shadow-[inset_-1px_0_0_rgba(15,23,42,0.18)] group-hover:bg-sky-50 lg:left-[42px] lg:shadow-none"
                        )}
                      >
                        {row.tenThietBi}
                      </TableCell>
                      {/* Nhãn CHUẨN theo danh mục chức danh của hệ thống, không phải chuỗi
                          thô trong file gốc — hậu tố tổ máy đã tách sang cột riêng. */}
                      <TableCell className={cn(TD_TALL, "text-center")}>{row.cuongVi ?? row.khuVuc}</TableCell>
                      <TableCell className={cn(TD_TALL, "text-center text-[11.5px] leading-tight")}>{row.danhMuc}</TableCell>
                      <TableCell className={cn(TD_TALL, "text-center")}>
                        <MachineBadge machine={row.machine} />
                      </TableCell>
                      <TableCell className={TD_TALL}>{row.maHieu ?? "—"}</TableCell>
                      <TableCell className={cn(TD_TALL, "font-mono text-[11px]")}>{row.kks ?? "—"}</TableCell>
                      <TableCell className={cn(TD_TALL, "text-center", dirty("chuKyThu"))}>
                        {editable ? (
                          <EditableCell
                            value={row.chuKyThu}
                            type="number"
                            align="center"
                            onSave={(v) => setDraftValue(saved, "chuKyThu", v.trim() === "" ? null : Number(v))}
                          />
                        ) : (
                          row.chuKyThu ?? "—"
                        )}
                      </TableCell>
                      {/* Hai ô ngày nhận CẢ CHỮ ("Chưa dán tem", "06/26") nên là ô text, không
                          phải ô chọn ngày — ép kiểu date ở đây là mất dữ liệu gốc. */}
                      <TableCell className={cn(TD_TALL, "text-center", dirty("kdGanNhatText"))}>
                        {editable ? (
                          <EditableCell
                            value={displayKdDate(row.kdGanNhat, row.kdGanNhatText)}
                            align="center"
                            onSave={(v) => setDraftValue(saved, "kdGanNhatText", v.trim() || null)}
                          />
                        ) : (
                          displayKdDate(row.kdGanNhat, row.kdGanNhatText) || <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className={cn(TD_TALL, "text-center", dirty("kdTiepTheoText"))}>
                        {editable ? (
                          <EditableCell
                            value={displayKdDate(row.kdTiepTheo, row.kdTiepTheoText)}
                            align="center"
                            onSave={(v) => setDraftValue(saved, "kdTiepTheoText", v.trim() || null)}
                          />
                        ) : (
                          <KdCell row={row} />
                        )}
                      </TableCell>
                      <TableCell className={cn(TD_TALL, "text-center")}>
                        <StatusBadge value={row.tinhTrang} />
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={COL_COUNT} className="bg-slate-50/80 p-0">
                          <DetailPanel>
                            {/* Hai trường đầu là thông tin GỐC theo hồ sơ nhà máy — chỉ đọc
                                kể cả khi đang mở khoá bảng (xem lib/tbycnn.ts).
                                KHÔNG hiện "Chức danh quản lý": giá trị của nó ("ESP S1") chính
                                là hai cột Cương vị quản lý + Tổ máy đã có sẵn trên bảng. Trường
                                vẫn lưu trong DB và vẫn nằm trong file Excel xuất ra. */}
                            <DetailField label="Vị trí">{row.viTri ?? "—"}</DetailField>
                            <DetailField label="Đơn vị quản lý">{row.donViQuanLy ?? "—"}</DetailField>
                            {/* Số lượng đứng ngay TRÊN "Khả dụng" (cùng cột 3) để soi nhanh
                                ràng buộc khả dụng + không khả dụng = số lượng. Là thông tin
                                gốc theo hồ sơ nhà máy nên chỉ đọc, kể cả khi mở khoá bảng. */}
                            <DetailField label="Số lượng">{row.soLuong ?? "—"}</DetailField>
                            {/* Đơn vị kiểm định KHÔNG span 2 nữa: để nguyên thì nửa phải của ô
                                bỏ trống, đẩy "Không khả dụng" xuống đứng một mình cả một hàng. */}
                            <DetailField label="Đơn vị kiểm định">
                              {editable ? (
                                <EditableCell
                                  value={row.donViKd}
                                  wrap
                                  onSave={(v) => setDraftValue(saved, "donViKd", v.trim() || null)}
                                />
                              ) : (
                                row.donViKd ?? "—"
                              )}
                            </DetailField>
                            {/* Hai ô số lượng quyết định cột Tình trạng — server kiểm tra lại
                                tổng hai ô phải bằng số lượng khi lưu. Đặt cạnh nhau trên cùng
                                một hàng để đối chiếu bằng mắt. */}
                            <DetailField label="Không khả dụng">
                              {editable ? (
                                <EditableCell
                                  value={row.soLuongKhongKhaDung}
                                  type="number"
                                  onSave={(v) =>
                                    setDraftValue(saved, "soLuongKhongKhaDung", v.trim() === "" ? null : Number(v))
                                  }
                                />
                              ) : (
                                row.soLuongKhongKhaDung ?? "—"
                              )}
                            </DetailField>
                            <DetailField label="Khả dụng">
                              {editable ? (
                                <EditableCell
                                  value={row.soLuongKhaDung}
                                  type="number"
                                  onSave={(v) => setDraftValue(saved, "soLuongKhaDung", v.trim() === "" ? null : Number(v))}
                                />
                              ) : (
                                row.soLuongKhaDung ?? "—"
                              )}
                            </DetailField>
                            {/* Số BBKĐ và Chữ ký đi cùng hàng: cùng là dấu vết xác nhận của
                                lượt kiểm định — số biên bản do đơn vị kiểm định cấp, chữ ký do
                                cương vị phụ trách đóng sau khi đi kiểm tra. */}
                            <DetailField label="Số BBKĐ">
                              {editable ? (
                                <EditableCell
                                  value={row.soBbkd}
                                  wrap
                                  onSave={(v) => setDraftValue(saved, "soBbkd", v.trim() || null)}
                                />
                              ) : (
                                row.soBbkd ?? "—"
                              )}
                            </DetailField>
                            <DetailField label="Chữ ký" span={2}>
                              <SignatureStamp signature={saved.signature} />
                            </DetailField>
                            <DetailField label="Thông số kỹ thuật" span="full">
                              <span className="whitespace-pre-line">{row.thongSoKyThuat ?? "—"}</span>
                            </DetailField>
                            <DetailField label="Khiếm khuyết" span={2}>
                              {editable ? (
                                <EditableCell
                                  value={row.khiemKhuyet}
                                  wrap
                                  onSave={(v) => setDraftValue(saved, "khiemKhuyet", v.trim() || null)}
                                />
                              ) : (
                                <span className="whitespace-pre-line">{row.khiemKhuyet ?? "—"}</span>
                              )}
                            </DetailField>
                            <DetailField label="Ghi chú">
                              {editable ? (
                                <EditableCell
                                  value={row.ghiChu}
                                  wrap
                                  onSave={(v) => setDraftValue(saved, "ghiChu", v.trim() || null)}
                                />
                              ) : (
                                <span className="whitespace-pre-line">{row.ghiChu ?? "—"}</span>
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
      )}

      {/*
        XEM TRƯỚC BẢN IN — bản nháp dựng từ server, chưa ghi nhật ký. Người dùng lật đủ
        các trang rồi mới bấm chốt; đóng hộp thoại là bản nháp biến mất không để lại dấu.
        Cùng khuôn với hộp thoại xem trước của sổ PCCC.
      */}
      <Dialog open={!!pdfPreview} onOpenChange={(open) => !open && closePdfPreview()}>
        <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Xem trước bản in</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            Đây là <span className="font-semibold text-slate-700">bản nháp</span> — chưa ghi nhật ký xuất file.
            Kiểm tra xong hãy bấm <span className="font-semibold text-slate-700">Xác nhận in</span> để tải bản
            chính thức về máy.
          </p>
          {pdfPreview && (
            <iframe
              src={pdfPreview.url}
              title={pdfPreview.filename}
              className="h-[68vh] w-full rounded-xl border border-slate-200 bg-slate-50"
            />
          )}
          <DialogFooter className="sm:justify-between">
            <span className="truncate text-[12px] text-muted-foreground">{pdfPreview?.filename}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={closePdfPreview}>
                Đóng
              </Button>
              <Button size="sm" onClick={() => void confirmPdf()} disabled={exporting !== null}>
                {exporting === "pdf" ? "Đang xuất…" : "Xác nhận in"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TbycnnSignDialog
        open={signOpen}
        onOpenChange={(open) => !open && setSignOpen(false)}
        preview={signPreview}
        loading={previewSign.isPending}
        signing={sign.isPending}
        onConfirm={confirmSign}
      />

      {/* Bước XÁC NHẬN trước khi ghi: nói rõ số dòng, vì bảng đã cuộn đi thì người dùng
          không còn thấy hết những ô mình vừa sửa. */}
      <ConfirmDialog
        open={saveConfirmOpen}
        onOpenChange={setSaveConfirmOpen}
        title={`Lưu ${dirtyCount} dòng đã sửa?`}
        description="Toàn bộ thay đổi được ghi trong một lượt. Ghi xong không hoàn tác được — hãy soát lại các ô nền vàng."
        confirmLabel="Lưu"
        destructive={false}
        loading={saveBulk.isPending}
        onConfirm={saveEdits}
      />
    </div>
  );
}
