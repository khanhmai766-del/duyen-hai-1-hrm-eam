// Bộ điều khiển trang LIMS chạy trong MAIN world để truy cập PF / PrimeFaces /
// jQuery của chính trang. File này KHÔNG dùng API chrome.*; bridge-lims.js ở
// ISOLATED world chịu trách nhiệm chuyển message an toàn về service worker.
(() => {
// Đọc kết quả phân tích dầu KHÔNG ĐẠT từ LIMS (portal.tpcduyenhai.com.vn/lims.xhtml).
//
// LIMS là ứng dụng JSF/PrimeFaces một URL, KHÔNG có API JSON như QLVT, nên ở đây
// phải điều khiển đúng widget của PrimeFaces rồi đọc bảng đã hiển thị. Chỉ ĐỌC —
// không gửi, sửa hay xoá gì trên LIMS.
//
// Các mã định danh dùng ở đây đều do lập trình viên LIMS đặt tên nên ổn định qua
// các lần nâng cấp; TUYỆT ĐỐI không dựa vào id sinh tự động kiểu "j_idt1097".
const TABLE_ID = "mainform:tabview:tblXemDauKqPhanTich";
const TABLE_WIDGET = "dtXemKqDau";
const MENU_OIL_TAB_ID = "mainform:tabpttn051"; // "Kết quả phân tích Dầu" ở menu bên trái
const CALENDAR_FROM_SUFFIX = ":thoigianXemKQPT";
const CALENDAR_TO_SUFFIX = ":thoigianXemKQPT2";
const AREA_SELECT_ID = `${TABLE_ID}:khuvucXemKQPT_input`;
const ROWS_PER_PAGE = 100; // đủ lớn để 1 trang chứa hết một khoảng vài tuần
const FAIL_LABEL = "khong dat";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Bỏ dấu + hạ chữ thường để so khớp tiếng Việt an toàn — giữ giống hệt
 *  normalizeText() của lib/nav.ts. Bắt buộc có bước đổi đ/Đ → d/D riêng: "Đ" (U+0110)
 *  là một CHỮ CÁI khác chứ không phải D kèm dấu, NFD không tách nó ra; thiếu bước này
 *  thì các tiêu đề "Đơn vị" / "Đánh giá" sẽ không bao giờ khớp (đã gặp thật khi thử). */
function norm(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Kích hoạt một thao tác PrimeFaces rồi chờ đúng lúc AJAX xong.
 *  PrimeFaces 11 KHÔNG bắn "ajaxComplete" của jQuery, nhưng bắn "pfAjaxComplete"
 *  (đã kiểm chứng trên LIMS: fire đúng 1 lần cho mỗi thao tác). Cũng không dùng
 *  MutationObserver vì PrimeFaces THAY cả phần tử bảng — node cũ bị tách khỏi DOM
 *  nên không có mutation nào để quan sát. */
function runAjax(trigger, timeoutMs = 25_000) {
  const hasJQuery = typeof jQuery === "function";
  if (!hasJQuery) {
    trigger();
    return wait(4_000); // không có hook: chờ cố định một khoảng an toàn
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      jQuery(document).off("pfAjaxComplete", onComplete);
      resolve();
    };
    // Nhường thêm một nhịp cho PrimeFaces vá xong DOM trước khi đọc.
    const onComplete = () => setTimeout(finish, 300);
    const timer = setTimeout(finish, timeoutMs);
    jQuery(document).one("pfAjaxComplete", onComplete);
    trigger();
  });
}

/** Chờ tới khi predicate trả về giá trị "thật"; trả undefined nếu quá hạn. */
async function waitFor(predicate, timeoutMs = 20_000, stepMs = 250) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() > deadline) return undefined;
    await wait(stepMs);
  }
}

function widget(varName) {
  return typeof PF === "function" ? PF(varName) : undefined;
}

