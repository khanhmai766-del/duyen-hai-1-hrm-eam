/** Chỉ nhận lại cùng thẻ sau khi mã rời khung ít nhất 1 giây, hoặc chuyển sang thẻ khác. */
export const CAMERA_QR_ABSENCE_MS = 1000;

export class PermitCameraScanGuard {
  private visibleCode: string | null = null;
  private lastSeenAt = 0;
  private acceptedCode: string | null = null;

  observe(code: string | null, now: number): boolean {
    if (!code) {
      if (now - this.lastSeenAt >= CAMERA_QR_ABSENCE_MS) this.reset();
      return false;
    }
    if (code !== this.visibleCode || now - this.lastSeenAt >= CAMERA_QR_ABSENCE_MS) this.acceptedCode = null;
    this.visibleCode = code;
    this.lastSeenAt = now;
    return code !== this.acceptedCode;
  }

  accept(code: string) { this.acceptedCode = code; }

  reset() {
    this.visibleCode = null;
    this.acceptedCode = null;
    this.lastSeenAt = 0;
  }
}
