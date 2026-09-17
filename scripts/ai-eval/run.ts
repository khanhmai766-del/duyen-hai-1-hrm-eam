/**
 * CHẤM BỘ CÂU HỎI CHUẨN (tests/ai/eval/questions.json) — chạy trên MÁY DEV.
 *
 *   npm run ai:eval -- --dry-run                     # không gọi Gemini: kiểm cấu hình + chạy thử 1 công cụ
 *   npm run ai:eval                                  # chạy cả bộ
 *   npm run ai:eval -- --only shift,page-context-001 # chỉ nhóm/câu này
 *   npm run ai:eval -- --email ten@powerplant.vn     # hỏi dưới danh nghĩa tài khoản dev này
 *
 * Mô phỏng chatbox production mà KHÔNG qua n8n: đọc model, system message, prompt, 6 công cụ và
 * trần số vòng từ docs/n8n-ai-chat/workflow-production.json, gọi thẳng Gemini REST, còn công cụ
 * thì chạy NGAY TRONG TIẾN TRÌNH bằng đúng các hàm website dùng (lib/ai-tools.ts qua runAiTool:
 * cùng phân quyền, cùng ngân sách token, cùng cách gom nguồn). Vì sao không qua n8n: các node
 * công cụ trong workflow gọi cứng https://duyenhai1.vn — chạy từ dev sẽ đọc dữ liệu PRODUCTION.
 *
 * Ba rào an toàn:
 *   1. DB phải là DB dev local (scripts/verify/_safety.mjs) — đúng điều B.3 chính sách ATTT.
 *   2. Chỉ nhận key trong AI_EVAL_GEMINI_API_KEY, KHÔNG BAO GIỜ dùng GEMINI_API_KEY (key TCMS) hay
 *      key n8n: key chấm phải thuộc một project Google RIÊNG để không ăn hạn mức của người dùng thật.
 *   3. Không in key ra đâu cả.
 *
 * Khác production cần biết khi đọc kết quả: n8n bọc thêm lời dẫn của agent LangChain quanh system
 * message, bộ chấm thì không — nên đây là thước đo HÀNH VI CỦA MODEL + PROMPT, không phải bản sao
 * từng byte của n8n. Câu hỏi độc lập, không mang lịch sử hội thoại.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { assertDevDatabase, defaultOut, fail, loadDevEnv } from "../verify/_safety.mjs";
import {
  buildPrompt,
  parseWorkflowForEval,
  scoreQuestion,
  summarize,
  toFunctionDeclarations,
  toolInput,
  type EvalQuestion,
  type EvalResult,
  type EvalRun,
  type EvalWorkflow,
  type ToolCallRecord,
} from "./core";

type Args = { dryRun: boolean; email?: string; only: string[]; limit?: number; delayMs: number; model?: string; out?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, only: [], delayMs: 4000 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) fail(`${flag} thiếu giá trị`);
      i += 1;
      return v;
    };
    if (flag === "--dry-run") args.dryRun = true;
    else if (flag === "--email") args.email = value();
    else if (flag === "--only") args.only.push(...value().split(",").map((s) => s.trim()).filter(Boolean));
    else if (flag === "--limit") args.limit = Number(value());
    else if (flag === "--delay-ms") args.delayMs = Number(value());
    else if (flag === "--model") args.model = value();
    else if (flag === "--out") args.out = value();
    else fail(`không hiểu tham số ${flag}`);
  }
  return args;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD — đúng $now.setZone('Asia/Ho_Chi_Minh') của n8n. */
function todayVn() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

class RateLimitedError extends Error {}

type GeminiPart = { text?: string; thought?: boolean; functionCall?: { name: string; args?: Record<string, unknown>; id?: string }; [key: string]: unknown };
type GeminiResponse = {
  candidates?: Array<{ content?: { role: string; parts?: GeminiPart[] }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number };
};

/**
 * Gọi Gemini, tự chờ và thử lại khi 429/503. Hết lượt thử thì ném RateLimitedError để câu đó
 * được đánh dấu "không chấm" thay vì bị tính là trả lời sai.
 */
