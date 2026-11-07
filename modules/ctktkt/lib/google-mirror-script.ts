// Served only to an authenticated administrator, with a server-held integration token.
export const GOOGLE_MIRROR_SCRIPT = String.raw`
// Run in the EXISTING Apps Script project; preserve its one hourly trigger.
function connectPxSource() {
  if (CONFIG.base !== 'https://duyenhai1.vn') throw new Error('Chỉ chuyển nguồn sang web PX chính thức.');
  if (!CONFIG.token || CONFIG.token.length < 32) throw new Error('Chưa có mã kết nối web PX.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Đợi lần đồng bộ hiện tại hoàn tất.');
  try {
    const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncNow');
    if (triggers.length !== 1) throw new Error('Cần đúng một lịch syncNow trong dự án hiện có; chưa chuyển nguồn.');
    const response = UrlFetchApp.fetch(CONFIG.base + '/api/ctktkt/google-mirror/snapshot', {
      headers: {Authorization: 'Bearer ' + CONFIG.token}, muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) throw new Error('Web PX chưa sẵn sàng. HTTP ' + response.getResponseCode());
    const snapshot = JSON.parse(response.getContentText());
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(snapshot.period) || !Array.isArray(snapshot.files)
      || snapshot.files.length !== CONFIG.files.length || new Set(snapshot.files.map(f => f.key)).size !== CONFIG.files.length
      || !CONFIG.files.every(target => snapshot.files.some(f => f.key === target.key && f.id === target.id))) {
      throw new Error('Danh sách Sheet web PX không khớp; chưa chuyển nguồn.');
    }
    const props = PropertiesService.getScriptProperties();
    props.setProperty('token', CONFIG.token);
    props.deleteProperty('snapshot_etag');
    console.log('Đã chuyển kết nối sang web PX. Giữ nguyên Sheet, quyền truy cập và lịch mỗi giờ. Chưa ghi dữ liệu lên Sheet; chạy syncNow sau khi đối chiếu đủ dữ liệu.');
  } finally { lock.releaseLock(); }
}
function install() {
  if (CONFIG.token.length < 32) throw new Error('Chưa cấu hình mã kết nối.');
  PropertiesService.getScriptProperties().setProperty('token', CONFIG.token);
  PropertiesService.getScriptProperties().deleteProperty('snapshot_etag');
  syncNow(); // Authorize and complete a real first sync before installing the schedule.
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncNow').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncNow').timeBased().everyHours(1).create();
  console.log('Đã đồng bộ và cài lịch mỗi giờ. Nhập/sửa số liệu trên web.');
}
function syncNow() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Đang có lần đồng bộ khác; chờ hoàn tất rồi chạy lại.');
  try {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('token');
    if (!token) throw new Error('Chạy install trước.');
    const requestHeaders = {Authorization: 'Bearer ' + token};
    const previousEtag = props.getProperty('snapshot_etag');
    if (previousEtag) requestHeaders['If-None-Match'] = previousEtag;
    const response = UrlFetchApp.fetch(CONFIG.base + '/api/ctktkt/google-mirror/snapshot', {
      headers: requestHeaders, muteHttpExceptions: true
    });
    if (response.getResponseCode() === 304) {
      console.log('Dữ liệu web không đổi; không đọc lại báo cáo và không ghi lại Google Sheets.');
      return;
    }
    if (response.getResponseCode() !== 200) throw new Error('Chưa lấy được dữ liệu web. Giữ nguyên Google Sheets. HTTP ' + response.getResponseCode());
    const snapshot = JSON.parse(response.getContentText());
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(snapshot.period) || snapshot.files.length !== CONFIG.files.length) throw new Error('Bản đồng bộ không hợp lệ.');
    const failures = [];
    snapshot.files.forEach(file => {
      try {
        const target = CONFIG.files.find(f => f.key === file.key && f.id === file.id);
        if (!target) throw new Error('File ngoài phạm vi được phép.');
        const book = SpreadsheetApp.openById(target.id); // Also declares the Sheets authorization scope.
        const formulaLocale = typeof book.getSpreadsheetLocale === 'function' ? book.getSpreadsheetLocale() : 'vi_VN';
        const lastPeriod = props.getProperty('period_' + target.key) || CONFIG.initialPeriod;
        if (lastPeriod !== snapshot.period) {
          // Keep a private full copy before changing the active reporting month.
          const original = DriveApp.getFileById(target.id);
          const parents = original.getParents();
          const name = original.getName() + ' - Lưu ' + lastPeriod;
          if (parents.hasNext()) original.makeCopy(name, parents.next()); else original.makeCopy(name);
          props.setProperty('period_' + target.key, snapshot.period);
        }
        if (props.getProperty('hash_' + target.key) !== file.hash) {
          const requests = [];
          file.tabs.forEach(tab => {
            let sheet = book.getSheetByName(tab.name);
            if (!sheet) {
              const source = book.getSheetByName(tab.template || '') || book.getSheets()[0];
              sheet = source.copyTo(book).setName(tab.name);
            }
            const row = (tab.startRow || 1) - 1, col = (tab.startColumn || 1) - 1;
            const height = Math.max(tab.clearRows || tab.rows.length, tab.rows.length);
            const width = Math.max(tab.clearColumns || 1, ...tab.rows.map(r => r.length));
            if (sheet.getMaxRows() < row + height) sheet.insertRowsAfter(sheet.getMaxRows(), row + height - sheet.getMaxRows());
            if (sheet.getMaxColumns() < col + width) sheet.insertColumnsAfter(sheet.getMaxColumns(), col + width - sheet.getMaxColumns());
            if(file.key==='ppa' && (tab.name==='S1'||tab.name==='S2')) {
              requests.push({unmergeCells:{range:{sheetId:sheet.getSheetId(),startRowIndex:3,endRowIndex:200,startColumnIndex:0,endColumnIndex:2}}});
            }
            requests.push({updateCells: {
              range: {sheetId:sheet.getSheetId(),startRowIndex:row,endRowIndex:row+height,startColumnIndex:col,endColumnIndex:col+width},
              rows:tab.rows.map(r => ({values:Array.from({length:width}, (_, i) => {
                const v=r[i];
                if(v===null || v===undefined) return {};
                // User text remains literal even when it begins with =, +, - or @.
                return {userEnteredValue:typeof v==='object'?{formulaValue:mirrorFormula(v.formula, formulaLocale)}:typeof v==='number'?{numberValue:v}:typeof v==='boolean'?{boolValue:v}:{stringValue:String(v)}};
              })})), fields:'userEnteredValue'
            }});
            if(file.key==='ppa' && (tab.name==='S1'||tab.name==='S2')) {
              const days=(tab.rows.length-3)/4;
              if(days>1) for(let block=0;block<4;block++) for(let c=0;c<2;c++) requests.push({mergeCells:{range:{sheetId:sheet.getSheetId(),startRowIndex:3+block*days,endRowIndex:3+(block+1)*days,startColumnIndex:c,endColumnIndex:c+1},mergeType:'MERGE_ALL'}});
            }
          });
          SpreadsheetApp.flush();
          // One atomic cell update per file: a failed request cannot partially rewrite its cells.
          const write = UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/'+target.id+':batchUpdate', {
            method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},payload:JSON.stringify({requests:requests}),muteHttpExceptions:true
          });
          if (write.getResponseCode() !== 200) throw new Error('Google chưa xác nhận ghi ' + target.key + '. HTTP ' + write.getResponseCode());
          const visibleNames = new Set(file.tabs.map(t => t.name));
          const first = book.getSheetByName(file.tabs[0].name);
          if(first){first.showSheet();book.setActiveSheet(first);}
          book.getSheets().forEach(s => {if(visibleNames.has(s.getName()))s.showSheet();else if(!s.isSheetHidden())s.hideSheet();});
          book.rename(file.label + ' – ' + snapshot.period);
          props.setProperty('hash_' + target.key, file.hash);
          props.setProperty('period_' + target.key, snapshot.period);
        }
        const status = UrlFetchApp.fetch(CONFIG.base+'/api/ctktkt/google-mirror/status', {
          method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token},
          payload:JSON.stringify({key:target.key,period:snapshot.period,syncedAt:snapshot.generatedAt,hash:file.hash}),muteHttpExceptions:true
        });
        if(status.getResponseCode()!==200) throw new Error('Đã cập nhật file nhưng chưa báo được trạng thái về web: '+target.key);
      } catch (e) { failures.push(file.key+': '+e.message); }
    });
    if(failures.length) throw new Error(failures.join('\n'));
    if (typeof response.getAllHeaders === 'function') {
      const headers = response.getAllHeaders();
      const key = Object.keys(headers).find(k => k.toLowerCase() === 'etag');
      if (key) props.setProperty('snapshot_etag', String(headers[key]));
    }
  } finally { lock.releaseLock(); }
}
function stopSync() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncNow').forEach(t => ScriptApp.deleteTrigger(t));
}
// XLSX formulas use English separators. Sheets formulaValue is locale-sensitive.
// Only translate syntax; quoted strings/sheet names and KPI logic stay intact.
function mirrorFormula(formula, locale) {
  const source = formula.replace(/^=/, '');
  if (locale && locale !== 'vi_VN') return '=' + source;
  let result = '=', quote = '', arrayDepth = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      result += ch;
      if (ch === quote) {
        if (source[i + 1] === quote) result += source[++i];
        else quote = '';
      }
    } else if (ch === '"' || ch === "'") { quote = ch; result += ch; }
    else if (ch === '{') { arrayDepth++; result += ch; }
    else if (ch === '}') { arrayDepth--; result += ch; }
    else if (ch === ',') result += arrayDepth ? '\\' : ';';
    else if (ch === '.' && /\d/.test(source[i + 1] || '') && !/[A-Za-z_$]/.test(source[i - 1] || '')) result += ',';
    else result += ch;
  }
  return result;
}
`;
