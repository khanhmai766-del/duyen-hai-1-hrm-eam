"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { day: number | string; value: number | null };
type Domain = [number | string, number | string] | undefined;

/**
 * Biểu đồ diễn biến theo ngày của trang Dữ liệu các tháng.
 * Tách riêng để nạp bằng next/dynamic: recharts (~400 KB, ~104 KB nén) không còn nằm trong gói đầu của trang.
 */
export default function DailyTrendChart({ data, domain, label, variant, formatValue }: {
  data: Point[]; domain: Domain; label: string; variant: "overview" | "dialog"; formatValue: (value: number | null) => string;
}) {
  const overview = variant === "overview";
  return <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={overview ? { top: 12, right: 20, left: 0, bottom: 4 } : { top: 8, right: 12, left: 0, bottom: 0 }}>
      {overview
        ? <CartesianGrid strokeDasharray="3 5" stroke="#dde7f0" vertical={false} />
        : <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f2" />}
      {overview
        ? <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        : <XAxis dataKey="day" tick={{ fontSize: 11 }} />}
      {overview
        ? <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={64} domain={domain} allowDataOverflow axisLine={false} tickLine={false} />
        : <YAxis tick={{ fontSize: 11 }} width={56} domain={domain} allowDataOverflow />}
      <Tooltip contentStyle={overview ? { borderRadius: 12, borderColor: "#dbe4ef" } : { borderRadius: 12, borderColor: "#dbe4ef", boxShadow: "0 8px 24px rgb(30 58 90 / 10%)" }}
        formatter={(value: unknown) => formatValue(typeof value === "number" ? value : null)} labelFormatter={label => `Ngày ${label}`} />
      <Line type="monotone" dataKey="value" name={label} stroke={overview ? "#1686a0" : "#2563eb"} strokeWidth={overview ? 3 : 2.5} dot={{ r: 3, fill: "#fff", strokeWidth: 2 }} connectNulls />
    </LineChart>
  </ResponsiveContainer>;
}
