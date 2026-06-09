"use client";

import * as React from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { ExportButton } from "@/components/shared/export-button";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useReport } from "@/hooks/useUsers";
import { formatCurrency, formatDuration } from "@/lib/utils";
import { CHECKIN_STATUS } from "@/lib/constants";

const PIE_COLORS = ["#1E3A5F", "#2563EB", "#6B4C2A", "#16A34A", "#D97706", "#DC2626"];

export default function ReportsPage() {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const range = { from: from || undefined, to: to || undefined };

  const freq = useReport<{ device: string; name: string; count: number }[]>("repair-frequency", range);
  const mtbf = useReport<{ code: string; name: string; failures: number; mtbfDays: number; totalDowntimeMin: number }[]>("mtbf");
  const attendance = useReport<{ summary: { status: string; count: number }[]; byUser: { name: string; present: number; late: number; absent: number }[] }>("attendance");
  const downtime = useReport<{ category: string; downtime: number }[]>("downtime-by-category", range);
  const material = useReport<{ name: string; quantity: number; value: number }[]>("material-consumption");

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader title="Báo cáo & Thống kê" description="Phân tích vận hành, bảo trì và nhân sự">
        <ExportButton rows={mtbf.data?.data ?? []} filename="bao-cao-mtbf" />
      </PageHeader>

      <Card className="p-4 no-print">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Từ ngày</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Đến ngày</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Repair frequency */}
        <Card>
          <CardHeader><CardTitle>Tần suất sửa chữa theo thiết bị</CardTitle></CardHeader>
          <CardContent>
            {freq.isLoading ? <CardSkeleton /> : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(freq.data?.data ?? []).slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="device" width={90} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563EB" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Downtime by category */}
        <Card>
          <CardHeader><CardTitle>Thời gian dừng theo nhóm</CardTitle></CardHeader>
          <CardContent>
            {downtime.isLoading ? <CardSkeleton /> : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={downtime.data?.data ?? []} dataKey="downtime" nameKey="category" outerRadius={100} label={(e: any) => e.category}>
                      {(downtime.data?.data ?? []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatDuration(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* MTBF table */}
        <Card>
          <CardHeader><CardTitle>MTBF — Thời gian trung bình giữa các hỏng hóc</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thiết bị</TableHead>
                  <TableHead className="text-right">Số lần hỏng</TableHead>
                  <TableHead className="text-right">MTBF (ngày)</TableHead>
                  <TableHead className="text-right">Tổng dừng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(mtbf.data?.data ?? []).slice(0, 8).map((m) => (
                  <TableRow key={m.code}>
                    <TableCell className="font-mono text-xs">{m.code}</TableCell>
                    <TableCell className="text-right">{m.failures}</TableCell>
                    <TableCell className="text-right">{m.mtbfDays || "—"}</TableCell>
                    <TableCell className="text-right">{formatDuration(m.totalDowntimeMin)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Attendance summary */}
        <Card>
          <CardHeader><CardTitle>Tổng hợp chấm công</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-4 flex gap-3">
              {(attendance.data?.data?.summary ?? []).map((s) => {
                const meta = CHECKIN_STATUS[s.status as keyof typeof CHECKIN_STATUS];
                return (
                  <div key={s.status} className="flex-1 rounded-lg border border-border p-3 text-center">
                    <div className="text-2xl font-bold text-ink">{s.count}</div>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${meta?.badge}`}>{meta?.label ?? s.status}</span>
                  </div>
                );
              })}
            </div>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Nhân viên</TableHead><TableHead className="text-right">Có mặt</TableHead><TableHead className="text-right">Muộn</TableHead><TableHead className="text-right">Vắng</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(attendance.data?.data?.byUser ?? []).map((u) => (
                  <TableRow key={u.name}>
                    <TableCell>{u.name}</TableCell>
                    <TableCell className="text-right text-success">{u.present}</TableCell>
                    <TableCell className="text-right text-warning">{u.late}</TableCell>
                    <TableCell className="text-right text-destructive">{u.absent}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Material consumption */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Tiêu thụ vật tư</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Vật tư</TableHead><TableHead className="text-right">Số lượng đã dùng</TableHead><TableHead className="text-right">Giá trị</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(material.data?.data ?? []).map((m) => (
                  <TableRow key={m.name}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-right">{m.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(m.value)}</TableCell>
                  </TableRow>
                ))}
                {(material.data?.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Chưa có dữ liệu tiêu thụ</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
