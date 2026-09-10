import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const folder = new URL('../docs/n8n-material-sync/', import.meta.url);
const plan = await readFile(new URL('backup-plan.js', folder), 'utf8') + '\nreturn planBackup($, $json);';
const spreadsheetId = '1wamJN787FowPLI3zU-383CME5R-EkI72EP5qLrhj5J4';
const definitions = [
  { scope: 'materials', sheetName: 'VH1_VTDONGBO', keyIndex: 28, keyColumn: 'AC', sourceColumns: 31, lastColumn: 'AH', cron: '17 12 * * * *' },
  { scope: 'chemicals', sheetName: 'VH1_HOACHAT_DONGBO', keyIndex: 13, keyColumn: 'N', sourceColumns: 16, lastColumn: 'S', cron: '29 16 * * * *' },
  { scope: 'receipts', sheetName: 'NHAP_HOA_CHAT', keyIndex: 7, keyColumn: 'H', sourceColumns: 10, lastColumn: 'M', cron: '47 19 * * * *' },
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
    const versions = { manualTrigger: 1, scheduleTrigger: 1.2, code: 2, httpRequest: 4.4, if: 2.2, stickyNote: 1 };
    nodes.push({ id: `backup-${config.scope}-${nodes.length}`, name, type: `n8n-nodes-base.${type}`,
      typeVersion: versions[type], parameters, position, ...extra });
  };
  const googleRequest = (name, parameters, position) => add(name, 'httpRequest', {
    authentication: 'predefinedCredentialType', nodeCredentialType: 'googleSheetsOAuth2Api',
    options: { timeout: 60000 }, ...parameters,
  }, position, { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 });

  add('Lịch mỗi giờ', 'scheduleTrigger', { rule: { interval: [{ field: 'cronExpression', expression: config.cron }] } }, [-920, 180]);
  add('Cấu hình dự phòng', 'code', { jsCode: `const config = ${JSON.stringify({ ...config, spreadsheetId }, null, 2)};
const state = $getWorkflowStaticData('global');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
return [{ json: { ...config,
  updatedAfter: state[config.scope + 'BackupWatermark'] ?? '',
  reconcile: state[config.scope + 'BackupReconciledOn'] !== today,
  today,
} }];` }, [-680, 80]);
  add('Đọc thay đổi website', 'httpRequest', {
    url: 'https://duyenhai1.vn/api/integrations/n8n/material-backup',
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendQuery: true, queryParameters: { parameters: [
      { name: 'scope', value: '={{ $json.scope }}' },
      { name: 'mode', value: 'incremental' },
      { name: 'updatedAfter', value: '={{ $json.updatedAfter }}' },
      { name: 'reconcile', value: '={{ String($json.reconcile) }}' },
    ] },
    options: { timeout: 60000, response: { response: { responseFormat: 'json' } } },
  }, [-440, 80], { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 });
  add('Kiểm tra phản hồi', 'code', { jsCode: `const response = $json;
const meta = response.meta;
if (response.error || meta?.contract !== 'material-backup-v2' || meta.scope !== '${config.scope}'
    || meta.complete !== true || !Array.isArray(response.data) || meta.rowCount !== response.data.length
    || !Array.isArray(meta.changedEntityIds) || !Array.isArray(meta.deletedEntityIds)
    || !Number.isFinite(Date.parse(meta.watermark))) {
  throw new Error('Phản hồi đồng bộ tăng dần không hợp lệ; không cập nhật watermark');
}
return [{ json: { ...response, hasWork: response.data.length > 0
  || meta.deletedEntityIds.length > 0 || meta.inventory !== null } }];` }, [-200, 80]);
  add('Có thay đổi hoặc cần đối chiếu?', 'if', { conditions: { options: {
    caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2,
  }, conditions: [{ id: `backup-${config.scope}-has-work`,
    leftValue: '={{ $json.hasWork }}',
    rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true },
  }], combinator: 'and' }, options: {} }, [40, 80]);
  googleRequest('Đọc cấu trúc tab', {
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId%2Ctitle%2CgridProperties)`,
  }, [280, 0]);
  googleRequest('Đọc khóa dự phòng', {
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${config.sheetName}!${config.keyColumn}2:${config.lastColumn}?valueRenderOption=UNFORMATTED_VALUE`,
  }, [520, 0]);
  add('Đối chiếu và lập gói ghi', 'code', { jsCode: plan }, [760, 0]);
  googleRequest('Ghi bản dự phòng', {
    method: 'POST', url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ requests: $json.requests }) }}',
    options: { timeout: 60000, batching: { batch: { batchSize: 1, batchInterval: 1200 } } },
  }, [1000, 0]);
  const saveState = `const response = $('Đọc thay đổi website').first().json;
if (!response.meta?.watermark) throw new Error('Thiếu watermark từ website');
const state = $getWorkflowStaticData('global');
state[response.meta.scope + 'BackupWatermark'] = response.meta.watermark;
if (response.meta.inventory) state[response.meta.scope + 'BackupReconciledOn'] = $('Cấu hình dự phòng').first().json.today;`;
  add('Kết quả', 'code', { jsCode: `${saveState}
const batches = $('Đối chiếu và lập gói ghi').all();
const first = batches[0].json;
return [{ json: { success: true, targetSheet: first.targetSheet, syncedRows: first.sourceRows,
  missingRows: first.missingRows, reusedRows: first.reusedRows, batches: batches.length,
  watermark: response.meta.watermark, reconciled: Boolean(response.meta.inventory) } }];` }, [1240, 0]);
  add('Lưu mốc khi không đổi', 'code', { jsCode: `${saveState}
return [{ json: { success: true, targetSheet: $('Cấu hình dự phòng').first().json.sheetName,
  syncedRows: 0, missingRows: 0, watermark: response.meta.watermark, reconciled: false } }];` }, [280, 180]);
  add('Hướng dẫn', 'stickyNote', {
    content: `## Dự phòng ${config.sheetName}\nChạy mỗi giờ theo cron \`${config.cron}\`, múi giờ Asia/Ho_Chi_Minh.\n\nMỗi giờ chỉ lấy dòng mới/sửa/xóa từ watermark. Nếu không đổi, không đọc hoặc ghi Google Sheet. Mỗi ngày đối chiếu danh sách khóa một lần để bắt hồ sơ tự dọn.\n\n1. Chọn Header Auth cho node đọc website.\n2. Chọn Google Sheets OAuth2 cho 3 node Google của nhánh.\n3. Chạy thủ công cả 3 tab, kiểm tra rồi Publish.\n\nTINH_KHO_MONTH chưa đồng bộ.`,
    height: 400, width: 580,
  }, [-900, 400]);
  const connections = {};
  const link = (from, to) => { connections[from] = { main: [[{ node: to, type: 'main', index: 0 }]] }; };
  link('Lịch mỗi giờ', 'Cấu hình dự phòng');
  link('Cấu hình dự phòng', 'Đọc thay đổi website');
  link('Đọc thay đổi website', 'Kiểm tra phản hồi');
  link('Kiểm tra phản hồi', 'Có thay đổi hoặc cần đối chiếu?');
  connections['Có thay đổi hoặc cần đối chiếu?'] = { main: [
    [{ node: 'Đọc cấu trúc tab', type: 'main', index: 0 }],
    [{ node: 'Lưu mốc khi không đổi', type: 'main', index: 0 }],
  ] };
  const chain = ['Đọc cấu trúc tab', 'Đọc khóa dự phòng', 'Đối chiếu và lập gói ghi', 'Ghi bản dự phòng', 'Kết quả'];
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
