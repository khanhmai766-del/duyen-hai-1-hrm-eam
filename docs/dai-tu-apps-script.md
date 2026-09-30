# Đồng bộ hạng mục đại tu từ Google Sheets tiến độ (Apps Script)

Form cấp **PCT nhà thầu · Đại tu** gợi ý "Nội dung công việc" theo **mã hạng mục** lấy từ 4 file tiến độ đại tu:

| Khoá (biến môi trường) | File |
| --- | --- |
| `OVERHAUL_SHEET_URL_LO` | Tiến độ đại tu Lò |
| `OVERHAUL_SHEET_URL_TURBINE` | Tiến độ đại tu Turbine |
| `OVERHAUL_SHEET_URL_DIEN` | Tiến độ đại tu Điện |
| `OVERHAUL_SHEET_URL_CI` | Tiến độ đại tu C&I |

Mỗi file gắn **cùng một đoạn Apps Script** bên dưới, triển khai thành web app. App gọi `?format=json&token=…`, chép
hạng mục về DB (bảng `WorkPermitOverhaulItem`) khi bấm **Đồng bộ** trong hộp "Chọn hạng mục đại tu". Form cấp phiếu
chỉ đọc DB, không gọi Google mỗi lần mở. Mã server: `lib/server/work-permit-overhaul.ts`.

## Quy ước trong file Sheets

- **Tên tab** = `<Cương vị> - Cơ` hoặc `<Cương vị> - Điện` (vd `Máy nghiền - Cơ`, `Lò hơi - Điện`).
  - Đuôi `- Cơ` → gợi ý cho PCT Cơ – Nhiệt – Hóa; `- Điện` → PCT Điện.
  - Phần cương vị khớp danh mục cương vị của app (có bí danh, vd "Máy nghiền", "ESP", "FGD", "Thải xỉ").
    Tab không khớp vẫn đồng bộ nhưng không lọc theo cương vị được; hộp Đồng bộ liệt kê các tab này.
  - Tab khác (Tiến độ tổng, Dashboard…) bị bỏ qua.
- **Hàng tiêu đề** có các cột (thứ tự, vị trí tuỳ ý — script tìm theo tên):
  `Mã hạng mục` · `Tên thiết bị` · `Nội dung công việc` · `Biện pháp thi công` · `Nhà thầu` · `% Hoàn thành` ·
  `Trạng thái hiện tại`.
- **Cột Nhà thầu** ghi **mã viết tắt** trùng với mã đơn vị trong danh bạ nhà thầu của app (vd `IDC`).
  Không phân biệt hoa thường, dấu.
- Ô gộp nhiều hàng (một hạng mục chiếm 2 hàng) được xử lý; hàng không có mã (tiêu đề mục "I. PHẦN CƠ") bị bỏ qua.
- Đổi nội dung trên Sheet không đổi phụ lục của **phiếu đã cấp** — phiếu lưu ảnh chụp hạng mục lúc cấp.

## Mã Apps Script (dán vào từng file: Tiện ích mở rộng → Apps Script)

