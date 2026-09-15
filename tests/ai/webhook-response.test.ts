import assert from "node:assert/strict";
import test from "node:test";
import { decodeAiWebhookResponse } from "../../lib/ai-webhook-response";

test("503 trả thông báo quá tải; không chuyển tiếp lỗi thô chứa bí mật", () => {
  const result = decodeAiWebhookResponse(JSON.stringify({ code: "AI_PROVIDER_UNAVAILABLE", error: "secret-token" }), 503);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.match(result.message, /quá tải/);
    assert.match(result.message, /chưa được lưu/);
    assert.equal(result.message.includes("secret-token"), false);
  }
});

test("429 kể cả body HTML vẫn trả lỗi giới hạn dịch vụ, không báo JSON không hợp lệ", () => {
  const result = decodeAiWebhookResponse("<html>Too many requests</html>", 429);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 429);
    assert.match(result.message, /giới hạn/);
  }
});

test("lỗi JSON với HTTP 200 vẫn được chặn trước nhánh lưu câu hỏi", () => {
  for (const error of [{ code: "AI_WORKFLOW_FAILED" }, { error: "Unknown failure" }]) {
    const result = decodeAiWebhookResponse(JSON.stringify(error), 200);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 502);
  }
});

test("body rỗng, JSON null hoặc mảng không phải phản hồi thành công", () => {
  for (const raw of ["", "null", "[]", "<html>Bad gateway</html>"]) {
    assert.equal(decodeAiWebhookResponse(raw, 200).ok, false);
  }
  const result = decodeAiWebhookResponse("", 503);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 503);
});

test("phản hồi thành công giữ nguyên answer và citation", () => {
  const payload = { answer: "Không tìm thấy dữ liệu", citations: [], suggestions: [] };
  assert.deepEqual(decodeAiWebhookResponse(JSON.stringify(payload), 200), { ok: true, payload });
});
