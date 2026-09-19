import assert from "node:assert/strict";
import test from "node:test";
import { AI_DEFECT_READ_ONLY_TOOLS, runAiTool, type AiToolUser } from "../../lib/ai-tools";
import { AI_TOOL_LABELS, aiRequestCitations, closeAiRequest, openAiRequest, type AiToolName } from "../../lib/ai-request-registry";

/**
 * Tài khoản CHỈ TRA CỨU KHIẾM KHUYẾT (accessMode DEFECT_READ_ONLY) — trợ lý chỉ được chạy đúng các
 * công cụ phục vụ tra khiếm khuyết, và chỉ gắn nguồn trỏ về trang khiếm khuyết. Không gọi DB nào:
 * công cụ bị chặn thì `run` không được gọi, còn công cụ được phép dùng `run` giả.
 */

function user(accessMode: string, requestId: string | null = null) {
  return { id: "u1", accessMode, conversationId: "c1", requestId } as unknown as AiToolUser;
}

test("chỉ ba công cụ tra khiếm khuyết được mở; mọi công cụ khác — kể cả công cụ thêm sau — bị chặn", async () => {
  assert.deepEqual([...AI_DEFECT_READ_ONLY_TOOLS].sort(), ["device-history", "search-defects", "search-devices"]);
  for (const tool of Object.keys(AI_TOOL_LABELS) as AiToolName[]) {
    let ran = false;
    const result = await runAiTool(user("DEFECT_READ_ONLY"), tool, async () => { ran = true; return { items: [] }; });
    if (AI_DEFECT_READ_ONLY_TOOLS.has(tool)) {
      assert.equal(ran, true, `${tool} phải chạy được`);
    } else {
      assert.equal(ran, false, `${tool} không được chạy cho tài khoản chỉ tra khiếm khuyết`);
      assert.match(String((result as { message?: string }).message), /chỉ được tra cứu khiếm khuyết/);
    }
  }
});

test("tài khoản thường không bị cổng này chặn", async () => {
  let ran = false;
  await runAiTool(user("NORMAL"), "shift-schedule", async () => { ran = true; return { items: [] }; });
  assert.equal(ran, true);
});

test("nguồn trích dẫn của tài khoản chỉ tra khiếm khuyết chỉ giữ trang /defects", async () => {
  const requestId = "req-defect-only";
  openAiRequest(requestId, { userId: "u1", conversationId: "c1" });
  try {
    await runAiTool(user("DEFECT_READ_ONLY", requestId), "device-history", async () => ({
      items: [
        { sourceType: "DEFECT", sourceId: "d1", title: "Phiếu 1", url: "/defects?q=1" },
        { sourceType: "DEFECT_HISTORY", sourceId: "h1", title: "Lịch sử 1", url: "/repair-history?search=1" },
        { sourceType: "DEVICE", sourceId: "DH1.S1.1", title: "Bơm A", url: "/devices/DH1.S1.1" },
      ],
    }));
    assert.deepEqual(aiRequestCitations(requestId).map((citation) => citation.url), ["/defects?q=1"]);
  } finally {
    closeAiRequest(requestId);
  }
});