async function callGemini(apiKey: string, model: string, body: unknown): Promise<GeminiResponse> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const backoff = [15_000, 30_000, 60_000];
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    if (response.ok) return (await response.json()) as GeminiResponse;

    const text = await response.text().catch(() => "");
    if (response.status === 429 || response.status === 503) {
      if (attempt >= backoff.length) throw new RateLimitedError(`Gemini ${response.status} sau ${attempt + 1} lần thử`);
      // Gemini thường gợi ý thời gian chờ trong error.details[].retryDelay, vd "37s".
      const suggested = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text);
      const waitMs = Math.min(90_000, suggested ? Math.ceil(Number(suggested[1]) * 1000) + 1000 : backoff[attempt]);
      process.stdout.write(`    Gemini ${response.status} — chờ ${Math.round(waitMs / 1000)}s rồi thử lại\n`);
      await sleep(waitMs);
      continue;
    }
    let message = text.slice(0, 300);
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      // Giữ nguyên đoạn text thô.
    }
    throw new Error(`Gemini HTTP ${response.status}: ${message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Rào 1: kiểm DB trước khi nạp bất kỳ module nào chạm DB.
  loadDevEnv();
  assertDevDatabase();

  const workflow: EvalWorkflow = parseWorkflowForEval(JSON.parse(readFileSync("docs/n8n-ai-chat/workflow-production.json", "utf8")));
  if (args.model) workflow.model = args.model;

  let questions = (JSON.parse(readFileSync("tests/ai/eval/questions.json", "utf8")) as { questions: EvalQuestion[] }).questions;
  if (args.only.length) questions = questions.filter((q) => args.only.includes(q.id) || args.only.includes(q.category));
  if (args.limit) questions = questions.slice(0, args.limit);
  if (!questions.length) fail("không còn câu hỏi nào sau khi lọc --only/--limit");

  const { prisma } = await import("@/lib/prisma");
  const tools = await import("@/lib/ai-tools");
  const opsTools = await import("@/lib/ai-tools-ops");
  const registry = await import("@/lib/ai-request-registry");
  const { effectiveUserPosition } = await import("@/lib/current-position");
  const { hasAssignedPermissionLevel } = await import("@/lib/rbac-permissions");

  const implementations: Record<string, (user: never, input: Record<string, unknown>) => Promise<{ items?: Array<Record<string, unknown>> }>> = {
    "search-devices": tools.aiSearchDevices,
    "search-defects": tools.aiSearchDefects,
    "device-history": tools.aiGetDeviceHistory,
    "material-replacements": tools.aiSearchMaterialReplacements,
    "shift-schedule": tools.aiGetShiftSchedule,
    "search-announcements": tools.aiSearchAnnouncements,
    "search-knowledge-base": tools.aiSearchKnowledgeBase,
    "search-work-permits": opsTools.aiSearchWorkPermits,
    "safety-registers": opsTools.aiSearchSafetyRegisters,
    "search-materials": opsTools.aiSearchMaterials,
    "material-tickets": opsTools.aiSearchMaterialTickets,
    "material-plans": opsTools.aiMaterialPlans,
    "chemical-inventory": opsTools.aiChemicalInventory,
    "search-archive": opsTools.aiSearchArchive,
  };
  const missing = workflow.tools.filter((t) => !implementations[t.slug]).map((t) => t.slug);
  if (missing.length) fail(`workflow có công cụ website chưa có hàm tương ứng: ${missing.join(", ")}`);

  // Người hỏi: dựng giống hệt requireAiToolUser (lib/ai-auth.ts). ADMIN giữ nguyên vai trò, tức như
  // đang BẬT chế độ quản trị: đo 16/09/2026 trên DB dev, admin bị hạ xuống MANAGER (chế độ quản trị
  // tắt) ở cương vị "Trưởng kíp Lò - Máy" thấy 0/21.992 thiết bị — mọi công cụ trả rỗng và cả lượt
  // chấm thành vô nghĩa. Muốn đo đúng phạm vi của một cương vị thật thì truyền --email tài khoản đó.
  const dbUser = await prisma.user.findFirst({
    where: args.email ? { email: args.email } : { role: "ADMIN", isActive: true, lockedAt: null },
    orderBy: { email: "asc" },
    select: {
      id: true, name: true, email: true, role: true, accessMode: true, position: true,
      secondaryPosition: true, secondaryPosition2: true, currentPosition: true, isActive: true, lockedAt: true,
    },
  });
  if (!dbUser) fail(args.email ? `không có tài khoản ${args.email} trong DB dev` : "DB dev không có tài khoản ADMIN nào đang hoạt động — dùng --email");
  if (!dbUser!.isActive || dbUser!.lockedAt) fail(`tài khoản ${dbUser!.email} đang bị khoá hoặc ngừng hoạt động`);
  const position = effectiveUserPosition(dbUser!);
  const baseUser = {
    ...dbUser!,
    role: dbUser!.role as string,
    systemRole: dbUser!.role,
    currentPosition: position,
    position: position ?? dbUser!.currentPosition ?? dbUser!.position,
  };
  if (!(await hasAssignedPermissionLevel(baseUser, "ai-chat", ["read", "personal", "manage", "full"]))) {
    fail(`tài khoản ${dbUser!.email} không có quyền ai-chat`);
  }

  // Rào chống kết quả vô nghĩa: người hỏi không thấy thiết bị nào thì mọi câu hỏi dữ liệu đều trả
  // rỗng, bộ chấm sẽ báo "trượt" hàng loạt mà không nói gì về chất lượng model.
  const { getCachedEquipmentNodeList } = await import("@/lib/equipment-node-cache");
  const { resolveEquipmentAccessForUser } = await import("@/lib/server-access");
  const allNodes = await getCachedEquipmentNodeList();
  const access = await resolveEquipmentAccessForUser(baseUser as never);
  const visibleNodes = allNodes.filter((node) => access.canViewSeq(node.seq)).length;
  if (visibleNodes === 0) {
    fail(`tài khoản ${dbUser!.email} (vai trò ${baseUser.role}, cương vị "${baseUser.position ?? "không"}") không thấy thiết bị nào trong ${allNodes.length} — chấm sẽ vô nghĩa. Chọn tài khoản khác bằng --email.`);
  }

  console.log(`Người hỏi : ${dbUser!.name} <${dbUser!.email}> · vai trò ${baseUser.role} · cương vị ${baseUser.position ?? "(không)"} · thấy ${visibleNodes}/${allNodes.length} thiết bị`);
  console.log(`Model     : ${workflow.model} · trần ${workflow.maxIterations} vòng · ${workflow.tools.length} công cụ`);
  console.log(`Câu hỏi   : ${questions.length}${args.only.length ? ` (lọc: ${args.only.join(", ")})` : ""}`);

  const declarations = toFunctionDeclarations(workflow.tools);
  const toolBySlug = new Map(workflow.tools.map((t) => [t.slug, t]));
  const toolByFunction = new Map(workflow.tools.map((t) => [t.functionName, t]));

  /** Chạy MỘT công cụ đúng như route /api/integrations/n8n/ai/tools/* trả cho n8n. */
  async function executeTool(user: typeof baseUser & { conversationId: string; requestId: string }, slug: string, args_: Record<string, unknown> | undefined) {
    const tool = toolBySlug.get(slug)!;
    const input = toolInput(tool, args_);
    try {
      const data = await tools.runAiTool(user as never, slug as never, () => implementations[slug](user as never, input));
      return { envelope: { data, meta: null, error: null }, record: { tool: slug, args: input, items: data.items?.length ?? 0 } satisfies ToolCallRecord };
    } catch (error) {
      // Route thật bọc handle(): lỗi không lường trước thành 500 "Lỗi máy chủ".
      return { envelope: { data: null, meta: null, error: "Lỗi máy chủ" }, record: { tool: slug, args: input, items: 0, error: (error as Error).message } satisfies ToolCallRecord };
    }
  }

  if (args.dryRun) {
    const sample = questions.find((q) => q.page) ?? questions[0];
    console.log("\n── DRY RUN: không gọi Gemini ──");
    for (const d of declarations) console.log(`  ${d.name}(${Object.keys(d.parameters.properties).join(", ")})`);
    console.log(`\nPrompt mẫu (${sample.id}):\n  ${buildPrompt(workflow.promptExpression, sample, todayVn())}`);
    const smoke = await executeTool({ ...baseUser, conversationId: randomUUID(), requestId: randomUUID() }, "search-devices", { query: "quạt gió cấp 1" });
    console.log(`\nChạy thử công cụ search-devices trên DB dev: ${smoke.record.error ? `LỖI ${smoke.record.error}` : `${smoke.record.items} kết quả`}`);
    await prisma.$disconnect();
    return;
  }

  // Rào 2: key riêng cho bộ chấm.
  const apiKey = process.env.AI_EVAL_GEMINI_API_KEY?.trim();
  if (!apiKey) {
    fail("thiếu AI_EVAL_GEMINI_API_KEY trong .env. Tạo key ở Google AI Studio trong một project RIÊNG cho việc chấm (không dùng chung project với chatbox production), rồi thêm vào .env của máy dev.");
  }
  if (apiKey === process.env.GEMINI_API_KEY?.trim()) {
    fail("AI_EVAL_GEMINI_API_KEY trùng GEMINI_API_KEY — key chấm phải thuộc project riêng để không ăn hạn mức thật.");
  }

  const results: EvalResult[] = [];
  const today = todayVn();

  for (const [index, question] of questions.entries()) {
    const requestId = randomUUID();
    const conversationId = randomUUID();
    const user = { ...baseUser, conversationId, requestId };
    registry.openAiRequest(requestId, { userId: user.id, conversationId });

    const startedAt = Date.now();
    const evalRun: EvalRun = {
      status: "OK", answer: "", toolCalls: [], citations: [], modelCalls: 0, latencyMs: 0,
      usage: { prompt: 0, output: 0, thoughts: 0, cached: 0 },
    };
    const contents: Array<{ role: string; parts: unknown[] }> = [
      { role: "user", parts: [{ text: buildPrompt(workflow.promptExpression, question, today) }] },
    ];

    try {
      let finished = false;
      for (let turn = 0; turn < workflow.maxIterations; turn += 1) {
        const data = await callGemini(apiKey!, workflow.model, {
          systemInstruction: { parts: [{ text: workflow.systemMessage }] },
          contents,
          tools: [{ functionDeclarations: declarations }],
          generationConfig: { temperature: workflow.temperature, maxOutputTokens: workflow.maxOutputTokens },
        });
        evalRun.modelCalls += 1;
        const usage = data.usageMetadata ?? {};
        evalRun.usage.prompt += usage.promptTokenCount ?? 0;
        evalRun.usage.output += usage.candidatesTokenCount ?? 0;
        evalRun.usage.thoughts += usage.thoughtsTokenCount ?? 0;
        evalRun.usage.cached += usage.cachedContentTokenCount ?? 0;

        const candidate = data.candidates?.[0];
        if (!candidate?.content) throw new Error(`Gemini không trả nội dung (finishReason: ${candidate?.finishReason ?? "không rõ"})`);
        const parts = candidate.content.parts ?? [];
        const calls = parts.filter((part) => part.functionCall);
        const text = parts.filter((part) => typeof part.text === "string" && !part.thought).map((part) => part.text).join("");
        if (text) evalRun.answer = text;

        if (!calls.length) {
          finished = true;
          break;
        }
        // Gửi lại NGUYÊN VẸN nội dung mô hình trả (kể cả chữ ký suy nghĩ), rồi kết quả công cụ.
        contents.push(candidate.content as { role: string; parts: unknown[] });
        const responses = [];
        for (const part of calls) {
          const call = part.functionCall!;
          const tool = toolByFunction.get(call.name);
          const output = tool
            ? await executeTool(user, tool.slug, call.args)
            : { envelope: { data: null, meta: null, error: `Công cụ không tồn tại: ${call.name}` }, record: { tool: call.name, args: call.args ?? {}, items: 0, error: "không tồn tại" } };
          evalRun.toolCalls.push(output.record);
          responses.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: output.envelope } });
        }
        contents.push({ role: "user", parts: responses });
      }
      if (!finished) evalRun.status = "MAX_ITERATIONS";
      evalRun.citations = registry.aiRequestCitations(requestId, evalRun.answer).map((c) => ({ sourceType: c.sourceType, sourceId: c.sourceId }));
    } catch (error) {
      evalRun.status = error instanceof RateLimitedError ? "RATE_LIMITED" : "ERROR";
      evalRun.error = (error as Error).message;
    } finally {
      registry.closeAiRequest(requestId);
      evalRun.latencyMs = Date.now() - startedAt;
    }

    const score = scoreQuestion(question, evalRun);
    results.push({ question, run: evalRun, score });

    const mark = !score.scored ? "·" : score.autoPass ? "✓" : "✗";
    const toolList = evalRun.toolCalls.map((c) => c.tool).join(" → ") || "không công cụ";
    console.log(
      `[${String(index + 1).padStart(2)}/${questions.length}] ${mark} ${question.id.padEnd(22)} ${evalRun.status === "OK" ? "" : `${evalRun.status} `}` +
      `${toolList} · nguồn ${evalRun.citations.length} · ${(evalRun.latencyMs / 1000).toFixed(1)}s` +
      (score.failures.length ? `\n      ↳ ${score.failures.join(" | ")}` : "") +
      (evalRun.error ? `\n      ↳ ${evalRun.error}` : "")
    );

    if (index < questions.length - 1) await sleep(args.delayMs);
  }

  const summary = summarize(results);
  const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
  console.log("\n═══════════ KẾT QUẢ ═══════════");
  console.log(`Chấm được      : ${summary.scored}/${summary.total}  (hết hạn mức ${summary.rateLimited}, lỗi ${summary.errors})`);
  console.log(`ĐIỂM HIỆN TẠI  : ${summary.current.pass}/${summary.current.questions} đạt = ${pct(summary.current.passRate)}   (chỉ tính câu targetPhase 0)`);
  console.log(`  Đúng công cụ : ${pct(summary.current.toolAccuracy)}`);
  console.log(`  Đúng nguồn   : ${pct(summary.current.citationAccuracy)}`);
  console.log(`  Hành vi (đoán, cần người soát): ${pct(summary.current.behaviorAgreement)}`);
  console.log("Theo nhóm      :");
  for (const [category, value] of Object.entries(summary.byCategory)) {
    console.log(`  ${category.padEnd(18)} ${value.pass}/${value.questions}`);
  }
  if (summary.knownGaps.length) {
    console.log(`Khoảng trống đã biết (không tính điểm): ${summary.knownGaps.map((g) => `${g.id}${g.autoPass ? " ✓" : ""}`).join(", ")}`);
  }
  const a = summary.averages;
  console.log(`Trung bình     : ${a.modelCalls.toFixed(1)} lần gọi mô hình · ${a.toolCalls.toFixed(1)} lần tra cứu · ${(a.latencyMs / 1000).toFixed(1)}s`);
  console.log(`Token TB/câu   : vào ${Math.round(a.promptTokens)} · ra ${Math.round(a.outputTokens)} · suy nghĩ ${Math.round(a.thoughtTokens)}`);
  console.log(`Chi phí nếu trả phí: ~$${summary.cost.perQuestionUsd.toFixed(4)}/câu · $${summary.cost.totalUsd.toFixed(4)} cả lượt chấm (${summary.cost.note})`);

  const out = args.out ?? defaultOut("ai-eval");
  writeFileSync(out, JSON.stringify({
    ranAt: new Date().toISOString(),
    model: workflow.model,
    user: { email: dbUser!.email, role: baseUser.role, position: baseUser.position },
    summary,
    results: results.map((r) => ({ id: r.question.id, category: r.question.category, targetPhase: r.question.targetPhase, question: r.question.question, run: r.run, score: r.score })),
  }, null, 2));
  console.log(`\nChi tiết từng câu (kèm câu trả lời): ${out}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("DỪNG:", (error as Error).message);
  process.exit(1);
});
