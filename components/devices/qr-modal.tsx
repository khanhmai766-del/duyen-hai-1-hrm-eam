"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function QRModal({
  open,
  onOpenChange,
  device,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  device: { id: string; code: string; name: string; location: string };
}) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/devices/${device.id}` : `/devices/${device.id}`;
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
            <div className="text-xs text-muted-foreground">{device.location}</div>
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/devices/${device.id}/qr`}>
              <ExternalLink className="h-4 w-4" /> Trang in mã QR
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
