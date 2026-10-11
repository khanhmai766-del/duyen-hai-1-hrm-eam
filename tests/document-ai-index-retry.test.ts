import assert from "node:assert/strict";
import test from "node:test";
import { aiIndexRetryAt } from "../lib/document-ai-index";

const vn = (value: string) => new Date(`${value}+07:00`);

test("Hết hạn mức Gemini (429) → thử lại từ 0 giờ VN ngày hôm sau", () => {
  const error = "Gemini embedding HTTP 429: You exceeded your current quota";
  assert.equal(aiIndexRetryAt({ aiIndexError: error, aiIndexAttemptedAt: vn("2026-10-11T14:05:00") })?.toISOString(), vn("2026-10-12T00:00:00").toISOString());
  assert.equal(aiIndexRetryAt({ aiIndexError: error, aiIndexAttemptedAt: vn("2026-10-11T23:59:00") })?.toISOString(), vn("2026-10-12T00:00:00").toISOString());
});

test("Lỗi khác (PDF rỗng, quét không đọc được…) → thử lại sau 3 ngày", () => {
  assert.equal(aiIndexRetryAt({ aiIndexError: "File PDF đang trống", aiIndexAttemptedAt: vn("2026-10-11T14:05:00") })?.toISOString(), vn("2026-10-14T14:05:00").toISOString());
});

test("Chưa lỗi, hoặc lỗi cũ chưa ghi lúc thử → không phải chờ", () => {
  assert.equal(aiIndexRetryAt({ aiIndexError: null, aiIndexAttemptedAt: vn("2026-10-11T14:05:00") }), null);
  assert.equal(aiIndexRetryAt({ aiIndexError: "Gemini embedding HTTP 429", aiIndexAttemptedAt: null }), null);
});

test("File trên Drive đổi sau lần thử lỗi (tải lại PDF đúng) → nạp lại ngay, không chờ", () => {
  const attempt = { aiIndexError: "File PDF đang trống", aiIndexAttemptedAt: vn("2026-10-11T14:05:00") };
  assert.equal(aiIndexRetryAt({ ...attempt, driveModifiedAt: vn("2026-10-11T16:30:00") }), null);
  // File cũ (sửa từ 2023) → vẫn chờ 3 ngày.
  assert.equal(aiIndexRetryAt({ ...attempt, driveModifiedAt: new Date("2023-04-11T08:00:00Z") })?.toISOString(), vn("2026-10-14T14:05:00").toISOString());
});
