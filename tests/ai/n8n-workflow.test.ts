import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

type WorkflowNode = {
  name: string;
  type: string;
  typeVersion: number;
  onError?: string;
  retryOnFail?: boolean;
  credentials?: unknown;
  parameters: {
    authentication?: string;
    genericAuthType?: string;
    responseMode?: string;
    url?: string;
    jsCode?: string;
    text?: string;
    needsFallback?: boolean;
    options?: Record<string, unknown>;
    headerParameters?: { parameters: Array<{ name: string; value: string }> };
    bodyParameters?: { parameters: Array<{ name: string; value: string }> };
  };
};

const workflowText = readFileSync(new URL("../../docs/n8n-ai-chat/workflow-production.json", import.meta.url), "utf8");
const workflow = JSON.parse(workflowText) as {
  active: boolean;
  settings: Record<string, unknown>;
  connections: Record<string, Record<string, Array<Array<{ node: string; index: number }>>>>;
  nodes: WorkflowNode[];
};

const byName = (name: string) => workflow.nodes.find(node => node.name === name)!;
const agent = byName("Trợ lý AI VH1");
/** Tầng 3: chỉ chạy khi cả Gemini lẫn Groq của Agent chính cùng báo 429/503. */
const backupAgent = byName("Trợ lý AI VH1 - tầng 3");

function languageModelsOf(agentName: string) {
  return Object.entries(workflow.connections)
    .flatMap(([source, outputs]) => (outputs.ai_languageModel ?? []).flat().map(target => ({ source, ...target })))
    .filter(target => target.node === agentName)
    .sort((left, right) => left.index - right.index);
}

function toolsOf(agentName: string) {
  return Object.entries(workflow.connections)
    .filter(([, outputs]) => (outputs.ai_tool ?? []).flat().some(target => target.node === agentName))
    .map(([source]) => source)
    .sort();
}

test("workflow không đọc môi trường, không mang credential và bắt buộc Header Auth ở cả tám đầu kết nối", () => {
  assert.equal(workflowText.includes("$env"), false);
  assert.equal(workflow.active, false);
  assert.equal(workflow.nodes.some(node => node.credentials), false);
  const webhook = workflow.nodes.find(node => node.type === "n8n-nodes-base.webhook")!;
  assert.equal(webhook.parameters.authentication, "headerAuth");
  const outbound = workflow.nodes.filter(node => node.parameters.url);
  // Sáu công cụ tra cứu + node dọn hội thoại hàng ngày.
  assert.equal(outbound.length, 7);
  for (const node of outbound) {
    assert.equal(node.parameters.authentication, "genericCredentialType");
    assert.equal(node.parameters.genericAuthType, "httpHeaderAuth");
    assert.equal(new URL(node.parameters.url!).origin, "https://duyenhai1.vn");
    const headers = node.parameters.headerParameters?.parameters ?? [];
    assert.equal(headers.some(header => header.name.toLowerCase() === "authorization"), false);
    if (node.type === "n8n-nodes-base.httpRequestTool") {
      assert.equal(
        headers.find(header => header.name === "X-AI-Capability")?.value,
        "={{ $('Xác thực và chuẩn hóa').first().json.capability }}"
      );
      // Mô hình chỉ điền tham số tra cứu; capability/token không bao giờ đi qua $fromAI.
      for (const body of node.parameters.bodyParameters?.parameters ?? []) {
        assert.equal(/capability|token/i.test(body.name), false);
      }
    }
  }
});

test("workflow không lưu nội dung execution thành công hoặc thất bại", () => {
  assert.equal(workflow.settings.saveDataErrorExecution, "none");
  assert.equal(workflow.settings.saveDataSuccessExecution, "none");
  assert.equal(workflow.settings.saveManualExecutions, false);
  assert.equal(workflow.settings.saveExecutionProgress, false);
});