/** Widget được tìm theo ĐUÔI id vì tiền tố (mainform:tabview:...) có thể đổi. */
function widgetByIdSuffix(suffix) {
  const all = (typeof PrimeFaces === "object" && PrimeFaces?.widgets) || {};
  const key = Object.keys(all).find((name) => all[name]?.id?.endsWith(suffix));
  return key ? all[key] : undefined;
}

function table() {
  // Phải lấy lại phần tử sau mỗi lần AJAX: PrimeFaces thay cả khối bảng.
  return document.getElementById(TABLE_ID);
}

function totalRecords() {
  const text = document.querySelector(`#${CSS.escape(TABLE_ID)} .ui-paginator-current`)?.textContent ?? "";
  const match = text.match(/of\s+(\d+)\s+records/i);
  return match ? Number(match[1]) : null;
}

function sessionExpired() {
  if (typeof PF !== "function") return true;
  // Trang đăng nhập LIMS không có menu nghiệp vụ nào.
  return !document.getElementById(MENU_OIL_TAB_ID) && !table();
}

/** Mở tab "Kết quả phân tích Dầu" nếu người dùng đang ở Dashboard. */
async function ensureOilTabOpen() {
  if (widget(TABLE_WIDGET) && table()) return true;
  const menuItem =
    document.getElementById(MENU_OIL_TAB_ID) ??
    [...document.querySelectorAll("a")].find((link) => norm(link.innerText) === "ket qua phan tich dau");
  if (!menuItem) return false;
  menuItem.click();
  return Boolean(await waitFor(() => widget(TABLE_WIDGET) && table()));
}

/** Ánh xạ tiêu đề cột → chỉ số, để không phụ thuộc thứ tự cột của LIMS. */
function columnIndexes() {
  const headerCells = [...(table()?.querySelectorAll("thead tr:first-child > th") ?? [])];
  const find = (...candidates) =>
    headerCells.findIndex((cell) => {
      // Ô "Kết quả" chứa cả dropdown lọc ("Kết quả Tất cả Đạt Không Đạt") nên
      // chỉ so khớp phần đầu tiêu đề.
      const label = norm(cell.querySelector(".ui-column-title")?.innerText ?? cell.innerText);
      return candidates.some((candidate) => label === candidate || label.startsWith(candidate));
    });

  return {
    soPhieu: find("so"),
    donVi: find("don vi"),
    tenMau: find("ten mau dau", "ten mau"),
    ngayLayMau: find("ngay lay mau"),
    danhGia: find("danh gia"),
    ykienPkt: find("y kien pkt"),
    ykienQlvh: find("y kien qlvh"),
    ketQua: find("ket qua"),
    ngayTraKq: find("ngay tra ket qua"),
  };
}

function cellText(cells, index) {
  if (index < 0 || index >= cells.length) return "";
  return cells[index].innerText.trim().replace(/\s+/g, " ");
}

/** Đặt khoảng ngày (LIMS lọc theo NGÀY TRẢ KẾT QUẢ) rồi bấm nút phễu "Lọc".
 *  Chỉ setDate là chưa đủ — phải bấm phễu mới nạp lại dữ liệu từ máy chủ. */
async function applyDateRange(days) {
  const fromCalendar = widgetByIdSuffix(CALENDAR_FROM_SUFFIX);
  const toCalendar = widgetByIdSuffix(CALENDAR_TO_SUFFIX);
  if (!fromCalendar || typeof fromCalendar.setDate !== "function") return false;

  const today = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  fromCalendar.setDate(start);
  if (toCalendar && typeof toCalendar.setDate === "function") toCalendar.setDate(today);
  await wait(600);

  const filterButton = [...(table()?.querySelectorAll("button") ?? [])].find(
    (button) => button.querySelector(".pi-filter-fill") || norm(button.title) === "loc"
  );
  if (!filterButton) return false;

  await runAjax(() => filterButton.click());
  return true;
}

