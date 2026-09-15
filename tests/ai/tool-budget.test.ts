import assert from "node:assert/strict";
import test from "node:test";
import { AI_TOOL_RESULT_CHAR_BUDGET, AI_TOOL_TEXT_LIMIT, compactAiFacts, fitAiToolItems } from "../../lib/ai-tool-budget";

test("facts bỏ trường rỗng, gom khoảng trắng, cắt chuỗi dài và đổi ngày về ISO", () => {
  const facts = compactAiFacts({
    status: "CHUA_XU_LY",
    severity: null,
    repairPlan: "",
    awaitingMaterial: false,
    content: `Rò   rỉ\n${"x".repeat(500)}`,
    detectedAt: new Date("2026-09-15T01:00:00.000Z"),
    downtime: 0,
  });
  assert.deepEqual(Object.keys(facts), ["status", "content", "detectedAt", "downtime"]);
  assert.equal(String(facts.content).length, AI_TOOL_TEXT_LIMIT + 1);
  assert.ok(String(facts.content).startsWith("Rò rỉ x"));
  assert.equal(facts.detectedAt, "2026-09-15T01:00:00.000Z");
});

test("20 phiếu khiếm khuyết dài được cắt vừa ngân sách, báo số dòng bị bỏ", () => {
  const defects = Array.from({ length: 20 }, (_, index) => ({
    sourceType: "DEFECT",
    sourceId: `defect-${index}`,
    title: `YC-${index} — Bơm cấp nước tổ máy S1`,
    occurredAt: "2026-09-15T01:00:00.000Z",
    facts: compactAiFacts({ status: "CHUA_XU_LY", content: "Rò rỉ dầu ".repeat(60), repairSolution: "Thay gioăng ".repeat(40) }),
  }));
  const { items, omitted } = fitAiToolItems(defects);
  assert.ok(items.length > 0 && items.length < 20);
  assert.equal(items.length + omitted, 20);
  assert.ok(JSON.stringify(items).length <= AI_TOOL_RESULT_CHAR_BUDGET);
  assert.equal(items[0].sourceId, "defect-0");
});

test("luôn giữ ít nhất một kết quả dù kết quả đó vượt ngân sách", () => {
  const { items, omitted } = fitAiToolItems([{ text: "x".repeat(100) }, { text: "y" }], 50);
  assert.equal(items.length, 1);
  assert.equal(omitted, 1);
});