test("câu trả lời được stream: webhook 2.1 streaming, Agent bật streaming, nhánh lỗi trả bằng mẩu stream", () => {
  const webhook = byName("Webhook AI Chat");
  assert.equal(webhook.parameters.responseMode, "streaming");
  assert.ok(webhook.typeVersion >= 2.1);
  assert.equal(agent.parameters.options?.enableStreaming, true);
  assert.equal(backupAgent.parameters.options?.enableStreaming, true);
  const respond = byName("Trả lỗi về website");
  assert.ok(respond.typeVersion >= 1.5);
  assert.equal(respond.parameters.options?.enableStreaming, true);
  // Không còn node dựng JSON {answer, citations, proof} từ đầu ra của mô hình.
  assert.equal(workflow.nodes.some(node => node.type === "n8n-nodes-base.respondToWebhook" && node.name !== "Trả lỗi về website"), false);
  assert.equal(/proof|citations/.test(String(agent.parameters.options?.systemMessage)), false);
});

test("Agent có mô hình dự phòng, giới hạn vòng lặp và không tự thử lại cả lượt", () => {
  assert.equal(agent.parameters.needsFallback, true);
  const models = languageModelsOf(agent.name);
  assert.deepEqual(models.map(model => model.index), [0, 1]);
  assert.match(byName(models[0].source).type, /lmChatGoogleGemini$/);
  assert.match(byName(models[1].source).type, /lmChatGroq$/);
  const maxIterations = Number(agent.parameters.options?.maxIterations);
  assert.ok(maxIterations >= 4 && maxIterations <= 10);
  assert.notEqual(agent.retryOnFail, true);
});

test("tầng 3 là bản sao Agent chính chạy Cerebras: cùng prompt, cùng quy tắc, một model, không fallback", () => {
  // Sửa system message/prompt ở một Agent mà quên Agent kia là tầng 3 trả lời theo luật cũ đúng
  // lúc hệ thống đang sự cố — khoá bằng so sánh nguyên khối.
  const { needsFallback: _primary, ...primaryParameters } = agent.parameters;
  const { needsFallback: backupFallback, ...backupParameters } = backupAgent.parameters;
  assert.deepEqual(backupParameters, primaryParameters);
  assert.equal(backupFallback, false);
  assert.equal(backupAgent.type, agent.type);
  assert.notEqual(backupAgent.retryOnFail, true);

  const models = languageModelsOf(backupAgent.name);
  assert.equal(models.length, 1);
  const cerebras = byName(models[0].source) as WorkflowNode & { parameters: { model?: { value?: string } } };
  assert.match(cerebras.type, /lmChatOpenAi$/);
  assert.equal(cerebras.parameters.model?.value, "gpt-oss-120b");
});

test("sáu công cụ tra cứu đều nối vào CẢ HAI Agent và trỏ đúng endpoint của website", () => {
  const expected = [
    "Lịch sử thiết bị", "Lịch trực ca", "Thông báo, mệnh lệnh",
    "Tìm thiết bị", "Tra cứu khiếm khuyết", "Tra cứu thay vật tư",
  ].sort();
  assert.deepEqual(toolsOf(agent.name), expected);
  assert.deepEqual(toolsOf(backupAgent.name), expected);
  for (const [name, slug] of [["Lịch trực ca", "shift-schedule"], ["Thông báo, mệnh lệnh", "search-announcements"]] as const) {
    assert.equal(byName(name).parameters.url, `https://duyenhai1.vn/api/integrations/n8n/ai/tools/${slug}`);
    assert.equal(byName(name).type, "n8n-nodes-base.httpRequestTool");
  }
});

