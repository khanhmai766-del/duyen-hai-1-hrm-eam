import assert from "node:assert/strict";
import test from "node:test";
import { aiPagePathForLog, sanitizeAiPageContext } from "../../lib/ai-chat";
import { AI_TOOL_LABELS, aiRequestToolCalls, claimAiToolCall, closeAiRequest, openAiRequest } from "../../lib/ai-request-registry";

test("ngữ cảnh trang chỉ nhận đường dẫn nội bộ và loại thực thể đã biết", () => {
  assert.deepEqual(
    sanitizeAiPageContext({ path: "/devices/S1.01", entityType: "DEVICE", entityId: "S1.01", label: "  Quạt   khói A " }),
    { path: "/devices/S1.01", entityType: "DEVICE", entityId: "S1.01", label: "Quạt khói A" }
  );
  // Loại thực thể lạ bị bỏ nhưng đường dẫn vẫn giữ — mô hình vẫn biết người dùng đang ở trang nào.
  assert.deepEqual(sanitizeAiPageContext({ path: "/hr", entityType: "USER", entityId: "x" }), { path: "/hr", entityId: "x" });
  for (const raw of [null, "chuỗi", [], { path: "" }, { path: "//evil.example/x" }, { path: "https://evil.example" }]) {
    assert.equal(sanitizeAiPageContext(raw), null);
  }
});

test("đường dẫn ghi số liệu bỏ query và hash để không lưu từ khóa người dùng gõ", () => {
  assert.equal(aiPagePathForLog({ path: "/defects?q=bí+mật&unit=S1" }), "/defects");
  assert.equal(aiPagePathForLog({ path: "/devices/S1.01#lich-su" }), "/devices/S1.01");
  assert.equal(aiPagePathForLog(null), null);
});

test("số lượt gọi công cụ đọc được trước khi đóng sổ, và không vượt trần đã đặt", () => {
  const owner = { userId: "user-1", conversationId: "conversation-1" };
  openAiRequest("request-1", owner);
  for (let call = 0; call < 9; call += 1) claimAiToolCall("request-1", owner, "shift-schedule");
  assert.equal(aiRequestToolCalls("request-1"), 6);
  closeAiRequest("request-1");
  // Sổ đã đóng thì không còn số liệu để đọc — ghi 0 chứ không ném lỗi.
  assert.equal(aiRequestToolCalls("request-1"), 0);
});

test("mỗi công cụ có nhãn tiến trình tiếng Việt để hiện trong lúc chờ", () => {
  for (const [tool, label] of Object.entries(AI_TOOL_LABELS)) {
    assert.ok(label.startsWith("Đang "), `${tool} thiếu nhãn tiến trình`);
  }
  assert.equal(Object.keys(AI_TOOL_LABELS).length, 7);
});
