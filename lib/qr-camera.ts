import { decodeQrRgba, sharpenRgba, type QrBox, type QrDecodeResult, type QrQuality } from "@/lib/qr-decode";
import type { DecodeRequest, DecodeResponse, QrDecoderName } from "@/lib/qr-decode.worker";

/*
 * Vòng quét QR từ thẻ <video> camera — bắt chước cách ứng dụng quét chuyên dụng (Zalo, WeChat) trong giới hạn của web:
 *   - Bộ giải mã: "native" = BarcodeDetector của Chrome Android; "wasm" = ZXing-C++ trong Web Worker (iPhone, máy
 *     tính, và lượt phóng to trên Android); "worker"/"main" = zxing JS cũ, chỉ khi .wasm chưa tải được / không có Worker.
 *   - Chỉ giải mã PHẦN ĐANG HIỆN trên màn hình: video dọc 9:16 hiện trong khung 4:3 kiểu object-cover chỉ lộ ~42%
 *     chiều cao — trước đây cắt 84% cả khung rồi thu nhỏ, phí điểm ảnh vào vùng người dùng không thấy.
 *   - Xen kẽ lượt "wide" (cả vùng đang hiện) với lượt phóng to: "focus" quanh chỗ vừa thấy mã mà đọc lỗi (ZXing-C++
 *     trả vị trí), không có thì "zoom" giữa khung ngắm; ảnh phóng to được làm nét. Thử giả lập 13/10/2026: phóng ×2
 *     quanh mã đọc được ca lóa 4–5/5 khung thay vì 0/5.
 *   - Android có zoom camera thật: thấy mã quá nhỏ thì phóng to quang/số của chính camera, lâu không thấy mã thì trả về.
 * Đo prod 13/10/2026 (trước thay đổi): giải mã chỉ 7 ms/khung nhưng 29% lượt chờ > 5 s — nghẽn ở chất lượng ảnh đưa
 * vào, không ở tốc độ. Mỗi lượt thử báo về `onFrame` (kể cả không thấy mã) để chống quét lặp và đo đạc.
 */

export type QrEngine = "native" | "wasm" | "worker" | "main";
export type QrCrop = "full" | "wide" | "zoom" | "focus";
export type { QrBox, QrQuality };
export type QrFrame = {
  text: string | null;
  partial: boolean;
  /** Vùng ảnh đã đưa vào bộ giải mã ở lượt này ("full" = BarcodeDetector đọc thẳng cả khung video). */
  crop: QrCrop;
  /** Vị trí mã trên khung video (điểm ảnh video) nếu bộ giải mã cho biết — cạnh dài ≈ độ xa của thẻ. */
  box: QrBox | null;
  /** Mức zoom camera lúc giải mã (null = camera không cho chỉnh zoom). */
  zoom: number | null;
  /** Độ lóa/độ nét vùng mã ở khung thấy mà đọc lỗi (chỉ ZXing-C++ trong Worker). */
  quality: QrQuality | null;
  /** Thời gian giải mã một khung (ms). */
  decodeMs: number;
  /** Thời gian chụp khung trên luồng giao diện (drawImage + getImageData). */
  captureMs: number;
};
export type QrScannerControls = { readonly engine: QrEngine; stop: () => void };

/** Cạnh dài tối đa (điểm ảnh) của ảnh đưa vào bộ giải mã ở từng lượt. */
const WIDE_MAX = 960;
const ZOOM_MAX = 960;
const FOCUS_SIDE = 720;
/** Lượt "zoom": phần giữa vùng đang hiện (khung ngắm chiếm 72%) — mã cầm xa nằm gọn trong đây. */
const ZOOM_PART = 0.5;
const ZOOM_SCALE_MAX = 2.5;
/** Số lượt "focus" thử quanh vị trí mã đọc lỗi trước khi quay lại lượt "zoom" giữa khung. */
const FOCUS_TRIES = 6;
const GAP_MS: Record<QrEngine, number> = { native: 50, wasm: 30, worker: 40, main: 140 };
/** Bắt được mã thì nghỉ ngắn trước lượt kế — đủ để hộp quét xử lý, đỡ tốn pin. */
const AFTER_HIT_MS = 300;
const WORKER_TIMEOUT_MS = 4000;
/** Số lần dựng lại Worker treo/lỗi trong một phiên trước khi đành giải mã trên luồng chính. */
const MAX_WORKER_RESTARTS = 3;

