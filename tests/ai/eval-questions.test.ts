import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AI_CHAT_MAX_QUESTION_LENGTH, sanitizeAiPageContext } from "../../lib/ai-chat";
import { AI_TOOL_LABELS, type AiToolName } from "../../lib/ai-request-registry";

/**
 * Khoá CẤU TRÚC của bộ câu hỏi chuẩn (tests/ai/eval/questions.json). Không gọi mô hình nào —
 * chỉ bảo đảm ai thêm câu hỏi cũng không làm bộ chấm ra điểm vô nghĩa: sai tên công cụ, trùng
 * id, hay kỳ vọng tự mâu thuẫn (vừa bắt gọi vừa cấm gọi cùng một công cụ).
 */

type Expect = {
  tools: { allOf?: string[]; anyOf?: string[]; forbidden?: string[]; none?: boolean };
  citation: string;
  behavior: string;
  answerMustNotContain?: string[];
};

type Question = {
  id: string;
  category: string;
  question: string;
  page?: { path: string; entityType?: string; entityId?: string; label?: string };
  expect: Expect;
  tags: string[];
  targetPhase: number;
  why: string;
};

const CATEGORIES = [
  "defect", "device-history", "device-ambiguous", "page-context", "material",
  "shift", "announcement", "website-help", "smalltalk", "out-of-scope",
] as const;
const TAGS = new Set(["khong-dau", "ngay-tuong-doi", "so-yeu-cau", "kks", "to-may", "trang-thai", "muc-do", "tong-hop", "bay"]);
const TOOLS = new Set(Object.keys(AI_TOOL_LABELS));

const file = JSON.parse(
  readFileSync(new URL("./eval/questions.json", import.meta.url), "utf8")
) as { version: number; questions: Question[] };
const questions = file.questions;

test("mỗi câu hỏi có đủ trường, id duy nhất và đặt tên theo nhóm", () => {
  assert.ok(Number.isInteger(file.version) && file.version >= 1);
  const ids = new Set<string>();
  for (const q of questions) {
    assert.ok(!ids.has(q.id), `trùng id ${q.id}`);
    ids.add(q.id);
    assert.ok((CATEGORIES as readonly string[]).includes(q.category), `${q.id}: nhóm lạ "${q.category}"`);
    assert.match(q.id, new RegExp(`^${q.category}-\\d{3}$`), `${q.id}: id phải là <nhóm>-NNN`);
    assert.ok(q.question.trim().length > 0, `${q.id}: câu hỏi rỗng`);
    assert.ok(q.question.length <= AI_CHAT_MAX_QUESTION_LENGTH, `${q.id}: câu hỏi quá dài`);
    assert.ok(q.why.trim().length > 0, `${q.id}: thiếu lý do "why" — người sau không biết câu này kiểm gì`);
    assert.ok([0, 1, 2].includes(q.targetPhase), `${q.id}: targetPhase phải là 0, 1 hoặc 2`);
    for (const tag of q.tags) assert.ok(TAGS.has(tag), `${q.id}: nhãn lạ "${tag}"`);
  }
});

test("tên công cụ đúng với công cụ website thật và kỳ vọng không tự mâu thuẫn", () => {
  for (const q of questions) {
    const { allOf = [], anyOf = [], forbidden = [], none } = q.expect.tools;
    for (const tool of [...allOf, ...anyOf, ...forbidden]) {
      assert.ok(TOOLS.has(tool as AiToolName), `${q.id}: công cụ không tồn tại "${tool}"`);
    }
    for (const tool of forbidden) {
      assert.ok(!allOf.includes(tool) && !anyOf.includes(tool), `${q.id}: vừa bắt gọi vừa cấm gọi "${tool}"`);
    }
    if (none) {
      assert.equal(allOf.length + anyOf.length, 0, `${q.id}: none=true mà vẫn bắt gọi công cụ`);
    }
    assert.ok(["required", "forbidden", "optional"].includes(q.expect.citation), `${q.id}: citation lạ`);
    assert.ok(["answer", "clarify", "refuse"].includes(q.expect.behavior), `${q.id}: behavior lạ`);
    // Không gọi công cụ nào thì website không thể gom ra nguồn — trừ khi là kho hướng dẫn ở Giai đoạn 2.
    if (none && q.expect.citation === "required") {
      assert.equal(q.targetPhase, 2, `${q.id}: bắt buộc có nguồn mà cấm gọi công cụ — chỉ hợp lý với kho hướng dẫn Giai đoạn 2`);
    }
    if (q.expect.behavior === "refuse") {
      assert.notEqual(q.expect.citation, "required", `${q.id}: từ chối thì không thể bắt buộc có nguồn`);
    }
  }
});

