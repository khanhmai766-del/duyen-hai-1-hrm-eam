"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDevice } from "@/hooks/useDevices";
import { Skeleton } from "@/components/ui/skeleton";

export default function DeviceQrPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useDevice(id);
  const device = data?.data;
  const url = typeof window !== "undefined" ? `${window.location.origin}/public/devices/${id}` : "";

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <div className="no-print mb-6 flex w-full max-w-md items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/devices/${id}`}><ArrowLeft className="h-4 w-4" /> Quay lại</Link>
        </Button>
        <Button onClick={() => window.print()} variant="accent" size="sm">
          <Printer className="h-4 w-4" /> In mã QR
        </Button>
      </div>

      {isLoading || !device ? (
        <Skeleton className="h-[420px] w-[340px] rounded-2xl" />
      ) : (
        <div className="print-full flex w-full max-w-md flex-col items-center rounded-2xl border border-border bg-white p-10 text-center shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-navy">
            <Zap className="h-6 w-6 text-amber-400" fill="currentColor" />
            <span className="text-lg font-bold">PowerPlant EAM</span>
          </div>
          <div className="rounded-xl border-2 border-navy/10 p-4">
            <QRCodeSVG value={url} size={300} level="H" />
          </div>
          <div className="mt-6 space-y-1">
            <div className="font-mono text-lg font-bold text-navy">{device.code}</div>
            <div className="text-xl font-semibold text-ink">{device.name}</div>
            {device.system && <div className="text-muted-foreground">{device.system}</div>}
            {device.managingPosition && <div className="text-sm text-muted-foreground">{device.managingPosition}</div>}
          </div>
          <p className="mt-6 max-w-xs text-xs text-muted-foreground">
            Quét mã để xem lý lịch & lịch sử sửa chữa thiết bị
          </p>
        </div>
      )}
    </div>
  );
}
