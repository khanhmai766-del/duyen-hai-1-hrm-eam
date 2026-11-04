importScripts("meter-extract.js");

const QLKT_PATTERN = /^https?:\/\/qlkt\.tpcduyenhai\.com\.vn\/qlkt\//i;
// Địa chỉ cố định của màn hình "Số liệu đo đếm công tơ" — dùng làm mặc định
// để tiện ích luôn mở đúng thẳng vào đây, không phụ thuộc việc "ghi nhớ"
// trang trước đó có đúng/còn hiệu lực hay không.
const DEFAULT_METER_URL = "http://qlkt.tpcduyenhai.com.vn/qlkt/sxd/solieucto.jsf";
// Tương tự, màn hình "Sản lượng" (Vận hành → Sản lượng) từng bị ghi nhớ NHẦM
// địa chỉ của báo cáo khác cùng module ("Cập nhật sản lượng bù trừ",
// rpt_a_bu_tru_day.jsf — xem content.js/pageKind) vì 2 trang có nội dung giống
// nhau, khiến đồng bộ luôn đọc ra 0 chỉ tiêu mà người dùng không biết vì sao.
// Cố định luôn địa chỉ đúng (đã xác nhận trực tiếp trên hệ thống QLKT thật)
// thay vì phụ thuộc "ghi nhớ", để lỗi này không thể tái diễn.
const DEFAULT_PRODUCTION_URL = "http://qlkt.tpcduyenhai.com.vn/qlkt/sxd/rpt_a_production_day.jsf";
const DEFAULT_OPERATION_URL = "http://qlkt.tpcduyenhai.com.vn/qlkt/sxd/rpt_hour_operation.jsf";
const DEFAULT_PMIS_02PD_URL = "http://qlkt.tpcduyenhai.com.vn/qlkt/sxd/report/rpt_CT_QLKT_02_PD_New.jsf";
const DEFAULT_HEATRATE_URL = "http://qlkt.tpcduyenhai.com.vn/qlkt/sxd/can_bang_nhiet.jsf";
const SOURCE_LABELS = {
  production: "Sản lượng",
  fuel: "Nhiên liệu",
  operation: "Vận hành",
  meter: "Công tơ PPA",
  heatrate: "Cân bằng nhiệt",
  pmis_02pd: "Báo cáo 02-PĐ",
};
const DAILY_SOURCES = ["fuel", "operation"];
const DAILY_FIELD_CODES = new Set(["F", "L", "AR", "CC", "CD", "CS", "CT", "CU", "CV", "GRID_RECEIVE_S1", "GRID_RECEIVE_S2"]);
const PMIS_PRODUCTION_CELLS = new Set(["J157", "K157", "J158", "K158"]);
const REQUIRED_FIELDS = {
  production: ["B", "C", "H", "I"],
  fuel: ["AR", "CC", "CD"],
  operation: ["F", "L", "CS", "CT", "CU", "CV"],
  // 8 mã của cả 2 tổ máy (S1+S2) — content.js tự đổi "Tổ máy" trên màn hình Cân bằng nhiệt và đọc
  // lần lượt cả 2 trong 1 lần gọi READ_QLKT_VALUES, nên chỉ cần 1 tab, không cần mở 2 lần như trước.
  heatrate: ["DA", "DB", "DC", "DD", "DE", "DF", "DG", "DH"],
  pmis_02pd: ["C181", "D181", "F181"],
};

