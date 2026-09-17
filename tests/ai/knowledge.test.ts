import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { normalizeAiCitation } from "../../lib/ai-chat";
import { DEFAULT_RBAC_MATRIX } from "../../lib/rbac-defaults";
import {
  AI_KNOWLEDGE_CATEGORIES,
  AI_KNOWLEDGE_CHUNK_MAX,
  aiKnowledgePermissionId,
  chunkKnowledgeText,
  cleanExtractedPdfText,
  isAiKnowledgeCategory,
  normalizeVector,
  rankKnowledgeChunks,
  type AiKnowledgeCategory,
  type AiKnowledgeSearchChunk,
} from "../../lib/ai-knowledge";

/** Lõi kho tài liệu AI — logic thuần, không cần DB hay key Gemini. */

test("chia đoạn: mang tiêu đề mục, bỏ tiêu đề cấp 1, không vượt trần và không mất đoạn văn nào", () => {
  const paragraphs = Array.from({ length: 12 }, (_, i) => `Đoạn ${i} ${"nội dung quy trình ".repeat(12 + (i % 5) * 6)}`.trim());
  const text = [
    "# Tên tài liệu",
    "> Lời dẫn đầu tài liệu.",
    "## Mục A",
    ...paragraphs.slice(0, 6),
    "## Mục B",
    "### Mục B1",
    ...paragraphs.slice(6),
  ].join("\n\n");
  const chunks = chunkKnowledgeText(text);

  assert.equal(chunks[0].heading, null);
  assert.ok(chunks.some((c) => c.heading === "Mục A"));
  assert.ok(chunks.some((c) => c.heading === "Mục B › Mục B1"));
  assert.equal(chunks.some((c) => c.content.includes("# Tên tài liệu") || c.heading?.includes("Tên tài liệu")), false);
  chunks.forEach((chunk, index) => {
    assert.equal(chunk.chunkIndex, index);
    assert.ok(chunk.content.length <= AI_KNOWLEDGE_CHUNK_MAX, `đoạn ${index} dài ${chunk.content.length}`);
  });
  for (const paragraph of paragraphs) {
    assert.ok(chunks.some((c) => c.content.includes(paragraph)), `mất đoạn văn "${paragraph.slice(0, 20)}"`);
  }
  // Phần chồng chỉ mang trong cùng mục: đoạn đầu tiên của Mục B1 không được bắt đầu bằng đuôi Mục A.
  const firstB = chunks.find((c) => c.heading === "Mục B › Mục B1")!;
  assert.equal(firstB.content.startsWith("…"), false);
});

test("chia đoạn: đoạn trước ngắn thì không chép lặp sang đoạn sau (lỗi gặp ở tờ trình vật tư)", () => {
  // Đúng hình dạng dữ liệu thật: đoạn ~1.150 ký tự, đoạn 138 ký tự, rồi một khối dài phải cắt cứng.
  const text = ["a ".repeat(575), `Nơi nhận:\n${"b ".repeat(64)}`, "c".repeat(3200)].join("\n\n");
  const chunks = chunkKnowledgeText(text);
  for (const chunk of chunks) {
    assert.ok(chunk.content.length <= AI_KNOWLEDGE_CHUNK_MAX, `đoạn ${chunk.chunkIndex} dài ${chunk.content.length}`);
    assert.equal(chunk.content.split("\n\n").some((part) => /^…\s*$/.test(part)), false, "đoạn chỉ có dấu chồng rỗng");
  }
  assert.equal(chunks.filter((c) => c.content.includes("Nơi nhận:")).length, 1, "đoạn ngắn bị lặp sang đoạn khác");
});

test("dọn chữ PDF: bỏ dấu trang, giờ in, đường dẫn file:// và dòng chữ giãn cách", () => {
  const cleaned = cleanExtractedPdfText([
    "C Ô N G T Y N H I Ệ T Đ I Ệ N D U Y Ê N H Ả I 1",
    "HƯỚNG DẪN SỬ DỤNG",
    "8/26/26, 6:36 AM \tHướng dẫn sử dụng phần Quản lý vật tư",
    "file:///C:/Users/Asus/OneDrive/Desktop/docs/huong-dan.html \t1/25",
    "",
    "-- 1 of 25 --",
    "",
    "Bước 1: lập phiếu đề xuất vật tư.",
  ].join("\r\n"));
  assert.equal(cleaned, "HƯỚNG DẪN SỬ DỤNG\n\nBước 1: lập phiếu đề xuất vật tư.");
});

