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
  CalendarPlus,
  Download,
  FileSpreadsheet,
  Filter,
  FlameKindling,
  Lock,
  LockOpen,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  Warehouse,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiDownload } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import {
  usePcccBulks,
  usePcccCabinets,
  usePcccCreatePeriod,
  usePcccExtinguishers,
  usePcccPeriods,
  usePcccSummary,
  usePcccTogglePeriodClose,
  usePcccBulkSaveExtinguishers,
  usePcccBulkSaveCabinets,
  type CabinetRow,
  type ExtinguisherRow,
  type PositionOption,
} from "@/hooks/usePccc";
import { PcccBulks } from "@/components/pccc/PcccBulks";
import { PcccCabinets } from "@/components/pccc/PcccCabinets";
import { PcccExtinguishers } from "@/components/pccc/PcccExtinguishers";
import { PcccOverview } from "@/components/pccc/PcccOverview";
import { MACHINE_OPTIONS } from "@/components/pccc/pccc-shared";
import { type SortState } from "@/components/pccc/pccc-table-card";
import { CHUNG_LOAI_OPTIONS, applyTccToggle, resolveTinhTrang } from "@/lib/pccc-status";

type TabKey = "OVERVIEW" | "BCC" | "TCC" | "FCD";

const TABS: { key: TabKey; label: string; icon: typeof FlameKindling }[] = [
  { key: "OVERVIEW", label: "Tổng quan", icon: ShieldCheck },
  { key: "BCC", label: "Bình chữa cháy", icon: FlameKindling },
  { key: "TCC", label: "Tủ chữa cháy", icon: Warehouse },
  { key: "FCD", label: "Foam · CO2 · Diesel · FM200", icon: FileSpreadsheet },
];

