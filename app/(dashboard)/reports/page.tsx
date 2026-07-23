"use client";

import * as React from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Box,
  CalendarClock,
  CheckCircle2,
  Factory,
  Gauge,
  Layers3,
  PackageCheck,
  ShieldAlert,
  TimerReset,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { PeakProtectedRoute } from "@/components/shared/peak-protected-route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDefectHistory } from "@/hooks/useDefectHistory";
import { useDefects } from "@/hooks/useDefects";
import { useDevices } from "@/hooks/useDevices";
import { useMaterials } from "@/hooks/useMaterials";
import { usePositionSystemScopes } from "@/hooks/usePositionSystemScopes";
import { useReplacements } from "@/hooks/useReplacements";
import { usePositions } from "@/hooks/useUsers";
import { DEFECT_REQUEST_TYPES, daysUntilDue, replacementDueStatus } from "@/lib/constants";
import { selectableManagingPositionOptions } from "@/lib/positions";
import { normalizePositionScopeKey, normalizeScopeAccess, positionScopeOptions, scopesForPosition } from "@/lib/position-system-scopes";
import { cn, dateRange, formatDate } from "@/lib/utils";

const CHART_COLORS = ["#1E3A5F", "#0EA5E9", "#14B8A6", "#F59E0B", "#EF4444", "#64748B"];
const DUYEN_HAI_3D_MODEL_URL =
  "https://sketchfab.com/models/bdc122add7754c989a976fdd5b01012d/embed";

type DeviceSignalRow = {
  code: string;
  name: string;
  system: string;
  managingPosition: string;
  repairCount: number;
  openDefectCount: number;
  replacementWarn: number;
  signalTotal: number;
  riskScore: number;
  recommendation: string;
};

export default function ReportsPage() {
  return (
    <PeakProtectedRoute>
      <ReportsPageContent />
    </PeakProtectedRoute>
  );
}

