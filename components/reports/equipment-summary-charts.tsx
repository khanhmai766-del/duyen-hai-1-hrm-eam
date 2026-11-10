"use client";

import { useId, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { EquipmentDashboardData, EquipmentDashboardSignalRow, EquipmentDashboardStatusRow } from "@/types/equipment-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ElementType } from "react";

const number = new Intl.NumberFormat("vi-VN");
const count = (value: unknown) => number.format(Number(value));
const compactNumber = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 });
const tickCount = (value: unknown) => compactNumber.format(Number(value));
const axisTick = { fill: "#64748b", fontSize: 11 };
const tooltipStyle = { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px #0f172a12", fontSize: 13 };
const statusColors: Record<string, string> = {
  "Chưa xử lý": "#1e3a5f", "Có PCT": "#0284c7", "Chờ vật tư": "#d97706", "Đã xử lý": "#0d9488",
};

export function RepairYearChart({ rows }: { rows: EquipmentDashboardData["repairYearCounts"] }) {
  const gradient = useId();
  const repairs = rows.reduce((sum, row) => sum + row.repairs, 0);
  return (
    <figure aria-label={`Lượt sửa chữa: ${rows.map(row => `${row.year}: ${count(row.repairs)} lượt`).join(", ")}`}>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-4xl font-bold tracking-tight text-navy tabular-nums">{count(repairs)}</span>
        <span className="text-sm text-slate-500">lượt sửa chữa</span>
      </div>
      <div className="h-[244px] min-w-0" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 28, right: 12, left: 0, bottom: 0 }} barSize={64}>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ea5e9" />
                <stop offset="100%" stopColor="#0369a1" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="#e2e8f0" />
            <XAxis dataKey="year" tick={axisTick} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} dy={6} />
            <YAxis width={48} tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, "auto"]} tickFormatter={tickCount} />
            <Tooltip cursor={{ fill: "#f0f9ff" }} contentStyle={tooltipStyle} formatter={value => [count(value), "Lượt sửa chữa"]} labelFormatter={year => `Năm ${year}`} />
            <Bar dataKey="repairs" name="Lượt sửa chữa" fill={`url(#${gradient})`} radius={[8, 8, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="repairs" position="top" formatter={count} fill="#075985" fontSize={13} fontWeight={700} offset={10} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-xs leading-relaxed text-slate-500">Tổng số lượt ghi nhận trong năm đang chọn.</figcaption>
    </figure>
  );
}

export function DefectStatusChart({ rows }: { rows: EquipmentDashboardStatusRow[] }) {
  const labelWidth = Math.max(46, ...rows.map(row => count(row.value).length * 7 + 12));
  return (
    <figure aria-label="Số khiếm khuyết theo trạng thái">
      <div className="mb-3 text-xs font-medium text-slate-500">Số khiếm khuyết · theo phạm vi ngày đang lọc</div>
      <div className="h-[250px] min-w-0" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" barSize={22} margin={{ top: 6, right: labelWidth, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 5" stroke="#e2e8f0" />
            <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, "auto"]} tickFormatter={tickCount} minTickGap={24} />
            <YAxis type="category" dataKey="name" width={92} tick={{ fill: "#334155", fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={tooltipStyle} formatter={value => [count(value), "Khiếm khuyết"]} />
            <Bar dataKey="value" name="Khiếm khuyết" radius={[0, 6, 6, 0]} isAnimationActive={false}>
              {rows.map(row => <Cell key={row.name} fill={statusColors[row.name] ?? "#64748b"} />)}
              <LabelList dataKey="value" position="right" formatter={count} fill="#334155" fontSize={12} fontWeight={700} offset={9} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <dl className="sr-only">
        {rows.map(row => <div key={row.name}><dt>{row.name}</dt><dd>{count(row.value)}</dd></div>)}
      </dl>
      <figcaption className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
        Chờ vật tư gồm cả phiếu chờ vật tư sau sửa; một phiếu có thể xuất hiện ở nhiều nhóm.
      </figcaption>
    </figure>
  );
}

