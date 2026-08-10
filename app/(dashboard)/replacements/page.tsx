"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Repeat, Eye, Pencil, Trash2, Cpu, History, CalendarCheck, Activity, ChevronDown, ListFilter, RotateCcw, Upload, FileClock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ExportButton } from "@/components/shared/export-button";
import { SearchBar } from "@/components/shared/search-bar";
import { AnnualBackupExport } from "@/components/shared/annual-backup-export";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { RbacProtectedRoute } from "@/components/shared/rbac-protected-route";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReplacementBadge, SamplingOnlyChip } from "@/components/materials/replacement-badge";
import { ReplacementCalendar, dayKey } from "@/components/materials/replacement-calendar";
import {
  ReplacementStatusDashboard,
  type ReplacementStatusPoint,
} from "@/components/materials/replacement-status-dashboard";
import { ReplacementScheduleImportDialog } from "@/components/materials/replacement-schedule-import-dialog";
import { ReplacementPointForm } from "@/components/materials/replacement-point-form";
import { ReplacementPointDetailsDialog } from "@/components/materials/replacement-point-details-dialog";
import { ReplacementHistoryDetails } from "@/components/materials/replacement-history-details";
import { PendingHistoryEditDialog } from "@/components/repair/pending-history-edit-dialog";
import { LockChip } from "@/components/shared/lock-chip";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useReplacements,
  useReplacementHistory,
  useDeleteReplacement,
  useDeleteReplacementLog,
  useUpdateReplacementLog,
  type ReplacementItem,
  type ReplacementDevice,
  type ReplacementLogItem,
} from "@/hooks/useReplacements";
import {
  REPL_DUE,
  REPL_DUE_ORDER,
  addMonths,
  materialMachineTone,
  replacementDueStatus,
  replacementIntervalLabel,
} from "@/lib/constants";
import { formatDate, formatDateInput, cn, initials } from "@/lib/utils";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { positionLabelOf, positionsMatch } from "@/lib/position-catalog";

type TabKey = "schedule" | "status" | "history";

// Bộ lọc tổ máy: theo tab Danh mục vật tư mà vật tư thuộc về (Material.machine).
const MACHINE_FILTERS = [
  { key: "ALL", label: "Tất cả tổ máy" },
  { key: "S1", label: "Tổ máy S1" },
  { key: "S2", label: "Tổ máy S2" },
  { key: "COMMON", label: "COMMON" },
] as const;

// Bộ lọc loại vật tư (theo tab phân loại trong Danh mục vật tư).
const CATEGORY_FILTERS = ["Dầu bôi trơn", "Lõi lọc dầu", "Hóa Chất"] as const;

// Mốc thời gian xuất danh sách vật tư cần thay thế (tính từ hôm nay).
const EXPORT_HORIZONS = [
  { months: 1, label: "1 tháng" },
  { months: 2, label: "2 tháng" },
  { months: 3, label: "3 tháng" },
  { months: 6, label: "6 tháng" },
  { months: 12, label: "1 năm" },
] as const;

function demoDate(offsetDays: number) {
  const value = new Date();
  value.setHours(8, 0, 0, 0);
  value.setDate(value.getDate() + offsetDays);
  return value.toISOString();
}

/** Dữ liệu trình diễn chỉ dùng ở localhost, không ghi vào PostgreSQL. */
function buildLocalStatusDemo(): ReplacementStatusPoint[] {
  return [
    {
      id: "demo-overdue-aph",
      materialName: "Dầu Total Preslia 46",
      materialCode: "1.31.53.020.VIE.00.000",
      unit: "Lít",
      machine: "S1",
      category: "Dầu bôi trơn",
      deviceCode: "DH1.S1.1.1.5.2.1",
      deviceName: "Bồn dầu IDF A",
      system: "Hệ thống khói gió",
      managingPosition: "Lò phó",
      nextDueAt: demoDate(-19),
      lastReplacedAt: demoDate(-384),
      intervalMonths: 12,
      intervalNote: null,
      quantity: 18,
      deviceCount: 1,
      isDemo: true,
    },
    {
      id: "demo-overdue-mill",
      materialName: "Dầu Shell Omala S2 GX220",
      materialCode: "1.31.73.125.HKG.00.000",
      unit: "Lít",
      machine: "S1",
      category: "Dầu bôi trơn",
      deviceCode: "DH1.S1.1.12.1.2.1.11",
      deviceName: "Động cơ phụ máy nghiền",
      system: "Hệ thống nghiền than",
      managingPosition: "Máy nghiền",
      nextDueAt: demoDate(-4),
      lastReplacedAt: demoDate(-430),
      intervalMonths: 14,
      intervalNote: "Kiểm tra rung trước khi thay",
      quantity: 12,
      deviceCount: 1,
      isDemo: true,
    },
    {
      id: "demo-soon-pump",
      materialName: "Dầu EA Ultra Plus 301193",
      materialCode: "1.31.03.119.IND.00.000",
      unit: "Lít",
      machine: "S1",
      category: "Dầu bôi trơn",
      deviceCode: "DH1.S1.2.3.4.1.6",
      deviceName: "Bơm dầu bôi trơn HP-LP",
      system: "Trạm dầu bôi trơn HP-LP",
      managingPosition: "Máy nghiền",
      nextDueAt: demoDate(8),
      lastReplacedAt: demoDate(-357),
      intervalMonths: 12,
      intervalNote: null,
      quantity: 10,
      deviceCount: 1,
      isDemo: true,
    },
    {
      id: "demo-soon-fgd",
      materialName: "Dầu Shell Tellus S2 MX46",
      materialCode: "1.31.73.061.VIE.00.000",
      unit: "Lít",
      machine: "S1",
      category: "Dầu bôi trơn",
      deviceCode: "DH1.S1.3.2.2.8",
      deviceName: "Bơm tuần hoàn FGD",
      system: "Hệ thống khử SOx - FGD",
      managingPosition: "FGD",
      nextDueAt: demoDate(24),
      lastReplacedAt: demoDate(-341),
      intervalMonths: 12,
      intervalNote: null,
      quantity: 25,
      deviceCount: 2,
      isDemo: true,
    },
    {
      id: "demo-ok-fan",
      materialName: "Dầu Sinopec L-CKD 320",
      materialCode: "1.11.11.004.SIN.00.000",
      unit: "Lít",
      machine: "S1",
      category: "Dầu bôi trơn",
      deviceCode: "DH1.S1.1.1.2.4",
      deviceName: "Hộp giảm tốc quạt PAF B",
      system: "Hệ thống khói gió",
      managingPosition: "Lò phó",
      nextDueAt: demoDate(76),
      lastReplacedAt: demoDate(-289),
      intervalMonths: 12,
      intervalNote: null,
      quantity: 16,
      deviceCount: 1,
      isDemo: true,
    },
    {
      id: "demo-ok-esp",
      materialName: "Dầu Total Carter EP 460",
      materialCode: "1.31.73.047.SIN.00.000",
      unit: "Lít",
      machine: "S1",
      category: "Dầu bôi trơn",
      deviceCode: "DH1.S1.1.13.4.2",
      deviceName: "Hộp giảm tốc búa gõ ESP",
      system: "Hệ thống ESP",
      managingPosition: "ESP",
      nextDueAt: demoDate(148),
      lastReplacedAt: demoDate(-217),
      intervalMonths: 12,
      intervalNote: "Theo dõi màu dầu",
      quantity: 8,
      deviceCount: 2,
      isDemo: true,
    },
  ];
}