/** Nới số dòng/trang để một trang chứa hết kết quả — tránh hẳn việc phải phân trang
 *  (phân trang của LIMS không đáng tin khi có bộ lọc). */
async function setRowsPerPage() {
  const paginator = widget(TABLE_WIDGET)?.paginator;
  if (!paginator || typeof paginator.setRowsPerPage !== "function") return;
  const currentRows = Number(paginator.cfg?.rows ?? paginator.rows);
  if (currentRows === ROWS_PER_PAGE) return;
  await runAjax(() => paginator.setRowsPerPage(ROWS_PER_PAGE));
}

function currentArea() {
  const label = document.querySelector(
    `#${CSS.escape(`${TABLE_ID}:khuvucXemKQPT`)} .ui-selectonemenu-label`
  )?.innerText;
  if (label) return label.trim();
  const select = document.getElementById(AREA_SELECT_ID);
  return select?.selectedOptions?.[0]?.text?.trim() ?? "";
}

/** Đọc toàn bộ bảng đang hiển thị và lọc "Không Đạt" + đúng đơn vị NGAY TẠI ĐÂY.
 *  Lọc phía trình duyệt thay vì dùng bộ lọc cột của LIMS, vì bộ lọc cột của LIMS
 *  làm phân trang hỏng (bấm sang trang 2 không đổi dữ liệu, paginator hiện NaN). */
function readFailureRows(targetDonVi, khuVuc) {
  const index = columnIndexes();
  if (index.soPhieu < 0 || index.ketQua < 0 || index.tenMau < 0) return null;

  const wantedDonVi = norm(targetDonVi);
  const rows = [];
  let sourceCount = 0;

  for (const tr of table()?.querySelectorAll("tbody > tr") ?? []) {
    const limsId = tr.getAttribute("data-rk");
    const cells = [...tr.children];
    // Dòng "không có dữ liệu" của PrimeFaces không có data-rk.
    if (!limsId || !cells.length) continue;
    sourceCount += 1;

    if (norm(cellText(cells, index.ketQua)) !== FAIL_LABEL) continue;
    const donVi = cellText(cells, index.donVi);
    if (wantedDonVi && norm(donVi) !== wantedDonVi) continue;

    rows.push({
      limsId,
      soPhieu: cellText(cells, index.soPhieu),
      khuVuc,
      donVi,
      tenMau: cellText(cells, index.tenMau),
      ngayLayMau: cellText(cells, index.ngayLayMau),
      danhGia: cellText(cells, index.danhGia),
      ykienPkt: cellText(cells, index.ykienPkt),
      ykienQlvh: cellText(cells, index.ykienQlvh),
      ngayTraKq: cellText(cells, index.ngayTraKq),
    });
  }

  return { rows, sourceCount };
}

const PAGE_REQUEST = "DUYENHAI1_LIMS_PAGE_REQUEST";
const PAGE_RESPONSE = "DUYENHAI1_LIMS_PAGE_RESPONSE";

