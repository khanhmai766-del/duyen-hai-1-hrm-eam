import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { createAiLimiter, parseAiReviewRequest, sharedGeminiModels, type AiReviewRequest } from "@/modules/chuan-the-thuc/ai-request";
import { aiReview } from "@/modules/chuan-the-thuc/vendor/gemini.js";

export const dynamic = "force-dynamic";

// Thư viện là JS sinh tự động: TypeScript suy sai kiểu tham số mặc định nên khai rõ tại đây.
const reviewWithGemini = aiReview as unknown as (
  paragraphs: AiReviewRequest["paragraphs"],
  options: { apiKeys: string[]; models: string[]; passes: number; standard: string; kind: string },
) => Promise<{ suggestions: unknown[]; passes: number; rejected: number; conflicts: number; models: string[] }>;

const limiter = createAiLimiter();
// nginx ngắt sau 60 giây không nhận được byte nào, còn AI có thể chạy vài phút.
// Khoảng trắng đứng trước JSON vẫn hợp lệ nên dùng làm tín hiệu giữ kết nối.
const KEEP_ALIVE_MS = 15_000;

const sharedKey = () => process.env.CHUAN_THE_THUC_GEMINI_API_KEY?.trim() ?? "";

export async function GET() {
  return handle(async () => {
    await requireUser();
    return ok({ enabled: Boolean(sharedKey()), model: sharedGeminiModels()[0] });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const apiKey = sharedKey();
    if (!apiKey) return fail("Máy chủ chưa cấu hình khoá AI dùng chung.", 503);

    const parsed = parseAiReviewRequest(await req.json().catch(() => null));
    if ("error" in parsed) return fail(parsed.error, 400);
    const { paragraphs, passes, kind, standard } = parsed.data;

    const blocked = limiter.acquire(user.id);
    if (blocked) return fail(blocked, 429);
    await audit(user.id, "AI_REVIEW", "ChuanTheThuc", undefined, `${kind === "style" ? "Chuẩn hoá câu chữ" : "Chính tả"} · ${paragraphs.length} đoạn`);

    const encoder = new TextEncoder();
    let open = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const send = (controller: ReadableStreamDefaultController<Uint8Array>, text: string) => {
      if (open) controller.enqueue(encoder.encode(text));
    };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        send(controller, " "); // gửi ngay để phản hồi bắt đầu, không chờ AI
        timer = setInterval(() => send(controller, " "), KEEP_ALIVE_MS);
        try {
          const { suggestions, passes: done, rejected, conflicts, models } = await reviewWithGemini(paragraphs, {
            apiKeys: [apiKey], models: sharedGeminiModels(), passes, standard, kind,
          });
          send(controller, JSON.stringify({ data: { suggestions, passes: done, rejected, conflicts, models }, error: null }));
        } catch (error) {
          // Thông báo gốc có đuôi khoá và chi tiết từ Google: chỉ ghi log, không trả về trình duyệt.
          console.error("[chuan-the-thuc] AI lỗi:", String(error instanceof Error ? error.message : error).replaceAll(apiKey, "***"));
          send(controller, JSON.stringify({ data: null, error: "AI đang quá tải hoặc hết hạn mức. Hãy thử lại sau ít phút." }));
        } finally {
          clearInterval(timer);
          limiter.release(user.id);
          if (open) controller.close();
          open = false;
        }
      },
      cancel() {
        open = false;
        clearInterval(timer);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // no-transform: gzip sẽ giữ lại các khoảng trắng và làm mất tác dụng giữ kết nối.
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
