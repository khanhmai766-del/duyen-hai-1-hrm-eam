"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Plus, Minus, Package, Pencil, Trash2, Upload, X, Loader2, ImageIcon, Repeat, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, Check, FileText, Link2, ExternalLink, Droplet, Filter, Cpu, FlaskConical, CircleDot, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ExportButton } from "@/components/shared/export-button";
import { SearchBar } from "@/components/shared/search-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { PeakProtectedRoute } from "@/components/shared/peak-protected-route";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useMaterials, useUpsertMaterial, useDeleteMaterial, useDeleteMaterials, type MaterialWithDevices, type MaterialReplacementInput } from "@/hooks/useMaterials";
import { useErpMaterials } from "@/hooks/useErpMaterials";
import { ReplacementDrawer } from "@/components/materials/replacement-drawer";
import { ReplacementPointsEditor } from "@/components/materials/replacement-points-editor";
import { useCreateReplacement } from "@/hooks/useReplacements";
import { MATERIAL_CATEGORIES, DEFECT_UNITS, EQUIPMENT_BLOCKS, blockForPosition, canManageMaterialCatalog } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { cn, formatDateInput } from "@/lib/utils";
import type { Material } from "@/types";

// Tab tổ máy — key trùng giá trị Material.machine (S1 | S2 | COMMON).
const MACHINE_TABS: { key: (typeof DEFECT_UNITS)[number]; label: string }[] = [
  { key: "S1", label: "Tổ Máy S1" },
  { key: "S2", label: "Tổ Máy S2" },
  { key: "COMMON", label: "COMMON" },
];

// Tab loại vật tư (icon theo nhóm) — key trùng giá trị Material.category.
const MATERIAL_CATEGORY_TABS: { key: (typeof MATERIAL_CATEGORIES)[number]; icon: LucideIcon }[] = [
  { key: "Dầu bôi trơn", icon: Droplet },
  { key: "Lõi lọc dầu", icon: Filter },
  { key: "Thiết bị C&I", icon: Cpu },
  { key: "Hóa Chất", icon: FlaskConical },
  { key: "Bi Nghiền Than", icon: CircleDot },
];

type MaterialEdit = Partial<Material> & {
  id?: string;
  erpCodes?: string[];
  documentUrl?: string | null;
  documentName?: string | null;
  replacements?: MaterialReplacementInput[];
  machines?: string[];
};

export default function MaterialsPage() {
  return (
    <PeakProtectedRoute>
      <MaterialsPageContent />
    </PeakProtectedRoute>
  );
}

