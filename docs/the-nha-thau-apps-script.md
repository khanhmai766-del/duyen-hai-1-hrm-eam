# Đồng bộ thẻ ra vào cổng (Google Sheets → sổ PCT)

Sổ PCT (duyenhai1.vn) lấy danh bạ nhân sự nhà thầu từ bảng Google Sheets quản lý **thẻ ra vào cổng &
ATVSLĐ**: họ tên, đơn vị, số thẻ, hạn thẻ, huấn luyện và ảnh. Khi quét QR trên thẻ trong hộp
"Cho phép / mở lần làm việc", sổ tra dữ liệu đã đồng bộ — **không gọi Google mỗi lần quét**.

- Nút: tab **Đơn vị nhà thầu → Đồng bộ từ Google Sheets** (người có quyền cấp PCT).
- Code phía sổ: `lib/server/work-permit-people-sync.ts`, API `app/api/work-permits/people/sync`.
- Ảnh được nén còn tối đa 360×480 WebP (~20–50 KB) và lưu S3 tại `work-permit-people/photos/<số thẻ>.webp`.
- Số thẻ trên sheet (cột L) là khoá: trùng `WorkPermitPerson.code`. QR trên thẻ là link web app
  `…/exec?id=<số thẻ>` — sổ đọc tham số `id`, **không phải in lại thẻ**.
- **Khoá gài đơn vị: tên TAB = Mã đơn vị trên sổ** (so không phân biệt hoa thường/dấu). Nhân sự của tab
  `VATCO` vào đúng đơn vị có Mã đơn vị `VATCO`. Tab không khớp mã nào (Dashboard, MẪU, nhà thầu chưa đặt
  mã) bị **bỏ qua cả tab**, không tự tạo đơn vị; hộp đồng bộ liệt kê tab bị bỏ qua. Cột F "Đơn vị" không
  dùng để gán đơn vị. Một số thẻ nằm ở hai tab → giữ tab gặp trước và báo để sửa sheet.
- Sheet là nguồn chuẩn cho họ tên / đơn vị / thông tin thẻ. Vai trò CHTT và "đang hoạt động" vẫn do sổ quản.

## 1. Thêm vào Apps Script của bảng thẻ

Mở bảng → **Tiện ích mở rộng → Apps Script**.

**a)** Thêm đúng một dòng vào **đầu** hàm `doGet(e)` đang có:

```js
function doGet(e) {
  if (e && e.parameter && e.parameter.format) return doGetSync_(e);   // ← thêm dòng này
  const id = ...                                                      // (code cũ giữ nguyên)
```

**b)** Dán nguyên khối sau vào cuối file:

```js
// ================= ĐỒNG BỘ SỔ PCT (duyenhai1.vn) =================
// Chỉ trả dữ liệu khi có đúng mã khoá SYNC_TOKEN (Cài đặt dự án → Thuộc tính tập lệnh).
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

// Dấu vết ảnh (cột O): link thì lấy link; ảnh chèn trong ô thì lấy content URL. Sổ chỉ tải lại ảnh khi dấu vết đổi.
function syncPhotoRef_(v) {
  if (typeof v === 'string' && /^https?:\/\//.test(v)) return v;
  if (v && typeof v.getContentUrl === 'function') { try { return v.getContentUrl() || 'cell'; } catch (x) { return 'cell'; } }
  return '';
}

// Cột như doGet: B KQ huấn luyện, C họ tên, D năm sinh, E SĐT, F đơn vị, G gói thầu, H chức vụ,
// I vị trí, J khu vực, K ngày huấn luyện, L số thẻ, M ngày cấp, N ngày hết hạn, O ảnh.
function syncListRows_() {
  var out = [];
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sheet) {
    sheet.getDataRange().getValues().forEach(function (r) {
      var soThe = r[11] ? String(r[11]).trim() : '';
      if (!soThe || soThe.indexOf('Số thẻ') >= 0) return;
      out.push({
        sheet: sheet.getName(), ketQuaHL: r[1], hoTen: r[2],
        namSinh: r[3] instanceof Date ? r[3].getFullYear() : r[3], sdt: r[4], donVi: r[5], goiThau: r[6],
        chucVu: r[7], viTri: r[8], khuVuc: r[9], ngayHL: syncDate_(r[10]), soThe: soThe,
        ngayCap: syncDate_(r[12]), ngayHetHan: syncDate_(r[13]), photo: syncPhotoRef_(r[14])
      });
    });
  });
  return out;
}

// Ảnh của MỘT số thẻ → base64 (sổ tự nén rồi lưu S3).
function syncPhotoOf_(id) {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var range = sheets[s].getDataRange(), values = range.getValues();
    for (var i = 0; i < values.length; i++) {
      var card = values[i][11] ? String(values[i][11]).trim() : '';
      if (!card || card.toUpperCase() !== id.toUpperCase()) continue;
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
  return { ok: false, error: 'Không tìm thấy số thẻ ' + id };
}
```

**c)** **Cài đặt dự án (bánh răng) → Thuộc tính tập lệnh → Thêm**: `SYNC_TOKEN` = một chuỗi bí mật dài
(ví dụ 32 ký tự ngẫu nhiên). Chuỗi này cũng điền vào server ở bước 2.

**d)** **Triển khai → Quản lý các lần triển khai → ✏ Sửa → Phiên bản: Phiên bản mới → Triển khai.**
Giữ nguyên *Thực thi dưới dạng: Tôi*, *Người có quyền truy cập: Bất kỳ ai*. Làm như vậy thì **link
`/exec` không đổi**, các thẻ QR đã in vẫn dùng được. Lần đầu có thể phải cấp thêm quyền Drive (để đọc
ảnh để link Google Drive chưa chia sẻ công khai).

## 2. Cấu hình server sổ PCT

Thêm vào `.env` của server (và máy dev nếu muốn thử):

```
PERMIT_CARD_SHEET_URL="https://script.google.com/macros/s/…/exec"
PERMIT_CARD_SHEET_TOKEN="<đúng chuỗi SYNC_TOKEN ở bước 1c>"
```

Sau khi sửa `.env` trên server phải nạp lại tiến trình (`pm2 reload dh1-app --update-env`).

## Bảo mật

Trang thẻ cũ (`/exec?id=…`, không có `format`) vẫn mở công khai như trước: ai có link + số thẻ xem được
SĐT và ảnh, và số thẻ dạng `1234/DH` dễ đoán lần lượt. Chế độ JSON mới thì bắt buộc mã khoá. Nên cân nhắc
giới hạn trang thẻ cũ sau này.