function normalize(body: unknown) {
  const jsCode = byName("Xác thực và chuẩn hóa").parameters.jsCode!;
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

test("chuẩn hóa giữ ngữ cảnh trang nội bộ và loại đường dẫn trỏ ra ngoài", () => {
  const base = { question: "Thiết bị này hỏng gì", capability: "signed", conversationId: "conversation" };
  const kept = normalize({ ...base, page: { path: "/devices/S1.01", entityType: "DEVICE", entityId: "S1.01", label: "Quạt khói A", thua: "bỏ" } });
  assert.deepEqual(JSON.parse(JSON.stringify(kept))[0].json.page, {
    path: "/devices/S1.01", entityType: "DEVICE", entityId: "S1.01", label: "Quạt khói A",
  });
  for (const page of [{ path: "//evil.example/x" }, { path: "https://evil.example" }, { path: "" }, "chuỗi"]) {
    assert.equal(JSON.parse(JSON.stringify(normalize({ ...base, page })))[0].json.page, undefined);
  }
});

test("prompt mang ngữ cảnh trang khi có, và bỏ hẳn khi không có", () => {
  const expression = agent.parameters.text!;
  const run = (json: Record<string, unknown>) => runInNewContext(expression.slice(3, -2), {
    $json: json,
    $now: { setZone: () => ({ toFormat: () => "2026-09-15" }) },
  });
  assert.match(run({ question: "x", history: [], page: { path: "/devices/S1.01", entityId: "S1.01" } }), /NGƯỜI DÙNG ĐANG XEM.*S1\.01/);
  assert.equal(/NGƯỜI DÙNG ĐANG XEM/.test(run({ question: "x", history: [] })), false);
});

test("chuẩn hóa từ chối request thiếu capability hoặc câu hỏi quá dài", () => {
  assert.throws(() => normalize(null));
  assert.throws(() => normalize({ question: "Tìm thiết bị", conversationId: "conversation" }));
  assert.throws(() => normalize({ question: "x".repeat(2001), capability: "signed", conversationId: "conversation" }));
});

test("prompt trong file import là biểu thức JavaScript hợp lệ và mang ngày hôm nay", () => {
  const expression = agent.parameters.text!;
  const result = runInNewContext(expression.slice(3, -2), {
    $json: { question: "Kiểm tra", history: [] },
    $now: { setZone: () => ({ toFormat: () => "2026-09-15" }) },
  });
  assert.match(result, /Kiểm tra/);
  assert.match(result, /HÔM NAY: 2026-09-15/);
});

test("các node xử lý đưa lỗi tới nhánh trả lỗi, output thành công của Agent để trống", () => {
  for (const name of ["Xác thực và chuẩn hóa", agent.name, backupAgent.name]) {
    assert.equal(byName(name).onError, "continueErrorOutput");
    assert.equal(workflow.connections[name].main[1][0].node, "Chuẩn hóa lỗi AI");
  }
  for (const name of [agent.name, backupAgent.name]) assert.deepEqual(workflow.connections[name].main[0], []);
  assert.equal(workflow.connections["Chuẩn hóa lỗi AI"].main[0][0].node, "Còn tầng 3?");
  const gate = workflow.connections["Còn tầng 3?"].main;
  assert.equal(gate[0][0].node, "Lấy lại câu hỏi");
  assert.equal(gate[1][0].node, "Trả lỗi về website");
  assert.equal(workflow.connections["Lấy lại câu hỏi"].main[0][0].node, backupAgent.name);
});

test("chỉ lỗi quá tải/hết lượt của Agent chính mới chuyển tầng 3, và chỉ một lần", () => {
  const gate = byName("Còn tầng 3?").parameters as unknown as {
    conditions: { conditions: Array<{ leftValue: string; operator: { type: string; operation: string } }> };
  };
  const [condition] = gate.conditions.conditions;
  assert.deepEqual(condition.operator, { type: "boolean", operation: "true", singleValue: true });
  const decide = (code: string, backupRan: boolean) => runInNewContext(condition.leftValue.slice(3, -2), {
    $json: { code },
    $: (name: string) => {
      assert.equal(name, backupAgent.name);
      return { isExecuted: backupRan };
    },
  });
  assert.equal(decide("AI_PROVIDER_UNAVAILABLE", false), true);
  assert.equal(decide("AI_PROVIDER_RATE_LIMITED", false), true);
  // Lỗi thật (bug, dữ liệu sai) không được che bằng cách hỏi lại model khác.
  assert.equal(decide("AI_WORKFLOW_FAILED", false), false);
  // Tầng 3 cũng hỏng: quay về nhánh lỗi lần hai thì phải trả lỗi, không lặp vô hạn.
  assert.equal(decide("AI_PROVIDER_RATE_LIMITED", true), false);

  const restore = byName("Lấy lại câu hỏi").parameters.jsCode!;
  const normalized = { question: "Câu hỏi", capability: "signed", conversationId: "c", history: [] };
  const output = runInNewContext(`(function () { ${restore} })()`, {
    $: (name: string) => {
      assert.equal(name, "Xác thực và chuẩn hóa");
      return { first: () => ({ json: normalized }) };
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(output)), [{ json: normalized }]);
});

test("nhánh lỗi phân loại 503/429 và không làm lộ input hoặc bí mật", () => {
  const code = byName("Chuẩn hóa lỗi AI").parameters.jsCode!;
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