type NativeCode = { rawValue: string; boundingBox?: DOMRectReadOnly };
type NativeDetector = { detect: (source: HTMLVideoElement | HTMLCanvasElement) => Promise<NativeCode[]> };
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Zoom thật của camera (Chrome Android). iPhone Safari không hỗ trợ ổn định (đổi ống kính lung tung) → không dùng. */
function cameraZoom(track: MediaStreamTrack | undefined) {
  if (!track || typeof navigator === "undefined" || !/Android/i.test(navigator.userAgent)) return null;
  try {
    const range = (track.getCapabilities?.() as { zoom?: { min: number; max: number } } | undefined)?.zoom;
    if (!range || !(range.max >= 1.5)) return null;
    let current = (track.getSettings() as { zoom?: number }).zoom ?? range.min;
    return {
      get value() { return current; },
      min: range.min,
      max: range.max,
      set(next: number) {
        const value = clamp(next, range.min, range.max);
        if (Math.abs(value - current) < 0.1) return;
        current = value;
        void track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] }).catch(() => {});
      },
    };
  } catch { return null; }
}

export async function startQrScanner(
  video: HTMLVideoElement,
  onFrame: (frame: QrFrame, engine: QrEngine) => void,
  options: { forceEngine?: QrEngine; track?: MediaStreamTrack; onWorkerRestart?: () => void } = {},
): Promise<QrScannerControls> {
  const force = options.forceEngine;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let detector = force && force !== "native" ? null : await nativeDetector();
  let nativeErrors = 0;
  // Worker cả khi có BarcodeDetector: lượt phóng to trên Android cũng dùng ZXing-C++ (BarcodeDetector không báo
  // "thấy mà đọc lỗi" nên không biết chỗ để phóng).
  let worker = force === "main" ? null : createWorker();
  let workerDecoder: QrDecoderName = "js";
  const engineNow = (): QrEngine => detector ? "native" : worker ? (workerDecoder === "wasm" ? "wasm" : "worker") : "main";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; }
  const zoom = cameraZoom(options.track);

  // Worker chỉ có một khung đang giải mã tại một thời điểm. Worker treo/lỗi thì DỰNG LẠI (tối đa MAX_WORKER_RESTARTS
  // lần) — trước đây bỏ hẳn về zxing JS trên luồng chính cho cả phiên: log 16/10/2026 có 8 phiên iPhone như vậy,
  // chờ 34–172 s mới đọc được thẻ. Chỉ về luồng chính khi trình duyệt không tạo được Worker.
  let pending: ((result: DecodeResponse | null) => void) | null = null;
  let requestId = 0;
  let workerRestarts = 0;
  const dropWorker = () => {
    worker?.terminate(); worker = null;
    pending?.(null); pending = null;
  };
  const attachWorker = (next: Worker | null) => {
    worker = next;
    if (!next) return;
    next.onmessage = (event: MessageEvent<DecodeResponse>) => {
      if (worker !== next || event.data.id !== requestId) return;
      workerDecoder = event.data.decoder;
      pending?.(event.data); pending = null;
    };
    next.onerror = () => { if (worker === next) restartWorker(); };
  };
  const restartWorker = () => {
    dropWorker();
    if (stopped || workerRestarts >= MAX_WORKER_RESTARTS) return;
    workerRestarts++;
    workerDecoder = "js"; // Worker mới nạp lại .wasm (đã có trong bộ nhớ đệm), trong lúc đó giải mã bằng JS
    attachWorker(createWorker());
    options.onWorkerRestart?.();
  };
  attachWorker(worker);

  // Trang ẩn (khoá màn hình, chuyển ứng dụng) thì iOS tạm dừng Worker: không tính là treo, và sau khi hiện lại
  // chờ đủ WORKER_TIMEOUT_MS nữa mới kết luận.
  let visibleSince = performance.now();
  const onVisibility = () => { if (!document.hidden) visibleSince = performance.now(); };
  document.addEventListener("visibilitychange", onVisibility);

  /** Phần video đang hiện trong thẻ <video> (object-cover cắt hai mép) — điểm ảnh video. */
  function viewRect(): QrBox {
    const vw = video.videoWidth, vh = video.videoHeight, cw = video.clientWidth, ch = video.clientHeight;
    if (!cw || !ch) return { x: 0, y: 0, w: vw, h: vh };
    const s = Math.max(cw / vw, ch / vh);
    const w = Math.min(vw, cw / s), h = Math.min(vh, ch / s);
    return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
  }

  /** Vùng video và tỉ lệ vẽ cho từng loại lượt. */
  function region(crop: Exclude<QrCrop, "full">, focusBox: QrBox | null): { src: QrBox; scale: number } {
    const vw = video.videoWidth, vh = video.videoHeight;
    const view = viewRect();
    if (crop === "wide") return { src: view, scale: Math.min(1, WIDE_MAX / Math.max(view.w, view.h)) };
    if (crop === "focus" && focusBox) {
      const side = Math.max(focusBox.w, focusBox.h) * 1.6; // lề ~30% mỗi phía quanh mã
      const cx = focusBox.x + focusBox.w / 2, cy = focusBox.y + focusBox.h / 2;
      const x = clamp(cx - side / 2, 0, Math.max(0, vw - side)), y = clamp(cy - side / 2, 0, Math.max(0, vh - side));
      const src = { x, y, w: Math.min(side, vw), h: Math.min(side, vh) };
      return { src, scale: clamp(FOCUS_SIDE / Math.max(src.w, src.h), 0.5, 3) };
    }
    const w = view.w * ZOOM_PART, h = view.h * ZOOM_PART;
    const src = { x: view.x + (view.w - w) / 2, y: view.y + (view.h - h) / 2, w, h };
    return { src, scale: clamp(ZOOM_MAX / Math.max(w, h), 1, ZOOM_SCALE_MAX) };
  }

  function draw(src: QrBox, scale: number) {
    if (!ctx) return false;
    const dw = Math.max(1, Math.round(src.w * scale)), dh = Math.max(1, Math.round(src.h * scale));
    if (canvas.width !== dw || canvas.height !== dh) { canvas.width = dw; canvas.height = dh; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; }
    ctx.drawImage(video, src.x, src.y, src.w, src.h, 0, 0, dw, dh);
    return true;
  }

  /** Vị trí trên ảnh đã cắt → điểm ảnh video. */
  const toVideo = (box: QrBox | null | undefined, src: QrBox, scale: number): QrBox | null =>
    box ? { x: src.x + box.x / scale, y: src.y + box.y / scale, w: box.w / scale, h: box.h / scale } : null;

  async function decodeImage(image: ImageData, sharpen: boolean): Promise<(QrDecodeResult & { decodeMs: number }) | null> {
    if (worker) {
      const current = worker;
      return new Promise(resolve => {
        pending = resolve;
        const request: DecodeRequest = { id: ++requestId, buffer: image.data.buffer, width: image.width, height: image.height, sharpen, forceJs: force === "worker" };
        current.postMessage(request, [image.data.buffer]);
        // Worker không trả lời (treo, bị trình duyệt dừng) thì dựng lại, đừng để vòng quét đứng theo.
        const watch = () => {
          if (stopped || pending !== resolve || worker !== current) return;
          const waitMore = document.hidden ? 1000 : WORKER_TIMEOUT_MS - (performance.now() - visibleSince);
          if (waitMore > 0) setTimeout(watch, Math.min(waitMore, 1000));
          else restartWorker();
        };
        setTimeout(watch, WORKER_TIMEOUT_MS);
      });
    }
    const startedAt = performance.now();
    if (sharpen) sharpenRgba(image.data, image.width, image.height);
    return { ...decodeQrRgba(image.data, image.width, image.height), decodeMs: performance.now() - startedAt };
  }

  let turn = 0;
  let focus: { box: QrBox; left: number } | null = null;

  async function attempt(): Promise<QrFrame | null> {
    if (video.readyState < 2 || !video.videoWidth) return null;
    const even = turn++ % 2 === 0;
    const zoomValue = zoom ? zoom.value : null;
    // Không có Worker thì Android chỉ dùng BarcodeDetector — giải mã zxing JS trên luồng chính làm giật hình.
    if (detector && (even || !worker)) {
      // BarcodeDetector đọc thẳng cả khung video (độ phân giải gốc, thư viện hệ điều hành).
      const startedAt = performance.now();
      try {
        const codes = await detector.detect(video);
        nativeErrors = 0;
        const rect = codes[0]?.boundingBox;
        return { text: codes[0]?.rawValue ?? null, partial: false, crop: "full", box: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null, zoom: zoomValue, quality: null, decodeMs: performance.now() - startedAt, captureMs: 0 };
      } catch {
        // Có máy khai báo BarcodeDetector nhưng detect() lỗi liên tục (thiếu dịch vụ Google Play…) → chỉ dùng ZXing.
        if (++nativeErrors >= 5) detector = null;
        return null;
      }
    }
    const crop: Exclude<QrCrop, "full"> = !detector && even ? "wide" : focus ? "focus" : "zoom";
    const { src, scale } = region(crop, focus?.box ?? null);
    const capturedAt = performance.now();
    if (!ctx || !draw(src, scale)) return null;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const captureMs = performance.now() - capturedAt;
    const result = await decodeImage(image, crop !== "wide");
    if (!result) return null;
    return { text: result.text, partial: result.partial, crop, box: toVideo(result.box, src, scale), zoom: zoomValue, quality: result.quality ?? null, decodeMs: result.decodeMs, captureMs };
  }

  // Zoom camera thật (Android): mã thấy được mà nhỏ hơn ~20% cạnh ngắn vùng đang hiện → phóng để mã chiếm ~35%;
  // bắt được mã đã to (> 65%) hoặc 4 s không thấy gì → trả về mức nhỏ nhất cho người kế tiếp.
  let lastSeenAt = performance.now();
  function steerZoom(frame: QrFrame) {
    if (!zoom) return;
    const now = performance.now();
    if (!frame.box) {
      if (now - lastSeenAt > 4000 && zoom.value > zoom.min) zoom.set(zoom.min);
      return;
    }
    lastSeenAt = now;
    const view = viewRect();
    const fraction = Math.max(frame.box.w, frame.box.h) / Math.min(view.w, view.h);
    if (!frame.text && fraction > 0 && fraction < 0.2) { zoom.set(Math.min(3, zoom.value * 0.35 / fraction)); focus = null; }
    else if (frame.text && fraction > 0.65 && zoom.value > zoom.min) zoom.set(zoom.min);
  }

  function track(frame: QrFrame) {
    if (frame.text) { focus = null; return; }
    if (frame.box && frame.partial) { focus = { box: frame.box, left: FOCUS_TRIES }; return; }
    if (frame.crop === "focus" && focus && --focus.left <= 0) focus = null;
  }

  async function loop() {
    if (stopped) return;
    let hit = false;
    try {
      const frame = await attempt();
      if (frame && !stopped) {
        hit = Boolean(frame.text);
        track(frame);
        steerZoom(frame);
        onFrame(frame, engineNow());
      }
    } catch { /* khung lỗi (camera vừa đổi kích thước…) — thử khung kế */ }
    if (!stopped) timer = setTimeout(loop, hit ? AFTER_HIT_MS : GAP_MS[engineNow()]);
  }
  void loop();

  return {
    get engine() { return engineNow(); },
    stop() {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      dropWorker();
    },
  };
}

