import { normalizeVector } from "@/lib/ai-knowledge";

/**
 * EMBEDDING cho kho tài liệu AI — Gemini REST, không kéo SDK.
 *
 * Key riêng `AI_KB_EMBEDDING_GEMINI_API_KEY`, KHÔNG dùng `GEMINI_API_KEY` (ngân sách TCMS) hay key
 * chấm điểm. 768 chiều (cắt Matryoshka từ 3.072, Google khuyến nghị mức này) nên phải chuẩn hoá lại
 * độ dài 1 sau khi cắt.
 *
 * Đổi model hay số chiều ⇒ mọi vector cũ vô nghĩa: ingest so `embeddingModel` + băm nội dung và tự
 * nạp lại toàn bộ.
 */
export const AI_EMBEDDING_MODEL = "gemini-embedding-001";
export const AI_EMBEDDING_DIMENSIONS = 768;
const BATCH_SIZE = 100;

export class AiEmbeddingNotConfiguredError extends Error {
  constructor() {
    super("Thiếu AI_KB_EMBEDDING_GEMINI_API_KEY");
  }
}

export type AiEmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postBatch(apiKey: string, body: unknown, timeoutMs: number) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${AI_EMBEDDING_MODEL}:batchEmbedContents`;
  const backoff = [2_000, 5_000, 15_000];
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return (await response.json()) as { embeddings?: Array<{ values?: number[] }> };
    if ((response.status === 429 || response.status === 503) && attempt < backoff.length) {
      await sleep(backoff[attempt]);
      continue;
    }
    // Chỉ lấy message của Google, không kèm URL hay header (có key).
    const detail = await response.json().then((json: { error?: { message?: string } }) => json.error?.message).catch(() => null);
    throw new Error(`Gemini embedding HTTP ${response.status}${detail ? `: ${String(detail).slice(0, 200)}` : ""}`);
  }
}

export async function embedTexts(
  texts: string[],
  task: AiEmbeddingTask,
  options: { titles?: string[]; timeoutMs?: number } = {}
): Promise<number[][]> {
  const apiKey = process.env.AI_KB_EMBEDDING_GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AiEmbeddingNotConfiguredError();
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    const data = await postBatch(apiKey, {
      requests: batch.map((text, index) => ({
        model: `models/${AI_EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType: task,
        outputDimensionality: AI_EMBEDDING_DIMENSIONS,
        // Tiêu đề chỉ hợp lệ với RETRIEVAL_DOCUMENT và giúp embedding bám đúng tài liệu.
        ...(task === "RETRIEVAL_DOCUMENT" && options.titles?.[start + index] ? { title: options.titles[start + index] } : {}),
      })),
    }, options.timeoutMs ?? 60_000);
    const embeddings = data.embeddings ?? [];
    if (embeddings.length !== batch.length) throw new Error(`Gemini embedding trả ${embeddings.length}/${batch.length} vector`);
    for (const embedding of embeddings) {
      const values = embedding.values ?? [];
      if (values.length !== AI_EMBEDDING_DIMENSIONS) throw new Error(`Gemini embedding trả ${values.length} chiều, cần ${AI_EMBEDDING_DIMENSIONS}`);
      vectors.push(normalizeVector(values));
    }
  }
  return vectors;
}
