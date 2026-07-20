"use client";
// =====================================================================
// TRANG "TỒN KHO VẬT TƯ THEO NHÓM" + TAB "CHỜ PHÂN NHÓM"
// Gom các mã vật tư ERP cùng nhóm (theo 4 loại: Dầu bôi trơn, Lõi lọc dầu,
// Hóa Chất, Bi Nghiền Than), tổng hợp tồn kho phục vụ đề xuất nhập thay thế.
// Loại vật tư chọn qua menu con trên sidebar (?loai=...), không có tab trong trang.
// Dữ liệu qua hooks/useOilGrouping (TanStack Query).
// =====================================================================
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Ban, ChevronLeft, ChevronRight, CircleDot, CloudDownload, Cpu, Download, Droplet, Filter, FlaskConical, Loader2, Pencil, Plus, RotateCcw, Search, Trash2, Unlink, Upload, X, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canManageMaterialCatalog } from "@/lib/constants";
import {
  useOilStock,
  useOilSuggestions,
  useAllGroupedErpMaterials,
  useOilGroupingSync,
  useOilGroupingConfirm,
  useCreateGroupedErpMaterial,
  useUpdateGroupedErpStock,
  useImportGroupedErpMaterials,
  useSyncErpStocksFromQlvt,
  useDeletePendingGroupedErpMaterials,
  useUpdateOilGroup,
  useDeleteOilGroup,
  useUngroupErpMaterial,
  GROUPING_CATEGORIES,
  type GroupingCategory,
  type OilStockGroup,
  type OilPendingItem,
  type ErpMaterialItem,
  type OilConfirmInput,
  type GroupedErpMaterialInput,
  type ErpStockUpdateInput,
} from "@/hooks/useOilGrouping";
import { downloadErpImportTemplate, readErpImportFile } from "@/lib/erp-import";
import { STANDALONE_GROUP_PREFIX } from "@/lib/oil-grouping-sync";
import { normalizeText } from "@/lib/nav";

const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 3 });

// Icon + gợi ý mặc định khi tạo nhóm mới cho từng loại vật tư.
const CATEGORY_META: Record<GroupingCategory, { icon: LucideIcon; defaultUnit: string; codeHint: string; nameHint: string }> = {
  "Dầu bôi trơn": { icon: Droplet, defaultUnit: "Lít", codeHint: "T32", nameHint: "Dầu tuabin T32" },
  "Lõi lọc dầu": { icon: Filter, defaultUnit: "Cái", codeHint: "LOC-TB", nameHint: "Lõi lọc dầu tuabin" },
  "Thiết bị C&I": { icon: Cpu, defaultUnit: "Cái", codeHint: "C&I", nameHint: "Thiết bị C&I" },
  "Hóa Chất": { icon: FlaskConical, defaultUnit: "Kg", codeHint: "NAOH", nameHint: "Xút NaOH 32%" },
  "Bi Nghiền Than": { icon: CircleDot, defaultUnit: "Viên", codeHint: "BI60", nameHint: "Bi nghiền than 60mm" },
};

// Slug trên URL (?loai=...) ↔ loại vật tư — khớp href menu con trong lib/nav.ts.
const CATEGORY_BY_SLUG: Record<string, GroupingCategory> = {
  "dau-boi-tron": "Dầu bôi trơn",
  "loi-loc-dau": "Lõi lọc dầu",
  "thiet-bi-ci": "Thiết bị C&I",
  "hoa-chat": "Hóa Chất",
  "bi-nghien-than": "Bi Nghiền Than",
};