```javascript
/**
 * Web app đọc hạng mục đại tu cho PowerPlant EAM.
 * GET ?format=json&token=<SYNC_TOKEN>  →  { ok, file, rows: [{ sheet, row, code, device, content, method, contractor, percent, status }] }
 * doPost dành cho đợt 2 (ghi kết quả ngày về ô "Ngày n") — chưa dùng.
 */
const TAB_PATTERN = /^(.+?)\s*[-–—]\s*(Cơ|Điện)\s*$/i;
const COLUMNS = {
  code: ['mã hạng mục'],
  device: ['tên thiết bị'],
  content: ['nội dung công việc'],
  method: ['biện pháp thi công'],
  contractor: ['nhà thầu'],
  percent: ['% hoàn thành'],
  status: ['trạng thái hiện tại', 'trạng thái'],
};

function doGet(e) {
  const params = (e && e.parameter) || {};
  const token = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
  if (!token || params.token !== token) return json_({ ok: false, error: 'token' });
  if (params.format !== 'json') return json_({ ok: false, error: 'format' });
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rows = [];
    ss.getSheets().forEach(function (sheet) {
      if (TAB_PATTERN.test(sheet.getName().trim())) readSheet_(sheet, rows);
    });
    return json_({ ok: true, file: ss.getName(), rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function readSheet_(sheet, out) {
  const range = sheet.getDataRange();
  const values = range.getDisplayValues();
  // Ô gộp: chỉ ô trên-trái có giá trị → chép xuống các ô còn lại của vùng gộp.
  range.getMergedRanges().forEach(function (merged) {
    const value = merged.getDisplayValue();
    for (let r = merged.getRow() - 1; r < merged.getLastRow(); r++) {
      for (let c = merged.getColumn() - 1; c < merged.getLastColumn(); c++) {
        if (values[r] && c < values[r].length) values[r][c] = value;
      }
    }
  });

  const norm = function (v) { return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
  let headerRow = -1;
  const col = {};
  for (let r = 0; r < Math.min(values.length, 30) && headerRow < 0; r++) {
    const cells = values[r].map(norm);
    if (cells.indexOf('mã hạng mục') < 0 || cells.indexOf('nội dung công việc') < 0) continue;
    headerRow = r;
    Object.keys(COLUMNS).forEach(function (key) {
      for (const name of COLUMNS[key]) {
        const index = cells.indexOf(name);
        if (index >= 0) { col[key] = index; break; }
      }
    });
  }
  if (headerRow < 0) return;

  let previous = '';
  for (let r = headerRow + 1; r < values.length; r++) {
    const cell = function (key) { return col[key] === undefined ? '' : String(values[r][col[key]] || '').trim(); };
    const code = cell('code');
    if (!code || !/\d/.test(code)) { previous = ''; continue; }
    if (code === previous) continue; // hàng thứ hai của cùng một vùng gộp
    previous = code;
    out.push({
      sheet: sheet.getName().trim(), row: r + 1, code: code,
      device: cell('device'), content: cell('content'), method: cell('method'),
      contractor: cell('contractor'), percent: cell('percent'), status: cell('status'),
    });
  }
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
```

## Triển khai (làm một lần cho mỗi file)

1. Mở file → **Tiện ích mở rộng → Apps Script** → dán mã trên (thay nội dung `Code.gs`) → Lưu.
2. **Cài đặt dự án (bánh răng) → Thuộc tính tập lệnh** → thêm `SYNC_TOKEN` = một chuỗi ngẫu nhiên dài.
   **Cả 4 file dùng chung một token** (app đọc một biến `OVERHAUL_SHEET_TOKEN`).
3. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**:
   - Thực thi dưới dạng: **Tôi** (chủ file).
   - Người có quyền truy cập: **Bất kỳ ai** — web app tự chặn bằng token; dữ liệu không lộ nếu không có token.
4. Sao chép **URL ứng dụng web** (`https://script.google.com/macros/s/…/exec`).
5. Trên server, thêm vào `.env` của app rồi `reload`:
   ```
   OVERHAUL_SHEET_TOKEN="<token>"
   OVERHAUL_SHEET_URL_LO="https://script.google.com/macros/s/…/exec"
   OVERHAUL_SHEET_URL_TURBINE="…"
   OVERHAUL_SHEET_URL_DIEN="…"
   OVERHAUL_SHEET_URL_CI="…"
   ```
   File nào chưa có URL thì bị bỏ qua khi đồng bộ, không lỗi.
6. Kiểm tra nhanh: mở `<URL>?format=json&token=<token>` trên trình duyệt → phải thấy `{"ok":true,...}`.

Sửa mã Apps Script sau này: **Triển khai → Quản lý triển khai → Chỉnh sửa → Phiên bản mới** (giữ nguyên URL).