function missingSourceFields(source, payload) {
  const received = new Set((payload?.entries || []).map(entry => entry.fieldCode));
  const stoppedCodes = new Set();
  if (source === "heatrate") {
    for (const unit of payload?.unavailableHeatRateUnits || []) {
      const codes = unit === "1" ? ["DA", "DC", "DE", "DG"] : unit === "2" ? ["DB", "DD", "DF", "DH"] : [];
      const otherCodes = REQUIRED_FIELDS.heatrate.filter(code => !codes.includes(code));
      const otherStopped = payload?.unavailableHeatRateUnits?.includes(unit === "1" ? "2" : "1")
        && otherCodes.every(code => !received.has(code));
      if (codes.length && codes.every(code => !received.has(code)) && (otherStopped || otherCodes.every(code => received.has(code)))) {
        codes.forEach(code => stoppedCodes.add(code));
      }
    }
  }
  return REQUIRED_FIELDS[source].filter(code => !received.has(code) && !stoppedCodes.has(code));
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForTab(tabId, timeout = 60000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === "complete") return;
      // QLKT đôi khi giữ tab ở trạng thái "loading" rất lâu dù DOM đã hiện
      // đầy đủ và có thể đọc được. Chờ document.readyState giúp tránh báo sai
      // "tải trang quá lâu"; sendWithRetry sẽ tự chèn content script nếu
      // document_idle chưa kịp chạy.
      const executions = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.readyState,
      });
      if (["interactive", "complete"].includes(executions?.[0]?.result)) return;
    } catch (error) {
      lastError = error;
    }
    await wait(750);
  }
  const detail = lastError instanceof Error ? ` Chi tiết: ${lastError.message}` : "";
  throw new Error(`QLKT chưa sẵn sàng sau ${Math.round(timeout / 1000)} giây.${detail}`);
}

async function sendWithRetry(tabId, message, attempts = 10) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        try {
          await chrome.scripting.executeScript({ target: { tabId }, files: ["meter-extract.js", "content.js"] });
        } catch (injectionError) {
          lastError = injectionError;
        }
      }
      await wait(300);
    }
  }
  throw lastError || new Error("Không kết nối được với màn hình QLKT.");
}

async function readValuesWithRetry(tabId, operatingDate, attempts = 24, intervalMs = 500, options = {}) {
  let result;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    result = await sendWithRetry(tabId, { type: "READ_QLKT_VALUES", operatingDate, stoppedUnits: options.stoppedUnits || [] });
    if (result?.ok) return result;
    await wait(intervalMs);
  }
  return result;
}

async function prepareDateWithRetry(tabId, operatingDate, attempts = 20, intervalMs = 500) {
  let result;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    result = await sendWithRetry(tabId, { type: "PREPARE_QLKT_DATE", operatingDate });
    if (result?.ok || !result?.retryable) return result;
    await wait(intervalMs);
  }
  return result;
}

// Executed in MAIN: the isolated content script cannot access QLKT's widgets.
function selectHeatRateUnitInPage(targetUnit) {
  if (targetUnit !== "1" && targetUnit !== "2") throw new Error("Tổ máy không hợp lệ.");
  const unitOf = option => {
    const text = `${option.textContent || ""} ${option.value || ""}`.toLowerCase();
    return /(?:dh1[_ -]*)?mf[_ -]*2\b/.test(text) ? "2" : /(?:dh1[_ -]*)?mf[_ -]*1\b/.test(text) ? "1" : null;
  };
  const selects = [...document.querySelectorAll("select")];
  const select = selects.find(item => /cbSelectMainAsset/i.test(item.id || item.name || ""))
    || selects.find(item => ["1", "2"].every(unit => [...item.options].some(option => unitOf(option) === unit)));
  const option = [...(select?.options || [])].find(item => unitOf(item) === targetUnit);
  if (!select || !option) throw new Error(`Không tìm thấy danh sách DH1_MF${targetUnit}.`);
  const baseId = (select.id || "").replace(/_input$/, "");
  const pf = globalThis.PrimeFaces;
  let widget;
  for (const id of [baseId, select.id]) {
    try { widget = pf?.getWidgetById?.(id); } catch { /* older PrimeFaces */ }
    if (widget) break;
  }
  widget ||= Object.values(pf?.widgets || {}).find(item => item?.id === baseId || item?.input?.[0] === select);
  if (typeof widget?.selectValue === "function" && typeof widget?.triggerChange === "function") {
    // selectValue is silent in PrimeFaces; explicitly notify its AJAX handler.
    widget.selectValue(option.value);
    widget.triggerChange();
    return { ok: true, method: "PrimeFaces.triggerChange", ajaxStarted: typeof pf?.ajax?.Queue?.isEmpty === "function" && (!pf.ajax.Queue.isEmpty() || (pf.ajax.Queue.xhrs?.length || 0) > 0) };
  }
  if (typeof widget?.selectItem === "function" && typeof widget?.selectItemFromOption === "function") {
    const widgetOption = widget.options.filter(function () { return this.value === option.value; });
    widget.selectItem(widget.selectItemFromOption(widgetOption), false);
    return { ok: true, method: "PrimeFaces.selectItem", ajaxStarted: typeof pf?.ajax?.Queue?.isEmpty === "function" && (!pf.ajax.Queue.isEmpty() || (pf.ajax.Queue.xhrs?.length || 0) > 0) };
  }
  if (document.getElementById(`${baseId}_label`)) {
    throw new Error("Widget Tổ máy QLKT chưa sẵn sàng; chưa kích hoạt tải bảng.");
  }
  select.value = option.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, method: "native.change" };
}

