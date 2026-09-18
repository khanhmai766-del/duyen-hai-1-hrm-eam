import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDocumentAiIndexVersion,
  documentAiSourcePath,
  needsDocumentAiIndex,
  prepareDocumentAiContent,
} from "../../lib/document-ai-index";

test("phiên bản chỉ mục thay đổi khi checksum Drive thay đổi", () => {
  const first = buildDocumentAiIndexVersion({ driveChecksum: "abc" });
  const second = buildDocumentAiIndexVersion({ driveChecksum: "def" });
  assert.notEqual(first, second);
  assert.equal(needsDocumentAiIndex(first, first), false);
  assert.equal(needsDocumentAiIndex(first, second), true);
});

test("nguồn AI của tài liệu số có khóa ổn định", () => {
  assert.equal(documentAiSourcePath("doc-123"), "digital-document:doc-123");
});

test("nội dung PDF được làm sạch và chia thành đoạn có thứ tự", () => {
  const result = prepareDocumentAiContent("-- 1 of 1 --\n# Quy trình\n\nNội dung vận hành an toàn.", "Quy trình A");
  assert.equal(result.content.includes("-- 1 of 1 --"), false);
  assert.equal(result.chunks.length, 1);
  assert.equal(result.chunks[0].chunkIndex, 0);
  assert.equal(result.contentHash.length, 64);
});