async function readOilFailures(message) {
    const requestedDays = Number(message.days);
    const days = Number.isSafeInteger(requestedDays) && requestedDays > 0
      ? Math.min(requestedDays, 365)
      : 14;
    const targetDonVi = typeof message.donVi === "string" && message.donVi.trim()
      ? message.donVi.trim().slice(0, 200)
      : "PX Vận hành 1";
    const targetKhuVuc = typeof message.khuVuc === "string" && message.khuVuc.trim()
      ? message.khuVuc.trim().slice(0, 200)
      : "Duyên Hải 1";

    // JSF/PrimeFaces có thể tiếp tục khởi tạo sau khi Chrome đã báo tab
    // complete. Cho trang mới một khoảng ngắn để PF/menu xuất hiện trước khi
    // kết luận phiên đăng nhập đã hết hạn.
    await waitFor(() => typeof PF === "function" && (
      document.getElementById(MENU_OIL_TAB_ID) || table()
    ), 20_000);

    if (sessionExpired()) {
      return {
        ok: false,
        code: "LIMS_SESSION_EXPIRED",
        message: "Phiên LIMS đã hết hạn. Vui lòng đăng nhập lại rồi bấm “Tiếp tục đồng bộ”."
      };
    }

    if (!(await ensureOilTabOpen())) {
      return {
        ok: false,
        code: "LIMS_OIL_TAB_MISSING",
        message: "Không mở được mục “Kết quả phân tích → Kết quả phân tích Dầu” trên LIMS. Hãy mở mục này rồi bấm “Tiếp tục đồng bộ”."
      };
    }

    const khuVuc = currentArea();
    if (norm(khuVuc) !== norm(targetKhuVuc)) {
      return {
        ok: false,
        code: "LIMS_AREA_MISMATCH",
        message: `LIMS đang xem khu vực “${khuVuc || "không xác định"}”. Hãy chọn “${targetKhuVuc}” rồi bấm “Tiếp tục đồng bộ”.`
      };
    }

    // Lọc khoảng ngày trước để không yêu cầu LIMS tải 100 dòng của một khoảng
    // dữ liệu cũ có thể rất lớn. Sau khi lọc xong mới nới số dòng/trang.
    if (!(await applyDateRange(days))) {
      return {
        ok: false,
        code: "LIMS_FILTER_FAILED",
        message: "Không đặt được khoảng thời gian trên LIMS. Hãy tải lại trang LIMS rồi thử lại."
      };
    }
    await setRowsPerPage();

    const total = totalRecords();
    const result = readFailureRows(targetDonVi, khuVuc);
    if (!result) {
      return {
        ok: false,
        code: "LIMS_LAYOUT_CHANGED",
        message: "Không nhận ra các cột của bảng kết quả LIMS (giao diện LIMS có thể đã thay đổi). Cần cập nhật tiện ích."
      };
    }

    // Nếu LIMS báo tổng nhiều hơn số dòng đọc được thì vẫn còn dòng ở trang sau —
    // thà báo lỗi còn hơn đồng bộ thiếu mà người dùng không biết.
    if (total !== null && result.sourceCount < total) {
      return {
        ok: false,
        code: "LIMS_PAGE_INCOMPLETE",
        message: `LIMS có ${total} phiếu nhưng chỉ hiển thị ${result.sourceCount} dòng. Hãy đặt số dòng/trang lớn hơn trên LIMS, hoặc rút ngắn số ngày rồi thử lại.`
      };
    }

    if (!result.rows.length) {
      return {
        ok: false,
        code: "LIMS_NO_FAILURE",
        message: `Không có mẫu dầu Không Đạt nào của ${targetDonVi} trong ${days} ngày gần nhất (đã đọc ${result.sourceCount} phiếu).`,
        sourceCount: result.sourceCount
      };
    }

    return {
      ok: true,
      rows: result.rows,
      sourceCount: result.sourceCount,
      khuVuc,
      days,
      receivedAt: new Date().toISOString()
    };
}

window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    event.data?.source !== "DUYENHAI1_LIMS_EXTENSION" ||
    event.data?.type !== PAGE_REQUEST ||
    typeof event.data?.requestId !== "string"
  ) return;

  const requestId = event.data.requestId;
  readOilFailures(event.data.payload ?? {})
    .then((result) => {
      window.postMessage({
        source: "DUYENHAI1_LIMS_PAGE",
        type: PAGE_RESPONSE,
        requestId,
        result,
      }, window.location.origin);
    })
    .catch((error) => {
      window.postMessage({
        source: "DUYENHAI1_LIMS_PAGE",
        type: PAGE_RESPONSE,
        requestId,
        result: {
          ok: false,
          code: "LIMS_UNEXPECTED_ERROR",
          message: error?.message || "Không đọc được kết quả phân tích dầu từ LIMS",
        },
      }, window.location.origin);
    });
});
})();