async function selectHeatRateUnitForTab(sender, targetUnit) {
  if (!Number.isInteger(sender?.tab?.id) || sender.frameId !== 0
    || !QLKT_PATTERN.test(sender.url || "")
    || new URL(sender.url).pathname.toLowerCase() !== new URL(DEFAULT_HEATRATE_URL).pathname.toLowerCase()) {
    throw new Error("Chỉ màn hình Cân bằng nhiệt QLKT được phép chọn Tổ máy.");
  }
  if (targetUnit !== "1" && targetUnit !== "2") throw new Error("Tổ máy không hợp lệ.");
  const executions = await chrome.scripting.executeScript({
    target: { tabId: sender.tab.id }, world: "MAIN", func: selectHeatRateUnitInPage, args: [targetUnit],
  });
  if (!executions?.[0]?.result?.ok) throw new Error("QLKT chưa xác nhận thao tác chọn Tổ máy.");
  return executions[0].result;
}

async function waitForHeatRateAjaxInPage() {
  const queue = globalThis.PrimeFaces?.ajax?.Queue;
  if (typeof queue?.isEmpty !== "function") return { ok: true, ajaxVerified: false };
  const deadline = Date.now() + 10000;
  while (!queue.isEmpty() || (queue.xhrs?.length || 0) > 0) {
    if (Date.now() >= deadline) throw new Error("QLKT vẫn đang tải Cân bằng nhiệt; chưa xác nhận được dữ liệu ngày này.");
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return { ok: true, ajaxVerified: true };
}

async function waitForHeatRateAjaxForTab(sender) {
  if (!Number.isInteger(sender?.tab?.id) || sender.frameId !== 0 || !QLKT_PATTERN.test(sender.url || "")
    || new URL(sender.url).pathname.toLowerCase() !== new URL(DEFAULT_HEATRATE_URL).pathname.toLowerCase()) {
    throw new Error("Chỉ màn hình Cân bằng nhiệt QLKT được phép kiểm tra tải bảng.");
  }
  const executions = await chrome.scripting.executeScript({ target: { tabId: sender.tab.id }, world: "MAIN", func: waitForHeatRateAjaxInPage });
  if (!executions?.[0]?.result?.ok) throw new Error("Chưa xác nhận được trạng thái tải bảng QLKT.");
  return executions[0].result;
}

async function readMeterFromPageWorld(tabId, operatingDate, sourcePage, options = {}) {
  const executions = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      const arrays = [], seenObjects = new WeakSet(), seenArrays = new Set();
      const collect = (value, depth) => {
        if (!value || depth < 0 || (typeof value !== "object" && !Array.isArray(value))) return;
        if (typeof Node !== "undefined" && value instanceof Node) return;
        if (typeof Window !== "undefined" && value instanceof Window) return;
        if (Array.isArray(value)) {
          if (value.some(row => Array.isArray(row) && row.length >= 53)) {
            let signature;
            try { signature = JSON.stringify(value); } catch { return; }
            if (!seenArrays.has(signature)) { seenArrays.add(signature); arrays.push(value); }
            return;
          }
          if (depth > 0) value.slice(0, 100).forEach(item => collect(item, depth - 1));
          return;
        }
        if (seenObjects.has(value)) return;
        seenObjects.add(value);
        if (depth === 0) return;
        let keys = [];
        try { keys = Object.keys(value).slice(0, 200); } catch { return; }
        for (const key of keys) {
          try { collect(value[key], depth - 1); } catch { /* ignore page getters */ }
        }
      };
      const widgets = globalThis.PrimeFaces?.widgets || {};
      collect(widgets, 4);
      for (const name of ["sheetWidget", "widget_sheetWidget"]) {
        try { collect(typeof globalThis.PF === "function" ? globalThis.PF(name) : null, 4); } catch { /* widget not found */ }
        try { collect(globalThis[name], 4); } catch { /* biến toàn cục không tồn tại */ }
      }
      // Chẩn đoán thêm: ô ngày đang HIỂN THỊ trên trang lúc đọc — để phân biệt
      // 2 tình huống khác nhau khi dữ liệu vẫn sai ngày: (a) ô ngày đã đúng
      // nhưng bảng dữ liệu thật sự chưa nạp kịp (chỉ cần chờ thêm), hay (b) ô
      // ngày chưa từng đổi/đã bị trả lại giá trị cũ (nút cập nhật bấm sai chỗ,
      // cần dò lại cách bấm nút).
      const visibleDates = [...document.querySelectorAll("input")]
        .map(input => String(input.value || input.getAttribute("value") || "").trim())
        .filter(value => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value));
      return { arrays, widgetNames: Object.keys(widgets), hasPrimeFaces: Boolean(globalThis.PrimeFaces), visibleDates: [...new Set(visibleDates)] };
    },
  });
  const snapshot = executions?.[0]?.result;
  const dateInfo = `Ô ngày trên trang: ${(snapshot?.visibleDates || []).join(", ") || "không thấy"}.`;
  if (!snapshot?.arrays?.length) {
    return { ok: false, error: `Không đọc được mảng dữ liệu từ widget QLKT. (PrimeFaces: ${snapshot?.hasPrimeFaces ? "có" : "không"}; widgets: ${(snapshot?.widgetNames || []).join(", ") || "không có"}. ${dateInfo})` };
  }
  try {
    const payload = globalThis.QlktMeterExtractor.extractPpaMeterReadingsFromDataArrays(snapshot.arrays, operatingDate, sourcePage, options);
    return { ok: true, payload };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không đọc được dữ liệu widget công tơ QLKT.";
    return { ok: false, error: `${message} (${dateInfo})` };
  }
}

