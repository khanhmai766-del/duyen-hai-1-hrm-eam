import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [sourcePath, outputPath] = process.argv.slice(2);

if (!sourcePath || !outputPath) {
  throw new Error("Cách dùng: node scripts/optimize-n8n-defect-workflow.mjs <file-nguồn.json> <file-đích.json>");
}

const workflow = JSON.parse(await readFile(sourcePath, "utf8"));
const nodeByName = new Map(workflow.nodes.map((node) => [node.name, node]));

const requiredNodes = [
  "Chạy thủ công",
  "Chuẩn bị lượt đồng bộ",
  "Bắt đầu run",
  "Đọc Sheet Cơ",
  "Chuẩn hóa và chia batch Cơ",
  "Gửi batch Cơ",
  "Xác nhận xong nguồn Cơ",
  "Đọc Sheet Điện",
  "Chuẩn hóa và chia batch Điện",
  "Gửi batch Điện",
  "Xác nhận xong nguồn Điện",
  "Hoàn tất run",
  "Thời gian kiểm tra SHEET",
  "Kiểm tra modifiedTime Cơ",
  "Kiểm tra modifiedTime Điện",
  "Gộp modifiedTime",
  "Chỉ chạy khi Sheet thay đổi",
  "Ghi nhớ modifiedTime thành công",
];

const missingNodes = requiredNodes.filter((name) => !nodeByName.has(name));
if (missingNodes.length > 0) {
  throw new Error(`Workflow thiếu node: ${missingNodes.join(", ")}`);
}

workflow.name = "Đồng bộ khiếm khuyết DH1 - Tự động tối ưu";

nodeByName.get("Chuẩn bị lượt đồng bộ").parameters.jsCode = `const requestedSources = $input.first()?.json?.expectedSources;
const expectedSources = Array.isArray(requestedSources)
  ? [...new Set(requestedSources.filter((source) => source === "CO" || source === "DIEN"))]
  : ["CO", "DIEN"];

if (!expectedSources.length) {
  return [];
}

return [{
  json: {
    externalRunId: \`defects-\${$execution.id}\`,
    expectedSources,
  },
}];`;

nodeByName.get("Chỉ chạy khi Sheet thay đổi").parameters.jsCode = `const CO_ID = "1zKRH9zhEAkCwGRl4KiaNwUlkLg9_l4WXNSBeg3FK_MA";
const DIEN_ID = "1nPKFBr3wXfOFE4y_WACDs7cvb1ZZA-mg0mZbsIuB_lQ";

const times = {};
for (const item of $input.all()) {
  if (item.json.id === CO_ID) times.co = item.json.modifiedTime;
  if (item.json.id === DIEN_ID) times.dien = item.json.modifiedTime;
}

if (!times.co || !times.dien) {
  throw new Error("Không lấy đủ modifiedTime của Sheet Cơ và Điện");
}

const state = $getWorkflowStaticData("global");
const previous = state.lastSuccessfulModifiedTime || {};
const expectedSources = [];

if (previous.co !== times.co) expectedSources.push("CO");
if (previous.dien !== times.dien) expectedSources.push("DIEN");

if (!expectedSources.length) {
  return [];
}

// Chỉ lưu tạm; mốc này chỉ được xác nhận sau khi API finish trả SUCCESS.
state.pendingModifiedTime = {
  times,
  sources: expectedSources,
};

return [{
  json: {
    expectedSources,
    modifiedTime: times,
    previousModifiedTime: previous,
  },
}];`;

nodeByName.get("Hoàn tất run").parameters.jsonBody =
  "={{ JSON.stringify({ completedSources: $('Bắt đầu run').first().json.data.expectedSources }) }}";

nodeByName.get("Ghi nhớ modifiedTime thành công").parameters.jsCode = `const status = $json.data?.status ?? $json.status;
if (status !== "SUCCESS") {
  throw new Error(\`Không lưu modifiedTime vì trạng thái run là: \${status}\`);
}

const state = $getWorkflowStaticData("global");
const pending = state.pendingModifiedTime;

if (pending?.times && Array.isArray(pending.sources)) {
  const lastSuccessful = { ...(state.lastSuccessfulModifiedTime || {}) };

  if (pending.sources.includes("CO")) {
    lastSuccessful.co = pending.times.co;
  }
  if (pending.sources.includes("DIEN")) {
    lastSuccessful.dien = pending.times.dien;
  }

  state.lastSuccessfulModifiedTime = lastSuccessful;
  delete state.pendingModifiedTime;
}

return $input.all();`;

