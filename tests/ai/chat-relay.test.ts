import assert from "node:assert/strict";
import test from "node:test";
import { relayN8nResponse } from "../../lib/ai-chat-relay";

function streamResponse(parts: string[], init?: ResponseInit) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  }), init);
}

async function relay(response: Response, idleMs = 1_000) {
  const deltas: string[] = [];
  const result = await relayN8nResponse(response, (text) => deltas.push(text), { idleMs });
  return { result, deltas };
}

test("ghép chữ từ mẩu item, bỏ keepalive/begin/end, chịu được mẩu bị cắt giữa dòng", async () => {
  const { result, deltas } = await relay(streamResponse([
    "{\"type\":\"keepalive\"}\n{\"type\":\"begin\",\"metadata\":{\"nodeName\":\"Trợ lý AI VH1\"}}\n{\"type\":\"item\",\"content\":\"Xin ",
    "chào\"}\n{\"type\":\"item\",\"content\":\" bạn\"}\n",
    "{\"type\":\"end\"}",
  ]));
  assert.deepEqual(result, { ok: true, answer: "Xin chào bạn", legacyPayload: null });
  assert.deepEqual(deltas, ["Xin chào", " bạn"]);
});

test("lỗi của một lần gọi công cụ không làm hỏng câu trả lời phía sau", async () => {
  const { result } = await relay(streamResponse([
    "{\"type\":\"error\",\"content\":\"getaddrinfo EAI_AGAIN duyenhai1.vn\"}\n",
    "{\"type\":\"item\",\"content\":\"Không tìm thấy dữ liệu phù hợp.\"}\n",
  ]));
  assert.equal(result.ok, true);
});

test("Gemini 429 rồi nhánh trả lỗi của workflow: báo mã giới hạn, không phát chữ nào", async () => {
  const { result, deltas } = await relay(streamResponse([
    "{\"type\":\"error\",\"content\":\"[429 Too Many Requests] Resource exhausted key=secret-token\"}\n",
    `${JSON.stringify({ type: "item", content: JSON.stringify({ code: "AI_PROVIDER_RATE_LIMITED", error: "…" }) })}\n`,
  ]));
  assert.deepEqual(result, { ok: false, code: "AI_PROVIDER_RATE_LIMITED" });
  assert.deepEqual(deltas, []);
});

test("chỉ có mẩu lỗi 503, không có chữ: báo quá tải", async () => {
  const { result } = await relay(streamResponse([
    "{\"type\":\"error\",\"content\":\"[503 Service Unavailable] This model is experiencing high demand\"}\n",
  ]));
  assert.deepEqual(result, { ok: false, code: "AI_PROVIDER_UNAVAILABLE" });
});

test("luồng chỉ có keepalive: báo chưa tạo được câu trả lời", async () => {
  const { result } = await relay(streamResponse(["{\"type\":\"keepalive\"}\n", "{\"type\":\"keepalive\"}\n"]));
  assert.deepEqual(result, { ok: false, code: "AI_EMPTY_ANSWER" });
});

test("workflow JSON kiểu cũ (nhiều dòng) vẫn dùng được", async () => {
  const payload = { answer: "Có 2 khiếm khuyết", citations: [], suggestions: ["Xem chi tiết"] };
  const { result, deltas } = await relay(streamResponse([JSON.stringify(payload, null, 2)], {
    headers: { "content-type": "application/json" },
  }));
  assert.deepEqual(result, { ok: true, answer: "Có 2 khiếm khuyết", legacyPayload: payload });
  assert.deepEqual(deltas, ["Có 2 khiếm khuyết"]);
});

test("HTTP 503 trả trang HTML: báo quá tải, không báo JSON hỏng", async () => {
  const { result } = await relay(new Response("<html>503</html>", { status: 503 }));
  assert.deepEqual(result, { ok: false, code: "AI_PROVIDER_UNAVAILABLE" });
});

test("n8n im lặng quá idleMs: dừng với mã hết giờ", async () => {
  const { result } = await relay(new Response(new ReadableStream<Uint8Array>({ start() {} })), 50);
  assert.deepEqual(result, { ok: false, code: "AI_TIMEOUT" });
});
