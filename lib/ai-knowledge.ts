/**
 * KHO TÀI LIỆU CHO TRỢ LÝ AI (RAG) — phần logic thuần: danh mục, phân quyền, chia đoạn, xếp hạng.
 * Không đụng DB hay mạng để test được bằng `npx tsx --test`. Phần đọc DB ở
 * lib/ai-knowledge-store.ts, phần gọi Gemini embedding ở lib/ai-embedding.ts.
 *
 * Vì sao không dùng pgvector: cả Postgres dev (embedded) lẫn production đều chưa cài extension, mà
 * kho chỉ vài trăm đoạn — duyệt hết vài trăm vector 768 chiều trong Node mất dưới 5 ms. Khi kho vượt
 * vài chục nghìn đoạn mới đáng cài pgvector.
 */

/** Nhóm tài liệu. Mỗi nhóm một quyền riêng `ai-chat-tailieu-<nhóm>` (lib/rbac-defaults.ts). */
export const AI_KNOWLEDGE_CATEGORIES = {
  "vat-tu": "Quy trình vật tư",
  pccc: "Sổ thiết bị PCCC",
  tbycnn: "Sổ thiết bị TBYCNN",
  "an-toan": "Sổ cấp phiếu công tác",
} as const;

export type AiKnowledgeCategory = keyof typeof AI_KNOWLEDGE_CATEGORIES;

export function isAiKnowledgeCategory(value: string): value is AiKnowledgeCategory {
  return Object.prototype.hasOwnProperty.call(AI_KNOWLEDGE_CATEGORIES, value);
}

export function aiKnowledgePermissionId(category: AiKnowledgeCategory) {
  return `ai-chat-tailieu-${category}`;
}

// ───────────────────────────── Chia đoạn ─────────────────────────────

/** Tăng khi đổi cách chia đoạn: nội dung băm khác đi nên lần nạp sau tự tạo lại mọi đoạn. */
export const AI_KNOWLEDGE_CHUNKER_VERSION = 1;
/** Đoạn ~900 ký tự ≈ 300 token: đủ trọn một ý, nhiều đoạn vẫn vừa ngân sách 4.500 ký tự của tool. */
export const AI_KNOWLEDGE_CHUNK_TARGET = 900;
export const AI_KNOWLEDGE_CHUNK_MAX = 1_400;
/** Mang đuôi đoạn trước sang đầu đoạn sau để câu cắt ngang ranh giới vẫn tìm được. */
export const AI_KNOWLEDGE_CHUNK_OVERLAP = 150;

export type AiKnowledgeChunkDraft = { chunkIndex: number; heading: string | null; content: string };

type Block = { heading: string | null; text: string };

