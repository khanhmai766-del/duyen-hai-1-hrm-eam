"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDevice } from "@/hooks/useDevices";
import { Skeleton } from "@/components/ui/skeleton";
import { RbacProtectedRoute } from "@/components/shared/rbac-protected-route";
import { deviceQrValue } from "@/lib/device-qr";

/**
 * Dấu "đổi mới sáng tạo · AI" ở góc thẻ.
 *
 * Vẽ bằng SVG nội tuyến chứ không dùng ảnh: thẻ này in ra giấy A5, ảnh bitmap phóng to
 * sẽ rỗ. Mạch nối thưa dần từ trái vào huy hiệu — gợi "dữ liệu · kết nối" mà vẫn để mã
 * QR là thứ nổi bật nhất trên thẻ; chữ AI đặt trong viền để in ra vẫn đọc được kể cả khi
 * máy in bỏ qua nền.
 */
function QrAiMark() {
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      {/* Mạng nút thần kinh thu nhỏ: đọc ra "AI" ngay cả ở cỡ 5mm, và đậm dần về phía
          huy hiệu nên mắt đi từ trái sang phải rồi dừng ở chữ AI. */}
      <svg viewBox="0 0 56 24" className="h-6 w-14">
        <defs>
          <linearGradient id="qr-ai-net" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.15" />
            <stop offset="60%" stopColor="#60a5fa" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="1" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="url(#qr-ai-net)" strokeWidth="1" strokeLinecap="round">
          <path d="M5 18L19 9M19 9l14 7M33 16l16-9M19 9l16-5M5 18l28-2" />
        </g>
        <g fill="#2563eb">
          <circle cx="5" cy="18" r="1.6" opacity="0.3" />
          <circle cx="19" cy="9" r="2" opacity="0.55" />
          <circle cx="35" cy="4" r="1.6" opacity="0.5" />
          <circle cx="33" cy="16" r="2" opacity="0.8" />
          <circle cx="49" cy="7" r="1.6" opacity="0.95" />
        </g>
      </svg>

      <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-50 px-2 py-[3px]">
        <svg viewBox="0 0 24 24" className="size-3.5">
          <defs>
            <linearGradient id="qr-ai-spark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
          </defs>
          {/* Tia bốn cánh — ký hiệu quen thuộc của AI; cánh nhỏ thứ hai cho có nhịp. */}
          <path
            d="M12 1.6l2.05 6.35L20.4 10l-6.35 2.05L12 18.4l-2.05-6.35L3.6 10l6.35-2.05z"
            fill="url(#qr-ai-spark)"
          />
          <path d="M19 15.2l.85 2.45 2.45.85-2.45.85L19 21.8l-.85-2.45-2.45-.85 2.45-.85z" fill="url(#qr-ai-spark)" opacity="0.75" />
        </svg>
        <span className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-indigo-700">AI</span>
      </span>
    </span>
  );
}

export default function DeviceQrPage() {
  return (
    <RbacProtectedRoute permissionId="device-view" featureLabel="Thông tin thiết bị">
      <DeviceQrPageContent />
    </RbacProtectedRoute>
  );
}

function DeviceQrPageContent() {
  // Khổ giấy in do @page quyết định, mà @page chỉ đọc được tên trang từ gốc tài
  // liệu — gắn cờ lên body để cả tờ in lấy khổ A5, khỏi sinh một trang A4 trắng.
  useEffect(() => {
    document.body.classList.add("printing-qr");
    return () => document.body.classList.remove("printing-qr");
  }, []);

  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const machine = searchParams.get("machine");
  const { data, isLoading } = useDevice(id, machine);
  const device = data?.data;
  const url = typeof window !== "undefined" && device ? deviceQrValue(device.id, device.machine, window.location.origin) : "";
  // Cùng cách suy như trang hồ sơ thiết bị: ưu tiên danh sách đầy đủ, thiếu thì lùi về
  // cương vị đơn lẻ để thẻ của dữ liệu cũ vẫn in ra đúng.
  const positions = device?.managingPositions?.length
    ? device.managingPositions
    : device?.managingPosition
      ? [device.managingPosition]
      : [];

  return (
    <div className="qr-print-page flex min-h-[70vh] flex-col items-center justify-center">
      <div className="no-print mb-6 flex w-full max-w-md items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/devices/${id}${machine ? `?machine=${encodeURIComponent(machine)}` : ""}`}><ArrowLeft className="h-4 w-4" /> Quay lại</Link>
        </Button>
        <Button onClick={() => window.print()} variant="accent" size="sm">
          <Printer className="h-4 w-4" /> In mã QR
        </Button>
      </div>

      {isLoading || !device ? (
        <Skeleton className="h-[420px] w-[340px] rounded-2xl" />
      ) : (
        <div className="qr-print-sheet flex w-full max-w-md flex-col items-center rounded-2xl border border-border bg-white p-10 text-center shadow-sm">
          <div className="qr-print-brand mb-4 flex items-center gap-2 text-navy">
            <img src="/brand/4.png" alt="Logo EVN" className="qr-print-logo h-7 w-7 object-contain" />
            <span className="text-base font-bold">Duyen Hai 1 Thermal Power Plant</span>
          </div>
          <div className="qr-print-code rounded-xl border-2 border-navy/10 p-4">
            <QRCodeSVG value={url} size={300} level="H" />
          </div>
          <div className="qr-print-info mt-6 space-y-1">
            <div className="qr-print-devicecode font-mono text-lg font-bold text-navy">{device.code}</div>
            <div className="qr-print-devicename text-xl font-semibold text-ink">{device.name}</div>
            {device.system && <div className="qr-print-system text-muted-foreground">{device.system}</div>}
          </div>

          {/* CƯƠNG VỊ QUẢN LÝ — một thiết bị có thể được phân giao cho NHIỀU cương vị
              (`managingPositions`); trước đây thẻ chỉ in cương vị đầu tiên và không nói
              đó là cái gì, người cầm thẻ đọc "Máy nghiền" không biết là hệ thống hay
              người quản. Nhãn + đủ danh sách, đúng như trang hồ sơ thiết bị. */}
          {positions.length > 0 && (
            <div className="qr-print-positions mt-5 flex w-full flex-col items-center gap-1.5">
              <span className="qr-print-positions-label text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Cương vị quản lý
              </span>
              <span className="flex flex-wrap justify-center gap-1.5">
                {positions.map((position) => (
                  <span
                    key={position}
                    // Có VIỀN chứ không chỉ nền xám: máy in thường tắt "background
                    // graphics", chỉ tô nền thì in ra chip biến mất còn trơ chữ.
                    className="qr-print-position rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[12.5px] font-semibold text-ink"
                  >
                    {position}
                  </span>
                ))}
              </span>
            </div>
          )}

          <p className="qr-print-note mt-6 max-w-xs text-xs text-muted-foreground">
            Camera điện thoại xem thông tin cơ bản · Trình quét trong website mở hồ sơ đầy đủ
          </p>

          {/* Góc phải dưới: dấu hiệu "đổi mới sáng tạo · AI". Đặt trong DÒNG RIÊNG căn
              phải chứ không dán tuyệt đối vào góc — thẻ co giãn theo tên thiết bị dài
              ngắn, dán tuyệt đối là có ngày đè lên dòng chú thích. */}
          <div className="qr-print-ai mt-4 flex w-full justify-end">
            <QrAiMark />
          </div>
        </div>
      )}
    </div>
  );
}
