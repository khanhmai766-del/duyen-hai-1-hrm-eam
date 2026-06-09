"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RepairTimeline } from "@/components/repair/repair-timeline";
import { StatCard } from "@/components/shared/stat-card";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDevice } from "@/hooks/useDevices";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatDuration } from "@/lib/utils";

export default function DeviceRepairHistoryPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { data, isLoading } = useDevice(deviceId);
  const device = data?.data;

  if (isLoading) return <CardSkeleton />;
  if (!device) return <p className="text-muted-foreground">Không tìm thấy thiết bị.</p>;

  const logs = device.repairLogs;
  const totalDowntime = logs.reduce((a, l) => a + (l.downtime ?? 0), 0);
  const open = logs.filter((l) => l.status === "OPEN" || l.status === "IN_PROGRESS").length;
  const closed = logs.filter((l) => l.status === "CLOSED" || l.status === "RESOLVED").length;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/repair-history"><ArrowLeft className="h-4 w-4" /> Tất cả phiếu</Link>
      </Button>

      <PageHeader title={`Lịch sử: ${device.name}`} description={`${device.code} · ${device.location}`}>
        <Button asChild variant="outline"><Link href={`/devices/${device.id}`}>Lý lịch thiết bị</Link></Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tổng số phiếu" value={logs.length} icon={Wrench} tint="navy" />
        <StatCard label="Đang xử lý" value={open} icon={AlertTriangle} tint="amber" />
        <StatCard label="Đã hoàn thành" value={closed} icon={CheckCircle2} tint="green" />
        <StatCard label="Tổng thời gian dừng" value={formatDuration(totalDowntime)} icon={Clock} tint="red" />
      </div>

      <Card>
        <CardHeader><CardTitle>Dòng thời gian sửa chữa</CardTitle></CardHeader>
        <CardContent>
          <RepairTimeline entries={logs as any} />
        </CardContent>
      </Card>
    </div>
  );
}
