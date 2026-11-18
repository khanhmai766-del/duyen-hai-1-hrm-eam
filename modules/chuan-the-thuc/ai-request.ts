import { z } from "zod";

// Khoá Gemini dùng chung có hạn mức: chặn văn bản quá lớn và chặn một người dùng hết lượt của cả nhà máy.
export const MAX_PARAGRAPHS = 2000;
export const MAX_TOTAL_CHARS = 200_000;
export const USER_REQUESTS_PER_HOUR = 20;
export const MAX_RUNNING_REVIEWS = 4;
const HOUR_MS = 3_600_000;

export const DEFAULT_SHARED_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];

const requestSchema = z.object({
  paragraphs: z.array(z.object({
    i: z.number().int().min(0),
    text: z.string().max(50_000),
    role: z.string().max(200).optional(),
  })).min(1).max(MAX_PARAGRAPHS),
  passes: z.number().int().min(1).max(2).default(1),
  kind: z.enum(["spelling", "style"]).default("spelling"),
  standard: z.enum(["evn", "nd30", "nddh"]).default("evn"),
});

export type AiReviewRequest = z.infer<typeof requestSchema>;

export function parseAiReviewRequest(body: unknown): { data: AiReviewRequest } | { error: string } {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return { error: "Dữ liệu văn bản gửi lên không hợp lệ hoặc có quá nhiều đoạn." };
  const chars = parsed.data.paragraphs.reduce((total, p) => total + p.text.length, 0);
  if (chars > MAX_TOTAL_CHARS) return { error: "Văn bản quá dài để rà soát bằng AI dùng chung. Hãy chia nhỏ văn bản." };
  return { data: parsed.data };
}

export function sharedGeminiModels(value = process.env.CHUAN_THE_THUC_GEMINI_MODELS) {
  const models = (value ?? "").split(",").map((m) => m.trim()).filter((m) => /^gemini-[a-z0-9.-]+$/i.test(m));
  return models.length ? models.slice(0, 3) : DEFAULT_SHARED_MODELS;
}

/** Giới hạn trong bộ nhớ: production chạy đúng một tiến trình pm2 (fork), xem ecosystem.config.js. */
export function createAiLimiter(now: () => number = Date.now) {
  const history = new Map<string, number[]>();
  const running = new Set<string>();
  return {
    acquire(userId: string): string | null {
      if (running.has(userId)) return "Bạn đang có một lượt rà soát AI chưa xong. Hãy chờ lượt đó hoàn tất.";
      if (running.size >= MAX_RUNNING_REVIEWS) return "AI dùng chung đang bận. Hãy thử lại sau ít phút.";
      const since = now() - HOUR_MS;
      const recent = (history.get(userId) ?? []).filter((time) => time > since);
      if (recent.length >= USER_REQUESTS_PER_HOUR) {
        history.set(userId, recent);
        return `Bạn đã dùng hết ${USER_REQUESTS_PER_HOUR} lượt rà soát AI trong một giờ. Hãy thử lại sau.`;
      }
      history.set(userId, [...recent, now()]);
      running.add(userId);
      return null;
    },
    release(userId: string) {
      running.delete(userId);
    },
  };
}
