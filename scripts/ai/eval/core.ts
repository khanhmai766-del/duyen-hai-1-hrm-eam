/**
 * LÕI CHẤM BỘ CÂU HỎI CHUẨN — logic thuần, không gọi mạng, không đụng DB.
 *
 * Tách khỏi run.ts để test được bằng `npx tsx --test` mà không tốn lượt gọi Gemini nào. Mọi thứ
 * mô phỏng chatbox (model, system message, prompt, danh sách công cụ, số vòng tối đa) đều ĐỌC từ
 * docs/n8n-ai-chat/workflow-production.json chứ không chép tay: sửa workflow là bộ chấm tự theo,
 * không có bản sao nào lệch.
 */
import { runInNewContext } from "node:vm";

// ───────────────────────────── Workflow → cấu hình chấm ─────────────────────────────

type WorkflowNode = { name: string; type: string; parameters: Record<string, unknown> };
type WorkflowFile = {
  nodes: WorkflowNode[];
  connections: Record<string, Record<string, Array<Array<{ node: string }>>>>;
};

export type EvalToolParam = { name: string; description: string; required: boolean };

export type EvalTool = {
  /** Trùng tên công cụ phía website (AiToolName), lấy từ đuôi URL: `search-devices`. */
  slug: string;
  /** Tên hàm khai báo cho Gemini: chỉ chữ, số, gạch dưới. */
  functionName: string;
  /** Tên node trong n8n, để đọc báo cáo cho dễ. */
  label: string;
  description: string;
  /** Tham số mô hình tự điền qua $fromAI. */
  params: EvalToolParam[];
  /** Tham số cố định n8n luôn gửi kèm (vd limit = "20"), mô hình không thấy. */
  fixed: Record<string, string>;
};

export type EvalWorkflow = {
  model: string;
  systemMessage: string;
  promptExpression: string;
  temperature: number;
  maxOutputTokens: number;
  maxIterations: number;
  tools: EvalTool[];
};