const TINH_TRANG_FILTERS = ["Khả dụng", "Cần theo dõi", "Bất khả dụng"];


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
        "h-9 rounded-md border border-input bg-white px-2 text-[13px] outline-none focus:ring-2 focus:ring-accent/20",
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
  const [drafts, setDrafts] = useState<{ BCC: Draft; TCC: Draft }>({ BCC: {}, TCC: {} });
  const [baselines, setBaselines] = useState<{ BCC: Record<string, string>; TCC: Record<string, string> }>({
    BCC: {},
    TCC: {},
  });
  /** Tab đang có thể bật chế độ sửa. Tổng quan và FCD chưa áp. */
  const editableTab = tab === "BCC" || tab === "TCC" ? tab : null;
  const draft = editableTab ? drafts[editableTab] : {};
  const dirtyCount = Object.keys(draft).length;

  const periodsQuery = usePcccPeriods();
  const periods = periodsQuery.data?.data ?? [];
  const period = periods.find((p) => p.label === periodLabel) ?? periods[0];
  const effectiveLabel = period?.label;
  const readOnly = !can("pccc-manage", ["personal", "manage", "full"]) || Boolean(period?.isClosed);

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

  const bulkSave = usePcccBulkSaveExtinguishers();
  const bulkSaveCabinets = usePcccBulkSaveCabinets();

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

  function saveEdits() {
    if (!editableTab) return;
    if (dirtyCount === 0) {
      setEditing(false);
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
          toast.success(`Đã lưu ${res.saved} tủ — chữ ký của các dòng đó đã bị xoá, cần ký lại`);
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
        toast.success(
          `Đã lưu ${res.saved} dòng${res.adjusted > 0 ? ` (${res.adjusted} dòng tự nâng mức tình trạng theo áp suất)` : ""} — chữ ký của các dòng đó đã bị xoá, cần ký lại`
        );
        setDrafts((prev) => ({ ...prev, BCC: {} }));
        setEditing(false);
      },
      onError: (e: Error) => toast.error(e.message),
    });
  }

  const saving = bulkSave.isPending || bulkSaveCabinets.isPending;

  const createPeriod = usePcccCreatePeriod();
  const toggleClose = usePcccTogglePeriodClose();

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

  const cuongViList: PositionOption[] =
    summaryQuery.data?.meta?.cuongViList ?? bccQuery.data?.meta?.cuongViList ?? tccQuery.data?.meta?.cuongViList ?? [];
  const giamSatList: PositionOption[] = bccQuery.data?.meta?.giamSatList ?? [];

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

  return (
    <div className="space-y-4">
      <PageHeader title="Quản lý thiết bị PCCC" description="Phân xưởng Vận hành 1">
        <Button variant="outline" size="sm" onClick={() => download()} disabled={downloading}>
          <Download className={cn("mr-1.5 size-4", downloading && "animate-pulse")} />
          Xuất Excel
        </Button>
        {can("pccc-manage", ["manage", "full"]) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              createPeriod.mutate(period.label, {
                onSuccess: (p) => {
                  setPeriodLabel(p.label);
                  toast.success(`Đã sinh kỳ ${p.label} từ ${period.label}`);
                },
                onError: (e: Error) => toast.error(e.message),
              })
            }
            disabled={createPeriod.isPending}
          >
            <CalendarPlus className="mr-1.5 size-4" />
            Sinh kỳ mới
          </Button>
        )}
        {can("pccc-close-period", ["manage", "full"]) && (
          <Button
            variant={period.isClosed ? "outline" : "default"}
            size="sm"
            onClick={() =>
              toggleClose.mutate(period.id, {
                onSuccess: () => toast.success(period.isClosed ? `Đã mở lại kỳ ${period.label}` : `Đã chốt kỳ ${period.label}`),
                onError: (e: Error) => toast.error(e.message),
              })
            }
            disabled={toggleClose.isPending}
          >
            {period.isClosed ? <LockOpen className="mr-1.5 size-4" /> : <Lock className="mr-1.5 size-4" />}
            {period.isClosed ? "Mở lại kỳ" : "Chốt kỳ"}
          </Button>
        )}
      </PageHeader>

      {/* Tabs + nút sửa bảng (chỉ tab Bình chữa cháy) */}
      <div className="flex flex-wrap items-end gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              if (dirtyCount > 0 && !window.confirm(`Bỏ ${dirtyCount} dòng đang sửa chưa lưu ở tab hiện tại?`)) return;
              if (editableTab) setDrafts((prev) => ({ ...prev, [editableTab]: {} }));
              setEditing(false);
              setTab(t.key);
            }}
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

        {/* Chọn KỲ nằm ở hàng tab: nó quyết định dữ liệu của cả 4 tab, không phải một
            bộ lọc trong tab như các ô còn lại. */}
        <div className="mb-1 ml-auto flex items-center gap-2">
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
                {p.isClosed ? " (đã chốt)" : ""}
              </option>
            ))}
          </select>
          {period.isClosed && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              <Lock className="size-3" /> Đã chốt — chỉ đọc
            </span>
          )}
        </div>

        {editableTab && can("pccc-manage", ["personal", "manage", "full"]) && !period.isClosed && (
          <div className="mb-1 flex items-center gap-2">
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
              <Button variant="outline" size="sm" onClick={beginEdit}>
                <Pencil className="mr-1.5 size-4" />
                Sửa bảng
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Dải điều khiển: kỳ + cương vị + bộ lọc riêng của từng tab */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
        <div className="flex items-center gap-1.5">
          <Filter className="size-3.5 text-muted-foreground" />
          <SelectBox
            value={cuongVi}
            onChange={(v) => {
              setCuongVi(v);
              setPage(1);
            }}
            options={cuongViList.map((o) => ({ value: o.code, label: o.label }))}
            allLabel="Tất cả cương vị"
          />
          {/* Tổ máy là chiều LỌC XEM: cùng một chức danh vẫn thao tác được cả 2 tổ máy */}
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
            <SelectBox value={chungLoai} onChange={(v) => { setChungLoai(v); setPage(1); }} options={[...CHUNG_LOAI_OPTIONS]} allLabel="Tất cả chủng loại" />
            <SelectBox value={tinhTrang} onChange={(v) => { setTinhTrang(v); setPage(1); }} options={TINH_TRANG_FILTERS} allLabel="Tất cả tình trạng" />
            <SelectBox
              value={giamSat}
              onChange={(v) => {
                setGiamSat(v);
                setPage(1);
              }}
              options={giamSatList.map((o) => ({ value: o.code, label: o.label }))}
              allLabel="Tất cả cấp giám sát"
            />
            <label className="flex items-center gap-1.5 text-[13px]">
              <input type="checkbox" checked={quaHan} onChange={(e) => { setQuaHan(e.target.checked); setPage(1); }} className="size-3.5" />
              Chỉ quá hạn thay thế
            </label>
          </>
        )}
        {tab === "TCC" && (
          <>
            <SelectBox value={loaiTu} onChange={(v) => { setLoaiTu(v); setPage(1); }} options={["INDOOR", "OUTDOOR"]} allLabel="Tất cả loại tủ" />
            <SelectBox value={tinhTrang} onChange={(v) => { setTinhTrang(v); setPage(1); }} options={TINH_TRANG_FILTERS} allLabel="Tất cả tình trạng" />
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => {
            summaryQuery.refetch();
            bccQuery.refetch();
            tccQuery.refetch();
            fcdQuery.refetch();
          }}
        >
          <RefreshCw className="mr-1.5 size-3.5" />
          Làm mới
        </Button>
      </div>

      {tab === "OVERVIEW" &&
        (summaryQuery.data ? (
          <PcccOverview summary={summaryQuery.data.data} />
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
          />
        ) : (
          <Skeleton className="h-72" />
        ))}
    </div>
  );
}
