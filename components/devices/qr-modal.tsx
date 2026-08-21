"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deviceQrValue } from "@/lib/device-qr";

export function QRModal({
  open,
  onOpenChange,
  device,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  device: { id: string; code: string; name: string; system?: string | null; machine?: string | null };
}) {
  const url = deviceQrValue(device.id, device.machine, typeof window !== "undefined" ? window.location.origin : null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mã QR thiết bị</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="rounded-xl border border-border bg-white p-4">
            <QRCodeSVG value={url} size={200} level="M" />
          </div>
          <div className="text-center">
            <div className="font-bold text-ink">{device.code}</div>
            <div className="text-sm text-muted-foreground">{device.name}</div>
            {device.system && <div className="text-xs text-muted-foreground">{device.system}</div>}
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/devices/${device.id}/qr${device.machine ? `?machine=${encodeURIComponent(device.machine)}` : ""}`}>
              <ExternalLink className="h-4 w-4" /> Trang in mã QR
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
