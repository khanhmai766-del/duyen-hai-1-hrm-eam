"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Plus, Minus, Package, Pencil, Trash2, Upload, X, Loader2, ImageIcon, Repeat, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, Check, FileText, Link2, ExternalLink, Droplet, Filter, Cpu, FlaskConical, CircleDot, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useMaterials, useUpsertMaterial, useDeleteMaterial, useDeleteMaterials, type MaterialWithDevices, type MaterialReplacementInput } from "@/hooks/useMaterials";
import { useErpMaterials } from "@/hooks/useErpMaterials";
import { ReplacementDrawer } from "@/components/materials/replacement-drawer";
import { ReplacementPointsEditor } from "@/components/materials/replacement-points-editor";
import { useCreateReplacement } from "@/hooks/useReplacements";
import { MATERIAL_CATEGORIES, DEFECT_UNITS, EQUIPMENT_BLOCKS, blockForPosition, canManageMaterialCatalog, materialCategoryMatches } from "@/lib/constants";
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

const fmtNumber = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

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
  const [trackingMaterial, setTrackingMaterial] = React.useState<MaterialWithDevices | null>(null);
  const [trackingRows, setTrackingRows] = React.useState<MaterialReplacementInput[]>([]);
  const [editingDetails, setEditingDetails] = React.useState<MaterialWithDevices | null>(null);
  const [detailRows, setDetailRows] = React.useState<MaterialReplacementInput[]>([]);
  const [importOpen, setImportOpen] = React.useState(false);
  const [deletingDetails, setDeletingDetails] = React.useState<MaterialWithDevices | null>(null);
  const [selectedDetailIds, setSelectedDetailIds] = React.useState<Set<string>>(new Set());
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
  const trackId = params.get("track");
  // Lọc theo tổ máy NGAY TỪ SERVER (payload nhỏ hơn nhiều); riêng khi mở theo
  // ?track= (từ chuông thông báo) thì tải toàn bộ vì vật tư có thể ở tab khác.
  const { data, isLoading } = useMaterials(trackId ? {} : { machine: machineTab });
  const erpMaterials = (erpMaterialsQuery.data?.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    unit: string;
    erpStock: number;
    category?: string | null;
  }>;
  const erpGroups = erpMaterialsQuery.groups ?? [];

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
    return materialCategoryMatches(value, target);
  }

  function erpStockByGroupedCodes(codes: string[]) {
    const codeSet = new Set(codes);
    const groups = erpGroups.filter((group) => group.erpCodes.some((code) => codeSet.has(code)));
    if (!groups.length) return erpStockByCodes(codes);
    return groups.reduce((sum, group) => sum + (Number(group.totalErpStock) || 0), 0);
  }

  function toggleErpGroup(group: (typeof erpGroups)[number], checked: boolean) {
    setEdit((prev) => {
      const currentCodes = materialErpCodes({ code: prev?.code, erpCodes: prev?.erpCodes });
      const groupCodeSet = new Set(group.erpCodes);
      const nextCodes = checked
        ? Array.from(new Set([...currentCodes, ...group.erpCodes]))
        : currentCodes.filter((code) => !groupCodeSet.has(code));
      const isFirstSelection = checked && currentCodes.length === 0;
      return {
        ...(prev ?? {}),
        code: nextCodes[0],
        erpCodes: nextCodes,
        minStock: erpStockByGroupedCodes(nextCodes),
        category: prev?.category || group.category || categoryFilter,
        name: isFirstSelection ? group.name : prev?.name,
        unit: isFirstSelection ? group.unit : prev?.unit,
        quantity: isFirstSelection ? group.onHandQty : prev?.quantity,
      };
    });
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
  const materialPointLabels = React.useCallback((m: MaterialWithDevices) =>
    Array.from(
      new Set((m.replacements ?? []).map((r) => r.device?.name || r.location || r.system || "").filter(Boolean))
    ), []);
  const deviceLabel = React.useCallback(
    (m: MaterialWithDevices) => materialPointLabels(m).join(", "),
    [materialPointLabels]
  );
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
      materialCategoryMatches(m.category, categoryFilter) &&
      (blockFilter === "ALL" || materialBlocks(m).has(blockFilter))
  );
  const isFiltered = q.trim() !== "" || blockFilter !== "ALL";

  /**
   * Xuất CSV "Chi tiết điểm thay thế" của TẤT CẢ vật tư đang hiển thị (theo đúng bộ lọc
   * tổ máy / loại vật tư / khối / từ khoá) — mỗi điểm thay thế là 1 dòng, kèm thông tin vật tư.
   * Dùng đúng thứ tự sắp xếp như bảng: gom theo hệ thống, rồi thiết bị theo thứ tự tự nhiên.
   */
  function exportReplacementPointsCsv() {
    const header = [
      "Loại vật tư", "Tên vật tư", "Mã ERP", "ĐVT", "Tổ máy",
      "Hệ thống / thiết bị", "Thiết bị", "Cương vị quản lý",
      "SL thiết bị", "Chu kỳ O&M", "Chu kỳ thay thế", "Số lượng cần thay",
    ];
    const rows: (string | number)[][] = [];
    const sortedMaterials = materials.slice().sort((a, b) => compareNatural(a.name, b.name));
    for (const m of sortedMaterials) {
      const points = (m.replacements ?? [])
        .filter((r) => !r.isActive && (blockFilter === "ALL" || blockForPosition(r.managingPosition) === blockFilter))
        .slice()
        .sort((a, b) => {
          const systemOf = (p: typeof a) => p.device?.system || p.system || p.device?.name || "";
          const deviceOf = (p: typeof a) => p.device?.name || p.location || "";
          return compareNatural(systemOf(a), systemOf(b)) || compareNatural(deviceOf(a), deviceOf(b));
        });
      for (const p of points) {
        rows.push([
          m.category ?? "",
          m.name,
          materialErpCodes(m).join(" / "),
          m.unit ?? "",
          m.machine ?? "COMMON",
          p.device?.system || p.system || p.device?.name || "",
          p.device?.name || p.location || "",
          p.managingPosition || "",
          p.deviceCount ?? 1,
          p.intervalNote || "",
          p.intervalMonths === 0 ? "Không theo dõi lịch" : `${p.intervalMonths} tháng`,
          p.quantity * (p.deviceCount || 1),
        ]);
      }
    }
    if (!rows.length) {
      toast.error("Không có điểm thay thế nào trong danh sách đang hiển thị");
      return;
    }
    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    // Dấu ; + BOM UTF-8: Excel tiếng Việt mở đúng cột và không lỗi font.
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ";" });
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diem-thay-the_${machineTab}_${categoryFilter}_${new Date().toISOString().slice(0, 10)}.csv`
      .replace(/\s+/g, "-")
      .toLowerCase();
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Đã xuất ${rows.length} điểm thay thế của ${sortedMaterials.length} vật tư`);
  }

  // Bỏ chọn những dòng không còn trong danh sách đang hiển thị (vd sau khi lọc/xoá).
  // Dùng chuỗi id ổn định làm dependency để effect chỉ chạy khi tập hiển thị đổi,
  // tránh chạy lại sau mỗi lần render (materials là mảng lọc mới mỗi render).
  const visibleKey = materials.map((m) => m.id).join(",");
  const erpCategoryFilter = edit?.category || categoryFilter;
  const erpGroupOptions = erpGroups.filter((group) => categoryMatches(group.category, erpCategoryFilter));
  const erpSearchText = normalizeText(erpSearch);
  const filteredErpGroups = erpGroupOptions.filter((group) => {
    if (!erpSearchText) return true;
    return normalizeText(
      `${group.code} ${group.name} ${group.unit} ${group.onHandQty} ${group.totalErpStock} ${group.erpCodes.join(" ")} ${group.materials.map((item) => item.name).join(" ")}`
    ).includes(erpSearchText);
  });
  const selectedErpCodes = edit ? materialErpCodes(edit) : [];
  const selectedErpCodeSet = React.useMemo(() => new Set(selectedErpCodes), [selectedErpCodes.join("|")]);
  const selectedErpGroups = erpGroups.filter((group) => group.erpCodes.some((code) => selectedErpCodeSet.has(code)));
  const selectedErpStock = erpStockByGroupedCodes(selectedErpCodes);
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
  const activeMachineTab = MACHINE_TABS.find((tab) => tab.key === machineTab) ?? MACHINE_TABS[0];

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

  function changeMachineTab(nextMachine: string) {
    const next = new URLSearchParams(params.toString());
    next.set("may", nextMachine);
    next.delete("track");
    router.replace(`/materials?${next.toString()}`, { scroll: false });
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
    if (!(edit.machines ?? []).length) {
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
          minStock: erpStockByGroupedCodes(erpCodes),
          category: edit.category || categoryFilter,
          ...(isNew
            ? { machines: edit.machines ?? [machineTab], machine: (edit.machines ?? [machineTab])[0] ?? machineTab }
            // Cập nhật: gửi danh sách tổ máy đã tick; KHÔNG gửi machine đơn để không dời dòng hiện tại.
            : { machines: edit.machines, machine: undefined }),
        }
      );
      toast.success(isNew ? "Đã thêm vật tư" : "Đã cập nhật vật tư");
      setEdit(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function replacementRowsForEdit(m: MaterialWithDevices): MaterialReplacementInput[] {
    return (m.replacements ?? [])
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
      }));
  }

  function materialForEdit(m: MaterialWithDevices): MaterialEdit {
    const { replacements: _replacements, ...material } = m;
    return { ...material, machines: m.machines ?? [m.machine ?? "COMMON"] };
  }

  function openEditDetails(material: MaterialWithDevices) {
    setEditingDetails(material);
    setDetailRows(replacementRowsForEdit(material));
  }

  function openDeleteDetails(material: MaterialWithDevices) {
    setDeletingDetails(material);
    setSelectedDetailIds(new Set());
  }

  async function saveDetails() {
    if (!editingDetails) return;
    try {
      await upsert.mutateAsync({ id: editingDetails.id, replacements: detailRows });
      toast.success("Đã cập nhật chi tiết điểm thay thế");
      setEditingDetails(null);
      setDetailRows([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thể cập nhật chi tiết điểm thay thế");
    }
  }

  async function confirmDeleteDetails() {
    if (!deletingDetails || selectedDetailIds.size === 0) return;
    try {
      const remainingRows = (deletingDetails.replacements ?? [])
        .filter((row) => !row.isActive && !selectedDetailIds.has(row.id))
        .map((row) => ({
          deviceSeq: row.deviceSeq,
          system: row.system,
          location: row.location,
          deviceCount: row.deviceCount ?? 1,
          managingPosition: row.managingPosition,
          quantity: row.quantity,
          intervalMonths: row.intervalMonths,
          intervalNote: row.intervalNote,
          lastReplacedAt: typeof row.lastReplacedAt === "string" ? row.lastReplacedAt : null,
        }));
      await upsert.mutateAsync({ id: deletingDetails.id, replacements: remainingRows });
      toast.success(`Đã xóa ${selectedDetailIds.size} dòng chi tiết điểm thay thế`);
      setDeletingDetails(null);
      setSelectedDetailIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thể xóa chi tiết điểm thay thế");
    }
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

  function openTrackingDialog(material: MaterialWithDevices) {
    setExpandedId(material.id);
    setTrackingMaterial(material);
    setTrackingRows([{ deviceSeq: null, system: null, intervalMonths: 6, quantity: 1, deviceCount: 1 }]);
  }

  async function confirmAddTrackingPoints() {
    if (!trackingMaterial) return;
    const rows = trackingRows.filter((row) => String(row.deviceSeq || row.system || row.location || "").trim());
    if (!rows.length) {
      toast.error("Vui lòng chọn ít nhất một hệ thống/thiết bị theo dõi");
      return;
    }
    try {
      const currentRows = (trackingMaterial.replacements ?? [])
        .filter((row) => !row.isActive)
        .map((row) => ({
          deviceSeq: row.deviceSeq,
          system: row.system,
          location: row.location,
          deviceCount: row.deviceCount ?? 1,
          managingPosition: row.managingPosition,
          quantity: row.quantity,
          intervalMonths: row.intervalMonths,
          intervalNote: row.intervalNote,
          lastReplacedAt: typeof row.lastReplacedAt === "string" ? row.lastReplacedAt : null,
        }));
      const addedRows = rows.map((row) => ({
        deviceSeq: row.deviceSeq ?? null,
        system: row.system ?? null,
        location: row.location ?? null,
        managingPosition: row.managingPosition ?? null,
        quantity: Math.max(0, Number(row.quantity) || 0),
        deviceCount: Math.max(1, Number(row.deviceCount) || 1),
        intervalMonths: Number.isFinite(Number(row.intervalMonths)) ? Math.max(0, Number(row.intervalMonths)) : 6,
        intervalNote: row.intervalNote ?? null,
        lastReplacedAt: row.lastReplacedAt ?? null,
      }));
      await upsert.mutateAsync({
        id: trackingMaterial.id,
        replacements: [...currentRows, ...addedRows],
      });
      toast.success(`Đã thêm ${rows.length} thiết bị theo dõi`);
      setTrackingMaterial(null);
      setTrackingRows([]);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="DANH MỤC VẬT TƯ PXVH1" description={`Tồn kho phụ tùng & vật tư bảo trì — ${machineLabel}`}>
        {canManage && (
          <Button variant="outline" onClick={() => setImportOpen(true)} title="Nhập/đồng bộ chi tiết điểm thay thế từ file Excel">
            <FileSpreadsheet className="h-4 w-4" /> Nhập điểm thay thế
          </Button>
        )}
        <Button variant="outline" onClick={exportReplacementPointsCsv} title="Xuất CSV chi tiết điểm thay thế của các vật tư đang hiển thị">
          <Download className="h-4 w-4" /> Xuất điểm thay thế
        </Button>
        {canManage && (
          <Button onClick={() => { setIsNew(true); setEdit({ unit: "Cái", quantity: 0, minStock: 0, category: categoryFilter, machines: ["S1", "S2", "COMMON"], replacements: [] }); }}>
            <Plus className="h-4 w-4" /> Thêm vật tư
          </Button>
        )}
      </PageHeader>

      {/* Lọc loại vật tư dạng dropdown; ô tìm kiếm cùng hàng bên phải */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-auto justify-between gap-2 rounded-xl border-blue-100 bg-white px-4 text-sm font-semibold text-ink shadow-sm hover:bg-blue-50 hover:text-navy"
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <ActiveCategoryIcon className="h-4 w-4 shrink-0 text-navy" />
                <span>{activeCategoryTab.key}</span>
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
          <Select value={machineTab} onValueChange={changeMachineTab}>
            <SelectTrigger className="w-[132px]" aria-label="Lọc theo tổ máy">
              <SelectValue>{activeMachineTab.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MACHINE_TABS.map((tab) => (
                <SelectItem key={tab.key} value={tab.key}>{tab.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={blockFilter} onValueChange={setBlockFilter}>
            <SelectTrigger className="w-[150px]" aria-label="Lọc theo khối quản lý">
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
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Thêm thiết bị theo dõi"
                              className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                              onClick={() => openTrackingDialog(m)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Mở theo dõi thay thế vật tư" className="text-accent hover:bg-accent/10" onClick={() => setReplMaterial(m)}>
                              <Repeat className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" title="Chọn nội dung cần chỉnh sửa" aria-label="Chọn nội dung cần chỉnh sửa">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-60">
                                <DropdownMenuItem onSelect={() => openEditDetails(m)}>
                                  <Repeat className="text-accent" />
                                  <span>Chi tiết điểm thay thế</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => { setIsNew(false); setEdit(materialForEdit(m)); }}>
                                  <Package className="text-navy" />
                                  <span>Thông tin vật tư</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Chọn nội dung cần xóa"
                                  aria-label="Chọn nội dung cần xóa"
                                  className="text-muted-foreground hover:bg-red-50 hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-60">
                                <DropdownMenuItem
                                  disabled={!replacementRowsForEdit(m).length}
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => openDeleteDetails(m)}
                                >
                                  <Repeat />
                                  <span>Xóa chi tiết điểm thay thế</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(m)}>
                                  <Trash2 />
                                  <span>Xóa vật tư</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                        {!canManage && (
                          <Button variant="ghost" size="icon" title="Mở theo dõi thay thế vật tư" className="text-accent hover:bg-accent/10" onClick={() => setReplMaterial(m)}>
                            <Repeat className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={canManage ? 6 : 5} className="px-6 py-4">
                        <MaterialExpandedDetails m={m} blockFilter={blockFilter} onOpenTracking={() => setReplMaterial(m)} />
                        {trackingMaterial?.id === m.id && (
                          <InlineTrackingEditor
                            material={m}
                            rows={trackingRows}
                            saving={upsert.isPending}
                            onRowsChange={setTrackingRows}
                            onCancel={() => {
                              setTrackingMaterial(null);
                              setTrackingRows([]);
                            }}
                            onSave={confirmAddTrackingPoints}
                          />
                        )}
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

      <Dialog
        open={!!editingDetails}
        onOpenChange={(open) => {
          if (!open) {
            setEditingDetails(null);
            setDetailRows([]);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa chi tiết điểm thay thế</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {editingDetails?.name} · Các điểm đang theo dõi trong lịch thay thế không bị thay đổi.
            </p>
          </DialogHeader>
          {editingDetails && (
            <ReplacementPointsEditor
              value={detailRows}
              unit={editingDetails.unit}
              onChange={setDetailRows}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingDetails(null); setDetailRows([]); }}>Hủy</Button>
            <Button onClick={saveDetails} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Lưu chi tiết
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{isNew ? "Thêm vật tư" : `Cập nhật: ${edit?.name}`}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tổ máy" className="col-span-2">
                {/* Multi-select cho cả Thêm mới lẫn Cập nhật: vật tư tồn tại trên đúng các tổ máy được tick. */}
                <div className="grid grid-cols-3 gap-2">
                  {MACHINE_TABS.map((t) => {
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
                  })}
                </div>
              </Field>
              <Field label="Mã vật tư ERP *" className="col-span-2">
                <Input
                  value={erpSearch}
                  onChange={(e) => setErpSearch(e.target.value)}
                  placeholder="Tìm nhóm vật tư, mã ERP con, ĐVT..."
                  className="mb-2"
                />
                <div className="overflow-hidden rounded-md border border-input bg-white">
                  <div className="grid grid-cols-[minmax(0,1.7fr)_112px_132px] gap-3 border-b border-border bg-muted/50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <span>Nhóm vật tư</span>
                    <span className="text-right">Hiện có</span>
                    <span className="text-right">Tổng tồn ERP</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                  {filteredErpGroups.map((group) => {
                    const checked = group.erpCodes.some((code) => selectedErpCodeSet.has(code));
                    return (
                      <label
                        key={group.id}
                        className={cn(
                          "grid cursor-pointer grid-cols-[minmax(0,1.7fr)_112px_132px] gap-3 border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-muted/40",
                          checked && "bg-blue-50/70"
                        )}
                      >
                        <span className="flex min-w-0 items-start gap-3">
                          <Checkbox
                            aria-label={`Chọn nhóm ${group.name}`}
                            checked={checked}
                            onCheckedChange={(v) => toggleErpGroup(group, v === true)}
                          />
                          <span className="min-w-0">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold text-navy">{group.code}</span>
                              <span className="truncate text-sm font-semibold text-ink">{group.name}</span>
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {group.materialCount} mã ERP · ĐVT chuẩn: {group.unit}
                            </span>
                          </span>
                        </span>
                        <span className="self-center text-right text-sm font-semibold tabular-nums text-ink">
                          {fmtNumber(group.onHandQty)} <span className="font-normal text-muted-foreground">{group.unit}</span>
                        </span>
                        <span className="self-center text-right text-sm font-semibold tabular-nums text-ink">
                          {fmtNumber(group.totalErpStock)} <span className="font-normal text-muted-foreground">{group.unit}</span>
                        </span>
                      </label>
                    );
                  })}
                  </div>
                </div>
                {!erpMaterialsQuery.isLoading && erpGroupOptions.length === 0 && (
                  <p className="mt-1.5 text-xs text-red-600">Chưa có nhóm vật tư ERP thuộc loại "{erpCategoryFilter}". Vui lòng gom nhóm ERP trước.</p>
                )}
                {!erpMaterialsQuery.isLoading && erpGroupOptions.length > 0 && filteredErpGroups.length === 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">Không có nhóm vật tư nào khớp từ khoá trong loại "{erpCategoryFilter}".</p>
                )}
                {selectedErpGroups.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedErpGroups.flatMap((group) =>
                      group.erpCodes
                        .filter((code) => selectedErpCodeSet.has(code))
                        .map((code) => (
                          <span key={`${group.id}-${code}`} className="rounded-md bg-accent/10 px-2 py-1 font-mono text-xs font-semibold text-accent">
                            {code}
                          </span>
                        ))
                    )}
                  </div>
                )}
              </Field>
              <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.65fr)]">
                <Field label="Tên vật tư *">
                  <Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                </Field>
                <Field label="Loại vật tư">
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
              </div>
              <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="ĐVT *">
                  <Input value={edit.unit ?? ""} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} placeholder="Cái / Lít / Bộ..." />
                </Field>
                <Field label="Số liệu ERP">
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-semibold tabular-nums text-ink">
                    {selectedErpCodes.length ? selectedErpStock : edit.minStock || 0}
                  </div>
                </Field>
                <Field label="Hiện Có">
                  <Input type="number" min={0} value={edit.quantity ?? 0} onChange={(e) => setEdit({ ...edit, quantity: Number(e.target.value) })} />
                </Field>
              </div>
              <div className="col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <Field label="Ảnh vật tư">
                  <MaterialImageField value={edit.imageUrl ?? null} onChange={(url) => setEdit({ ...edit, imageUrl: url })} />
                </Field>
                <Field label="Tài liệu đính kèm">
                  <MaterialDocumentField
                    url={edit.documentUrl ?? ""}
                    name={edit.documentName ?? ""}
                    onChange={(documentUrl, documentName) => setEdit({ ...edit, documentUrl, documentName })}
                  />
                </Field>
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

      <Dialog
        open={!!deletingDetails}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingDetails(null);
            setSelectedDetailIds(new Set());
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Xóa chi tiết điểm thay thế</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Chọn một hoặc nhiều dòng cần xóa của {deletingDetails?.name}. Các điểm đã thêm vào lịch theo dõi vẫn được giữ nguyên.
            </p>
          </DialogHeader>
          {deletingDetails && (() => {
            const rows = (deletingDetails.replacements ?? []).filter((row) => !row.isActive);
            const allSelected = rows.length > 0 && rows.every((row) => selectedDetailIds.has(row.id));
            return (
              <div className="overflow-hidden rounded-lg border border-border">
                <label className="flex cursor-pointer items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-ink">
                  <Checkbox
                    checked={allSelected ? true : selectedDetailIds.size > 0 ? "indeterminate" : false}
                    onCheckedChange={(checked) => setSelectedDetailIds(checked === true ? new Set(rows.map((row) => row.id)) : new Set())}
                    aria-label="Chọn tất cả chi tiết điểm thay thế"
                  />
                  Chọn tất cả ({rows.length})
                </label>
                <div className="max-h-72 divide-y divide-border overflow-y-auto">
                  {rows.map((row) => {
                    const checked = selectedDetailIds.has(row.id);
                    return (
                      <label key={row.id} className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => setSelectedDetailIds((current) => {
                            const next = new Set(current);
                            if (value === true) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          })}
                          aria-label={`Chọn ${row.device?.name || row.system || row.location || "điểm thay thế"}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold uppercase text-ink">{row.device?.name || row.system || "Chưa chọn hệ thống"}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {[row.location, row.managingPosition, row.intervalMonths === 0 ? "Không theo dõi lịch" : `${row.intervalMonths} tháng`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeletingDetails(null); setSelectedDetailIds(new Set()); }}>Hủy</Button>
            <Button variant="destructive" onClick={confirmDeleteDetails} disabled={upsert.isPending || selectedDetailIds.size === 0}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Xóa {selectedDetailIds.size || ""} dòng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <ImportReplacementsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        materials={data?.data ?? []}
        machineTab={machineTab}
        machineLabel={machineLabel}
      />
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><Label className="mb-1.5 block">{label}</Label>{children}</div>;
}

// ————————————————————————————————————————————————————————————————
// Nhập / đồng bộ chi tiết điểm thay thế từ file Excel.
// ————————————————————————————————————————————————————————————————
type ImportParsedRow = {
  rowNumber: number;
  materialName?: string;
  erpCode?: string;
  machine?: string;
  system?: string;
  deviceSeq?: string;
  deviceName?: string;
  managingPosition?: string;
  deviceCount?: number;
  quantity?: number;
  intervalNote?: string;
  intervalMonths?: number;
};

type ImportResult = {
  validCount: number;
  errors: { rowNumber: number; message: string }[];
  preview: Array<{ rowNumber: number; materialName: string; deviceLabel: string; system: string | null; deviceCount: number; quantity: number; unit: string; intervalMonths: number }>;
  created: number;
  updated: number;
};

// Thứ tự cột file mẫu — (*) = bắt buộc.
const IMPORT_HEADERS = [
  "Tên vật tư (*)",
  "Mã ERP",
  "Tổ máy (*)",
  "Hệ thống / cây thư mục (*)",
  "Mã thiết bị (mã cây/KKS)",
  "Tên thiết bị",
  "Cương vị quản lý",
  "Số lượng thiết bị",
  "Số lượng cần thay / thiết bị (*)",
  "Chu kỳ O&M",
  "Chu kỳ thay thế (tháng) (*)",
];

// Nhận diện cột theo tên tiêu đề (fold dấu) — bền với thứ tự/biến thể chữ.
function detectImportColumn(header: unknown): keyof ImportParsedRow | null {
  const h = normalizeText(String(header ?? "")).replace(/\s+/g, " ");
  if (!h) return null;
  if (h.includes("erp")) return "erpCode";
  if (h.includes("ten vat tu") || h === "vat tu") return "materialName";
  if (h.includes("to may")) return "machine";
  if (h.includes("cay thu muc") || h.includes("he thong")) return "system";
  if (h.includes("seq") || h.includes("ma thiet bi")) return "deviceSeq";
  if (h.includes("ten thiet bi")) return "deviceName";
  if (h.includes("cuong vi")) return "managingPosition";
  if (h.includes("so luong thiet bi")) return "deviceCount";
  if (h.includes("can thay")) return "quantity";
  if (h.includes("chu ky thay the")) return "intervalMonths";
  if (h.includes("chu ky")) return "intervalNote";
  return null;
}

// "12 tháng" / 12 / "Không theo dõi lịch" → số tháng.
function parseMonths(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : undefined;
  const s = normalizeText(String(value ?? ""));
  if (!s) return undefined;
  if (s.includes("khong theo doi") || s === "0") return 0;
  const digits = s.match(/-?\d+/);
  return digits ? parseInt(digits[0], 10) : undefined;
}

function parseIntCell(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : undefined;
  const s = String(value ?? "").replace(/[^\d.-]/g, "").trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function ImportReplacementsDialog({
  open,
  onOpenChange,
  materials,
  machineTab,
  machineLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  materials: MaterialWithDevices[];
  machineTab: string;
  machineLabel: string;
}) {
  const qc = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState("");
  const [rows, setRows] = React.useState<ImportParsedRow[]>([]);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [busy, setBusy] = React.useState(false);

  function reset() {
    setFileName("");
    setRows([]);
    setResult(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  const erpOf = (m: MaterialWithDevices) =>
    Array.from(new Set([...(m.erpCodes ?? []), m.code].map((c) => String(c ?? "").trim()).filter(Boolean))).join(" / ");

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();

    // Sheet 1 — form nhập (chỉ có dòng tiêu đề, người dùng điền tiếp).
    const ws1 = XLSX.utils.aoa_to_sheet([IMPORT_HEADERS]);
    ws1["!cols"] = [32, 16, 8, 28, 16, 26, 18, 12, 18, 14, 18].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws1, "Nhập điểm thay thế");

    // Sheet 2 — danh mục vật tư đang theo dõi (tham chiếu để điền đúng tên).
    const catHeader = ["Tên vật tư", "Mã ERP", "ĐVT", "Tổ máy", "Loại vật tư", "Hệ thống mặc định"];
    const catRows = materials
      .slice()
      .sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "", "vi") || compareNatural(a.name, b.name))
      .map((m) => [m.name, erpOf(m), m.unit ?? "", m.machine ?? "COMMON", m.category ?? "", m.system ?? ""]);
    const ws2 = XLSX.utils.aoa_to_sheet([catHeader, ...catRows]);
    ws2["!cols"] = [34, 18, 8, 8, 16, 24].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws2, "Danh mục vật tư");

    // Sheet 3 — hướng dẫn.
    const guide: (string | number)[][] = [
      ["HƯỚNG DẪN NHẬP CHI TIẾT ĐIỂM THAY THẾ", ""],
      ["", ""],
      ["• Nhập dữ liệu vào sheet “Nhập điểm thay thế”, mỗi điểm thay thế là 1 dòng.", ""],
      ["• Tên vật tư phải khớp với sheet “Danh mục vật tư” (chép đúng tên hoặc điền Mã ERP).", ""],
      ["• Cột có (*) là bắt buộc.", ""],
      ["• Tải lại lên hệ thống: điểm đã có sẽ được CẬP NHẬT, điểm mới sẽ được THÊM.", ""],
      ["", ""],
      ["Cột", "Ý nghĩa"],
      ["Tên vật tư (*)", "Tên vật tư trong danh mục (xem sheet Danh mục vật tư)."],
      ["Mã ERP", "Điền khi tên vật tư bị trùng, để xác định đúng vật tư."],
      ["Tổ máy (*)", "S1, S2 hoặc COMMON — phải trùng tổ máy của vật tư."],
      ["Hệ thống / cây thư mục (*)", "Tên hệ thống/nhánh cây thiết bị. Bắt buộc nếu để trống cột Mã thiết bị."],
      ["Mã thiết bị (mã cây/KKS)", "Tuỳ chọn — để liên kết đúng thiết bị trên cây. Dùng mã cây (VD DH1.S1.1.1.1.1) hoặc mã KKS (VD 10HFE10AN001). Có thể ghi rút gọn 1.1.1.1.1 (tự thêm tiền tố tổ máy). Nếu KHÔNG có, để trống — điểm sẽ lưu theo Hệ thống + Tên thiết bị."],
      ["Tên thiết bị", "Tuỳ chọn — tên thiết bị. Nếu có Mã thiết bị thì tên phải khớp; nếu không có mã sẽ lưu dạng tự do."],
      ["Cương vị quản lý", "Cương vị quản lý điểm thay thế (đồng bộ danh sách với khiếm khuyết)."],
      ["Số lượng thiết bị", "Số thiết bị tại điểm này (mặc định 1)."],
      ["Số lượng cần thay / thiết bị (*)", "Dung tích/số lượng cần thay cho MỖI thiết bị (theo ĐVT của vật tư)."],
      ["Chu kỳ O&M", "Ghi chú chu kỳ theo giờ vận hành, ví dụ 2500h (tuỳ chọn)."],
      ["Chu kỳ thay thế (tháng) (*)", "Số tháng giữa 2 lần thay. 0 = chỉ khai báo, không theo dõi lịch."],
      ["", ""],
      ["VÍ DỤ 1 (theo hệ thống, không cần mã)", ""],
      ["Dầu Shell Turbo T32 | (trống) | S1 | Hệ thống dầu điều khiển | (trống) | Bơm dầu chính | Trưởng ca VH | 2 | 40 | 8000h | 12", ""],
      ["VÍ DỤ 2 (liên kết thiết bị bằng mã cây)", ""],
      ["Dầu Shell Turbo T32 | (trống) | S1 | (trống) | DH1.S1.1.1.1.1 | Quạt gió PAF A | Trưởng ca VH | 1 | 20 | 8000h | 12", ""],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(guide);
    ws3["!cols"] = [32, 78].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws3, "Hướng dẫn");

    XLSX.writeFile(wb, `mau-nhap-diem-thay-the_${String(machineTab).toLowerCase()}.xlsx`);
  }

  async function runImport(parsed: ImportParsedRow[], dryRun: boolean): Promise<ImportResult> {
    const res = await fetch("/api/materials/import-replacements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: parsed, dryRun }),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || "Nhập điểm thay thế thất bại");
    return json.data as ImportResult;
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setRows([]);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames.find((n) => normalizeText(n).includes("nhap diem")) ?? wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
      if (aoa.length < 2) throw new Error("File chưa có dòng dữ liệu nào ở sheet “Nhập điểm thay thế”");

      const headerRow = aoa[0] as unknown[];
      const colMap: Partial<Record<keyof ImportParsedRow, number>> = {};
      headerRow.forEach((h, i) => {
        const key = detectImportColumn(h);
        if (key && colMap[key] === undefined) colMap[key] = i;
      });
      if (colMap.materialName === undefined && colMap.erpCode === undefined) {
        throw new Error("Không tìm thấy cột “Tên vật tư” / “Mã ERP” — hãy dùng đúng file mẫu");
      }

      const str = (row: unknown[], key: keyof ImportParsedRow) =>
        colMap[key] !== undefined ? String(row[colMap[key]!] ?? "").trim() : "";
      const num = (row: unknown[], key: keyof ImportParsedRow) =>
        colMap[key] !== undefined ? row[colMap[key]!] : undefined;

      const parsed: ImportParsedRow[] = [];
      for (let r = 1; r < aoa.length; r++) {
        const row = aoa[r] as unknown[];
        const materialName = str(row, "materialName");
        const erpCode = str(row, "erpCode");
        const system = str(row, "system");
        const deviceSeq = str(row, "deviceSeq");
        const deviceName = str(row, "deviceName");
        // Bỏ qua dòng trống hoàn toàn.
        if (!materialName && !erpCode && !system && !deviceSeq && !deviceName) continue;
        parsed.push({
          rowNumber: r + 1,
          materialName,
          erpCode,
          machine: str(row, "machine") || machineTab,
          system,
          deviceSeq,
          deviceName,
          managingPosition: str(row, "managingPosition"),
          deviceCount: parseIntCell(num(row, "deviceCount")),
          quantity: parseIntCell(num(row, "quantity")),
          intervalNote: str(row, "intervalNote"),
          intervalMonths: parseMonths(num(row, "intervalMonths")),
        });
      }
      if (!parsed.length) throw new Error("Không có dòng dữ liệu hợp lệ trong file");
      setRows(parsed);
      const dry = await runImport(parsed, true);
      setResult(dry);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không đọc được file Excel");
      setFileName("");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!rows.length || !result || result.errors.length) return;
    setBusy(true);
    try {
      const res = await runImport(rows, false);
      toast.success(`Đã nhập ${res.created} điểm mới, cập nhật ${res.updated} điểm thay thế`);
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["device-material-options"] });
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nhập điểm thay thế thất bại");
    } finally {
      setBusy(false);
    }
  }

  const hasErrors = !!result && result.errors.length > 0;
  const canConfirm = !!result && !hasErrors && result.validCount > 0 && !busy;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-navy" /> Nhập chi tiết điểm thay thế — {machineLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-sm text-ink">
            <p className="font-medium">Cách dùng</p>
            <ol className="ml-4 mt-1 list-decimal space-y-0.5 text-muted-foreground">
              <li>Tải file mẫu (đã kèm sheet <span className="font-medium text-ink">Danh mục vật tư</span> để tra đúng tên).</li>
              <li>Điền các điểm thay thế vào sheet <span className="font-medium text-ink">Nhập điểm thay thế</span>.</li>
              <li>Tải file lên — hệ thống kiểm tra rồi thêm/cập nhật điểm theo từng vật tư.</li>
            </ol>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> Tải file mẫu (.xlsx)
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Chọn file để nhập
            </Button>
            {fileName && <span className="flex items-center text-sm text-muted-foreground">{fileName}</span>}
          </div>

          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  {hasErrors ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {rows.length} dòng đọc được · {result.validCount} hợp lệ
                  {hasErrors && ` · ${result.errors.length} lỗi`}
                </span>
              </div>

              {hasErrors ? (
                <div className="max-h-56 overflow-auto rounded-lg border border-red-100">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-red-50 text-red-800">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium w-20">Dòng</th>
                        <th className="px-3 py-2 text-left font-medium">Lỗi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((err, i) => (
                        <tr key={i} className="border-t border-red-100">
                          <td className="px-3 py-1.5 text-ink">{err.rowNumber}</td>
                          <td className="px-3 py-1.5 text-ink">{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="max-h-56 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/60 text-ink">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Vật tư</th>
                        <th className="px-3 py-2 text-left font-medium">Thiết bị / hệ thống</th>
                        <th className="px-3 py-2 text-center font-medium">SL TB</th>
                        <th className="px-3 py-2 text-center font-medium">Cần thay</th>
                        <th className="px-3 py-2 text-center font-medium">Chu kỳ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.preview.map((p, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-1.5 text-ink">{p.materialName}</td>
                          <td className="px-3 py-1.5 text-ink">{p.deviceLabel || p.system || "—"}</td>
                          <td className="px-3 py-1.5 text-center text-ink">{p.deviceCount}</td>
                          <td className="px-3 py-1.5 text-center text-ink">{p.quantity * p.deviceCount} {p.unit}</td>
                          <td className="px-3 py-1.5 text-center text-ink">{p.intervalMonths === 0 ? "—" : `${p.intervalMonths} th`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {hasErrors && <p className="text-sm text-muted-foreground">Hãy sửa các lỗi trên trong file rồi tải lại. Chỉ nhập được khi không còn lỗi.</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={busy}>Đóng</Button>
          <Button type="button" onClick={confirmImport} disabled={!canConfirm}>
            {busy && result ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Xác nhận nhập {result && !hasErrors ? result.validCount : ""} điểm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InlineTrackingEditor({
  material,
  rows,
  saving,
  onRowsChange,
  onCancel,
  onSave,
}: {
  material: MaterialWithDevices;
  rows: MaterialReplacementInput[];
  saving: boolean;
  onRowsChange: (rows: MaterialReplacementInput[]) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink">Thêm thiết bị theo dõi</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Khai báo hệ thống/thiết bị cần theo dõi thay thế cho {material.name}.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            Huỷ
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Lưu thiết bị theo dõi
          </Button>
        </div>
      </div>
      <ReplacementPointsEditor value={rows} unit={material.unit} onChange={onRowsChange} />
    </div>
  );
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
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_auto]">
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
        <Button type="button" variant="outline" className="w-full shrink-0 bg-white xl:w-auto" disabled={uploading} onClick={() => inputRef.current?.click()}>
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

/**
 * So sánh tên theo thứ tự TỰ NHIÊN tiếng Việt: chữ cái A→B→C và số 1→2→3 đúng giá trị
 * ("Bơm #2" trước "Bơm #10", không phải sắp theo chuỗi). Bỏ qua hoa/thường & dấu.
 */
const naturalCollator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });
function compareNatural(a: string, b: string) {
  return naturalCollator.compare(a ?? "", b ?? "");
}

/** Panel bung: liệt kê các thiết bị theo dõi đã khai báo cho vật tư. */
function MaterialExpandedDetails({ m, blockFilter = "ALL", onOpenTracking }: { m: MaterialWithDevices; blockFilter?: string; onOpenTracking?: () => void }) {
  const points = React.useMemo(
    () =>
      (m.replacements ?? [])
        .filter((r) => !r.isActive && (blockFilter === "ALL" || blockForPosition(r.managingPosition) === blockFilter))
        // Gom các điểm CÙNG HỆ THỐNG nằm liền kề; trong mỗi hệ thống sắp thiết bị theo thứ tự
        // tự nhiên (Bơm A → B → C, Quạt 1 → 2 → 3, "#2" trước "#10").
        .slice()
        .sort((a, b) => {
          const systemOf = (p: typeof a) => p.device?.system || p.system || p.device?.name || "";
          const deviceOf = (p: typeof a) => p.device?.name || p.location || "";
          return (
            compareNatural(systemOf(a), systemOf(b)) ||
            compareNatural(deviceOf(a), deviceOf(b))
          );
        }),
    [m.replacements, blockFilter]
  );
  const createPoint = useCreateReplacement();

  type PanelPoint = NonNullable<MaterialWithDevices["replacements"]>[number];

  const [tracking, setTracking] = React.useState<PanelPoint | null>(null);
  const [trackDate, setTrackDate] = React.useState("");
  const [trackMonths, setTrackMonths] = React.useState(12);

  function openTracking(p: PanelPoint) {
    setTrackDate(formatDateInput(new Date()));
    setTrackMonths(p.intervalMonths);
    setTracking(p);
  }

  async function confirmTracking() {
    if (!tracking) return;
    try {
      const months = Math.max(0, Math.round(trackMonths));
      if (months === 0) return toast.error("Chu kỳ 0 không theo dõi lịch thay thế");
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
      onOpenTracking?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thể thêm điểm theo dõi");
    }
  }

  if (points.length === 0) {
    return (
      <div className="space-y-3">
        {m.documentUrl && <MaterialDocumentLink url={m.documentUrl} name={m.documentName} />}
        <div className="rounded-xl border border-dashed border-border bg-white/60 px-4 py-3 text-sm text-muted-foreground">
          Chưa gán hệ thống/thiết bị cho vật tư này. Bấm dấu <b>+</b> ở cột Thao tác để thêm thiết bị theo dõi.
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
        <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              {/* nowrap toàn bảng: mỗi ô nội dung nằm gọn 1 dòng, cột tự co giãn theo nội dung. */}
              <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Hệ thống / thiết bị</th>
              <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Thiết bị</th>
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Cương vị quản lý</th>
              <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">SL thiết bị</th>
              <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">Chu kỳ O&M</th>
              <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">Chu kỳ thay thế</th>
              <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">Số lượng cần thay</th>
              <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">Theo dõi</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                {/* Hệ thống của thiết bị (tên node cha trong cây) — fallback: system đã lưu, rồi tên thiết bị. */}
                <td className="px-4 py-2.5 font-medium uppercase text-ink whitespace-nowrap">{p.device?.system || p.system || p.device?.name || "—"}</td>
                {/* Tên thiết bị SỐNG theo cây (đổi tên node là cập nhật) — location chỉ là snapshot lúc khai báo. */}
                <td className="px-4 py-2.5 text-ink whitespace-nowrap">{p.device?.name || p.location || "—"}</td>
                <td className="px-3 py-2.5 text-ink whitespace-nowrap">{p.managingPosition || "—"}</td>
                <td className="px-3 py-2.5 text-center text-ink whitespace-nowrap">{p.deviceCount ?? 1}</td>
                {/* Ghi chú O&M quá dài thì cắt bớt kèm tooltip, tránh 1 ô kéo vỡ cả bảng. */}
                <td className="px-3 py-2.5 text-center text-ink whitespace-nowrap">
                  <span className="mx-auto block max-w-[280px] truncate" title={p.intervalNote || undefined}>{p.intervalNote || "—"}</span>
                </td>
                <td className="px-3 py-2.5 text-center text-ink whitespace-nowrap">{p.intervalMonths === 0 ? "Không theo dõi lịch" : `${p.intervalMonths} tháng`}</td>
                <td className="px-3 py-2.5 text-center font-semibold text-ink whitespace-nowrap">{p.quantity * (p.deviceCount || 1)} {m.unit}</td>
                <td className="px-4 py-2.5 text-center">
                  <button
                    type="button"
                    disabled={createPoint.isPending || p.intervalMonths === 0}
                    onClick={() => openTracking(p)}
                    title={p.intervalMonths === 0 ? "Chu kỳ 0 không theo dõi lịch thay thế" : "Thêm điểm theo dõi thời gian thay thế cho thiết bị này"}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> {p.intervalMonths === 0 ? "Không theo dõi" : "Thêm điểm"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <Dialog open={!!tracking} onOpenChange={(open) => !open && setTracking(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm điểm theo dõi</DialogTitle>
          </DialogHeader>
          {tracking && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <div className="font-semibold uppercase text-ink">{tracking.device?.name || tracking.system || "—"}</div>
                {(tracking.device?.name || tracking.location) && (
                  <div className="text-muted-foreground">Thiết bị: {tracking.device?.name || tracking.location}</div>
                )}
              </div>
              <Field label="Lần thay gần nhất">
                <Input type="date" value={trackDate} onChange={(e) => setTrackDate(e.target.value)} />
              </Field>
              <Field label="Chu kỳ thay thế (tháng)">
                <Input type="number" min={0} value={trackMonths} onChange={(e) => setTrackMonths(Number(e.target.value))} />
              </Field>
              <p className="text-xs text-muted-foreground">
                Điểm theo dõi chỉ được tạo từ thao tác này và sẽ xuất hiện trong tab Theo dõi thay thế vật tư.
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