// Sau khi bấm nút "làm mới" để đổi ngày, QLKT nạp lại dữ liệu ExtSheet bằng
// AJAX ở phía máy chủ — có thể mất vài giây, và trong lúc đó widget vẫn còn
// giữ nguyên dữ liệu CỦA NGÀY CŨ trong bộ nhớ (nên đọc thử sẽ ra đúng cấu
// trúc nhưng sai ngày). Đọc 1 lần rồi bỏ cuộc ngay khi thấy sai ngày là
// nguyên nhân khiến việc đồng bộ báo lỗi dù chỉ cần chờ thêm; vì vậy phải
// thử lại nhiều lần giống hệt cách readValuesWithRetry() làm cho các màn
// hình khác, cho tới khi widget thực sự nạp xong đúng ngày đã chọn.
// Giới hạn theo THỜI GIAN THỰC (deadline) thay vì đếm số lần thử: mỗi lần đọc
// tự nó cũng tốn thời gian (executeScript + JSON.stringify để dò trùng lặp
// trên bảng có thể khá lớn), nên đếm số lần thử cố định có thể khiến tổng
// thời gian vượt quá dự tính nếu máy chủ QLKT chậm bất thường — trong khi web
// Chỉ tiêu KTKT chỉ chờ tối đa một khoảng thời gian cố định trước khi tự báo
// "QLKT phản hồi quá lâu" (xem components/ppa-heat-rate-comparison.tsx).
async function readMeterFromPageWorldWithRetry(tabId, operatingDate, sourcePage, timeoutMs = 35000, intervalMs = 1000, options = {}) {
  const deadline = Date.now() + timeoutMs;
  let result;
  do {
    result = await readMeterFromPageWorld(tabId, operatingDate, sourcePage, options);
    if (result?.ok) return result;
    await wait(intervalMs);
  } while (Date.now() < deadline);
  return result;
}