function chunk(documentId: string, category: string, direction: number[]): AiKnowledgeSearchChunk {
  return { documentId, chunkIndex: 0, category, title: documentId, heading: null, content: documentId, embedding: normalizeVector(direction) };
}

test("xếp hạng: lọc quyền TRƯỚC khi chấm điểm, ngưỡng điểm, tối đa 2 đoạn mỗi tài liệu", () => {
  const query = normalizeVector([1, 0, 0]);
  const chunks = [
    chunk("mat", "vat-tu", [1, 0, 0]), // khớp tuyệt đối nhưng KHÔNG có quyền
    { ...chunk("pccc", "pccc", [0.9, 0.1, 0]), chunkIndex: 0 },
    { ...chunk("pccc", "pccc", [0.8, 0.2, 0]), chunkIndex: 1 },
    { ...chunk("pccc", "pccc", [0.7, 0.3, 0]), chunkIndex: 2 },
    chunk("pct", "an-toan", [0.6, 0.4, 0]),
    chunk("xa", "an-toan", [0, 1, 0]), // dưới ngưỡng
    { ...chunk("lech-chieu", "pccc", [1, 0]), embedding: [1, 0] },
  ];
  const ranked = rankKnowledgeChunks(query, chunks, { categories: new Set(["pccc", "an-toan"]) });
  assert.equal(ranked.some((r) => r.chunk.category === "vat-tu"), false, "lộ đoạn thuộc nhóm không được đọc");
  assert.deepEqual(ranked.map((r) => `${r.chunk.documentId}#${r.chunk.chunkIndex}`), ["pccc#0", "pccc#1", "pct#0"]);
  assert.ok(ranked.every((r, i) => i === 0 || ranked[i - 1].score >= r.score));
  assert.deepEqual(rankKnowledgeChunks(query, chunks, { categories: new Set() }), []);
});

test("nguồn tài liệu: chỉ nhận đường dẫn nội bộ /tai-lieu", () => {
  const ok = normalizeAiCitation({ sourceType: "DOCUMENT", sourceId: "abc", title: "Sổ thiết bị PCCC — Tổng quan", url: "/tai-lieu/abc" });
  assert.equal(ok?.url, "/tai-lieu/abc");
  assert.equal(normalizeAiCitation({ sourceType: "DOCUMENT", sourceId: "abc", title: "x", url: "https://evil.example/tai-lieu/abc" }), null);
  assert.equal(normalizeAiCitation({ sourceType: "DOCUMENT", sourceId: "abc", title: "x", url: "/tai-lieu-gia/abc" }), null);
});

test("mỗi nhóm tài liệu có quyền mặc định, VIEWER không đọc; thư mục nguồn và sources.json hợp lệ", () => {
  for (const category of Object.keys(AI_KNOWLEDGE_CATEGORIES) as AiKnowledgeCategory[]) {
    const matrix = DEFAULT_RBAC_MATRIX[aiKnowledgePermissionId(category)];
    assert.ok(matrix, `thiếu quyền mặc định cho nhóm ${category}`);
    assert.equal(matrix.VIEWER, "none");
    assert.equal(matrix.TECHNICIAN, "read");
  }
  const root = new URL("../../ai-knowledge-source/", import.meta.url);
  for (const entry of readdirSync(root)) {
    if (statSync(new URL(entry, root)).isDirectory()) assert.ok(isAiKnowledgeCategory(entry), `thư mục nguồn lạ: ${entry}`);
  }
  const manifest = JSON.parse(readFileSync(new URL("sources.json", root), "utf8")) as { files: Array<{ path: string; category: string; publicUrl?: string }> };
  for (const file of manifest.files) {
    assert.ok(existsSync(new URL(`../../${file.path}`, import.meta.url)), `sources.json trỏ tệp không tồn tại: ${file.path}`);
    assert.ok(isAiKnowledgeCategory(file.category), `${file.path}: nhóm lạ ${file.category}`);
    if (file.publicUrl) assert.equal(`public${file.publicUrl}`, file.path, `${file.path}: publicUrl không khớp vị trí tệp`);
  }
});
