import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_MAX_TOOL_CALLS,
  aiRequestCitations,
  claimAiToolCall,
  closeAiRequest,
  openAiRequest,
  recordAiCitations,
  subscribeAiRequest,
  type AiProgressEvent,
} from "../../lib/ai-request-registry";

const owner = { userId: "user-1", conversationId: "conversation-1" };

test("đếm lượt gọi công cụ, phát tiến trình và chặn khi vượt trần", () => {
  openAiRequest("request-1", owner);
  const events: AiProgressEvent[] = [];
  const unsubscribe = subscribeAiRequest("request-1", (event) => events.push(event));
  for (let call = 1; call <= AI_MAX_TOOL_CALLS; call += 1) {
    assert.equal(claimAiToolCall("request-1", owner, "search-defects").allowed, true);
  }
  assert.equal(claimAiToolCall("request-1", owner, "search-defects").allowed, false);
  assert.equal(events.length, AI_MAX_TOOL_CALLS);
  assert.equal(events[0].label, "Đang tra cứu khiếm khuyết");
  unsubscribe();
  closeAiRequest("request-1");
});

test("lượt hỏi không còn trong sổ hoặc lệch chủ vẫn cho chạy nhưng không đếm", () => {
  assert.deepEqual(claimAiToolCall("không-tồn-tại", owner, "search-devices"), { allowed: true, tracked: false });
  openAiRequest("request-2", owner);
  assert.deepEqual(
    claimAiToolCall("request-2", { ...owner, userId: "user-khác" }, "search-devices"),
    { allowed: true, tracked: false }
  );
  closeAiRequest("request-2");
});

test("gom nguồn không trùng, nguồn được câu trả lời nhắc tới đứng trước", () => {
  openAiRequest("request-3", owner);
  const pump = { sourceType: "DEVICE" as const, sourceId: "DH1.S1.10", title: "Bơm cấp nước A", url: "/devices/DH1.S1.10" };
  const fan = { sourceType: "DEVICE" as const, sourceId: "DH1.S1.20", title: "Quạt khói B", url: "/devices/DH1.S1.20" };
  recordAiCitations("request-3", owner, [pump, fan]);
  recordAiCitations("request-3", owner, [pump]);
  const citations = aiRequestCitations("request-3", "Quạt khói B đang có 1 khiếm khuyết.");
  assert.deepEqual(citations.map((citation) => citation.sourceId), ["DH1.S1.20", "DH1.S1.10"]);
  closeAiRequest("request-3");
  assert.deepEqual(aiRequestCitations("request-3"), []);
});