async function readSource(source, url, operatingDate, options = {}) {
  let tabId;
  let createdTab = false;
  const isMeter = source === "meter";
  // Các màn hình QLKT (không riêng Công tơ PPA) chỉ thực sự dựng bảng dữ liệu
  // đầy đủ khi tab đang ở trạng thái hiển thị — QLKT có vẻ trì hoãn/bỏ qua
  // việc render các bảng nặng nếu tab chạy nền (active:false). Ban đầu chỉ
  // phát hiện và sửa cho "meter", nhưng lỗi tương tự (0 chỉ tiêu đọc được) cũng
  // xảy ra ở "production" — nên áp dụng active:true cho TẤT CẢ nguồn, không
  // chỉ riêng meter, rồi tự quay lại tab làm việc của người dùng sau khi xong.
  let previousActiveTabId;
  let previousActiveWindowId;
  try {
    {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      previousActiveTabId = currentTab?.id;
      previousActiveWindowId = currentTab?.windowId;
    }
    let tab;
    const targetUrl = new URL(url);
    const openTabs = await chrome.tabs.query({});
    const existingSourceTab = openTabs.find(candidate => {
      try {
        const parsed = new URL(candidate.url || "");
        return QLKT_PATTERN.test(candidate.url || "") && parsed.pathname.toLowerCase() === targetUrl.pathname.toLowerCase();
      } catch {
        return false;
      }
    });
    if (existingSourceTab?.id) {
        tab = await chrome.tabs.update(existingSourceTab.id, { active: true });
        if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    }
    if (!tab) {
      tab = await chrome.tabs.create({ url, active: true });
      createdTab = true;
    }
    tabId = tab.id;
    if (!tabId) throw new Error(`Không mở được màn hình ${SOURCE_LABELS[source]}.`);
    await waitForTab(tabId);
    const current = await chrome.tabs.get(tabId);
    if (!QLKT_PATTERN.test(current.url || "")) throw new Error("Phiên đăng nhập QLKT đã hết hạn. Hãy đăng nhập lại rồi thử lại.");
    if (source === "heatrate" && new URL(current.url).pathname.toLowerCase() !== targetUrl.pathname.toLowerCase()) {
      throw new Error(`QLKT đã chuyển khỏi màn hình Cân bằng nhiệt (${new URL(current.url).pathname}). Hãy kiểm tra phiên đăng nhập QLKT rồi thử lại.`);
    }
    const prepared = await prepareDateWithRetry(tabId, operatingDate);
    if (!prepared?.ok) throw new Error(prepared?.error || `Không đặt được ngày tại màn hình ${SOURCE_LABELS[source]}.`);
    // Màn hình Công tơ PPA (bảng ExtSheet 4 điểm đo × 48 chu kỳ) thường mất
    // nhiều thời gian hơn để máy chủ QLKT nạp xong dữ liệu so với các màn
    // hình khác, kể cả sau khi trình duyệt báo trang đã "tải xong". Vì vậy
    // cho nguồn "meter" một khoảng chờ và số lần thử lại nhiều hơn hẳn.
    await wait(isMeter ? 3000 : 1200);
    let result;
    if (isMeter) {
      result = await readMeterFromPageWorldWithRetry(tabId, operatingDate, current.url || url, 35000, 1000, options);
      if (!result?.ok) {
        const pageWorldError = result?.error || "Không đọc được widget QLKT.";
        // Cách đọc dự phòng (dò thẻ <script> tĩnh) hầu như không còn tác dụng
        // trên QLKT hiện tại (dữ liệu ExtSheet luôn nạp bằng AJAX, không nhúng
        // sẵn trong HTML) nên chỉ thử vài lần cho chắc thay vì chờ lâu vô ích.
        result = await readValuesWithRetry(tabId, operatingDate, 5, 500, options);
        if (!result?.ok) {
          const prepInfo = `Đã bấm nút cập nhật ngày: ${prepared.refreshed ? `có (${prepared.controlInfo || "?"})` : "không (ngày đã đúng sẵn khi kiểm tra)"}.`;
          result = { ...result, error: `${result?.error || "Không đọc được màn hình Công tơ PPA."} [Đọc trực tiếp widget: ${pageWorldError}] [${prepInfo}]` };
        }
      }
    } else result = await readValuesWithRetry(tabId, operatingDate, source === "heatrate" ? 1 : 24);
    if (!result?.ok) throw new Error(`Màn hình ${SOURCE_LABELS[source]}: ${result?.error || "không đọc được dữ liệu."}`);
    if (source === "meter") {
      const deliveryKeys = ["DHA_S1", "DH1_285M", "DHA_S2", "DH1_283M"];
      if (result.payload?.kind !== "ppa-meter" || !deliveryKeys.every(meter =>
        result.payload?.readings?.some(reading => reading.meter === meter && reading.channel === "kWhGiao"))) {
        throw new Error("Màn hình Công tơ PPA chưa đọc đủ 4 kênh giao bắt buộc.");
      }
    } else {
      const missingFields = missingSourceFields(source, result.payload);
      if (missingFields.length) {
        throw new Error(`Màn hình ${SOURCE_LABELS[source]} còn thiếu ${missingFields.length} chỉ tiêu. Tiện ích đã dừng để tránh đồng bộ thiếu dữ liệu.`);
      }
    }
    if (result.payload?.operatingDate !== operatingDate) {
      const actualDate = result.payload?.operatingDate || "không xác định";
      throw new Error(`Màn hình ${SOURCE_LABELS[source]} đang ở ngày ${actualDate}, không phải ngày ${operatingDate}.`);
    }
    return result.payload;
  } finally {
    if (tabId && createdTab) chrome.tabs.remove(tabId).catch(() => {});
    if (previousActiveTabId) chrome.tabs.update(previousActiveTabId, { active: true }).catch(() => {});
    if (previousActiveWindowId) chrome.windows.update(previousActiveWindowId, { focused: true }).catch(() => {});
  }
}

