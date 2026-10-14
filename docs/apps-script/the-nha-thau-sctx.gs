// =====================================================================
// APPS SCRIPT CỦA BẢNG NHÂN SỰ NHÀ THẦU SCTX (docs/the-nha-thau-apps-script.md, mục 3)
// Khác bảng Đại tu ở các chỗ đánh dấu [SCTX]: 1 dòng tiêu đề, bỏ qua tab TOTAL, link web app riêng.
// =====================================================================

// [SCTX] Link /exec của bản triển khai Ứng dụng web TRÊN CHÍNH BẢNG SCTX (lấy sau lần triển khai đầu).
var WEB_APP_BASE_URL = "DAN_LINK_EXEC_VAO_DAY";
// [SCTX] Bảng SCTX chỉ có 1 dòng tiêu đề (bảng Đại tu có 2) — để 2 sẽ mất người ở dòng 2 của mỗi tab.
var HEADER_ROWS = 1;
// [SCTX] Tab không chứa danh sách nhân sự.
function isSkipTab_(name) {
  return /^(DASHBOARD|TOTAL)$/i.test(String(name).trim());
}

// =====================================================================
// 1. TỰ ĐỘNG TẠO MENU TRÊN GOOGLE SHEETS
// =====================================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ TIỆN ÍCH QR')
    .addItem('Tải mã QR dòng đang chọn', 'taiMaQRDangChon')
    .addSeparator()
    .addItem('📦 Tải TẤT CẢ mã QR (File ZIP)', 'taiTatCaMaQR')
    .addToUi();
}

// [SCTX] Chưa dán link /exec thì không cho tạo QR (QR sẽ trỏ sai chỗ).
function kiemTraLinkWebApp_() {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(WEB_APP_BASE_URL)) {
    SpreadsheetApp.getUi().alert("Chưa dán link Ứng dụng web (/exec) vào biến WEB_APP_BASE_URL ở đầu code Apps Script!");
    return false;
  }
  return true;
}