/** `$fromAI("tên", "mô tả", 'string')` hoặc có thêm giá trị mặc định `, ''` (tức là không bắt buộc). */
const FROM_AI = /\$fromAI\(\s*"([^"]+)"\s*,\s*"([^"]*)"\s*,\s*'(\w+)'\s*(?:,\s*'([^']*)'\s*)?\)/;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function parseWorkflowForEval(workflow: WorkflowFile): EvalWorkflow {
  const gemini = workflow.nodes.find((node) => /lmChatGoogleGemini$/.test(node.type));
  if (!gemini) throw new Error("Workflow không có node Google Gemini — bộ chấm chỉ mô phỏng model chính");
  // Workflow có HAI Agent giống hệt nhau về prompt/công cụ: Agent chính (GLM → DeepSeek qua
  // VietAPI) và Agent tầng 3 (Gemini). Bộ chấm mới gọi được Gemini REST nên đo Agent tầng 3 —
  // Agent mà model Gemini nối vào. Điểm số là của GEMINI, chưa phải của GLM/DeepSeek.
  const agentName = workflow.connections[gemini.name]?.ai_languageModel?.flat()[0]?.node;
  const agent = workflow.nodes.find((node) => node.name === agentName && node.type.endsWith(".agent"));
  if (!agent) throw new Error("Không tìm thấy Agent mà model Gemini nối vào");

  // Chỉ lấy công cụ THẬT SỰ nối vào Agent — node HTTP thừa trên canvas không được tính.
  const connected = new Set(
    Object.entries(workflow.connections)
      .filter(([, outputs]) => (outputs.ai_tool ?? []).flat().some((target) => target.node === agent.name))
      .map(([source]) => source)
  );

  const tools = workflow.nodes
    .filter((node) => node.type === "n8n-nodes-base.httpRequestTool" && connected.has(node.name))
    .map((node): EvalTool => {
      const slug = new URL(String(node.parameters.url)).pathname.split("/").filter(Boolean).pop() ?? "";
      const params: EvalToolParam[] = [];
      const fixed: Record<string, string> = {};
      const body = record(node.parameters.bodyParameters).parameters as Array<{ name: string; value: string }> | undefined;
      for (const parameter of body ?? []) {
        const match = FROM_AI.exec(String(parameter.value));
        if (match) params.push({ name: match[1], description: match[2], required: match[4] === undefined });
        else fixed[parameter.name] = String(parameter.value);
      }
      return {
        slug,
        functionName: slug.replace(/[^a-zA-Z0-9]+/g, "_"),
        label: node.name,
        description: String(node.parameters.toolDescription ?? ""),
        params,
        fixed,
      };
    });

  const options = record(gemini.parameters.options);
  const agentOptions = record(agent.parameters.options);
  return {
    model: String(gemini.parameters.modelName ?? "").replace(/^models\//, ""),
    systemMessage: String(agentOptions.systemMessage ?? ""),
    promptExpression: String(agent.parameters.text ?? ""),
    temperature: Number(options.temperature ?? 0.1),
    maxOutputTokens: Number(options.maxOutputTokens ?? 2048),
    maxIterations: Number(agentOptions.maxIterations ?? 8),
    tools,
  };
}

/**
 * Dựng đúng câu prompt n8n gửi cho Agent bằng cách CHẠY biểu thức trong workflow — cùng cách
 * tests/ai/n8n-workflow.test.ts kiểm biểu thức đó, nên prompt của bộ chấm không thể lệch production.
 */
export function buildPrompt(
  expression: string,
  input: { question: string; page?: unknown; history?: Array<{ role: string; content: string }> },
  today: string
) {
  const body = expression.trim();
  if (!body.startsWith("={{") || !body.endsWith("}}")) throw new Error("Biểu thức prompt không đúng dạng ={{ … }}");
  return String(runInNewContext(body.slice(3, -2), {
    $json: { question: input.question, history: input.history ?? [], ...(input.page ? { page: input.page } : {}) },
    $now: { setZone: () => ({ toFormat: () => today }) },
  }));
}

/** Khai báo công cụ theo định dạng functionDeclarations của Gemini REST. */
export function toFunctionDeclarations(tools: EvalTool[]) {
  return tools.map((tool) => {
    const required = tool.params.filter((param) => param.required).map((param) => param.name);
    return {
      name: tool.functionName,
      description: tool.description,
      parameters: {
        type: "OBJECT",
        properties: Object.fromEntries(tool.params.map((param) => [param.name, { type: "STRING", description: param.description }])),
        ...(required.length ? { required } : {}),
      },
    };
  });
}

/**
 * Tham số thật website nhận được: n8n gửi MỌI tham số khai báo (mô hình bỏ trống thì là chuỗi
 * rỗng, đúng giá trị mặc định `''` của $fromAI) cộng các tham số cố định.
 */
export function toolInput(tool: EvalTool, args: Record<string, unknown> | undefined) {
  const input: Record<string, unknown> = {};
  for (const param of tool.params) {
    const value = args?.[param.name];
    input[param.name] = value === undefined || value === null ? "" : value;
  }
  return { ...input, ...tool.fixed };
}

// ───────────────────────────── Câu hỏi & chấm điểm ─────────────────────────────

export type Behavior = "answer" | "clarify" | "refuse";

export type EvalQuestion = {
  id: string;
  category: string;
  question: string;
  page?: { path: string; entityType?: string; entityId?: string; label?: string };
  expect: {
    tools: { allOf?: string[]; anyOf?: string[]; forbidden?: string[]; none?: boolean };
    citation: "required" | "forbidden" | "optional";
    behavior: Behavior;
    answerMustNotContain?: string[];
  };
  tags: string[];
  targetPhase: number;
  why: string;
};

export type ToolCallRecord = { tool: string; args: Record<string, unknown>; items: number; error?: string };

/**
 * OK             — mô hình trả lời xong.
 * MAX_ITERATIONS — gọi công cụ tới trần số vòng mà không chốt câu trả lời: VẪN chấm (là lỗi hành vi thật).
 * RATE_LIMITED   — hết hạn mức Gemini dù đã chờ và thử lại: KHÔNG chấm (không nói gì về chất lượng).
 * ERROR          — lỗi hạ tầng/phản hồi lạ: KHÔNG chấm.
 */
export type RunStatus = "OK" | "MAX_ITERATIONS" | "RATE_LIMITED" | "ERROR";

export type TokenUsage = { prompt: number; output: number; thoughts: number; cached: number };

export type EvalRun = {
  status: RunStatus;
  answer: string;
  toolCalls: ToolCallRecord[];
  citations: Array<{ sourceType: string; sourceId: string }>;
  modelCalls: number;
  latencyMs: number;
  usage: TokenUsage;
  error?: string;
};

type Check = "pass" | "fail" | "skip";

export type EvalScore = {
  /** false = không tính điểm (hết hạn mức hoặc lỗi hạ tầng). */
  scored: boolean;
  checks: Record<"toolsAllOf" | "toolsAnyOf" | "toolsForbidden" | "toolsNone" | "citation" | "mustNotContain", Check>;
  /** Mọi kiểm tra TỰ ĐỘNG đều đạt. Hành vi không nằm trong này vì chỉ là đoán. */
  autoPass: boolean;
  failures: string[];
  behaviorGuess: Behavior;
  behaviorMatches: boolean;
};

const REFUSE = /(không thể|không hỗ trợ|không được phép|không có quyền|chỉ (có thể |được )?(đọc|tra cứu)|ngoài phạm vi|không cung cấp|không nằm trong phạm vi|không thực hiện được)/i;
const CLARIFY = /(bạn (muốn|cần|vui lòng|có thể cho biết)|vui lòng (chọn|cho biết|xác nhận|nêu rõ)|(thiết bị|cái|loại) nào|chọn (một|thiết bị))/i;

/**
 * ĐOÁN hành vi từ câu trả lời — chỉ để người soát lọc nhanh, KHÔNG tính vào điểm tự động.
 * Hỏi lại phải vừa có cụm từ hỏi lại vừa kết thúc bằng dấu hỏi: câu "không tìm thấy, hãy hỏi cụ
 * thể hơn" theo quy tắc 5 là một câu TRẢ LỜI, không được đếm thành hỏi lại.
 */
export function guessBehavior(answer: string): Behavior {
  const text = answer.trim();
  if (REFUSE.test(text)) return "refuse";
  const lastLine = text.split(/\n+/).map((line) => line.trim()).filter(Boolean).pop() ?? "";
  if (CLARIFY.test(text) && lastLine.endsWith("?")) return "clarify";
  return "answer";
}

export function scoreQuestion(question: EvalQuestion, run: EvalRun): EvalScore {
  const called = new Set(run.toolCalls.map((call) => call.tool));
  const failures: string[] = [];
  const { allOf = [], anyOf = [], forbidden = [], none } = question.expect.tools;

  const check = (applies: boolean, ok: boolean, reason: string): Check => {
    if (!applies) return "skip";
    if (!ok) failures.push(reason);
    return ok ? "pass" : "fail";
  };

  const missing = allOf.filter((tool) => !called.has(tool));
  const hit = forbidden.filter((tool) => called.has(tool));
  const leaked = (question.expect.answerMustNotContain ?? []).filter((s) => run.answer.toLowerCase().includes(s.toLowerCase()));
  const calledList = [...called].join(", ") || "không gọi";

  const checks = {
    toolsAllOf: check(allOf.length > 0, missing.length === 0, `thiếu công cụ: ${missing.join(", ")} (đã gọi: ${calledList})`),
    toolsAnyOf: check(anyOf.length > 0, anyOf.some((tool) => called.has(tool)), `cần một trong: ${anyOf.join(", ")} (đã gọi: ${calledList})`),
    toolsForbidden: check(forbidden.length > 0, hit.length === 0, `gọi công cụ bị cấm: ${hit.join(", ")}`),
    toolsNone: check(Boolean(none), called.size === 0, `phải không gọi công cụ nào (đã gọi: ${calledList})`),
    citation: check(
      question.expect.citation !== "optional",
      question.expect.citation === "required" ? run.citations.length > 0 : run.citations.length === 0,
      question.expect.citation === "required" ? "thiếu nguồn đối chiếu" : `không được có nguồn (có ${run.citations.length})`
    ),
    mustNotContain: check(Boolean(question.expect.answerMustNotContain?.length), leaked.length === 0, `câu trả lời lộ: ${leaked.join(", ")}`),
  };

  const scored = run.status === "OK" || run.status === "MAX_ITERATIONS";
  if (run.status === "MAX_ITERATIONS") failures.push("chạm trần số vòng gọi mô hình mà chưa chốt câu trả lời");
  const behaviorGuess = guessBehavior(run.answer);
  return {
    scored,
    checks,
    autoPass: scored && run.status === "OK" && failures.length === 0,
    failures,
    behaviorGuess,
    behaviorMatches: behaviorGuess === question.expect.behavior,
  };
}

// ───────────────────────────── Tổng hợp ─────────────────────────────

/**
 * Giá Gemini 3.8 Flash trả phí, USD / 1 triệu token — https://ai.google.dev/gemini-api/docs/pricing
 * (trang cập nhật 15/09/2026). Giá ƯU ĐÃI tới 31/12/2026, từ 01/01/2027 tăng gấp đôi.
 * Token "suy nghĩ" tính theo giá output.
 */
export const GEMINI_38_FLASH_PRICE = { inputPerM: 0.75, outputPerM: 3.75, cachedPerM: 0.075, validUntil: "2026-12-31" };

export function estimateCostUsd(usage: TokenUsage, price = GEMINI_38_FLASH_PRICE) {
  const uncached = Math.max(0, usage.prompt - usage.cached);
  return (uncached * price.inputPerM + usage.cached * price.cachedPerM + (usage.output + usage.thoughts) * price.outputPerM) / 1_000_000;
}

export type EvalResult = { question: EvalQuestion; run: EvalRun; score: EvalScore };

const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null);
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export function summarize(results: EvalResult[]) {
  const scored = results.filter((r) => r.score.scored);
  // Điểm HIỆN TẠI chỉ tính câu targetPhase 0: khoảng trống đã biết báo riêng, không kéo điểm xuống.
  const current = scored.filter((r) => r.question.targetPhase === 0);
  const toolOk = (r: EvalResult) => ["toolsAllOf", "toolsAnyOf", "toolsForbidden", "toolsNone"].every((k) => r.score.checks[k as keyof EvalScore["checks"]] !== "fail");
  const withCitationRule = current.filter((r) => r.score.checks.citation !== "skip");

  const byCategory: Record<string, { questions: number; pass: number }> = {};
  for (const r of current) {
    const bucket = (byCategory[r.question.category] ??= { questions: 0, pass: 0 });
    bucket.questions += 1;
    if (r.score.autoPass) bucket.pass += 1;
  }

  const usage = scored.reduce<TokenUsage>((sum, r) => ({
    prompt: sum.prompt + r.run.usage.prompt,
    output: sum.output + r.run.usage.output,
    thoughts: sum.thoughts + r.run.usage.thoughts,
    cached: sum.cached + r.run.usage.cached,
  }), { prompt: 0, output: 0, thoughts: 0, cached: 0 });
  const totalCost = estimateCostUsd(usage);

  return {
    total: results.length,
    scored: scored.length,
    rateLimited: results.filter((r) => r.run.status === "RATE_LIMITED").length,
    errors: results.filter((r) => r.run.status === "ERROR").length,
    current: {
      questions: current.length,
      pass: current.filter((r) => r.score.autoPass).length,
      passRate: rate(current.filter((r) => r.score.autoPass).length, current.length),
      toolAccuracy: rate(current.filter(toolOk).length, current.length),
      citationAccuracy: rate(withCitationRule.filter((r) => r.score.checks.citation === "pass").length, withCitationRule.length),
      behaviorAgreement: rate(current.filter((r) => r.score.behaviorMatches).length, current.length),
    },
    byCategory,
    knownGaps: scored.filter((r) => r.question.targetPhase > 0).map((r) => ({ id: r.question.id, targetPhase: r.question.targetPhase, autoPass: r.score.autoPass })),
    averages: {
      modelCalls: mean(scored.map((r) => r.run.modelCalls)),
      toolCalls: mean(scored.map((r) => r.run.toolCalls.length)),
      latencyMs: mean(scored.map((r) => r.run.latencyMs)),
      promptTokens: mean(scored.map((r) => r.run.usage.prompt)),
      outputTokens: mean(scored.map((r) => r.run.usage.output)),
      thoughtTokens: mean(scored.map((r) => r.run.usage.thoughts)),
    },
    cost: {
      totalUsd: totalCost,
      perQuestionUsd: scored.length ? totalCost / scored.length : 0,
      note: `Ước theo giá trả phí Gemini 3.8 Flash tới ${GEMINI_38_FLASH_PRICE.validUntil}; gói miễn phí thì không mất tiền.`,
    },
    failures: current.filter((r) => !r.score.autoPass).map((r) => ({ id: r.question.id, reasons: r.score.failures })),
  };
}
