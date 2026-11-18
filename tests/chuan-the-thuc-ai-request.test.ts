import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_RUNNING_REVIEWS,
  MAX_TOTAL_CHARS,
  USER_REQUESTS_PER_HOUR,
  createAiLimiter,
  parseAiReviewRequest,
  sharedGeminiModels,
} from "../modules/chuan-the-thuc/ai-request";

test("chỉ nhận đúng dữ liệu văn bản, bỏ khoá hoặc mô hình do trình duyệt gửi", () => {
  const parsed = parseAiReviewRequest({ paragraphs: [{ i: 1, text: "Nội dung" }], apiKeys: ["x"], models: ["gemini-pro"] });
  assert.ok("data" in parsed);
  assert.deepEqual(Object.keys(parsed.data).sort(), ["kind", "paragraphs", "passes", "standard"]);
  assert.ok("error" in parseAiReviewRequest({ paragraphs: [] }));
  assert.ok("error" in parseAiReviewRequest({ paragraphs: [{ i: 1, text: "a" }], passes: 3 }));
});

test("chặn văn bản vượt tổng số ký tự", () => {
  const text = "a".repeat(50_000);
  const count = Math.floor(MAX_TOTAL_CHARS / text.length) + 1;
  const paragraphs = Array.from({ length: count }, (_, i) => ({ i, text }));
  assert.ok("error" in parseAiReviewRequest({ paragraphs }));
});

test("mỗi người một lượt đang chạy, có hạn mức theo giờ và trần toàn hệ thống", () => {
  let time = 0;
  const limiter = createAiLimiter(() => time);
  assert.equal(limiter.acquire("a"), null);
  assert.match(limiter.acquire("a") ?? "", /chưa xong/);
  limiter.release("a");
  for (let i = 1; i < USER_REQUESTS_PER_HOUR; i++) {
    assert.equal(limiter.acquire("a"), null);
    limiter.release("a");
  }
  assert.match(limiter.acquire("a") ?? "", /hết/);
  time = 3_600_001;
  assert.equal(limiter.acquire("a"), null);
  limiter.release("a");

  for (let i = 0; i < MAX_RUNNING_REVIEWS; i++) assert.equal(limiter.acquire(`u${i}`), null);
  assert.match(limiter.acquire("khac") ?? "", /bận/);
});

test("danh sách mô hình lấy từ cấu hình máy chủ, giá trị lạ bị bỏ", () => {
  assert.deepEqual(sharedGeminiModels("gemini-a, xau/../x ,gemini-b"), ["gemini-a", "gemini-b"]);
  assert.equal(sharedGeminiModels("")[0], "gemini-3.5-flash-lite");
});