// =====================================================================
// 2. TẢI TẤT CẢ MÃ QR TRÊN TRANG TÍNH HIỆN TẠI (ĐÓNG GÓI ZIP)
// =====================================================================
function taiTatCaMaQR() {
  if (!kiemTraLinkWebApp_()) return;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var sheetName = sheet.getName();

  if (isSkipTab_(sheetName)) { // [SCTX]
    SpreadsheetApp.getUi().alert("Trang '" + sheetName + "' không chứa danh sách nhân sự cấp mã QR!");
    return;
  }

  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();
  var startRow = dataRange.getRow();

  var listQR = [];
  for (var i = 0; i < values.length; i++) {
    var actualRow = startRow + i;
    if (actualRow <= HEADER_ROWS) continue; // [SCTX] Bỏ qua dòng tiêu đề

    var row = values[i];
    var hoTen = row[2] ? String(row[2]).trim() : "";
    var namSinh = row[3] ? (row[3] instanceof Date ? String(row[3].getFullYear()) : String(row[3]).trim()) : "";
    var ngayHL = row[10] ? String(row[10]).trim() : "";
    var soThe = row[11] ? String(row[11]).trim() : "";

    if (hoTen && (ngayHL || soThe)) {
      var maDinhDanh = soThe ? soThe : (hoTen + (namSinh ? "_" + namSinh : ""));
      var fullLink = WEB_APP_BASE_URL + "?id=" + encodeURIComponent(maDinhDanh) + "&name=" + encodeURIComponent(hoTen) + (namSinh ? "&ns=" + encodeURIComponent(namSinh) : "");
      var qrUrl = "https://quickchart.io/qr?size=500&text=" + encodeURIComponent(fullLink);
      var tenFile = "QR_" + hoTen.replace(/[\s\/\\:]+/g, '_') + (namSinh ? "_" + namSinh : "") + (soThe ? "_" + soThe.replace(/[\s\/\\:]+/g, '_') : "") + ".png";

      listQR.push({
        name: tenFile,
        url: qrUrl,
        hoTen: hoTen
      });
    }
  }

  if (listQR.length === 0) {
    SpreadsheetApp.getUi().alert("Không tìm thấy dòng nào có mã QR hợp lệ trên trang tính '" + sheetName + "'!");
    return;
  }

  var htmlTemplate = HtmlService.createHtmlOutput(
    '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '  <meta charset="utf-8">' +
    '  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>' +
    '  <style>' +
    '    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 18px; margin: 0; background: #fafafa; }' +
    '    .title { font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }' +
    '    .status { font-size: 13px; color: #64748b; margin-bottom: 15px; }' +
    '    .progress-bar { width: 100%; height: 10px; background: #e2e8f0; border-radius: 6px; overflow: hidden; margin-bottom: 10px; }' +
    '    .progress-fill { height: 100%; width: 0%; background: #2563eb; transition: width 0.2s ease; }' +
    '  </style>' +
    '</head>' +
    '<body>' +
    '  <div class="title">Đang xuất mã QR trang <b>' + sheetName + '</b></div>' +
    '  <div class="progress-bar"><div id="pFill" class="progress-fill"></div></div>' +
    '  <div id="pText" class="status">Khởi tạo... (Tổng số: ' + listQR.length + ' mã)</div>' +
    '  <script>' +
    '    var items = ' + JSON.stringify(listQR) + ';' +
    '    var zip = new JSZip();' +
    '    var count = 0;' +
    '    var total = items.length;' +
    '    async function fetchAndZip() {' +
    '      for (var i = 0; i < total; i++) {' +
    '        var it = items[i];' +
    '        document.getElementById("pText").innerText = "Đang tải (" + (i + 1) + "/" + total + "): " + it.hoTen;' +
    '        document.getElementById("pFill").style.width = Math.round(((i + 1) / total) * 100) + "%";' +
    '        try {' +
    '          var res = await fetch(it.url);' +
    '          var blob = await res.blob();' +
    '          zip.file(it.name, blob);' +
    '        } catch (e) {' +
    '          console.error("Lỗi tải ảnh: " + it.name, e);' +
    '        }' +
    '      }' +
    '      document.getElementById("pText").innerText = "Đang nén file ZIP...";' +
    '      var content = await zip.generateAsync({ type: "blob" });' +
    '      var a = document.createElement("a");' +
    '      a.href = URL.createObjectURL(content);' +
    '      a.download = "Ma_QR_' + sheetName.replace(/[\s\/\\:]+/g, '_') + '.zip";' +
    '      document.body.appendChild(a);' +
    '      a.click();' +
    '      document.getElementById("pText").innerHTML = "<b style=\'color:green;\'>✓ Tải về thành công!</b>";' +
    '      setTimeout(function() { google.script.host.close(); }, 2000);' +
    '    }' +
    '    fetchAndZip();' +
    '  </script>' +
    '</body>' +
    '</html>'
  ).setWidth(400).setHeight(150);

  SpreadsheetApp.getUi().showModalDialog(htmlTemplate, "Xuất tất cả mã QR");
}

