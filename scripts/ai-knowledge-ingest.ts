/**
 * NẠP KHO TÀI LIỆU CHO TRỢ LÝ AI (RAG).
 *
 *   npm run ai:knowledge-ingest -- --dry-run   # đọc + chia đoạn, KHÔNG gọi Gemini, KHÔNG ghi DB
 *   npm run ai:knowledge-ingest                # nạp tài liệu mới hoặc đã đổi nội dung
 *   npm run ai:knowledge-ingest -- --force     # tạo lại vector cho MỌI tài liệu
 *   npm run ai:knowledge-ingest -- --prune     # xoá khỏi DB tài liệu không còn tệp nguồn
 *
 * Nguồn: mọi .md/.txt/.pdf trong ai-knowledge-source/<nhóm>/ (tên thư mục = nhóm, xem
 * AI_KNOWLEDGE_CATEGORIES) cộng các tệp khai trong ai-knowledge-source/sources.json (PDF đã công
 * khai trong public/).
 *
 * Idempotent: băm nội dung + tiêu đề + model embedding + phiên bản bộ chia đoạn; trùng thì bỏ qua,
 * không tốn lượt Gemini. Gọi Gemini XONG mới ghi DB, và ghi tài liệu + các đoạn trong MỘT giao dịch —
 * lỗi giữa chừng thì tài liệu giữ nguyên bản cũ, lần chạy sau nạp lại.
 *
 * DB không phải localhost (production) thì phải thêm --yes: tránh lỡ tay nạp vào DB thật khi .env
 * đang trỏ nhầm. Chatbox thấy tài liệu mới sau tối đa 5 phút (cache trong tiến trình website).
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  AI_KNOWLEDGE_CATEGORIES,
  AI_KNOWLEDGE_CHUNKER_VERSION,
  chunkKnowledgeText,
  cleanExtractedPdfText,
  isAiKnowledgeCategory,
  knowledgeEmbeddingText,
  normalizeKnowledgeText,
  type AiKnowledgeCategory,
} from "../lib/ai-knowledge";
import { AI_EMBEDDING_DIMENSIONS, AI_EMBEDDING_MODEL, embedTexts } from "../lib/ai-embedding";

loadEnvConfig(process.cwd());

const args = new Set(process.argv.slice(2));
for (const flag of args) {
  if (!["--dry-run", "--force", "--prune", "--yes"].includes(flag)) {
    console.error(`DỪNG: không hiểu tham số ${flag}`);
    process.exit(1);
  }
}
const DRY_RUN = args.has("--dry-run");
const FORCE = args.has("--force");
const PRUNE = args.has("--prune");

const SOURCE_DIR = "ai-knowledge-source";
const EXTENSIONS = new Set([".md", ".txt", ".pdf"]);

type Source = { sourcePath: string; category: AiKnowledgeCategory; title?: string; publicUrl?: string | null };

function fail(message: string): never {
  console.error(`DỪNG: ${message}`);
  process.exit(1);
}

function discoverSources(): Source[] {
  const sources: Source[] = [];
  if (!existsSync(SOURCE_DIR)) fail(`không thấy thư mục ${SOURCE_DIR}/ — chạy script từ gốc repo`);

  for (const entry of readdirSync(SOURCE_DIR)) {
    const dir = path.posix.join(SOURCE_DIR, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (!isAiKnowledgeCategory(entry)) {
      fail(`thư mục ${dir}/ không phải nhóm tài liệu hợp lệ (${Object.keys(AI_KNOWLEDGE_CATEGORIES).join(", ")})`);
    }
    for (const file of readdirSync(dir).sort()) {
      if (EXTENSIONS.has(path.extname(file).toLowerCase())) sources.push({ sourcePath: path.posix.join(dir, file), category: entry });
    }
  }

  const manifestPath = path.posix.join(SOURCE_DIR, "sources.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { files?: Array<Record<string, string>> };
    for (const file of manifest.files ?? []) {
      if (!file.path || !existsSync(file.path)) fail(`sources.json khai tệp không tồn tại: ${file.path}`);
      if (!isAiKnowledgeCategory(file.category ?? "")) fail(`sources.json: nhóm không hợp lệ "${file.category}" cho ${file.path}`);
      if (file.publicUrl && !/^\/[^/]/.test(file.publicUrl)) fail(`sources.json: publicUrl phải là đường dẫn nội bộ: ${file.publicUrl}`);
      sources.push({
        sourcePath: file.path.replace(/\\/g, "/"),
        category: file.category as AiKnowledgeCategory,
        title: file.title,
        publicUrl: file.publicUrl ?? null,
      });
    }
  }

  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source.sourcePath)) fail(`tệp khai trùng: ${source.sourcePath}`);
    seen.add(source.sourcePath);
  }
  return sources;
}

async function readSource(source: Source) {
  const extension = path.extname(source.sourcePath).toLowerCase();
  let content: string;
  if (extension === ".pdf") {
    const { PDFParse } = await import("pdf-parse");
    const { getData } = await import("pdf-parse/worker");
    PDFParse.setWorker(getData());
    const parser = new PDFParse({ data: readFileSync(source.sourcePath) });
    try {
      content = cleanExtractedPdfText((await parser.getText()).text ?? "");
    } finally {
      await parser.destroy();
    }
  } else {
    content = normalizeKnowledgeText(readFileSync(source.sourcePath, "utf8"));
  }
  const heading = /^#\s+(.+)$/m.exec(content)?.[1]?.trim();
  const title = source.title ?? heading ?? path.basename(source.sourcePath, extension);
  return { content, title };
}

function describeDatabase() {
  const raw = process.env.DATABASE_URL ?? "";
  try {
    const url = new URL(raw);
    return { label: `${url.hostname}:${url.port || "5432"}${url.pathname}`, local: ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) };
  } catch {
    return fail("DATABASE_URL không hợp lệ hoặc chưa đặt");
  }
}

async function main() {
  const database = describeDatabase();
  const sources = discoverSources();
  console.log(`DB       : ${database.label}${database.local ? "" : "  (KHÔNG phải localhost)"}`);
  console.log(`Embedding: ${AI_EMBEDDING_MODEL} · ${AI_EMBEDDING_DIMENSIONS} chiều · bộ chia đoạn v${AI_KNOWLEDGE_CHUNKER_VERSION}`);
  console.log(`Nguồn    : ${sources.length} tệp${DRY_RUN ? " · DRY RUN (không gọi Gemini, không ghi DB)" : ""}\n`);
  if (!DRY_RUN && !database.local && !args.has("--yes")) {
    fail("DB không phải localhost — kiểm tra đúng DB rồi chạy lại kèm --yes");
  }

  const prisma = new PrismaClient();
  try {
    const existing = DRY_RUN
      ? new Map<string, { id: string; contentHash: string }>()
      : new Map((await prisma.aiKnowledgeDocument.findMany({ select: { id: true, sourcePath: true, contentHash: true } }))
        .map((doc) => [doc.sourcePath, doc]));
    let loaded = 0;
    let skipped = 0;
    let totalChunks = 0;

    for (const source of sources) {
      const { content, title } = await readSource(source);
      const chunks = chunkKnowledgeText(content);
      const contentHash = createHash("sha256")
        .update(JSON.stringify({ content, title, category: source.category, publicUrl: source.publicUrl ?? null, model: AI_EMBEDDING_MODEL, dimensions: AI_EMBEDDING_DIMENSIONS, chunker: AI_KNOWLEDGE_CHUNKER_VERSION }))
        .digest("hex");
      const label = `[${source.category}] ${source.sourcePath}`;
      totalChunks += chunks.length;

      if (!chunks.length) {
        console.log(`  ! ${label}: không trích được chữ nào (PDF scan?) — bỏ qua`);
        continue;
      }
      if (DRY_RUN) {
        const sizes = chunks.map((chunk) => chunk.content.length);
        console.log(`  · ${label}\n      "${title}" · ${content.length} ký tự · ${chunks.length} đoạn (${Math.min(...sizes)}–${Math.max(...sizes)} ký tự)`);
        continue;
      }
      const previous = existing.get(source.sourcePath);
      if (previous && previous.contentHash === contentHash && !FORCE) {
        skipped += 1;
        console.log(`  = ${label}: không đổi`);
        continue;
      }

      const vectors = await embedTexts(
        chunks.map((chunk) => knowledgeEmbeddingText(title, chunk)),
        "RETRIEVAL_DOCUMENT",
        { titles: chunks.map(() => title) }
      );
      const documentId = previous?.id ?? randomUUID();
      await prisma.$transaction([
        prisma.aiKnowledgeDocument.upsert({
          where: { sourcePath: source.sourcePath },
          create: { id: documentId, sourcePath: source.sourcePath, category: source.category, title, publicUrl: source.publicUrl ?? null, contentHash, embeddingModel: AI_EMBEDDING_MODEL, content },
          update: { category: source.category, title, publicUrl: source.publicUrl ?? null, contentHash, embeddingModel: AI_EMBEDDING_MODEL, content },
        }),
        prisma.aiKnowledgeChunk.deleteMany({ where: { documentId } }),
        prisma.aiKnowledgeChunk.createMany({
          data: chunks.map((chunk, index) => ({
            documentId,
            chunkIndex: chunk.chunkIndex,
            heading: chunk.heading,
            content: chunk.content,
            embedding: vectors[index],
          })),
        }),
      ]);
      loaded += 1;
      console.log(`  ✓ ${label}: ${chunks.length} đoạn${previous ? " (nạp lại)" : " (mới)"}`);
    }

    const stale = [...existing.keys()].filter((sourcePath) => !sources.some((source) => source.sourcePath === sourcePath));
    if (stale.length) {
      if (PRUNE) {
        await prisma.aiKnowledgeDocument.deleteMany({ where: { sourcePath: { in: stale } } });
        console.log(`\nĐã xoá ${stale.length} tài liệu không còn tệp nguồn: ${stale.join(", ")}`);
      } else {
        console.log(`\n${stale.length} tài liệu trong DB không còn tệp nguồn (thêm --prune để xoá): ${stale.join(", ")}`);
      }
    }

    console.log(DRY_RUN
      ? `\nTổng ${totalChunks} đoạn từ ${sources.length} tệp.`
      : `\nXong: nạp ${loaded}, không đổi ${skipped}. Chatbox thấy tài liệu mới sau tối đa 5 phút.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Không in stack của fetch — có thể kèm URL; message của lib/ai-embedding.ts đã lọc key.
  console.error("DỪNG:", (error as Error).message);
  process.exit(1);
});
