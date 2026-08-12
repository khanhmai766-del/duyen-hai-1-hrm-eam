"use client";
// =====================================================================
// TRANG "QUẢN LÝ THIẾT BỊ PCCC" — Phân xưởng Vận hành 1
//
// Thay thế file Excel "Quản lý BCC và TCC" + bản web demo tĩnh (localStorage):
// Postgres là nguồn sự thật duy nhất, có phân quyền, có chữ ký truy vết, xuất
// Excel phía server (không phụ thuộc CDN như bản demo).
//
// Trục tổ chức của trang là KỲ KIỂM TRA (1 tháng) — mọi tab đều đọc theo kỳ đang
// chọn, đúng như Excel gốc tách sheet theo tháng. Kỳ đã CHỐT thì toàn bộ ô chuyển
// sang chỉ đọc.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  CalendarCheck,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  FlameKindling,
  ChevronDown,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Lock,
  PenLine,
  Pencil,
  Save,
  ShieldCheck,
  Warehouse,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { apiDownload } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import {
  usePcccBulks,
  usePcccCabinets,
  usePcccExtinguishers,
  usePcccPeriods,
  usePcccSummary,
  usePcccArchives,
  usePcccBookStatus,
  usePcccRollover,
  usePcccBulkSign,
  usePcccBulkSignPreview,
  usePcccBulkSaveExtinguishers,
  usePcccBulkSaveCabinets,
  usePcccUpdate,
  type CabinetRow,
  type PcccClockMeta,
  type PcccBulkSignPreview,
  type ExtinguisherRow,
  type PcccViewScopeMeta,
  type PcccWriteScopeMeta,
  type PositionOption,
} from "@/hooks/usePccc";
import { PcccBulks } from "@/components/pccc/PcccBulks";
import { PcccCabinets } from "@/components/pccc/PcccCabinets";
import { PcccExtinguishers } from "@/components/pccc/PcccExtinguishers";
import { PcccOverview, type PcccOverviewDrill } from "@/components/pccc/PcccOverview";
import { MACHINE_OPTIONS } from "@/components/pccc/pccc-shared";
import { type SortState } from "@/components/pccc/pccc-table-card";
import { CHUNG_LOAI_OPTIONS, applyTccToggle, resolveTinhTrang } from "@/lib/pccc-status";

type TabKey = "OVERVIEW" | "BCC" | "TCC" | "FCD";

/**
 * Kỳ của tháng CHƯA TỚI, so theo mốc ngày của server. So bằng chuỗi `<năm><tháng>` cho
 * gọn — nhãn kỳ luôn dạng `T<MM>.<YYYY>` nên ghép lại là so sánh được theo thứ tự.
 */
function isFuturePeriodLabel(period: { label: string } | undefined, clock: PcccClockMeta | undefined) {
  if (!period || !clock) return false;
  const key = (label: string) => `${label.slice(4)}${label.slice(1, 3)}`;
  return key(period.label) > key(clock.currentLabel);
}

const TABS: { key: TabKey; label: string; icon: typeof FlameKindling }[] = [
  { key: "OVERVIEW", label: "Tổng quan", icon: ShieldCheck },
  { key: "BCC", label: "Bình chữa cháy", icon: FlameKindling },
  { key: "TCC", label: "Tủ chữa cháy", icon: Warehouse },
  { key: "FCD", label: "Foam · CO2 · Diesel · FM200", icon: FileSpreadsheet },
];

const TINH_TRANG_FILTERS = ["Khả dụng", "Cần theo dõi", "Bất khả dụng"];

/** Nội dung hộp thoại kết quả — dùng chung cho "lưu sửa đổi" và "ký tên". */
type ResultDialog = {
  title: string;
  rows: { label: string; value: string; strong?: boolean }[];
  note?: string;
  /** Ảnh chữ ký số vừa đóng vào các dòng — cho người ký thấy đúng cái đã ký. */
  signatureUrl?: string | null;
};

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right", strong ? "text-[15px] font-bold text-ink" : "font-medium text-ink")}>{value}</span>
    </div>
  );
}


type Option = { value: string; label: string };

/**
 * Ô lọc có mục "tất cả". Nhận cặp (value, label) vì cương vị được lọc theo MÃ chức
 * danh còn hiển thị theo nhãn — đổi cách viết nhãn không làm sai bộ lọc.
 */
