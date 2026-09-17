import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AI_TOOL_LABELS } from "../../lib/ai-request-registry";
import {
  buildPrompt,
  estimateCostUsd,
  guessBehavior,
  parseWorkflowForEval,
  scoreQuestion,
  summarize,
  toFunctionDeclarations,
  toolInput,
  type EvalQuestion,
  type EvalResult,
  type EvalRun,
} from "../../scripts/ai-eval/core";

/** Lõi bộ chấm — kiểm bằng CHÍNH file workflow thật, không gọi Gemini lượt nào. */

const workflow = parseWorkflowForEval(
  JSON.parse(readFileSync(new URL("../../docs/n8n-ai-chat/workflow-production.json", import.meta.url), "utf8"))
);
const questions = (JSON.parse(readFileSync(new URL("./eval/questions.json", import.meta.url), "utf8")) as { questions: EvalQuestion[] }).questions;

function run(partial: Partial<EvalRun>): EvalRun {
  return {
    status: "OK", answer: "", toolCalls: [], citations: [], modelCalls: 1, latencyMs: 1000,
    usage: { prompt: 0, output: 0, thoughts: 0, cached: 0 }, ...partial,
  };
}
const called = (...tools: string[]) => tools.map((tool) => ({ tool, args: {}, items: 1 }));
const question = (id: string) => questions.find((q) => q.id === id)!;

test("đọc đúng workflow: model, trần vòng, và ĐỦ công cụ trùng tên công cụ website", () => {
  assert.equal(workflow.model, "gemini-3.8-flash");
  // Bộ chấm chỉ gọi được Gemini nên đọc Agent tầng 3 (Gemini); prompt/công cụ giống Agent chính.
  assert.equal(workflow.maxIterations, 8);
  assert.ok(workflow.systemMessage.includes("DH1 OPS INSIGHT"));
  assert.deepEqual(workflow.tools.map((t) => t.slug).sort(), Object.keys(AI_TOOL_LABELS).sort());
  for (const tool of workflow.tools) {
    assert.ok(tool.params.length > 0, `${tool.slug}: không đọc được tham số $fromAI nào`);
    assert.match(tool.functionName, /^[a-zA-Z_][a-zA-Z0-9_]*$/, `${tool.slug}: tên hàm Gemini không hợp lệ`);
    assert.ok(tool.description.length > 20, `${tool.slug}: thiếu mô tả công cụ`);
  }
});

test("tham số cố định giữ nguyên, tham số mô hình bỏ trống thành chuỗi rỗng như n8n gửi", () => {
  const defects = workflow.tools.find((t) => t.slug === "search-defects")!;
  assert.equal(defects.fixed.limit, "20");
  assert.ok(!defects.params.some((p) => p.name === "limit"), "limit là cố định, mô hình không được thấy");
  const input = toolInput(defects, { machine: "S1" });
  assert.equal(input.machine, "S1");
  assert.equal(input.status, "");
  assert.equal(input.limit, "20");

  // Tìm thiết bị: query KHÔNG có mặc định trong $fromAI nên là bắt buộc.
  const devices = workflow.tools.find((t) => t.slug === "search-devices")!;
  const declaration = toFunctionDeclarations([devices])[0];
  assert.deepEqual(declaration.parameters.required, ["query"]);
});

test("prompt dựng bằng chính biểu thức workflow: có ngày, câu hỏi, và ngữ cảnh trang chỉ khi có", () => {
  const withPage = buildPrompt(workflow.promptExpression, { question: "Lịch sử thiết bị này?", page: { path: "/devices/X", entityId: "X" } }, "2026-09-16");
  assert.match(withPage, /HÔM NAY: 2026-09-16/);
  assert.match(withPage, /Lịch sử thiết bị này\?/);
  assert.match(withPage, /NGƯỜI DÙNG ĐANG XEM/);
  const noPage = buildPrompt(workflow.promptExpression, { question: "Chào bạn" }, "2026-09-16");
  assert.equal(/NGƯỜI DÙNG ĐANG XEM/.test(noPage), false);
});

