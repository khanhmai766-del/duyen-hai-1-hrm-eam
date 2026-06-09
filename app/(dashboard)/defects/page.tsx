"use client";

import Link from "next/link";
import { ShieldAlert, AlertTriangle, Wrench, CircleSlash } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ExportButton } from "@/components/shared/export-button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RepairStatusBadge, PriorityBadge } from "@/components/devices/status-badge";
import { useRepairLogs } from "@/hooks/useRepair";
import { useDevices } from "@/hooks/useDevices";
import { REPAIR_STATUS, PRIORITY } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export default function DefectsPage() {
  const repairs = useRepairLogs({});
  const faults = useDevices({ status: "FAULT" });
  const underRepair = useDevices({ status: "UNDER_REPAIR" });

  const loading = repairs.isLoading || faults.isLoading || underRepair.isLoading;
  // Active defects = repair logs not yet closed.
  const defects = (repairs.data?.data ?? []).filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS");

  return (
    <div className="space-y-6">
      <PageHeader title="Khiếm khuyết thiết bị" description="Theo dõi sự cố & khiếm khuyết thiết bị đang tồn đọng">
        <ExportButton
          rows={defects.map((r) => ({
            device: r.device.code,
            defect: r.title,
            symptom: r.symptom ?? "",
            priority: PRIORITY[r.priority as keyof typeof PRIORITY]?.label,
            status: REPAIR_STATUS[r.status as keyof typeof REPAIR_STATUS]?.label,
            since: formatDate(r.startedAt),
          }))}
          filename="khiem-khuyet-thiet-bi"
        />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Thiết bị sự cố" value={faults.data?.data?.length ?? 0} icon={AlertTriangle} tint="red" />
        <StatCard label="Đang sửa chữa" value={underRepair.data?.data?.length ?? 0} icon={Wrench} tint="blue" />
        <StatCard label="Khiếm khuyết tồn đọng" value={defects.length} icon={CircleSlash} tint="amber" />
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : defects.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="Không có khiếm khuyết tồn đọng" description="Tất cả thiết bị đang vận hành bình thường." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thiết bị</TableHead>
                <TableHead>Khiếm khuyết</TableHead>
                <TableHead>Hiện tượng</TableHead>
                <TableHead>Mức độ</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Phát sinh</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {defects.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/devices/${r.device.id}`} className="font-mono text-xs font-medium text-navy hover:underline">
                      {r.device.code}
                    </Link>
                    <div className="text-xs text-muted-foreground">{r.device.name}</div>
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate font-medium">{r.title}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">{r.symptom ?? "—"}</TableCell>
                  <TableCell><PriorityBadge priority={r.priority} /></TableCell>
                  <TableCell><RepairStatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(r.startedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
