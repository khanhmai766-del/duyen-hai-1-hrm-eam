const API_URL = "https://qlvt.tpcduyenhai.com.vn/KiemKeDuyenHai/EBSWebService.asmx/EBS_SelectOnHand_ByTimKiem_ERP";
const PAYLOAD = {
  IDDV: 1,
  SM1: "011600",
  SM2: "000000",
  ORG_ID: "ALL",
  LOC_ID: "",
  ITEM_ID: "",
  ITEM_NAME: ""
};

function normalizedKey(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function readField(row, candidates) {
  const entries = Object.entries(row ?? {});
  for (const candidate of candidates) {
    const found = entries.find(([key]) => normalizedKey(key) === candidate);
    if (found) return found[1];
  }
  return undefined;
}

// QLVT hiển thị theo quy ước Anh-Mỹ: dấu phẩy ngăn hàng nghìn và dấu
// chấm ngăn phần thập phân (7,435 = 7435; 34.015 = 34,015 theo kiểu Việt Nam).
function parseQlvtQuantity(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  const raw = String(value ?? "").trim().replace(/\s+/g, "");
  if (!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(raw)) return Number.NaN;
  return Number(raw.replace(/,/g, ""));
}

function normalizeRows(source) {
  const grouped = new Map();
  for (const row of source) {
    const code = String(readField(row, ["MAVT", "MAVATTU", "ITEMCODE", "ITEMNUMBER"]) ?? "").trim();
    const stock = readField(row, ["TRANSACTIONQUANTITY", "PRIMARYTRANSACTIONQUANTITY", "TONKHO", "SLTON", "SOLUONGTON", "ONHAND", "ONHANDQUANTITY"]);
    const quantity = parseQlvtQuantity(stock);
    if (!code || !Number.isFinite(quantity)) continue;
    const warehouse = String(readField(row, ["KHO", "MAKHO", "KHOCHINH", "SUBINVENTORYCODE", "ORGANIZATIONCODE"]) ?? "").trim();
    const unit = String(readField(row, ["DVT", "DONVITINH", "UNIT", "UOM", "PRIMARYUOMCODE", "PRIMARYUNITOFMEASURE"]) ?? "").trim();
    const current = grouped.get(code) ?? { code, erpStock: 0, warehouses: new Set(), units: new Set() };
    current.erpStock += quantity;
    if (warehouse) current.warehouses.add(warehouse);
    if (unit) current.units.add(unit);
    grouped.set(code, current);
  }
  return [...grouped.values()].map((item) => ({
    code: item.code,
    warehouse: [...item.warehouses].sort().join(", "),
    unit: item.units.size === 1 ? [...item.units][0] : "",
    erpStock: item.erpStock
  }));
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FETCH_QLVT_STOCK") return false;

  (async () => {
    let response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify(PAYLOAD)
      });
    } catch {
      sendResponse({
        ok: false,
        code: "QLVT_NETWORK_ERROR",
        message: "Không kết nối được QLVT. Hãy kiểm tra máy đang dùng mạng công ty rồi thử lại."
      });
      return;
    }

    if (response.status === 401 || response.status === 403) {
      sendResponse({
        ok: false,
        code: "QLVT_SESSION_EXPIRED",
        message: "Phiên QLVT đã hết hạn. Vui lòng đăng nhập lại rồi tiếp tục đồng bộ."
      });
      return;
    }
    if (!response.ok) {
      sendResponse({
        ok: false,
        code: "QLVT_SERVER_ERROR",
        message: `QLVT phản hồi lỗi ${response.status}. Vui lòng thử lại sau.`
      });
      return;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const responseText = await response.text();
    if (response.redirected || contentType.includes("text/html") || /^\s*</.test(responseText)) {
      sendResponse({
        ok: false,
        code: "QLVT_SESSION_EXPIRED",
        message: "Phiên QLVT đã hết hạn. Vui lòng đăng nhập lại rồi tiếp tục đồng bộ."
      });
      return;
    }

    let wrapper;
    try {
      wrapper = JSON.parse(responseText);
    } catch {
      sendResponse({
        ok: false,
        code: "QLVT_RESPONSE_INVALID",
        message: "QLVT trả về dữ liệu không hợp lệ. Vui lòng tải lại trang tồn kho rồi thử lại."
      });
      return;
    }
    const raw = typeof wrapper?.d === "string" ? JSON.parse(wrapper.d) : wrapper?.d;
    if (!Array.isArray(raw)) {
      sendResponse({
        ok: false,
        code: "QLVT_SESSION_EXPIRED",
        message: "Phiên QLVT đã hết hạn hoặc không còn quyền xem tồn kho. Vui lòng đăng nhập lại."
      });
      return;
    }

    const rows = normalizeRows(raw);
    if (!rows.length) {
      const sampleKeys = raw[0] && typeof raw[0] === "object" ? Object.keys(raw[0]).join(", ") : "không có dữ liệu";
      sendResponse({
        ok: false,
        code: "QLVT_DATA_EMPTY",
        message: `QLVT không trả về dòng tồn kho có thể sử dụng (${sampleKeys}). Hệ thống chưa cập nhật dữ liệu.`
      });
      return;
    }
    sendResponse({ ok: true, rows, sourceCount: raw.length, receivedAt: new Date().toISOString() });
  })().catch((error) => sendResponse({
    ok: false,
    code: "QLVT_UNEXPECTED_ERROR",
    message: error?.message || "Không lấy được dữ liệu tồn kho QLVT"
  }));

  return true;
});