/** "YYYY-MM" của một mốc thời gian, dùng để lọc theo tháng/năm. */
function ym(d: Date | string): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}
function ymLabel(m: string): string {
  const [y, mo] = m.split("-");
  return `${mo}/${y}`;
}

function replacementCategoryMatches(category: string | null | undefined, filter: string): boolean {
  return (
    filter === "ALL" ||
    category === filter ||
    (filter === "Hóa Chất" && (category === "Vật tư tiêu hao" || category === "Hóa chất"))
  );
}

export default function ReplacementsPage() {
  return (
    <RbacProtectedRoute permissionId="replacement-manage" featureLabel="Lịch thay thế vật tư">
      <ReplacementsPageContent />
    </RbacProtectedRoute>
  );
}

/**
 * `only` = khoá cứng vào một tab và ẩn thanh tab. Trang "Lịch sử thay thế" ở sidebar
 * dùng lại đúng thành phần này với only="history" — mọi bộ lọc (tổ máy, cương vị, loại
 * vật tư, khoảng tháng, tìm kiếm) và nút xuất backup đều dùng chung, không nhân bản mã.
 */
export function ReplacementsPageContent({ only }: { only?: TabKey } = {}) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const rbac = useRbacAccess();
  const canCreate = rbac.can("replacement-manage", ["personal", "manage", "full"]);
  const canManage = rbac.can("replacement-manage", ["manage", "full"]);
  const canDelete = rbac.can("replacement-manage", ["manage", "full"]);
  const [tabState, setTab] = React.useState<TabKey>(only ?? "schedule");
  const tab: TabKey = only ?? tabState;
  // Bộ lọc tháng/năm dùng chung cho cả 2 tab (mặc định tháng hiện tại).
  const [month, setMonth] = React.useState(() => ym(new Date()));
  // Một thanh tìm kiếm dùng chung cho Lịch thay thế và Lịch sử thay thế.
  const [searchQ, setSearchQ] = React.useState("");
  const [debouncedSearchQ, setDebouncedSearchQ] = React.useState("");

  /* ---- Tab 1: Lịch thay thế (schedule) ---- */
  const [due, setDue] = React.useState("ALL");
  // Mặc định vào thẳng nhóm dùng nhiều nhất: Tổ máy S1 · Dầu bôi trơn.
  const [machineFilter, setMachineFilter] = React.useState("S1");
  const [positionFilter, setPositionFilter] = React.useState("ALL");
  const [categoryFilter, setCategoryFilter] = React.useState<string>(CATEGORY_FILTERS[0]);
  // Ngày đang chọn trên lịch ("YYYY-MM-DD") — lọc panel danh sách bên phải.
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQ(searchQ), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const { data, isLoading } = useReplacements({ q: debouncedSearchQ });
  const history = useReplacementHistory();
  const logs = React.useMemo(() => history.data?.data ?? [], [history.data?.data]);
  const del = useDeleteReplacement();
  const delLog = useDeleteReplacementLog();
  const all = data?.data ?? [];
  const linkedDeviceOf = (p: { device: ReplacementDevice | null; material: { deviceMaterials?: Array<{ device: ReplacementDevice }> } }) =>
    p.device ?? p.material.deviceMaterials?.[0]?.device ?? null;
  // Lọc theo tổ máy của vật tư (vật tư nằm ở tab S1/S2/COMMON nào trong Danh mục).
  const byMachine = machineFilter === "ALL" ? all : all.filter((p) => (p.material.machine ?? "COMMON") === machineFilter);
  const localStatusDemo = process.env.NODE_ENV === "development" ? buildLocalStatusDemo() : [];
  // Ô lọc "Cương vị" chỉ bày cương vị người dùng thực sự xem được — bày cương vị ngoài
  // phạm vi thì chọn vào chỉ ra bảng rỗng, tưởng lỗi. Phạm vi do SERVER tính.
  const positionScope = (data?.meta as { positionScope?: { all: boolean; labels: string[] } } | undefined)?.positionScope;
  const positionOptions = Array.from(
    new Set(
      [
        ...byMachine.map((point) => positionLabelOf(point.managingPosition)),
        ...localStatusDemo
          .filter((point) => machineFilter === "ALL" || point.machine === machineFilter)
          .map((point) => positionLabelOf(point.managingPosition)),
        ...logs
          .filter(
            (log) =>
              machineFilter === "ALL" ||
              (log.replacement?.material.machine ?? "COMMON") === machineFilter
          )
          .map((log) => positionLabelOf(log.replacement?.managingPosition)),
      ].filter((position): position is string => Boolean(position))
    )
  )
    .filter(
      (position) =>
        !positionScope ||
        positionScope.all ||
        positionScope.labels.some((label) => positionsMatch(label, position))
    )
    .sort((a, b) => a.localeCompare(b, "vi"));
  const byPosition = positionFilter === "ALL"
    ? byMachine
    : byMachine.filter((point) => positionsMatch(point.managingPosition, positionFilter));
  // Lọc theo loại vật tư (khớp cả tên biến thể cũ, như tab Danh mục vật tư).
  const matchCategory = (category: string | null | undefined) =>
    replacementCategoryMatches(category, categoryFilter);
  const byCategory = byPosition.filter((p) => matchCategory(p.material.category));
  const actualStatusPoints: ReplacementStatusPoint[] = byCategory.map((point) => {
    const device = linkedDeviceOf(point);
    return {
      id: point.id,
      materialName: point.material.name,
      materialCode: point.material.code,
      unit: point.material.unit,
      machine: point.material.machine ?? point.machine,
      category: point.material.category ?? null,
      deviceCode: device?.code ?? null,
      deviceName: device?.name ?? point.location ?? null,
      system: device?.system ?? point.system ?? null,
      managingPosition: point.managingPosition,
      nextDueAt: point.nextDueAt,
      lastReplacedAt: point.lastReplacedAt,
      intervalMonths: point.intervalMonths,
      intervalNote: point.intervalNote,
      quantity: point.quantity,
      deviceCount: point.deviceCount,
    };
  });
  const demoSearch = debouncedSearchQ.trim().toLocaleLowerCase("vi");
  const statusDemoPoints = localStatusDemo.length > 0
    ? localStatusDemo.filter((point) => {
        const matchesMachine = machineFilter === "ALL" || point.machine === machineFilter;
        const matchesPosition = positionFilter === "ALL" || positionsMatch(point.managingPosition, positionFilter);
        const matchesCategory = matchCategory(point.category);
        const haystack = `${point.materialName} ${point.materialCode} ${point.deviceCode ?? ""} ${point.deviceName ?? ""} ${point.system ?? ""}`.toLocaleLowerCase("vi");
        return matchesMachine && matchesPosition && matchesCategory && (!demoSearch || haystack.includes(demoSearch));
      })
    : [];
  const statusPoints = [...actualStatusPoints, ...statusDemoPoints];
  // Lọc theo tháng/năm: chỉ các điểm có NGÀY ĐẾN HẠN trong tháng đang chọn.
  const byMonth = byCategory.filter((p) => ym(p.nextDueAt) === month);
  const counts = { OVERDUE: 0, DUE_SOON: 0, OK: 0 };
  for (const p of byMonth) counts[replacementDueStatus(p.nextDueAt)]++;
  const total = byMonth.length;
  const points = due === "ALL" ? byMonth : byMonth.filter((p) => replacementDueStatus(p.nextDueAt) === due);
  // Panel bên phải: cả tháng, hoặc chỉ ngày đang chọn trên lịch; sắp theo ngày đến hạn.
  const panelPoints = (selectedDay ? points.filter((p) => dayKey(p.nextDueAt) === selectedDay) : [...points]).sort(
    (a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime()
  );

  const [editTarget, setEditTarget] = React.useState<ReplacementItem | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<ReplacementItem | null>(null);
  const [delTarget, setDelTarget] = React.useState<ReplacementItem | null>(null);
  const [expandedLogId, setExpandedLogId] = React.useState<string | null>(null);
  const [editLogTarget, setEditLogTarget] = React.useState<ReplacementLogItem | null>(null);
  const [delLogTarget, setDelLogTarget] = React.useState<ReplacementLogItem | null>(null);
  const [pendingEditDefectId, setPendingEditDefectId] = React.useState<string | null>(null);
  const [scheduleImportOpen, setScheduleImportOpen] = React.useState(false);

  /* ---- Tab 2: Lịch sử thay thế (history) ---- */
  const [historyFromMonth, setHistoryFromMonth] = React.useState(() => ym(new Date()));
  const [historyToMonth, setHistoryToMonth] = React.useState(() => ym(new Date()));
  const historyScopedLogs = React.useMemo(
    () =>
      logs.filter((log) => {
        const replacement = log.replacement;
        const matchesMachine =
          machineFilter === "ALL" ||
          (replacement?.material.machine ?? "COMMON") === machineFilter;
        const matchesPosition =
          positionFilter === "ALL" ||
          positionsMatch(replacement?.managingPosition, positionFilter);
        const matchesCategory = replacementCategoryMatches(
          replacement?.material.category,
          categoryFilter
        );
        return matchesMachine && matchesPosition && matchesCategory;
      }),
    [logs, machineFilter, positionFilter, categoryFilter]
  );
  // Lọc theo khoảng tháng, bao gồm cả tháng bắt đầu và tháng kết thúc.
  // Chuỗi YYYY-MM có thể so sánh trực tiếp theo thứ tự thời gian.
  const logsInMonthRange = historyScopedLogs.filter((l) => {
    const replacedMonth = ym(l.replacedAt);
    return (
      replacedMonth >= historyFromMonth &&
      replacedMonth <= historyToMonth
    );
  });
  const filteredLogs = searchQ.trim()
    ? logsInMonthRange.filter((l) => {
        const device = l.replacement ? linkedDeviceOf(l.replacement) : null;
        // Tìm được cả theo số yêu cầu, số phiếu công tác và nội dung/kết quả thực hiện.
        return `${l.replacement?.material.code} ${l.replacement?.material.name} ${device?.code ?? ""} ${device?.name ?? ""} ${l.note ?? ""} ${l.requestNumber ?? ""} ${l.defectHistory?.workOrderNumber ?? ""} ${l.defectHistory?.content ?? ""} ${l.defectHistory?.result ?? ""}`.toLowerCase().includes(searchQ.toLowerCase());
      })
    : logsInMonthRange;
  const historyRangeLabel = historyFromMonth === historyToMonth
    ? `tháng ${ymLabel(historyFromMonth)}`
    : `từ tháng ${ymLabel(historyFromMonth)} đến tháng ${ymLabel(historyToMonth)}`;
  const currentMonth = ym(new Date());
  const sharedFilterCount =
    Number(machineFilter !== "S1") +
    Number(positionFilter !== "ALL") +
    Number(categoryFilter !== CATEGORY_FILTERS[0]);
  const replacementFilterCount =
    sharedFilterCount +
    (tab === "history" ? Number(historyFromMonth !== currentMonth || historyToMonth !== currentMonth) : 0);
  const historyBackupRows = React.useMemo(() => {
    const qText = searchQ.trim().toLowerCase();
    if (!qText) return historyScopedLogs;
    return historyScopedLogs.filter((l) => {
      const device = l.replacement ? linkedDeviceOf(l.replacement) : null;
      return `${l.replacement?.material.code ?? ""} ${l.replacement?.material.name ?? ""} ${device?.code ?? ""} ${device?.name ?? ""} ${device?.system ?? ""} ${l.note ?? ""} ${l.doneBy.name}`.toLowerCase().includes(qText);
    });
  }, [historyScopedLogs, searchQ]);
  const historyBackupColumns = React.useMemo(
    () => [
      { key: "stt", header: "STT", width: 7, align: "center" as const, value: (_row: ReplacementLogItem, index: number) => index + 1 },
      { key: "replacedAt", header: "Ngày thay", width: 14, align: "center" as const, value: (l: ReplacementLogItem) => formatDate(l.replacedAt) },
      { key: "material", header: "Tên vật tư", width: 30, value: (l: ReplacementLogItem) => l.replacement?.material.name ?? l.materialNameLabel ?? "" },
      { key: "materialCategory", header: "Loại vật tư", width: 18, value: (l: ReplacementLogItem) => l.materialCategory ?? l.replacement?.material.category ?? "" },
      { key: "materialCode", header: "Mã vật tư", width: 24, value: (l: ReplacementLogItem) => l.replacement?.material.code },
      {
        key: "device",
        header: "Thiết bị",
        width: 32,
        value: (l: ReplacementLogItem) => {
          const device = l.replacement ? linkedDeviceOf(l.replacement) : null;
          return device ? `${device.code} - ${device.name}` : "";
        },
      },
      {
        key: "system",
        header: "Hệ thống",
        width: 28,
        value: (l: ReplacementLogItem) => (l.replacement ? linkedDeviceOf(l.replacement)?.system ?? l.replacement.system : ""),
      },
      {
        key: "quantity",
        header: "Số lượng",
        width: 14,
        align: "center" as const,
        value: (l: ReplacementLogItem) => (l.quantity != null ? `${l.quantity} ${l.replacement?.material.unit ?? ""}` : ""),
      },
      {
        key: "requestNumber",
        header: "Số yêu cầu",
        width: 14,
        align: "center" as const,
        value: (l: ReplacementLogItem) => l.requestNumber ?? "",
      },
      {
        key: "historyStatus",
        header: "Trạng thái",
        width: 12,
        align: "center" as const,
        value: (l: ReplacementLogItem) =>
          l.defectHistory ? (l.defectHistory.status === "FINALIZED" ? "Đã chốt" : "Chờ chốt") : "",
      },
      {
        key: "workOrderNumber",
        header: "Số PCT",
        width: 16,
        align: "center" as const,
        value: (l: ReplacementLogItem) => l.defectHistory?.workOrderNumber ?? l.pctNumber ?? "",
      },
      {
        key: "note",
        header: "Nội dung thực hiện",
        width: 34,
        value: (l: ReplacementLogItem) => l.defectHistory?.content || l.note,
      },
      {
        key: "result",
        header: "Kết quả thực hiện",
        width: 30,
        value: (l: ReplacementLogItem) => l.defectHistory?.result ?? "",
      },
      { key: "doneBy", header: "Người thực hiện", width: 24, value: (l: ReplacementLogItem) => l.doneByName || l.doneBy.name },
    ],
    []
  );

  /* ---- Xuất Excel/PDF: danh sách vật tư cần thay thế trong N tháng tới ----
   * Tính từ hôm nay, gồm cả điểm ĐÃ QUÁ HẠN (vẫn đang chờ thay) và điểm đến hạn
   * trong khoảng đã chọn. Không phụ thuộc tháng đang xem trên lịch. */
  const [horizon, setHorizon] = React.useState("1");
  const horizonMonths = Number(horizon);
  const horizonLabel = EXPORT_HORIZONS.find((h) => h.months === horizonMonths)?.label ?? `${horizonMonths} tháng`;
  const horizonEnd = addMonths(new Date(), horizonMonths);
  const exportRows = byCategory
    .filter((p) => new Date(p.nextDueAt) <= horizonEnd)
    .sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime())
    .map((p) => {
      const device = linkedDeviceOf(p);
      return {
        material: `${p.material.code} — ${p.material.name}`,
        target: device ? `${device.code} — ${device.name}` : p.location ?? "",
        device: p.location ?? "",
        quantity: p.quantity * (p.deviceCount || 1),
        dvt: p.material.unit,
        interval: replacementIntervalLabel(p.intervalMonths, p.intervalNote),
        lastReplaced: formatDate(p.lastReplacedAt),
        nextDue: formatDate(p.nextDueAt),
        status: REPL_DUE[replacementDueStatus(p.nextDueAt)].label,
        cuongViQuanLy: p.managingPosition ?? "",
      };
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title={only === "history" ? "LỊCH SỬ THAY THẾ VẬT TƯ" : "LỊCH THAY THẾ VẬT TƯ"}
        description={
          only === "history"
            ? "Lịch sử ghi nhận thay thế vật tư — gồm cả dữ liệu lưu trữ nhập từ sổ theo dõi"
            : "Tổng hợp lịch thay thế & trạng thái theo dõi vật tư"
        }
      >
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="soft" size="toolbar" className="group min-w-[112px] justify-between">
              <span className="flex items-center gap-2">
                <ListFilter className="h-4 w-4 text-sky-600" />
                Bộ lọc
                {replacementFilterCount > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-navy px-1.5 text-[10px] font-bold text-white">
                    {replacementFilterCount}
                  </span>
                )}
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
              <p className="mt-0.5 text-sm font-bold text-slate-900">Áp dụng cho cả 3 tab</p>
            </div>
            <div className="space-y-3 p-4">
              {tab === "history" && (
                <MonthRangeFilter
                  from={historyFromMonth}
                  to={historyToMonth}
                  onFromChange={(value) => {
                    setHistoryFromMonth(value);
                    if (value > historyToMonth) setHistoryToMonth(value);
                  }}
                  onToChange={(value) => {
                    setHistoryToMonth(value);
                    if (value < historyFromMonth) setHistoryFromMonth(value);
                  }}
                />
              )}
              <div className="grid grid-cols-2 gap-3 max-[360px]:grid-cols-1">
                <div className="grid min-w-0 gap-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Tổ máy</Label>
                  <Select
                    value={machineFilter}
                    onValueChange={(value) => {
                      setMachineFilter(value);
                      setPositionFilter("ALL");
                    }}
                  >
                    <SelectTrigger className="h-10 w-full rounded-xl bg-white" aria-label="Lọc theo tổ máy"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MACHINE_FILTERS.map((machine) => (
                        <SelectItem key={machine.key} value={machine.key}>{machine.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 gap-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Loại vật tư</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-10 w-full rounded-xl bg-white" aria-label="Lọc theo loại vật tư"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tất cả loại vật tư</SelectItem>
                      {CATEGORY_FILTERS.map((category) => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-slate-600">Cương vị</Label>
                <Select value={positionFilter} onValueChange={setPositionFilter}>
                  <SelectTrigger className="h-10 w-full rounded-xl bg-white" aria-label="Lọc theo cương vị">
                    <SelectValue placeholder="Chọn cương vị" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả cương vị</SelectItem>
                    {positionOptions.map((position) => (
                      <SelectItem key={position} value={position}>{position}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-[11px] text-slate-500">
                  {replacementFilterCount > 0 ? `${replacementFilterCount} điều kiện đang áp dụng` : "Đang dùng thiết lập mặc định"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={replacementFilterCount === 0}
                  onClick={() => {
                    setMachineFilter("S1");
                    setPositionFilter("ALL");
                    setCategoryFilter(CATEGORY_FILTERS[0]);
                    if (tab === "history") {
                      setHistoryFromMonth(currentMonth);
                      setHistoryToMonth(currentMonth);
                    }
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Xóa lọc
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {tab === "schedule" && (
          <ExportButton
            rows={exportRows}
            filename={`vat-tu-can-thay-the-${horizonMonths === 12 ? "1-nam" : `${horizonMonths}-thang`}`}
            title={`VẬT TƯ CẦN THAY THẾ TRONG ${horizonLabel.toUpperCase()}`}
            widths={{ material: 26, target: 22, device: 18, quantity: 7, dvt: 6, interval: 11, lastReplaced: 11, nextDue: 11, status: 10, cuongViQuanLy: 14 }}
            periodLabel="Khoảng thời gian dự báo"
            periodDescription="Xuất các điểm đã quá hạn và sắp đến hạn trong khoảng đã chọn."
            periodControl={
              <Select value={horizon} onValueChange={setHorizon}>
                <SelectTrigger className="h-10 w-full rounded-xl bg-white" aria-label="Khoảng thời gian xuất danh sách">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPORT_HORIZONS.map((h) => (
                    <SelectItem key={h.months} value={String(h.months)}>{h.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        )}
        {tab === "history" && (
          <AnnualBackupExport
            rows={historyBackupRows}
            columns={historyBackupColumns}
            dateAccessor={(row) => row.replacedAt}
            title="LỊCH SỬ THAY THẾ VẬT TƯ"
            subtitle="Báo cáo backup lịch sử ghi nhận thay thế vật tư theo năm"
            filenamePrefix="lich-su-thay-the-vat-tu"
          />
        )}
      </PageHeader>

      {/* Tabs + tìm kiếm cùng hàng; tìm kiếm nằm sát mép phải dưới cụm thao tác đầu trang. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {!only && (
          <>
            <TabBtn active={tab === "schedule"} onClick={() => setTab("schedule")} icon={CalendarCheck} label="Lịch thay thế" />
            <TabBtn
              active={tab === "status"}
              onClick={() => setTab("status")}
              icon={Activity}
              label="Trạng thái theo dõi"
              count={statusPoints.length}
            />
          </>
        )}
        <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 pb-2 sm:w-auto">
          <SearchBar
            value={searchQ}
            onChange={setSearchQ}
            placeholder="Tìm theo vật tư, thiết bị, ghi chú..."
            className="w-full sm:w-72 lg:w-80"
            shortcut
          />
          {tab === "schedule" && canCreate && (
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl border-sky-200 bg-white px-4 text-accent shadow-sm hover:border-accent hover:bg-sky-50"
              onClick={() => setScheduleImportOpen(true)}
            >
              <Upload className="h-4 w-4" />
              Nhập lịch theo dõi
            </Button>
          )}
        </div>
      </div>

      {tab === "schedule" ? (
        <div className="space-y-6">
          {isLoading ? (
            <TableSkeleton rows={8} />
          ) : (
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              {/* Lịch tháng: mỗi điểm thay thế là 1 chip màu tại ngày đến hạn */}
              <ReplacementCalendar
                month={month}
                onMonthChange={(m) => {
                  setMonth(m);
                  setSelectedDay(null);
                }}
                points={points}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                headerRight={
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Chip compact active={due === "ALL"} onClick={() => setDue("ALL")} label="Tất cả" count={total} />
                    {REPL_DUE_ORDER.map((k) => (
                      <Chip key={k} compact active={due === k} onClick={() => setDue(k)} label={REPL_DUE[k].label} count={counts[k]} dot={REPL_DUE[k].dot} />
                    ))}
                  </div>
                }
              />

              {/* Panel danh sách theo dõi (cả tháng hoặc ngày đang chọn) */}
              <Card className="flex max-h-[760px] flex-col overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink">
                    <Repeat className="h-4 w-4 text-accent" /> Danh sách theo dõi
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {selectedDay ? (
                      <>
                        <span>
                          Ngày <span className="font-semibold text-ink">{formatDate(selectedDay)}</span> · {panelPoints.length} điểm
                        </span>
                        <button type="button" className="font-medium text-accent hover:underline" onClick={() => setSelectedDay(null)}>
                          Xem cả tháng
                        </button>
                      </>
                    ) : (
                      <span>
                        Tháng <span className="font-semibold text-ink">{ymLabel(month)}</span> · {panelPoints.length} điểm thay thế
                        {machineFilter !== "ALL" && <> · {MACHINE_FILTERS.find((m) => m.key === machineFilter)?.label}</>}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
                  {panelPoints.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-3 py-10 text-center text-sm text-muted-foreground">
                      {selectedDay
                        ? "Không có điểm thay thế trong ngày này."
                        : `Không có điểm thay thế đến hạn trong tháng ${ymLabel(month)}.`}
                    </div>
                  ) : (
                    panelPoints.map((p) => {
                      const device = linkedDeviceOf(p);
                      const machineTone = materialMachineTone(p.material.machine);
                      return (
                        <div
                          key={p.id}
                          className="rounded-xl border border-border bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:bg-card"
                          style={{
                            borderLeft: `4px solid ${machineTone.accent}`,
                            backgroundImage: `linear-gradient(90deg, ${machineTone.wash} 0, transparent 72px)`,
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-ink" title={p.material.name}>
                                {p.material.name}
                              </div>
                              <div className="font-mono text-[11px] text-navy">{p.material.code}</div>
                              {p.samplingOnly && <SamplingOnlyChip className="mt-1" />}
                            </div>
                            <ReplacementBadge nextDueAt={p.nextDueAt} withText samplingOnly={p.samplingOnly} />
                          </div>
                          <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Cpu className="h-3.5 w-3.5 shrink-0 text-navy" />
                              {device ? (
                                <Link href={`/devices/${device.id}`} className="truncate hover:underline" title={device.name}>
                                  {device.name}
                                </Link>
                              ) : (
                                <span>Chưa chọn thiết bị</span>
                              )}
                            </div>
                            <div>
                              Chu kỳ {replacementIntervalLabel(p.intervalMonths, p.intervalNote)} · Lần gần nhất {formatDate(p.lastReplacedAt)}
                            </div>
                            <div>
                              Đến hạn: <span className="font-semibold text-ink">{formatDate(p.nextDueAt)}</span>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-1 border-t border-border/60 pt-2">
                            {/* Chỉ xem — lịch sử thay thế chỉ sinh từ SYC thay thế vật tư. */}
                            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-accent hover:bg-accent/10" onClick={() => setDetailTarget(p)}>
                              <Eye className="h-3.5 w-3.5" /> Xem chi tiết
                            </Button>
                              {canManage && (
                                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => setEditTarget(p)}>
                                  <Pencil className="h-3.5 w-3.5" /> Sửa
                                </Button>
                              )}
                            {canDelete && (
                              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => setDelTarget(p)}>
                                <Trash2 className="h-3.5 w-3.5" /> Xoá
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      ) : tab === "status" ? (
        <ReplacementStatusDashboard points={statusPoints} isLoading={isLoading} />
      ) : (
        <div className="space-y-6">
          {history.isLoading ? (
            <TableSkeleton rows={8} />
          ) : filteredLogs.length === 0 ? (
            <EmptyState
              icon={History}
              title={`Không có ghi nhận thay thế ${historyRangeLabel}`}
              description="Chọn khoảng tháng khác để xem lịch sử thay thế."
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="border-b border-border px-4 py-2.5 text-sm text-muted-foreground">
                <span className="capitalize">{historyRangeLabel}</span> · <span className="font-semibold text-ink">{filteredLogs.length}</span> lần ghi nhận thay thế
                {positionFilter !== "ALL" && (
                  <> · Cương vị <span className="font-medium text-ink">{positionFilter}</span></>
                )}
              </div>
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10" />
                    <TableHead>Vật tư / Thiết bị</TableHead>
                    <TableHead className="text-center">Nguồn</TableHead>
                    <TableHead className="text-center">Ngày thay</TableHead>
                    <TableHead className="text-center">Số lượng</TableHead>
                    <TableHead className="text-center">Người ghi nhận</TableHead>
                    <TableHead className="text-center">Chốt lịch sử</TableHead>
                    <TableHead className="text-center">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((l) => {
                    const expanded = expandedLogId === l.id;
                    const device = l.replacement ? linkedDeviceOf(l.replacement) : null;
                    const pending = l.defectHistory?.status === "PENDING";
                    return (
                    <React.Fragment key={l.id}>
                    <TableRow
                      className={cn("cursor-pointer", expanded ? "bg-sky-50/70 hover:bg-sky-50/70" : "hover:bg-sky-50/40")}
                      onClick={() => setExpandedLogId(expanded ? null : l.id)}
                    >
                      <TableCell className="px-0 py-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpandedLogId(expanded ? null : l.id); }}
                          aria-expanded={expanded}
                          title={expanded ? "Thu gọn" : "Xem chi tiết"}
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm transition-all duration-200",
                            expanded ? "rotate-45 bg-[#00558F]" : "bg-emerald-600 hover:bg-emerald-700"
                          )}
                        >
                          <Repeat className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                      {/* Gộp vật tư + thiết bị vào một ô như cột THIẾT BỊ của Lịch sử sửa chữa;
                          hệ thống và cương vị đã có trong panel chi tiết nên bỏ khỏi bảng. */}
                      <TableCell className="px-3 py-2.5">
                        <div className="font-semibold leading-snug text-ink">
                          {l.replacement?.material.name ?? "—"}
                        </div>
                        <div className="mt-0.5 font-mono text-[11.5px] tracking-tight text-muted-foreground">
                          {device?.code || l.deviceSeq || "chưa gắn thiết bị"}
                          {device?.name ? ` · ${device.name}` : l.deviceLabel ? ` · ${l.deviceLabel}` : ""}
                        </div>
                        {l.pointRemoved && (
                          <div className="mt-0.5 text-[10.5px] italic text-muted-foreground/70">
                            điểm theo dõi đã gỡ
                          </div>
                        )}
                        {l.imported && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">
                            Lưu trữ · sổ theo dõi
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-center">
                        {l.requestNumber ? (
                          <Link
                            href={`/defects?q=${encodeURIComponent(l.requestNumber)}`}
                            onClick={(e) => e.stopPropagation()}
                            title="Mở số yêu cầu thay thế vật tư"
                            className="inline-block rounded-md bg-sky-50 px-2.5 py-0.5 text-[12.5px] font-semibold text-[#00558F] hover:bg-sky-100"
                          >
                            {l.requestNumber}
                          </Link>
                        ) : l.imported ? (
                          <span className="text-[12.5px] text-muted-foreground" title="Nhập từ sổ theo dõi vật tư">
                            {l.pctNumber || "—"}
                          </span>
                        ) : (
                          <span className="text-[12.5px] text-muted-foreground">Ghi thủ công</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-2.5 text-center font-mono text-[13px] font-semibold text-ink">
                        {formatDate(l.replacedAt)}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-center text-sm">
                        {l.quantity != null ? `${l.quantity.toLocaleString("vi-VN")} ${l.unitLabel ?? l.replacement?.material.unit ?? ""}` : "—"}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-center">
                        {/* Dòng lưu trữ có người dùng chưa/không còn tài khoản: hiện tên
                            nguyên văn trên sổ thay cho avatar của tài khoản chạy nhập. */}
                        {l.imported && l.doneByName ? (
                          <span className="text-[12.5px] font-medium text-ink" title="Tên ghi trên sổ theo dõi">
                            {l.doneByName}
                          </span>
                        ) : (
                          <UserAvatar user={l.doneBy} />
                        )}
                      </TableCell>
                      {/* Chỉ dòng sinh từ SYC mới có khái niệm chốt lịch sử. */}
                      <TableCell className="px-3 py-2.5 text-center">
                        {l.defectHistory ? (
                          <>
                            <LockChip pending={pending} />
                            {pending && l.defectHistory.finalizeAt && (
                              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                                hạn {formatDate(l.defectHistory.finalizeAt)}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-[12.5px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-2">
                          {/* SYC thay thế vật tư không còn hiện ở Lịch sử sửa chữa, nên nút
                              sửa bản nháp chờ chốt phải có ở đây — nếu không, suốt thời gian
                              chờ chốt sẽ không còn đường nào sửa nội dung/PCT/kết quả. */}
                          {canManage && pending && l.defectId && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                              title="Sửa thông tin lịch sử"
                              onClick={() => setPendingEditDefectId(l.defectId!)}
                            >
                              <FileClock className="h-4 w-4" />
                            </Button>
                          )}
                          {canManage && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              title="Chỉnh sửa"
                              onClick={() => setEditLogTarget(l)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              title="Xóa"
                              onClick={() => setDelLogTarget(l)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          {!canManage && !canDelete && <span className="text-sm text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} className="bg-slate-50/80 p-0">
                          <div className="border-l-[3px] border-[#00558F] py-4 pl-6 pr-5">
                            <ReplacementHistoryDetails log={l} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {pendingEditDefectId && (
        <PendingHistoryEditDialog defectId={pendingEditDefectId} onClose={() => setPendingEditDefectId(null)} />
      )}

      {/* Schedule dialogs */}
      <ReplacementScheduleImportDialog
        open={scheduleImportOpen}
        onOpenChange={setScheduleImportOpen}
        defaultMachine={machineFilter}
      />

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Sửa điểm thay thế</DialogTitle></DialogHeader>
          {editTarget && <ReplacementPointForm materialId={editTarget.materialId} point={editTarget} defaultSystem={editTarget.material.system} onDone={() => setEditTarget(null)} />}
        </DialogContent>
      </Dialog>

      <ReplacementPointDetailsDialog point={detailTarget} onClose={() => setDetailTarget(null)} />

      <ReplacementLogEditDialog log={editLogTarget} onClose={() => setEditLogTarget(null)} />

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="Xoá điểm thay thế?"
        description="Xoá điểm thay thế này và toàn bộ lịch sử thay thế của nó?"
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={async () => {
          if (!delTarget) return;
          try {
            await del.mutateAsync(delTarget.id);
            toast.success("Đã xoá điểm thay thế");
            setDelTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />

      <ConfirmDialog
        open={!!delLogTarget}
        onOpenChange={(o) => !o && setDelLogTarget(null)}
        title="Xoá ghi nhận thay thế?"
        description="Chỉ xoá bản ghi lịch sử thay thế này, không tự khôi phục điểm theo dõi đã lưu trữ."
        confirmLabel="Xoá"
        loading={delLog.isPending}
        onConfirm={async () => {
          if (!delLogTarget) return;
          try {
            await delLog.mutateAsync(delLogTarget.id);
            toast.success("Đã xoá ghi nhận thay thế");
            setDelLogTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function ReplacementLogEditDialog({ log, onClose }: { log: ReplacementLogItem | null; onClose: () => void }) {
  const update = useUpdateReplacementLog();
  const [replacedAt, setReplacedAt] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!log) return;
    setReplacedAt(formatDateInput(log.replacedAt));
    setQuantity(log.quantity != null ? String(log.quantity) : "");
    setNote(log.note ?? "");
  }, [log]);

  async function submit() {
    if (!log) return;
    try {
      await update.mutateAsync({ id: log.id, replacedAt, quantity: quantity || null, note });
      toast.success("Đã cập nhật ghi nhận thay thế");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={!!log} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Chỉnh sửa ghi nhận thay thế</DialogTitle></DialogHeader>
        {log && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="font-medium text-ink">{log.replacement?.material.name ?? "Vật tư"}</div>
              <div className="font-mono text-xs text-navy">{log.replacement?.material.code ?? ""}</div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block">Ngày thay thế</Label>
                <Input type="date" value={replacedAt} onChange={(e) => setReplacedAt(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1.5 block">Số lượng</Label>
                <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">Ghi chú</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Nội dung ghi chú..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={update.isPending}>Huỷ</Button>
              <Button onClick={submit} disabled={update.isPending || !replacedAt}>Lưu thay đổi</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: any; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
        active ? "border-navy text-navy" : "border-transparent text-muted-foreground hover:text-ink"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count != null && count > 0 && (
        <span className={cn("rounded-full px-1.5 text-xs font-bold", active ? "bg-navy/10 text-navy" : "bg-muted text-muted-foreground")}>{count}</span>
      )}
    </button>
  );
}

/** Khoảng tháng lịch sử; hai đầu mút đều được tính vào kết quả. */
function MonthRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <label className="grid min-w-0 gap-1.5">
        <span className="text-xs font-semibold text-slate-600">Từ tháng</span>
        <input
          type="month"
          value={from}
          max={to}
          onChange={(event) => event.target.value && onFromChange(event.target.value)}
          aria-label="Từ tháng"
          className="h-10 w-full min-w-0 rounded-xl border border-input bg-white px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="grid min-w-0 gap-1.5">
        <span className="text-xs font-semibold text-slate-600">Đến tháng</span>
        <input
          type="month"
          value={to}
          min={from}
          onChange={(event) => event.target.value && onToChange(event.target.value)}
          aria-label="Đến tháng"
          className="h-10 w-full min-w-0 rounded-xl border border-input bg-white px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
    </div>
  );
}

function UserAvatar({ user }: { user: { name: string; position: string | null; avatarUrl: string | null } }) {
  return (
    <div className="flex justify-center" title={`${user.name}${user.position ? ` · ${user.position}` : ""}`} aria-label={user.name}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-[11px] font-bold text-white shadow-sm ring-1 ring-border">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
        ) : (
          initials(user.name)
        )}
      </span>
    </div>
  );
}

function Chip({ active, onClick, label, count, dot, compact }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border transition-colors",
        compact ? "gap-1.5 px-2 py-0.5 text-xs" : "gap-2 px-3 py-1 text-sm",
        active ? "border-navy bg-navy text-white" : "border-border bg-white text-ink hover:border-accent"
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {label}
      <span className={cn("rounded-full px-1.5", compact ? "text-[10px]" : "text-xs", active ? "bg-white/20" : "bg-muted")}>{count}</span>
    </button>
  );
}