/** Ràng buộc mở camera cho hộp quét: camera sau, 1920×1080 (thẻ cầm xa vẫn đủ điểm ảnh mỗi ô QR). */
export const QR_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
};

/**
 * Bật lấy nét liên tục nếu camera cho chỉnh (Chrome Android); máy không hỗ trợ (iPhone tự lấy nét) thì bỏ qua.
 * Không chờ kết quả: lỗi ở đây không được làm hỏng việc mở camera.
 */
export function tuneQrCameraTrack(stream: MediaStream) {
  const track = stream.getVideoTracks()[0] as MediaStreamTrack | undefined;
  try {
    // focusMode chưa có trong kiểu DOM của TypeScript (Media Capture Image) → ép kiểu tại chỗ
    const capabilities = track?.getCapabilities?.() as { focusMode?: string[] } | undefined;
    if (track && capabilities?.focusMode?.includes("continuous")) {
      void track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
    }
  } catch { /* getCapabilities chưa có trên trình duyệt cũ */ }
}

/** Đèn pin camera sau (Chrome Android); null nếu máy/trình duyệt không cho bật (iPhone Safari chưa ổn định). */
export function qrCameraTorch(stream: MediaStream | null) {
  const track = stream?.getVideoTracks()[0];
  try {
    if (!track || !(track.getCapabilities?.() as { torch?: boolean } | undefined)?.torch) return null;
    return (on: boolean) => track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).then(() => true, () => false);
  } catch { return null; }
}