function ReportsPageContent() {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [systemPositionFilter, setSystemPositionFilter] = React.useState("ALL");
  const [trendRequestFilter, setTrendRequestFilter] = React.useState("ALL");
  const [repairYearFilter, setRepairYearFilter] = React.useState(() => String(new Date().getFullYear()));

  const dateRange = React.useMemo(() => makeDateRange(from, to), [from, to]);
  const devicesQuery = useDevices({});
  const defectsQuery = useDefects();
  const historyQuery = useDefectHistory({ from: from || undefined, to: to || undefined });
  const replacementsQuery = useReplacements({});
  // Reports cần cả lịch sử tiêu hao theo thiết bị (deviceMaterials) — opt-in để
  // trang Danh mục vật tư (không cần) nhận payload nhẹ hơn.
  const materialsQuery = useMaterials({ includeUsage: true });
  const scopesQuery = usePositionSystemScopes();
  const allPositions = usePositions();

  const devices = devicesQuery.data?.data ?? [];
  const defects = defectsQuery.data?.data ?? [];
  const defectHistory = historyQuery.data?.data ?? [];
  const replacements = replacementsQuery.data?.data ?? [];
  const materials = materialsQuery.data?.data ?? [];
  const positionScopes = scopesQuery.data?.data ?? [];
  const dashboardPositionOptions = React.useMemo(
    () => positionScopeOptions(selectableManagingPositionOptions(allPositions)),
    [allPositions]
  );
  const allowedDeviceCodesByPosition = React.useMemo(() => {
    const result = new Map<string, Set<string>>();
    for (const position of dashboardPositionOptions) {
      const allowed = new Set<string>();
      const explicitScopes = scopesForPosition(positionScopes, position);
      const normalizedPosition = normalizePositionScopeKey(position);

      if (!explicitScopes.length) {
        for (const device of devices) {
          if (!device.managingPosition || normalizePositionScopeKey(device.managingPosition) === normalizedPosition) {
            allowed.add(device.code);
          }
        }
        result.set(position, allowed);
        continue;
      }

      const accessBySeq = new Map(explicitScopes.map((scope) => [scope.systemSeq, normalizeScopeAccess(scope.access)] as const));
      for (const device of devices) {
        let current: string | null | undefined = device.code;
        while (current) {
          if (accessBySeq.has(current)) {
            if (accessBySeq.get(current) !== "none") allowed.add(device.code);
            break;
          }
          const dot = current.lastIndexOf(".");
          current = dot > 0 ? current.slice(0, dot) : null;
        }
      }
      result.set(position, allowed);
    }
    return result;
  }, [dashboardPositionOptions, devices, positionScopes]);
  const totalSystemDevices = Number(devicesQuery.data?.meta?.totalSystemDevices ?? devices.length);
  const isLoading =
    devicesQuery.isLoading ||
    defectsQuery.isLoading ||
    historyQuery.isLoading ||
    replacementsQuery.isLoading ||
    materialsQuery.isLoading ||
    scopesQuery.isLoading;

  React.useEffect(() => {
    if (systemPositionFilter === "ALL") return;
    if (!dashboardPositionOptions.includes(systemPositionFilter)) setSystemPositionFilter("ALL");
  }, [dashboardPositionOptions, systemPositionFilter]);

  const dashboard = React.useMemo(() => {
    const deviceByCode = new Map(devices.map((device) => [device.code, device]));
    const systems = unique(devices.map((device) => device.system).filter(Boolean) as string[]);
    const positions = dashboardPositionOptions;
    const matchesPosition = (device: { code: string; system?: string | null; systemSeq?: string | null; managingPosition?: string | null }) =>
      systemPositionFilter === "ALL" ||
      (allowedDeviceCodesByPosition.get(systemPositionFilter)?.has(device.code) ?? false);
    const systemChartDevices =
      systemPositionFilter === "ALL"
        ? devices
        : devices.filter(matchesPosition);
    const systemChartDeviceCodes = new Set(systemChartDevices.map((device) => device.code));
    const systemChartSystems = unique(systemChartDevices.map((device) => device.system).filter(Boolean) as string[]);
    const visibleDefects = defects.filter((defect) => inDateRange(defect.detectedAt ?? defect.createdAt, dateRange));
    const openDefects = defects.filter((defect) => defect.status !== "DA_XU_LY");
    const urgentDefects = openDefects.filter((defect) => defect.severity === "1" || defect.severity === "2");
    const totalMaterialQuantity = materials.reduce((sum, material) => sum + Number(material.quantity || 0), 0);
    // Số cương vị (chức vụ quản lý) xuất hiện trong danh mục vật tư — lấy từ thiết bị liên kết.
    const materialPositions = unique(
      materials
        .flatMap((material) => (material.deviceMaterials ?? []).map((dm) => dm.device?.managingPosition))
        .filter(Boolean) as string[]
    );

    const dueGroups = replacements.reduce(
      (acc, item) => {
        const status = replacementDueStatus(item.nextDueAt);
        acc[status] += 1;
        return acc;
      },
      { OVERDUE: 0, DUE_SOON: 0, OK: 0 }
    );

    const systemRows = systemChartSystems
      .map((system) => {
        const deviceCount = systemChartDevices.filter((device) => device.system === system).length;
        const openDefectCount = openDefects.filter((defect) => {
          const device = deviceByCode.get(defect.device ?? "");
          return device?.system === system && systemChartDeviceCodes.has(device.code);
        }).length;
        const replacementWarn = replacements.filter((item) => {
          const linkedDevice = item.device ?? item.material.deviceMaterials?.[0]?.device ?? null;
          const itemSystem = linkedDevice?.system ?? item.system ?? item.material.system;
          const matchPosition = matchesPosition(linkedDevice ?? { code: "", system: itemSystem ?? null });
          return itemSystem === system && matchPosition && replacementDueStatus(item.nextDueAt) !== "OK";
        }).length;
        return { name: system, devices: deviceCount, defects: openDefectCount, warning: replacementWarn };
      })
      .sort((a, b) => b.devices - a.devices)
      .slice(0, 8);

    const positionRows = positions
      .map((position) => ({
        name: position,
        value: allowedDeviceCodesByPosition.get(position)?.size ?? 0,
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const statusRows = [
      { name: "Chưa xử lý", value: visibleDefects.filter((defect) => defect.status === "CHUA_XU_LY").length },
      { name: "Có PCT", value: visibleDefects.filter((defect) => defect.status === "CO_PCT").length },
      { name: "Chờ vật tư", value: visibleDefects.filter((defect) => defect.status === "CHO_VAT_TU").length },
      { name: "Đã xử lý", value: visibleDefects.filter((defect) => defect.status === "DA_XU_LY").length },
    ].filter((row) => row.value > 0);

    const repairCountByDevice = new Map<string, number>();
    defectHistory.forEach((row) => {
      if (!row.device) return;
      repairCountByDevice.set(row.device, (repairCountByDevice.get(row.device) ?? 0) + 1);
    });

    const allDeviceSignalRows = devices
      .map((device) => {
        const repairCount = repairCountByDevice.get(device.code) ?? device._count?.repairLogs ?? 0;
        const openDefectCount = openDefects.filter((defect) => defect.device === device.code).length;
        const replacementWarn = replacements.filter(
          (item) => item.device?.code === device.code && replacementDueStatus(item.nextDueAt) !== "OK"
        ).length;
        const riskScore = repairCount + openDefectCount * 3 + replacementWarn * 2;
        return {
          code: device.code,
          name: device.name,
          system: device.system ?? "Chưa phân hệ",
          managingPosition: device.managingPosition ?? "Chưa gán",
          repairCount,
          openDefectCount,
          replacementWarn,
          signalTotal: repairCount + openDefectCount + replacementWarn,
          riskScore,
          recommendation:
            openDefectCount > 0
              ? "Ưu tiên xử lý khiếm khuyết"
              : replacementWarn > 0
                ? "Theo dõi vật tư đến hạn"
                : repairCount > 1
                  ? "Rà soát lặp lại sửa chữa"
                  : repairCount > 0
                    ? "Theo dõi sau sửa chữa"
                    : "Ổn định",
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore || b.signalTotal - a.signalTotal);
    const deviceSignalRows = allDeviceSignalRows
      .filter((device) => device.signalTotal > 0)
      .slice(0, 8);
    const defectChartRows = [...deviceSignalRows]
      .filter((device) => device.openDefectCount > 0)
      .sort((a, b) => b.openDefectCount - a.openDefectCount)
      .slice(0, 8);
    const replacementChartRows = [...deviceSignalRows]
      .filter((device) => device.replacementWarn > 0)
      .sort((a, b) => b.replacementWarn - a.replacementWarn)
      .slice(0, 8);

    const upcomingReplacements = replacements
      .map((item) => ({
        id: item.id,
        material: item.material.name,
        device: item.device ? `${item.device.code} - ${item.device.name}` : "Chưa gắn thiết bị",
        system: item.device?.system ?? item.system ?? item.material.system ?? "Chưa phân hệ",
        nextDueAt: item.nextDueAt,
        daysLeft: daysUntilDue(item.nextDueAt),
        status: replacementDueStatus(item.nextDueAt),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 6);

    // Xu hướng theo tháng (năm hiện tại): khiếm khuyết phát hiện vs lượt xử lý.
    const currentYear = new Date().getFullYear();
    const monthlyTrend = Array.from({ length: 12 }, (_, i) => ({ month: `Th${i + 1}`, detected: 0, handled: 0 }));
    const trendDefects =
      trendRequestFilter === "ALL" ? defects : defects.filter((defect) => defect.requestType === trendRequestFilter);
    const trendDefectHistory =
      trendRequestFilter === "ALL" ? defectHistory : defectHistory.filter((row) => row.requestType === trendRequestFilter);
    trendDefects.forEach((defect) => {
      const raw = defect.detectedAt ?? defect.createdAt;
      const date = raw ? new Date(raw) : null;
      if (date && !Number.isNaN(date.getTime()) && date.getFullYear() === currentYear) monthlyTrend[date.getMonth()].detected += 1;
    });
    trendDefectHistory.forEach((row) => {
      const date = row.performedAt ? new Date(row.performedAt) : null;
      if (date && !Number.isNaN(date.getTime()) && date.getFullYear() === currentYear) monthlyTrend[date.getMonth()].handled += 1;
    });
    const hasMonthlyTrend = monthlyTrend.some((m) => m.detected > 0 || m.handled > 0);

    // Lượt sửa chữa theo năm (từ lịch sử xử lý khiếm khuyết).
    const yearMap = new Map<number, number>();
    defectHistory.forEach((row) => {
      const date = row.performedAt ? new Date(row.performedAt) : null;
      if (date && !Number.isNaN(date.getTime())) yearMap.set(date.getFullYear(), (yearMap.get(date.getFullYear()) ?? 0) + 1);
    });
    const selectedRepairYear = Number(repairYearFilter) || currentYear;
    const repairYearOptions = Array.from(new Set([currentYear, selectedRepairYear, ...Array.from(yearMap.keys())]))
      .filter((year) => Number.isFinite(year))
      .sort((a, b) => b - a)
      .map(String);
    const selectedYearRepairs = yearMap.get(selectedRepairYear) ?? 0;
    const yearlyTrend = selectedYearRepairs > 0 ? [{ year: String(selectedRepairYear), repairs: selectedYearRepairs }] : [];

    return {
      systems,
      positions,
      openDefects,
      urgentDefects,
      totalMaterialQuantity,
      materialPositionCount: materialPositions.length,
      dueGroups,
      systemRows,
      positionRows,
      statusRows,
      deviceSignalRows,
      defectChartRows,
      replacementChartRows,
      upcomingReplacements,
      currentYear,
      monthlyTrend,
      hasMonthlyTrend,
      repairYearOptions,
      yearlyTrend,
    };
  }, [allowedDeviceCodesByPosition, dashboardPositionOptions, dateRange, defectHistory, defects, devices, materials, replacements, repairYearFilter, systemPositionFilter, trendRequestFilter]);

  return (
    <div className="space-y-5 print:space-y-4">
      <PageHeader
        title="DASHBOARD QUẢN LÝ THIẾT BỊ"
        description="Tổng quan tài sản, khiếm khuyết, lịch sửa chữa và cảnh báo vật tư thay thế"
      >
        <Button asChild className="h-9 rounded-lg px-3 text-white">
          <a href={DUYEN_HAI_3D_MODEL_URL} target="_blank" rel="noopener noreferrer">
            <Box className="h-4 w-4" />
            Mô phỏng 3D Duyên Hải 1
          </a>
        </Button>
      </PageHeader>

      <Card className="no-print overflow-x-auto border-slate-200 bg-white p-2">
        <div className="flex min-w-full items-center gap-3 whitespace-nowrap">
          <div className="inline-flex shrink-0 items-center gap-2">
            <label className="shrink-0 text-xs font-semibold text-muted-foreground">Từ ngày:</label>
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-9 w-40 shrink-0 rounded-lg bg-white text-sm shadow-none"
            />
          </div>
          <div className="inline-flex shrink-0 items-center gap-2">
            <label className="shrink-0 text-xs font-semibold text-muted-foreground">Đến ngày:</label>
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-9 w-40 shrink-0 rounded-lg bg-white text-sm shadow-none"
            />
          </div>
          <div className="ml-auto inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
            Phạm vi lọc áp dụng cho khiếm khuyết và lịch sử sửa chữa
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Factory}
          label="Tổng thiết bị"
          value={totalSystemDevices}
          detail={`${dashboard.systems.length} hệ thống · ${dashboard.positions.length} cương vị`}
          tone="blue"
          loading={isLoading}
          href="/devices"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Khiếm khuyết đang tồn đọng"
          value={dashboard.openDefects.length}
          detail={`${dashboard.urgentDefects.length} mức ưu tiên cao`}
          tone="red"
          loading={isLoading}
          href="/defects"
        />
        <MetricCard
          icon={CalendarClock}
          label="Cảnh báo thay thế"
          value={dashboard.dueGroups.OVERDUE + dashboard.dueGroups.DUE_SOON}
          detail={`${dashboard.dueGroups.OVERDUE} quá hạn · ${dashboard.dueGroups.DUE_SOON} sắp đến hạn`}
          tone="amber"
          loading={isLoading}
          href="/replacements"
        />
        <MetricCard
          icon={PackageCheck}
          label="Số lượng vật tư"
          value={materials.length}
          detail={`${dashboard.materialPositionCount} cương vị quản lý`}
          tone="green"
          loading={isLoading}
          href="/materials"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_0.9fr]">
        <Card>
          <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-blue-600" />
              Tình trạng thiết bị theo hệ thống
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">Cương vị</span>
              <Select value={systemPositionFilter} onValueChange={setSystemPositionFilter}>
                <SelectTrigger className="h-9 w-full min-w-[180px] sm:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả cương vị</SelectItem>
                  {dashboard.positions.map((position) => (
                    <SelectItem key={position} value={position}>
                      {position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : dashboard.systemRows.length ? (
              <div className="h-[310px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard.systemRows} margin={{ top: 10, right: 20, left: 4, bottom: 8 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={54} angle={-15} textAnchor="end" />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip content={<DashboardTooltip />} />
                    <Bar dataKey="devices" name="Thiết bị" fill="#1E3A5F" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="defects" name="Khiếm khuyết mở" fill="#EF4444" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="warning" name="Cảnh báo thay thế" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyPanel text="Chưa có dữ liệu hệ thống thiết bị" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers3 className="h-4 w-4 text-teal-600" />
              Phân bổ thiết bị theo cương vị
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : dashboard.positionRows.length ? (
              <div className="grid gap-4 lg:grid-cols-[180px_1fr] xl:grid-cols-1 2xl:grid-cols-[180px_1fr]">
                <div className="h-[210px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={dashboard.positionRows} dataKey="value" nameKey="name" innerRadius={46} outerRadius={82} paddingAngle={3}>
                        {dashboard.positionRows.map((_, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<DashboardTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {dashboard.positionRows.map((row, index) => (
                    <LegendRow key={row.name} color={CHART_COLORS[index % CHART_COLORS.length]} label={row.name} value={row.value} />
                  ))}
                </div>
              </div>
            ) : (
              <EmptyPanel text="Chưa có dữ liệu cương vị quản lý" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Xu hướng theo thời gian — biểu đồ vùng (area) */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-violet-600" />
              Xu hướng khiếm khuyết &amp; xử lý theo tháng · {dashboard.currentYear}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">Yêu cầu</span>
              <Select value={trendRequestFilter} onValueChange={setTrendRequestFilter}>
                <SelectTrigger className="h-8 w-[150px] rounded-lg bg-white text-xs shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả</SelectItem>
                  {DEFECT_REQUEST_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : dashboard.hasMonthlyTrend ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dashboard.monthlyTrend} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="areaDetected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="areaHandled" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#EEF2F7" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                    <Tooltip content={<DashboardTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                    <Area type="monotone" dataKey="detected" name="Khiếm khuyết phát hiện" stroke="#F59E0B" strokeWidth={2.5} fill="url(#areaDetected)" dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
                    <Area type="monotone" dataKey="handled" name="Đã xử lý" stroke="#7C3AED" strokeWidth={2.5} fill="url(#areaHandled)" dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyPanel text={`Chưa có dữ liệu khiếm khuyết / xử lý trong năm ${dashboard.currentYear}`} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-cyan-600" />
              Lượt sửa chữa theo năm
            </CardTitle>
            <Select value={repairYearFilter} onValueChange={setRepairYearFilter}>
              <SelectTrigger className="h-8 w-[112px] rounded-lg bg-white text-xs shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dashboard.repairYearOptions.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : dashboard.yearlyTrend.length ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dashboard.yearlyTrend} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="areaYear" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#EEF2F7" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                    <Tooltip content={<DashboardTooltip />} />
                    <Area type="monotone" dataKey="repairs" name="Lượt sửa chữa" stroke="#0EA5E9" strokeWidth={2.5} fill="url(#areaYear)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyPanel text="Chưa có lịch sử sửa chữa" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-slate-700" />
              Trạng thái khiếm khuyết
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton compact />
            ) : dashboard.statusRows.length ? (
              <div className="space-y-3">
                {dashboard.statusRows.map((row, index) => (
                  <ProgressRow
                    key={row.name}
                    label={row.name}
                    value={row.value}
                    max={Math.max(...dashboard.statusRows.map((item) => item.value), 1)}
                    color={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </div>
            ) : (
              <EmptyPanel text="Không có khiếm khuyết trong phạm vi lọc" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TimerReset className="h-4 w-4 text-amber-600" />
              Lịch thay thế cần theo dõi
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ListSkeleton />
            ) : dashboard.upcomingReplacements.length ? (
              <div className="space-y-2">
                {dashboard.upcomingReplacements.map((item) => (
                  <ReplacementAlert key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <EmptyPanel text="Chưa có điểm thay thế vật tư" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <SignalMiniChart
            icon={AlertTriangle}
            title="Top khiếm khuyết tồn đọng"
            rows={dashboard.defectChartRows}
            dataKey="openDefectCount"
            color="#EF4444"
            emptyText="Không có thiết bị đang tồn đọng khiếm khuyết"
          />
          <SignalMiniChart
            icon={TimerReset}
            title="Cảnh báo thay thế theo thiết bị"
            rows={dashboard.replacementChartRows}
            dataKey="replacementWarn"
            color="#F59E0B"
            emptyText="Không có thiết bị cần cảnh báo thay thế"
          />
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  loading,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  detail: string;
  tone: "blue" | "red" | "amber" | "green";
  loading?: boolean;
  href?: string;
}) {
  const toneClass = {
    blue: {
      card:
        "from-blue-50 via-white to-cyan-50 ring-blue-100/80 shadow-blue-900/10 dark:from-slate-900 dark:via-blue-950/70 dark:to-cyan-950/30 dark:ring-blue-400/20",
      icon: "from-blue-500 to-cyan-500 shadow-blue-500/25",
      line: "from-blue-500 via-cyan-400 to-transparent",
    },
    red: {
      card:
        "from-rose-50 via-white to-red-50 ring-rose-100/90 shadow-rose-900/10 dark:from-slate-900 dark:via-rose-950/55 dark:to-red-950/30 dark:ring-rose-400/20",
      icon: "from-rose-500 to-red-500 shadow-rose-500/25",
      line: "from-rose-500 via-red-400 to-transparent",
    },
    amber: {
      card:
        "from-amber-50 via-white to-yellow-50 ring-amber-100/90 shadow-amber-900/10 dark:from-slate-900 dark:via-amber-950/55 dark:to-yellow-950/25 dark:ring-amber-300/20",
      icon: "from-amber-400 to-orange-500 shadow-amber-500/25",
      line: "from-amber-400 via-orange-400 to-transparent",
    },
    green: {
      card:
        "from-emerald-50 via-white to-teal-50 ring-emerald-100/90 shadow-emerald-900/10 dark:from-slate-900 dark:via-emerald-950/45 dark:to-teal-950/30 dark:ring-emerald-300/20",
      icon: "from-emerald-500 to-teal-500 shadow-emerald-500/25",
      line: "from-emerald-500 via-teal-400 to-transparent",
    },
  }[tone];

  const card = (
    <Card
      className={cn(
        "group relative h-full overflow-hidden border-0 bg-gradient-to-br shadow-xl ring-1 transition-all duration-200",
        href && "cursor-pointer hover:-translate-y-0.5 hover:shadow-2xl",
        toneClass.card
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", toneClass.line)} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] dark:opacity-[0.22]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(30,58,95,0.18)_1px,transparent_1px),linear-gradient(0deg,rgba(30,58,95,0.14)_1px,transparent_1px)] bg-[size:28px_28px]" />
        <div className="absolute inset-x-4 bottom-3 h-px bg-gradient-to-r from-transparent via-current to-transparent text-slate-400/50" />
      </div>
      <CardContent className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">{label}</div>
            {loading ? (
              <div className="mt-3 h-8 w-20 animate-pulse rounded bg-white/70 dark:bg-slate-700/70" />
            ) : (
              <div className="mt-2 text-4xl font-black leading-none text-ink dark:text-white">{value}</div>
            )}
          </div>
          <div className={cn("relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ring-1 ring-white/50 before:absolute before:inset-x-1 before:top-1 before:h-1/3 before:rounded-t-xl before:bg-white/25", toneClass.icon)}>
            <Icon className="relative h-5 w-5 drop-shadow-sm" />
          </div>
        </div>
        <div className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">{detail}</div>
      </CardContent>
    </Card>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      aria-label={`Mở ${label}`}
      className="block h-full rounded-[8px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  );
}

function MaintenanceSignalPanel({
  loading,
  rows,
  summary,
}: {
  loading?: boolean;
  rows: DeviceSignalRow[];
  summary: {
    totalSignals: number;
    devicesWithSignals: number;
    openDefectDevices: number;
    topRisk: DeviceSignalRow | null;
  };
}) {
  const maxRisk = Math.max(...rows.map((row) => row.riskScore), 1);
  const topRisk = summary.topRisk;
  const chartRows = rows.map((row) => ({
    ...row,
    priorityRatio: Math.round((row.riskScore / maxRisk) * 100),
  }));

  return (
    <Card className="overflow-hidden border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f7fbff_48%,#f8fff9_100%)] shadow-sm">
      <CardHeader className="border-b border-slate-100 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-blue-700" />
              Tín hiệu bảo trì theo thiết bị
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Xếp hạng theo điểm ưu tiên: khiếm khuyết tồn đọng, cảnh báo thay thế và lịch sử sửa chữa.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <SignalStat label="Tín hiệu" value={summary.totalSignals} tone="navy" />
            <SignalStat label="Thiết bị" value={summary.devicesWithSignals} tone="teal" />
            <SignalStat label="Tồn đọng" value={summary.openDefectDevices} tone="red" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <ChartSkeleton />
        ) : rows.length ? (
          <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
            <div className="relative overflow-hidden rounded-xl bg-slate-950 p-4 text-white shadow-lg">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 via-amber-400 to-cyan-400" />
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
                <ShieldAlert className="h-4 w-4 text-amber-300" />
                Thiết bị ưu tiên
              </div>
              <div className="mt-4 text-2xl font-black leading-tight">{topRisk?.name}</div>
              <div className="mt-1 text-sm text-slate-300">{topRisk?.code} · {topRisk?.system}</div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <SignalCounter label="Sửa chữa" value={topRisk?.repairCount ?? 0} color="#38BDF8" />
                <SignalCounter label="Tồn đọng" value={topRisk?.openDefectCount ?? 0} color="#FB7185" />
                <SignalCounter label="Thay thế" value={topRisk?.replacementWarn ?? 0} color="#FBBF24" />
              </div>
              <div className="mt-4 rounded-lg border border-white/10 bg-white/8 px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <TrendingUp className="h-4 w-4 text-emerald-300" />
                  {topRisk?.recommendation}
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-300">
                  Cương vị: {topRisk?.managingPosition}. Điểm ưu tiên {topRisk?.riskScore ?? 0}, dùng để sắp thứ tự kiểm tra và phân công xử lý.
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                    <span className="h-2 w-2 rounded-full bg-sky-500" /> Sửa chữa
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">
                    <span className="h-2 w-2 rounded-full bg-rose-500" /> Khiếm khuyết
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Thay thế
                  </span>
                </div>
                <div className="text-xs font-semibold text-muted-foreground">Top {rows.length} thiết bị có tín hiệu</div>
              </div>

              <div className="h-[285px] rounded-lg bg-slate-50/70 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartRows}
                    layout="vertical"
                    margin={{ top: 8, right: 18, left: 10, bottom: 8 }}
                    barCategoryGap={10}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94A3B8" />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={118}
                      tick={{ fontSize: 11, fontWeight: 600 }}
                      tickFormatter={(value) => shortLabel(String(value), 18)}
                      stroke="#64748B"
                    />
                    <Tooltip content={<DashboardTooltip />} />
                    <Bar dataKey="repairCount" name="Sửa chữa" stackId="signals" fill="#0EA5E9" radius={[6, 0, 0, 6]} />
                    <Bar dataKey="openDefectCount" name="Khiếm khuyết tồn đọng" stackId="signals" fill="#F43F5E" />
                    <Bar dataKey="replacementWarn" name="Cảnh báo thay thế" stackId="signals" fill="#F59E0B" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {chartRows.slice(0, 3).map((row, index) => (
                  <div key={row.code} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-[11px] font-black text-white">
                        {index + 1}
                      </span>
                      <span className="text-xs font-black text-blue-700">{row.priorityRatio}%</span>
                    </div>
                    <div className="mt-2 truncate text-sm font-bold text-ink" title={row.name}>{row.name}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      {row.recommendation}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        ) : (
          <EmptyPanel text="Chưa có tín hiệu bảo trì nổi bật theo thiết bị" />
        )}
      </CardContent>
    </Card>
  );
}

function SignalStat({ label, value, tone }: { label: string; value: number; tone: "navy" | "teal" | "red" }) {
  const toneClass = {
    navy: "bg-blue-50 text-blue-800 ring-blue-100",
    teal: "bg-teal-50 text-teal-800 ring-teal-100",
    red: "bg-rose-50 text-rose-800 ring-rose-100",
  }[tone];
  return (
    <div className={cn("min-w-[72px] rounded-lg px-2 py-1.5 ring-1", toneClass)}>
      <div className="text-lg font-black leading-none">{value}</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide">{label}</div>
    </div>
  );
}

function SignalCounter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 px-2 py-2">
      <div className="text-xl font-black leading-none" style={{ color }}>{value}</div>
      <div className="mt-1 text-[11px] font-semibold text-slate-300">{label}</div>
    </div>
  );
}

function SignalMiniChart({
  icon: Icon,
  title,
  rows,
  dataKey,
  color,
  emptyText,
}: {
  icon: React.ElementType;
  title: string;
  rows: Array<{ name: string; code: string; [key: string]: string | number }>;
  dataKey: string;
  color: string;
  emptyText: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" style={{ color }} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={104}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => shortLabel(String(value), 18)}
                />
                <Tooltip content={<DashboardTooltip />} />
                <Bar dataKey={dataKey} name={title} fill={color} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyPanel text={emptyText} />
        )}
      </CardContent>
    </Card>
  );
}

function ProgressRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = Math.max(6, Math.round((value / max) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="font-semibold text-slate-700">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ReplacementAlert({
  item,
}: {
  item: {
    material: string;
    device: string;
    system: string;
    nextDueAt: Date | string;
    daysLeft: number;
    status: "OVERDUE" | "DUE_SOON" | "OK";
  };
}) {
  const statusLabel =
    item.status === "OVERDUE" ? "Quá hạn" : item.status === "DUE_SOON" ? `Còn ${item.daysLeft} ngày` : `Còn ${item.daysLeft} ngày`;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{item.material}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{item.device}</div>
          <div className="mt-1 text-xs text-slate-500">{item.system}</div>
        </div>
        <div className="text-right">
          <div
            className={cn(
              "rounded-full px-2 py-1 text-xs font-semibold",
              item.status === "OVERDUE"
                ? "bg-red-50 text-red-700"
                : item.status === "DUE_SOON"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-emerald-50 text-emerald-700"
            )}
          >
            {statusLabel}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{formatDate(item.nextDueAt)}</div>
        </div>
      </div>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate text-sm text-slate-700">{label}</span>
      </div>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}

function DashboardTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      {label && <div className="mb-1 max-w-[220px] font-semibold text-ink">{label}</div>}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={`${entry.name}-${entry.dataKey}`} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold text-ink">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartSkeleton({ compact = false }: { compact?: boolean }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-100", compact ? "h-[170px]" : "h-[300px]")} />;
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex min-h-[170px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function makeDateRange(from: string, to: string) {
  const start = from ? dateRange(from).start : null;
  const end = to ? dateRange(to).end : null;
  return { start, end };
}

function inDateRange(value: Date | string | null | undefined, range: { start: Date | null; end: Date | null }) {
  if (!value) return !range.start && !range.end;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function shortLabel(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