async function syncAll(operatingDate, providedMeterPayload = null) {
  const { qlktPages = {} } = await chrome.storage.local.get({ qlktPages: {} });
  const urlFor = source => source === "production" ? DEFAULT_PRODUCTION_URL
    : source === "operation" ? DEFAULT_OPERATION_URL
    : qlktPages[source];
  const missing = DAILY_SOURCES.filter(key => !urlFor(key));
  if (missing.length) {
    const labels = missing.map(key => SOURCE_LABELS[key]).join(", ");
    throw new Error(`Thiếu địa chỉ: ${labels}. Chỉ lần đầu, hãy mở từng màn hình này một lần rồi thử lại.`);
  }
  const payloads = [];
  for (const source of DAILY_SOURCES) {
    payloads.push(await readSource(source, urlFor(source), operatingDate));
  }
  const meterPayload = providedMeterPayload || await syncPpa(operatingDate);
  const entries = new Map();
  payloads.flatMap(payload => payload.entries || [])
    .filter(entry => DAILY_FIELD_CODES.has(entry.fieldCode))
    .forEach(entry => entries.set(entry.fieldCode, entry));
  const receivedMeters = [
    { fieldCode: "GRID_RECEIVE_S1", meter: "DH1_285M", label: "Điện nhận lưới S1 · xuất tuyến 285" },
    { fieldCode: "GRID_RECEIVE_S2", meter: "DH1_283M", label: "Điện nhận lưới S2 · xuất tuyến 283" },
  ];
  for (const target of receivedMeters) {
    const reading = meterPayload.readings.find(item => item.meter === target.meter && String(item.channel).toLowerCase() === "kwhnhan");
    if (!reading) throw new Error(`Không tìm thấy ${target.meter} / kWhNhan để tính điện tự dùng.`);
    entries.set(target.fieldCode, { fieldCode: target.fieldCode, value: String(reading.total / 1000), sourceLabel: target.label });
  }
  if (!entries.size) throw new Error("Không tìm thấy dữ liệu nào để đồng bộ.");
  return {
    version: 1,
    operatingDate,
    sourcePage: "QLKT · Đồng bộ tất cả",
    entries: [...entries.values()],
  };
}

async function syncPpa(operatingDate, options = {}) {
  // Luôn mở thẳng địa chỉ cố định của màn hình công tơ, không dùng địa chỉ đã
  // "ghi nhớ" trước đó nữa — địa chỉ ghi nhớ có thể sai hoặc trỏ tới một biến
  // thể khác của trang, gây mất thời gian dò mà không ra dữ liệu.
  return readSource("meter", DEFAULT_METER_URL, operatingDate, options);
}