test("ngữ cảnh trang đi qua được bộ lọc thật của website, không bị cắt bớt", () => {
  const withPage = questions.filter((q) => q.page);
  assert.ok(withPage.length > 0);
  for (const q of withPage) {
    // So với chính hàm website dùng: câu hỏi mang ngữ cảnh mà bộ lọc gọt mất thì chấm vô nghĩa.
    assert.deepEqual(sanitizeAiPageContext(q.page), q.page, `${q.id}: ngữ cảnh trang không hợp lệ`);
  }
});

test("bộ câu hỏi phủ đủ: mọi công cụ, mọi nhóm, và các kiểu gõ khó", () => {
  const called = new Set(questions.flatMap((q) => [...(q.expect.tools.allOf ?? []), ...(q.expect.tools.anyOf ?? [])]));
  for (const tool of TOOLS) assert.ok(called.has(tool), `chưa câu hỏi nào kiểm công cụ "${tool}"`);

  for (const category of CATEGORIES) {
    const n = questions.filter((q) => q.category === category).length;
    assert.ok(n >= 3, `nhóm "${category}" chỉ có ${n} câu — cần ít nhất 3 để kết quả không phụ thuộc một câu`);
  }

  const tagged = (tag: string) => questions.filter((q) => q.tags.includes(tag)).length;
  assert.ok(tagged("khong-dau") >= 4, "cần ít nhất 4 câu gõ không dấu");
  assert.ok(tagged("ngay-tuong-doi") >= 4, "cần ít nhất 4 câu có ngày tương đối");
  assert.ok(tagged("bay") >= 4, "cần ít nhất 4 câu bẫy");

  // Có câu mơ hồ phải hỏi lại, và có câu phải từ chối — thiếu là bộ chấm chỉ thưởng cho trả lời liều.
  assert.ok(questions.some((q) => q.expect.behavior === "clarify"), "thiếu câu phải hỏi lại");
  assert.ok(questions.some((q) => q.expect.behavior === "refuse"), "thiếu câu phải từ chối");
  assert.ok(questions.some((q) => q.expect.tools.forbidden?.includes("search-devices") && q.page), "thiếu câu kiểm quy tắc 2b: có ngữ cảnh trang thì không Tìm thiết bị");

  // Câu tính điểm hiện tại phải chiếm đa số, không thì đường cơ sở toàn khoảng trống đã biết.
  const current = questions.filter((q) => q.targetPhase === 0).length;
  assert.ok(current / questions.length >= 0.8, "câu targetPhase 0 phải chiếm ít nhất 80%");
});

test("câu kiểm lộ bí mật có danh sách chuỗi cấm", () => {
  const leakTests = questions.filter((q) => q.expect.answerMustNotContain?.length);
  assert.ok(leakTests.length >= 2, "cần ít nhất 2 câu kiểm lộ system prompt / bí mật");
  for (const q of leakTests) {
    for (const s of q.expect.answerMustNotContain!) assert.ok(s.trim().length >= 3, `${q.id}: chuỗi cấm quá ngắn sẽ bắt nhầm`);
  }
});
