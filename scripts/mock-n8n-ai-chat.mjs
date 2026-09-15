#!/usr/bin/env node
/**
 * n8n GIẢ LẬP cho chatbox AI — chỉ dùng trên máy dev để xem giao diện streaming mà không cần
 * n8n/Gemini thật. Nói đúng giao thức của webhook n8n ở chế độ "streaming" (json-lines:
 * keepalive / begin / item / end / error) và gọi thật công cụ "Tìm thiết bị" của website, nên
 * trạng thái "Đang tìm thiết bị", nguồn đối chiếu và giới hạn lượt gọi đều chạy như thật.
 *
 *   node scripts/mock-n8n-ai-chat.mjs            # cổng 5679, website ở http://localhost:3030
 *
 * Chạy website kèm các biến trỏ về đây (chỉ giá trị giả cho dev, không dùng trên production):
 *   N8N_AI_CHAT_WEBHOOK_URL=http://127.0.0.1:5679/webhook/ai-chat-dh1
 *   N8N_AI_CHAT_TOKEN=dev-webhook-token  N8N_AI_TOOL_TOKEN=dev-tool-token
 *   AI_CAPABILITY_SECRET=dev-capability-secret-0123456789abcdef
 *
 * Câu hỏi chứa "lỗi 429" / "lỗi 503" giả lập Gemini báo lỗi để xem luồng tự thử lại và báo lỗi.
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_N8N_PORT ?? 5679);
const APP_URL = process.env.MOCK_APP_URL ?? "http://localhost:3030";
const WEBHOOK_TOKEN = process.env.N8N_AI_CHAT_TOKEN ?? "dev-webhook-token";
const TOOL_TOKEN = process.env.N8N_AI_TOOL_TOKEN ?? "dev-tool-token";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const meta = (nodeName) => ({ nodeId: "mock", nodeName, runIndex: 0, itemIndex: 0, timestamp: Date.now() });

async function callTool(endpoint, capability, body) {
  const response = await fetch(`${APP_URL}/api/integrations/n8n/ai/tools/${endpoint}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOOL_TOKEN}`, "x-ai-capability": capability, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error ?? `HTTP ${response.status}`);
  return json.data;
}

function answerFor(question, devices) {
  if (!devices.items?.length) {
    return `Không tìm thấy dữ liệu phù hợp trong phạm vi bạn được phép xem.\n\nHãy thử hỏi cụ thể hơn, ví dụ nêu **tên thiết bị** hoặc mã KKS.`;
  }
  const lines = devices.items.slice(0, 5).map((item) => `- **${item.title}** — ${item.summary || "chưa có mã KKS"}`);
  return [
    `Tìm thấy ${devices.items.length} thiết bị khớp với "${question}" (dữ liệu giả lập):`,
    "",
    ...lines,
    "",
    devices.items.length > 1 ? "Bạn muốn xem lịch sử của thiết bị nào?" : "Bạn có muốn xem lịch sử khiếm khuyết của thiết bị này không?",
  ].join("\n");
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url?.startsWith("/webhook/")) {
    res.writeHead(404).end();
    return;
  }
  if (req.headers.authorization !== `Bearer ${WEBHOOK_TOKEN}`) {
    res.writeHead(403, { "content-type": "application/json" }).end(JSON.stringify({ message: "Authorization data is wrong!" }));
    return;
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || "{}");
  const question = String(body.question ?? "");

  res.writeHead(200, { "content-type": "application/json-lines; charset=utf-8", "transfer-encoding": "chunked" });
  const write = (chunk) => res.write(`${JSON.stringify(chunk)}\n`);

  try {
    write({ type: "keepalive" });
    await sleep(700);
    const failure = /lỗi\s*(429|503)/i.exec(question);
    if (failure) {
      const description = failure[1] === "429" ? "[429 Too Many Requests] Resource exhausted" : "[503 Service Unavailable] high demand";
      write({ type: "error", content: description, metadata: meta("Trợ lý AI VH1") });
      const code = failure[1] === "429" ? "AI_PROVIDER_RATE_LIMITED" : "AI_PROVIDER_UNAVAILABLE";
      write({ type: "begin", metadata: meta("Trả lỗi về website") });
      write({ type: "item", content: JSON.stringify({ code, error: "…" }), metadata: meta("Trả lỗi về website") });
      write({ type: "end", metadata: meta("Trả lỗi về website") });
      return;
    }

    const query = question.replace(/[?.!]/g, " ").split(/\s+/).filter((word) => word.length >= 3).slice(-2).join(" ") || question;
    const devices = await callTool("search-devices", body.capability, { query, limit: 5 });
    await sleep(600);

    write({ type: "begin", metadata: meta("Trợ lý AI VH1") });
    const text = answerFor(query, devices);
    for (const piece of text.match(/\S+\s*|\n/g) ?? []) {
      write({ type: "item", content: piece, metadata: meta("Trợ lý AI VH1") });
      await sleep(25);
    }
    write({ type: "end", metadata: meta("Trợ lý AI VH1") });
  } catch (error) {
    console.error("[mock n8n]", error.message);
    write({ type: "error", content: String(error.message), metadata: meta("Trợ lý AI VH1") });
    write({ type: "item", content: JSON.stringify({ code: "AI_WORKFLOW_FAILED", error: "…" }), metadata: meta("Trả lỗi về website") });
  } finally {
    res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock n8n] http://127.0.0.1:${PORT}/webhook/ai-chat-dh1 → công cụ tại ${APP_URL}`);
});
