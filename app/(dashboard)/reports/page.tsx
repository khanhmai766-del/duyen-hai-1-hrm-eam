"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CalendarClock,
  Factory,
  Gauge,
  Layers3,
  PackageCheck,
  TimerReset,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDefectHistory } from "@/hooks/useDefectHistory";
import { useDefects } from "@/hooks/useDefects";
import { useDevices } from "@/hooks/useDevices";
import { useMaterials } from "@/hooks/useMaterials";
import { useReplacements } from "@/hooks/useReplacements";
import { daysUntilDue, replacementDueStatus } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";

const CHART_COLORS = ["#1E3A5F", "#0EA5E9", "#14B8A6", "#F59E0B", "#EF4444", "#64748B"];

export default function ReportsPage() {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [systemPositionFilter, setSystemPositionFilter] = React.useState("ALL");

  const dateRange = React.useMemo(() => makeDateRange(from, to), [from, to]);
  const devicesQuery = useDevices({});
  const defectsQuery = useDefects();
  const historyQuery = useDefectHistory({ from: from || undefined, to: to || undefined });
  const replacementsQuery = useReplacements({});
  const materialsQuery = useMaterials();

  const devices = devicesQuery.data?.data ?? [];
  const defects = defectsQuery.data?.data ?? [];
  const defectHistory = historyQuery.data?.data ?? [];
  const replacements = replacementsQuery.data?.data ?? [];
  const materials = materialsQuery.data?.data ?? [];
  const isLoading =
    devicesQuery.isLoading ||
    defectsQuery.isLoading ||
    historyQuery.isLoading ||
    replacementsQuery.isLoading ||
    materialsQuery.isLoading;

  const dashboard = React.useMemo(() => {
    const deviceByCode = new Map(devices.map((device) => [device.code, device]));
    const systems = unique(devices.map((device) => device.system).filter(Boolean) as string[]);
    const positions = unique(devices.map((device) => device.managingPosition).filter(Boolean) as string[]);
    const systemChartDevices =
      systemPositionFilter === "ALL"
        ? devices
        : devices.filter((device) => device.managingPosition === systemPositionFilter);
    const systemChartDeviceCodes = new Set(systemChartDevices.map((device) => device.code));
    const systemChartSystems = unique(systemChartDevices.map((device) => device.system).filter(Boolean) as string[]);
    const visibleDefects = defects.filter((defect) => inDateRange(defect.detectedAt ?? defect.createdAt, dateRange));
    const openDefects = defects.filter((defect) => defect.status !== "DA_XU_LY");
    const urgentDefects = openDefects.filter((defect) => defect.severity === "1" || defect.severity === "2");
    const totalMaterialQuantity = materials.reduce((sum, material) => sum + Number(material.quantity || 0), 0);

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
          const itemPosition = linkedDevice?.managingPosition;
          const matchPosition = systemPositionFilter === "ALL" || itemPosition === systemPositionFilter;
          return itemSystem === system && matchPosition && replacementDueStatus(item.nextDueAt) !== "OK";
        }).length;
        return { name: system, devices: deviceCount, defects: openDefectCount, warning: replacementWarn };
      })
      .sort((a, b) => b.devices - a.devices)
      .slice(0, 8);

    const positionRows = positions
      .map((position) => ({
        name: position,
        value: devices.filter((device) => device.managingPosition === position).length,
      }))
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

    const deviceSignalRows = devices
      .map((device) => {
        const repairCount = repairCountByDevice.get(device.code) ?? device._count?.repairLogs ?? 0;
        const openDefectCount = openDefects.filter((defect) => defect.device === device.code).length;
        const replacementWarn = replacements.filter(
          (item) => item.device?.code === device.code && replacementDueStatus(item.nextDueAt) !== "OK"
        ).length;
        return {
          code: device.code,
          name: device.name,
          system: device.system ?? "Chưa phân hệ",
          managingPosition: device.managingPosition ?? "Chưa gán",
          repairCount,
          openDefectCount,
          replacementWarn,
          signalTotal: repairCount + openDefectCount + replacementWarn,
        };
      })
      .sort((a, b) => b.signalTotal - a.signalTotal)
      .slice(0, 8);
    const repairChartRows = [...deviceSignalRows]
      .filter((device) => device.repairCount > 0)
      .sort((a, b) => b.repairCount - a.repairCount)
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

    return {
      systems,
      positions,
      openDefects,
      urgentDefects,
      totalMaterialQuantity,
      dueGroups,
      systemRows,
      positionRows,
      statusRows,
      deviceSignalRows,
      repairChartRows,
      defectChartRows,
      replacementChartRows,
      upcomingReplacements,
    };
  }, [dateRange, defectHistory, defects, devices, materials, replacements, systemPositionFilter]);

  return (
    <div className="space-y-5 print:space-y-4">
      <PageHeader
        title="DASHBOARD QUẢN LÝ THIẾT BỊ"
        description="Tổng quan tài sản, khiếm khuyết, lịch sửa chữa và cảnh báo vật tư thay thế"
      />

      <Card className="no-print border-slate-200 bg-white">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Từ ngày</label>
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 w-44" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Đến ngày</label>
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 w-44" />
            </div>
            <div className="ml-auto flex min-h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-600">
              Phạm vi lọc áp dụng cho khiếm khuyết và lịch sử sửa chữa
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Factory}
          label="Tổng thiết bị"
          value={devices.length}
          detail={`${dashboard.systems.length} hệ thống · ${dashboard.positions.length} cương vị`}
          tone="blue"
          loading={isLoading}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Khiếm khuyết đang tồn đọng"
          value={dashboard.openDefects.length}
          detail={`${dashboard.urgentDefects.length} mức ưu tiên cao`}
          tone="red"
          loading={isLoading}
        />
        <MetricCard
          icon={CalendarClock}
          label="Cảnh báo thay thế"
          value={dashboard.dueGroups.OVERDUE + dashboard.dueGroups.DUE_SOON}
          detail={`${dashboard.dueGroups.OVERDUE} quá hạn · ${dashboard.dueGroups.DUE_SOON} sắp đến hạn`}
          tone="amber"
          loading={isLoading}
        />
        <MetricCard
          icon={PackageCheck}
          label="Số lượng vật tư"
          value={materials.length}
          detail={`${dashboard.totalMaterialQuantity} tổng số lượng tồn kho`}
          tone="green"
          loading={isLoading}
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
          <CardHeader className="pb-2">
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_0.9fr]">
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-blue-700" />
              Tín hiệu bảo trì theo thiết bị
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : dashboard.deviceSignalRows.some((row) => row.signalTotal > 0) ? (
              <div className="h-[330px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard.deviceSignalRows} layout="vertical" margin={{ top: 8, right: 20, left: 18, bottom: 8 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={126}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => shortLabel(String(value), 22)}
                    />
                    <Tooltip content={<DashboardTooltip />} />
                    <Bar dataKey="repairCount" name="Sửa chữa" stackId="signal" fill="#1E3A5F" radius={[5, 0, 0, 5]} />
                    <Bar dataKey="openDefectCount" name="Khiếm khuyết tồn đọng" stackId="signal" fill="#EF4444" />
                    <Bar dataKey="replacementWarn" name="Cảnh báo thay thế" stackId="signal" fill="#F59E0B" radius={[0, 5, 5, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyPanel text="Chưa có tín hiệu bảo trì nổi bật theo thiết bị" />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-5">
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
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  detail: string;
  tone: "blue" | "red" | "amber" | "green";
  loading?: boolean;
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

  return (
    <Card className={cn("group relative overflow-hidden border-0 bg-gradient-to-br shadow-xl ring-1 transition-transform duration-200 hover:-translate-y-0.5", toneClass.card)}>
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
  const start = from ? new Date(`${from}T00:00:00`) : null;
  const end = to ? new Date(`${to}T23:59:59`) : null;
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