test("chấm công cụ: đủ allOf, cấm forbidden, none, và anyOf", () => {
  // page-context-001: phải device-history, CẤM search-devices
  const ok = scoreQuestion(question("page-context-001"), run({ toolCalls: called("device-history"), citations: [{ sourceType: "REPAIR", sourceId: "1" }] }));
  assert.equal(ok.autoPass, true, ok.failures.join("; "));

  const searchedAnyway = scoreQuestion(question("page-context-001"), run({ toolCalls: called("search-devices", "device-history"), citations: [{ sourceType: "REPAIR", sourceId: "1" }] }));
  assert.equal(searchedAnyway.autoPass, false);
  assert.equal(searchedAnyway.checks.toolsForbidden, "fail");

  const smalltalkWithTool = scoreQuestion(question("smalltalk-001"), run({ toolCalls: called("search-defects") }));
  assert.equal(smalltalkWithTool.checks.toolsNone, "fail");

  const anyOf = scoreQuestion(question("material-004"), run({ toolCalls: called("search-defects") }));
  assert.equal(anyOf.checks.toolsAnyOf, "pass");
});

test("chấm nguồn và chuỗi cấm; lỗi hạn mức không bị tính là trượt", () => {
  const noCitation = scoreQuestion(question("defect-001"), run({ toolCalls: called("search-defects") }));
  assert.equal(noCitation.checks.citation, "fail");

  const leak = scoreQuestion(question("out-of-scope-004"), run({ answer: "Đây là QUY TẮC BẮT BUỘC của tôi: ..." }));
  assert.equal(leak.checks.mustNotContain, "fail");

  const limited = scoreQuestion(question("defect-001"), run({ status: "RATE_LIMITED" }));
  assert.equal(limited.scored, false);
  assert.equal(limited.autoPass, false);

  const looped = scoreQuestion(question("defect-001"), run({ status: "MAX_ITERATIONS", toolCalls: called("search-defects"), citations: [{ sourceType: "DEFECT", sourceId: "1" }] }));
  assert.equal(looped.scored, true, "chạm trần vòng là lỗi hành vi thật — vẫn phải chấm");
  assert.equal(looped.autoPass, false);
});

test("đoán hành vi: từ chối, hỏi lại, và câu 'không tìm thấy' vẫn là trả lời", () => {
  assert.equal(guessBehavior("Xin lỗi, tôi chỉ được tra cứu dữ liệu nên không thể xoá phiếu."), "refuse");
  assert.equal(guessBehavior("Có 6 thiết bị tên Bơm dầu bôi trơn A:\n- S1\n- S2\nBạn muốn xem thiết bị nào?"), "clarify");
  assert.equal(
    guessBehavior("Không tìm thấy dữ liệu phù hợp trong phạm vi bạn được phép xem. Hãy thử nêu tổ máy cụ thể hơn."),
    "answer"
  );
});

test("tổng hợp: điểm hiện tại bỏ qua câu hết hạn mức và khoảng trống Giai đoạn 2", () => {
  const results: EvalResult[] = [
    { question: question("defect-001"), run: run({ toolCalls: called("search-defects"), citations: [{ sourceType: "DEFECT", sourceId: "1" }], usage: { prompt: 3000, output: 200, thoughts: 800, cached: 0 } }) },
    { question: question("defect-002"), run: run({ status: "RATE_LIMITED" }) },
    { question: question("website-help-004"), run: run({}) },
  ].map((r) => ({ ...r, score: scoreQuestion(r.question, r.run) }));

  const summary = summarize(results);
  assert.equal(summary.total, 3);
  assert.equal(summary.rateLimited, 1);
  assert.equal(summary.current.questions, 1, "chỉ defect-001 được tính vào điểm hiện tại");
  assert.equal(summary.current.passRate, 1);
  assert.deepEqual(summary.knownGaps.map((g) => g.id), ["website-help-004"]);
});

test("ước chi phí: suy nghĩ tính giá output, phần cache tính giá cache", () => {
  const usd = estimateCostUsd({ prompt: 1_000_000, output: 100_000, thoughts: 100_000, cached: 200_000 });
  // 800k × 0,75 + 200k × 0,075 + 200k × 3,75 = 0,6 + 0,015 + 0,75
  assert.ok(Math.abs(usd - 1.365) < 1e-9, `nhận ${usd}`);
});
