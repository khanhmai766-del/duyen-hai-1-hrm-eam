import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const folder = new URL('../docs/n8n-material-sync/', import.meta.url);
const plan = await readFile(new URL('backup-plan.js', folder), 'utf8') + '\nreturn planBackup($, $json);';
const spreadsheetId = '1wamJN787FowPLI3zU-383CME5R-EkI72EP5qLrhj5J4';
const definitions = [
  { scope: 'materials', sheetName: 'VH1_VTDONGBO', keyIndex: 28, sourceColumns: 31, lastColumn: 'AH', cron: '17 12 * * * *' },
  { scope: 'chemicals', sheetName: 'VH1_HOACHAT_DONGBO', keyIndex: 13, sourceColumns: 16, lastColumn: 'S', cron: '29 16 * * * *' },
  { scope: 'receipts', sheetName: 'NHAP_HOA_CHAT', keyIndex: 7, sourceColumns: 10, lastColumn: 'M', cron: '47 19 * * * *' },
];
const combined = {
  name: 'DỰ PHÒNG - Vật tư, phiếu hóa chất và nhập hóa chất - mỗi giờ',
  nodes: [{ id: 'backup-manual-all', name: 'Chạy thủ công cả 3 tab', type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1, parameters: {}, position: [-1200, 480] }],
  connections: { 'Chạy thủ công cả 3 tab': { main: [[]] } },
  pinData: {}, settings: { executionOrder: 'v1', timezone: 'Asia/Ho_Chi_Minh', executionTimeout: 2700 },
  active: false, meta: { templateCredsSetupCompleted: false }, tags: [],
};

for (const config of definitions) {
  const nodes = [];
  const add = (name, type, parameters, position, extra = {}) => {
    const versions = { manualTrigger: 1, scheduleTrigger: 1.2, code: 2, httpRequest: 4.4, stickyNote: 1 };
    nodes.push({ id: `backup-${config.scope}-${nodes.length}`, name, type: `n8n-nodes-base.${type}`,
      typeVersion: versions[type], parameters, position, ...extra });
  };
  const googleRequest = (name, parameters, position) => add(name, 'httpRequest', {
    authentication: 'predefinedCredentialType', nodeCredentialType: 'googleSheetsOAuth2Api',
    options: { timeout: 60000 }, ...parameters,
  }, position, { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 });

  add('Lịch mỗi giờ', 'scheduleTrigger', { rule: { interval: [{ field: 'cronExpression', expression: config.cron }] } }, [-920, 180]);
  add('Cấu hình dự phòng', 'code', { jsCode: `return [{ json: ${JSON.stringify({ ...config, spreadsheetId }, null, 2)} }];` }, [-680, 80]);
  add('Đọc ảnh chụp website', 'httpRequest', {
    url: 'https://duyenhai1.vn/api/integrations/n8n/material-backup',
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendQuery: true, queryParameters: { parameters: [{ name: 'scope', value: '={{ $json.scope }}' }] },
    options: { timeout: 60000, response: { response: { responseFormat: 'json' } } },
  }, [-440, 80], { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 });
  googleRequest('Đọc cấu trúc tab', {
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId%2Ctitle%2CgridProperties)`,
  }, [-200, 80]);
  googleRequest('Đọc dữ liệu dự phòng', {
    // Đọc toàn tab để không yêu cầu cột vượt lưới khi mẫu chưa có cột bổ sung.
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${config.sheetName}?valueRenderOption=UNFORMATTED_VALUE`,
  }, [40, 80]);
  add('Đối chiếu và lập gói ghi', 'code', { jsCode: plan }, [280, 80]);
  googleRequest('Ghi bản dự phòng', {
    method: 'POST', url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ requests: $json.requests }) }}',
    options: { timeout: 60000, batching: { batch: { batchSize: 1, batchInterval: 1200 } } },
  }, [520, 80]);
  add('Kết quả', 'code', { jsCode: "const batches = $('Đối chiếu và lập gói ghi').all();\nconst first = batches[0].json;\nreturn [{ json: { success: true, targetSheet: first.targetSheet, syncedRows: first.sourceRows, missingRows: first.missingRows, reusedRows: first.reusedRows, batches: batches.length } }];" }, [760, 80]);
  add('Hướng dẫn', 'stickyNote', {
    content: `## Dự phòng ${config.sheetName}\nChạy mỗi giờ theo cron \`${config.cron}\`, múi giờ Asia/Ho_Chi_Minh.\n\n1. Website cần có API /api/integrations/n8n/material-backup.\n2. Chọn Header Auth: Authorization = Bearer <N8N_MATERIAL_SYNC_TOKEN> cho node đọc website.\n3. Chọn Google Sheets OAuth2 cho 3 node Google của nhánh này; tài khoản cần quyền sửa file dự phòng.\n4. Nút chạy thủ công chạy cả 3 tab lần lượt; lịch tự động chỉ chạy tab tương ứng. Không chạy thủ công chồng lượt tự động.\n\nGiữ hồ sơ mất khỏi website, đánh dấu thời điểm phát hiện; không suy đoán ngày/người xóa. Đối chiếu toàn bộ mỗi lượt, không dùng watermark. TINH_KHO_MONTH chưa đồng bộ.`,
    height: 400, width: 580,
  }, [-900, 400]);
  const connections = {};
  const link = (from, to) => { connections[from] = { main: [[{ node: to, type: 'main', index: 0 }]] }; };
  link('Lịch mỗi giờ', 'Cấu hình dự phòng');
  const chain = ['Cấu hình dự phòng', 'Đọc ảnh chụp website', 'Đọc cấu trúc tab', 'Đọc dữ liệu dự phòng', 'Đối chiếu và lập gói ghi', 'Ghi bản dự phòng', 'Kết quả'];
  for (let i = 0; i < chain.length - 1; i++) link(chain[i], chain[i + 1]);
  // Mỗi nhánh có tên riêng để tham chiếu dữ liệu n8n không lấy nhầm tab.
  const renamed = (name) => `${name} · ${config.sheetName}`;
  const offset = definitions.indexOf(config) * 900;
  for (const node of nodes) {
    if (node.parameters.jsCode) {
      for (const source of nodes) {
        node.parameters.jsCode = node.parameters.jsCode.replaceAll(`$('${source.name}')`, `$('${renamed(source.name)}')`);
      }
    }
  }
  for (const node of nodes) {
    node.name = renamed(node.name);
    node.position[1] += offset;
    combined.nodes.push(node);
  }
  for (const [name, connection] of Object.entries(connections)) {
    combined.connections[renamed(name)] = {
      main: connection.main.map((output) => output.map((edge) => ({ ...edge, node: renamed(edge.node) }))),
    };
  }
  combined.connections['Chạy thủ công cả 3 tab'].main[0].push({ node: renamed('Cấu hình dự phòng'), type: 'main', index: 0 });
}
const output = new URL('workflow-backup-all.json', folder);
await writeFile(output, JSON.stringify(combined, null, 2) + '\n');
console.log(fileURLToPath(output));
