export class AiQueueTimeoutError extends Error {}

export type AiChatQueueOptions = {
  /** Số câu hỏi gọi n8n cùng lúc. */
  maxConcurrent: number;
  /** Số câu hỏi được BẮT ĐẦU trong một cửa sổ thời gian (mặc định 1 phút). */
  maxPerWindow: number;
  windowMs?: number;
  /** Chờ quá lâu thì báo bận thay vì bắt người dùng nhìn vòng quay mãi. */
  timeoutMs: number;
};

/**
 * Hàng đợi lượt gọi trợ lý AI — vào trước ra trước.
 *
 * Gói miễn phí giới hạn cả số lượt gọi mô hình mỗi phút (Gemini Flash ~10, Groq ~30). Một câu hỏi
 * tốn 2–3 lượt gọi mô hình, nên giờ cao điểm mà cho mọi câu hỏi chạy ngay là cùng nhận 429.
 * Hàng đợi giữ hai rào: số câu hỏi chạy đồng thời và số câu hỏi bắt đầu trong mỗi phút; ai tới
 * sau thì chờ vài giây (được báo vị trí) thay vì ăn lỗi.
 *
 * Nằm trong bộ nhớ tiến trình: pm2 chạy fork 1 instance nên một hàng đợi là đủ.
 */
export function createAiChatQueue(options: AiChatQueueOptions) {
  const windowMs = options.windowMs ?? 60_000;
  let running = 0;
  const starts: number[] = [];
  const tickets: object[] = [];
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const prune = (now: number) => {
    while (starts.length && starts[0] <= now - windowMs) starts.shift();
  };

  function waitForChange(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      const cleanup = () => {
        clearTimeout(timer);
        listeners.delete(done);
        signal.removeEventListener("abort", onAbort);
      };
      const done = () => {
        cleanup();
        resolve();
      };
      const onAbort = () => {
        cleanup();
        reject(signal.reason);
      };
      const timer = setTimeout(done, Math.max(10, ms));
      listeners.add(done);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  /**
   * Xin một lượt. Trả về hàm `release` (gọi nhiều lần vô hại). `onWaiting(vị trí)` được gọi mỗi
   * khi vị trí trong hàng thay đổi — vị trí 1 nghĩa là người kế tiếp.
   */
  async function acquire(signal: AbortSignal, onWaiting?: (position: number) => void) {
    const ticket = {};
    tickets.push(ticket);
    const deadline = Date.now() + options.timeoutMs;
    let reported = 0;
    try {
      for (;;) {
        const now = Date.now();
        prune(now);
        if (tickets[0] === ticket && running < options.maxConcurrent && starts.length < options.maxPerWindow) {
          tickets.shift();
          running += 1;
          starts.push(now);
          // Người kế tiếp có thể cũng chạy được ngay (còn chỗ) — đánh thức để khỏi chờ hết nhịp.
          notify();
          let released = false;
          return () => {
            if (released) return;
            released = true;
            running -= 1;
            notify();
          };
        }
        const position = tickets.indexOf(ticket) + 1;
        if (position !== reported) {
          reported = position;
          onWaiting?.(position);
        }
        if (now >= deadline) throw new AiQueueTimeoutError();
        const untilWindowFrees = starts.length >= options.maxPerWindow ? starts[0] + windowMs - now : Infinity;
        await waitForChange(Math.min(deadline - now, untilWindowFrees, 5_000), signal);
      }
    } finally {
      const index = tickets.indexOf(ticket);
      if (index >= 0) {
        tickets.splice(index, 1);
        notify();
      }
    }
  }

  return {
    acquire,
    snapshot: () => ({ running, waiting: tickets.length }),
  };
}