async function syncHeatRate(operatingDate) {
  // content.js tự đổi dropdown "Tổ máy" trên màn hình Cân bằng nhiệt và đọc lần lượt cả S1 + S2
  // trong 1 lần gọi READ_QLKT_VALUES, nên chỉ cần đọc 1 nguồn "heatrate" duy nhất — không cần mở
  // hoặc chọn lại tổ máy thủ công như trước.
  return readSource("heatrate", DEFAULT_HEATRATE_URL, operatingDate);
}

async function syncBcsxEvents(operatingDate) {
  const { qlktPages = {} } = await chrome.storage.local.get({ qlktPages: {} });
  const url = qlktPages.operation || DEFAULT_OPERATION_URL;
  let tabId;
  let createdTab = false;
  let previousActiveTabId;
  let previousActiveWindowId;
  try {
    {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      previousActiveTabId = currentTab?.id;
      previousActiveWindowId = currentTab?.windowId;
    }
    const openTabs = await chrome.tabs.query({});
    const existingTab = openTabs.find(candidate => {
      try {
        const parsed = new URL(candidate.url || "");
        return QLKT_PATTERN.test(candidate.url || "") && parsed.pathname.toLowerCase().includes("rpt_hour_operation");
      } catch {
        return false;
      }
    });

    let tab;
    if (existingTab?.id) {
      tab = await chrome.tabs.update(existingTab.id, { active: true });
      if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    } else {
      tab = await chrome.tabs.create({ url, active: true });
      createdTab = true;
    }
    tabId = tab.id;
    if (!tabId) throw new Error("Không mở được màn hình Thời gian/tình hình vận hành.");
    await waitForTab(tabId);
    const current = await chrome.tabs.get(tabId);
    if (!QLKT_PATTERN.test(current.url || "")) throw new Error("Phiên đăng nhập QLKT đã hết hạn. Hãy đăng nhập lại rồi thử lại.");

    const prepared = await prepareDateWithRetry(tabId, operatingDate);
    if (!prepared?.ok) throw new Error(prepared?.error || "Không đặt được ngày tại màn hình Vận hành.");
    await wait(prepared.refreshed ? 2500 : 500);

    let result = await sendWithRetry(tabId, { type: "READ_QLKT_EVENTS", operatingDate });
    if (!result?.ok) {
      for (let i = 0; i < 5 && !result?.ok; i++) {
        await wait(600);
        result = await sendWithRetry(tabId, { type: "READ_QLKT_EVENTS", operatingDate });
      }
    }
    if (!result?.ok) throw new Error(result?.error || "Không đọc được nhật ký sự kiện từ màn hình Vận hành.");
    if (result.payload?.operatingDate !== operatingDate) {
      throw new Error(`Màn hình Vận hành đang ở ngày ${result.payload?.operatingDate || "không xác định"}, không phải ngày ${operatingDate}.`);
    }
    return result.payload;
  } finally {
    if (tabId && createdTab) chrome.tabs.remove(tabId).catch(() => {});
    if (previousActiveTabId) chrome.tabs.update(previousActiveTabId, { active: true }).catch(() => {});
    if (previousActiveWindowId) chrome.windows.update(previousActiveWindowId, { focused: true }).catch(() => {});
  }
}

async function syncBcsx(operatingDate) {
  const { qlktPages = {} } = await chrome.storage.local.get({ qlktPages: {} });
  if (!qlktPages.fuel) {
    throw new Error("Chưa ghi nhớ địa chỉ màn hình Nhiên liệu. Hãy mở màn hình đó trên QLKT một lần rồi thử lại.");
  }
  // BCSX chỉ cần 7 số tổng ngày từ Sản lượng + Nhiên liệu và nhật ký từ
  // Vận hành. Không gọi SYNC_ALL vì luồng đó còn đọc các mã không dùng cho
  // BCSX và sẽ mở màn hình Vận hành lần thứ hai.
  const production = await readSource("production", DEFAULT_PRODUCTION_URL, operatingDate);
  const fuel = await readSource("fuel", qlktPages.fuel, operatingDate);
  const eventPayload = await syncBcsxEvents(operatingDate);
  const requiredCodes = ["B", "C", "H", "I", "AE", "AF", "AR"];
  const allEntries = [...(production.entries || []), ...(fuel.entries || [])];
  const byCode = new Map(allEntries.map(entry => [entry.fieldCode, entry]));
  const missingCodes = requiredCodes.filter(code => !byCode.has(code));
  if (missingCodes.length) {
    throw new Error(`QLKT còn thiếu ${missingCodes.length} số liệu BCSX (${missingCodes.join(", ")}).`);
  }
  return {
    version: 1,
    operatingDate,
    sourcePage: "QLKT · BCSX một lượt",
    entries: requiredCodes.map(code => byCode.get(code)),
    s1: eventPayload.s1 || [],
    s2: eventPayload.s2 || [],
    totalCount: eventPayload.totalCount || 0,
  };
}