/* ==================== TRANG CHÍNH ==================== */
export default function OilGroupingPage() {
  const params = useSearchParams();
  const { data: session } = useSession();
  const canManage = canManageMaterialCatalog({ role: session?.user?.role, position: session?.user?.position });
  const category: GroupingCategory = CATEGORY_BY_SLUG[params.get("loai") ?? ""] ?? "Dầu bôi trơn";
  const [tab, setTab] = useState<"stock" | "all" | "pending">("stock");
  const { data, isLoading, refetch } = useOilStock(category);
  const groups = data?.data.groups ?? [];
  const pendingCount = data?.data.pendingCount ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tồn kho vật tư theo nhóm"
        description="Gom các mã vật tư ERP cùng nhóm, tổng hợp tồn kho phục vụ đề xuất nhập thay thế"
      >
        {canManage && <GroupedErpActions groups={groups} category={category} />}
      </PageHeader>

      {/* Tabs tồn kho / chờ phân nhóm — loại vật tư chọn từ menu con sidebar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        <TabButton active={tab === "stock"} onClick={() => setTab("stock")} label="Tồn kho theo nhóm" />
        <TabButton active={tab === "all"} onClick={() => setTab("all")} label="Tất cả" />
        <TabButton active={tab === "pending"} onClick={() => setTab("pending")} label="Chờ phân nhóm" badge={pendingCount} />
        <span className="ml-auto mb-1.5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700">
          <CategoryIcon category={category} className="h-4 w-4" />
          {category}
        </span>
      </div>

      {tab === "stock" ? (
        <StockBoard groups={groups} loading={isLoading} onReload={() => refetch()} />
      ) : tab === "all" ? (
        <AllMaterialsTab key={category} category={category} canManage={canManage} />
      ) : (
        <PendingTab key={category} category={category} />
      )}
    </div>
  );
}

function AllMaterialsTab({ category, canManage }: { category: GroupingCategory; canManage: boolean }) {
  const pageSize = 30;
  const { data, isLoading } = useAllGroupedErpMaterials(category);
  const updateMaterial = useUpdateGroupedErpStock();
  const deleteMaterials = useDeletePendingGroupedErpMaterials();
  const items = data?.data ?? [];
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<ErpMaterialItem | null>(null);
  const [deleting, setDeleting] = useState<ErpMaterialItem | null>(null);
  const [changingStatus, setChangingStatus] = useState<ErpMaterialItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const query = normalizeText(search.trim());
    return items.filter((item) => {
      if (statusFilter === "active" && !item.isActive) return false;
      if (statusFilter === "inactive" && item.isActive) return false;
      return !query || normalizeText([item.code, item.name, item.unit, item.warehouse, item.oilType?.code, item.oilType?.name].filter(Boolean).join(" ")).includes(query);
    });
  }, [items, search, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);
  const firstItem = filtered.length ? (page - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(page * pageSize, filtered.length);

  useEffect(() => setPage(1), [search, statusFilter]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const save = async () => {
    if (!edit) return;
    if (!edit.code.trim() || !edit.name.trim() || !edit.unit.trim()) return void toast.error("Vui lòng nhập đủ mã, tên vật tư và ĐVT");
    try {
      await updateMaterial.mutateAsync({
        id: edit.id,
        code: edit.code.trim(),
        name: edit.name.trim(),
        unit: edit.unit.trim(),
        warehouse: edit.warehouse?.trim() ?? "",
        category: edit.category,
        erpStock: Math.max(0, Number(edit.erpStock) || 0),
      });
      toast.success("Đã cập nhật vật tư ERP");
      setEdit(null);
    } catch (error) { toast.error((error as Error).message); }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteMaterials.mutateAsync([deleting.id]);
      toast.success(`Đã xoá mã vật tư ${deleting.code}`);
      setDeleting(null);
    } catch (error) { toast.error((error as Error).message); }
  };

  const changeStatus = async () => {
    if (!changingStatus) return;
    const nextActive = !changingStatus.isActive;
    try {
      await updateMaterial.mutateAsync({ id: changingStatus.id, isActive: nextActive });
      toast.success(nextActive ? `Đã khôi phục mã ${changingStatus.code}` : `Đã ngừng sử dụng mã ${changingStatus.code}`);
      setChangingStatus(null);
    } catch (error) { toast.error((error as Error).message); }
  };

  if (isLoading) return <div className="py-12 text-center text-slate-400">Đang tải…</div>;
  return <div className="space-y-3">
    <div className="flex items-center gap-3">
      <div className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm mã, tên, kho hoặc nhóm vật tư..." className="pl-9" />
      </div>
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-10 rounded-md border border-input bg-white px-3 text-sm">
        <option value="active">Đang sử dụng</option><option value="inactive">Ngừng sử dụng</option><option value="all">Tất cả trạng thái</option>
      </select>
      <span className="whitespace-nowrap text-sm text-slate-500">{filtered.length}/{items.length} mã</span>
    </div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <th className="px-4 py-3 text-left">Mã vật tư</th><th className="px-3 py-3 text-left">Tên vật tư</th>
          <th className="px-3 py-3 text-left">ĐVT</th><th className="px-3 py-3 text-left">Kho</th>
          <th className="px-3 py-3 text-right">Tồn ERP</th><th className="px-3 py-3 text-left">Nhóm hiện tại</th><th className="px-3 py-3 text-center">Trạng thái</th>
          {canManage && <th className="px-3 py-3 text-center">Thao tác</th>}
        </tr></thead>
        <tbody>{paginated.map((item) => <tr key={item.id} className="border-t border-slate-100 hover:bg-blue-50/30">
          <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{item.code}</td><td className="px-3 py-2.5">{item.name}</td>
          <td className="px-3 py-2.5 text-slate-600">{item.unit}</td><td className="px-3 py-2.5 text-slate-600">{item.warehouse || "—"}</td>
          <td className="px-3 py-2.5 text-right font-semibold">{fmt(item.erpStock)}</td>
          <td className="px-3 py-2.5 text-slate-600">{item.oilType ? `${item.oilType.code.startsWith(STANDALONE_GROUP_PREFIX) ? "Nhóm riêng" : item.oilType.code} · ${item.oilType.name}` : "Chưa phân nhóm"}</td>
          <td className="px-3 py-2.5 text-center">{item.isActive ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Đang sử dụng</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Ngừng sử dụng</span>}</td>
          {canManage && <td className="px-3 py-2.5"><div className="flex justify-center gap-1">
            <Button variant="ghost" size="icon" title="Sửa vật tư" onClick={() => setEdit({ ...item })}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" title={item.isActive ? "Ngừng sử dụng" : "Khôi phục sử dụng"} className={item.isActive ? "text-amber-700 hover:bg-amber-50" : "text-emerald-700 hover:bg-emerald-50"} onClick={() => setChangingStatus(item)}>{item.isActive ? <Ban className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}</Button>
            <Button variant="ghost" size="icon" title="Xoá vật tư" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => setDeleting(item)}><Trash2 className="h-4 w-4" /></Button>
          </div></td>}
        </tr>)}</tbody>
      </table></div>
      {!filtered.length && <div className="py-12 text-center text-slate-400">Không có vật tư phù hợp.</div>}
      {!!filtered.length && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3">
        <span className="text-xs text-slate-500">Hiển thị {firstItem}–{lastItem} trong {filtered.length} mã · 30 mã/trang</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            <ChevronLeft className="h-4 w-4" /> Trang trước
          </Button>
          <span className="min-w-24 text-center text-sm font-semibold text-slate-700">Trang {page}/{totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
            Trang sau <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>}
    </div>

    <Dialog open={!!edit} onOpenChange={(open) => !open && setEdit(null)}><DialogContent className="sm:max-w-xl">
      <DialogHeader><DialogTitle>Sửa vật tư ERP</DialogTitle></DialogHeader>
      {edit && <div className="grid grid-cols-2 gap-3">
        <div><Label className="mb-1.5 block">Mã vật tư *</Label><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></div>
        <div><Label className="mb-1.5 block">ĐVT *</Label><Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} /></div>
        <div className="col-span-2"><Label className="mb-1.5 block">Tên vật tư *</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
        <div><Label className="mb-1.5 block">Kho</Label><Input value={edit.warehouse ?? ""} onChange={(e) => setEdit({ ...edit, warehouse: e.target.value })} /></div>
        <div><Label className="mb-1.5 block">Tồn ERP</Label><Input type="number" min={0} step="any" value={edit.erpStock} onChange={(e) => setEdit({ ...edit, erpStock: Number(e.target.value) })} /></div>
        <div className="col-span-2"><Label className="mb-1.5 block">Loại vật tư</Label><select value={edit.category} disabled={!!edit.oilType} onChange={(e) => setEdit({ ...edit, category: e.target.value as GroupingCategory })} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm">
          {GROUPING_CATEGORIES.map((value) => <option key={value}>{value}</option>)}
        </select>{edit.oilType && <p className="mt-1 text-xs text-slate-500">Mã đã gom nhóm nên không thể đổi loại vật tư.</p>}</div>
      </div>}
      <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Huỷ</Button><Button onClick={save} disabled={updateMaterial.isPending}>{updateMaterial.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu</Button></DialogFooter>
    </DialogContent></Dialog>
    <ConfirmDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)} title={`Xoá mã vật tư ${deleting?.code ?? ""}?`} description="Mã sẽ bị xoá khỏi danh sách ERP và khỏi nhóm hiện tại. Hành động này không thể hoàn tác." confirmLabel="Xoá" loading={deleteMaterials.isPending} onConfirm={remove} />
    <ConfirmDialog open={!!changingStatus} onOpenChange={(open) => !open && setChangingStatus(null)} title={changingStatus?.isActive ? `Ngừng sử dụng mã ${changingStatus.code}?` : `Khôi phục mã ${changingStatus?.code ?? ""}?`} description={changingStatus?.isActive ? "Mã sẽ rời nhóm hiện tại, không xuất hiện trong danh sách chọn cho phiếu mới và bị bỏ qua khi cập nhật tồn kho. Lịch sử phiếu cũ vẫn được giữ nguyên." : "Mã sẽ trở lại danh sách Chờ phân nhóm và tiếp tục được cập nhật tồn kho."} confirmLabel={changingStatus?.isActive ? "Ngừng sử dụng" : "Khôi phục"} loading={updateMaterial.isPending} onConfirm={changeStatus} />
  </div>;
}

function CategoryIcon({ category, className }: { category: GroupingCategory; className?: string }) {
  const Icon = CATEGORY_META[category].icon;
  return <Icon className={className} />;
}

function GroupedErpActions({ groups, category }: { groups: OilStockGroup[]; category: GroupingCategory }) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const importErp = useImportGroupedErpMaterials();
  const syncStocks = useSyncErpStocksFromQlvt();
  const createErp = useCreateGroupedErpMaterial();
  const [form, setForm] = useState<GroupedErpMaterialInput | null>(null);
  const [formError, setFormError] = useState("");
  const [syncingQlvt, setSyncingQlvt] = useState(false);

  async function syncFromQlvt() {
    if (syncingQlvt) return;
    setSyncingQlvt(true);
    const requestId = crypto.randomUUID();
    try {
      const extensionResult = await new Promise<{
        ok: boolean;
        message?: string;
        code?: string;
        qlvtUrl?: string;
        sourceCount?: number;
        rows?: ErpStockUpdateInput[];
      }>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          window.removeEventListener("message", onMessage);
          reject(new Error("Không tìm thấy tiện ích Đồng bộ QLVT. Hãy cài hoặc tải lại tiện ích Chrome."));
        }, 45_000);
        function onMessage(event: MessageEvent) {
          if (event.source !== window || event.data?.source !== "DUYENHAI1_EXTENSION" || event.data?.type !== "QLVT_SYNC_RESPONSE" || event.data?.requestId !== requestId) return;
          window.clearTimeout(timeout);
          window.removeEventListener("message", onMessage);
          resolve(event.data.result);
        }
        window.addEventListener("message", onMessage);
        window.postMessage({ source: "DUYENHAI1_WEB", type: "QLVT_SYNC_REQUEST", requestId }, window.location.origin);
      });

      if (!extensionResult?.ok) {
        if (extensionResult?.code === "QLVT_TAB_MISSING" && extensionResult.qlvtUrl) window.open(extensionResult.qlvtUrl, "_blank", "noopener,noreferrer");
        throw new Error(extensionResult?.message || "Không lấy được dữ liệu từ QLVT");
      }
      const rows = extensionResult.rows ?? [];
      if (!rows.length) throw new Error("QLVT không trả về dòng tồn kho hợp lệ");

      const result = await syncStocks.mutateAsync(rows);
      toast.success(`Đã đọc ${extensionResult.sourceCount ?? rows.length} dòng QLVT, xử lý ${result.updated} mã: ${result.changed} mã đổi tồn kho, ${result.warehouseChanged} mã đổi Kho; bỏ qua ${result.inactiveSkipped} mã ngừng sử dụng và ${result.notFound} mã chưa có trong hệ thống.`);
      if (result.errors.length) toast.warning(result.errors.slice(0, 3).join("; "));
    } catch (error) {
      toast.error((error as Error).message || "Không đồng bộ được tồn kho QLVT");
    } finally {
      setSyncingQlvt(false);
    }
  }

  async function importExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast.error("Chỉ chấp nhận file Excel .xlsx, .xls hoặc .csv");
      return;
    }

    try {
      const parsed = await readErpImportFile(file, category);
      if (!parsed.length) {
        toast.error("File import chưa có dòng hợp lệ. Cần đủ cột Mã, Tên, ĐVT, Loại vật tư, Số liệu ERP.");
        return;
      }
      const result = await importErp.mutateAsync(parsed);
      const detail = result.skipped ? `, bỏ qua ${result.skipped}` : "";
      toast.success(`Đã nhập ${parsed.length - result.skipped} dòng ERP: tạo mới ${result.created}, cập nhật ${result.updated}${detail}`);
      if (result.errors.length) toast.warning(result.errors.slice(0, 3).join("; "));
    } catch (error) {
      toast.error((error as Error).message || "Không nhập được file Excel");
    }
  }

  async function saveNew() {
    if (!form) return;
    setFormError("");
    const code = form.code.trim();
    const name = form.name.trim();
    const unit = form.unit.trim();
    if (!code) return setFormError("Vui lòng nhập Mã vật tư.");
    if (!name) return setFormError("Vui lòng nhập Tên vật tư.");
    if (!unit) return setFormError("Vui lòng nhập ĐVT.");

    try {
      await createErp.mutateAsync({
        ...form,
        code,
        name,
        unit,
        erpStock: Math.max(0, Number(form.erpStock) || 0),
      });
      toast.success("Đã thêm vật tư ERP");
      setForm(null);
    } catch (error) {
      const message = (error as Error).message;
      setFormError(message);
      toast.error(message);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          downloadErpImportTemplate(category);
          toast.success("Đã tạo file mẫu import");
        }}
      >
        <Download className="h-4 w-4" /> File mẫu
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => importInputRef.current?.click()} disabled={importErp.isPending}>
        {importErp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Nhập Excel
      </Button>
      <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importExcel} />
      <Button type="button" variant="outline" size="sm" onClick={syncFromQlvt} disabled={syncingQlvt || syncStocks.isPending} className="border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 hover:text-cyan-900">
        {syncingQlvt ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />} Đồng bộ từ QLVT
      </Button>
      <Button onClick={() => { setFormError(""); setForm({ code: "", name: "", unit: CATEGORY_META[category].defaultUnit, category, erpStock: 0 }); }}>
        <Plus className="h-4 w-4" /> Thêm vật tư ERP
      </Button>

      <Dialog open={!!form} onOpenChange={(open) => { if (!open) { setForm(null); setFormError(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Thêm vật tư ERP</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <Label className="mb-1.5 block">Mã vật tư *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label className="mb-1.5 block">ĐVT *</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Cái / Lít / Bộ..." />
              </div>
              <div className="col-span-2">
                <Label className="mb-1.5 block">Tên vật tư *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="mb-1.5 block">Loại vật tư</Label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as GroupingCategory })}
                  className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm font-medium text-slate-800"
                >
                  {GROUPING_CATEGORIES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <Label className="mb-1.5 block">Số liệu ERP</Label>
                <Input type="number" min={0} step="any" value={form.erpStock ?? 0} onChange={(e) => setForm({ ...form, erpStock: Number(e.target.value) })} />
              </div>
              {formError && (
                <div className="col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {formError}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setForm(null); setFormError(""); }}>Huỷ</Button>
            <Button onClick={saveNew} disabled={createErp.isPending}>
              {createErp.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
        active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}

/* ==================== TAB 1: TỒN KHO ==================== */
function StockBoard({
  groups,
  loading,
  onReload,
}: {
  groups: OilStockGroup[];
  loading: boolean;
  onReload: () => void;
}) {
  const { data: session } = useSession();
  const canManage = canManageMaterialCatalog({ role: session?.user?.role, position: session?.user?.position });
  const updateGroup = useUpdateOilGroup();
  const deleteGroup = useDeleteOilGroup();

  const [open, setOpen] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<{ id: string; code: string; name: string; baseUnit: string; minStock: string } | null>(null);
  const [deleting, setDeleting] = useState<OilStockGroup | null>(null);

  const toggle = (id: string) =>
    setOpen((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const startEdit = (g: OilStockGroup) =>
    setEdit({ id: g.id, code: g.code, name: g.name, baseUnit: g.baseUnit, minStock: g.minStock != null ? String(g.minStock) : "" });

  const saveEdit = async () => {
    if (!edit) return;
    const isStandalone = edit.code.startsWith(STANDALONE_GROUP_PREFIX);
    if ((!isStandalone && !edit.code.trim()) || !edit.name.trim() || !edit.baseUnit.trim()) {
      toast.error(isStandalone ? "Vui lòng nhập đủ tên và ĐVT chuẩn của nhóm" : "Vui lòng nhập đủ mã, tên và ĐVT chuẩn của nhóm");
      return;
    }
    try {
      await updateGroup.mutateAsync({
        id: edit.id,
        code: edit.code.trim(),
        name: edit.name.trim(),
        baseUnit: edit.baseUnit.trim(),
        minStock: edit.minStock.trim() === "" ? null : Number(edit.minStock),
      });
      toast.success("Đã cập nhật nhóm vật tư");
      setEdit(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      const res = await deleteGroup.mutateAsync(deleting.id);
      const label = deleting.code.startsWith(STANDALONE_GROUP_PREFIX) ? deleting.name : deleting.code;
      toast.success(`Đã xoá nhóm ${label}${res.ungrouped ? ` — ${res.ungrouped} mã trở về chờ phân nhóm` : ""}`);
      setDeleting(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading) return <div className="py-12 text-center text-slate-400">Đang tải…</div>;
  if (groups.length === 0)
    return (
      <div className="py-12 text-center text-slate-400">
        Chưa có nhóm nào cho loại vật tư này — duyệt các mã ở tab &quot;Chờ phân nhóm&quot; để bắt đầu.
      </div>
    );

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3 w-10"></th>
              <th className="text-left px-2 py-3">Nhóm vật tư</th>
              <th className="text-right px-4 py-3">Hiện có</th>
              <th className="text-right px-4 py-3">Tổng tồn ERP</th>
              <th className="text-right px-4 py-3">Ngưỡng tối thiểu</th>
              <th className="text-center px-4 py-3">Số mã</th>
              <th className="text-center px-4 py-3">Trạng thái</th>
              {canManage && <th className="text-center px-4 py-3">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows
                key={g.id}
                g={g}
                open={open.has(g.id)}
                toggle={toggle}
                canManage={canManage}
                onEdit={() => startEdit(g)}
                onDelete={() => setDeleting(g)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
        <span className="text-xs text-slate-500">
          {groups.length} nhóm • {groups.reduce((s, g) => s + g.materialCount, 0)} mã ERP đã gom
        </span>
        <button onClick={onReload} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
          ⟳ Làm mới
        </button>
      </div>

      {/* Dialog sửa nhóm */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Sửa nhóm vật tư</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid grid-cols-2 gap-3">
              {!edit.code.startsWith(STANDALONE_GROUP_PREFIX) && (
                <div className="col-span-2 sm:col-span-1">
                  <Label className="mb-1.5 block">Mã nhóm *</Label>
                  <Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />
                </div>
              )}
              <div className="col-span-2 sm:col-span-1">
                <Label className="mb-1.5 block">ĐVT chuẩn *</Label>
                <Input value={edit.baseUnit} onChange={(e) => setEdit({ ...edit, baseUnit: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="mb-1.5 block">Tên nhóm *</Label>
                <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="mb-1.5 block">Ngưỡng tối thiểu (theo ĐVT chuẩn — để trống nếu không cảnh báo)</Label>
                <Input type="number" min={0} value={edit.minStock} onChange={(e) => setEdit({ ...edit, minStock: e.target.value })} />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                Lưu ý: đổi ĐVT chuẩn sẽ không tự quy đổi lại hệ số của các mã đã gom.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Huỷ</Button>
            <Button onClick={saveEdit} disabled={updateGroup.isPending}>
              {updateGroup.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Xác nhận xoá nhóm */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Xoá nhóm ${deleting.code.startsWith(STANDALONE_GROUP_PREFIX) ? deleting.name : `${deleting.code} · ${deleting.name}`}?` : "Xoá nhóm"}
        description={
          deleting
            ? deleting.materialCount > 0
              ? `${deleting.materialCount} mã vật tư trong nhóm sẽ trở về tab "Chờ phân nhóm" (không mất dữ liệu ERP). Hành động này không thể hoàn tác.`
              : "Nhóm chưa có mã nào. Hành động này không thể hoàn tác."
            : undefined
        }
        confirmLabel="Xoá nhóm"
        loading={deleteGroup.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function GroupRows({
  g,
  open,
  toggle,
  canManage,
  onEdit,
  onDelete,
}: {
  g: OilStockGroup;
  open: boolean;
  toggle: (id: string) => void;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const updateErpStock = useUpdateGroupedErpStock();
  const ungroupMaterial = useUngroupErpMaterial();
  const [ungrouping, setUngrouping] = useState<OilStockGroup["materials"][number] | null>(null);

  const confirmUngroup = async () => {
    if (!ungrouping) return;
    try {
      await ungroupMaterial.mutateAsync(ungrouping.id);
      toast.success(`Đã tách ${ungrouping.erpCode} khỏi nhóm và đưa về Chờ phân nhóm`);
      setUngrouping(null);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-blue-50/40 cursor-pointer" onClick={() => toggle(g.id)}>
        <td className="px-4 py-3 text-slate-400">{open ? "▾" : "▸"}</td>
        <td className="px-2 py-3">
          {!g.code.startsWith(STANDALONE_GROUP_PREFIX) && (
            <span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5 mr-2 text-slate-600">{g.code}</span>
          )}
          <span className="font-semibold text-slate-800">{g.name}</span>
        </td>
        <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
          <span className="font-bold tabular-nums text-slate-800" title="Tự động lấy từ tồn kho Danh mục vận hành 1">
            {fmt(g.onHandQty)} <span className="font-normal text-slate-400">{g.baseUnit}</span>
          </span>
        </td>
        <td className="px-4 py-3 text-right font-bold text-slate-800">
          {fmt(g.totalQty)} <span className="font-normal text-slate-400">{g.baseUnit}</span>
        </td>
        <td className="px-4 py-3 text-right text-slate-500">
          {g.minStock != null ? `${fmt(g.minStock)} ${g.baseUnit}` : "—"}
        </td>
        <td className="px-4 py-3 text-center text-slate-600">{g.materialCount}</td>
        <td className="px-4 py-3 text-center">
          {g.belowMin ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-1">
              ⚠ Dưới ngưỡng — cần đề xuất nhập
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
              ✓ Đủ tồn
            </span>
          )}
        </td>
        {canManage && (
          <td className="px-4 py-3">
            <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" title="Sửa nhóm" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Xoá nhóm"
                className="text-muted-foreground hover:bg-red-50 hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </td>
        )}
      </tr>
      {open &&
        g.materials.map((m) => (
          <tr key={m.id} className="bg-slate-50/60 border-t border-slate-100">
            <td></td>
            <td className="px-2 py-2 pl-8">
              <span className="font-mono text-xs text-slate-600">{m.erpCode}</span>
              <span className="ml-3 text-slate-500 text-xs">{m.name}</span>
              {m.origin && (
                <span className="ml-2 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                  {m.origin}
                </span>
              )}
            </td>
            <td></td>
            <td className="px-4 py-2 text-right text-slate-600 text-xs">
              <InlineQtyCell
                value={m.erpQty}
                unit={m.unit}
                canEdit={canManage}
                ariaLabel={`Sửa số liệu ERP ${m.erpCode}`}
                onSave={async (value) => {
                  await updateErpStock.mutateAsync({ id: m.id, erpStock: value });
                  toast.success(`Đã cập nhật số liệu ERP: ${m.erpCode} → ${fmt(value)} ${m.unit}`);
                }}
              />
              {m.conversionFactor !== 1 && <span className="ml-2 text-slate-400">= {fmt(m.qtyInBase)} {g.baseUnit}</span>}
            </td>
            <td colSpan={canManage ? 3 : 3}></td>
            {canManage && (
              <td className="px-4 py-2 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  title="Tách mã khỏi nhóm"
                  className="text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                  onClick={() => setUngrouping(m)}
                >
                  <Unlink className="h-4 w-4" /> Tách nhóm
                </Button>
              </td>
            )}
          </tr>
        ))}
      <ConfirmDialog
        open={!!ungrouping}
        onOpenChange={(open) => !open && setUngrouping(null)}
        title={ungrouping ? `Tách mã ${ungrouping.erpCode} khỏi nhóm?` : "Tách mã khỏi nhóm"}
        description={`Mã vật tư sẽ được đưa về tab "Chờ phân nhóm". Nhóm ${g.code.startsWith(STANDALONE_GROUP_PREFIX) ? g.name : `${g.code} · ${g.name}`} và các mã còn lại vẫn được giữ nguyên.`}
        confirmLabel="Tách khỏi nhóm"
        loading={ungroupMaterial.isPending}
        onConfirm={confirmUngroup}
      />
    </>
  );
}

/** Ô số liệu ERP: kích đúp để sửa, Enter lưu, Esc huỷ. */
function InlineQtyCell({
  value,
  unit,
  canEdit,
  onSave,
  ariaLabel = "Sửa số liệu ERP",
}: {
  value: number;
  unit: string;
  canEdit: boolean;
  onSave: (v: number) => Promise<void>;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <span
        className={`inline-block rounded px-1.5 py-0.5 font-bold tabular-nums text-slate-800 ${
          canEdit ? "cursor-text transition-colors hover:bg-sky-50 hover:ring-1 hover:ring-sky-200" : ""
        }`}
        title={canEdit ? "Nhấn đúp để sửa" : undefined}
        onDoubleClick={() => {
          if (!canEdit) return;
          setDraft(String(value));
          setEditing(true);
        }}
      >
        {fmt(value)} <span className="font-normal text-slate-400">{unit}</span>
      </span>
    );
  }

  return (
    <input
      autoFocus
      type="number"
      min={0}
      step="any"
      aria-label={ariaLabel}
      value={draft}
      disabled={saving}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={async (e) => {
        if (e.key === "Escape") return setEditing(false);
        if (e.key !== "Enter") return;
        const next = Number(draft);
        if (!Number.isFinite(next) || next < 0) return void toast.error("Số liệu ERP phải là số không âm");
        if (next === value) return setEditing(false);
        setSaving(true);
        try {
          await onSave(next);
          setEditing(false);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setSaving(false);
        }
      }}
      onBlur={() => !saving && setEditing(false)}
      className="h-8 w-24 rounded-md border border-blue-400 bg-white px-2 text-right text-sm font-semibold tabular-nums outline-none ring-2 ring-blue-200"
    />
  );
}

/* ==================== TAB 2: CHỜ PHÂN NHÓM ==================== */
function PendingTab({ category }: { category: GroupingCategory }) {
  const meta = CATEGORY_META[category];
  const { data, isLoading } = useOilSuggestions(category);
  const sync = useOilGroupingSync();
  const confirm = useOilGroupingConfirm();
  const deletePending = useDeletePendingGroupedErpMaterials();
  const items = data?.data.items ?? [];
  const oilTypes = data?.data.oilTypes ?? [];

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  // form gom nhóm
  const [targetType, setTargetType] = useState<string>("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState(meta.defaultUnit);
  const [newMin, setNewMin] = useState("");
  const [factor, setFactor] = useState("1");

  const busy = sync.isPending || confirm.isPending || deletePending.isPending;

  const typeById = useMemo(() => new Map(oilTypes.map((t) => [t.id, t])), [oilTypes]);
  const filteredItems = useMemo(() => {
    const query = normalizeText(search.trim());
    if (!query) return items;
    return items.filter((item) => {
      const suggestion = item.suggestedOilTypeId ? typeById.get(item.suggestedOilTypeId) : null;
      return normalizeText([
        item.erpCode,
        item.name,
        item.unit,
        suggestion?.code,
        suggestion?.name,
      ].filter(Boolean).join(" ")).includes(query);
    });
  }, [items, search, typeById]);
  const allFilteredChecked = filteredItems.length > 0 && filteredItems.every((item) => checked.has(item.id));

  const toggleAllFiltered = (select: boolean) => {
    setChecked((current) => {
      const next = new Set(current);
      for (const item of filteredItems) {
        if (select) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  };

  const toggleCheck = (id: string) =>
    setChecked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const runScan = async () => {
    try {
      const r = await sync.mutateAsync(category);
      toast.success(`Đã quét ${r.scanned} mã: ${r.suggested} có gợi ý, ${r.unmapped} chưa nhận diện`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const submit = async (payload: OilConfirmInput, successMsg: string) => {
    try {
      await confirm.mutateAsync(payload);
      setChecked(new Set());
      toast.success(successMsg);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Duyệt nhanh 1 gợi ý
  const acceptSuggestion = (it: OilPendingItem) =>
    submit(
      { materialIds: [it.id], action: "CONFIRM", oilTypeId: it.suggestedOilTypeId ?? undefined },
      `Đã gom ${it.erpCode} theo gợi ý`
    );

  // Gom các mã đã chọn
  const confirmSelected = () => {
    if (checked.size === 0) return;
    const base: OilConfirmInput = {
      materialIds: [...checked],
      action: "CONFIRM",
      conversionFactor: Number(factor) || 1,
    };
    if (targetType === "__new__") {
      base.newOilType = {
        code: newCode,
        name: newName,
        baseUnit: newUnit,
        minStock: newMin ? Number(newMin) : undefined,
        category,
      };
    } else {
      base.oilTypeId = targetType;
    }
    submit(base, `Đã gom ${checked.size} mã vào nhóm`);
  };

  const createStandaloneGroups = () => {
    if (checked.size === 0) return;
    submit({ materialIds: [...checked], action: "SINGLE" }, `Đã tạo ${checked.size} nhóm vật tư riêng`);
  };

  const confirmDeleteSelected = async () => {
    const ids = deletingIds ?? [];
    if (!ids.length) return;
    try {
      const result = await deletePending.mutateAsync(ids);
      setChecked((prev) => new Set([...prev].filter((id) => !result.ids.includes(id))));
      setDeletingIds(null);
      toast.success(`Đã xoá ${result.count} mã vật tư nhập sai`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  if (isLoading) return <div className="py-12 text-center text-slate-400">Đang tải…</div>;

  return (
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
          onClick={runScan}
          disabled={busy}
          className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          🔍 Quét gợi ý lại
        </button>
        <span className="text-sm text-slate-500">
          {search.trim() ? `${filteredItems.length}/${items.length} mã phù hợp` : `${items.length} mã chờ phân nhóm`} • Đã chọn {checked.size}
        </span>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="ml-auto"
          disabled={busy || checked.size === 0}
          onClick={() => setDeletingIds([...checked])}
        >
          <Trash2 className="h-4 w-4" /> Xoá đã chọn
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="py-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
          ✓ Tất cả mã vật tư loại &quot;{category}&quot; đã được gom nhóm.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white mb-4">
            <div className="border-b border-slate-200 bg-slate-50/70 p-3">
              <div className="relative max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm theo mã, tên vật tư hoặc nhóm gợi ý..."
                  aria-label="Tìm kiếm vật tư chờ phân nhóm"
                  className="h-10 bg-white pl-9 pr-10"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Xóa nội dung tìm kiếm"
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allFilteredChecked}
                        onChange={(e) => toggleAllFiltered(e.target.checked)}
                        aria-label="Chọn tất cả vật tư đang hiển thị"
                      />
                    </th>
                    <th className="text-left px-2 py-3">Mã vật tư</th>
                    <th className="text-left px-2 py-3">Tên vật tư</th>
                    <th className="text-left px-3 py-3">Kho</th>
                    <th className="text-right px-3 py-3">Tồn</th>
                    <th className="text-left px-3 py-3">Gợi ý của hệ thống</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((it) => {
                    const sug = it.suggestedOilTypeId ? typeById.get(it.suggestedOilTypeId) : null;
                    return (
                      <tr key={it.id} className="border-t border-slate-100 hover:bg-blue-50/30">
                        <td className="px-4 py-2.5 text-center">
                          <input type="checkbox" checked={checked.has(it.id)} onChange={() => toggleCheck(it.id)} />
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5 text-slate-600">
                            {it.erpCode}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-slate-800">{it.name}</td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {it.warehouse || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600">
                          {fmt(it.erpQty)} {it.unit}
                        </td>
                        <td className="px-3 py-2.5">
                          {sug ? (
                            <div>
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                                ★ {sug.code} · {sug.name}
                                <span className="text-amber-500">
                                  {Math.round((it.suggestedScore ?? 0) * 100)}%
                                </span>
                              </span>
                              {it.suggestedReason && (
                                <div className="text-[11px] text-slate-400 mt-1">{it.suggestedReason}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Không có gợi ý — chọn nhóm thủ công</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {sug && (
                            <button
                              onClick={() => acceptSuggestion(it)}
                              disabled={busy}
                              className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
                            >
                              ✓ Duyệt
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                        Không tìm thấy vật tư phù hợp với “{search.trim()}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Thanh thao tác gom hàng loạt */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-700 mb-3">Gom {checked.size} mã đã chọn vào:</div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-500">
                Nhóm đích
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-56"
                >
                  <option value="">— Chọn nhóm —</option>
                  {oilTypes.filter((t) => !t.code.startsWith(STANDALONE_GROUP_PREFIX)).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.name} ({t.baseUnit})
                    </option>
                  ))}
                  <option value="__new__">＋ Tạo nhóm mới…</option>
                </select>
              </label>

              {targetType === "__new__" && (
                <>
                  <label className="text-xs text-slate-500">
                    Mã nhóm
                    <input
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder={meta.codeHint}
                      className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-24"
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Tên nhóm
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={meta.nameHint}
                      className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-56"
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    ĐVT chuẩn
                    <input
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                      className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-20"
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Ngưỡng tối thiểu
                    <input
                      value={newMin}
                      onChange={(e) => setNewMin(e.target.value)}
                      placeholder="1500"
                      className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-28"
                    />
                  </label>
                </>
              )}

              <label className="text-xs text-slate-500">
                Hệ số quy đổi → ĐVT chuẩn
                <input
                  value={factor}
                  onChange={(e) => setFactor(e.target.value)}
                  className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-28"
                  title="Ví dụ 1 phuy = 209 Lít → nhập 209. Cùng ĐVT → để 1."
                />
              </label>

              <button
                onClick={confirmSelected}
                disabled={busy || checked.size === 0 || !targetType}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40"
              >
                Gom nhóm
              </button>
              <button
                onClick={createStandaloneGroups}
                disabled={busy || checked.size === 0}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
              >
                Không cần gom
              </button>
            </div>
          </div>
        </>
      )}
      <ConfirmDialog
        open={!!deletingIds}
        onOpenChange={(open) => !open && setDeletingIds(null)}
        title={`Xoá ${deletingIds?.length ?? 0} mã vật tư đang chờ phân nhóm?`}
        description="Các dòng nhập liệu sai sẽ bị xoá khỏi danh sách chờ phân nhóm. Hành động này không thể hoàn tác."
        confirmLabel="Xoá"
        loading={deletePending.isPending}
        onConfirm={confirmDeleteSelected}
      />
    </div>
  );
}