// =====================================================================
// 3. TẢI MÃ QR DÒNG ĐANG CHỌN
// =====================================================================
function taiMaQRDangChon() {
  if (!kiemTraLinkWebApp_()) return;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var row = sheet.getActiveCell().getRow();

  if (isSkipTab_(sheet.getName()) || row <= HEADER_ROWS) { // [SCTX]
    SpreadsheetApp.getUi().alert("Vui lòng click chọn một ô thuộc dòng nhân sự cần tải mã QR!");
    return;
  }

  var hoTen = sheet.getRange(row, 3).getValue();
  var rawNs = sheet.getRange(row, 4).getValue();
  var namSinh = rawNs ? (rawNs instanceof Date ? String(rawNs.getFullYear()) : String(rawNs).trim()) : "";
  var ngayHL = sheet.getRange(row, 11).getValue();
  var soThe = sheet.getRange(row, 12).getValue();

  if (!hoTen) {
    SpreadsheetApp.getUi().alert("Dòng này chưa có thông tin Họ tên (Cột C)!");
    return;
  }
  if (!ngayHL && !soThe) {
    SpreadsheetApp.getUi().alert("Dòng này chưa có Ngày huấn luyện an toàn (Cột K) hoặc Số thẻ ra vào cổng (Cột L)!");
    return;
  }

  var maDinhDanh = soThe ? String(soThe).trim() : (String(hoTen).trim() + (namSinh ? "_" + namSinh : ""));
  var fullLink = WEB_APP_BASE_URL + "?id=" + encodeURIComponent(maDinhDanh) + "&name=" + encodeURIComponent(String(hoTen).trim()) + (namSinh ? "&ns=" + encodeURIComponent(namSinh) : "");
  var qrUrl = "https://quickchart.io/qr?size=800&text=" + encodeURIComponent(fullLink);
  var tenFile = "QR_" + hoTen.toString().trim().replace(/[\s\/\\:]+/g, '_') + (namSinh ? "_" + namSinh : "") + (soThe ? "_" + soThe.toString().trim().replace(/[\s\/\\:]+/g, '_') : "") + ".png";

  var html = HtmlService.createHtmlOutput(
    '<html><head><meta charset="utf-8"></head><body style="font-family:sans-serif; text-align:center; padding-top:15px;">' +
    '<p>Đang tải mã QR của <b>' + hoTen + '</b> về máy...</p>' +
    '<script>' +
    '  fetch("' + qrUrl + '")' +
    '    .then(function(res) { return res.blob(); })' +
    '    .then(function(blob) {' +
    '      var a = document.createElement("a");' +
    '      a.href = URL.createObjectURL(blob);' +
    '      a.download = "' + tenFile + '";' +
    '      document.body.appendChild(a);' +
    '      a.click();' +
    '      setTimeout(function() { google.script.host.close(); }, 1200);' +
    '    })' +
    '    .catch(function(err) {' +
    '      document.body.innerHTML = "<p style=\'color:red;\'>Không thể tải ảnh. Vui lòng thử lại!</p>";' +
    '    });' +
    '</script></body></html>'
  ).setWidth(380).setHeight(110);

  SpreadsheetApp.getUi().showModalDialog(html, "Xuất mã QR");
}

