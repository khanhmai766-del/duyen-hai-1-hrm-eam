"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, Wrench, CircleSlash, CircleDashed, CirclePause, Package, Plus, X, Pencil, CircleX, CheckCircle2, BellRing, CloudOff, FileClock, FileSpreadsheet, ExternalLink, Minus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Check, ArrowUp, Loader2, ClipboardList, Ban, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { defectDetailQuery, useCancelDefect, useDefect, useDefects, useDefectShiftSummary, useDefectSyncStatus, useDefectTwoWaySync, useRemindDefect, useSyncDefects, useUpdateDefect, type DefectItem } from "@/hooks/useDefects";
import { usePositions, useUsers } from "@/hooks/useUsers";
import {
  DEFECT_STATUS,
  DEFECT_STATUS_ORDER,
  DEFECT_SEVERITY,
  DEFECT_SEVERITY_ORDER,
  DEFECT_SEVERITY_CRITERIA,
  DEFECT_CONDITION,
  isSelectableManagingPosition,
} from "@/lib/constants";
import {
  DEFECT_SECTIONS,
  defaultRequestTypeOf,
  isRequestTypeInSection,
  parseDefectSection,
} from "@/lib/defect-section";
import { parseScope, scopeCode } from "@/lib/equipment-units";
import { DefectSyncChip } from "@/components/defects/defect-sync-chip";
import { DefectFilterBar, type ActiveChip } from "@/components/defects/defect-filter-bar";
import { DefectExpandedDetailsById } from "@/components/defects/defect-expanded-details";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { formatDate, initials, cn } from "@/lib/utils";
import { isDefectShiftLeaderCandidatePosition } from "@/lib/defect-shift-leader-position";
import { announcementPositionLabel } from "@/lib/positions";
import { ELECTRICAL_SHEET_URL, MECHANICAL_CHEMICAL_SHEET_URL } from "@/lib/links";

const PAGE_SIZES = [10, 25, 50, 100];
// Nhãn hiển thị của từng giá trị statusFilter. Bộ lọc kết quả vận hành không còn
// dropdown riêng — chỉ đặt bằng 5 thẻ KPI; bảng này dùng để hiện tên trên chip "Đang lọc".
const DEFECT_STATUS_FILTER_OPTIONS = [
  { value: "SOURCE_MISSING", label: "Không còn trên Google Sheet" },
  { value: "TON_DONG", label: "Chưa lưu lịch sử" },
  ...DEFECT_STATUS_ORDER.filter((s) => s !== "DA_XU_LY").map((s) => ({ value: s, label: DEFECT_STATUS[s].label })),
];
const DefectForm = dynamic(
  () => import("@/components/defects/defect-form").then((module) => module.DefectForm),
  { ssr: false }
);
const CompleteDefectDialog = dynamic(
  () => import("@/components/defects/complete-defect-dialog").then((module) => module.CompleteDefectDialog),
  { ssr: false }
);

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

type FloatingScrollbarGeometry = {
  visible: boolean;
  left: number;
  width: number;
  contentWidth: number;
  viewportWidth: number;
};