export function normalizeKnowledgeText(raw: string) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Khối văn bản dài hơn trần thì cắt theo câu, câu vẫn dài quá thì cắt cứng. */
function splitLong(text: string, max: number) {
  if (text.length <= max) return [text];
  const pieces: string[] = [];
  let current = "";
  for (const sentence of text.split(/(?<=[.!?;:])\s+|\n/)) {
    if (!sentence.trim()) continue;
    if (current && current.length + sentence.length + 1 > max) {
      pieces.push(current);
      current = "";
    }
    if (sentence.length > max) {
      for (let i = 0; i < sentence.length; i += max) pieces.push(sentence.slice(i, i + max));
      continue;
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Tách văn bản thành khối theo dòng trống, mỗi khối nhớ tiêu đề markdown gần nhất phía trên. */
function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  const path: string[] = [];
  for (const paragraph of normalizeKnowledgeText(text).split(/\n\n/)) {
    const lines = paragraph.split("\n");
    const body: string[] = [];
    for (const line of lines) {
      const heading = /^(#{1,4})\s+(.+?)\s*#*$/.exec(line);
      if (heading) {
        // Tiêu đề cấp 1 là tên tài liệu — đã có ở trường title, không lặp vào từng đoạn.
        const level = heading[1].length;
        path.length = Math.max(0, level - 2);
        if (level > 1) path[level - 2] = heading[2];
        continue;
      }
      body.push(line);
    }
    const joined = body.join("\n").trim();
    if (!joined) continue;
    const heading = path.filter(Boolean).join(" › ") || null;
    for (const piece of splitLong(joined, AI_KNOWLEDGE_CHUNK_MAX)) blocks.push({ heading, text: piece });
  }
  return blocks;
}

/**
 * Đuôi dài tối đa `size` ký tự, bắt đầu ở ranh giới từ, gộp khoảng trắng. Văn bản không dài hơn
 * gấp đôi `size` thì không mang: chép gần hết đoạn trước sang là trùng lặp chứ không phải chồng mép.
 */
function tail(text: string, size: number) {
  const flat = text.replace(/^…/, "").replace(/\s+/g, " ").trim();
  if (flat.length <= size * 2) return "";
  const cut = flat.slice(-size);
  const boundary = cut.search(/\s/);
  return boundary >= 0 ? cut.slice(boundary + 1) : cut;
}

export function chunkKnowledgeText(text: string): AiKnowledgeChunkDraft[] {
  const chunks: AiKnowledgeChunkDraft[] = [];
  let heading: string | null = null;
  let parts: string[] = [];
  let size = 0;
  /** `parts` chỉ còn phần chồng mang từ đoạn trước — đứng một mình thì không phải đoạn mới. */
  let carryOnly = false;

  const flush = () => {
    if (parts.length && !carryOnly) chunks.push({ chunkIndex: chunks.length, heading, content: parts.join("\n\n") });
    parts = [];
    size = 0;
    carryOnly = false;
  };
  /** Mang đuôi `previous` sang đầu đoạn mới, nếu cộng khối kế tiếp (`nextLength`) vẫn trong trần. */
  const carry = (previous: string, nextLength = 0) => {
    const overlap = tail(previous, AI_KNOWLEDGE_CHUNK_OVERLAP);
    if (!overlap || overlap.length + 1 + nextLength + 2 > AI_KNOWLEDGE_CHUNK_MAX) return;
    parts = [`…${overlap}`];
    size = parts[0].length;
    carryOnly = true;
  };

  for (const block of blocksOf(text)) {
    const headingChanged = block.heading !== heading;
    if (parts.length && (headingChanged || size + block.text.length + 2 > AI_KNOWLEDGE_CHUNK_MAX)) {
      const previous = parts.join("\n\n");
      const wasCarryOnly = carryOnly;
      flush();
      // Chỉ mang phần chồng khi vẫn cùng mục — sang mục mới thì phần đuôi mục cũ là nhiễu.
      if (!headingChanged && !wasCarryOnly) carry(previous, block.text.length);
    }
    heading = block.heading;
    parts.push(block.text);
    carryOnly = false;
    size += block.text.length + 2;
    if (size >= AI_KNOWLEDGE_CHUNK_TARGET) {
      const previous = parts.join("\n\n");
      flush();
      carry(previous);
    }
  }
  flush();
  return chunks;
}

/** Chuỗi đưa đi embedding: kèm tên tài liệu và mục để đoạn ngắn vẫn mang đủ ngữ cảnh. */
export function knowledgeEmbeddingText(title: string, chunk: Pick<AiKnowledgeChunkDraft, "heading" | "content">) {
  return [title, chunk.heading, chunk.content].filter(Boolean).join("\n");
}

// ───────────────────────────── Xếp hạng ─────────────────────────────

export type AiKnowledgeSearchChunk = {
  documentId: string;
  chunkIndex: number;
  category: string;
  title: string;
  heading: string | null;
  content: string;
  embedding: number[];
};

/**
 * Điểm cosine tối thiểu để coi là liên quan. Đo 17/09/2026 trên kho 61 đoạn (gemini-embedding-001,
 * 768 chiều): đoạn khớp nhất của 7 câu CÓ đáp án đạt 0,681–0,775; của 4 câu không liên quan (đổi
 * ảnh đại diện, ai trực ca, khiếm khuyết S1, thời tiết) chỉ 0,573–0,639; câu bẫy "các bước chữa
 * cháy" 0,625. Ngưỡng nằm giữa khe đó. Khe hẹp — nạp thêm nhiều tài liệu thì đo lại.
 */
export const AI_KNOWLEDGE_MIN_SCORE = 0.66;
export const AI_KNOWLEDGE_MAX_RESULTS = 4;
/** Tối đa 2 đoạn mỗi tài liệu, để một tài liệu dài không chiếm hết chỗ của tài liệu khác. */
export const AI_KNOWLEDGE_MAX_PER_DOCUMENT = 2;

export function normalizeVector(values: number[]) {
  const length = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return length > 0 ? values.map((value) => value / length) : values;
}

export function dotProduct(left: number[], right: number[]) {
  const size = Math.min(left.length, right.length);
  let sum = 0;
  for (let i = 0; i < size; i += 1) sum += left[i] * right[i];
  return sum;
}

export function rankKnowledgeChunks<T extends AiKnowledgeSearchChunk>(
  query: number[],
  chunks: T[],
  options: { categories: Set<string>; limit?: number; minScore?: number; perDocument?: number }
) {
  const { categories, limit = AI_KNOWLEDGE_MAX_RESULTS, minScore = AI_KNOWLEDGE_MIN_SCORE, perDocument = AI_KNOWLEDGE_MAX_PER_DOCUMENT } = options;
  const scored = chunks
    // Lọc quyền TRƯỚC khi tính điểm: đoạn thuộc nhóm không được đọc không bao giờ vào kết quả.
    .filter((chunk) => categories.has(chunk.category) && chunk.embedding.length === query.length)
    .map((chunk) => ({ chunk, score: dotProduct(query, chunk.embedding) }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score);

  const perDoc = new Map<string, number>();
  const picked: Array<{ chunk: T; score: number }> = [];
  for (const row of scored) {
    const used = perDoc.get(row.chunk.documentId) ?? 0;
    if (used >= perDocument) continue;
    perDoc.set(row.chunk.documentId, used + 1);
    picked.push(row);
    if (picked.length >= limit) break;
  }
  return picked;
}

/** Đoạn trích gửi cho mô hình: dài hơn trần chung 200 ký tự của các tool khác vì đây là nội dung chính. */
export const AI_KNOWLEDGE_EXCERPT_CHARS = 1_000;

export function clipKnowledgeExcerpt(text: string, max = AI_KNOWLEDGE_EXCERPT_CHARS) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

// ───────────────────────────── Dọn chữ trích từ PDF ─────────────────────────────

/**
 * Bỏ phần rác trình duyệt/pdf-parse chèn khi in HTML ra PDF: dấu trang "-- 1 of 25 --", dòng
 * đầu trang ngày giờ in, đường dẫn file:/// (lộ đường dẫn máy người in) và dòng chữ giãn cách kiểu
 * "C Ô N G T Y …" chỉ để trang trí.
 */
export function cleanExtractedPdfText(raw: string) {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n").filter((line) => {
    const trimmed = line.trim();
    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(trimmed)) return false;
    if (/^file:\/\//i.test(trimmed) || /\sfile:\/\/\S+/i.test(trimmed)) return false;
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(\s*[AP]M)?\b/i.test(trimmed)) return false;
    const tokens = trimmed.split(/\s+/);
    if (tokens.length >= 8 && tokens.filter((token) => token.length === 1).length / tokens.length >= 0.8) return false;
    return true;
  });
  return normalizeKnowledgeText(lines.join("\n"));
}
