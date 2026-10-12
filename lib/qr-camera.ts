import { decodeQrRgba, type QrDecodeResult } from "@/lib/qr-decode";

/*
 * Vòng quét QR từ thẻ <video> camera, chọn bộ giải mã nhanh nhất máy có:
 *   1. "native": BarcodeDetector của trình duyệt (Chrome Android) — giải mã bằng thư viện của hệ điều hành, rất nhanh.
 *   2. "worker": zxing trong Web Worker (iPhone, Chrome máy tính) — không chặn luồng giao diện nên camera không giật.
 *   3. "main":   zxing ngay trên luồng chính — chỉ khi không tạo được Worker.
 * Với zxing chỉ giải mã vùng giữa khung (nơi có khung ngắm) và thu nhỏ cạnh dài về ≤ 720px: ít điểm ảnh hơn ~3 lần
 * so với cả khung 1280×720 trước đây. Mỗi lượt thử báo về `onFrame` (kể cả không thấy mã) để chống quét lặp.
 */

export type QrEngine = "native" | "worker" | "main";
export type QrFrame = QrDecodeResult & {
  /** Thời gian giải mã một khung (ms). */
  decodeMs: number;
  /** Thời gian chụp khung trên luồng giao diện (drawImage + getImageData), 0 với "native". */
  captureMs: number;
};
export type QrScannerControls = { engine: QrEngine; stop: () => void };

/** Vùng giữa khung được giải mã (tỉ lệ mỗi cạnh) — rộng hơn khung ngắm (72%) một chút để thẻ lệch vẫn bắt được. */
const CROP = 0.84;
const MAX_SIDE = 720;
const GAP_MS: Record<QrEngine, number> = { native: 60, worker: 40, main: 140 };
/** Bắt được mã thì nghỉ ngắn trước lượt kế — đủ để hộp quét xử lý, đỡ tốn pin. */
const AFTER_HIT_MS = 300;
const WORKER_TIMEOUT_MS = 4000;

type NativeDetector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type NativeDetectorClass = (new (options: { formats: string[] }) => NativeDetector) & { getSupportedFormats?: () => Promise<string[]> };

async function nativeDetector(): Promise<NativeDetector | null> {
  const Detector = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const formats = await Detector.getSupportedFormats?.();
    if (formats && !formats.includes("qr_code")) return null;
    return new Detector({ formats: ["qr_code"] });
  } catch { return null; }
}

function createWorker(): Worker | null {
  try { return new Worker(new URL("./qr-decode.worker.ts", import.meta.url), { type: "module" }); }
  catch { return null; }
}

export async function startQrScanner(video: HTMLVideoElement, onFrame: (frame: QrFrame, engine: QrEngine) => void, options: { forceEngine?: QrEngine } = {}): Promise<QrScannerControls> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let detector = options.forceEngine && options.forceEngine !== "native" ? null : await nativeDetector();
  let nativeErrors = 0;
  let worker = detector || options.forceEngine === "main" ? null : createWorker();
  let engine: QrEngine = detector ? "native" : worker ? "worker" : "main";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // Worker chỉ có một khung đang giải mã tại một thời điểm; lỗi nạp Worker (trình duyệt cũ, lỗi tải tệp) → về luồng chính.
  let pending: ((frame: QrDecodeResult & { decodeMs: number }) => void) | null = null;
  let requestId = 0;
  const fallbackToMain = () => {
    worker?.terminate(); worker = null; engine = "main";
    pending?.({ text: null, partial: false, decodeMs: 0 }); pending = null;
  };
  const attachWorker = (next: Worker | null) => {
    worker = next;
    if (!next) return;
    next.onmessage = (event: MessageEvent<QrDecodeResult & { id: number; decodeMs: number }>) => {
      if (event.data.id !== requestId) return;
      pending?.(event.data); pending = null;
    };
    next.onerror = fallbackToMain;
  };
  attachWorker(worker);

  function capture() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!ctx || !vw || !vh) return null;
    const sw = Math.round(vw * CROP), sh = Math.round(vh * CROP);
    const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const dw = Math.round(sw * scale), dh = Math.round(sh * scale);
    if (canvas.width !== dw || canvas.height !== dh) { canvas.width = dw; canvas.height = dh; }
    ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, dw, dh);
    return ctx.getImageData(0, 0, dw, dh);
  }

  async function attempt(): Promise<QrFrame | null> {
    if (video.readyState < 2) return null;
    if (detector) {
      const startedAt = performance.now();
      try {
        const codes = await detector.detect(video);
        nativeErrors = 0;
        return { text: codes[0]?.rawValue ?? null, partial: false, decodeMs: performance.now() - startedAt, captureMs: 0 };
      } catch {
        // Có máy khai báo BarcodeDetector nhưng detect() lỗi liên tục (thiếu dịch vụ Google Play…) → chuyển sang zxing.
        if (++nativeErrors >= 5) { detector = null; attachWorker(createWorker()); engine = worker ? "worker" : "main"; }
        return null;
      }
    }
    const capturedAt = performance.now();
    const image = capture();
    if (!image) return null;
    const captureMs = performance.now() - capturedAt;
    if (worker) {
      const current = worker;
      const result = await new Promise<QrDecodeResult & { decodeMs: number }>(resolve => {
        pending = resolve;
        current.postMessage({ id: ++requestId, buffer: image.data.buffer, width: image.width, height: image.height }, [image.data.buffer]);
        // Worker không trả lời (treo, bị trình duyệt dừng) thì đừng để vòng quét đứng theo.
        setTimeout(() => { if (pending === resolve && worker === current) fallbackToMain(); }, WORKER_TIMEOUT_MS);
      });
      return { ...result, captureMs };
    }
    const startedAt = performance.now();
    return { ...decodeQrRgba(image.data, image.width, image.height), decodeMs: performance.now() - startedAt, captureMs };
  }

  async function loop() {
    if (stopped) return;
    let hit = false;
    try {
      const frame = await attempt();
      if (frame && !stopped) { hit = Boolean(frame.text); onFrame(frame, engine); }
    } catch { /* khung lỗi (camera vừa đổi kích thước…) — thử khung kế */ }
    if (!stopped) timer = setTimeout(loop, hit ? AFTER_HIT_MS : GAP_MS[engine]);
  }
  void loop();

  return {
    get engine() { return engine; },
    stop() {
      stopped = true;
      clearTimeout(timer);
      worker?.terminate(); worker = null;
      pending?.({ text: null, partial: false, decodeMs: 0 }); pending = null;
    },
  };
}
