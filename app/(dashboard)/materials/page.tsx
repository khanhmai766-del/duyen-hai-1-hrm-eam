"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Plus, Minus, Package, Pencil, Trash2, Upload, X, Loader2, ImageIcon, Repeat, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, Check, FileText, Link2, ExternalLink, Droplet, Filter, Cpu, FlaskConical, CircleDot, Boxes, Layers, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, Activity, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBar } from "@/components/shared/search-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { RbacProtectedRoute } from "@/components/shared/rbac-protected-route";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useMaterials, useUpsertMaterial, useDeleteMaterial, useDeleteMaterials, useMaterialStockLots, type MaterialWithDevices, type MaterialReplacementInput } from "@/hooks/useMaterials";
import { useErpMaterials } from "@/hooks/useErpMaterials";
import { ReplacementDrawer } from "@/components/materials/replacement-drawer";
import { ReplacementPointsEditor } from "@/components/materials/replacement-points-editor";
import { QlvtSyncAction } from "@/components/vat-tu/OilGroupingPage";
import { useCreateReplacement } from "@/hooks/useReplacements";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { displayMaterialCategory, replacementDueStatus, type ReplDueKey, MATERIAL_CATEGORIES, MATERIAL_CATEGORY_FILTERS, OTHER_MATERIAL_GROUP, DEFECT_UNITS, DEFECT_STATUS, addMonths, isOtherMaterialCategory, materialCategoryMatches, roundStock } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { STANDALONE_GROUP_PREFIX } from "@/lib/oil-grouping-shared";
import { positionLabelOf, positionsMatch } from "@/lib/position-catalog";
import { parseScope, scopeCode } from "@/lib/equipment-units";
import { cn, formatDate, formatDateInput } from "@/lib/utils";
import type { Material } from "@/types";

// Tab tổ máy — key trùng giá trị Material.machine (S1 | S2 | COMMON).
const MACHINE_TABS: { key: (typeof DEFECT_UNITS)[number]; label: string }[] = [
  { key: "S1", label: "Tổ Máy S1" },
  { key: "S2", label: "Tổ Máy S2" },
  { key: "COMMON", label: "COMMON" },
];

// Bộ lọc loại vật tư. "Vật tư khác" là nhóm hiển thị ảo, không phải giá trị Material.category.
const MATERIAL_CATEGORY_TABS: { key: (typeof MATERIAL_CATEGORY_FILTERS)[number]; label: string; icon: LucideIcon }[] = [
  { key: "Dầu bôi trơn", label: "Dầu bôi trơn", icon: Droplet },
  { key: "Lõi lọc dầu", label: "Lõi lọc", icon: Filter },
  { key: "Thiết bị C&I", label: "Thiết bị C&I", icon: Cpu },
  { key: "Hóa Chất", label: "Hóa chất", icon: FlaskConical },
  { key: "Bi Nghiền Than", label: "Bi Nghiền Than", icon: CircleDot },
  { key: OTHER_MATERIAL_GROUP, label: "Vật tư khác", icon: Boxes },
];

function categoryFilterFromParam(value: string | null): string | null {
  if ((MATERIAL_CATEGORY_FILTERS as readonly string[]).includes(value ?? "")) return value;
  // Tương thích các liên kết cũ trỏ thẳng tới một loại con trước khi gom nhóm.
  if (isOtherMaterialCategory(value)) return OTHER_MATERIAL_GROUP;
  return null;
}

// Form khiếm khuyết chỉ nạp khi thật sự mở panel "Ra SYC thay thế" — nó kéo theo
// cây thiết bị và danh sách người dùng, không đáng tải cùng trang Danh mục vật tư.
const DefectForm = dynamic(
  () => import("@/components/defects/defect-form").then((module) => module.DefectForm),
  { ssr: false }
);

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
    <RbacProtectedRoute permissionId="material-manage" featureLabel="Danh mục Vận Hành 1">
      <MaterialsPageContent />
    </RbacProtectedRoute>
  );
}