function SelectBox({
  value,
  onChange,
  options,
  allLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: (Option | string)[];
  allLabel: string;
  className?: string;
}) {
  const items: Option[] = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-10 w-full rounded-xl border border-input bg-white px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-accent/20",
        className
      )}
    >
      <option value="ALL">{allLabel}</option>
      {items.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export default function PcccPage() {
  const { can } = useRbacAccess();
  const [tab, setTab] = useState<TabKey>("OVERVIEW");
  const [periodLabel, setPeriodLabel] = useState<string>("");
  const [cuongVi, setCuongVi] = useState("ALL"); // MÃ chức danh, không phải nhãn
  const [machine, setMachine] = useState("ALL");
  const [giamSat, setGiamSat] = useState("ALL");
  const [tinhTrang, setTinhTrang] = useState("ALL");
  const [chungLoai, setChungLoai] = useState("ALL");
  const [loaiTu, setLoaiTu] = useState("ALL");
  const [quaHan, setQuaHan] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // Sắp xếp chạy Ở SERVER (bảng hàng nghìn dòng, không tải hết về client).
  const [sort, setSort] = useState<SortState>({ key: "stt", dir: "asc" });

  function toggleSort(key: string) {
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }));
    setPage(1);
  }
  const [downloading, setDownloading] = useState(false);
  // Chế độ "Sửa bảng": bảng khoá theo mặc định, mở khoá mới sửa được; sửa đổi giữ
  // trong bản nháp rồi LƯU MỘT LƯỢT. `baseline` giữ updatedAt lúc mở khoá để server
  // phát hiện người khác vừa sửa cùng dòng.
  //
  // Bản nháp TÁCH THEO TAB: hai bảng có endpoint lưu và cấu trúc dữ liệu khác nhau,
  // gộp chung một bản nháp thì đổi tab là gửi sai bảng.
  type Draft = Record<string, Record<string, unknown>>;
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<{ BCC: Draft; TCC: Draft; FCD: Draft }>({ BCC: {}, TCC: {}, FCD: {} });
  const [baselines, setBaselines] = useState<{ BCC: Record<string, string>; TCC: Record<string, string> }>({
    BCC: {},
    TCC: {},
  });
  /** Tab đang có thể bật chế độ sửa. Chỉ tab Tổng quan là không sửa được. */
  const editableTab = tab === "BCC" || tab === "TCC" || tab === "FCD" ? tab : null;
  const draft = editableTab ? drafts[editableTab] : {};
  const dirtyCount = Object.keys(draft).length;

  const periodsQuery = usePcccPeriods();
  const periods = periodsQuery.data?.data ?? [];
  /** Mốc ngày do server tính theo giờ VN — không tin đồng hồ máy người dùng. */
  const clock: PcccClockMeta | undefined = periodsQuery.data?.meta?.clock;

  /**
   * Kỳ mặc định là KỲ CỦA THÁNG HIỆN TẠI, không phải kỳ mới nhất trong danh sách.
   * Dữ liệu cũ có thể còn kỳ sinh sớm (nút "Sinh kỳ mới" ngày trước không chặn) — mặc
   * định vào kỳ mới nhất là cả trang làm việc nhầm sang tháng chưa bắt đầu.
   */
  const currentPeriod = clock ? periods.find((p) => p.label === clock.currentLabel) : undefined;
  const latestStarted = periods.find((p) => !isFuturePeriodLabel(p, clock));
  const period = periods.find((p) => p.label === periodLabel) ?? currentPeriod ?? latestStarted ?? periods[0];
  const effectiveLabel = period?.label;
  /** Kỳ chưa tới tháng: xem được nhưng không ghi được — server cũng chặn y hệt. */
  const periodNotStarted = isFuturePeriodLabel(period, clock);
  const readOnly =
    !can("pccc-manage", ["personal", "manage", "full"]) || Boolean(period?.isClosed) || periodNotStarted;

  const baseFilters = useMemo(
    () => ({ period: effectiveLabel, cuongVi, machine: machine === "ALL" ? undefined : machine }),
    [effectiveLabel, cuongVi, machine]
  );
  const listFilters = useMemo(
    () => ({
      ...baseFilters,
      tinhTrang,
      chungLoai,
      loaiTu,
      giamSat,
      quaHan,
      q: q.trim() || undefined,
      page,
      pageSize,
      sort: sort.key,
      dir: sort.dir,
    }),
    [baseFilters, tinhTrang, chungLoai, loaiTu, giamSat, quaHan, q, page, pageSize, sort]
  );

  const summaryQuery = usePcccSummary({ ...baseFilters });
  const bccQuery = usePcccExtinguishers(tab === "BCC" ? listFilters : { ...baseFilters, page: 0 });
  const tccQuery = usePcccCabinets(tab === "TCC" ? listFilters : { ...baseFilters, page: 0 });
  const fcdQuery = usePcccBulks(tab === "FCD" ? baseFilters : { ...baseFilters, page: 0 });

  /**
   * Phạm vi XEM (quy tắc 4 — xem lib/pccc-service.ts). SERVER đã cắt dữ liệu rồi; cái
   * này chỉ để nói cho người dùng biết vì sao bảng chỉ có phần của mình, tránh tưởng là
   * mất dữ liệu. Khai báo sớm vì còn quyết định có gọi danh sách bản lưu trữ hay không.
   *
   * LẤY THEO TAB ĐANG MỞ, không gộp chung: phạm vi khác nhau theo bảng (Foam·CO2 ai
   * cũng xem hết, Tủ chữa cháy có cương vị được giao trọn bảng — xem lib/pccc-service.ts).
   * Gộp chung thì tab này lại hiện phạm vi của tab kia. Chuỗi `??` phía sau chỉ là bản
   * dự phòng lúc truy vấn của tab chưa về (chưa có dòng nào để khoá).
   */
  const viewScope: PcccViewScopeMeta | undefined =
    (tab === "BCC"
      ? bccQuery.data?.meta?.viewScope
      : tab === "TCC"
        ? tccQuery.data?.meta?.viewScope
        : tab === "FCD"
          ? fcdQuery.data?.meta?.viewScope
          : undefined) ??
    summaryQuery.data?.meta?.viewScope ??
    bccQuery.data?.meta?.viewScope ??
    tccQuery.data?.meta?.viewScope ??
    fcdQuery.data?.meta?.viewScope;
  const viewLimited = Boolean(viewScope && !viewScope.all);

  const bulkSave = usePcccBulkSaveExtinguishers();
  const bulkSaveCabinets = usePcccBulkSaveCabinets();
  // Tab FCD dùng lại hai route PATCH từng mục (xem saveFcdEdits).
  const updateBulk = usePcccUpdate("BULK");
  const updatePanel = usePcccUpdate("FM200_PANEL");

  // Gom sửa đổi trong bộ nhớ nên PHẢI cảnh báo trước khi mất: đóng tab / tải lại trang.
  useEffect(() => {
    if (dirtyCount === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyCount]);

  function beginEdit() {
    if (!editableTab) return;
    // Tab FCD chỉ có 3 bồn + 2 bảng FM200 và LƯU TỪNG MỤC bằng route PATCH sẵn có, nên
    // không có mốc `updatedAt` để chống ghi đè như hai bảng nghìn dòng kia.
    if (editableTab === "FCD") {
      setDrafts((prev) => ({ ...prev, FCD: {} }));
      setEditing(true);
      return;
    }
    const rows: { id: string; updatedAt: string }[] =
      editableTab === "BCC" ? (bccQuery.data?.data ?? []) : (tccQuery.data?.data ?? []);
    setBaselines((prev) => ({ ...prev, [editableTab]: Object.fromEntries(rows.map((r) => [r.id, r.updatedAt])) }));
    setDrafts((prev) => ({ ...prev, [editableTab]: {} }));
    setEditing(true);
  }

  function cancelEdit() {
    if (dirtyCount > 0 && !window.confirm(`Bỏ ${dirtyCount} dòng đang sửa chưa lưu?`)) return;
    if (editableTab) setDrafts((prev) => ({ ...prev, [editableTab]: {} }));
    setEditing(false);
  }

  function patchDraft(tabKey: "BCC" | "TCC", rowId: string, apply: (rowDraft: Record<string, unknown>) => void) {
    setDrafts((prev) => {
      const rowDraft = { ...(prev[tabKey][rowId] ?? {}) };
      apply(rowDraft);
      return { ...prev, [tabKey]: { ...prev[tabKey], [rowId]: rowDraft } };
    });
  }

  /** Ghi 1 ô của BCC vào bản nháp. Áp luôn quy tắc áp suất → tình trạng cho thấy ngay. */
  function onDraftChange(rowId: string, field: string, value: unknown, row: ExtinguisherRow) {
    patchDraft("BCC", rowId, (rowDraft) => {
      rowDraft[field] = value;
      if (field === "apSuat" || field === "tinhTrang") {
        const apSuat = (("apSuat" in rowDraft ? rowDraft.apSuat : row.apSuat) as string | null) ?? null;
        const tinhTrang = (("tinhTrang" in rowDraft ? rowDraft.tinhTrang : row.tinhTrang) as string | null) ?? null;
        const resolved = resolveTinhTrang(apSuat, tinhTrang);
        if (resolved !== tinhTrang) rowDraft.tinhTrang = resolved;
      }
    });
  }

  /** Ghi 1 ô của tab FCD vào bản nháp. `key` là `bulk:<id>` hoặc `panel:<id>`. */
  function onFcdDraftChange(key: string, field: string, value: unknown) {
    setDrafts((prev) => ({ ...prev, FCD: { ...prev.FCD, [key]: { ...(prev.FCD[key] ?? {}), [field]: value } } }));
  }

  function onTccDraftChange(rowId: string, field: string, value: unknown) {
    patchDraft("TCC", rowId, (rowDraft) => {
      rowDraft[field] = value;
    });
  }

  /**
   * Bấm 1 ô ☑ của TCC. Áp quy tắc "Khả dụng ↔ Bất khả dụng loại trừ nhau" NGAY trong
   * bản nháp để người dùng thấy ô đối lập tự bỏ tích, không phải chờ lưu xong.
   */
  function onToggleComponent(row: CabinetRow, groupLabel: string, status: string, nextChecked: boolean) {
    patchDraft("TCC", row.id, (rowDraft) => {
      // Trạng thái hiệu lực = dữ liệu đã lưu, phủ bởi các ô đã bấm trong bản nháp
      const effective = row.components.map((c) => {
        const key = `comp:${c.groupLabel}|${c.status}`;
        return { ...c, checked: key in rowDraft ? Boolean(rowDraft[key]) : c.checked };
      });
      for (const change of applyTccToggle(effective, groupLabel, status, nextChecked)) {
        rowDraft[`comp:${change.groupLabel}|${change.status}`] = change.checked;
      }
    });
  }

  /**
   * Lưu tab Foam·CO2·Diesel·FM200. Khác hai tab kia: KHÔNG có route lưu-một-lượt riêng,
   * mà gọi lại đúng các route PATCH từng mục đã có. Ở đây chỉ 3 bồn + 2 bảng FM200 nên
   * vài lượt gọi là xong, không đáng để dựng thêm một endpoint nữa.
   *
   * Khoá bản nháp: `bulk:<id>` và `panel:<id>`; riêng ô số của FM200 nằm trong cùng bản
   * nháp của bảng với khoá `muc:<nhãn bình>` / `ap:<nhãn bình>`.
   */
  async function saveFcdEdits() {
    let saved = 0;
    const failures: string[] = [];

    for (const [key, patch] of Object.entries(drafts.FCD)) {
      const cut = key.indexOf(":");
      const [kind, id] = [key.slice(0, cut), key.slice(cut + 1)];
      try {
        if (kind === "bulk") {
          await updateBulk.mutateAsync({ id, patch });
        } else {
          // Gom các ô số về đúng hai đối tượng mà route FM200 nhận.
          const body: Record<string, unknown> = {};
          const muc: Record<string, unknown> = {};
          const ap: Record<string, unknown> = {};
          for (const [field, value] of Object.entries(patch)) {
            if (field.startsWith("muc:")) muc[field.slice(4)] = value;
            else if (field.startsWith("ap:")) ap[field.slice(3)] = value;
            else body[field] = value;
          }
          if (Object.keys(muc).length > 0) body.mucValues = muc;
          if (Object.keys(ap).length > 0) body.apValues = ap;
          await updatePanel.mutateAsync({ id, patch: body });
        }
        saved += 1;
      } catch (e) {
        failures.push((e as Error).message);
      }
    }

    if (failures.length > 0) {
      toast.error(`Chưa lưu xong: ${failures.slice(0, 2).join(" · ")}`, { duration: 10_000 });
      return;
    }
    setResultDialog({
      title: "Đã lưu thay đổi",
      rows: [
        { label: "Bảng", value: "Foam · CO2 · Diesel · FM200" },
        { label: "Kỳ kiểm tra", value: period.label },
        { label: "Số mục đã lưu", value: `${saved} mục`, strong: true },
      ],
      note: "Chữ ký của các mục vừa sửa đã bị xoá — cần ký lại để xác nhận số liệu mới.",
    });
    setDrafts((prev) => ({ ...prev, FCD: {} }));
    setEditing(false);
  }

  function saveEdits() {
    if (!editableTab) return;
    if (dirtyCount === 0) {
      setEditing(false);
      return;
    }
    if (editableTab === "FCD") {
      void saveFcdEdits();
      return;
    }
    const baseline = baselines[editableTab];

    if (editableTab === "TCC") {
      // Tách bản nháp thành trường thường và các ô ☑ (khoá `comp:<nhóm>|<trạng thái>`)
      const items = Object.entries(draft).map(([id, rowDraft]) => {
        const patch: Record<string, unknown> = {};
        const components: { groupLabel: string; status: string; checked: boolean }[] = [];
        for (const [key, value] of Object.entries(rowDraft)) {
          if (key.startsWith("comp:")) {
            const [groupLabel, status] = key.slice(5).split("|");
            components.push({ groupLabel, status, checked: Boolean(value) });
          } else {
            patch[key] = value;
          }
        }
        return { id, updatedAt: baseline[id], patch, components };
      });
      bulkSaveCabinets.mutate(items, {
        onSuccess: (res) => {
          if (res.errors.length > 0) {
            toast.error(
              `Chưa lưu: ${res.errors.length} dòng có vấn đề. ${res.errors
                .slice(0, 3)
                .map((e) => `${e.ma ?? e.id}: ${e.message}`)
                .join(" · ")}${res.errors.length > 3 ? " …" : ""}`,
              { duration: 10_000 }
            );
            return;
          }
          setResultDialog({
            title: "Đã lưu thay đổi",
            rows: [
              { label: "Bảng", value: "Tủ chữa cháy" },
              { label: "Kỳ kiểm tra", value: period.label },
              { label: "Số tủ đã lưu", value: `${res.saved} tủ`, strong: true },
            ],
            note: "Chữ ký của các tủ vừa sửa đã bị xoá — cần ký lại để xác nhận số liệu mới.",
          });
          setDrafts((prev) => ({ ...prev, TCC: {} }));
          setEditing(false);
        },
        onError: (e: Error) => toast.error(e.message),
      });
      return;
    }

    const items = Object.entries(draft).map(([id, patch]) => ({ id, updatedAt: baseline[id], patch }));
    bulkSave.mutate(items, {
      onSuccess: (res) => {
        if (res.errors.length > 0) {
          // Server từ chối CẢ LƯỢT khi có dòng lỗi — giữ nguyên bản nháp để sửa lại.
          toast.error(
            `Chưa lưu: ${res.errors.length} dòng có vấn đề. ${res.errors
              .slice(0, 3)
              .map((e) => `${e.ma ?? e.id}: ${e.message}`)
              .join(" · ")}${res.errors.length > 3 ? " …" : ""}`,
            { duration: 10_000 }
          );
          return;
        }
        setResultDialog({
          title: "Đã lưu thay đổi",
          rows: [
            { label: "Bảng", value: "Bình chữa cháy" },
            { label: "Kỳ kiểm tra", value: period.label },
            { label: "Số dòng đã lưu", value: `${res.saved} dòng`, strong: true },
            ...(res.adjusted > 0
              ? [{ label: "Tự nâng mức tình trạng", value: `${res.adjusted} dòng` }]
              : []),
          ],
          note:
            (res.adjusted > 0
              ? "Các dòng nâng mức là do quy tắc áp suất: áp suất từ mức cảnh báo trở lên thì không được để \"Khả dụng\". "
              : "") + "Chữ ký của các dòng vừa sửa đã bị xoá — cần ký lại để xác nhận số liệu mới.",
        });
        setDrafts((prev) => ({ ...prev, BCC: {} }));
        setEditing(false);
      },
      onError: (e: Error) => toast.error(e.message),
    });
  }

  const saving = bulkSave.isPending || bulkSaveCabinets.isPending || updateBulk.isPending || updatePanel.isPending;

  // ---- Ký tên hàng loạt + hộp thoại kết quả
  const [signOpen, setSignOpen] = useState(false);
  const [signInfo, setSignInfo] = useState<PcccBulkSignPreview | null>(null);
  const [resultDialog, setResultDialog] = useState<ResultDialog | null>(null);
  const signPreview = usePcccBulkSignPreview();
  const bulkSign = usePcccBulkSign();
  /** Bảng đang mở quyết định ký cái gì — tác vụ ký nằm trong tab nào thì ký tab đó. */
  const signTarget: "EXTINGUISHER" | "CABINET" = editableTab === "TCC" ? "CABINET" : "EXTINGUISHER";

  function openSignDialog() {
    setSignInfo(null);
    // HOÃN một nhịp mới mở hộp thoại. Menu của Radix khi đóng sẽ trả lại tiêu điểm, và
    // chính cú trả tiêu điểm đó bị hộp thoại hiểu là "bấm ra ngoài" nên đóng luôn hộp
    // thoại vừa mở — mở ở nhịp sau thì sự kiện kia đã xử lý xong.
    setTimeout(() => setSignOpen(true), 0);
    signPreview.mutate(
      { targetType: signTarget, period: effectiveLabel, cuongVi, machine: machine === "ALL" ? undefined : machine },
      {
        onSuccess: setSignInfo,
        onError: (e: Error) => {
          setSignOpen(false);
          toast.error(e.message);
        },
      }
    );
  }

  function confirmSign() {
    bulkSign.mutate(
      { targetType: signTarget, period: effectiveLabel, cuongVi, machine: machine === "ALL" ? undefined : machine },
      {
        onSuccess: (res) => {
          setSignOpen(false);
          setResultDialog({
            title: "Đã ký xác nhận",
            rows: [
              { label: "Kỳ kiểm tra", value: res.periodLabel },
              { label: "Cương vị", value: res.scopeLabel || "—" },
              { label: "Số dòng đã ký", value: `${res.signed} dòng`, strong: true },
              { label: "Người kiểm tra", value: res.signerName || "—" },
              { label: "Ngày kiểm tra", value: new Date(res.signedAt).toLocaleDateString("vi-VN") },
            ],
            signatureUrl: res.signatureUrl,
            note:
              res.resigned > 0
                ? `${res.resigned} dòng đã có chữ ký trước đó và vừa được ký đè bằng chữ ký mới.`
                : "Thẻ chữ ký của các dòng trên đã chuyển sang trạng thái đã ký.",
          });
        },
        onError: (e: Error) => toast.error(e.message),
      }
    );
  }

  /**
   * Điều kiện hiện nút "Xuất PDF" (Sổ theo dõi Mẫu số 01). Kỳ đã chốt / chưa tới thì
   * không hỏi server làm gì. Truy vấn theo KỲ + CƯƠNG VỊ đang lọc nên sang tháng mới,
   * kỳ mới chưa ai ký, nút TỰ biến mất — không cần cơ chế reset riêng.
   */
  const bookStatusQuery = usePcccBookStatus(
    { period: effectiveLabel, cuongVi },
    Boolean(effectiveLabel) && !periodNotStarted
  );
  const bookStatus = bookStatusQuery.data?.data;

  const archivesQuery = usePcccArchives(!viewLimited);
  const archives = archivesQuery.data?.data ?? [];
  const rollover = usePcccRollover();

  /**
   * Chạy tay đúng job của bộ hẹn giờ. Nói TRƯỚC cho người bấm biết sẽ xảy ra gì: đây là
   * việc không hoàn tác được (kỳ đã chốt thành chỉ đọc, kỳ quá 6 tháng bị xoá khỏi DB).
   */
  function runRollover() {
    const closeCurrent = clock?.isLastDayOfMonth === true;
    const lines = closeCurrent
      ? [
          `Hôm nay ${clock?.today} là NGÀY CUỐI THÁNG.`,
          ``,
          `• Xuất Excel kỳ ${period.label} lên S3 rồi chốt kỳ (chuyển chỉ đọc)`,
          `• Kỳ của tháng sau sẽ được sinh vào ngày 1`,
          `• DB chỉ giữ ${clock?.keepPeriods ?? 6} kỳ gần nhất, kỳ cũ hơn bị xoá (file trên S3 vẫn còn)`,
        ]
      : [
          `Hôm nay ${clock?.today ?? ""} chưa phải ngày cuối tháng, nên kỳ đang mở KHÔNG bị chốt.`,
          ``,
          `• Chốt + xuất lên S3 những kỳ của tháng trước còn bỏ ngỏ`,
          `• Sinh kỳ ${clock?.currentLabel ?? "tháng hiện tại"} nếu chưa có`,
          `• DB chỉ giữ ${clock?.keepPeriods ?? 6} kỳ gần nhất, kỳ cũ hơn bị xoá (file trên S3 vẫn còn)`,
        ];
    if (!window.confirm(`${lines.join("\n")}\n\nTiếp tục?`)) return;

    rollover.mutate(closeCurrent, {
      onSuccess: (res) => {
        if (res.errors.length > 0) {
          toast.error(`Chuyển kỳ chưa trọn: ${res.errors.join(" · ")}`, { duration: 12_000 });
          return;
        }
        const done = [
          res.closed.length ? `chốt ${res.closed.map((c) => c.label).join(", ")} và đã lưu lên S3` : null,
          res.created.length ? `sinh kỳ ${res.created.join(", ")}` : null,
          res.deleted.length ? `xoá khỏi DB ${res.deleted.join(", ")}` : null,
        ].filter(Boolean);
        toast.success(done.length ? `Đã ${done.join(" · ")}` : "Không có gì để chuyển — kỳ đang đúng tháng hiện tại");
        if (res.created.length > 0) setPeriodLabel(res.created[res.created.length - 1]);
        if (res.keptWithoutArchive.length > 0) {
          toast.warning(`Chưa xoá được ${res.keptWithoutArchive.join(", ")}: kỳ đó chưa có bản lưu trữ trên S3`, {
            duration: 12_000,
          });
        }
      },
      onError: (e: Error) => toast.error(e.message),
    });
  }

  /** Số bộ lọc đang bật — hiện thành huy hiệu trên nút "Bộ lọc". Ô tìm kiếm nằm trong
   *  thanh công cụ của bảng nên KHÔNG tính vào đây. */
  const activeFilterCount = [
    cuongVi !== "ALL",
    machine !== "ALL",
    tab === "BCC" && chungLoai !== "ALL",
    (tab === "BCC" || tab === "TCC") && tinhTrang !== "ALL",
    tab === "BCC" && giamSat !== "ALL",
    tab === "BCC" && quaHan,
    tab === "TCC" && loaiTu !== "ALL",
  ].filter(Boolean).length;

  /**
   * Đổi tab kèm cảnh báo bản nháp chưa lưu. Trả về false nếu người dùng bấm Huỷ —
   * bên gọi phải dừng lại, không được đặt bộ lọc của tab mà rốt cuộc không mở.
   */
  function switchTab(next: TabKey) {
    if (next !== tab && dirtyCount > 0 && !window.confirm(`Bỏ ${dirtyCount} dòng đang sửa chưa lưu ở tab hiện tại?`)) {
      return false;
    }
    if (editableTab) setDrafts((prev) => ({ ...prev, [editableTab]: {} }));
    setEditing(false);
    setTab(next);
    return true;
  }

  /**
   * Bấm thẻ KPI ở tab Tổng quan → mở bảng chi tiết đã lọc sẵn đúng con số vừa bấm.
   * Cương vị/tổ máy KHÔNG bị đụng tới (đó là phạm vi xem người dùng tự chọn), nhưng
   * các bộ lọc trạng thái thì đặt lại hết để hai lần bấm không chồng điều kiện lên nhau.
   */
  function drillFromOverview(target: PcccOverviewDrill) {
    if (!switchTab(target === "TCC_HONG_NANG" ? "TCC" : "BCC")) return;
    setTinhTrang("ALL");
    setQuaHan(false);
    setChungLoai("ALL");
    setLoaiTu("ALL");
    setGiamSat("ALL");
    setQ("");
    setPage(1);

    if (target === "BCC_KHA_DUNG") {
      setTinhTrang("Khả dụng");
      toast.success(`Đang lọc ${summaryQuery.data?.data.bcc.total.khaDung ?? ""} bình khả dụng`);
    } else if (target === "BCC_BAT_KHA_DUNG") {
      setTinhTrang("Bất khả dụng");
      toast.success(`Đang lọc ${summaryQuery.data?.data.bcc.total.batKhaDung ?? ""} bình bất khả dụng`);
    } else if (target === "BCC_QUA_HAN") {
      setQuaHan(true);
      toast.success(`Đang lọc ${summaryQuery.data?.data.bcc.total.quaHanThayThe ?? ""} bình quá hạn thay thế`);
    } else {
      // Thẻ đếm Ô LINH KIỆN hỏng nặng, còn bảng thì mỗi dòng là một TỦ — nên lọc theo
      // tình trạng tổng thể "Bất khả dụng", tức đúng những tủ sinh ra các ô hỏng nặng đó.
      setTinhTrang("Bất khả dụng");
      toast.success("Đang lọc các tủ bất khả dụng (có linh kiện hỏng nặng)");
    }
  }

  function clearFilters() {
    setCuongVi("ALL");
    setMachine("ALL");
    setChungLoai("ALL");
    setTinhTrang("ALL");
    setGiamSat("ALL");
    setLoaiTu("ALL");
    setQuaHan(false);
    setPage(1);
  }

  // Có bộ lọc/tìm kiếm nào đang bật → chân bảng ghi thêm "sau lọc"
  const hasActiveFilter =
    cuongVi !== "ALL" ||
    machine !== "ALL" ||
    tinhTrang !== "ALL" ||
    chungLoai !== "ALL" ||
    loaiTu !== "ALL" ||
    giamSat !== "ALL" ||
    quaHan ||
    q.trim().length > 0;

  /**
   * Danh sách cương vị của ô lọc. Cũng phải ƯU TIÊN TAB ĐANG MỞ: danh sách được cắt theo
   * phạm vi xem, mà phạm vi xem khác nhau theo bảng — lấy của tab Tổng quan thì tab Tủ
   * chữa cháy thiếu mất những cương vị nó đang thực sự hiển thị.
   */
  const cuongViList: PositionOption[] =
    (tab === "BCC"
      ? bccQuery.data?.meta?.cuongViList
      : tab === "TCC"
        ? tccQuery.data?.meta?.cuongViList
        : undefined) ??
    summaryQuery.data?.meta?.cuongViList ??
    bccQuery.data?.meta?.cuongViList ??
    tccQuery.data?.meta?.cuongViList ??
    [];
  const giamSatList: PositionOption[] = bccQuery.data?.meta?.giamSatList ?? [];

  /**
   * Phạm vi GHI theo cương vị (bước E). Đây chỉ để KHOÁ Ô cho khỏi sửa hụt công — server
   * vẫn chặn lại khi ghi, vì client gọi thẳng API được.
   *
   * LẤY THEO TAB ĐANG MỞ: phạm vi ghi KHÔNG còn giống nhau giữa các bảng (Trưởng kíp
   * điện được giao trọn bảng Tủ chữa cháy — xem lib/pccc-service.ts). Lấy bừa meta của
   * truy vấn nào về trước là tab tủ khoá nhầm theo phạm vi của tab bình.
   */
  const writeScope: PcccWriteScopeMeta | undefined =
    (tab === "BCC"
      ? bccQuery.data?.meta?.writeScope
      : tab === "TCC"
        ? tccQuery.data?.meta?.writeScope
        : tab === "FCD"
          ? fcdQuery.data?.meta?.writeScope
          : undefined) ??
    bccQuery.data?.meta?.writeScope ??
    tccQuery.data?.meta?.writeScope ??
    fcdQuery.data?.meta?.writeScope;
  const scopeLimited = Boolean(writeScope && !writeScope.all);

  async function download() {
    if (!effectiveLabel) return;
    setDownloading(true);
    try {
      const sheets = tab === "BCC" ? "BCC" : tab === "TCC" ? "TCC" : tab === "FCD" ? "FCD" : "BCC,TCC,FCD";
      const { blob, filename } = await apiDownload(
        `/api/pccc/export?period=${encodeURIComponent(effectiveLabel)}&sheets=${sheets}` +
          `&cuongVi=${encodeURIComponent(cuongVi)}&machine=${encodeURIComponent(machine)}`
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã xuất ${filename}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  /**
   * SỔ THEO DÕI PHƯƠNG TIỆN PCCC (Mẫu số 01) của cương vị đang đăng nhập. Server dựng
   * PDF, LƯU LÊN S3 rồi trả về đúng buffer đó — bản cầm tay và bản lưu trữ luôn khớp.
   */
  async function downloadBook() {
    if (!effectiveLabel) return;
    setDownloading(true);
    try {
      const { blob, filename } = await apiDownload(
        `/api/pccc/so-theo-doi/export?period=${encodeURIComponent(effectiveLabel)}&cuongVi=${encodeURIComponent(cuongVi)}`
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã xuất ${filename} và lưu lên kho S3`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  /** Tải lại đúng file đã lưu trên S3 lúc chốt kỳ — không dựng lại từ DB (DB có thể đã xoá kỳ đó). */
  async function downloadArchive(label: string) {
    setDownloading(true);
    try {
      const { blob, filename } = await apiDownload(`/api/pccc/archive?label=${encodeURIComponent(label)}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã tải bản lưu trữ ${label}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  if (periodsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (!period) {
    return (
      <div className="space-y-4">
        <PageHeader title="Quản lý thiết bị PCCC" description="Phân xưởng Vận hành 1" />
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-ink">Chưa có kỳ dữ liệu PCCC nào</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Nạp dữ liệu từ file Excel/Google Sheet bằng <code className="rounded bg-slate-100 px-1">npm run import:pccc</code>.
          </p>
        </div>
      </div>
    );
  }

  /**
   * Gộp phạm vi xem + sửa vào MỘT thẻ trạng thái trong thanh công cụ của bảng.
   * Hai phạm vi thường trùng nhau; nếu cấu hình phân quyền làm chúng khác nhau thì
   * vẫn giữ đủ thông tin trong cùng một thẻ, ngăn cách bằng một vạch mảnh.
   */
  const showWriteScope = !period.isClosed && scopeLimited;
  const viewScopeLabel = viewScope?.labels.length ? viewScope.labels.join(" · ") : "Chưa gán cương vị";
  const writeScopeLabel = writeScope?.labels.length ? writeScope.labels.join(" · ") : "Không có quyền sửa";
  const sameViewAndWriteScope = viewLimited && showWriteScope && viewScopeLabel === writeScopeLabel;
  const scopeStatus =
    viewLimited || showWriteScope ? (
      <span
        className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700"
        title={
          sameViewAndWriteScope
            ? "Bảng chỉ hiển thị và cho phép sửa/ký các thiết bị thuộc cương vị của bạn."
            : "Phạm vi xem và phạm vi sửa/ký được xác định theo cương vị và quyền của tài khoản."
        }
      >
        <ShieldCheck className="size-3.5 shrink-0" />
        {sameViewAndWriteScope ? (
          <span>Phạm vi xem &amp; sửa: {viewScopeLabel}</span>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {viewLimited && <span>Phạm vi xem: {viewScopeLabel}</span>}
            {viewLimited && showWriteScope && <span aria-hidden="true" className="h-3 w-px bg-sky-300" />}
            {showWriteScope && <span>Phạm vi sửa: {writeScopeLabel}</span>}
          </span>
        )}
      </span>
    ) : null;

  return (
    <div className="space-y-4">
      <PageHeader title="Quản lý thiết bị PCCC" description="Phân xưởng Vận hành 1">
        {/* Chọn KỲ đứng cùng hàng với các nút hành động: nó quyết định dữ liệu của cả 4
            tab, không phải một bộ lọc trong tab như các ô ở dải bên dưới. */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Kỳ</span>
          {/* Kỳ là lựa chọn BẮT BUỘC — không có mục "tất cả", nên dùng select thuần
              thay cho SelectBox (SelectBox luôn thêm 1 mục ALL, sẽ lặp kỳ hiện tại). */}
          <select
            value={period.label}
            disabled={dirtyCount > 0}
            title={dirtyCount > 0 ? "Lưu hoặc huỷ các thay đổi trước khi đổi kỳ" : undefined}
            onChange={(e) => {
              setPeriodLabel(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-white px-2 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-accent/20"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.label}>
                {p.label}
                {p.isClosed ? " (đã chốt)" : isFuturePeriodLabel(p, clock) ? " (chưa tới kỳ)" : ""}
              </option>
            ))}
          </select>
          {period.isClosed && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              <Lock className="size-3" /> Đã chốt — chỉ đọc
            </span>
          )}
          {/* Kỳ sinh sớm còn sót từ dữ liệu cũ: nói rõ vì sao không sửa được, thay vì để
              người dùng bấm mãi mà ô không mở. */}
          {periodNotStarted && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
              title={`Tháng này chưa bắt đầu. Kỳ đang làm việc là ${clock?.currentLabel ?? ""}.`}
            >
              <CalendarClock className="size-3" /> Chưa tới kỳ — chỉ đọc
            </span>
          )}
        </div>
        {/*
          SỔ THEO DÕI (Mẫu số 01) — chỉ hiện khi cương vị đã ký ĐỦ cả bảng Bình chữa cháy
          lẫn Tủ chữa cháy của kỳ. Không hiện dạng "nút xám bấm không được": người dùng
          chưa ký xong thì chưa có việc gì với nút này, cứ để thanh công cụ gọn.
          Điều kiện do SERVER tính trên toàn kỳ (xem app/api/pccc/so-theo-doi).
        */}
        {bookStatus?.ready && (
          <Button
            variant="outline"
            size="sm"
            onClick={downloadBook}
            disabled={downloading}
            title={`Sổ theo dõi phương tiện PCCC (Mẫu số 01) — ${bookStatus.positionLabel} · ${period.label}`}
            className="border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
          >
            <FileText className={cn("mr-1.5 size-4", downloading && "animate-pulse")} />
            Xuất PDF
          </Button>
        )}

        {/* Xuất Excel: kỳ đang xem lấy thẳng từ DB, các tháng cũ lấy BẢN LƯU TRỮ trên S3 —
            DB chỉ giữ 6 kỳ nên tháng cũ hơn chỉ còn tồn tại dưới dạng file. */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={downloading}>
              <Download className={cn("mr-1.5 size-4", downloading && "animate-pulse")} />
              Xuất Excel
              <ChevronDown className="ml-1 size-3.5 text-slate-400" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-2rem))] p-0">
            <div className="border-b border-slate-100 px-3.5 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">Kỳ đang xem</p>
              <button
                type="button"
                onClick={() => download()}
                disabled={downloading}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-slate-50 disabled:opacity-60"
              >
                <FileSpreadsheet className="size-4 shrink-0 text-emerald-600" />
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{period.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {hasActiveFilter ? "theo bộ lọc đang đặt" : "toàn bộ"} · {tab === "OVERVIEW" ? "cả 3 bảng" : tab}
                  </span>
                </span>
              </button>
            </div>
            <div className="max-h-72 overflow-auto px-3.5 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Bản lưu trữ trên S3 · 12 tháng gần nhất
              </p>
              {/* File lưu trữ là bản đầy đủ cả phân xưởng, không cắt lại theo cương vị
                  được — server trả 403, nên nói thẳng thay vì để danh sách rỗng khó hiểu. */}
              {viewLimited ? (
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  Bản lưu trữ là file đầy đủ của cả phân xưởng nên chỉ cấp quản lý tải được. Kỳ đang xem vẫn xuất được
                  phần thuộc cương vị của bạn ở mục trên.
                </p>
              ) : archives.length === 0 ? (
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  Chưa có bản lưu trữ nào. File được tạo tự động khi chốt kỳ cuối mỗi tháng.
                </p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {archives.map((a) => (
                    <li key={a.key}>
                      <button
                        type="button"
                        onClick={() => downloadArchive(a.label)}
                        disabled={downloading}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-slate-50 disabled:opacity-60"
                      >
                        <Archive className="size-4 shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{a.label}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {(a.bytes / 1024).toFixed(0)} KB
                            {a.archivedAt ? ` · lưu ${new Date(a.archivedAt).toLocaleDateString("vi-VN")}` : ""}
                          </span>
                        </span>
                        <Download className="size-3.5 shrink-0 text-slate-400" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* MỘT nút duy nhất thay cho "Sinh kỳ mới" + "Chốt kỳ": hai việc đó phải đi liền
            nhau (chốt thì bắt buộc xuất được file lên S3, xong mới sinh kỳ mới), tách ra
            chỉ tạo cơ hội làm nửa vời. Bình thường chẳng ai phải bấm — bộ hẹn giờ và
            đường tự động lúc mở trang đã lo; nút này là lối chạy tay khi job lỗi. */}
        {/* Chỉ hiện trong CỬA SỔ CUỐI THÁNG (3 ngày cuối tháng + 2 ngày đầu tháng sau,
            xem lib/pccc-clock.ts). Ngày do SERVER tính theo giờ VN — máy người dùng lệch
            đồng hồ thì nút hiện sai ngày, mà đây là thao tác không hoàn tác được. */}
        {can("pccc-close-period", ["manage", "full"]) && clock?.rolloverWindow === true && (
          <Button variant="outline" size="sm" onClick={runRollover} disabled={rollover.isPending}>
            <CalendarCheck className={cn("mr-1.5 size-4", rollover.isPending && "animate-spin")} />
            {rollover.isPending ? "Đang chuyển kỳ…" : "Chuyển kỳ"}
          </Button>
        )}
      </PageHeader>

      {/* Tabs + nút sửa bảng (chỉ tab Bình chữa cháy) */}
      <div className="flex flex-wrap items-end gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => switchTab(t.key)}
            className={cn(
              "-mb-px flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3.5 py-2 text-[13px] font-medium transition",
              tab === t.key
                ? "border-slate-200 bg-white text-navy shadow-[0_-2px_0_0_#2563EB_inset]"
                : "border-transparent text-muted-foreground hover:text-ink"
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}

        {/* Bộ lọc gom vào MỘT nút, bấm mới sổ bảng chọn — cùng khuôn với các trang
            Danh mục vật tư / Mệnh lệnh sản xuất. Tab Foam·CO2·Diesel·FM200 không có gì
            để lọc nên không hiện nút. */}
        {tab !== "FCD" && (
          <div className="mb-1 ml-auto">
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
                    <p className="mt-0.5 text-sm font-bold text-slate-900">
                      {tab === "OVERVIEW" ? "Tổng quan" : tab === "BCC" ? "Bình chữa cháy" : "Tủ chữa cháy"}
                    </p>
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
                    <SelectBox
                      value={cuongVi}
                      onChange={(v) => {
                        setCuongVi(v);
                        setPage(1);
                      }}
                      options={cuongViList.map((o) => ({ value: o.code, label: o.label }))}
                      allLabel="Tất cả cương vị"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-semibold text-slate-600">Tổ máy</Label>
                    {/* Tổ máy là chiều LỌC XEM: cùng chức danh vẫn thao tác được cả 2 tổ máy */}
                    <SelectBox
                      value={machine}
                      onChange={(v) => {
                        setMachine(v);
                        setPage(1);
                      }}
                      options={MACHINE_OPTIONS.map((m) => ({ value: m.value, label: m.label }))}
                      allLabel="Tất cả tổ máy"
                    />
                  </div>

                  {tab === "BCC" && (
                    <>
                      <div className="grid gap-1.5">
                        <Label className="text-xs font-semibold text-slate-600">Chủng loại</Label>
                        <SelectBox
                          value={chungLoai}
                          onChange={(v) => {
                            setChungLoai(v);
                            setPage(1);
                          }}
                          options={[...CHUNG_LOAI_OPTIONS]}
                          allLabel="Tất cả chủng loại"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs font-semibold text-slate-600">Tình trạng</Label>
                        <SelectBox
                          value={tinhTrang}
                          onChange={(v) => {
                            setTinhTrang(v);
                            setPage(1);
                          }}
                          options={TINH_TRANG_FILTERS}
                          allLabel="Tất cả tình trạng"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs font-semibold text-slate-600">Cấp giám sát</Label>
                        <SelectBox
                          value={giamSat}
                          onChange={(v) => {
                            setGiamSat(v);
                            setPage(1);
                          }}
                          options={giamSatList.map((o) => ({ value: o.code, label: o.label }))}
                          allLabel="Tất cả cấp giám sát"
                        />
                      </div>
                      <label className="flex items-center gap-2 self-end rounded-xl border border-input px-2.5 py-2.5 text-[13px]">
                        <input
                          type="checkbox"
                          checked={quaHan}
                          onChange={(e) => {
                            setQuaHan(e.target.checked);
                            setPage(1);
                          }}
                          className="size-4"
                        />
                        Chỉ quá hạn thay thế
                      </label>
                    </>
                  )}

                  {tab === "TCC" && (
                    <>
                      <div className="grid gap-1.5">
                        <Label className="text-xs font-semibold text-slate-600">Loại tủ</Label>
                        <SelectBox
                          value={loaiTu}
                          onChange={(v) => {
                            setLoaiTu(v);
                            setPage(1);
                          }}
                          options={["INDOOR", "OUTDOOR"]}
                          allLabel="Tất cả loại tủ"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs font-semibold text-slate-600">Tình trạng</Label>
                        <SelectBox
                          value={tinhTrang}
                          onChange={(v) => {
                            setTinhTrang(v);
                            setPage(1);
                          }}
                          options={TINH_TRANG_FILTERS}
                          allLabel="Tất cả tình trạng"
                        />
                      </div>
                    </>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {editableTab && can("pccc-manage", ["personal", "manage", "full"]) && !period.isClosed && (
          /* Đẩy sang mép phải. Ba tab kia đã có nút "Bộ lọc" mang `ml-auto` kéo cả cụm
             sang phải; tab Foam·CO2·Diesel·FM200 không có bộ lọc nên phải tự đẩy, không
             thì nút dính ngay sau dải tab. */
          <div className={cn("mb-1 flex items-center gap-2", tab === "FCD" && "ml-auto")}>
            {dirtyCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                {dirtyCount} dòng chưa lưu
              </span>
            )}
            {editing ? (
              <>
                <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                  <X className="mr-1.5 size-4" />
                  Huỷ
                </Button>
                <Button size="sm" onClick={saveEdits} disabled={saving}>
                  <Save className={cn("mr-1.5 size-4", saving && "animate-pulse")} />
                  {saving ? "Đang lưu…" : "Lưu"}
                </Button>
              </>
            ) : (
              /* Một cửa "Chỉnh sửa" gom hai tác vụ của người đi kiểm tra: sửa số liệu và
                 ký xác nhận. Hai việc này luôn đi cùng một lượt đi hiện trường nên đặt
                 cạnh nhau; tách thành hai nút rời ở thanh công cụ thì vừa chật vừa khiến
                 việc ký trông như một chức năng quản trị nào đó. */
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Pencil className="mr-1.5 size-4" />
                    Chỉnh sửa
                    <ChevronDown className="ml-1 size-3.5 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[260px]">
                  <DropdownMenuLabel className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {editableTab === "BCC" ? "Bình chữa cháy" : editableTab === "TCC" ? "Tủ chữa cháy" : "Foam · CO2 · Diesel · FM200"} · {period.label}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={beginEdit} className="gap-2">
                    <Pencil className="size-4 text-sky-600" />
                    <span className="min-w-0">
                      <span className="block font-medium">Sửa bảng</span>
                      <span className="block text-[11px] text-muted-foreground">Mở khoá ô để sửa, lưu một lượt</span>
                    </span>
                  </DropdownMenuItem>
                  {/* Tab Foam·CO2·Diesel·FM200 KHÔNG có mục này: ở đó ký từng bồn / từng
                      bảng bằng nút "Ký" ngay trên dòng, không ký theo cương vị. Để lọt
                      mục này vào đó là bấm một cái ký nhầm sang bảng bình chữa cháy. */}
                  {editableTab !== "FCD" && (
                  <DropdownMenuItem onSelect={openSignDialog} className="gap-2">
                    <PenLine className="size-4 text-emerald-600" />
                    <span className="min-w-0">
                      <span className="block font-medium">Ký tên</span>
                      <span className="block text-[11px] text-muted-foreground">
                        Ký xác nhận toàn bộ dòng thuộc cương vị của bạn
                      </span>
                    </span>
                  </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {/* Hộp thoại XÁC NHẬN KÝ — số liệu lấy từ server (preview), không đoán ở client:
          người bấm phải thấy đúng bao nhiêu dòng sắp bị ghi tên mình vào. */}
      <Dialog open={signOpen} onOpenChange={(open) => !open && setSignOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenLine className="size-5 text-emerald-600" />
              Ký xác nhận {signTarget === "CABINET" ? "tủ chữa cháy" : "bình chữa cháy"}
            </DialogTitle>
          </DialogHeader>
          {signPreview.isPending || !signInfo ? (
            <p className="py-4 text-[13px] text-muted-foreground">Đang kiểm tra phạm vi ký…</p>
          ) : !signInfo.hasSignature ? (
            /* Chưa có chữ ký số thì KHÔNG ký được — chữ ký ở đây là ảnh chữ ký thật trong
               hồ sơ, không phải cái tên gõ ra. Chỉ thẳng đường sang chỗ thêm, đừng bắt
               người dùng tự mò trong menu tài khoản. */
            <div className="space-y-3 py-1 text-[13px]">
              <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="font-semibold text-amber-900">Tài khoản của bạn chưa có chữ ký số</p>
                  <p className="mt-0.5 text-[12px] text-amber-800">
                    Chữ ký trong hồ sơ PCCC là ảnh chữ ký số của bạn, không phải chỉ ghi tên. Hãy thêm chữ ký một lần,
                    sau đó quay lại đây ký bình thường.
                  </p>
                </div>
              </div>
              <a
                href={signInfo.signatureSetupUrl}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5 hover:border-accent/40 hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">Thêm chữ ký số</span>
                  <span className="block text-[11px] text-muted-foreground">Tài khoản → mục “Chữ ký số”</span>
                </span>
                <ExternalLink className="size-4 shrink-0 text-slate-400" />
              </a>
            </div>
          ) : (
            <div className="space-y-3 py-1 text-[13px]">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <Row label="Kỳ kiểm tra" value={signInfo.periodLabel} />
                <Row label="Cương vị" value={signInfo.scopeLabel || "—"} />
                <Row label="Số dòng sẽ ký" value={`${signInfo.willSign} dòng`} strong />
                {signInfo.alreadySigned > 0 && (
                  <Row label="Trong đó đã ký trước đó" value={`${signInfo.alreadySigned} dòng — sẽ ký đè`} />
                )}
                <Row label="Người ký" value={signInfo.signerName || "—"} />
              </div>
              <p className="text-[12px] text-muted-foreground">
                Xác nhận sẽ ghi <b>chữ ký</b>, <b>người kiểm tra</b> ({signInfo.signerName}) và <b>ngày kiểm tra</b> (
                {new Date().toLocaleDateString("vi-VN")}) cho toàn bộ số dòng trên.
              </p>
              {signInfo.willSign === 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[12px] text-amber-800">
                  Không có dòng nào thuộc phạm vi ký của bạn. Kiểm tra lại bộ lọc cương vị.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSignOpen(false)} disabled={bulkSign.isPending}>
              Huỷ
            </Button>
            {signInfo?.hasSignature !== false && (
              <Button size="sm" onClick={confirmSign} disabled={bulkSign.isPending || !signInfo || signInfo.willSign === 0}>
                <PenLine className={cn("mr-1.5 size-4", bulkSign.isPending && "animate-pulse")} />
                {bulkSign.isPending ? "Đang ký…" : "Xác nhận ký"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hộp thoại KẾT QUẢ — dùng chung cho lưu sửa đổi và ký tên. Toast trôi mất sau vài
          giây, mà đây là hai việc để lại dấu vết trong hồ sơ nên phải đọc xong mới đóng. */}
      <Dialog open={Boolean(resultDialog)} onOpenChange={(open) => !open && setResultDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" />
              {resultDialog?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1 text-[13px]">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              {resultDialog?.rows.map((r) => (
                <Row key={r.label} label={r.label} value={r.value} strong={r.strong} />
              ))}
            </div>
            {resultDialog?.signatureUrl && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- ảnh chữ ký phục vụ qua proxy S3 */}
                <img src={resultDialog.signatureUrl} alt="Chữ ký đã đóng" className="h-10 w-auto max-w-[140px] object-contain" />
                <span className="text-[12px] text-emerald-800">Chữ ký số đã được đóng vào các dòng trên.</span>
              </div>
            )}
            {resultDialog?.note && <p className="text-[12px] text-muted-foreground">{resultDialog.note}</p>}
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setResultDialog(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {tab === "OVERVIEW" &&
        (summaryQuery.data ? (
          <PcccOverview summary={summaryQuery.data.data} onDrill={drillFromOverview} />
        ) : (
          <Skeleton className="h-96" />
        ))}

      {tab === "BCC" && (
        <>
          <PcccExtinguishers
            rows={bccQuery.data?.data ?? []}
            cuongViList={cuongViList}
            giamSatList={giamSatList}
            canManage={!readOnly}
            writeScope={writeScope}
            loading={bccQuery.isFetching}
            editing={editing}
            draft={draft}
            onDraftChange={onDraftChange}
            sort={sort}
            onSort={toggleSort}
            page={bccQuery.data?.meta?.page ?? 1}
            pageCount={bccQuery.data?.meta?.pageCount ?? 1}
            pageSize={pageSize}
            total={bccQuery.data?.meta?.total ?? 0}
            filtered={hasActiveFilter}
            toolbarExtra={scopeStatus}
            search={q}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            onSearchChange={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
        </>
      )}

      {tab === "TCC" && (
        <>
          <PcccCabinets
            rows={tccQuery.data?.data ?? []}
            groups={tccQuery.data?.meta?.groups ?? []}
            cuongViList={cuongViList}
            canManage={!readOnly}
            writeScope={writeScope}
            loading={tccQuery.isFetching}
            editing={editing}
            draft={draft}
            onDraftChange={onTccDraftChange}
            onToggleComponent={onToggleComponent}
            sort={sort}
            onSort={toggleSort}
            page={tccQuery.data?.meta?.page ?? 1}
            pageCount={tccQuery.data?.meta?.pageCount ?? 1}
            pageSize={pageSize}
            total={tccQuery.data?.meta?.total ?? 0}
            filtered={hasActiveFilter}
            toolbarExtra={scopeStatus}
            search={q}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            onSearchChange={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
        </>
      )}

      {tab === "FCD" &&
        (fcdQuery.data ? (
          <PcccBulks
            bulks={fcdQuery.data.data.bulks}
            panels={fcdQuery.data.data.panels}
            cuongViList={cuongViList}
            canManage={!readOnly}
            writeScope={writeScope}
            periodLabel={period.label}
            editing={editing && editableTab === "FCD"}
            draft={drafts.FCD}
            onDraftChange={onFcdDraftChange}
          />
        ) : (
          <Skeleton className="h-72" />
        ))}
    </div>
  );
}
