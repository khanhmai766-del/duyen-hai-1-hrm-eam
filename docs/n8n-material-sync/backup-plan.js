function planBackup($, $json) {
  // Mã nhúng vào Code node của ba workflow dự phòng. Không gọi mạng tại đây.
  const config = $('Cấu hình dự phòng').first().json;
  const response = $('Đọc ảnh chụp website').first().json;
  const metadata = $('Đọc cấu trúc tab').first().json;
  const meta = response.meta;
  if (response.error || meta?.contract !== 'material-backup-v1' || meta.scope !== config.scope
      || meta.complete !== true || !Array.isArray(response.data) || meta.rowCount !== response.data.length
      || !Array.isArray(meta.entityIds) || !Number.isFinite(Date.parse(meta.snapshotAt))) {
    throw new Error('Ảnh chụp website không đầy đủ hoặc sai phạm vi; dừng ghi Sheet');
  }
  const properties = metadata.sheets?.find((sheet) => sheet.properties?.title === config.sheetName)?.properties;
  if (!Number.isInteger(properties?.sheetId)) throw new Error(`Không tìm thấy tab ${config.sheetName}`);
  if (!Array.isArray($json.values)) throw new Error('Không đọc được tiêu đề và dữ liệu tab dự phòng');
  const [, headers, ...existing] = $json.values;
  const keyIndex = config.keyIndex;
  const syncedIndex = config.sourceColumns;
  const statusIndex = syncedIndex + 1;
  const missingIndex = statusIndex + 1;
  const totalColumns = missingIndex + 1;
  for (const [offset, header] of ['SYNC_KEY', 'SOURCE_UPDATED_AT', 'WORKFLOW_STATUS', 'SYNCED_AT'].entries()) {
    if (headers?.[keyIndex + offset] !== header) throw new Error(`Sai bố cục cột ${header} trên ${config.sheetName}`);
  }
  for (const [index, expected] of [[statusIndex, 'Tình trạng trên website'], [missingIndex, 'Phát hiện không còn lúc']]) {
    if (headers[index] && headers[index] !== expected) throw new Error('Cột bổ sung đã có nội dung khác; dừng để tránh ghi đè');
  }
  const entities = new Set(meta.entityIds);
  if (entities.size !== meta.entityIds.length || [...entities].some((id) => typeof id !== 'string' || !id)) {
    throw new Error('Danh sách ID nguồn không hợp lệ');
  }
  const currentByKey = new Map();
  const currentByEntity = new Map();
  for (const row of response.data) {
    if (typeof row.syncKey !== 'string' || !row.syncKey || currentByKey.has(row.syncKey)
        || !entities.has(row.entityId) || !Array.isArray(row.values) || row.values.length !== config.sourceColumns
        || row.values[keyIndex] !== row.syncKey || !Number.isFinite(Date.parse(row.sourceUpdatedAt))
        || row.values.some((value) => value !== null && typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value)))) {
      throw new Error('Khóa hoặc nội dung nguồn không hợp lệ; dừng ghi Sheet');
    }
    currentByKey.set(row.syncKey, row);
    currentByEntity.set(row.entityId, [...(currentByEntity.get(row.entityId) ?? []), row]);
  }
  const entityOf = (key) => config.scope === 'receipts' ? key.slice('receipt:'.length) : key.split(':')[0];
  const rowByKey = new Map();
  const oldByEntity = new Map();
  for (let index = 0; index < existing.length; index++) {
    const values = existing[index];
    const key = String(values[keyIndex] ?? '').trim();
    if (!key) {
      if (values.some((value) => value !== '' && value != null)) {
        throw new Error(`Dòng ${index + 3} có dữ liệu nhưng thiếu SYNC_KEY; cần kiểm tra trước khi đồng bộ`);
      }
      continue;
    }
    if (rowByKey.has(key) || (config.scope === 'receipts' ? !/^receipt:[^:]+$/.test(key) : !/^[^:]+:[^:]+$/.test(key))) {
      throw new Error(`Khóa trùng hoặc không hợp lệ tại dòng ${index + 3}`);
    }
    const record = { key, values, rowIndex: index + 2 };
    rowByKey.set(key, record);
    const entityId = entityOf(key);
    oldByEntity.set(entityId, [...(oldByEntity.get(entityId) ?? []), record]);
  }
  // Sửa phiếu hiện có có thể tạo lại item ID. Trường hợp một dòng → một dòng
  // khớp bằng ID phiếu, giữ vị trí trên Sheet thay vì sinh thêm dòng trùng.
  const reusedKeys = new Set();
  const targetByKey = new Map();
  let nextRowIndex = existing.length + 2;
  for (const row of response.data) {
    let target = rowByKey.get(row.syncKey);
    if (!target && config.scope !== 'receipts') {
      const previous = oldByEntity.get(row.entityId) ?? [];
      if (currentByEntity.get(row.entityId).length === 1 && previous.length === 1 && !currentByKey.has(previous[0].key)) {
        target = previous[0];
        reusedKeys.add(target.key);
      }
    }
    targetByKey.set(row.syncKey, target?.rowIndex ?? nextRowIndex++);
  }
  const sheetId = properties.sheetId;
  const requests = [];
  const requiredRows = Math.max(3, nextRowIndex);
  if (properties.gridProperties.rowCount < requiredRows || properties.gridProperties.columnCount < totalColumns) {
    requests.push({ updateSheetProperties: {
      properties: { sheetId, gridProperties: {
        rowCount: Math.max(properties.gridProperties.rowCount, requiredRows),
        columnCount: Math.max(properties.gridProperties.columnCount, totalColumns),
      } }, fields: 'gridProperties.rowCount,gridProperties.columnCount',
    } });
  }
  const cell = (value) => ({ userEnteredValue: value == null || value === '' ? {}
    : typeof value === 'number' ? { numberValue: value } : { stringValue: String(value) } });
  const update = (rowIndex, columnIndex, values) => ({ updateCells: {
    start: { sheetId, rowIndex, columnIndex }, rows: [{ values: values.map(cell) }], fields: 'userEnteredValue',
  } });
  requests.push(update(1, statusIndex, ['Tình trạng trên website', 'Phát hiện không còn lúc']));
  requests.push({ repeatCell: {
    range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: statusIndex, endColumnIndex: totalColumns },
    cell: { userEnteredFormat: { textFormat: { bold: true }, wrapStrategy: 'WRAP' } },
    fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.wrapStrategy',
  } });
  requests.push({ updateDimensionProperties: {
    range: { sheetId, dimension: 'COLUMNS', startIndex: statusIndex, endIndex: totalColumns },
    properties: { pixelSize: 220 }, fields: 'pixelSize',
  } });
  const checkedAt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(meta.snapshotAt)).replace(',', '');
  const paintStatus = (rowIndex, missing) => ({ repeatCell: {
    range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: statusIndex, endColumnIndex: totalColumns },
    cell: { userEnteredFormat: {
      backgroundColor: missing ? { red: 0.92, green: 0.92, blue: 0.92 } : { red: 0.89, green: 0.96, blue: 0.90 },
      wrapStrategy: 'WRAP',
    } }, fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.wrapStrategy',
  } });
  for (const row of response.data) {
    const rowIndex = targetByKey.get(row.syncKey);
    requests.push(update(rowIndex, 0, [...row.values, checkedAt, 'Đang lưu trên website', null]));
    requests.push(paintStatus(rowIndex, false));
  }
  let missingRows = 0;
  for (const old of rowByKey.values()) {
    if (currentByKey.has(old.key) || reusedKeys.has(old.key)) continue;
    missingRows++;
    const status = entities.has(entityOf(old.key))
      ? 'Dòng vật tư đã thay đổi hoặc ngoài phạm vi'
      : 'Không còn trên website';
    // Không gọi đây là ngày xóa: có thể là xóa thủ công hoặc dọn theo kỳ.
    const firstMissingAt = old.values[missingIndex] || checkedAt;
    requests.push(update(old.rowIndex, statusIndex, [status, firstMissingAt]));
    requests.push(paintStatus(old.rowIndex, true));
  }
  if (config.scope === 'receipts') {
    requests.push({ repeatCell: {
      range: { sheetId, startRowIndex: 2, endRowIndex: requiredRows, startColumnIndex: 3, endColumnIndex: 6 },
      cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0.####' } } },
      fields: 'userEnteredFormat.numberFormat',
    } });
  }
  // Chia gói nhỏ; mỗi gói chỉ ghi ô/thuộc tính tuyệt đối nên retry không xóa nhầm dòng.
  const batches = [];
  let pending = [], size = 0;
  for (const request of requests) {
    const length = JSON.stringify(request).length;
    if (length > 400_000) throw new Error('Một dòng quá lớn để ghi Sheet an toàn');
    if (pending.length && (pending.length >= 200 || size + length > 400_000)) {
      batches.push(pending); pending = []; size = 0;
    }
    pending.push(request); size += length;
  }
  if (pending.length) batches.push(pending);
  return batches.map((batch, index) => ({ json: {
    requests: batch, batch: index + 1, batchCount: batches.length,
    targetSheet: config.sheetName, sourceRows: response.data.length, missingRows, reusedRows: reusedKeys.size,
  } }));
}