function sourceConditionNode(name, source, position) {
  return {
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: "",
          typeValidation: "strict",
          version: 2,
        },
        conditions: [
          {
            id: randomUUID(),
            leftValue: `={{ $('Bắt đầu run').first().json.data.expectedSources.includes('${source}') }}`,
            rightValue: "",
            operator: {
              type: "boolean",
              operation: "true",
              singleValue: true,
            },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    id: randomUUID(),
    name,
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position,
  };
}

for (const name of ["Có đồng bộ Cơ?", "Có đồng bộ Điện?"]) {
  const existingIndex = workflow.nodes.findIndex((node) => node.name === name);
  if (existingIndex >= 0) workflow.nodes.splice(existingIndex, 1);
}

workflow.nodes.push(
  sourceConditionNode("Có đồng bộ Cơ?", "CO", [704, -32]),
  sourceConditionNode("Có đồng bộ Điện?", "DIEN", [1536, -32])
);

const positions = {
  "Chạy thủ công": [64, -32],
  "Chuẩn bị lượt đồng bộ": [288, -32],
  "Bắt đầu run": [512, -32],
  "Đọc Sheet Cơ": [896, -160],
  "Chuẩn hóa và chia batch Cơ": [1104, -160],
  "Gửi batch Cơ": [1312, -160],
  "Xác nhận xong nguồn Cơ": [1536, -160],
  "Đọc Sheet Điện": [1728, -160],
  "Chuẩn hóa và chia batch Điện": [1936, -160],
  "Gửi batch Điện": [2144, -160],
  "Xác nhận xong nguồn Điện": [2352, -160],
  "Hoàn tất run": [2560, -32],
  "Ghi nhớ modifiedTime thành công": [2784, -32],
};

for (const [name, position] of Object.entries(positions)) {
  nodeByName.get(name).position = position;
}

const link = (node, index = 0) => ({ node, type: "main", index });

workflow.connections = {
  "Chạy thủ công": { main: [[link("Chuẩn bị lượt đồng bộ")]] },
  "Thời gian kiểm tra SHEET": {
    main: [[link("Kiểm tra modifiedTime Cơ"), link("Kiểm tra modifiedTime Điện")]],
  },
  "Kiểm tra modifiedTime Cơ": { main: [[link("Gộp modifiedTime", 0)]] },
  "Kiểm tra modifiedTime Điện": { main: [[link("Gộp modifiedTime", 1)]] },
  "Gộp modifiedTime": { main: [[link("Chỉ chạy khi Sheet thay đổi")]] },
  "Chỉ chạy khi Sheet thay đổi": { main: [[link("Chuẩn bị lượt đồng bộ")]] },
  "Chuẩn bị lượt đồng bộ": { main: [[link("Bắt đầu run")]] },
  "Bắt đầu run": { main: [[link("Có đồng bộ Cơ?")]] },
  "Có đồng bộ Cơ?": {
    main: [
      [link("Đọc Sheet Cơ")],
      [link("Có đồng bộ Điện?")],
    ],
  },
  "Đọc Sheet Cơ": { main: [[link("Chuẩn hóa và chia batch Cơ")]] },
  "Chuẩn hóa và chia batch Cơ": { main: [[link("Gửi batch Cơ")]] },
  "Gửi batch Cơ": { main: [[link("Xác nhận xong nguồn Cơ")]] },
  "Xác nhận xong nguồn Cơ": { main: [[link("Có đồng bộ Điện?")]] },
  "Có đồng bộ Điện?": {
    main: [
      [link("Đọc Sheet Điện")],
      [link("Hoàn tất run")],
    ],
  },
  "Đọc Sheet Điện": { main: [[link("Chuẩn hóa và chia batch Điện")]] },
  "Chuẩn hóa và chia batch Điện": { main: [[link("Gửi batch Điện")]] },
  "Gửi batch Điện": { main: [[link("Xác nhận xong nguồn Điện")]] },
  "Xác nhận xong nguồn Điện": { main: [[link("Hoàn tất run")]] },
  "Hoàn tất run": { main: [[link("Ghi nhớ modifiedTime thành công")]] },
};

delete workflow.active;
delete workflow.versionId;
delete workflow.activeVersionId;

await writeFile(outputPath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