function MaterialsPageContent() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  // Xem bảng: mọi cương vị. Thao tác (Thêm/Sửa/Xoá/Xuất): Quản đốc/Phó Quản đốc/Kỹ thuật viên/Quản trị.
  const canManage = canManageMaterialCatalog({ role, position: session?.user?.position });
  const { data, isLoading } = useMaterials();
  const erpMaterialsQuery = useErpMaterials();
  const upsert = useUpsertMaterial();
  const del = useDeleteMaterial();
  const delMany = useDeleteMaterials();
  const router = useRouter();
  const params = useSearchParams();
  const searchParam = params.get("search") ?? "";
  const categoryParam = params.get("category");
  const initialCategory = (MATERIAL_CATEGORIES as readonly string[]).includes(categoryParam ?? "")
    ? categoryParam!
    : MATERIAL_CATEGORIES[0];
  const [q, setQ] = React.useState(searchParam);
  const [categoryFilter, setCategoryFilter] = React.useState<string>(initialCategory);
  const [blockFilter, setBlockFilter] = React.useState("ALL");
  const [edit, setEdit] = React.useState<MaterialEdit | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [deleting, setDeleting] = React.useState<Material | null>(null);
  const [isNew, setIsNew] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [replMaterial, setReplMaterial] = React.useState<Material | null>(null);
  const [erpSearch, setErpSearch] = React.useState("");

  // Mở drawer "Theo dõi thay thế" khi điều hướng kèm ?track=<materialId>
  // (vd bấm cảnh báo thay thế trong chuông thông báo).
  // Tab tổ máy đồng bộ với URL (?may=S1|S2|COMMON) — menu con "Danh mục vật tư PXVH1"
  // ở sidebar điều hướng bằng tham số này và highlight theo đúng tab đang mở.
  const mayParam = params.get("may");
  const machineTab: (typeof DEFECT_UNITS)[number] = (DEFECT_UNITS as readonly string[]).includes(mayParam ?? "")
    ? (mayParam as (typeof DEFECT_UNITS)[number])
    : "S1";
  const machineLabel = MACHINE_TABS.find((t) => t.key === machineTab)?.label ?? machineTab;
  const erpMaterials = (erpMaterialsQuery.data?.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    unit: string;
    erpStock: number;
    category?: string | null;
  }>;

  function erpByCode(code?: string | null) {
    return erpMaterials.find((item) => item.code === code) ?? null;
  }

  function materialErpCodes(material: Pick<MaterialEdit, "code" | "erpCodes">) {
    return Array.from(new Set([...(material.erpCodes ?? []), material.code].map((code) => String(code ?? "").trim()).filter(Boolean)));
  }

  function erpListByCodes(codes: string[]) {
    return codes.map((code) => erpByCode(code)).filter((item): item is NonNullable<ReturnType<typeof erpByCode>> => Boolean(item));
  }

  function erpStockByCodes(codes: string[]) {
    return erpListByCodes(codes).reduce((sum, item) => sum + (Number(item.erpStock) || 0), 0);
  }

  function categoryMatches(value?: string | null, target = categoryFilter) {
    return (
      value === target ||
      (target === "Hóa Chất" && (value === "Vật tư tiêu hao" || value === "Hóa chất")) ||
      (target === "Bi Nghiền Than" && (value === "Bi nghiền than" || value === "Bi nghiền"))
    );
  }

  function toggleErpMaterial(code: string, checked: boolean) {
    setEdit((prev) => ({
      ...(prev ?? {}),
      code: checked
        ? materialErpCodes({ code: prev?.code, erpCodes: prev?.erpCodes }).concat(code)[0]
        : materialErpCodes({ code: prev?.code, erpCodes: prev?.erpCodes }).filter((item) => item !== code)[0],
      erpCodes: checked
        ? Array.from(new Set([...materialErpCodes({ code: prev?.code, erpCodes: prev?.erpCodes }), code]))
        : materialErpCodes({ code: prev?.code, erpCodes: prev?.erpCodes }).filter((item) => item !== code),
      minStock: erpStockByCodes(
        checked
          ? Array.from(new Set([...materialErpCodes({ code: prev?.code, erpCodes: prev?.erpCodes }), code]))
          : materialErpCodes({ code: prev?.code, erpCodes: prev?.erpCodes }).filter((item) => item !== code)
      ),
      category: prev?.category || categoryFilter,
    }));
  }

  function changeEditCategory(category: string | null) {
    setEdit((prev) => {
      if (!prev) return prev;
      const nextCategory = category || categoryFilter;
      const nextCodes = materialErpCodes(prev).filter((code) => categoryMatches(erpByCode(code)?.category, nextCategory));
      return {
        ...prev,
        category,
        code: nextCodes[0],
        erpCodes: nextCodes,
        minStock: erpStockByCodes(nextCodes),
      };
    });
  }

  React.useEffect(() => {
    if (searchParam) setQ(searchParam);
  }, [searchParam]);

  React.useEffect(() => {
    if ((MATERIAL_CATEGORIES as readonly string[]).includes(categoryParam ?? "")) {
      setCategoryFilter(categoryParam!);
    }
  }, [categoryParam]);

  const trackId = params.get("track");
  React.useEffect(() => {
    if (!trackId) return;
    const m = (data?.data ?? []).find((x) => x.id === trackId);
    if (m) {
      setReplMaterial(m);
      router.replace(mayParam ? `/materials?may=${mayParam}` : "/materials", { scroll: false });
    }
  }, [trackId, data, router, mayParam]);

  const total = data?.data?.length ?? 0;
  // Nhãn "điểm dùng" = danh sách hệ thống/thiết bị mà vật tư này được gán (từ các điểm thay thế).
  const deviceLabel = React.useCallback((m: MaterialWithDevices) => {
    const names = Array.from(
      new Set((m.replacements ?? []).map((r) => r.device?.name || r.location || r.system || "").filter(Boolean))
    );
    return names.join(", ");
  }, []);
  // Khối quản lý của vật tư = các khối suy ra từ cương vị quản lý của các DÒNG KHAI BÁO
  // (isActive=false) — khớp đúng với danh sách điểm hiện trong panel chi tiết.
  const materialBlocks = React.useCallback(
    (m: MaterialWithDevices) =>
      new Set(
        (m.replacements ?? [])
          .filter((r) => !r.isActive)
          .map((r) => blockForPosition(r.managingPosition))
          .filter(Boolean)
      ),
    []
  );
  const materials = (data?.data ?? []).filter(
    (m) =>
      (m.machine ?? "COMMON") === machineTab &&
      (!q || `${materialErpCodes(m).join(" ")} ${m.name} ${deviceLabel(m)}`.toLowerCase().includes(q.toLowerCase())) &&
      (m.category === categoryFilter ||
        (categoryFilter === "Hóa Chất" && (m.category === "Vật tư tiêu hao" || m.category === "Hóa chất")) ||
        (categoryFilter === "Bi Nghiền Than" && (m.category === "Bi nghiền than" || m.category === "Bi nghiền"))) &&
      (blockFilter === "ALL" || materialBlocks(m).has(blockFilter))
  );
  const isFiltered = q.trim() !== "" || blockFilter !== "ALL";

  // Bỏ chọn những dòng không còn trong danh sách đang hiển thị (vd sau khi lọc/xoá).
  // Dùng chuỗi id ổn định làm dependency để effect chỉ chạy khi tập hiển thị đổi,
  // tránh chạy lại sau mỗi lần render (materials là mảng lọc mới mỗi render).
  const visibleKey = materials.map((m) => m.id).join(",");
  const erpCategoryFilter = edit?.category || categoryFilter;
  const erpOptions = erpMaterials.filter((item) => categoryMatches(item.category, erpCategoryFilter));
  const erpSearchText = normalizeText(erpSearch);
  const filteredErpOptions = erpOptions.filter((item) => {
    if (!erpSearchText) return true;
    return normalizeText(`${item.code} ${item.name} ${item.unit}`).includes(erpSearchText);
  });
  const selectedErpCodes = edit ? materialErpCodes(edit) : [];
  const selectedErpStock = erpStockByCodes(selectedErpCodes);
  React.useEffect(() => {
    if (!edit) setErpSearch("");
  }, [edit]);
  React.useEffect(() => {
    const visible = new Set(visibleKey ? visibleKey.split(",") : []);
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleKey]);

  // Phân trang danh mục vật tư (theo phong cách bảng khiếm khuyết).
  const totalPages = Math.max(1, Math.ceil(materials.length / pageSize));
  const firstShown = materials.length ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, materials.length);
  const pagedMaterials = materials.slice((page - 1) * pageSize, page * pageSize);
  React.useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);
  React.useEffect(() => {
    setPage(1);
  }, [visibleKey, pageSize]);

  const allChecked = materials.length > 0 && materials.every((m) => selected.has(m.id));
  const someChecked = selected.size > 0 && !allChecked;
  const activeCategoryTab = MATERIAL_CATEGORY_TABS.find((tab) => tab.key === categoryFilter) ?? MATERIAL_CATEGORY_TABS[0];
  const ActiveCategoryIcon = activeCategoryTab.icon;

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(materials.map((m) => m.id)) : new Set());
  }

  async function confirmBulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      const res = await delMany.mutateAsync(ids);
      toast.success(`Đã xoá ${res.count} vật tư`);
      setSelected(new Set());
      setBulkOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function save() {
    if (!edit) return;
    const erpCodes = materialErpCodes(edit);
    const linkedErps = erpListByCodes(erpCodes);
    if (!linkedErps.length) {
      toast.error("Vui lòng chọn ít nhất một mã vật tư từ Danh mục vật tư ERP");
      return;
    }
    if (linkedErps.some((erp) => !categoryMatches(erp.category, edit.category || categoryFilter))) {
      toast.error("Mã vật tư ERP không thuộc loại vật tư đang chọn");
      return;
    }
    if (!String(edit.name ?? "").trim()) {
      toast.error("Vui lòng nhập tên vật tư");
      return;
    }
    if (!String(edit.unit ?? "").trim()) {
      toast.error("Vui lòng nhập ĐVT");
      return;
    }
    if (isNew && !(edit.machines ?? []).length) {
      toast.error("Vui lòng chọn ít nhất một tổ máy");
      return;
    }
    try {
      await upsert.mutateAsync(
        {
          ...edit,
          code: erpCodes[0],
          erpCodes,
          name: String(edit.name ?? "").trim(),
          unit: String(edit.unit ?? "").trim(),
          minStock: erpStockByCodes(erpCodes),
          category: edit.category || categoryFilter,
          ...(isNew
            ? { machines: edit.machines ?? [machineTab], machine: (edit.machines ?? [machineTab])[0] ?? machineTab }
            : {}),
        }
      );
      toast.success(isNew ? "Đã thêm vật tư" : "Đã cập nhật vật tư");
      setEdit(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function materialForEdit(m: MaterialWithDevices): MaterialEdit {
    return {
      ...m,
      // Form Sửa chỉ nạp DÒNG KHAI BÁO (isActive=false); điểm theo dõi (isActive=true)
      // là bản ghi riêng, quản lý trong drawer — không đưa vào form để tránh bị ghi đè.
      replacements: (m.replacements ?? [])
        .filter((r) => !r.isActive)
        .map((r) => ({
          deviceSeq: r.deviceSeq,
          system: r.system,
          location: r.location,
          deviceCount: r.deviceCount ?? 1,
          managingPosition: r.managingPosition,
          quantity: r.quantity,
          intervalMonths: r.intervalMonths,
          intervalNote: r.intervalNote,
          lastReplacedAt: typeof r.lastReplacedAt === "string" ? r.lastReplacedAt : null,
        })),
    };
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success("Đã xoá vật tư");
      setDeleting(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="DANH MỤC VẬT TƯ PXVH1" description={`Tồn kho phụ tùng & vật tư bảo trì — ${machineLabel}`}>
        {canManage && (
          <>
            <ExportButton rows={materials.map((m) => {
              const codes = materialErpCodes(m);
              return { code: codes.join(", "), name: m.name, unit: m.unit, hienCo: m.quantity, soLieuERP: codes.length ? erpStockByCodes(codes) : m.minStock, diemDung: deviceLabel(m), tongNhuCau: m.totalNeed ?? 0, deXuatThem: m.shortfall ?? 0 };
            })} filename={`vat-tu-${machineTab.toLowerCase()}`} />
            <Button onClick={() => { setIsNew(true); setEdit({ unit: "Cái", quantity: 0, minStock: 0, category: categoryFilter, machines: ["S1", "S2", "COMMON"], replacements: [] }); }}>
              <Plus className="h-4 w-4" /> Thêm vật tư
            </Button>
          </>
        )}
      </PageHeader>

      {/* Lọc loại vật tư dạng dropdown; ô tìm kiếm cùng hàng bên phải */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-10 min-w-[172px] justify-between gap-3 rounded-xl border-blue-100 bg-white px-4 text-sm font-semibold text-ink shadow-sm hover:bg-blue-50 hover:text-navy"
            >
              <span className="flex min-w-0 items-center gap-2">
                <ActiveCategoryIcon className="h-4 w-4 shrink-0 text-navy" />
                <span className="truncate">{activeCategoryTab.key}</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {MATERIAL_CATEGORY_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = categoryFilter === tab.key;
              return (
                <DropdownMenuItem
                  key={tab.key}
                  className={cn("justify-between gap-3", active && "bg-blue-50 text-navy")}
                  onClick={() => setCategoryFilter(tab.key)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{tab.key}</span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-2 pb-2">
          <Select value={blockFilter} onValueChange={setBlockFilter}>
            <SelectTrigger className="w-44" aria-label="Lọc theo khối quản lý">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả khối</SelectItem>
              {EQUIPMENT_BLOCKS.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SearchBar value={q} onChange={setQ} placeholder="Tìm theo mã, tên, thiết bị..." className="sm:w-72" />
        </div>
      </div>

      {canManage && selected.size > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-red-50 px-3 py-2">
            <span className="text-sm font-medium text-ink">Đã chọn {selected.size} vật tư</span>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>Bỏ chọn</Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkOpen(true)}>
              <Trash2 className="h-4 w-4" /> Xoá đã chọn
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : materials.length === 0 ? (
        <EmptyState
          icon={Package}
          title={isFiltered ? "Không tìm thấy vật tư" : "Không có vật tư"}
          description={
            isFiltered
              ? `Không có vật tư nào khớp bộ lọc trong loại "${categoryFilter}" (${machineLabel}). Thử bỏ từ khoá / khối hoặc chuyển tab khác.`
              : `Chưa có vật tư nào thuộc loại "${categoryFilter}" trong ${machineLabel}.`
          }
          action={isFiltered ? { label: "Xoá bộ lọc", onClick: () => { setQ(""); setBlockFilter("ALL"); } } : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <Table className="min-w-[880px]">
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                {canManage && (
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Chọn tất cả"
                      checked={allChecked ? true : someChecked ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleAll(v === true)}
                    />
                  </TableHead>
                )}
                <TableHead className="text-center">Tên vật tư</TableHead>
                <TableHead className="text-center">ĐVT</TableHead>
                <TableHead className="text-center">Hiện có</TableHead>
                <TableHead className="text-center">Số liệu ERP</TableHead>
                <TableHead className="text-center">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedMaterials.map((m) => {
                const checked = selected.has(m.id);
                const expanded = expandedId === m.id;
                const linkedCodes = materialErpCodes(m);
                const linkedErpStock = linkedCodes.length ? erpStockByCodes(linkedCodes) : m.minStock;
                return (
                  <React.Fragment key={m.id}>
                  <TableRow data-state={checked ? "selected" : undefined} className={cn("cursor-pointer hover:bg-muted/30", checked && "bg-accent/5")} onClick={() => setExpandedId(expanded ? null : m.id)}>
                    {canManage && (
                      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Chọn ${m.code}`}
                          checked={checked}
                          onCheckedChange={(v) => toggleOne(m.id, v === true)}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpandedId(expanded ? null : m.id); }}
                          className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-colors", expanded ? "bg-rose-500" : "bg-emerald-500")}
                          title={expanded ? "Thu gọn" : "Mở chi tiết"}
                        >
                          {expanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        </button>
                        {m.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.imageUrl} alt={m.name} className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover" />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                            <Package className="h-[18px] w-[18px]" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-ink">{m.name}</div>
                          {m.note && <div className="truncate text-xs text-muted-foreground">{m.note}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">{m.unit}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <StockBadge quantity={m.quantity} minStock={m.minStock} />
                        <InlineNumberCell
                          value={m.quantity}
                          canEdit={canManage}
                          ariaLabel={`Sửa Hiện Có của ${m.code}`}
                          onSave={async (v) => {
                            await upsert.mutateAsync({ id: m.id, quantity: v });
                            toast.success(`Đã cập nhật Hiện Có: ${m.code} → ${v}`);
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-semibold tabular-nums text-ink">{linkedErpStock}</span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" title="Theo dõi thay thế" className="text-accent hover:bg-accent/10" onClick={() => setReplMaterial(m)}>
                          <Repeat className="h-4 w-4" />
                        </Button>
                        {canManage && (
                          <>
                            <Button variant="ghost" size="icon" title="Sửa" onClick={() => { setIsNew(false); setEdit(materialForEdit(m)); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Xoá" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => setDeleting(m)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={canManage ? 6 : 5} className="px-6 py-4">
                        <MaterialExpandedDetails m={m} blockFilter={blockFilter} onOpenTracking={() => setReplMaterial(m)} />
                      </TableCell>
                    </TableRow>
                  )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
          </div>
          <div className="flex flex-col gap-3 border-t border-border p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div>
              Hiển thị {firstShown}-{lastShown} trong tổng số {materials.length} vật tư
              {isFiltered && <span> sau lọc</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:ml-auto">
              <div className="flex items-center gap-2">
                <span>Hiển thị</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-8 rounded-md border border-input bg-white px-2 text-sm font-medium text-ink"
                  aria-label="Số dòng mỗi trang"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>dòng</span>
              </div>
              <PageButton icon={ChevronsLeft} label="Trang đầu" disabled={page <= 1} onClick={() => setPage(1)} />
              <PageButton icon={ChevronLeft} label="Trang trước" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} />
              <span className="mx-2 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-ink">{page}/{totalPages}</span>
              <PageButton icon={ChevronRight} label="Trang sau" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} />
              <PageButton icon={ChevronsRight} label="Trang cuối" disabled={page >= totalPages} onClick={() => setPage(totalPages)} />
            </div>
          </div>
        </Card>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{isNew ? "Thêm vật tư" : `Cập nhật: ${edit?.name}`}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mã vật tư ERP *" className="col-span-2">
                <Input
                  value={erpSearch}
                  onChange={(e) => setErpSearch(e.target.value)}
                  placeholder="Tìm mã, tên vật tư, ĐVT ERP..."
                  className="mb-2"
                />
                <div className="max-h-56 overflow-y-auto rounded-md border border-input bg-white">
                  {filteredErpOptions.map((erp) => {
                    const checked = selectedErpCodes.includes(erp.code);
                    return (
                      <label key={erp.id} className="flex cursor-pointer items-start gap-3 border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-muted/40">
                        <Checkbox
                          aria-label={`Chọn mã ${erp.code}`}
                          checked={checked}
                          onCheckedChange={(v) => toggleErpMaterial(erp.code, v === true)}
                        />
                        <span className="min-w-0">
                          <span className="block font-mono text-xs font-semibold text-navy">{erp.code}</span>
                          <span className="block truncate text-sm text-ink">{erp.name}</span>
                          <span className="block text-xs text-muted-foreground">ĐVT ERP: {erp.unit} · Số liệu ERP: {erp.erpStock}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {!erpMaterialsQuery.isLoading && erpOptions.length === 0 && (
                  <p className="mt-1.5 text-xs text-red-600">Chưa có vật tư ERP thuộc loại "{erpCategoryFilter}". Vui lòng nhập ERP đúng loại trước.</p>
                )}
                {!erpMaterialsQuery.isLoading && erpOptions.length > 0 && filteredErpOptions.length === 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">Không có mã ERP nào khớp từ khoá trong loại "{erpCategoryFilter}".</p>
                )}
                {selectedErpCodes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedErpCodes.map((code) => (
                      <span key={code} className="rounded-md bg-accent/10 px-2 py-1 font-mono text-xs font-semibold text-accent">{code}</span>
                    ))}
                  </div>
                )}
              </Field>
              <Field label="ĐVT *">
                <Input value={edit.unit ?? ""} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} placeholder="Cái / Lít / Bộ..." />
              </Field>
              <Field label="Số liệu ERP">
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-semibold tabular-nums text-ink">
                  {selectedErpCodes.length ? selectedErpStock : edit.minStock || 0}
                </div>
              </Field>
              <Field label="Ảnh vật tư" className="col-span-2">
                <MaterialImageField value={edit.imageUrl ?? null} onChange={(url) => setEdit({ ...edit, imageUrl: url })} />
              </Field>
              <Field label="Tên vật tư *" className="col-span-2"><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Tổ máy" className="col-span-2">
                <div className="grid grid-cols-3 gap-2">
                  {MACHINE_TABS.map((t) => {
                    if (isNew) {
                      const selected = (edit.machines ?? []).includes(t.key);
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => {
                            const cur = edit.machines ?? [];
                            const next = selected ? cur.filter((k) => k !== t.key) : [...cur, t.key];
                            setEdit({ ...edit, machines: next });
                          }}
                          className={cn(
                            "h-10 rounded-md border text-sm font-medium transition-colors",
                            selected
                              ? "border-navy bg-navy text-white"
                              : "border-input bg-muted/40 text-ink hover:border-accent"
                          )}
                        >
                          {t.label}
                        </button>
                      );
                    }
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setEdit({ ...edit, machine: t.key })}
                        className={cn(
                          "h-10 rounded-md border text-sm font-medium transition-colors",
                          (edit.machine ?? "COMMON") === t.key
                            ? "border-navy bg-navy text-white"
                            : "border-input bg-muted/40 text-ink hover:border-accent"
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Loại vật tư" className="col-span-2">
                <Select value={edit.category ?? "NONE"} onValueChange={(v) => changeEditCategory(v === "NONE" ? null : v)}>
                  <SelectTrigger aria-label="Chọn loại vật tư"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— Chưa phân loại —</SelectItem>
                    {MATERIAL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Hiện Có"><Input type="number" min={0} value={edit.quantity ?? 0} onChange={(e) => setEdit({ ...edit, quantity: Number(e.target.value) })} /></Field>
              <Field label="Tài liệu đính kèm" className="col-span-2">
                <MaterialDocumentField
                  url={edit.documentUrl ?? ""}
                  name={edit.documentName ?? ""}
                  onChange={(documentUrl, documentName) => setEdit({ ...edit, documentUrl, documentName })}
                />
              </Field>
              <div className="col-span-2 mt-1">
                <Label className="text-sm font-semibold text-ink">Điểm dùng / thay thế</Label>
                <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
                  Một mã vật tư có thể dùng cho nhiều hệ thống/thiết bị với chu kỳ và số lượng cần thay khác nhau.
                  Tổng số lượng các điểm = nhu cầu 1 chu kỳ để so với tồn kho.
                </p>
                <ReplacementPointsEditor
                  value={edit.replacements ?? []}
                  unit={edit.unit ?? undefined}
                  onChange={(rows) => setEdit({ ...edit, replacements: rows })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Huỷ</Button>
            <Button onClick={save} disabled={upsert.isPending}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Xoá vật tư"
        description={deleting ? `Bạn chắc chắn muốn xoá “${deleting.code} · ${deleting.name}”? Hành động này không thể hoàn tác.` : undefined}
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={(o) => !o && setBulkOpen(false)}
        title={`Xoá ${selected.size} vật tư đã chọn?`}
        description="Toàn bộ vật tư đã chọn và lịch sử tiêu hao liên quan sẽ bị xoá. Hành động này không thể hoàn tác."
        confirmLabel={`Xoá ${selected.size} vật tư`}
        loading={delMany.isPending}
        onConfirm={confirmBulkDelete}
      />

      <ReplacementDrawer material={replMaterial} role={role} onClose={() => setReplMaterial(null)} />
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><Label className="mb-1.5 block">{label}</Label>{children}</div>;
}

/** Ô tải ảnh vật tư: chọn tệp → upload → xem trước, có thể gỡ ảnh. */
function MaterialImageField({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/materials/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Tải ảnh thất bại");
      onChange(json.data.url as string);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Ảnh vật tư" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4" /> {value ? "Đổi ảnh" : "Tải ảnh lên"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-red-50 hover:text-destructive" onClick={() => onChange(null)}>
            <X className="h-4 w-4" /> Gỡ ảnh
          </Button>
        )}
        <span className="text-xs text-muted-foreground">JPG, PNG, WEBP · tối đa 5MB</span>
      </div>
    </div>
  );
}

function MaterialDocumentField({
  url,
  name,
  onChange,
}: {
  url: string;
  name: string;
  onChange: (url: string | null, name: string | null) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return toast.error("Chỉ chấp nhận tệp PDF");
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "document");
      const res = await fetch("/api/materials/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Tải tệp PDF thất bại");
      onChange(json.data.url as string, json.data.name as string);
      toast.success("Đã tải lên tệp PDF");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function setUrl(nextUrl: string) {
    const clean = nextUrl.trim();
    onChange(clean || null, clean ? name || null : null);
  }

  return (
    <div className="rounded-lg border border-border bg-slate-50/60 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Dán link PDF / Google Drive hoặc tải tệp PDF"
            className="bg-white pl-9"
          />
        </div>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        <Button type="button" variant="outline" className="shrink-0 bg-white" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Tải PDF
        </Button>
      </div>
      {url ? (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-blue-100 bg-white px-3 py-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-blue-700" />
          <span className="min-w-0 flex-1 truncate text-ink">{name || url}</span>
          <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-accent" title="Mở tài liệu">
            <ExternalLink className="h-4 w-4" />
          </a>
          <button type="button" onClick={() => onChange(null, null)} title="Gỡ tài liệu" className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">Chỉ nhận PDF khi tải file lên, tối đa 25MB.</div>
      )}
    </div>
  );
}

/** Ô số sửa nhanh trong bảng: nhấn đúp để nhập, Enter lưu, Esc/bấm ra ngoài huỷ. */
function InlineNumberCell({
  value,
  canEdit,
  ariaLabel,
  onSave,
}: {
  value: number;
  canEdit: boolean;
  ariaLabel: string;
  onSave: (v: number) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(String(value));
  const [saving, setSaving] = React.useState(false);

  if (!editing) {
    return (
      <span
        className={cn(
          "inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums text-ink",
          canEdit && "cursor-text transition-colors hover:bg-sky-50 hover:ring-1 hover:ring-sky-200"
        )}
        title={canEdit ? "Nhấn đúp để sửa nhanh" : undefined}
        onClick={(e) => canEdit && e.stopPropagation()}
        onDoubleClick={(e) => {
          if (!canEdit) return;
          e.stopPropagation();
          setDraft(String(value));
          setEditing(true);
        }}
      >
        {value}
      </span>
    );
  }

  return (
    <input
      autoFocus
      type="number"
      min={0}
      aria-label={ariaLabel}
      value={draft}
      disabled={saving}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={async (e) => {
        if (e.key === "Escape") return setEditing(false);
        if (e.key !== "Enter") return;
        const next = Math.max(0, Math.round(Number(draft)));
        if (!Number.isFinite(next)) return void toast.error("Giá trị không hợp lệ");
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
      className="h-8 w-20 rounded-md border border-accent bg-white px-2 text-center text-sm font-semibold tabular-nums outline-none ring-2 ring-accent/25"
    />
  );
}

/** Cảnh báo tồn kho: "Hết hàng" khi =0, "Sắp hết" khi ≤ định mức tối thiểu. */
function StockBadge({ quantity, minStock }: { quantity: number; minStock: number }) {
  if (quantity <= 0) {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">Hết hàng</span>;
  }
  if (minStock > 0 && quantity <= minStock) {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Sắp hết</span>;
  }
  return null;
}

/** Panel bung: liệt kê các DÒNG KHAI BÁO thiết bị (isActive=false). Nút "Thêm điểm"
 *  tạo MỘT BẢN GHI THEO DÕI riêng (isActive=true) nên bấm được nhiều lần — dòng
 *  khai báo và nút giữ nguyên; điểm theo dõi quản lý trong drawer Theo dõi thay thế. */
function MaterialExpandedDetails({ m, blockFilter = "ALL", onOpenTracking }: { m: MaterialWithDevices; blockFilter?: string; onOpenTracking?: () => void }) {
  // Chỉ hiện dòng khai báo (isActive=false); nếu đang lọc theo khối cụ thể thì
  // chỉ hiện các điểm có cương vị quản lý thuộc đúng khối đó.
  const points = (m.replacements ?? []).filter(
    (r) => !r.isActive && (blockFilter === "ALL" || blockForPosition(r.managingPosition) === blockFilter)
  );
  const createPoint = useCreateReplacement();

  type PanelPoint = NonNullable<MaterialWithDevices["replacements"]>[number];

  // Bấm "+Thêm điểm" mở form nhập mốc; xác nhận tạo điểm theo dõi rồi TỰ MỞ
  // drawer "Theo dõi thay thế vật tư" để xem điểm vừa thêm.
  const [tracking, setTracking] = React.useState<PanelPoint | null>(null);
  const [trackDate, setTrackDate] = React.useState("");
  const [trackMonths, setTrackMonths] = React.useState(12);

  function openTracking(p: PanelPoint) {
    setTrackDate(formatDateInput(new Date()));
    setTrackMonths(p.intervalMonths || 12);
    setTracking(p);
  }
  async function confirmTracking() {
    if (!tracking) return;
    try {
      const months = Math.max(1, Math.round(trackMonths) || 12);
      const due = new Date(trackDate ? `${trackDate}T08:00:00` : Date.now());
      due.setMonth(due.getMonth() + months);
      await createPoint.mutateAsync({
        materialId: m.id,
        deviceSeq: tracking.deviceSeq,
        system: tracking.system,
        location: tracking.location,
        managingPosition: tracking.managingPosition,
        quantity: tracking.quantity,
        deviceCount: tracking.deviceCount ?? 1,
        intervalMonths: months,
        lastReplacedAt: trackDate || formatDateInput(new Date()),
        nextDueAt: formatDateInput(due),
      });
      toast.success("Đã thêm điểm theo dõi");
      setTracking(null);
      onOpenTracking?.(); // mở drawer Theo dõi thay thế
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (points.length === 0) {
    return (
      <div className="space-y-3">
        {m.documentUrl && <MaterialDocumentLink url={m.documentUrl} name={m.documentName} />}
        <div className="rounded-xl border border-dashed border-border bg-white/60 px-4 py-3 text-sm text-muted-foreground">
          Chưa gán hệ thống/thiết bị cho vật tư này. Bấm <b>Sửa</b> để thêm điểm dùng / thay thế.
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {m.documentUrl && <MaterialDocumentLink url={m.documentUrl} name={m.documentName} />}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-white shadow-sm">
        <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Chi tiết điểm thay thế ({points.length})
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-2 text-left font-semibold">Hệ thống / thiết bị</th>
              <th className="px-4 py-2 text-left font-semibold">Thiết bị</th>
              <th className="px-4 py-2 text-left font-semibold">Cương vị quản lý</th>
              <th className="w-[120px] px-4 py-2 text-center font-semibold">SL thiết bị</th>
              <th className="w-[130px] px-4 py-2 text-center font-semibold">Chu kỳ O&M</th>
              <th className="w-[150px] px-4 py-2 text-center font-semibold">Chu kỳ thay thế</th>
              <th className="w-[160px] px-4 py-2 text-center font-semibold">Số lượng cần thay</th>
              <th className="w-[150px] px-4 py-2 text-center font-semibold">Theo dõi</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium uppercase text-ink">{p.device?.name || p.system || "—"}</td>
                <td className="px-4 py-2.5 text-ink">{p.location || "—"}</td>
                <td className="px-4 py-2.5 text-ink">{p.managingPosition || "—"}</td>
                <td className="px-4 py-2.5 text-center text-ink">{p.deviceCount ?? 1}</td>
                <td className="px-4 py-2.5 text-center text-ink">{p.intervalNote || "—"}</td>
                <td className="px-4 py-2.5 text-center text-ink">{p.intervalMonths} tháng</td>
                <td className="px-4 py-2.5 text-center font-semibold text-ink">{p.quantity * (p.deviceCount || 1)} {m.unit}</td>
                <td className="px-4 py-2.5 text-center">
                  <button
                    type="button"
                    disabled={createPoint.isPending}
                    onClick={() => openTracking(p)}
                    title="Thêm điểm theo dõi thời gian thay thế cho thiết bị này (tạo được nhiều lần)"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Thêm điểm
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Form nhập mốc; xác nhận sẽ tạo điểm theo dõi và tự mở drawer Theo dõi thay thế */}
      <Dialog open={!!tracking} onOpenChange={(o) => !o && setTracking(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm điểm theo dõi</DialogTitle>
          </DialogHeader>
          {tracking && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <div className="font-semibold uppercase text-ink">{tracking.device?.name || tracking.system || "—"}</div>
                {tracking.location && <div className="text-muted-foreground">Thiết bị: {tracking.location}</div>}
              </div>
              <Field label="Lần thay gần nhất">
                <Input type="date" value={trackDate} onChange={(e) => setTrackDate(e.target.value)} />
              </Field>
              <Field label="Chu kỳ thay thế (tháng)">
                <Input type="number" min={1} value={trackMonths} onChange={(e) => setTrackMonths(Number(e.target.value))} />
              </Field>
              <p className="text-xs text-muted-foreground">
                Mỗi lần bấm tạo một điểm theo dõi mới trong Lịch thay thế vật tư — dòng khai báo này giữ nguyên và có thể thêm điểm tiếp.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTracking(null)}>Huỷ</Button>
            <Button onClick={confirmTracking} disabled={createPoint.isPending || !trackDate}>
              {createPoint.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Thêm điểm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MaterialDocumentLink({ url, name }: { url: string; name?: string | null }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-sm font-medium text-blue-800 transition-colors hover:border-blue-200 hover:bg-blue-50"
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{name || "Tài liệu đính kèm"}</span>
      <ExternalLink className="h-4 w-4 shrink-0" />
    </a>
  );
}

function PageButton({ icon: Icon, label, disabled, onClick }: { icon: LucideIcon; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-8 w-8 rounded-lg disabled:cursor-not-allowed disabled:opacity-45"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
