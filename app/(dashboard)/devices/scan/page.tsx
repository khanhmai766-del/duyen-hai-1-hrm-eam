"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Camera, CheckCircle2, Flashlight, ImagePlus, Loader2, QrCode, RotateCcw, ScanLine, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiMutate } from "@/lib/fetcher";

type ScannerControls = { stop: () => void; switchTorch?: (enabled: boolean) => Promise<void> };
type ScanState = "idle" | "starting" | "scanning" | "resolving" | "error";

export default function DeviceScannerPage() {
  return <DeviceScanner />;
}

function DeviceScanner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const controlsRef = React.useRef<ScannerControls | null>(null);
  const resolvingRef = React.useRef(false);
  const autoStartedRef = React.useRef(false);
  const [state, setState] = React.useState<ScanState>("idle");
  const [message, setMessage] = React.useState("Đưa mã QR vào giữa khung ngắm");
  const [torchAvailable, setTorchAvailable] = React.useState(false);
  const [torchOn, setTorchOn] = React.useState(false);

  const stopScanner = React.useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setTorchAvailable(false);
    setTorchOn(false);
  }, []);

  React.useEffect(() => stopScanner, [stopScanner]);

  React.useEffect(() => {
    if (searchParams.get("error") !== "qr-inactive") return;
    setState("error");
    setMessage("Mã QR đã bị vô hiệu hóa hoặc không còn tồn tại");
  }, [searchParams]);

  const resolveValue = React.useCallback(async (value: string) => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setState("resolving");
    setMessage("Đã nhận mã — đang kiểm tra quyền và dữ liệu thiết bị...");
    stopScanner();
    try {
      const result = await apiMutate<{ url: string; legacy: boolean }>("/api/device-qr/resolve", "POST", { value });
      navigator.vibrate?.(90);
      toast.success("Đã nhận diện thiết bị");
      router.push(result.url);
    } catch (error) {
      resolvingRef.current = false;
      setState("error");
      setMessage(error instanceof Error ? error.message : "Không đọc được mã QR thiết bị");
    }
  }, [router, stopScanner]);

  const startScanner = React.useCallback(async () => {
    stopScanner();
    resolvingRef.current = false;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setMessage("Camera chỉ hoạt động khi website dùng HTTPS. Bạn vẫn có thể chọn ảnh QR từ điện thoại.");
      return;
    }
    setState("starting");
    setMessage("Đang mở camera sau...");
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 800 });
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        videoRef.current ?? undefined,
        (result) => {
          if (result?.getText()) void resolveValue(result.getText());
        }
      );
      controlsRef.current = controls;
      setTorchAvailable(Boolean(controls.switchTorch));
      setState("scanning");
      setMessage("Đưa mã QR vào giữa khung ngắm");
    } catch (error) {
      stopScanner();
      setState("error");
      setMessage(cameraErrorMessage(error));
    }
  }, [resolveValue, stopScanner]);

  // Nút Quét QR ở thanh điều hướng đã là thao tác chủ động của người dùng.
  // Khi trang sẵn sàng, mở camera ngay; nếu trình duyệt chặn thì nút thử lại vẫn còn.
  React.useEffect(() => {
    if (autoStartedRef.current || searchParams.get("error") === "qr-inactive") return;
    autoStartedRef.current = true;
    void startScanner();
  }, [searchParams, startScanner]);

  async function toggleTorch() {
    if (!controlsRef.current?.switchTorch) return;
    try {
      await controlsRef.current.switchTorch(!torchOn);
      setTorchOn((current) => !current);
    } catch {
      toast.error("Thiết bị không hỗ trợ bật đèn pin từ trình duyệt");
    }
  }

  async function scanImage(file: File | undefined) {
    if (!file) return;
    stopScanner();
    resolvingRef.current = false;
    setState("resolving");
    setMessage("Đang đọc mã QR trong ảnh...");
    const objectUrl = URL.createObjectURL(file);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(objectUrl);
      await resolveValue(result.getText());
    } catch {
      resolvingRef.current = false;
      setState("error");
      setMessage("Không tìm thấy mã QR hợp lệ trong ảnh đã chọn");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const active = state === "starting" || state === "scanning" || state === "resolving";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-8">
      <section className="relative overflow-hidden rounded-[28px] bg-[#071a2d] text-white shadow-2xl shadow-slate-900/20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(14,165,233,0.25),transparent_30%),radial-gradient(circle_at_90%_90%,rgba(245,158,11,0.18),transparent_35%)]" />
        <div className="relative grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="p-3 sm:p-5">
            <div className="relative aspect-[3/4] max-h-[72vh] overflow-hidden rounded-[22px] border border-white/15 bg-black sm:aspect-video">
              <video ref={videoRef} className={`h-full w-full object-cover ${state === "scanning" ? "opacity-100" : "opacity-35"}`} muted playsInline aria-label="Hình ảnh camera quét mã QR" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-10">
                <div className="relative aspect-square w-full max-w-[280px]">
                  <Corner className="left-0 top-0 border-l-4 border-t-4" />
                  <Corner className="right-0 top-0 border-r-4 border-t-4" />
                  <Corner className="bottom-0 left-0 border-b-4 border-l-4" />
                  <Corner className="bottom-0 right-0 border-b-4 border-r-4" />
                  {state === "scanning" && <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.95)] motion-reduce:animate-none" />}
                </div>
              </div>
              {state !== "scanning" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  {state === "starting" || state === "resolving" ? (
                    <Loader2 className="h-10 w-10 animate-spin text-sky-300 motion-reduce:animate-none" />
                  ) : (
                    <button
                      type="button"
                      onClick={startScanner}
                      className="flex min-h-28 min-w-44 flex-col items-center justify-center gap-2 rounded-2xl border border-white/20 bg-slate-950/65 px-5 text-white backdrop-blur transition-colors hover:bg-slate-950/80 focus:outline-none focus:ring-2 focus:ring-sky-300"
                    >
                      <QrCode className="h-12 w-12 text-white/75" />
                      <span className="text-sm font-bold">{state === "error" ? "Chạm để thử lại camera" : "Chạm để mở camera"}</span>
                    </button>
                  )}
                </div>
              )}
              <div className="absolute inset-x-3 bottom-3 flex justify-center">
                <div className="flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-slate-950/80 px-4 py-2 text-center text-sm font-semibold backdrop-blur">
                  {state === "error" ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" /> : state === "resolving" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" /> : <ScanLine className="h-4 w-4 shrink-0 text-sky-300" />}
                  <span className="line-clamp-2">{message}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex flex-col justify-between gap-6 p-5 sm:p-7 lg:border-l lg:border-white/10">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-sky-200"><ShieldCheck className="h-4 w-4" /> Đã đăng nhập</span>
              <h1 className="mt-4 text-3xl font-black leading-tight">Quét QR<br /><span className="text-amber-300">thiết bị hiện trường</span></h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">Kết quả mở hồ sơ đầy đủ theo quyền cương vị: khiếm khuyết, sửa chữa, vật tư và lịch thay thế.</p>
            </div>
            <div className="space-y-3">
              <Button onClick={startScanner} disabled={active} className="min-h-12 w-full rounded-xl bg-amber-400 text-base font-black text-[#071a2d] shadow-lg shadow-amber-500/20 hover:bg-amber-300">
                {state === "starting" ? <Loader2 className="animate-spin" /> : state === "error" ? <RotateCcw /> : <Camera />}
                {state === "error" ? "Thử lại camera" : state === "scanning" ? "Camera đang quét" : "Mở camera quét QR"}
              </Button>
              {torchAvailable && state === "scanning" && <Button type="button" variant="outline" onClick={toggleTorch} className="min-h-11 w-full border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white"><Flashlight /> {torchOn ? "Tắt đèn pin" : "Bật đèn pin"}</Button>}
              <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 text-sm font-bold text-white transition-colors hover:bg-white/10 focus-within:ring-2 focus-within:ring-sky-400">
                <ImagePlus className="h-4 w-4" /> Chọn ảnh QR từ điện thoại
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => void scanImage(event.target.files?.[0])} />
              </label>
            </div>
          </div>
        </div>
      </section>
      <p className="px-2 text-center text-xs leading-5 text-muted-foreground">Camera cần HTTPS và quyền truy cập từ trình duyệt. Mã QR đã gỡ sẽ không thể mở hồ sơ.</p>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return <span className={`absolute h-14 w-14 rounded-sm border-amber-300 ${className}`} />;
}

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return "Bạn chưa cấp quyền camera. Hãy cho phép camera trong cài đặt trình duyệt rồi thử lại.";
  if (name === "NotFoundError") return "Không tìm thấy camera trên thiết bị này.";
  if (name === "NotReadableError") return "Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.";
  return "Không mở được camera. Hãy kiểm tra HTTPS, quyền camera hoặc chọn ảnh QR từ điện thoại.";
}