function PersistentHorizontalScroll({ children }: { children: React.ReactNode }) {
  const tableScrollRef = React.useRef<HTMLDivElement>(null);
  const frameRef = React.useRef<number | null>(null);
  const dragRef = React.useRef<{ startX: number; startScrollLeft: number } | null>(null);
  const [scrollLeft, setScrollLeft] = React.useState(0);
  const [geometry, setGeometry] = React.useState<FloatingScrollbarGeometry>({
    visible: false,
    left: 0,
    width: 0,
    contentWidth: 0,
    viewportWidth: 0,
  });

  const updateGeometry = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const tableScroll = tableScrollRef.current;
      if (!tableScroll) return;

      const rect = tableScroll.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const right = Math.min(window.innerWidth, rect.right);
      const width = Math.max(0, right - left);
      const hasHorizontalOverflow = tableScroll.scrollWidth > tableScroll.clientWidth + 1;

      setGeometry((current) => {
        const next = {
          visible: hasHorizontalOverflow && width > 0,
          left,
          width,
          contentWidth: tableScroll.scrollWidth,
          viewportWidth: tableScroll.clientWidth,
        };
        return current.visible === next.visible &&
          current.left === next.left &&
          current.width === next.width &&
          current.contentWidth === next.contentWidth &&
          current.viewportWidth === next.viewportWidth
          ? current
          : next;
      });
    });
  }, []);

  React.useEffect(() => {
    const tableScroll = tableScrollRef.current;
    if (!tableScroll) return;

    const resizeObserver = new ResizeObserver(updateGeometry);
    resizeObserver.observe(tableScroll);
    if (tableScroll.firstElementChild) resizeObserver.observe(tableScroll.firstElementChild);

    window.addEventListener("scroll", updateGeometry, { passive: true });
    window.addEventListener("resize", updateGeometry);
    updateGeometry();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", updateGeometry);
      window.removeEventListener("resize", updateGeometry);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [updateGeometry]);

  const setHorizontalPosition = React.useCallback((nextScrollLeft: number) => {
    const tableScroll = tableScrollRef.current;
    if (!tableScroll) return;
    const maximum = Math.max(0, tableScroll.scrollWidth - tableScroll.clientWidth);
    const clamped = Math.min(maximum, Math.max(0, nextScrollLeft));
    tableScroll.scrollLeft = clamped;
    setScrollLeft(clamped);
  }, []);

  const maximumScrollLeft = Math.max(0, geometry.contentWidth - geometry.viewportWidth);
  const trackInset = 44;
  const trackWidth = Math.max(0, geometry.width - trackInset * 2);
  const thumbWidth = geometry.contentWidth > 0
    ? Math.min(trackWidth, Math.max(88, trackWidth * (geometry.viewportWidth / geometry.contentWidth)))
    : trackWidth;
  const thumbTravel = Math.max(0, trackWidth - thumbWidth);
  const thumbOffset = maximumScrollLeft > 0
    ? (scrollLeft / maximumScrollLeft) * thumbTravel
    : 0;

  return (
    <>
      <div
        ref={tableScrollRef}
        className="overflow-x-auto"
        onScroll={(event) => {
          setScrollLeft(event.currentTarget.scrollLeft);
        }}
      >
        {children}
      </div>
      {geometry.visible && typeof document !== "undefined" && createPortal(
        <div
          role="scrollbar"
          aria-label="Thanh cuộn ngang của danh sách khiếm khuyết"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={Math.round(maximumScrollLeft)}
          aria-valuenow={Math.round(scrollLeft)}
          tabIndex={0}
          className="fixed bottom-5 z-[70] h-10 rounded-full border border-slate-300 bg-white/95 shadow-[0_6px_24px_rgba(15,23,42,0.28)] outline-none backdrop-blur-md focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-600 dark:bg-slate-900/95"
          style={{ left: geometry.left, width: geometry.width }}
          title="Kéo hoặc bấm nút để xem các cột bên trái và bên phải"
          onKeyDown={(event) => {
            const step = event.key === "PageUp" || event.key === "PageDown"
              ? geometry.viewportWidth * 0.8
              : 80;
            if (event.key === "ArrowLeft" || event.key === "PageUp") {
              event.preventDefault();
              setHorizontalPosition(scrollLeft - step);
            } else if (event.key === "ArrowRight" || event.key === "PageDown") {
              event.preventDefault();
              setHorizontalPosition(scrollLeft + step);
            } else if (event.key === "Home") {
              event.preventDefault();
              setHorizontalPosition(0);
            } else if (event.key === "End") {
              event.preventDefault();
              setHorizontalPosition(maximumScrollLeft);
            }
          }}
          onWheel={(event) => {
            event.preventDefault();
            setHorizontalPosition(scrollLeft + event.deltaX + event.deltaY);
          }}
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const track = event.currentTarget.getBoundingClientRect();
            const nextThumbOffset = Math.min(
              thumbTravel,
              Math.max(0, event.clientX - track.left - trackInset - thumbWidth / 2)
            );
            const nextScrollLeft = thumbTravel > 0
              ? (nextThumbOffset / thumbTravel) * maximumScrollLeft
              : 0;
            setHorizontalPosition(nextScrollLeft);
          }}
        >
          <button
            type="button"
            className="absolute left-1 top-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-200 active:bg-slate-300 disabled:opacity-35 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-label="Cuộn bảng sang trái"
            disabled={scrollLeft <= 0}
            onClick={() => setHorizontalPosition(scrollLeft - Math.max(240, geometry.viewportWidth * 0.6))}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div
            className="pointer-events-none absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-slate-200 ring-1 ring-inset ring-slate-300 dark:bg-slate-700 dark:ring-slate-600"
            style={{ left: trackInset, width: trackWidth }}
          />
          <div
            aria-hidden="true"
            className="absolute top-1/2 h-4 -translate-y-1/2 cursor-grab touch-none rounded-full bg-blue-600 shadow-[0_1px_4px_rgba(37,99,235,0.45)] transition-colors hover:bg-blue-700 active:cursor-grabbing active:bg-blue-800 dark:bg-blue-400 dark:hover:bg-blue-300"
            style={{
              left: trackInset + thumbOffset,
              width: thumbWidth,
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = { startX: event.clientX, startScrollLeft: scrollLeft };
            }}
            onPointerMove={(event) => {
              if (!dragRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const scrollPerPixel = thumbTravel > 0 ? maximumScrollLeft / thumbTravel : 0;
              setHorizontalPosition(
                dragRef.current.startScrollLeft + (event.clientX - dragRef.current.startX) * scrollPerPixel
              );
            }}
            onPointerUp={(event) => {
              dragRef.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
          />
          <button
            type="button"
            className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-200 active:bg-slate-300 disabled:opacity-35 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-label="Cuộn bảng sang phải"
            disabled={scrollLeft >= maximumScrollLeft - 1}
            onClick={() => setHorizontalPosition(scrollLeft + Math.max(240, geometry.viewportWidth * 0.6))}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      , document.body)}
    </>
  );
}

export default function DefectsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const deviceSeqFilter = searchParams.get("deviceSeq")?.trim() ?? "";
  const includeDescendants = Math.min(3, Math.max(0, Number.parseInt(searchParams.get("includeDescendants") ?? "0", 10) || 0));
  const mappedUnitFilter = searchParams.get("mappedUnit")?.trim() ?? "";
  const unitFromUrl = searchParams.get("unit")?.toUpperCase();
  // Phần Cơ / phần Điện — quyết định sheet nguồn và danh sách loại yêu cầu được lọc.
  const section = parseDefectSection(searchParams.get("phan"));
  const sectionConfig = DEFECT_SECTIONS[section];
  const rawRequestFromUrl = searchParams.get("requestType")?.trim();
  // Chuyển phần mà giữ loại yêu cầu của phần cũ thì bảng sẽ rỗng — bỏ giá trị lạ.
  const requestFromUrl = isRequestTypeInSection(section, rawRequestFromUrl) ? rawRequestFromUrl : undefined;
  const positionFromUrl = searchParams.get("position")?.trim();
  const statusFromUrl = searchParams.get("status")?.trim();
  const severityFromUrl = searchParams.get("severity")?.trim();
  const repairResultFromUrl = searchParams.get("repairResult")?.trim();
  const mismatchFromUrl = searchParams.get("mismatch") === "true";
  const upgradeCandidateFromUrl = searchParams.get("upgradeCandidate") === "true";
  const searchFromUrl = searchParams.get("q")?.trim();
  const pageSizeFromUrl = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const pageFromUrl = Number.parseInt(searchParams.get("page") ?? "", 10);
  const rbac = useRbacAccess();
  const { data: session } = useSession();
  const readOnlyDefects = session?.user?.accessMode === "DEFECT_READ_ONLY";
  const canCreate = !readOnlyDefects && rbac.can("defect-manage", ["personal", "manage", "full"]);
  const canManage = !readOnlyDefects && rbac.can("defect-manage", ["manage", "full"]);
  const canClose = !readOnlyDefects && rbac.can("defect-close", ["manage", "full"]);
  const cancelDefect = useCancelDefect();
  const remind = useRemindDefect();
  const usersQuery = useUsers({ enabled: !readOnlyDefects });
  const shiftLeaders = React.useMemo(
    () => (usersQuery.data?.data ?? [])
      .filter((user) =>
        user.isActive &&
        [user.position, user.secondaryPosition, user.secondaryPosition2, user.currentPosition]
          .some(isDefectShiftLeaderCandidatePosition)
      )
      .sort((a, b) => a.name.localeCompare(b.name, "vi")),
    [usersQuery.data?.data]
  );
  const sync = useSyncDefects();
  const canRunSync = rbac.can("defect-manage", ["full"]);
  const canViewSync = rbac.can("defect-manage", ["manage", "full"]);
  const canManageTwoWaySync = rbac.can("defect-two-way-sync", ["full"]);
  const twoWaySync = useDefectTwoWaySync();
  const syncFeatures = twoWaySync.data?.data;
  const operationUpdateAvailable = Boolean(
    syncFeatures?.twoWaySyncEnabled && syncFeatures.operationUpdateEnabled
  );
  const websiteCreateAvailable = Boolean(
    syncFeatures?.twoWaySyncEnabled && syncFeatures.websiteCreateEnabled
  );
  const websiteRemindAvailable = Boolean(
    syncFeatures?.twoWaySyncEnabled && syncFeatures.websiteRemindEnabled
  );
  const syncStatus = useDefectSyncStatus(canViewSync);
  const latestSyncRun = syncStatus.data?.data?.[0];
  const syncRunning = latestSyncRun?.status === "RUNNING";
  const observedSyncRef = React.useRef<{ id: string; status: string } | null>(null);

  React.useEffect(() => {
    if (!latestSyncRun) return;
    const previous = observedSyncRef.current;
    const justFinished =
      latestSyncRun.status !== "RUNNING" &&
      previous !== null &&
      (previous.id !== latestSyncRun.id || previous.status === "RUNNING");

    observedSyncRef.current = { id: latestSyncRun.id, status: latestSyncRun.status };
    if (justFinished) {
      void queryClient.invalidateQueries({ queryKey: ["defects"] });
      if (latestSyncRun.status === "SUCCESS") {
        toast.success("n8n đã đồng bộ khiếm khuyết thành công");
      } else if (latestSyncRun.status === "FAILED") {
        toast.error(latestSyncRun.error || "Lượt đồng bộ n8n thất bại");
      }
    }
  }, [latestSyncRun, queryClient]);

  // Cương vị lấy từ "Chức vụ" của Quản lý người dùng (bỏ trùng);
  // loại Quản đốc / Phó quản đốc / Kỹ thuật viên / Thống kê khỏi bộ lọc.
  const allPositions = usePositions({ enabled: !readOnlyDefects }).filter(isSelectableManagingPosition);

  // Bộ lọc (Tổ máy / Yêu cầu / Cương vị) — áp dụng cho cả KPI lẫn bảng.
  // Mặc định S1; người dùng có thể chọn ALL để xem toàn bộ tổ máy.
  const [unitFilter, setUnitFilter] = React.useState<"ALL" | "S1" | "S2" | "COMMON">(
    unitFromUrl === "ALL" || unitFromUrl === "S1" || unitFromUrl === "S2" || unitFromUrl === "COMMON" ? unitFromUrl : "S1"
  );
  const [requestFilter, setRequestFilter] = React.useState(requestFromUrl || defaultRequestTypeOf(section));
  // Điều hướng sang phần kia (sidebar đổi query param) phải kéo bộ lọc về mặc định
  // của phần mới, vì "Cơ" không tồn tại bên Điện và ngược lại.
  React.useEffect(() => {
    setRequestFilter((current) =>
      isRequestTypeInSection(section, current) ? current : defaultRequestTypeOf(section)
    );
  }, [section]);
  const [positionFilter, setPositionFilter] = React.useState(positionFromUrl || "ALL");
  const [statusFilter, setStatusFilter] = React.useState(statusFromUrl || "ALL");
  const [severityFilter, setSeverityFilter] = React.useState(severityFromUrl || "ALL");
  const [repairResultFilter, setRepairResultFilter] = React.useState(repairResultFromUrl || "ALL");
  const [mismatchOnly, setMismatchOnly] = React.useState(mismatchFromUrl);
  const [upgradeCandidatesOnly, setUpgradeCandidatesOnly] = React.useState(upgradeCandidateFromUrl);
  const [tableSearch, setTableSearch] = React.useState(searchFromUrl || "");
  const [pageSize, setPageSize] = React.useState(
    PAGE_SIZES.includes(pageSizeFromUrl) ? pageSizeFromUrl : 10
  );
  const [page, setPage] = React.useState(pageFromUrl > 0 ? pageFromUrl : 1);
  const deferredSearch = useDebouncedValue(tableSearch.trim(), 350);
  const listParams = React.useMemo(() => ({
    page,
    limit: pageSize,
    section,
    unit: unitFilter,
    mappedUnit: mappedUnitFilter,
    requestType: requestFilter,
    position: positionFilter,
    status: statusFilter,
    severity: severityFilter,
    repairResult: repairResultFilter,
    mismatch: mismatchOnly,
    upgradeCandidate: upgradeCandidatesOnly,
    q: deferredSearch,
    deviceSeq: deviceSeqFilter,
    includeDescendants,
  }), [page, pageSize, section, unitFilter, mappedUnitFilter, requestFilter, positionFilter, statusFilter, severityFilter, repairResultFilter, mismatchOnly, upgradeCandidatesOnly, deferredSearch, deviceSeqFilter, includeDescendants]);
  const { data, isLoading, isFetching } = useDefects(listParams);
  const shiftSummary = useDefectShiftSummary(section);
  const pagedDefects = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;
  const scopeTotal = data?.meta?.scopeTotal ?? 0;
  // Ô lọc "Cương vị" chỉ bày cương vị người dùng thực sự xem được — bày cương vị ngoài
  // phạm vi thì chọn vào chỉ ra bảng rỗng, tưởng lỗi. Phạm vi do SERVER tính vì client
  // không tự suy ra đúng phân cấp ca trực (Trưởng kíp thấy cương vị dưới nhánh mình…).
  const positionScope = data?.meta?.positionScope;
  const positions = React.useMemo(() => {
    if (readOnlyDefects) return (data?.meta?.availablePositions ?? []).filter(isSelectableManagingPosition);
    if (!positionScope || positionScope.all) return allPositions;
    const allowed = new Set(positionScope.labels.map(announcementPositionLabel));
    const shown = allPositions.filter((position) => allowed.has(announcementPositionLabel(position)));
    // Chức danh của người dùng chưa có ai khác mang thì usePositions() không sinh ra
    // được nhãn nào — lấy thẳng nhãn chuẩn từ server để ô lọc không rỗng.
    return shown.length ? shown : positionScope.labels;
  }, [allPositions, data?.meta?.availablePositions, positionScope, readOnlyDefects]);
  const firstShown = total ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, total);
  const deviceDisplayName = pagedDefects.find((item) => item.deviceSeq === deviceSeqFilter)?.node?.name;
  React.useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  React.useEffect(() => {
    const query = new URLSearchParams();
    if (deviceSeqFilter) query.set("deviceSeq", deviceSeqFilter);
    if (includeDescendants > 0) query.set("includeDescendants", String(includeDescendants));
    if (mappedUnitFilter) query.set("mappedUnit", mappedUnitFilter);
    if (unitFilter !== "S1") query.set("unit", unitFilter);
    query.set("phan", section);
    if (requestFilter !== defaultRequestTypeOf(section)) query.set("requestType", requestFilter);
    if (positionFilter !== "ALL") query.set("position", positionFilter);
    if (statusFilter !== "ALL") query.set("status", statusFilter);
    if (severityFilter !== "ALL") query.set("severity", severityFilter);
    if (repairResultFilter !== "ALL") query.set("repairResult", repairResultFilter);
    if (mismatchOnly) query.set("mismatch", "true");
    if (upgradeCandidatesOnly) query.set("upgradeCandidate", "true");
    if (deferredSearch) query.set("q", deferredSearch);
    if (pageSize !== 10) query.set("limit", String(pageSize));
    if (page > 1) query.set("page", String(page));
    const suffix = query.toString();
    router.replace(`/defects${suffix ? `?${suffix}` : ""}`, { scroll: false });
  }, [
    deferredSearch,
    deviceSeqFilter,
    includeDescendants,
    mappedUnitFilter,
    mismatchOnly,
    upgradeCandidatesOnly,
    page,
    pageSize,
    positionFilter,
    requestFilter,
    repairResultFilter,
    router,
    section,
    severityFilter,
    statusFilter,
    unitFilter,
  ]);

  const isFiltered = deviceSeqFilter !== "" || unitFilter !== "S1" || requestFilter !== defaultRequestTypeOf(section) || positionFilter !== "ALL" || statusFilter !== "ALL" || severityFilter !== "ALL" || repairResultFilter !== "ALL" || mismatchOnly || upgradeCandidatesOnly || tableSearch.trim() !== "";
  function resetFilters() {
    router.replace(`/defects?phan=${section}`, { scroll: false });
    setUnitFilter("S1");
    setRequestFilter(defaultRequestTypeOf(section));
    setPositionFilter("ALL");
    setStatusFilter("ALL");
    setSeverityFilter("ALL");
    setRepairResultFilter("ALL");
    setMismatchOnly(false);
    setUpgradeCandidatesOnly(false);
    setTableSearch("");
  }

  // Chip "Đang lọc": chỉ gắn nút × khi bấm vào THỰC SỰ đổi được gì đó. Tổ máy và Yêu cầu
  // luôn phải có một giá trị nên khi đang ở mặc định (S1 / Cơ) chúng chỉ là chip ngữ cảnh.
  const activeFilterChips = React.useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = [
      {
        key: "unit",
        label: "Tổ máy",
        value: unitFilter === "ALL" ? "Tất cả" : unitFilter === "COMMON" ? "Common" : unitFilter,
        onClear: unitFilter !== "S1" ? () => setUnitFilter("S1") : undefined,
      },
      {
        key: "request",
        label: "Yêu cầu",
        value: requestFilter,
        onClear: requestFilter !== "Cơ" ? () => setRequestFilter("Cơ") : undefined,
      },
    ];
    if (positionFilter !== "ALL") {
      chips.push({ key: "position", label: "Cương vị", value: positionFilter, onClear: () => setPositionFilter("ALL") });
    }
    if (statusFilter !== "ALL") {
      chips.push({
        key: "status",
        label: "KQ vận hành",
        value: DEFECT_STATUS_FILTER_OPTIONS.find((option) => option.value === statusFilter)?.label ?? statusFilter,
        onClear: () => setStatusFilter("ALL"),
      });
    }
    if (repairResultFilter !== "ALL") {
      chips.push({
        key: "repairResult",
        label: "KQ sửa chữa",
        value: repairResultFilter,
        onClear: () => setRepairResultFilter("ALL"),
      });
    }
    if (severityFilter !== "ALL") {
      chips.push({
        key: "severity",
        label: "Mức độ",
        value: (DEFECT_SEVERITY as Record<string, string>)[severityFilter] ?? severityFilter,
        onClear: () => setSeverityFilter("ALL"),
      });
    }
    if (tableSearch.trim()) {
      chips.push({ key: "search", label: "Tìm", value: tableSearch.trim(), onClear: () => setTableSearch("") });
    }
    return chips;
  }, [unitFilter, requestFilter, positionFilter, severityFilter, statusFilter, repairResultFilter, tableSearch]);

  const chuaXuLy = data?.meta?.kpi?.chuaXuLy ?? 0;
  const coPct = data?.meta?.kpi?.coPct ?? 0;
  const choVatTu = data?.meta?.kpi?.choVatTu ?? 0;
  const choNgungMay = data?.meta?.kpi?.choNgungMay ?? 0;
  const tonDong = data?.meta?.kpi?.tonDong ?? 0;
  function toggleStatus(s: string) {
    setStatusFilter((cur) => (cur === s ? "ALL" : s));
  }

  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DefectItem | null>(null);
  const [formHasDeviceHistory, setFormHasDeviceHistory] = React.useState(false);
  const [cancelTarget, setCancelTarget] = React.useState<DefectItem | null>(null);
  const [cancelNote, setCancelNote] = React.useState("Vận hành hủy phiếu");
  const [completeTarget, setCompleteTarget] = React.useState<DefectItem | null>(null);
  const [remindTarget, setRemindTarget] = React.useState<DefectItem | null>(null);
  const [upgradeTarget, setUpgradeTarget] = React.useState<DefectItem | null>(null);
  const [remindShiftLeaderId, setRemindShiftLeaderId] = React.useState("");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = React.useState<string | null>(null);

  function openCreate() {
    setEditTarget(null);
    setFormHasDeviceHistory(false);
    setFormOpen(true);
  }
  async function loadDefectDetail(id: string) {
    setDetailLoadingId(id);
    try {
      const result = await queryClient.fetchQuery(defectDetailQuery(id));
      return result.data;
    } catch (error) {
      toast.error((error as Error).message);
      return null;
    } finally {
      setDetailLoadingId(null);
    }
  }
  async function openEdit(d: DefectItem) {
    const detail = await loadDefectDetail(d.id);
    if (!detail) return;
    setEditTarget(detail);
    setFormHasDeviceHistory(Boolean(detail.device));
    setFormOpen(true);
  }
  async function openComplete(d: DefectItem) {
    const detail = await loadDefectDetail(d.id);
    if (detail) setCompleteTarget(detail);
  }
  React.useEffect(() => {
    setExpandedId(null);
    setPage(1);
  }, [deviceSeqFilter, unitFilter, requestFilter, positionFilter, statusFilter, severityFilter, repairResultFilter, mismatchOnly, upgradeCandidatesOnly, tableSearch, pageSize]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`KHIẾM KHUYẾT THIẾT BỊ — ${sectionConfig.label.toUpperCase()}`}
        description={`Phiếu đồng bộ từ Google Sheet ${sectionConfig.source === "CO" ? "Cơ" : "Điện"} · theo dõi sự cố & khiếm khuyết đang tồn đọng`}
      >
        {!readOnlyDefects && <Button variant="soft" size="toolbar" asChild>
          <a
            href={sectionConfig.source === "CO" ? MECHANICAL_CHEMICAL_SHEET_URL : ELECTRICAL_SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileSpreadsheet className="h-4 w-4" /> Mở {sectionConfig.label}
            <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
          </a>
        </Button>}
        {readOnlyDefects && (
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700">
            Chế độ chỉ tra cứu
          </span>
        )}
        {/* Trạng thái + thao tác đồng bộ gói trong 1 chip, bấm mới mở chi tiết —
            thay cho 2 banner cũ chiếm trọn chiều ngang phía trên bộ lọc. */}
        {canViewSync && (
          <DefectSyncChip
            runs={syncStatus.data?.data ?? []}
            running={syncRunning}
            syncing={sync.isPending || syncStatus.isLoading}
            canRunSync={canRunSync}
            canManageTwoWaySync={canManageTwoWaySync}
            onSync={async () => {
              try {
                const result = await sync.mutateAsync();
                toast.success(result.message);
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          />
        )}
        {canCreate && websiteCreateAvailable && (
          <Button size="toolbar" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Thêm mới
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-amber-50 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy text-white shadow-sm">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">
              {shiftSummary.data?.data.shiftLabel ?? "Ca hiện tại"}
              <span className="ml-2 font-normal text-muted-foreground">
                {shiftSummary.data?.data.timeLabel ?? "Đang xác định…"}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Phiếu yêu cầu lập từ website trong {sectionConfig.label}
            </p>
          </div>
        </div>
        {shiftSummary.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tổng hợp…
          </div>
        ) : shiftSummary.isError ? (
          <p className="text-sm font-medium text-red-600">Không tải được thống kê ca</p>
        ) : (
          <div className={cn(
            "grid gap-2 text-center",
            section === "co" ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"
          )}>
            <ShiftSummaryCount
              label="Đã ra"
              value={shiftSummary.data?.data.issued ?? 0}
              tone="sky"
            />
            {(shiftSummary.data?.data.byRequestType ?? []).map((item) => {
              const label = item.requestType === "Môi Trường"
                ? section === "co" ? "Môi trường Cơ" : "Môi trường Điện"
                : item.requestType;
              return (
                <ShiftSummaryCount key={item.requestType} label={`Phiếu ${label}`} value={item.issued} tone="emerald" />
              );
            })}
            <ShiftSummaryCount
              label="Đã hủy"
              value={shiftSummary.data?.data.cancelled ?? 0}
              tone="red"
            />
          </div>
        )}
      </div>

      {deviceSeqFilter && (
        <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Đang lọc theo thiết bị</p>
            <p className="truncate font-semibold text-ink">
              {deviceDisplayName ?? "Thiết bị"}
              <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
                {scopeCode(deviceSeqFilter, parseScope(mappedUnitFilter || unitFilter))}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="bg-white">
              <Link href={`/devices/${encodeURIComponent(deviceSeqFilter)}?machine=${parseScope(mappedUnitFilter || unitFilter)}`}>
                Về lý lịch thiết bị
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.replace("/defects", { scroll: false })}>
              Bỏ lọc thiết bị
            </Button>
          </div>
        </div>
      )}

      {/* Thẻ KPI đứng trước thanh lọc: người dùng nhìn số liệu tổng quan rồi mới
          bấm thẻ để lọc, nên thứ tự này khớp với thao tác thực tế. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <DefectKpi label="Chưa thực hiện" value={chuaXuLy} icon={CircleDashed} tone="rose" active={statusFilter === "CHUA_XU_LY"} onClick={() => toggleStatus("CHUA_XU_LY")} />
        <DefectKpi label="Đang thực hiện" value={coPct} icon={Wrench} tone="sky" active={statusFilter === "CO_PCT"} onClick={() => toggleStatus("CO_PCT")} />
        <DefectKpi label="Chờ vật tư" value={choVatTu} icon={Package} tone="amber" active={statusFilter === "CHO_VAT_TU"} onClick={() => toggleStatus("CHO_VAT_TU")} />
        <DefectKpi label="Chờ ngừng máy" value={choNgungMay} icon={CirclePause} tone="orange" active={statusFilter === "CHO_NGUNG_MAY"} onClick={() => toggleStatus("CHO_NGUNG_MAY")} />
        <DefectKpi label="Chưa lưu lịch sử" value={tonDong} icon={CircleSlash} tone="violet" active={statusFilter === "TON_DONG"} onClick={() => toggleStatus("TON_DONG")} />
      </div>

      {!isLoading && scopeTotal > 0 && (
        <DefectFilterBar
          search={tableSearch}
          onSearchChange={setTableSearch}
          units={["ALL", "S1", "S2", "COMMON"]}
          unit={unitFilter}
          onUnitChange={(value) => setUnitFilter(value as typeof unitFilter)}
          dropdowns={[
            {
              label: "Yêu cầu",
              value: requestFilter,
              // Luôn phải có 1 loại yêu cầu (Cơ/Điện/… ) — không có mục "Tất cả".
              options: sectionConfig.requestTypes.map((type) => ({ value: type, label: type })),
              onChange: setRequestFilter,
            },
            {
              label: "Cương vị",
              value: positionFilter,
              options: positions.map((position) => ({ value: position, label: position })),
              allValue: "ALL",
              allLabel: "Tất cả cương vị",
              onChange: setPositionFilter,
            },
            {
              label: "Mức độ",
              value: severityFilter,
              options: DEFECT_SEVERITY_ORDER.map((s) => ({ value: s, label: DEFECT_SEVERITY[s] })),
              allValue: "ALL",
              allLabel: "Tất cả mức độ",
              onChange: setSeverityFilter,
            },
          ]}
          chips={activeFilterChips}
          total={total}
          scopeTotal={scopeTotal}
          mismatchOnly={mismatchOnly}
          onMismatchOnlyChange={setMismatchOnly}
          upgradeCandidatesOnly={upgradeCandidatesOnly}
          onUpgradeCandidatesOnlyChange={setUpgradeCandidatesOnly}
          upgradeCandidateTotal={data?.meta?.upgradeCandidateTotal ?? 0}
          showUpgradeCandidates={canManage && operationUpdateAvailable}
          canReset={isFiltered}
          onReset={resetFilters}
        />
      )}

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : total === 0 ? (
        scopeTotal === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Chưa có khiếm khuyết"
            description="Nhấn “Thêm mới” để ghi nhận khiếm khuyết thiết bị."
            action={canCreate && websiteCreateAvailable ? { label: "Thêm mới", onClick: openCreate } : undefined}
          />
        ) : (
          <EmptyState
            icon={ShieldAlert}
            title="Không có khiếm khuyết phù hợp"
            description="Không có khiếm khuyết nào khớp bộ lọc. Thử bỏ bớt điều kiện."
            action={{ label: "Xoá bộ lọc", onClick: resetFilters }}
          />
        )
      ) : (
        <Card className="overflow-hidden">
          <PersistentHorizontalScroll>
          <Table className="min-w-[1196px] table-fixed">
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                {/* Đủ chỗ cho nhãn dài nhất ("Common") nằm cùng hàng với nút mở chi tiết. */}
                <TableHead className="w-[76px] whitespace-nowrap px-1 text-center">Tổ máy</TableHead>
                <TableHead className="w-[96px] px-1.5 text-center">Số yêu cầu</TableHead>
                <TableHead className="w-[104px] px-1.5 text-center">Cương vị</TableHead>
                <TableHead className="w-[288px] px-2 text-center">Nội dung</TableHead>
                {/* Mức độ và Vận hành đã chuyển lên thanh lọc phía trên — tiêu đề cột
                    chỉ còn là nhãn, không kèm phễu lọc riêng nữa. */}
                <TableHead className="w-[68px] px-1 text-center">Mức độ</TableHead>
                <TableHead className="w-[112px] px-1 text-center">Vận hành</TableHead>
                <TableHead className="w-[120px] px-1.5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Sửa chữa</span>
                    <RepairResultColumnFilter
                      value={repairResultFilter}
                      options={Array.from(
                        new Set([...(data?.meta?.repairResults ?? []), ...(repairResultFilter !== "ALL" ? [repairResultFilter] : [])])
                      )}
                      onChange={setRepairResultFilter}
                    />
                  </div>
                </TableHead>
                <TableHead className="w-[64px] px-1 text-center">Nhắc lại</TableHead>
                <TableHead className="w-[84px] px-1 text-center">Phát hiện</TableHead>
                <TableHead className="w-[72px] px-1 text-center">Cập nhật</TableHead>
                <TableHead className="w-[112px] px-1 text-center">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedDefects.map((d) => {
                const expanded = expandedId === d.id;
                const awaitingHistoryConfirmation =
                  (d.sourceType === "GOOGLE_SHEETS" || d.websiteCreated) &&
                  !d.cancelledAt &&
                  !!d.deviceSeq &&
                  !d.pendingHistory &&
                  !d.postRepairAwaitingMaterial &&
                  d.syncState !== "CONFIRMED" &&
                  d.status === "DA_XU_LY";
                return (
                  <React.Fragment key={d.id}>
                    <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(expanded ? null : d.id)}>
                      <TableCell className="whitespace-nowrap px-1 py-3 text-[13px] font-semibold text-ink">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(expanded ? null : d.id);
                            }}
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-colors",
                              expanded ? "bg-rose-500" : "bg-emerald-500"
                            )}
                            title={expanded ? "Thu gọn" : "Mở chi tiết"}
                          >
                            {expanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                          </button>
                          {/* Phiếu dùng chung giữ nhãn nguồn BOP/CHUNG/ĐKTT; dữ liệu cũ
                              chưa có phân loại vẫn hiển thị Common. */}
                          <span className={cn(d.unit === "COMMON" && "text-[11px] tracking-tight")}>
                            {d.unit === "COMMON" ? d.commonSubUnit || "Common" : d.unit}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-1.5 py-3 text-center text-[13px] text-ink">
                        <div className="truncate" title={d.requestNumber ?? undefined}>{d.requestNumber || "—"}</div>
                        {/* Phiếu ra từ "Chi tiết điểm thay thế" của Danh mục vật tư. */}
                        {d.isMaterialRequest && (
                          <div className="mt-1 flex justify-center">
                            <span
                              className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-700 ring-1 ring-sky-200"
                              title="Số yêu cầu thay thế vật tư, tạo từ Danh mục vật tư"
                            >
                              SYC vật tư
                            </span>
                          </div>
                        )}
                        {d.sourceType === "GOOGLE_SHEETS" && (
                          <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Google Sheet</span>
                            {d.syncState === "MISSING" && (
                              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-700 ring-1 ring-rose-200">
                                Không còn nguồn
                              </span>
                            )}
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                                d.deviceSeq
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-orange-100 text-orange-700"
                              )}
                            >
                              {d.deviceSeq ? "Đã gắn thiết bị" : "Chưa gắn thiết bị"}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-1.5 py-3 text-center text-[13px] text-muted-foreground">
                        <div className="truncate" title={d.system ?? undefined}>{d.system ?? "—"}</div>
                      </TableCell>
                      <TableCell className="px-2 py-3 text-center text-[13px] text-ink">
                        <div className="whitespace-pre-wrap break-words text-left leading-6">
                          {d.content || "—"}
                        </div>
                        {awaitingHistoryConfirmation && (
                          <div
                            className="mt-2 flex items-center gap-1.5 text-left text-[11px] font-semibold leading-4 text-amber-700"
                            title="Phiếu đã xử lý và đã gắn thiết bị, đang chờ VHV xác nhận lưu lịch sử"
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                            Chưa xác nhận lưu lịch sử
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-1 py-3 text-center">
                        {d.severity ? (
                          <div className="flex items-center justify-center gap-1">
                            <span title={DEFECT_SEVERITY[d.severity as keyof typeof DEFECT_SEVERITY]} className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", SEVERITY_TONE[d.severity] ?? "bg-muted text-ink")}>{d.severity}</span>
                            {canManage && operationUpdateAvailable && d.severity2UpgradeCandidate && (
                              <button
                                type="button"
                                title="Phiếu đủ điều kiện xem xét nâng lên Mức 2"
                                aria-label="Xem xét nâng khiếm khuyết lên Mức 2"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setUpgradeTarget(d);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                              >
                                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.75} />
                              </button>
                            )}
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="px-1 py-3 text-center">
                        {d.cancelledAt ? (
                          <span
                            className="inline-flex rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800 ring-1 ring-rose-200"
                            title="Phiếu đã hủy và đang chờ ghi ngược trạng thái lên Google Sheet"
                          >
                            Đã hủy · Chờ đồng bộ
                          </span>
                        ) : d.syncState === "MISSING" ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800 ring-1 ring-rose-200"
                            title="Dòng dữ liệu này không còn xuất hiện trong lần đồng bộ Google Sheet gần nhất"
                          >
                            <CloudOff className="h-3.5 w-3.5" />
                            Không còn trên Google Sheet
                          </span>
                        ) : d.pendingHistory ? (
                          <span
                            className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-200"
                            title={`Hệ thống sẽ chốt lịch sử vào ${formatDate(d.pendingHistory.finalizeAt)}`}
                          >
                            Chờ chốt lịch sử · {formatDate(d.pendingHistory.finalizeAt)}
                          </span>
                        ) : d.postRepairAwaitingMaterial ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                            Đã xử lý · Chờ vật tư
                          </span>
                        ) : (
                          <DefectStatusBadge status={d.status} />
                        )}
                      </TableCell>
                      <TableCell className="px-1.5 py-3 text-center text-[12px]">
                        {d.repairResultRaw ? (
                          <span
                            className={cn(
                              "inline-flex max-w-full rounded-lg px-2 py-1 font-semibold leading-4",
                              d.sourceStatusMismatch
                                ? "bg-red-100 text-red-700 ring-1 ring-red-200"
                                : "bg-emerald-50 text-emerald-700"
                            )}
                            title={d.sourceStatusMismatch
                              ? `Kết quả sửa chữa không khớp tình trạng hiện tại: ${d.sourceStatusRaw || "—"}`
                              : d.repairResultRaw}
                          >
                            <span className="line-clamp-2">{d.repairResultRaw}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-1 py-3 text-center text-[13px]">
                        <span className={cn("font-semibold", d.reminderCount > 0 ? "text-amber-700" : "text-muted-foreground")}>
                          {d.reminderCount} lần
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-1 py-3 text-center text-[12px] text-muted-foreground">{formatDate(d.detectedAt)}</TableCell>
                      <TableCell className="px-1 py-3 text-center">
                        <DefectUserAvatar user={d.createdBy} />
                      </TableCell>
                      <TableCell className="px-1 py-3">
                        <div className="flex items-center justify-center gap-0">
                          {canClose && awaitingHistoryConfirmation && (
                            <Button
                              disabled={detailLoadingId === d.id}
                              title="Lưu lịch sử"
                              className="h-auto min-h-8 max-w-[104px] whitespace-normal !bg-amber-500 px-2 py-1.5 text-[10.5px] font-bold leading-3.5 text-white shadow-sm hover:!bg-amber-600 focus-visible:ring-amber-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openComplete(d);
                              }}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              <span>Lưu lịch sử</span>
                            </Button>
                          )}
                          {canClose && d.sourceType !== "GOOGLE_SHEETS" && !d.websiteCreated && d.status !== "DA_XU_LY" && (
                            <Button
                              disabled={detailLoadingId === d.id}
                              variant="ghost"
                              size="icon"
                              title="Hoàn thành khiếm khuyết"
                              aria-label="Hoàn thành khiếm khuyết"
                              className="h-7 w-7 text-muted-foreground hover:bg-green-50 hover:text-green-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openComplete(d);
                              }}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}
                          {canManage && websiteRemindAvailable && (d.sourceType !== "GOOGLE_SHEETS" || d.websiteCreated || !!d.deviceSeq) && d.status !== "DA_XU_LY" && (
                            <Button variant="ghost" size="icon" title="Nhắc lại" className="h-7 w-7 text-muted-foreground hover:bg-amber-50 hover:text-amber-700" onClick={(e) => { e.stopPropagation(); setRemindShiftLeaderId(""); setRemindTarget(d); }}><BellRing className="h-4 w-4" /></Button>
                          )}
                          {canClose && d.pendingHistory && (
                            <Button
                              disabled={detailLoadingId === d.id}
                              variant="ghost"
                              size="icon"
                              title="Sửa thông tin lịch sử"
                              aria-label="Sửa thông tin lịch sử"
                              className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openComplete(d);
                              }}
                            >
                              <FileClock className="h-4 w-4" />
                            </Button>
                          )}
                          {canManage && (
                            operationUpdateAvailable
                            || (d.sourceType === "GOOGLE_SHEETS" && !d.websiteCreated)
                          ) && (
                            <Button
                              disabled={detailLoadingId === d.id}
                              variant="ghost"
                              size="icon"
                              title={
                                d.sourceType === "GOOGLE_SHEETS" && !d.websiteCreated
                                  ? operationUpdateAvailable
                                    ? "Gắn thiết bị / cập nhật Vận hành"
                                    : "Gắn thiết bị"
                                  : "Sửa"
                              }
                              className="h-7 w-7"
                              onClick={(e) => { e.stopPropagation(); void openEdit(d); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canManage && operationUpdateAvailable && !d.cancelledAt && !d.pendingHistory && d.status !== "DA_XU_LY" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Hủy phiếu"
                              aria-label="Hủy phiếu"
                              className="h-7 w-7 text-muted-foreground hover:bg-red-50 hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelNote("Vận hành hủy phiếu");
                                setCancelTarget(d);
                              }}
                            >
                              <CircleX className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={11} className="px-6 py-4">
                          <DefectExpandedDetailsById id={d.id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
          </PersistentHorizontalScroll>
          <div className="flex flex-col gap-3 border-t border-border p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div>
              Hiển thị {firstShown}-{lastShown} trong tổng số {total} bản ghi
              {isFiltered && <span> sau lọc</span>}
              {isFetching && <span className="ml-2 text-blue-600">· Đang cập nhật…</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:ml-auto">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Hiển thị</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-8 rounded-md border border-input bg-white px-2 text-sm font-medium text-ink"
                  aria-label="Số dòng mỗi trang"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>dòng</span>
              </div>
              <PageButton icon={ChevronsLeft} label="Trang đầu" disabled={page <= 1} onClick={() => setPage(1)} />
              <PageButton icon={ChevronLeft} label="Trang trước" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} />
              <span className="mx-2 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-ink">
                {page}/{totalPages}
              </span>
              <PageButton icon={ChevronRight} label="Trang sau" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} />
              <PageButton icon={ChevronsRight} label="Trang cuối" disabled={page >= totalPages} onClick={() => setPage(totalPages)} />
            </div>
          </div>
        </Card>
      )}

      {/* Panel nhập khiếm khuyết (trượt từ phải) */}
      {formOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setFormOpen(false)} />
          <div className={cn(
            "absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-xl transition-[width,max-width] duration-300 animate-in slide-in-from-right",
            formHasDeviceHistory && "xl:w-[min(1500px,calc(100vw-3rem))] xl:max-w-none"
          )}>
            <div className="flex items-center gap-2 border-b border-border p-4">
              <button onClick={() => setFormOpen(false)} className="rounded-md p-1.5 hover:bg-muted" aria-label="Đóng"><X className="h-5 w-5" /></button>
              <h2 className="text-lg font-bold text-ink">
                {editTarget?.sourceType === "GOOGLE_SHEETS" && !editTarget.websiteCreated ? "Gắn thiết bị & cập nhật Vận hành" : editTarget ? "Sửa khiếm khuyết" : "Nhập khiếm khuyết"}
              </h2>
            </div>
            <DefectForm
              defect={editTarget}
              section={section}
              showDeviceHistory
              onDeviceHistoryVisibilityChange={setFormHasDeviceHistory}
              onDone={() => setFormOpen(false)}
              onMappingSaved={(updated) => {
                setFormOpen(false);
                setEditTarget(null);
                if (updated.status === "DA_XU_LY" && !updated.pendingHistory && !updated.postRepairAwaitingMaterial && updated.syncState !== "CONFIRMED") {
                  setCompleteTarget(updated);
                }
              }}
              onCancel={() => setFormOpen(false)}
            />
          </div>
        </div>
      )}

      <CompleteDefectDialog defect={completeTarget} onClose={() => setCompleteTarget(null)} />
      <SeverityUpgradeDialog target={upgradeTarget} onClose={() => setUpgradeTarget(null)} />

      <ConfirmDialog
        open={!!remindTarget}
        onOpenChange={(open) => !open && setRemindTarget(null)}
        title="Xác nhận nhắc lại?"
        description={remindTarget
          ? `Ghi nhận lần nhắc thứ ${remindTarget.reminderCount + 1}${remindTarget.requestNumber ? ` cho yêu cầu “${remindTarget.requestNumber}”` : ""}.`
          : undefined}
        confirmLabel="Nhắc lại"
        destructive={false}
        loading={remind.isPending}
        onConfirm={async () => {
          if (!remindTarget) return;
          if (!remindShiftLeaderId) {
            toast.error("Vui lòng chọn Trưởng ca cho lần nhắc lại");
            return;
          }
          try {
            const updated = await remind.mutateAsync({ id: remindTarget.id, shiftLeaderId: remindShiftLeaderId });
            toast.success(`Đã ghi nhận nhắc lại lần ${updated.reminderCount}`);
            setRemindTarget(null);
            setRemindShiftLeaderId("");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Trưởng ca <span className="text-destructive">*</span></label>
          <Select value={remindShiftLeaderId} onValueChange={setRemindShiftLeaderId}>
            <SelectTrigger><SelectValue placeholder="Chọn Trưởng ca" /></SelectTrigger>
            <SelectContent>
              {shiftLeaders.map((leader) => (
                <SelectItem key={leader.id} value={leader.id}>{leader.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelNote("Vận hành hủy phiếu");
          }
        }}
        title="Hủy phiếu khiếm khuyết?"
        description={cancelTarget
          ? `Phiếu${cancelTarget.requestNumber ? ` “${cancelTarget.requestNumber}”` : ""} sẽ được hủy trên website và xóa dữ liệu phiếu vừa ra trên Google Sheet.`
          : undefined}
        confirmLabel="Hủy phiếu"
        loading={cancelDefect.isPending}
        onConfirm={async () => {
          if (!cancelTarget) return;
          if (!cancelNote.trim()) {
            toast.error("Vui lòng nhập ghi chú khi hủy phiếu");
            return;
          }
          try {
            const updated = await cancelDefect.mutateAsync({
              id: cancelTarget.id,
              note: cancelNote.trim(),
            });
            toast.success(
              updated.syncState === "CONFIRMED"
                ? "Đã hủy phiếu"
                : "Đã hủy phiếu, đang chờ đồng bộ lên Google Sheet"
            );
            setCancelTarget(null);
            setCancelNote("Vận hành hủy phiếu");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-950">
            <p className="font-semibold">Google Sheet sẽ được làm sạch khi đồng bộ</p>
            <p className="mt-1 text-xs text-amber-800">
              Hệ thống xóa nội dung phiếu từ cột B đến O nhưng vẫn giữ STT ở cột A để cấp cho phiếu khác.
            </p>
          </div>
          <label htmlFor="cancel-defect-note" className="text-sm font-medium">
            Ghi chú hủy <span className="text-destructive">*</span>
          </label>
          <Textarea
            id="cancel-defect-note"
            value={cancelNote}
            onChange={(event) => setCancelNote(event.target.value)}
            rows={3}
            placeholder="Nhập lý do hủy phiếu…"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Phiếu vẫn được lưu dấu vết hủy trên website để phục vụ tra cứu và kiểm tra.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function PageButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// Màu mức độ khiếm khuyết: 1 đỏ · 2 cam · 3 vàng · 4 xám.
const SEVERITY_TONE: Record<string, string> = {
  "1": "bg-red-100 text-red-700",
  "2": "bg-orange-100 text-orange-700",
  "3": "bg-yellow-100 text-yellow-800",
  "4": "bg-gray-100 text-gray-600",
};


function DefectUserAvatar({ user }: { user?: DefectItem["createdBy"] | null }) {
  if (!user) return <span className="text-sm text-muted-foreground">—</span>;

  return (
    <div
      className="flex justify-center"
      title={`${user.name}${user.position ? ` · ${user.position}` : ""}`}
      aria-label={`Người cập nhật khiếm khuyết gần nhất: ${user.name}`}
    >
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

const KPI_TONES = {
  rose: { bg: "from-rose-50 to-rose-100", num: "text-rose-600", icon: "text-rose-400", shadow: "shadow-rose-500/25 hover:shadow-rose-500/40" },
  sky: { bg: "from-sky-50 to-sky-100", num: "text-sky-600", icon: "text-sky-400", shadow: "shadow-sky-500/25 hover:shadow-sky-500/40" },
  amber: { bg: "from-amber-50 to-amber-100", num: "text-amber-600", icon: "text-amber-400", shadow: "shadow-amber-500/25 hover:shadow-amber-500/40" },
  orange: { bg: "from-orange-50 to-orange-100", num: "text-orange-700", icon: "text-orange-500", shadow: "shadow-orange-500/25 hover:shadow-orange-500/40" },
  green: { bg: "from-emerald-50 to-emerald-100", num: "text-emerald-700", icon: "text-emerald-500", shadow: "shadow-emerald-500/25 hover:shadow-emerald-500/40" },
  violet: { bg: "from-violet-50 to-violet-100", num: "text-violet-600", icon: "text-violet-400", shadow: "shadow-violet-500/25 hover:shadow-violet-500/40" },
} as const;

function RepairResultColumnFilter({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const active = value !== "ALL";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Lọc theo kết quả sửa chữa"
          title={active ? `Đang lọc: ${value}` : "Lọc theo kết quả sửa chữa"}
          className={cn(
            "flex h-6 w-7 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
            active
              ? "border-blue-300 bg-blue-100 text-accent shadow-sm"
              : "border-border bg-white text-muted-foreground hover:border-blue-300 hover:bg-blue-50 hover:text-accent"
          )}
        >
          <Filter className="h-3.5 w-3.5" fill={active ? "currentColor" : "none"} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="max-h-[320px] w-[280px] overflow-y-auto">
        <DropdownMenuLabel>Kết quả sửa chữa</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange("ALL")} className="gap-2">
          <Check className={cn("h-4 w-4", value === "ALL" ? "opacity-100" : "opacity-0")} />
          Tất cả kết quả sửa chữa
        </DropdownMenuItem>
        {options.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onChange(option)} className="gap-2">
            <Check className={cn("h-4 w-4 shrink-0", value === option ? "opacity-100" : "opacity-0")} />
            <span className="whitespace-normal">{option}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SeverityUpgradeDialog({
  target,
  onClose,
}: {
  target: DefectItem | null;
  onClose: () => void;
}) {
  const update = useUpdateDefect();
  const [criteria, setCriteria] = React.useState<string[]>(["2a"]);
  const options = DEFECT_SEVERITY_CRITERIA["2"].options;

  React.useEffect(() => {
    if (target) setCriteria(["2a"]);
  }, [target]);

  function toggleCriterion(id: string) {
    setCriteria((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function confirmUpgrade() {
    if (!target) return;
    if (criteria.length === 0) {
      toast.error("Vui lòng chọn ít nhất 1 tiêu chí Mức 2");
      return;
    }
    try {
      await update.mutateAsync({
        id: target.id,
        severity: "2",
        severityCriteria: criteria,
      });
      toast.success(`Đã nâng phiếu${target.requestNumber ? ` ${target.requestNumber}` : ""} lên Mức 2`);
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <ArrowUp className="h-4 w-4" strokeWidth={2.75} />
            </span>
            Xem xét nâng lên Mức 2
          </DialogTitle>
          <DialogDescription>
            Phiếu đủ điều kiện gợi ý; người có quyền xác nhận mức độ phù hợp.
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-center">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Mức hiện tại</div>
                <div className="mt-1 text-xl font-black text-amber-900">Mức {target.severity}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Sau nhắc lần 2</div>
                <div className="mt-1 text-xl font-black text-amber-900">{target.severityUpgradeWaitingDays ?? 0} ngày</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Đã nhắc</div>
                <div className="mt-1 text-xl font-black text-amber-900">{target.reminderCount} lần</div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink">Tiêu chí Mức 2</span>
                <span className="text-xs font-semibold text-rose-700">Chọn ít nhất 1 tiêu chí</span>
              </div>
              <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                {options.map((option) => {
                  const checked = criteria.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleCriterion(option.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        checked
                          ? "border-blue-300 bg-blue-50 text-ink"
                          : "border-border bg-white text-ink hover:bg-muted/50"
                      )}
                    >
                      <span className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                        checked ? "border-navy bg-navy text-white" : "border-input bg-white text-transparent"
                      )}>
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Để sau</Button>
          <Button
            onClick={confirmUpgrade}
            disabled={update.isPending}
            className="bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500"
          >
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            Xác nhận nâng Mức 2
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShiftSummaryCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sky" | "emerald" | "red";
}) {
  const styles = {
    sky: "border-sky-200 text-sky-700",
    emerald: "border-emerald-200 text-emerald-700",
    red: "border-red-200 text-red-600",
  }[tone];
  return (
    <div className={cn("min-w-[96px] rounded-lg border bg-white px-3 py-2", styles)}>
      <p className="text-xl font-extrabold tabular-nums">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">{label}</p>
    </div>
  );
}

/**
 * KPI card 3D: nghiêng theo con trỏ (perspective tilt), phân lớp chiều sâu
 * (số & icon nổi lên bằng translateZ), bóng màu + lớp bóng kính.
 */
function DefectKpi({ value, label, icon: Icon, tone, active, onClick }: { value: number; label: string; icon: any; tone: keyof typeof KPI_TONES; active?: boolean; onClick?: () => void }) {
  const t = KPI_TONES[tone];
  const ref = React.useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = React.useState("perspective(900px)");

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (0.5 - py) * 9;
    const ry = (px - 0.5) * 11;
    setTilt(`perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(1.035)`);
  }

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } }}
      onMouseMove={onMove}
      onMouseLeave={() => setTilt("perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)")}
      style={{ transform: tilt, transformStyle: "preserve-3d" }}
      className={cn(
        "group relative flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-gradient-to-br px-6 py-5 shadow-lg ring-1 transition-[transform,box-shadow] duration-200 will-change-transform hover:shadow-2xl focus:outline-none",
        t.bg,
        t.shadow,
        active ? "ring-2 ring-navy ring-offset-2" : "ring-white/60"
      )}
    >
      {/* lớp bóng kính ở trên */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/60 via-transparent to-transparent opacity-70" />
      <div className="relative min-w-0" style={{ transform: "translateZ(28px)" }}>
        <div className={cn("text-[42px] font-extrabold leading-none tracking-tight", t.num)} style={{ textShadow: "0 2px 4px rgba(0,0,0,0.08)" }}>
          {value}
        </div>
        <div className="mt-2.5 truncate text-sm font-semibold text-muted-foreground">{label}</div>
      </div>
      <Icon
        className={cn("relative h-16 w-16 shrink-0 drop-shadow-md transition-transform duration-200 group-hover:scale-110", t.icon)}
        strokeWidth={1.5}
        style={{ transform: "translateZ(48px)" }}
      />
    </div>
  );
}

function DefectStatusBadge({ status }: { status: string }) {
  const meta = DEFECT_STATUS[status as keyof typeof DEFECT_STATUS];
  if (!meta) return <span className="text-xs">{status}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", meta.badge)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}
