import type { QrEngine, QrFrame } from "@/lib/qr-camera";

/*
 * Đo thời gian của hộp quét thẻ PCT để tách hai loại chậm người dùng báo:
 *   - "camera lâu mới bắt được mã": waitMs / attempts / struggleMs (thấy hình QR mà chưa đọc được bao lâu);
 *   - "bắt được mã rồi mà chờ lâu": lookupMs + actionMs (mạng + máy chủ) và stallMs (giao diện đứng hình).
 * Gửi theo lô về /api/work-permits/scan-metrics — máy chủ chỉ ghi một dòng log, không lưu DB.
 */

export type ScanMetricResult = "in" | "out" | "info" | "warn" | "block";
export type ScanMetricRow = {
  source: "camera" | "manual";
  engine: QrEngine | null;
  /** Từ kết quả trước (hoặc lúc camera bật) tới lúc bắt được mã — gồm cả lúc người đưa thẻ vào khung. */
  waitMs: number;
  /** Số khung đã giải mã trong khoảng chờ đó. */
  attempts: number;
  /** Từ khung đầu tiên thấy hình QR nhưng chưa đọc được tới lúc đọc được; null = đọc được ngay hoặc không biết. */
  struggleMs: number | null;
  lookupMs: number;
  actionMs: number;
  /** Bắt được mã → hiện kết quả. */
  totalMs: number;
  /** Khung hình đứng lâu nhất (luồng giao diện bị nghẽn) trong lượt này. */
  stallMs: number;
  result: ScanMetricResult;
};
export type ScanMetricSession = {
  permitId: string;
  engine: QrEngine | null;
  cameraStartMs: number | null;
  video: string | null;
  attempts: number;
  decodeAvgMs: number | null;
  decodeP95Ms: number | null;
  captureAvgMs: number | null;
  /** Số lần khung hình đứng > STALL_MS và lần lâu nhất. */
  stalls: number;
  maxStallMs: number;
  openMs: number;
};
export type ScanMetricsPayload = { session: ScanMetricSession; scans: ScanMetricRow[]; final: boolean };

export const STALL_MS = 250;
const FLUSH_EVERY = 15;
const SAMPLE_LIMIT = 600;

export class ScanMetricsCollector {
  private openedAt = performance.now();
  private cameraRequestedAt: number | null = null;
  private engine: QrEngine | null = null;
  private cameraStartMs: number | null = null;
  private video: string | null = null;
  private attempts = 0;
  private decodeSamples: number[] = [];
  private captureTotal = 0;
  private captureCount = 0;
  private stalls = 0;
  private maxStall = 0;
  private cycleStart = performance.now();
  private cycleAttempts = 0;
  private cycleFirstPartial: number | null = null;
  private cycleStall = 0;
  private rows: ScanMetricRow[] = [];
  private sentAnything = false;

  constructor(private permitId: string, private send: (payload: ScanMetricsPayload) => void) {}

  cameraStarting() { this.cameraRequestedAt = performance.now(); }

  cameraOn(engine: QrEngine, width: number, height: number) {
    const now = performance.now();
    this.engine = engine;
    this.video = width && height ? `${width}x${height}` : null;
    if (this.cameraRequestedAt !== null) this.cameraStartMs = Math.round(now - this.cameraRequestedAt);
    this.startCycle(now);
  }

  frame(frame: QrFrame, engine: QrEngine) {
    this.engine = engine;
    this.attempts++; this.cycleAttempts++;
    if (this.decodeSamples.length < SAMPLE_LIMIT) this.decodeSamples.push(frame.decodeMs);
    if (frame.captureMs) { this.captureTotal += frame.captureMs; this.captureCount++; }
    if (frame.partial && this.cycleFirstPartial === null) this.cycleFirstPartial = performance.now();
  }

  stall(ms: number) {
    this.stalls++;
    this.maxStall = Math.max(this.maxStall, ms);
    this.cycleStall = Math.max(this.cycleStall, ms);
  }

  /** Lúc bắt được mã: chốt số đo của khoảng chờ. */
  detected(source: "camera" | "manual") {
    const now = performance.now();
    return {
      at: now,
      waitMs: Math.round(now - this.cycleStart),
      attempts: source === "camera" ? this.cycleAttempts : 0,
      struggleMs: source === "camera" && this.cycleFirstPartial !== null ? Math.round(now - this.cycleFirstPartial) : null,
    };
  }

  scanned(detected: ReturnType<ScanMetricsCollector["detected"]>, row: { source: "camera" | "manual"; lookupMs: number; actionMs: number; result: ScanMetricResult }) {
    const now = performance.now();
    this.rows.push({
      source: row.source, engine: row.source === "camera" ? this.engine : null,
      waitMs: detected.waitMs, attempts: detected.attempts, struggleMs: detected.struggleMs,
      lookupMs: Math.round(row.lookupMs), actionMs: Math.round(row.actionMs), totalMs: Math.round(now - detected.at),
      stallMs: Math.round(this.cycleStall), result: row.result,
    });
    this.startCycle(now);
    if (this.rows.length >= FLUSH_EVERY) this.flush(false);
  }

  /** Gửi lô hiện có; `final` khi đóng hộp quét / rời trang. Phiên không quét được thẻ nào vẫn gửi một lần để biết camera mở mất bao lâu. */
  flush(final: boolean) {
    if (!this.rows.length && (this.sentAnything || !final || this.attempts === 0)) return;
    const sorted = [...this.decodeSamples].sort((a, b) => a - b);
    const avg = (total: number, count: number) => count ? Math.round(total / count * 10) / 10 : null;
    this.send({
      final,
      scans: this.rows,
      session: {
        permitId: this.permitId, engine: this.engine, cameraStartMs: this.cameraStartMs, video: this.video, attempts: this.attempts,
        decodeAvgMs: avg(sorted.reduce((sum, value) => sum + value, 0), sorted.length),
        decodeP95Ms: sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]) : null,
        captureAvgMs: avg(this.captureTotal, this.captureCount),
        stalls: this.stalls, maxStallMs: Math.round(this.maxStall), openMs: Math.round(performance.now() - this.openedAt),
      },
    });
    this.rows = [];
    this.sentAnything = true;
  }

  private startCycle(now: number) {
    this.cycleStart = now; this.cycleAttempts = 0; this.cycleFirstPartial = null; this.cycleStall = 0;
  }
}