async function syncPmis02Pd(operatingDate) {
  const { qlktPages = {} } = await chrome.storage.local.get({ qlktPages: {} });
  const url02pd = qlktPages.pmis_02pd || DEFAULT_PMIS_02PD_URL;
  const production = await readSource("production", DEFAULT_PRODUCTION_URL, operatingDate);
  const pmis02pd = await readSource("pmis_02pd", url02pd, operatingDate);
  const entries = new Map();
  (production.entries || []).forEach(entry => {
    const cell = entry.cell || entry.fieldCode;
    if (PMIS_PRODUCTION_CELLS.has(cell)) entries.set(cell, entry);
  });
  (pmis02pd.entries || []).forEach(entry => entries.set(entry.cell || entry.fieldCode, entry));
  const normalizedEntries = [...entries.values()]
    .map(entry => ({ cell: entry.cell || entry.fieldCode, value: String(entry.value ?? "") }))
    .filter(entry => entry.cell && entry.value !== "");
  const received = new Set(normalizedEntries.map(entry => entry.cell));
  const missingProduction = [...PMIS_PRODUCTION_CELLS].filter(cell => !received.has(cell));
  if (missingProduction.length) {
    throw new Error(`Màn hình Sản lượng chưa đọc đủ ${missingProduction.join(", ")}. Tiện ích đã dừng để không ghi thiếu sản lượng QLKT.`);
  }
  return {
    version: 1,
    operatingDate,
    sourcePage: "QLKT · PMIS 02-PĐ & Sản lượng",
    entries: normalizedEntries,
  };
}

async function syncUnified(operatingDate) {
  const ppa = await syncPpa(operatingDate);
  const daily = await syncAll(operatingDate, ppa);
  const heatRate = await syncHeatRate(operatingDate);
  const events = await syncBcsxEvents(operatingDate);
  const pmis02Pd = await syncPmis02Pd(operatingDate);
  return {
    version: 1,
    kind: "unified-sync",
    operatingDate,
    sourcePage: "QLKT · Đồng bộ tổng hợp",
    daily,
    ppa,
    heatRate,
    events,
    pmis02Pd,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "WAIT_QLKT_HEATRATE_READY") {
    waitForHeatRateAjaxForTab(sender)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Chưa xác nhận được tải bảng QLKT." }));
    return true;
  }
  if (message?.type === "SELECT_QLKT_HEATRATE_UNIT") {
    selectHeatRateUnitForTab(sender, message.unit)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Không chuyển được Tổ máy QLKT." }));
    return true;
  }
  const task = message?.type === "SYNC_UNIFIED_QLKT" ? syncUnified
    : message?.type === "SYNC_ALL_QLKT" ? syncAll
    : message?.type === "SYNC_PPA_QLKT" ? date => syncPpa(date, { stoppedUnits: Array.isArray(message.stoppedUnits) ? message.stoppedUnits.filter(unit => ["S1", "S2"].includes(unit)) : [] })
    : message?.type === "SYNC_HEATRATE_QLKT" ? syncHeatRate
    : message?.type === "SYNC_BCSX_QLKT" ? syncBcsx
    : message?.type === "SYNC_BCSX_EVENTS_QLKT" ? syncBcsxEvents
    : message?.type === "SYNC_PMIS_02PD_QLKT" ? syncPmis02Pd
    : null;
  if (!task) return;
  task(message.operatingDate)
    .then(payload => sendResponse({ ok: true, payload }))
    .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Chưa đồng bộ được dữ liệu." }));
  return true;
});