function MaterialsPageContent() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const rbac = useRbacAccess();
  const canCreate = rbac.can("material-manage", ["personal", "manage", "full"]);
  const canManage = rbac.can("material-manage", ["manage", "full"]);
  // CƯƠNG VỊ ĐANG TRỰC của người xem — dùng để mở ô nhập "Hiện có" cho đúng người đang giữ
  // vật tư đó, xem `canEditStock`.
  //
  // Phải lấy `currentPosition` chứ KHÔNG phải `position`: `position` là chức danh gốc trong hồ sơ
  // (vd "Thải xỉ"), còn người dùng đang trực cương vị nào mới là thứ quyết định (vd "XLNT").
  // Máy chủ xét theo cương vị đang trực, lấy sai trường ở đây là giao diện khoá ô trong khi API cho ghi.
  const viewerPosition = session?.user?.currentPosition ?? session?.user?.position ?? null;
  const erpMaterialsQuery = useErpMaterials();
  const upsert = useUpsertMaterial();
  const del = useDeleteMaterial();
  const delMany = useDeleteMaterials();
  const router = useRouter();
  const params = useSearchParams();
  const searchParam = params.get("search") ?? "";
  const categoryParam = params.get("category");
  const initialCategory = categoryFilterFromParam(categoryParam) ?? MATERIAL_CATEGORIES[0];
  const [q, setQ] = React.useState(searchParam);
  const [categoryFilter, setCategoryFilter] = React.useState<string>(initialCategory);
  const [positionFilter, setPositionFilter] = React.useState("ALL");
  const [edit, setEdit] = React.useState<MaterialEdit | null>(null);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [deleting, setDeleting] = React.useState<Material | null>(null);
  const [isNew, setIsNew] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [lotBoardOpen, setLotBoardOpen] = React.useState(false);
  const [replMaterial, setReplMaterial] = React.useState<Material | null>(null);
  const [trackingMaterial, setTrackingMaterial] = React.useState<MaterialWithDevices | null>(null);
  const [trackingRows, setTrackingRows] = React.useState<MaterialReplacementInput[]>([]);
  const [editingDetails, setEditingDetails] = React.useState<MaterialWithDevices | null>(null);
  const [detailRows, setDetailRows] = React.useState<MaterialReplacementInput[]>([]);
  const [importOpen, setImportOpen] = React.useState(false);
  const [replacementDataOpen, setReplacementDataOpen] = React.useState(false);
  const [deletingDetails, setDeletingDetails] = React.useState<MaterialWithDevices | null>(null);
  const [selectedDetailIds, setSelectedDetailIds] = React.useState<Set<string>>(new Set());
  const [materialRequestSelection, setMaterialRequestSelection] = React.useState<MaterialRequestSelection[]>([]);
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
        // Số của nhóm ERP là số thập phân; ô "Hiện có" là số nguyên nên làm tròn ngay khi điền sẵn.
        quantity: isFirstSelection ? roundStock(group.onHandQty) : prev?.quantity,
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
    const nextCategory = categoryFilterFromParam(categoryParam);
    if (nextCategory) setCategoryFilter(nextCategory);
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
  // Danh sách cương vị lấy trực tiếp từ các dòng khai báo của tổ máy + loại vật tư
  // đang xem. Chuẩn hóa nhãn và gộp các bí danh để tránh lựa chọn trùng nhau.
  /**
   * Sửa ô "Hiện có" (số đếm thực tế tại kho của phân xưởng): ngoài nhóm quản lý danh mục,
   * cương vị NÀO ĐANG QUẢN LÝ thiết bị đã khai báo vật tư này cũng sửa được — họ là người
   * mở kho đếm thật, bắt họ báo cho quản trị gõ hộ thì số liệu luôn đi sau thực tế. Các ô khác
   * của danh mục vẫn chỉ nhóm quản lý được sửa; máy chủ kiểm lại đúng luật này.
   */
  const canEditStock = React.useCallback(
    (material: MaterialWithDevices) =>
      canManage ||
      (material.replacements ?? []).some((replacement) =>
        positionsMatch(replacement.managingPosition, viewerPosition)
      ),
    [canManage, viewerPosition]
  );

  const managingPositionOptions = React.useMemo(() => {
    const positions: string[] = [];
    for (const material of data?.data ?? []) {
      if ((material.machine ?? "COMMON") !== machineTab) continue;
      if (!materialCategoryMatches(material.category, categoryFilter)) continue;
      for (const replacement of material.replacements ?? []) {
        if (replacement.isActive || !replacement.managingPosition?.trim()) continue;
        const label = positionLabelOf(replacement.managingPosition);
        if (label && !positions.some((position) => positionsMatch(position, label))) positions.push(label);
      }
    }
    return positions.sort(compareNatural);
  }, [categoryFilter, data?.data, machineTab]);

  React.useEffect(() => {
    if (
      positionFilter !== "ALL" &&
      !managingPositionOptions.some((position) => positionsMatch(position, positionFilter))
    ) {
      setPositionFilter("ALL");
    }
  }, [managingPositionOptions, positionFilter]);

  const materialMatchesPosition = React.useCallback(
    (m: MaterialWithDevices) =>
      positionFilter === "ALL" ||
      (m.replacements ?? []).some(
        (replacement) =>
          !replacement.isActive && positionsMatch(replacement.managingPosition, positionFilter)
      ),
    [positionFilter]
  );
  const materials = (data?.data ?? []).filter(
    (m) =>
      (m.machine ?? "COMMON") === machineTab &&
      (!q || `${materialErpCodes(m).join(" ")} ${m.name} ${deviceLabel(m)}`.toLowerCase().includes(q.toLowerCase())) &&
      materialCategoryMatches(m.category, categoryFilter) &&
      materialMatchesPosition(m)
  );
  const isFiltered = q.trim() !== "" || positionFilter !== "ALL";

  /**
   * Xuất CSV "Chi tiết điểm thay thế" của TẤT CẢ vật tư đang hiển thị (theo đúng bộ lọc
   * tổ máy / loại vật tư / cương vị quản lý / từ khoá) — mỗi điểm thay thế là 1 dòng, kèm thông tin vật tư.
   * Dùng đúng thứ tự sắp xếp như bảng: gom theo hệ thống, rồi thiết bị theo thứ tự tự nhiên.
   */
  function exportReplacementPointsCsv() {
    // Xuất ĐÚNG bộ cột của form nhập (IMPORT_HEADERS) + cột "Lần thay gần nhất" để người
    // dùng điền ngày rồi tải lại lên → hệ thống tạo lịch theo dõi. Hai cột cuối chỉ để
    // tham chiếu, KHÔNG được đọc khi nhập lại.
    const header = [...IMPORT_HEADERS, "Loại vật tư (tham chiếu)", "ĐVT (tham chiếu)", "Tổng nhu cầu 1 chu kỳ (tham chiếu)"];
    const rows: (string | number)[][] = [];
    const sortedMaterials = materials.slice().sort((a, b) => compareNatural(a.name, b.name));
    for (const m of sortedMaterials) {
      const all = m.replacements ?? [];
      const points = all
        .filter(
          (r) =>
            !r.isActive &&
            (positionFilter === "ALL" || positionsMatch(r.managingPosition, positionFilter))
        )
        .slice()
        .sort((a, b) => {
          const systemOf = (p: typeof a) => p.device?.system || p.system || p.device?.name || "";
          const deviceOf = (p: typeof a) => p.device?.name || p.location || "";
          return compareNatural(systemOf(a), systemOf(b)) || compareNatural(deviceOf(a), deviceOf(b));
        });
      for (const p of points) {
        // Ngày thay gần nhất nằm ở ĐIỂM THEO DÕI (isActive=true) tương ứng, không ở dòng
        // khai báo — xuất ra để lần sau thấy ngày đang có, sửa rồi tải lại.
        const tracking = all.find(
          (r) =>
            r.isActive &&
            (p.deviceSeq
              ? r.deviceSeq === p.deviceSeq
              : r.deviceSeq === null && r.system === p.system && r.location === p.location)
        );
        rows.push([
          m.name,
          materialErpCodes(m).join(" / "),
          m.machine ?? "COMMON",
          p.device?.system || p.system || "",
          // Mã theo tổ máy của vật tư (S2 → DH1.S2…) — khi nhập lại được quy về mã chuẩn.
          p.deviceSeq ? scopeCode(p.deviceSeq, parseScope(m.machine)) : "",
          p.device?.name || p.location || "",
          p.managingPosition || "",
          p.deviceCount ?? 1,
          p.quantity, // per thiết bị — khớp đúng nghĩa cột của form nhập
          p.intervalNote || "",
          p.intervalMonths === 0 ? "Không theo dõi lịch" : `${p.intervalMonths} tháng`,
          tracking?.lastReplacedAt ? formatDate(tracking.lastReplacedAt) : "",
          m.category ?? "",
          m.unit ?? "",
          p.quantity * (p.deviceCount || 1),
        ]);
      }
    }
    if (!rows.length) {
      toast.error("Không có điểm thay thế nào trong danh sách đang hiển thị");
      return;
    }
    // Xuất .xlsx để cột ngày giữ nguyên định dạng dd/mm/yyyy và tải lại được ngay
    // (CSV dấu ; hay bị Excel tự đổi kiểu ngày theo locale máy).
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = [32, 18, 8, 26, 22, 26, 18, 12, 16, 14, 18, 18, 16, 8, 16].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, "Nhập điểm thay thế");
    XLSX.writeFile(
      wb,
      `diem-thay-the_${machineTab}_${displayMaterialCategory(categoryFilter)}_${new Date().toISOString().slice(0, 10)}.xlsx`
        .replace(/\s+/g, "-")
        .toLowerCase()
    );
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

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeMachineTab(nextMachine: string) {
    const next = new URLSearchParams(params.toString());
    next.set("may", nextMachine);
    next.delete("track");
    router.replace(`/materials?${next.toString()}`, { scroll: false });
  }

  function changeCategoryTab(nextCategory: string) {
    setCategoryFilter(nextCategory);
    // Hóa chất và chai khí là danh mục dùng chung, nên khi người dùng chọn nhóm này
    // tự chuyển phạm vi tổ máy về COMMON. Các nhóm còn lại giữ nguyên tổ máy đang xem.
    if ((nextCategory === "Hóa Chất" || nextCategory === "Chai Khí") && machineTab !== "COMMON") {
      changeMachineTab("COMMON");
    }
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
          // "Hiện có": từ .5 trở lên làm tròn lên, dưới .5 làm tròn xuống (4.5 → 5, 4.4 → 4).
          ...(edit.quantity != null ? { quantity: roundStock(edit.quantity) } : {}),
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
        recoveryOnSupplement: r.recoveryOnSupplement === true,
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
    setExpandedIds((current) => new Set(current).add(material.id));
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
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="soft" size="toolbar" className="group min-w-[112px] justify-between">
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-sky-600" />
                Bộ lọc
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-slate-200/90 bg-white p-0 shadow-[0_22px_55px_rgba(15,23,42,0.18)]"
          >
            <div className="border-b border-sky-100 bg-[linear-gradient(135deg,#f8fbff_0%,#edf7ff_58%,#f0fdfa_100%)] px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">Lọc danh sách</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">Danh mục vật tư</p>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-slate-600">Tổ máy</Label>
                <Select value={machineTab} onValueChange={changeMachineTab}>
                  <SelectTrigger className="h-10 w-full rounded-xl" aria-label="Lọc theo tổ máy">
                    <SelectValue>{activeMachineTab.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {MACHINE_TABS.map((tab) => (
                      <SelectItem key={tab.key} value={tab.key}>{tab.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-slate-600">Cương vị quản lý</Label>
                <Select value={positionFilter} onValueChange={setPositionFilter}>
                  <SelectTrigger className="h-10 w-full rounded-xl" aria-label="Lọc theo cương vị quản lý">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả cương vị</SelectItem>
                    {managingPositionOptions.map((position) => (
                      <SelectItem key={position} value={position}>{position}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Popover open={replacementDataOpen} onOpenChange={setReplacementDataOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="soft" size="toolbar" className="group min-w-[180px] justify-between">
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-sky-600" />
                Dữ liệu điểm thay thế
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-slate-200/90 bg-white p-0 shadow-[0_22px_55px_rgba(15,23,42,0.18)]"
          >
            <div className="border-b border-sky-100 bg-[linear-gradient(135deg,#f8fbff_0%,#edf7ff_58%,#f0fdfa_100%)] px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">Dữ liệu Excel</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">Điểm thay thế vật tư</p>
            </div>
            <div className="grid gap-2 p-3">
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setReplacementDataOpen(false);
                    setImportOpen(true);
                  }}
                  className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-left transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:shadow-sm"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-sky-600 shadow-sm">
                    <Upload className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-800">Nhập điểm thay thế</span>
                    <span className="block text-[11px] text-slate-500">Thêm hoặc đồng bộ từ file Excel</span>
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setReplacementDataOpen(false);
                  exportReplacementPointsCsv();
                }}
                className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-sm"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-600 shadow-sm">
                  <Download className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-800">Xuất điểm thay thế</span>
                  <span className="block text-[11px] text-slate-500">Theo đúng bộ lọc đang hiển thị</span>
                </span>
              </button>
            </div>
          </PopoverContent>
        </Popover>
        {canCreate && (
          <Button size="toolbar" onClick={() => { setIsNew(true); setEdit({ unit: "Cái", quantity: 0, minStock: 0, category: categoryFilter === OTHER_MATERIAL_GROUP ? "Khác" : categoryFilter, machines: ["S1", "S2", "COMMON"], replacements: [] }); }}>
            <Plus className="h-4 w-4" /> Thêm vật tư
          </Button>
        )}
      </PageHeader>

      {/* Lọc loại vật tư dạng dropdown; ô tìm kiếm cùng hàng bên phải */}
      <div className="grid grid-cols-2 gap-2 border-b border-border pb-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-between gap-2 rounded-xl border-blue-100 bg-white px-3 text-sm font-semibold text-ink shadow-sm hover:bg-blue-50 hover:text-navy sm:w-auto sm:px-4"
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <ActiveCategoryIcon className="h-4 w-4 shrink-0 text-navy" />
                <span>{activeCategoryTab.label}</span>
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
                  onClick={() => changeCategoryTab(tab.key)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="toolbar" className="w-full px-2 sm:w-auto" onClick={() => setLotBoardOpen(true)} title="Tồn hiện có tách theo số phiếu giao hàng">
          <Layers className="h-4 w-4" /> <span className="sm:hidden">Tồn theo phiếu</span><span className="hidden sm:inline">Tồn theo phiếu giao hàng</span>
        </Button>
        <div className="col-span-2 ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <SearchBar value={q} onChange={setQ} placeholder="Tìm theo mã, tên, thiết bị..." className="w-full sm:w-72" />
          {canManage && <QlvtSyncAction />}
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
              ? `Không có vật tư nào khớp bộ lọc trong loại "${displayMaterialCategory(categoryFilter)}" (${machineLabel}). Thử bỏ từ khoá / cương vị quản lý hoặc chuyển tab khác.`
              : `Chưa có vật tư nào thuộc loại "${displayMaterialCategory(categoryFilter)}" được khai báo cho thiết bị trong phạm vi Xem/Sửa của cương vị hiện tại (${machineLabel}).`
          }
          action={isFiltered ? { label: "Xoá bộ lọc", onClick: () => { setQ(""); setPositionFilter("ALL"); } } : undefined}
        />
      ) : (
        <Card className="overflow-hidden border-0 bg-transparent shadow-none md:border md:bg-card md:shadow-sm">
          <div className="grid gap-3 md:hidden">
            {pagedMaterials.map((m) => {
              const checked = selected.has(m.id);
              const expanded = expandedIds.has(m.id);
              const linkedCodes = materialErpCodes(m);
              const linkedErpStock = linkedCodes.length ? erpStockByCodes(linkedCodes) : m.minStock;
              return (
                <article
                  key={m.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition",
                    expanded ? "border-sky-300 ring-2 ring-sky-100" : "border-slate-200",
                    checked && "border-blue-300 bg-blue-50/30"
                  )}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {canManage && (
                        <Checkbox
                          aria-label={`Chọn ${m.code}`}
                          checked={checked}
                          onCheckedChange={(v) => toggleOne(m.id, v === true)}
                          className="mt-1"
                        />
                      )}
                      {m.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.imageUrl} alt={m.name} className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 object-cover" />
                      ) : (
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[linear-gradient(145deg,#e0f2fe,#eff6ff)] text-[#00558F] shadow-inner">
                          <Package className="h-5 w-5" />
                        </span>
                      )}
                      <button type="button" onClick={() => toggleExpanded(m.id)} className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-900">{m.name}</span>
                          {categoryFilter === OTHER_MATERIAL_GROUP && m.category && (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                              {displayMaterialCategory(m.category)}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="font-mono font-semibold text-[#00558F]">{m.code || "Chưa có mã ERP"}</span>
                          <span>·</span>
                          <span>{m.unit}</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(m.id)}
                        aria-expanded={expanded}
                        className={cn(
                          "grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition",
                          expanded ? "rotate-180 border-sky-300 bg-sky-50 text-[#00558F]" : "border-slate-200 bg-white text-slate-500"
                        )}
                        aria-label={expanded ? "Thu gọn chi tiết" : "Mở chi tiết"}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>

                    {m.note && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">{m.note}</p>}

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Hiện có</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <StockBadge quantity={m.quantity} minStock={m.minStock} category={m.category} />
                          <InlineNumberCell
                            value={m.quantity}
                            canEdit={canEditStock(m)}
                            ariaLabel={`Sửa Hiện Có của ${m.code}`}
                            onSave={async (v) => {
                              await upsert.mutateAsync({ id: m.id, quantity: v });
                              toast.success(`Đã cập nhật Hiện Có: ${m.code} → ${v}`);
                            }}
                          />
                        </div>
                      </div>
                      <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-sky-500">Số liệu ERP</div>
                        <div className="mt-1 text-lg font-extrabold tabular-nums text-[#00558F]">{fmtNumber(linkedErpStock)}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
                      <button type="button" onClick={() => toggleExpanded(m.id)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00558F]">
                        <Activity className="h-3.5 w-3.5" />
                        {expanded ? "Ẩn thông tin" : "Xem thông tin & điểm thay thế"}
                      </button>
                      <div className="flex items-center gap-1">
                        {canManage && (
                          <>
                            <Button variant="ghost" size="icon" title="Thêm thiết bị theo dõi" className="h-9 w-9 text-emerald-600 hover:bg-emerald-50" onClick={() => openTrackingDialog(m)}>
                              <Plus className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Tác vụ vật tư"><Pencil className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-60">
                                <DropdownMenuItem onSelect={() => setReplMaterial(m)}><Repeat /><span>Theo dõi thay thế</span></DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => openEditDetails(m)}><Repeat className="text-accent" /><span>Chi tiết điểm thay thế</span></DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => { setIsNew(false); setEdit(materialForEdit(m)); }}><Package className="text-navy" /><span>Thông tin vật tư</span></DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled={!replacementRowsForEdit(m).length} className="text-destructive focus:text-destructive" onSelect={() => openDeleteDetails(m)}><Repeat /><span>Xóa chi tiết điểm thay thế</span></DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(m)}><Trash2 /><span>Xóa vật tư</span></DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                        {!canManage && (
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-accent" title="Mở theo dõi thay thế vật tư" onClick={() => setReplMaterial(m)}>
                            <Repeat className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-sky-100 bg-[linear-gradient(180deg,#f8fbff,#ffffff)] p-3">
                      <MaterialExpandedDetails
                        m={m}
                        positionFilter={positionFilter}
                        selectedItems={materialRequestSelection}
                        onSelectedItemsChange={setMaterialRequestSelection}
                        onOpenTracking={() => setReplMaterial(m)}
                      />
                      {trackingMaterial?.id === m.id && (
                        <InlineTrackingEditor
                          material={m}
                          rows={trackingRows}
                          saving={upsert.isPending}
                          onRowsChange={setTrackingRows}
                          onCancel={() => { setTrackingMaterial(null); setTrackingRows([]); }}
                          onSave={confirmAddTrackingPoints}
                        />
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
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
                const expanded = expandedIds.has(m.id);
                const linkedCodes = materialErpCodes(m);
                const linkedErpStock = linkedCodes.length ? erpStockByCodes(linkedCodes) : m.minStock;
                return (
                  <React.Fragment key={m.id}>
                  <TableRow data-state={checked ? "selected" : undefined} className={cn("cursor-pointer hover:bg-muted/30", checked && "bg-accent/5")} onClick={() => toggleExpanded(m.id)}>
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
                          onClick={(e) => { e.stopPropagation(); toggleExpanded(m.id); }}
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
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink">{m.name}</span>
                            {categoryFilter === OTHER_MATERIAL_GROUP && m.category && (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                                {displayMaterialCategory(m.category)}
                              </span>
                            )}
                          </div>
                          {m.note && <div className="truncate text-xs text-muted-foreground">{m.note}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">{m.unit}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <StockBadge quantity={m.quantity} minStock={m.minStock} category={m.category} />
                        <InlineNumberCell
                          value={m.quantity}
                          canEdit={canEditStock(m)}
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
                        <MaterialExpandedDetails
                          m={m}
                          positionFilter={positionFilter}
                          selectedItems={materialRequestSelection}
                          onSelectedItemsChange={setMaterialRequestSelection}
                          onOpenTracking={() => setReplMaterial(m)}
                        />
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

      {/* MỘT thanh thao tác cho toàn trang — xem chú thích ở ReplacementRequestBar. */}
      <ReplacementRequestBar selection={materialRequestSelection} onChange={setMaterialRequestSelection} />

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
              machine={editingDetails.machine}
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
                              {!group.code.startsWith(STANDALONE_GROUP_PREFIX) && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold text-navy">{group.code}</span>}
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
                  <p className="mt-1.5 text-xs text-red-600">Chưa có nhóm vật tư ERP thuộc loại &quot;{erpCategoryFilter}&quot;. Vui lòng gom nhóm ERP trước.</p>
                )}
                {!erpMaterialsQuery.isLoading && erpGroupOptions.length > 0 && filteredErpGroups.length === 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">Không có nhóm vật tư nào khớp từ khoá trong loại &quot;{erpCategoryFilter}&quot;.</p>
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
                        <SelectItem key={c} value={c}>{displayMaterialCategory(c)}</SelectItem>
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

      <StockLotBoard open={lotBoardOpen} onOpenChange={setLotBoardOpen} category={categoryFilter} />

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

      <ReplacementDrawer
        material={replMaterial}
        managingPosition={positionFilter === "ALL" ? null : positionFilter}
        role={role}
        onClose={() => setReplMaterial(null)}
      />

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
  lastReplacedAt?: string; // ISO yyyy-mm-dd — điền ngày này là bật lịch theo dõi
};

type ImportResult = {
  validCount: number;
  willSchedule: number; // số dòng có "Lần thay gần nhất" → sẽ lên lịch theo dõi
  errors: { rowNumber: number; message: string }[];
  preview: Array<{
    rowNumber: number;
    materialName: string;
    deviceLabel: string;
    system: string | null;
    deviceCount: number;
    quantity: number;
    unit: string;
    intervalMonths: number;
    lastReplacedAt: string | null;
  }>;
  created: number;
  updated: number;
  scheduled: number; // số điểm đã lên lịch theo dõi
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
  "Lần thay gần nhất (dd/mm/yyyy)",
];

// Nhận diện cột theo tên tiêu đề (fold dấu) — bền với thứ tự/biến thể chữ.
function detectImportColumn(header: unknown): keyof ImportParsedRow | null {
  const h = normalizeText(String(header ?? "")).replace(/\s+/g, " ");
  if (!h) return null;
  // File XUẤT có vài cột đuôi "(tham chiếu)" chỉ để người dùng đối chiếu — không nhập lại.
  if (h.includes("tham chieu")) return null;
  if (h.includes("erp")) return "erpCode";
  if (h.includes("ten vat tu") || h === "vat tu") return "materialName";
  if (h.includes("to may")) return "machine";
  if (h.includes("cay thu muc") || h.includes("he thong")) return "system";
  if (h.includes("seq") || h.includes("ma thiet bi")) return "deviceSeq";
  if (h.includes("ten thiet bi")) return "deviceName";
  if (h.includes("cuong vi")) return "managingPosition";
  if (h.includes("so luong thiet bi")) return "deviceCount";
  // "Lần thay gần nhất" phải xét TRƯỚC "chu ky thay the" (cả hai chứa "thay").
  if (h.includes("lan thay") || h.includes("gan nhat") || h.includes("ngay thay")) return "lastReplacedAt";
  if (h.includes("can thay")) return "quantity";
  if (h.includes("chu ky thay the")) return "intervalMonths";
  if (h.includes("chu ky")) return "intervalNote";
  return null;
}

/**
 * Ô ngày trong Excel: có thể là số serial (Excel), Date, hoặc chuỗi dd/mm/yyyy —
 * chuẩn hoá về "yyyy-mm-dd" để gửi lên server. Ô trống → "".
 * Ô CÓ chữ nhưng đọc không ra ngày → trả nguyên chuỗi gốc để server báo lỗi đúng dòng,
 * thay vì lặng lẽ bỏ qua khiến người dùng tưởng đã lên lịch.
 */
function parseDateCell(value: unknown): string {
  const toIso = (d: Date) =>
    Number.isNaN(d.getTime())
      ? ""
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  if (value instanceof Date) return toIso(value);
  // Số serial Excel (gốc 1899-12-30), bỏ phần giờ.
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return toIso(new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000));
  }
  const s = String(value ?? "").trim();
  if (!s) return "";
  // dd/mm/yyyy hoặc dd-mm-yyyy (định dạng người dùng nhập tay)
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return toIso(new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  // yyyy-mm-dd
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) return toIso(new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
  return s; // không đọc được → giữ nguyên để server báo lỗi dòng
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
    ws1["!cols"] = [32, 18, 8, 26, 22, 26, 18, 12, 16, 14, 18, 18].map((wch) => ({ wch }));
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
      ["CÁCH THÊM LỊCH THEO DÕI THAY THẾ", ""],
      ["• Bấm “Xuất điểm thay thế” để lấy file có sẵn toàn bộ điểm đang khai báo.", ""],
      ["• Điền cột “Lần thay gần nhất” (dd/mm/yyyy) cho những điểm cần theo dõi.", ""],
      ["• Tải file đó lên lại — hệ thống tự tạo/cập nhật lịch theo dõi, hạn kế tiếp = ngày thay gần nhất + chu kỳ.", ""],
      ["• Để TRỐNG cột ngày = chỉ khai báo, KHÔNG lên lịch theo dõi.", ""],
      ["• Chu kỳ thay thế = 0 thì không lên lịch, dù có điền ngày.", ""],
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
      ["Lần thay gần nhất (dd/mm/yyyy)", "Ngày thay thực tế gần nhất. ĐIỀN vào là bật lịch theo dõi cho điểm này (hạn kế tiếp = ngày này + chu kỳ). Để trống = chỉ khai báo, không lên lịch."],
      ["", ""],
      ["VÍ DỤ 1 (theo hệ thống, không cần mã — chỉ khai báo)", ""],
      ["Dầu Shell Turbo T32 | (trống) | S1 | Hệ thống dầu điều khiển | (trống) | Bơm dầu chính | Trưởng ca VH | 2 | 40 | 8000h | 12 | (trống)", ""],
      ["VÍ DỤ 2 (liên kết thiết bị bằng mã cây + lên lịch theo dõi)", ""],
      ["Dầu Shell Turbo T32 | (trống) | S1 | (trống) | DH1.S1.1.1.1.1 | Quạt gió PAF A | Trưởng ca VH | 1 | 20 | 8000h | 12 | 15/03/2026", ""],
      ["VÍ DỤ 3 (vật tư tổ máy S2 — dùng mã DH1.S2…)", ""],
      ["Dầu Total Preslia 68 | (trống) | S2 | (trống) | DH1.S2.1.1.1.2.1 | Bồn dầu | Thải xỉ | 1 | 630 | 8000h | 12 | 01/07/2026", ""],
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
      // cellDates: ô ngày về đúng Date thay vì số serial → parseDateCell đọc chắc tay hơn.
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
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
          lastReplacedAt: parseDateCell(num(row, "lastReplacedAt")),
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
      toast.success(
        `Đã nhập ${res.created} điểm mới, cập nhật ${res.updated} điểm` +
          (res.scheduled > 0 ? `, lên lịch theo dõi ${res.scheduled} điểm` : "")
      );
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
                {!hasErrors && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-accent ring-1 ring-blue-200">
                    {result.willSchedule > 0
                      ? `${result.willSchedule} điểm sẽ lên lịch theo dõi (có Lần thay gần nhất)`
                      : "Chưa điền “Lần thay gần nhất” — chỉ khai báo, không lên lịch"}
                  </span>
                )}
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
                        <th className="px-3 py-2 text-center font-medium">Lần thay gần nhất</th>
                        <th className="px-3 py-2 text-center font-medium">Hạn kế tiếp</th>
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
                          <td className="px-3 py-1.5 text-center text-ink">
                            {p.lastReplacedAt ? formatDate(p.lastReplacedAt) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-center text-ink">
                            {p.lastReplacedAt
                              ? formatDate(addMonths(new Date(p.lastReplacedAt), p.intervalMonths))
                              : <span className="text-muted-foreground">chưa lên lịch</span>}
                          </td>
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
      <ReplacementPointsEditor value={rows} unit={material.unit} machine={material.machine} onChange={onRowsChange} />
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
        title={canEdit ? "Nhấn để sửa" : undefined}
        onClick={(e) => {
          if (!canEdit) return;
          // Chặn lại để cú bấm không rơi xuống hàng (hàng đang bắt click để bung chi tiết).
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
/**
 * NGƯỠNG "SẮP HẾT" CỦA DẦU BÔI TRƠN là MỘT CON SỐ CỐ ĐẮNH: từ 10 lít trở xuống.
 *
 * Các loại còn lại vẫn so với ngưỡng tối thiểu của từng vật tư (lấy theo số liệu ERP). Với
 * dầu thì cách đó sai thực tế: kho ERP có 927 lít thì 103 lít trong phân xưởng bị báo "sắp hết"
 * trong khi từấy vẫn dùng thoải mái — báo đỏ tràn lan thì không ai còn để ý cảnh báo thật.
 */
const OIL_LOW_STOCK_LITRES = 10;

/**
 * BẢNG THEO DÕI TỒN THEO SỐ PHIẾU GIAO HÀNG.
 *
 * Cột "Hiện có" chỉ cho một con số tổng; bảng này trả lời câu hỏi thực sự cần: 32 lít đó là của
 * phiếu giao hàng nào, còn bao nhiêu ở từng phiếu — để biết lô cũ còn phải dùng hết bao nhiêu.
 */
function StockLotBoard({ open, onOpenChange, category }: { open: boolean; onOpenChange: (v: boolean) => void; category: string }) {
  const { data, isLoading } = useMaterialStockLots(category, open);
  const rows = data?.data ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tồn hiện có theo số phiếu giao hàng</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-xs text-muted-foreground">
          {displayMaterialCategory(category)} · dùng đến đâu trừ lô cũ trước, nên lô đứng đầu là lô sẽ được dùng tiếp.
        </p>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Đang tải…</p>
        ) : !rows.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chưa có vật tư nào còn tồn ở loại này.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.code} className="rounded-lg border border-border">
                <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-ink" title={`${row.code} · ${row.name}`}>{row.name}</span>
                  <span className="shrink-0 text-sm font-semibold text-ink">{row.total} {row.unit}</span>
                </div>
                {row.lots.length ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-1.5 text-left font-medium">Số phiếu giao hàng</th>
                        <th className="px-3 py-1.5 text-left font-medium">Mã vật tư</th>
                        <th className="px-3 py-1.5 text-center font-medium">Ngày lãnh</th>
                        <th className="px-3 py-1.5 text-center font-medium">Lãnh về</th>
                        <th className="px-3 py-1.5 text-center font-medium">Còn lại</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.lots.map((lot, index) => (
                        <tr key={lot.id} className="border-t border-border/70">
                          <td className="px-3 py-1.5 font-medium text-ink">
                            {lot.label}
                            {index === 0 && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">dùng tiếp</span>}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{lot.erpCode || "—"}</td>
                          <td className="px-3 py-1.5 text-center text-xs text-muted-foreground">{lot.receivedAt ? formatDate(lot.receivedAt) : "—"}</td>
                          <td className="px-3 py-1.5 text-center tabular-nums text-muted-foreground">{lot.quantityIn}</td>
                          <td className="px-3 py-1.5 text-center font-semibold tabular-nums text-ink">{lot.quantityLeft}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Còn {row.quantity} {row.unit} nhưng chưa gắn lô nào — sẽ được ghi nhận khi lãnh về lần tới.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StockBadge({ quantity, minStock, category }: { quantity: number; minStock: number; category?: string | null }) {
  if (quantity <= 0) {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">Hết hàng</span>;
  }
  const low = materialCategoryMatches(category, "Dầu bôi trơn")
    ? quantity <= OIL_LOW_STOCK_LITRES
    : minStock > 0 && quantity <= minStock;
  if (low) {
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
function MaterialExpandedDetails({
  m,
  positionFilter = "ALL",
  selectedItems,
  onSelectedItemsChange,
  onOpenTracking,
}: {
  m: MaterialWithDevices;
  positionFilter?: string;
  selectedItems: MaterialRequestSelection[];
  onSelectedItemsChange: React.Dispatch<React.SetStateAction<MaterialRequestSelection[]>>;
  onOpenTracking?: () => void;
}) {
  const points = React.useMemo(
    () =>
      (m.replacements ?? [])
        .filter(
          (r) =>
            !r.isActive &&
            (r._count?.logs ?? 0) === 0 &&
            (positionFilter === "ALL" || positionsMatch(r.managingPosition, positionFilter))
        )
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
    [m.replacements, positionFilter]
  );
  const activeCountByDeclaration = React.useMemo(() => {
    const allPoints = m.replacements ?? [];
    return new Map(
      points.map((declaration) => {
        const count = allPoints.filter((candidate) => {
          if (!candidate.isActive) return false;
          if (declaration.deviceSeq) {
            return candidate.deviceSeq === declaration.deviceSeq;
          }
          return (
            !candidate.deviceSeq &&
            (candidate.system?.trim() || null) === (declaration.system?.trim() || null) &&
            (candidate.location?.trim() || null) === (declaration.location?.trim() || null)
          );
        }).length;
        return [declaration.id, count] as const;
      })
    );
  }, [m.replacements, points]);
  const activePointByDeclaration = React.useMemo(() => {
    const allPoints = m.replacements ?? [];
    return new Map(
      points.flatMap((declaration) => {
        const activePoint = allPoints.find((candidate) => {
          if (!candidate.isActive) return false;
          if (declaration.deviceSeq) return candidate.deviceSeq === declaration.deviceSeq;
          return (
            !candidate.deviceSeq &&
            (candidate.system?.trim() || null) === (declaration.system?.trim() || null) &&
            (candidate.location?.trim() || null) === (declaration.location?.trim() || null)
          );
        });
        return activePoint ? [[declaration.id, activePoint] as const] : [];
      })
    );
  }, [m.replacements, points]);
  /**
   * Trạng thái đến hạn XẤU NHẤT trong các điểm theo dõi của một dòng khai báo.
   *
   * Một dòng khai báo có thể mở nhiều điểm (mỗi thiết bị con một điểm). Lấy theo điểm
   * đầu tiên tìm thấy thì một điểm quá hạn nằm lẫn giữa mấy điểm còn hạn sẽ hiện màu
   * xanh — đúng thứ nút màu này sinh ra để cảnh báo. Quá hạn thắng, rồi tới sắp hạn.
   */
  const trackingDueByDeclaration = React.useMemo(() => {
    const allPoints = m.replacements ?? [];
    const rank: Record<ReplDueKey, number> = { OVERDUE: 0, DUE_SOON: 1, OK: 2 };
    return new Map(
      points.flatMap((declaration) => {
        const matched = allPoints.filter((candidate) => {
          if (!candidate.isActive) return false;
          if (declaration.deviceSeq) return candidate.deviceSeq === declaration.deviceSeq;
          return (
            !candidate.deviceSeq &&
            (candidate.system?.trim() || null) === (declaration.system?.trim() || null) &&
            (candidate.location?.trim() || null) === (declaration.location?.trim() || null)
          );
        });
        if (!matched.length) return [];
        const worst = matched
          .map((point) => replacementDueStatus(point.nextDueAt))
          .reduce((a, b) => (rank[a] <= rank[b] ? a : b));
        // Điểm chỉ lấy mẫu dùng tông xanh dương riêng — xem SAMPLING_DUE ở lib/constants.ts.
        return [[declaration.id, { key: worst, samplingOnly: matched.every((point) => point.samplingOnly) }] as const];
      })
    );
  }, [m.replacements, points]);
  const createPoint = useCreateReplacement();

  type PanelPoint = NonNullable<MaterialWithDevices["replacements"]>[number];

  // ── Ra số yêu cầu thay thế ────────────────────────────────────────────────
  // Chọn nhiều điểm → MỘT phiếu. Ràng buộc: cùng tổ máy + cùng cương vị quản lý
  // (server kiểm lại), vì một phiếu chỉ mang được một cặp giá trị này lên Sheet.
  const selectablePoints = React.useMemo(() => points.filter((p) => !!p.deviceSeq), [points]);
  const selectedIds = React.useMemo(() => selectedItems.map((item) => item.point.id), [selectedItems]);
  const anchor = selectedItems[0]?.point ?? null;
  const canSelect = React.useCallback(
    (p: PanelPoint) => {
      if (!p.deviceSeq) return false;
      if (!anchor || anchor.id === p.id || selectedIds.includes(p.id)) return true;
      return (
        (p.machine ?? "COMMON") === (anchor.machine ?? "COMMON")
        && normalizeText(p.managingPosition ?? "") === normalizeText(anchor.managingPosition ?? "")
      );
    },
    [anchor, selectedIds]
  );
  const toggleSelected = (point: PanelPoint) =>
    onSelectedItemsChange((current) =>
      current.some((item) => item.point.id === point.id)
        ? current.filter((item) => item.point.id !== point.id)
        : [...current, { material: m, point }]
    );

  const [tracking, setTracking] = React.useState<PanelPoint | null>(null);
  const [trackDate, setTrackDate] = React.useState("");
  const [trackMonths, setTrackMonths] = React.useState(12);
  const [trackNote, setTrackNote] = React.useState("");
  const [trackSamplingOnly, setTrackSamplingOnly] = React.useState(false);

  function openTracking(p: PanelPoint) {
    setTrackDate(formatDateInput(new Date()));
    setTrackMonths(p.intervalMonths);
    setTrackNote("");
    setTrackSamplingOnly(false);
    setTracking(p);
  }

  async function confirmTracking() {
    if (!tracking) return;
    try {
      const months = Math.max(0, Math.round(trackMonths));
      if (months === 0) {
        return toast.error(
          trackSamplingOnly
            ? "Điểm lấy mẫu định kỳ vẫn cần chu kỳ (tháng) để nhắc tới kỳ"
            : "Chu kỳ 0 không theo dõi lịch thay thế"
        );
      }
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
        note: trackNote.trim() || null,
        samplingOnly: trackSamplingOnly,
      });
      toast.success(trackSamplingOnly ? "Đã thêm điểm lấy mẫu định kỳ" : "Đã thêm điểm theo dõi");
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chi tiết điểm thay thế ({points.length})
          </span>
          {/* Thao tác trên tập đã chọn nằm ở THANH DUY NHẤT cuối trang (ReplacementRequestBar).
              Tập chọn là toàn trang chứ không theo từng vật tư, nên đặt nút trong panel của mỗi
              vật tư sẽ lặp lại đúng một nút với đúng một con số ở mọi panel đang bung — người
              dùng tưởng mỗi nút ra SYC cho riêng nhóm đó. */}
          {selectedIds.length > 0 ? (
            <span className="text-xs font-medium text-muted-foreground">
              Đã chọn {selectedIds.length} điểm · {new Set(selectedItems.map((item) => item.material.id)).size} vật tư
            </span>
          ) : (
            selectablePoints.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                Tick chọn nhiều thiết bị của nhiều vật tư — cùng tổ máy &amp; cương vị sẽ gộp vào một SYC.
              </span>
            )
          )}
        </div>
        <div className="overflow-x-auto lg:overflow-x-hidden">
        <table className="w-full min-w-[960px] table-fixed text-[13px] lg:min-w-0">
          <colgroup>
            <col className="w-[3%]" />
            <col className="w-[20%]" />
            <col className="w-[19%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[7%]" />
            <col className="w-[8%]" />
            <col className="w-[13%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-2 py-2" aria-label="Chọn điểm ra số yêu cầu" />
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Hệ thống / thiết bị</th>
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Thiết bị</th>
              <th className="px-2 py-2 text-left text-xs font-semibold whitespace-nowrap">Cương vị</th>
              <th className="px-2 py-2 text-center text-xs font-semibold whitespace-nowrap">Chu kỳ O&M</th>
              <th className="px-2 py-2 text-center text-xs font-semibold whitespace-nowrap">Chu kỳ thay</th>
              <th className="px-2 py-2 text-center text-xs font-semibold whitespace-nowrap">Số lượng</th>
              <th className="px-2 py-2 text-center text-xs font-semibold whitespace-nowrap">Số yêu cầu</th>
              <th className="px-2 py-2 text-center text-xs font-semibold whitespace-nowrap">Theo dõi</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => {
              const activeCount = activeCountByDeclaration.get(p.id) ?? 0;
              const activePoint = activePointByDeclaration.get(p.id);
              const deviceLimit = Math.max(1, p.deviceCount ?? 1);
              const capacityReached = activeCount >= deviceLimit;
              const trackingLabel =
                p.intervalMonths === 0
                  ? "Không theo dõi"
                  : capacityReached
                    ? deviceLimit === 1
                      ? "Đang theo dõi"
                      : `Đã đủ ${activeCount}/${deviceLimit}`
                    : deviceLimit > 1
                      ? `Thêm điểm (${activeCount}/${deviceLimit})`
                      : "Thêm điểm";
              const tracking = trackingDueByDeclaration.get(p.id);
              /**
               * Nền nút "Đang theo dõi" mang luôn trạng thái đến hạn, cùng bảng màu với
               * tab Trạng thái theo dõi: đỏ quá hạn · vàng sắp hạn · xanh lá còn hạn.
               * Nút "Thêm điểm" giữ xanh dương vì nó là hành động, chưa có hạn nào để báo.
               */
              const TRACKING_TONE: Record<ReplDueKey, string> = {
                OVERDUE: "bg-red-600 hover:bg-red-700 focus-visible:ring-red-600",
                DUE_SOON: "bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500",
                OK: "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-600",
              };
              // Điểm chỉ lấy mẫu dùng CHUNG ba màu này, không tách tông riêng: cùng là
              // việc tới hạn phải làm, nhìn một bảng màu duy nhất đỡ phải học hai lần.
              const trackingTone = tracking
                ? TRACKING_TONE[tracking.key]
                : "bg-accent hover:bg-accent/90 focus-visible:ring-accent";
              const TRACKING_STATUS_TEXT: Record<ReplDueKey, string> = {
                OVERDUE: "đang QUÁ HẠN",
                DUE_SOON: "SẮP ĐẾN HẠN",
                OK: "còn hạn",
              };
              const trackingTitle =
                p.intervalMonths === 0
                  ? "Chu kỳ 0 không theo dõi lịch thay thế"
                  : capacityReached
                    ? tracking
                      ? `Điểm này ${tracking.samplingOnly ? "kỳ lấy mẫu: " : ""}${TRACKING_STATUS_TEXT[tracking.key]} — bấm để xem chi tiết`
                      : "Xem điểm này đang quá hạn, sắp đến hạn hay còn hạn"
                    : "Thêm điểm theo dõi thời gian thay thế cho thiết bị này";
              const selectable = canSelect(p);
              const checked = selectedIds.includes(p.id);
              return (
                <tr key={p.id} className={cn("border-b border-border/50 last:border-0 hover:bg-muted/20", checked && "bg-accent/5")}>
                  <td className="px-2 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!selectable}
                      onChange={() => toggleSelected(p)}
                      className="h-4 w-4 cursor-pointer accent-[#00558F] disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label={`Chọn điểm ${p.device?.name || p.location || ""} để ra số yêu cầu`}
                      title={
                        !p.deviceSeq
                          ? "Điểm chưa gắn hệ thống/thiết bị nên không ra được số yêu cầu"
                          : !selectable
                            ? "Chỉ gộp được các điểm cùng tổ máy và cùng cương vị quản lý"
                            : "Chọn điểm này để ra số yêu cầu thay thế"
                      }
                    />
                  </td>
                  {/* Hệ thống của thiết bị (tên node cha trong cây) — fallback: system đã lưu, rồi tên thiết bị. */}
                  <td className="px-3 py-2.5 font-medium uppercase text-ink">
                    <span className="block break-words leading-5" title={p.device?.system || p.system || p.device?.name || undefined}>
                      {p.device?.system || p.system || p.device?.name || "—"}
                    </span>
                  </td>
                  {/* Tên thiết bị SỐNG theo cây (đổi tên node là cập nhật) — location chỉ là snapshot lúc khai báo. */}
                  <td className="px-2 py-2.5 text-ink">
                    <span className="block break-words leading-5" title={p.device?.name || p.location || undefined}>
                      {p.device?.name || p.location || "—"}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-ink">
                    <span className="block break-words leading-5" title={p.managingPosition || undefined}>{p.managingPosition || "—"}</span>
                  </td>
                  {/* Ghi chú O&M quá dài thì cắt bớt kèm tooltip, tránh 1 ô kéo vỡ cả bảng. */}
                  <td className="px-2 py-2.5 text-center text-ink whitespace-nowrap">
                    <span className="mx-auto block max-w-[280px] truncate" title={p.intervalNote || undefined}>{p.intervalNote || "—"}</span>
                  </td>
                  <td className="px-2 py-2.5 text-center text-ink whitespace-nowrap">{p.intervalMonths === 0 ? "Không theo dõi lịch" : `${p.intervalMonths} tháng`}</td>
                  <td className="px-2 py-2.5 text-center font-semibold text-ink whitespace-nowrap">{p.quantity * (p.deviceCount || 1)} {m.unit}</td>
                  {/* Tra cứu ngược: các SYC thay thế đã ra cho chính điểm này. */}
                  <td className="px-2 py-2.5 text-center whitespace-nowrap">
                    <ReplacementRequestChips requests={p.defectRequests} />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {capacityReached && activePoint ? (
                      <Link
                        href={`/replacements?tab=status&pointId=${encodeURIComponent(activePoint.id)}`}
                        title={trackingTitle}
                        aria-label={`Xem trạng thái theo dõi của ${p.device?.name || p.location || p.system || m.name}`}
                        className={cn(
                          "inline-flex max-w-full items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                          trackingTone
                        )}
                      >
                        <Activity className="h-3.5 w-3.5" /> {trackingLabel}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled={createPoint.isPending || p.intervalMonths === 0}
                        onClick={() => openTracking(p)}
                        title={trackingTitle}
                        className="inline-flex max-w-full items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-accent px-2 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" /> {trackingLabel}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Panel nhập khiếm khuyết trượt từ phải — dùng chung DefectForm với màn Khiếm khuyết,
          chỉ khác ở chỗ được mồi sẵn bằng các điểm thay thế đã chọn. */}

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
              {/* Hai ô đi liền một cặp khi khai báo nên xếp cùng hàng cho dễ đối chiếu. */}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Lần thay gần nhất">
                  <Input type="date" value={trackDate} onChange={(e) => setTrackDate(e.target.value)} />
                </Field>
                <Field label="Chu kỳ thay thế (tháng)">
                  <Input type="number" min={0} value={trackMonths} onChange={(e) => setTrackMonths(Number(e.target.value))} />
                </Field>
              </div>
              {/* Nhóm vật tư theo O&M chỉ lấy mẫu/châm bổ sung, không thay định kỳ. */}
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={trackSamplingOnly}
                  onChange={(e) => setTrackSamplingOnly(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#00558F]"
                />
                <span className="text-sm leading-5">
                  <span className="font-semibold text-ink">Vật tư lấy mẫu định kỳ</span>
                  <span className="block text-xs text-muted-foreground">
                    Theo O&amp;M chỉ lấy mẫu, theo dõi hoặc châm bổ sung — không thay thế định kỳ.
                    Vẫn nhắc theo chu kỳ nhưng hiển thị riêng và không tính vào cảnh báo quá hạn thay thế.
                  </span>
                </span>
              </label>

              <Field label="Ghi chú">
                <Textarea
                  rows={3}
                  value={trackNote}
                  onChange={(e) => setTrackNote(e.target.value)}
                  placeholder="Tuỳ chọn — ghi chú cho điểm theo dõi này"
                />
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

type PanelReplacementPoint = NonNullable<MaterialWithDevices["replacements"]>[number];
/**
 * Thanh thao tác DUY NHẤT cho tập điểm đang chọn ở Danh mục vật tư.
 *
 * Trước đây nút "Ra SYC thay thế" nằm trong panel bung của TỪNG vật tư, trong khi tập chọn là
 * toàn trang — bung ba vật tư là hiện ba nút giống hệt nhau, cùng đếm "Đã chọn 2 điểm", làm
 * người dùng tưởng mỗi nút chỉ ra SYC cho nhóm của nó. Gom về một thanh nổi ở đáy màn hình:
 * một tập chọn, một nút, một phạm vi.
 *
 * Cửa này CỐ Ý được giữ song song với nút "Ra SYC sửa chữa" trên phiếu vật tư: chỉ ở đây mới
 * gộp được nhiều điểm thuộc NHIỀU phiếu khác nhau vào một SYC (vd 6 bồn dầu LP/HP do ba phiếu
 * cấp). Cả hai cửa đều đi qua cổng vật tư và đều được neo ngược về phiếu — xem chú thích
 * "Neo SYC vừa ra vào các phiếu vật tư" trong app/api/defects/route.ts.
 */
function ReplacementRequestBar({
  selection,
  onChange,
}: {
  selection: MaterialRequestSelection[];
  onChange: React.Dispatch<React.SetStateAction<MaterialRequestSelection[]>>;
}) {
  const [open, setOpen] = React.useState(false);
  if (selection.length === 0) return null;
  const materialCount = new Set(selection.map((item) => item.material.id)).size;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white px-4 py-2.5 shadow-lg">
          <span className="text-sm font-medium text-ink">
            Đã chọn <b>{selection.length}</b> điểm · {materialCount} vật tư
          </span>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => onChange([])}>
            Bỏ chọn
          </Button>
          <Button type="button" size="sm" className="h-8 px-3 text-xs" onClick={() => setOpen(true)}>
            <FileText className="h-3.5 w-3.5" /> Ra SYC thay thế
          </Button>
        </div>
      </div>

    {open && selection.length > 0 && (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-ink/45 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
        <div className="absolute inset-y-0 right-0 flex min-h-0 w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl animate-in slide-in-from-right">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-emerald-50/80 to-white p-4">
            <div>
              <h2 className="text-lg font-bold text-ink">Ra số yêu cầu thay thế vật tư</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selection.length} điểm · {new Set(selection.map((item) => item.material.id)).size} vật tư
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-white hover:text-ink"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <DefectForm
            lockDevice
            initialDevice={{
              code: selection[0].point.deviceSeq ?? "",
              name: selection[0].point.device?.name || selection[0].point.location || "",
              // Điểm ở cấp thư mục thì chính nó là "hệ thống chính" của phiếu.
              system: selection[0].point.deviceIsFolder
                ? selection[0].point.device?.name ?? null
                : selection[0].point.device?.system ?? selection[0].point.system ?? null,
              systemSeq: selection[0].point.deviceSeq ?? null,
              managingPosition: selection[0].point.managingPosition ?? null,
              unit: selection[0].point.machine ?? selection[0].material.machine ?? null,
            }}
            initialMaterialRequest={{
              replacementIds: selection.map((item) => item.point.id),
              materialName: selection[0].material.name,
              materialUnit: selection[0].material.unit,
              materialCategory: selection[0].material.category ?? null,
              primaryIsFolder: !!selection[0].point.deviceIsFolder,
              primarySystemName: selection[0].point.deviceIsFolder
                ? selection[0].point.device?.name ?? ""
                : selection[0].point.device?.system ?? selection[0].point.system ?? "",
              primaryDeviceName: selection[0].point.device?.name || selection[0].point.location || "",
              points: selection.map(({ material, point }) => ({
                id: point.id,
                label: [point.device?.system || point.system, point.device?.name || point.location]
                  .filter(Boolean)
                  .filter((part, index, all) => all.indexOf(part) === index)
                  .join(" · "),
                quantity: point.quantity * (point.deviceCount || 1),
                materialName: material.name,
                materialUnit: material.unit,
              })),
              suggestedContent: buildReplacementRequestContent(selection),
            }}
            onDone={() => {
              setOpen(false);
              onChange([]);
            }}
            onCancel={() => setOpen(false)}
          />
        </div>
      </div>
    )}
    </>
  );
}

type MaterialRequestSelection = {
  material: MaterialWithDevices;
  point: PanelReplacementPoint;
};

/**
 * Nội dung gợi ý cho SYC thay thế — bản client, chỉ để người dùng thấy và sửa trước
 * khi lưu. Server dựng lại chuỗi tương đương khi ô nội dung bị bỏ trống.
 */
function buildReplacementRequestContent(items: MaterialRequestSelection[]) {
  if (items.length === 0) return "";
  const labelOf = (p: PanelReplacementPoint) =>
    [p.device?.system || p.system, p.device?.name || p.location]
      .filter(Boolean)
      .filter((part, index, all) => all.indexOf(part) === index)
      .join(" · ") || "Chưa xác định vị trí";
  const totalOf = (p: PanelReplacementPoint) => p.quantity * (p.deviceCount || 1);

  if (items.length === 1) {
    const { material, point: p } = items[0];
    const detail = [
      p.intervalMonths > 0 ? `chu kỳ ${p.intervalMonths} tháng` : null,
      p.intervalNote ? `O&M ${p.intervalNote}` : null,
      p.lastReplacedAt ? `lần thay gần nhất ${formatDate(p.lastReplacedAt)}` : null,
    ].filter(Boolean).join(", ");
    return `Thay thế ${material.name} — ${totalOf(p).toLocaleString("vi-VN")} ${material.unit} tại ${labelOf(p)}${detail ? ` (${detail})` : ""}.`;
  }
  const groups = new Map<string, MaterialRequestSelection[]>();
  for (const item of items) groups.set(item.material.id, [...(groups.get(item.material.id) ?? []), item]);
  const lines = groups.size === 1
    ? []
    : [`Thay thế ${groups.size} loại vật tư tại ${items.length} vị trí:`];
  for (const group of groups.values()) {
    const material = group[0].material;
    const total = group.reduce((sum, item) => sum + totalOf(item.point), 0);
    lines.push(`${groups.size === 1 ? "" : "- "}Thay thế ${material.name} cho ${group.length} vị trí — tổng ${total.toLocaleString("vi-VN")} ${material.unit}:`);
    lines.push(...group.map(({ point }) => `${groups.size === 1 ? "-" : "  +"} ${labelOf(point)}: ${totalOf(point).toLocaleString("vi-VN")} ${material.unit}`));
  }
  return lines.join("\n");
}

/** Các SYC thay thế đã ra cho một điểm — bấm để mở thẳng phiếu bên màn Khiếm khuyết. */
function ReplacementRequestChips({ requests }: { requests?: PanelReplacementPoint["defectRequests"] }) {
  const items = (requests ?? []).filter((item) => !item.defect.cancelledAt);
  if (items.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {items.map((item) => {
        const done = item.defect.status === "DA_XU_LY";
        return (
          <Link
            key={item.id}
            href={`/defects?q=${encodeURIComponent(item.defect.requestNumber ?? "")}`}
            title={`${DEFECT_STATUS[item.defect.status as keyof typeof DEFECT_STATUS]?.label ?? item.defect.status}${item.defect.requestType ? ` · ${item.defect.requestType}` : ""}`}
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 transition-colors",
              done
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
                : "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100"
            )}
          >
            {item.defect.requestNumber ?? "—"}
          </Link>
        );
      })}
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
