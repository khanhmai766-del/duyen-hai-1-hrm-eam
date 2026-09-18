import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../../docs/n8n-document-sync/workflow-production.json", import.meta.url);
const aiWorkflowPath = new URL("../../docs/n8n-document-sync/workflow-ai-index-production.json", import.meta.url);

test("workflow đồng bộ tài liệu không nhúng credential hoặc token", async () => {
  const workflow = JSON.parse(await readFile(workflowPath, "utf8"));
  const serialized = JSON.stringify(workflow);
  assert.equal(serialized.includes('"credentials"'), false);
  assert.equal(/Bearer\s+[a-z0-9_-]{12,}/i.test(serialized), false);
  assert.equal(workflow.settings.saveDataSuccessExecution, "none");
});

test("workflow có đủ hai đầu API, Google Drive và quy tắc không chọn bừa", async () => {
  const workflow = JSON.parse(await readFile(workflowPath, "utf8"));
  const nodes = new Map(workflow.nodes.map((node: { name: string }) => [node.name, node]));
  assert.ok(nodes.has("Đọc danh mục website"));
  assert.ok(nodes.has("Đọc file trong thư mục Drive"));
  assert.ok(nodes.has("Chọn PDF chính"));
  assert.ok(nodes.has("Ghi metadata về website"));
  const selection = JSON.stringify(nodes.get("Chọn PDF chính"));
  assert.match(selection, /NEEDS_REVIEW/);
  assert.match(selection, /application\/pdf/);
  assert.match(selection, /candidateFiles/);
  assert.match(selection, /driveManualFileId/);
  assert.doesNotMatch(selection, /sort\([^)]*modifiedTime/);
});

test("các HTTP quan trọng đều retry ba lần", async () => {
  const workflow = JSON.parse(await readFile(workflowPath, "utf8"));
  const httpNodes = workflow.nodes.filter((node: { type: string }) => node.type === "n8n-nodes-base.httpRequest");
  assert.equal(httpNodes.length, 3);
  for (const node of httpNodes) {
    assert.equal(node.retryOnFail, true, node.name);
    assert.equal(node.maxTries, 3, node.name);
  }
});

test("workflow AI xử lý tuần tự, không nhúng credential và chỉ nạp tài liệu thay đổi", async () => {
  const workflow = JSON.parse(await readFile(aiWorkflowPath, "utf8"));
  const serialized = JSON.stringify(workflow);
  const nodes = new Map(workflow.nodes.map((node: { name: string }) => [node.name, node]));
  assert.equal(serialized.includes('"credentials"'), false);
  assert.equal(/Bearer\s+[a-z0-9_-]{12,}/i.test(serialized), false);
  assert.equal(workflow.settings.saveDataSuccessExecution, "none");
  assert.ok(nodes.has("Xử lý từng PDF"));
  assert.ok(nodes.has("Tải một PDF từ Drive"));
  assert.ok(nodes.has("Gửi PDF để lập chỉ mục"));
  assert.match(JSON.stringify(nodes.get("Chỉ lấy PDF cần cập nhật")), /desiredAiIndexVersion/);
  assert.match(JSON.stringify(nodes.get("Gửi PDF để lập chỉ mục")), /binaryData/);
});