// =====================================================================
// 4. GIAO DIỆN THẺ KỸ THUẬT SỐ KHI QUÉT MÃ QR (doGet)
// =====================================================================
function doGet(e) {
  // Sổ PCT (duyenhai1.vn) gọi kèm ?format=json|photo&token=… để đồng bộ danh bạ — xem khối 5 bên dưới.
  if (e && e.parameter && e.parameter.format) return doGetSync_(e);

  const id = (e && e.parameter && e.parameter.id) ? String(e.parameter.id).trim() : "";
  const nameParam = (e && e.parameter && e.parameter.name) ? String(e.parameter.name).trim() : "";
  const nsParam = (e && e.parameter && e.parameter.ns) ? String(e.parameter.ns).trim() : "";

  if (!id && !nameParam) {
    return HtmlService.createHtmlOutput("<div style='font-family:sans-serif;text-align:center;margin-top:60px;'><h3>Thiếu thông tin tra cứu mã QR!</h3></div>");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  let foundRow = null;
  let contractorName = "";
  let imageUrl = "";

  // BƯỚC 1: Tìm ưu tiên theo Số thẻ (ID) trước
  if (id) {
    for (let s = 0; s < sheets.length; s++) {
      const sheet = sheets[s];
      if (isSkipTab_(sheet.getName())) continue; // [SCTX]

      const dataRange = sheet.getDataRange();
      const data = dataRange.getValues();
      const startRow = dataRange.getRow();

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const cellCard = row[11] ? String(row[11]).trim() : "";
        if (cellCard.includes("Số thẻ")) continue;

        if (cellCard && cellCard.toUpperCase() === id.toUpperCase()) {
          foundRow = row;
          contractorName = sheet.getName();
          imageUrl = extractImageUrl_(sheet, startRow + i);
          break;
        }
      }
      if (foundRow) break;
    }
  }

  // BƯỚC 2: Nếu chưa tìm thấy theo Số thẻ, tìm theo Họ tên + Năm sinh
  if (!foundRow && (nameParam || id)) {
    const searchName = nameParam || id;
    for (let s = 0; s < sheets.length; s++) {
      const sheet = sheets[s];
      if (isSkipTab_(sheet.getName())) continue; // [SCTX]

      const dataRange = sheet.getDataRange();
      const data = dataRange.getValues();
      const startRow = dataRange.getRow();

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const cellName = row[2] ? String(row[2]).trim() : "";
        if (cellName.includes("Họ tên")) continue;

        let cellNs = "";
        if (row[3]) {
          cellNs = row[3] instanceof Date ? String(row[3].getFullYear()) : String(row[3]).trim();
        }

        if (cellName && cellName.toUpperCase() === searchName.toUpperCase()) {
          // Nếu có truyền năm sinh, bắt buộc phải trùng năm sinh
          if (nsParam && cellNs && cellNs !== nsParam) {
            continue;
          }
          foundRow = row;
          contractorName = sheet.getName();
          imageUrl = extractImageUrl_(sheet, startRow + i);
          break;
        }
      }
      if (foundRow) break;
    }
  }

  if (!foundRow) {
    return HtmlService.createHtmlOutput(
      `<div style='font-family:sans-serif;text-align:center;margin-top:60px;'>` +
      `<h3 style='color:#c0392b;'>Không tìm thấy thông tin nhân sự với mã: ${id || nameParam}</h3>` +
      `<p style='color:#7f8c8d;font-size:14px;'>Vui lòng kiểm tra lại Họ tên (Cột C) hoặc Số thẻ (Cột L) trên Google Sheets.</p>` +
      `</div>`
    );
  }

  const formatDate = (val) => {
    if (!val) return "---";
    if (val instanceof Date) {
      return Utilities.formatDate(val, Session.getScriptTimeZone(), "dd/MM/yyyy");
    }
    return val;
  };

  const ketQuaHL   = foundRow[1] || "---";
  const hoTen      = foundRow[2] || "---";
  const namSinh    = (foundRow[3] instanceof Date ? foundRow[3].getFullYear() : foundRow[3]) || "---";
  const sdt        = foundRow[4] || "---";
  const donVi      = foundRow[5] || contractorName;
  const goiThau    = foundRow[6] || "---";
  const chucVu     = foundRow[7] || "---";
  const viTri      = foundRow[8] || "---";
  const khuVuc     = foundRow[9] || "---";
  const ngayHL     = formatDate(foundRow[10]);
  const soThe      = foundRow[11] ? String(foundRow[11]).trim() : "Chưa cấp thẻ";
  const ngayCap    = formatDate(foundRow[12]);
  const ngayHetHan = formatDate(foundRow[13]);

  let isExpired = false;
  if (foundRow[13] instanceof Date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (foundRow[13] < today) isExpired = true;
  }

  const statusBadge = isExpired
    ? "<span style='background:#e74c3c;color:#fff;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:bold;'>THẺ HẾT HẠN</span>"
    : (foundRow[11]
        ? "<span style='background:#27ae60;color:#fff;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:bold;'>THẺ HỢP LỆ (CÒN HẠN)</span>"
        : "<span style='background:#f39c12;color:#fff;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:bold;'>ĐÃ HUẤN LUYỆN - CHỜ CẤP THẺ</span>");

  const avatarHtml = imageUrl
    ? `<img src="${imageUrl}" alt="Ảnh nhân sự" style="width:120px;height:150px;object-fit:cover;border-radius:8px;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.18);margin-bottom:12px;display:inline-block;" />`
    : `<div style="width:80px;height:80px;line-height:80px;border-radius:50%;background:#e2e8f0;color:#718096;font-size:32px;margin:0 auto 12px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.06);">👤</div>`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Thẻ Ra Vào Cổng & ATVSLĐ</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 16px; }
          .card { max-width: 440px; margin: 0 auto; background: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #e2e8f0; }
          .header { background: linear-gradient(135deg, #c0392b, #962d22); color: #fff; padding: 18px 16px; text-align: center; }
          .header-title { font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
          .sub-unit { font-size: 13px; opacity: 0.92; margin-top: 4px; font-weight: 500; }
          .body { padding: 20px 18px; text-align: center; }
          .name { font-size: 21px; font-weight: 800; color: #1e293b; margin-bottom: 4px; text-transform: uppercase; }
          .card-no { font-size: 14px; color: #64748b; margin-bottom: 14px; }
          .badge-box { margin-bottom: 18px; }
          .info-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13.5px; }
          .info-table td { padding: 8px 6px; border-bottom: 1px solid #f1f5f9; }
          .info-table td.lbl { color: #64748b; width: 44%; font-weight: 500; }
          .info-table td.val { color: #1e293b; font-weight: 600; }
          .footer { background: #f8fafc; padding: 12px; text-align: center; font-size: 11.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div class="header-title">THÔNG TIN NHÂN SỰ NHÀ THẦU LÀM VIỆC TẠI CÔNG TY NHIỆT ĐIỆN DUYÊN HẢI</div>
            <div class="sub-unit">Đơn vị: ${donVi}</div>
          </div>
          <div class="body">
            ${avatarHtml}
            <div class="name">${hoTen}</div>
            <div class="card-no">Số thẻ: <b style="color:#0f172a;">${soThe}</b></div>
            <div class="badge-box">${statusBadge}</div>
            <table class="info-table">
              <tr><td class="lbl">Năm sinh:</td><td class="val">${namSinh}</td></tr>
              <tr><td class="lbl">Vi phạm quy định Công ty (nếu có):</td><td class="val">${sdt}</td></tr>
              <tr><td class="lbl">Gói thầu, nội dung công việc:</td><td class="val">${goiThau}</td></tr>
              <tr><td class="lbl">Chức vụ:</td><td class="val">${chucVu}</td></tr>
              <tr><td class="lbl">Vị trí làm việc:</td><td class="val">${viTri}</td></tr>
              <tr><td class="lbl">Khu vực làm việc:</td><td class="val">${khuVuc}</td></tr>
              <tr><td class="lbl">Huấn luyện AT:</td><td class="val" style="color:#2563eb;">${ketQuaHL} (${ngayHL})</td></tr>
              <tr><td class="lbl">Ngày cấp thẻ:</td><td class="val">${ngayCap}</td></tr>
              <tr><td class="lbl">Ngày hết hạn:</td><td class="val" style="color:${isExpired ? '#e74c3c' : '#16a34a'};">${ngayHetHan}</td></tr>
            </table>
          </div>
          <div class="footer"> Thông tin nếu có sai lệch, anh/chị liên hệ ông Nguyễn Viết Tính SĐT:0981819543 Phòng KTAT để phối hợp</div>
        </div>
      </body>
    </html>
  `;
  return HtmlService.createHtmlOutput(html);
}

// Hàm phụ trợ trích xuất ảnh
function extractImageUrl_(sheet, actualRow) {
  try {
    const cell = sheet.getRange(actualRow, 15);
    const cellVal = cell.getValue();
    if (typeof cellVal === 'string' && (cellVal.startsWith('http://') || cellVal.startsWith('https://'))) {
      const driveMatch = cellVal.match(/[-\w]{25,}/);
      if (cellVal.includes('drive.google.com') && driveMatch) {
        return "https://lh3.googleusercontent.com/d/" + driveMatch[0];
      }
      return cellVal;
    } else if (cellVal && typeof cellVal.getContentUrl === 'function') {
      var directUrl = cellVal.getContentUrl();
      if (directUrl) {
        try {
          var imgRes = UrlFetchApp.fetch(directUrl, { muteHttpExceptions: true });
          if (imgRes.getResponseCode() === 200) {
            var blob = imgRes.getBlob();
            return "data:" + (blob.getContentType() || "image/jpeg") + ";base64," + Utilities.base64Encode(blob.getBytes());
          }
          return directUrl;
        } catch (fetchErr) {
          return directUrl;
        }
      }
    }
  } catch (imgErr) {}
  return "";
}

// =====================================================================
// 5. ĐỒNG BỘ SỔ PCT (duyenhai1.vn)
// Chỉ trả dữ liệu khi có đúng mã khoá SYNC_TOKEN (Cài đặt dự án → Thuộc tính tập lệnh).
// =====================================================================
function doGetSync_(e) {
  var token = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
  if (!token || e.parameter.token !== token) return syncJson_({ ok: false, error: 'token' });
  try {
    if (e.parameter.format === 'json') return syncJson_({ ok: true, rows: syncListRows_() });
    if (e.parameter.format === 'photo') return syncJson_(syncPhotoOf_(String(e.parameter.id || '').trim()));
    return syncJson_({ ok: false, error: 'format' });
  } catch (err) {
    return syncJson_({ ok: false, error: String((err && err.message) || err) });
  }
}

function syncJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function syncDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v ? String(v) : '';
}

// Dấu vết ảnh (cột O): link thì lấy link; ảnh chèn trong ô thì lấy content URL.
function syncPhotoRef_(v) {
  if (typeof v === 'string' && /^https?:\/\//.test(v)) return v;
  if (v && typeof v.getContentUrl === 'function') { try { return v.getContentUrl() || 'cell'; } catch (x) { return 'cell'; } }
  return '';
}

// Cột: B KQ huấn luyện, C họ tên, D năm sinh, E vi phạm/SĐT, F đơn vị, G gói thầu, H chức vụ,
// I vị trí, J khu vực, K ngày huấn luyện, L số thẻ, M ngày cấp, N ngày hết hạn, O ảnh.
// Cùng điều kiện với mã QR: có HỌ TÊN (cột C) VÀ (có NGÀY HUẤN LUYỆN cột K HOẶC có SỐ THẺ cột L).
function syncListRows_() {
  var out = [];
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sheet) {
    if (isSkipTab_(sheet.getName())) return; // [SCTX]
    var range = sheet.getDataRange(), values = range.getValues(), startRow = range.getRow();
    for (var i = 0; i < values.length; i++) {
      if (startRow + i <= HEADER_ROWS) continue; // [SCTX] dòng tiêu đề
      var r = values[i];
      var hoTen = r[2] ? String(r[2]).trim() : '';
      var ngayHL = r[10] ? String(r[10]).trim() : '';
      var soThe = r[11] ? String(r[11]).trim() : '';
      if (!hoTen || hoTen.indexOf('Họ tên') >= 0 || soThe.indexOf('Số thẻ') >= 0) continue;
      if (!ngayHL && !soThe) continue;
      out.push({
        sheet: sheet.getName(), ketQuaHL: r[1], hoTen: hoTen,
        namSinh: r[3] instanceof Date ? r[3].getFullYear() : r[3], sdt: r[4], donVi: r[5], goiThau: r[6],
        chucVu: r[7], viTri: r[8], khuVuc: r[9], ngayHL: syncDate_(r[10]), soThe: soThe,
        ngayCap: syncDate_(r[12]), ngayHetHan: syncDate_(r[13]), photo: syncPhotoRef_(r[14])
      });
    }
  });
  return out;
}

// Ảnh của MỘT người → base64 (sổ tự nén rồi lưu). `id` là số thẻ (cột L), hoặc HỌ TÊN (cột C) với người chưa có thẻ.
function syncPhotoOf_(id) {
  var key = id.toUpperCase();
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var s = 0; s < sheets.length; s++) {
    if (isSkipTab_(sheets[s].getName())) continue; // [SCTX]
    var range = sheets[s].getDataRange(), values = range.getValues();
    for (var i = 0; i < values.length; i++) {
      var card = values[i][11] ? String(values[i][11]).trim() : '';
      var name = values[i][2] ? String(values[i][2]).trim() : '';
      if (card ? card.toUpperCase() !== key : name.toUpperCase() !== key) continue;
      var v = sheets[s].getRange(range.getRow() + i, 15).getValue(), blob = null;
      if (typeof v === 'string' && /^https?:\/\//.test(v)) {
        var driveId = v.indexOf('drive.google.com') >= 0 ? (v.match(/[-\w]{25,}/) || [])[0] : null;
        if (driveId) { try { blob = DriveApp.getFileById(driveId).getBlob(); } catch (x) { v = 'https://lh3.googleusercontent.com/d/' + driveId; } }
        if (!blob) { var res = UrlFetchApp.fetch(v, { muteHttpExceptions: true }); if (res.getResponseCode() === 200) blob = res.getBlob(); }
      } else if (v && typeof v.getContentUrl === 'function') {
        var res2 = UrlFetchApp.fetch(v.getContentUrl(), { muteHttpExceptions: true });
        if (res2.getResponseCode() === 200) blob = res2.getBlob();
      }
      if (!blob) return { ok: false, error: 'Không có ảnh hoặc không tải được ảnh' };
      return { ok: true, contentType: blob.getContentType() || 'image/jpeg', base64: Utilities.base64Encode(blob.getBytes()) };
    }
  }
  return { ok: false, error: 'Không tìm thấy số thẻ hoặc họ tên ' + id };
}
