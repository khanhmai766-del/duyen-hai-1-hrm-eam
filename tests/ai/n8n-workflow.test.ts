import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const workflowText = readFileSync(new URL("../../docs/n8n-ai-chat/workflow-production.json", import.meta.url), "utf8");
const workflow = JSON.parse(workflowText) as {
  active: boolean;
  settings: Record<string, unknown>;
  connections: Record<string, { main?: Array<Array<{ node: string }>> }>;
  nodes: Array<{
    name: string;
    type: string;
    onError?: string;
    parameters: {
      authentication?: string;
      genericAuthType?: string;
      url?: string;
      jsCode?: string;
      text?: string;
      parametersHeaders?: { values: Array<{ name: string; valueProvider?: string }> };
    };
  }>;
};

test("workflow không đọc môi trường và bắt buộc Header Auth ở cả sáu đầu kết nối", () => {
  assert.equal(workflowText.includes("$env"), false);
  assert.equal(workflow.active, false);
  const webhook = workflow.nodes.find(node => node.type === "n8n-nodes-base.webhook")!;
  assert.equal(webhook.parameters.authentication, "headerAuth");
  const outbound = workflow.nodes.filter(node => node.parameters.url);
  assert.equal(outbound.length, 5);
  for (const node of outbound) {
    assert.equal(node.parameters.authentication, "genericCredentialType");
    assert.equal(node.parameters.genericAuthType, "httpHeaderAuth");
    assert.equal(new URL(node.parameters.url!).origin, "https://duyenhai1.vn");
    const headers = node.parameters.parametersHeaders?.values ?? [];
    assert.equal(headers.some(header => header.name === "Authorization"), false);
    if (node.type.endsWith("toolHttpRequest")) {
      assert.equal(headers.find(header => header.name === "X-AI-Capability")?.valueProvider, "fieldValue");
    }
  }
});

test("workflow không lưu nội dung execution thành công hoặc thất bại", () => {
  assert.equal(workflow.settings.saveDataErrorExecution, "none");
  assert.equal(workflow.settings.saveDataSuccessExecution, "none");
  assert.equal(workflow.settings.saveManualExecutions, false);
  assert.equal(workflow.settings.saveExecutionProgress, false);
});

function normalize(body: unknown) {
  const jsCode = workflow.nodes.find(node => node.name === "Xác thực và chuẩn hóa")!.parameters.jsCode!;
  return runInNewContext(`(function () { ${jsCode} })()`, {
    $input: { first: () => ({ json: { body } }) },
  });
}

test("chuẩn hóa chỉ giữ dữ liệu cần thiết, không nhận URL/token tùy ý từ request", () => {
  const output = normalize({
    question: "  Tìm thiết bị  ", capability: "signed-capability", conversationId: "conversation",
    appUrl: "https://evil.example", user: { email: "private@example.com" },
    history: [{ role: "USER", content: "Câu trước", secret: "không chuyển tiếp" }, { role: "SYSTEM", content: "Sai vai trò" }],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(output)), [{ json: {
    question: "Tìm thiết bị", capability: "signed-capability", conversationId: "conversation",
    history: [{ role: "USER", content: "Câu trước" }],
  } }]);
});

test("chuẩn hóa từ chối request thiếu capability hoặc câu hỏi quá dài", () => {
  assert.throws(() => normalize(null));
  assert.throws(() => normalize({ question: "Tìm thiết bị", conversationId: "conversation" }));
  assert.throws(() => normalize({ question: "x".repeat(2001), capability: "signed", conversationId: "conversation" }));
});

test("prompt trong file import là biểu thức JavaScript hợp lệ", () => {
  const expression = workflow.nodes.find(node => node.type.endsWith(".agent"))!.parameters.text!;
  const result = runInNewContext(expression.slice(3, -2), { $json: { question: "Kiểm tra", history: [] } });
  assert.match(result, /Kiểm tra/);
});

test("các node xử lý đưa lỗi tới nhánh trả JSON, không tới nhánh thành công", () => {
  for (const name of ["Xác thực và chuẩn hóa", "Trợ lý AI VH1", "Chuẩn hóa câu trả lời"]) {
    assert.equal(workflow.nodes.find(node => node.name === name)!.onError, "continueErrorOutput");
    assert.equal(workflow.connections[name].main![1][0].node, "Chuẩn hóa lỗi AI");
  }
  assert.equal(workflow.connections["Chuẩn hóa lỗi AI"].main![0][0].node, "Trả lỗi JSON về website");
});

test("nhánh lỗi phân loại 503/429 và không làm lộ input hoặc bí mật", () => {
  const code = workflow.nodes.find(node => node.name === "Chuẩn hóa lỗi AI")!.parameters.jsCode!;
  for (const [error, expectedCode, status] of [
    [{ description: "[503 Service Unavailable] This model is experiencing high demand. key=secret-token" }, "AI_PROVIDER_UNAVAILABLE", 503],
    ["Service unavailable - try again later", "AI_PROVIDER_UNAVAILABLE", 503],
    [{ httpCode: "429", message: "Private details" }, "AI_PROVIDER_RATE_LIMITED", 429],
    ["Unexpected failure with secret-token", "AI_WORKFLOW_FAILED", 502],
  ] as const) {
    const result = runInNewContext(`(function () { ${code} })()`, {
      $input: { first: () => ({ json: { error, question: "Câu hỏi riêng tư", capability: "private-capability" } }) },
    });
    const output = JSON.parse(JSON.stringify(result));
    assert.equal(output[0].json.code, expectedCode);
    assert.equal(output[0].json.statusCode, status);
    assert.deepEqual(Object.keys(output[0].json).sort(), ["code", "error", "statusCode"]);
    assert.equal(JSON.stringify(output).includes("secret-token"), false);
    assert.equal(JSON.stringify(output).includes("private-capability"), false);
  }
});