export function ReplacementDueChart({ groups }: { groups: EquipmentDashboardData["dueGroups"] }) {
  const rows = [
    { name: "Quá hạn", value: groups.OVERDUE, color: "#e11d48" },
    { name: "Sắp đến hạn", value: groups.DUE_SOON, color: "#d97706" },
    { name: "Chưa đến hạn", value: groups.OK, color: "#0d9488" },
  ];
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const warnings = groups.OVERDUE + groups.DUE_SOON;
  return (
    <figure aria-label="Phân bố lịch thay thế theo mức đến hạn">
      <div className="grid items-center gap-4 sm:grid-cols-[212px_minmax(0,1fr)]">
        <div className="relative mx-auto h-[212px] w-[212px] shrink-0">
          <div className="absolute inset-0" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={total ? rows : [{ name: "Chưa có lịch", value: 1, color: "#e2e8f0" }]} dataKey="value" nameKey="name"
                  innerRadius={76} outerRadius={99} startAngle={90} endAngle={-270} paddingAngle={total ? 2 : 0} stroke="none" isAnimationActive={false}>
                  {(total ? rows : [{ name: "empty", color: "#e2e8f0" }]).map(row => <Cell key={row.name} fill={row.color} />)}
                </Pie>
                {total > 0 && <Tooltip contentStyle={tooltipStyle} formatter={value => [count(value), "Điểm thay thế"]} />}
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className={`max-w-[140px] text-center font-bold tracking-tight text-navy tabular-nums ${count(warnings).length > 7 ? "text-2xl" : "text-3xl"}`}>{count(warnings)}</span>
            <span className="mt-1 text-xs font-medium text-slate-500">cần theo dõi</span>
          </div>
        </div>
        <dl className="min-w-0 space-y-3">
          {rows.map(row => (
            <div key={row.name} className="flex items-center gap-2.5 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
              <dt className="min-w-0 flex-1 text-sm text-slate-600">{row.name}</dt>
              <dd className="text-right">
                <span className="font-bold text-slate-800 tabular-nums">{count(row.value)}</span>
                <span className="ml-2 inline-block min-w-10 text-xs text-slate-500 tabular-nums">{percent.format(total ? row.value / total : 0)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <figcaption className="mt-3 text-xs leading-relaxed text-slate-500">
        {total ? `${count(total)} điểm thay thế đã có lịch · màu đỏ và hổ phách cần theo dõi.` : "Chưa có điểm thay thế được lập lịch."}
      </figcaption>
    </figure>
  );
}

function wrapDeviceName(name: string, length: number) {
  const lines: string[] = [];
  for (const word of name.split(/\s+/)) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + word.length + 1 <= length) lines[last] += ` ${word}`;
    else {
      for (let start = 0; start < word.length; start += length) lines.push(word.slice(start, start + length));
    }
  }
  return lines;
}

function DeviceNameTick({ x = 0, y = 0, payload, width }: { x?: number; y?: number; payload?: { value: string }; width: number }) {
  const lines = wrapDeviceName(payload?.value ?? "", Math.floor(width / 7));
  return (
    <text x={x - 10} y={y - (lines.length - 1) * 7.5} textAnchor="end" dominantBaseline="central" fill="#334155" fontSize={12}>
      {lines.map((line, index) => <tspan key={index} x={x - 10} dy={index ? 15 : 0}>{line}</tspan>)}
    </text>
  );
}

export function DeviceSignalChart({ icon: Icon, title, rows, dataKey, color, emptyText }: {
  icon: ElementType;
  title: string;
  rows: EquipmentDashboardSignalRow[];
  dataKey: "openDefectCount" | "replacementWarn";
  color: string;
  emptyText: string;
}) {
  const [width, setWidth] = useState(0);
  const axisWidth = width >= 400 ? 160 : 112;
  const chartRows = [...rows].sort((a, b) => b[dataKey] - a[dataKey]).map((row, index) => ({ ...row, label: `${index + 1}. ${row.name}` }));
  const rowHeight = Math.max(52, ...chartRows.map(row => wrapDeviceName(row.label, Math.floor(axisWidth / 7)).length * 15 + 18));
  const labelWidth = Math.max(40, ...chartRows.map(row => count(row[dataKey]).length * 7 + 12));
  const maximum = Math.max(1, ...chartRows.map(row => row[dataKey]));
  const unit = dataKey === "openDefectCount" ? "khiếm khuyết" : "cảnh báo thay thế";
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 shrink-0" style={{ color }} />{title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartRows.length ? (
          <figure aria-label={title}>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              {chartRows.length} thiết bị · {count(chartRows.reduce((sum, row) => sum + row[dataKey], 0))} {unit} trong danh sách
            </p>
            <div className="min-w-0" style={{ height: chartRows.length * rowHeight + 36 }} aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%" onResize={setWidth}>
                <BarChart data={chartRows} layout="vertical" barSize={22} margin={{ top: 6, right: labelWidth, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 5" stroke="#e2e8f0" />
                  <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={tickCount} minTickGap={24}
                    domain={[0, maximum]} ticks={maximum <= 5 ? Array.from({ length: maximum + 1 }, (_, index) => index) : undefined} />
                  <YAxis type="category" dataKey="label" interval={0} width={axisWidth} tick={<DeviceNameTick width={axisWidth} />} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#f8fafc" }} content={({ active, payload }) => {
                    const row = payload?.[0]?.payload as EquipmentDashboardSignalRow | undefined;
                    return active && row ? (
                      <div className="max-w-[240px] rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg">
                        <p className="font-semibold leading-relaxed text-slate-800">{row.name}</p>
                        <p className="mt-1 break-all font-mono text-slate-500">{row.code}</p>
                        <p className="mt-2 font-semibold" style={{ color }}>{count(row[dataKey])} {unit}</p>
                      </div>
                    ) : null;
                  }} />
                  <Bar dataKey={dataKey} name={unit} fill={color} radius={[0, 6, 6, 0]} isAnimationActive={false}>
                    <LabelList dataKey={dataKey} position="right" formatter={count} fill="#334155" fontSize={12} fontWeight={700} offset={9} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <details className="mt-3 border-t border-slate-100 pt-2">
              <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Xem mã thiết bị và số liệu</summary>
              <ol className="mt-2 divide-y divide-slate-100">
                {chartRows.map((row, index) => (
                  <li key={row.code} className="flex items-start gap-3 py-3 text-sm">
                    <span className="font-semibold text-slate-400 tabular-nums">{index + 1}.</span>
                    <div className="min-w-0 flex-1"><p className="break-words font-medium text-slate-700">{row.name}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{row.code}</p></div>
                    <span className="shrink-0 font-bold text-slate-800 tabular-nums">{count(row[dataKey])}</span>
                  </li>
                ))}
              </ol>
            </details>
          </figure>
        ) : (
          <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">{emptyText}</div>
        )}
      </CardContent>
    </Card>
  );
}
