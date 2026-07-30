const QLVT_PAGE = "https://qlvt.tpcduyenhai.com.vn/webapp/erp/page/EVN_INV_TONKHO/";
const QLVT_ORIGIN = "https://qlvt.tpcduyenhai.com.vn";
const QLVT_PATH = "/webapp/erp/page/EVN_INV_TONKHO/";

// LIMS dùng bộ điều phối riêng. Luồng QLVT bên dưới giữ cấu trúc bản 1.0.4.
const SOURCES = {
  LIMS: {
    page: "https://portal.tpcduyenhai.com.vn/lims.xhtml",
    origin: "https://portal.tpcduyenhai.com.vn",
    path: "/lims.xhtml",
    fetchType: "FETCH_LIMS_OIL_FAILURES",
    label: "kết quả phân tích dầu LIMS",
    expiredCode: "LIMS_SESSION_EXPIRED",
    bridgeMissingCode: "LIMS_BRIDGE_MISSING",
    expiredMessage:
      "Phiên LIMS đã hết hạn. Vui lòng đăng nhập lại rồi bấm “Tiếp tục đồng bộ”.",
    loginMessage:
      "LIMS đang yêu cầu đăng nhập. Sau khi đăng nhập, hãy bấm “Tiếp tục đồng bộ”.",
    bridgeMissingMessage:
      "Không kết nối được với trang LIMS sau khi tải lại. Hãy kiểm tra tiện ích đã được bật.",
  },
};

function isQlvtInventoryUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === QLVT_ORIGIN && parsed.pathname.startsWith(QLVT_PATH);
  } catch {
    return false;
  }
}

function isSourceUrl(source, url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === source.origin && parsed.pathname.startsWith(source.path);
  } catch {
    return false;
  }
}

async function focusTab(tab) {
  if (!tab.id) return;
  await chrome.tabs.update(tab.id, { active: true });
  if (typeof tab.windowId === "number") {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
  }
}

const BRIDGE_READY_TIMEOUT_MS = 120_000;

/** Tab mới có thể báo status=complete trước khi content script document_idle
 *  đăng ký listener. Thử nhẹ tại chỗ thay vì reload tab vừa mở. */
async function sendMessageWhenBridgeReady(tabId, request) {
  const deadline = Date.now() + BRIDGE_READY_TIMEOUT_MS;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await chrome.tabs.sendMessage(tabId, request);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError ?? new Error("Cầu nối trang nguồn chưa sẵn sàng");
}

async function findOrOpenInventoryTab() {
  const tabs = await chrome.tabs.query({ url: `${QLVT_ORIGIN}/*` });
  const inventoryTab = tabs.find((item) => isQlvtInventoryUrl(item.url));
  if (inventoryTab?.id) return { tab: inventoryTab, opened: false };

  const tab = await chrome.tabs.create({ url: QLVT_PAGE, active: true });
  if (!tab.id) throw new Error("Không mở được trang tồn kho QLVT");
  return { tab, opened: true };
}

async function requestStockFromTab(tab, opened) {
  if (!tab.id) throw new Error("Không xác định được tab tồn kho QLVT");

  try {
    if (opened) {
      return await sendMessageWhenBridgeReady(tab.id, { type: "FETCH_QLVT_STOCK" });
    }
    return await chrome.tabs.sendMessage(tab.id, { type: "FETCH_QLVT_STOCK" });
  } catch {
    await chrome.tabs.reload(tab.id);
    try {
      return await sendMessageWhenBridgeReady(tab.id, { type: "FETCH_QLVT_STOCK" });
    } catch {
      // Đọc URL mới nhất sau khi reload để phân biệt hết phiên với bridge lỗi.
    }
    const reloadedTab = await chrome.tabs.get(tab.id);
    if (!isQlvtInventoryUrl(reloadedTab.url)) {
      await focusTab(reloadedTab);
      return {
        ok: false,
        code: "QLVT_SESSION_EXPIRED",
        message: "Phiên QLVT đã hết hạn. Vui lòng đăng nhập lại, mở trang tồn kho rồi bấm “Tiếp tục đồng bộ”.",
        qlvtUrl: QLVT_PAGE
      };
    }
    return {
      ok: false,
      code: "QLVT_BRIDGE_MISSING",
      message: "Không kết nối được với trang tồn kho QLVT sau khi tải lại. Hãy kiểm tra tiện ích đã được bật.",
      qlvtUrl: QLVT_PAGE
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "START_QLVT_SYNC") return false;

  (async () => {
    const { tab, opened } = await findOrOpenInventoryTab();
    if (!tab.id) throw new Error("Không xác định được tab tồn kho QLVT");

    if (!isQlvtInventoryUrl(tab.url)) {
      await focusTab(tab);
      sendResponse({
        ok: false,
        code: "QLVT_SESSION_EXPIRED",
        message: "QLVT đang yêu cầu đăng nhập. Sau khi đăng nhập và mở trang tồn kho, hãy bấm “Tiếp tục đồng bộ”.",
        qlvtUrl: QLVT_PAGE
      });
      return;
    }

    const result = await requestStockFromTab(tab, opened);
    if (!result?.ok && result?.code === "QLVT_SESSION_EXPIRED") await focusTab(tab);
    sendResponse({
      ...result,
      qlvtUrl: result?.ok ? undefined : (result?.qlvtUrl ?? QLVT_PAGE),
      openedQlvtTab: opened
    });
  })().catch((error) => sendResponse({
    ok: false,
    message: error?.message || "Không kết nối được QLVT"
  }));

  return true;
});

async function findOrOpenSourceTab(source) {
  const tabs = await chrome.tabs.query({ url: `${source.origin}/*` });
  const existing = tabs.find((item) => isSourceUrl(source, item.url));
  if (existing?.id) return { tab: existing, opened: false };

  const tab = await chrome.tabs.create({ url: source.page, active: true });
  if (!tab.id) throw new Error(`Không mở được trang ${source.label}`);
  return { tab, opened: true };
}

async function requestFromTab(source, tab, payload, opened) {
  if (!tab.id) throw new Error(`Không xác định được tab ${source.label}`);
  const request = { type: source.fetchType, ...payload };

  try {
    if (opened) return await sendMessageWhenBridgeReady(tab.id, request);
    return await chrome.tabs.sendMessage(tab.id, request);
  } catch {
    // Tab có thể đã mở trước lúc cài/cập nhật tiện ích. Tải lại đúng một lần
    // để content script được nạp, sau đó mới kết luận là không kết nối được.
    await chrome.tabs.reload(tab.id);
    try {
      return await sendMessageWhenBridgeReady(tab.id, request);
    } catch {
      // Đọc URL mới nhất sau khi reload để trả đúng hướng dẫn bên dưới.
    }
    const reloadedTab = await chrome.tabs.get(tab.id);
    if (!isSourceUrl(source, reloadedTab.url)) {
      await focusTab(reloadedTab);
      return {
        ok: false,
        code: source.expiredCode,
        message: source.expiredMessage,
        sourceUrl: source.page
      };
    }
    return {
      ok: false,
      code: source.bridgeMissingCode,
      message: source.bridgeMissingMessage,
      sourceUrl: source.page
    };
  }
}

/** Luồng chung: tìm/mở tab nguồn → nhờ content script đọc → trả kết quả cho web app.
 *  Mọi trường hợp cần người dùng can thiệp (hết phiên, sai khu vực, chưa mở đúng
 *  mục) đều đưa tab nguồn lên trước để họ xử lý rồi bấm "Tiếp tục đồng bộ". */
async function runSync(source, payload, sendResponse) {
  const { tab, opened } = await findOrOpenSourceTab(source);
  if (!tab.id) throw new Error(`Không xác định được tab ${source.label}`);

  if (!isSourceUrl(source, tab.url)) {
    await focusTab(tab);
    sendResponse({
      ok: false,
      code: source.expiredCode,
      message: source.loginMessage,
      sourceUrl: source.page
    });
    return;
  }

  const result = await requestFromTab(source, tab, payload, opened);
  if (!result?.ok) await focusTab(tab);
  sendResponse({
    ...result,
    sourceUrl: result?.ok ? undefined : (result?.sourceUrl ?? source.page),
    // Giữ tên cũ để không phá bản web đang chạy.
    qlvtUrl: result?.ok ? undefined : (result?.qlvtUrl ?? source.page),
    openedSourceTab: opened,
    openedQlvtTab: opened
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "START_LIMS_SYNC") return false;
  const source = SOURCES.LIMS;
  const payload = { days: message.days, donVi: message.donVi, khuVuc: message.khuVuc };

  runSync(source, payload, sendResponse).catch((error) =>
    sendResponse({ ok: false, message: error?.message || "Không kết nối được kết quả phân tích dầu LIMS" })
  );

  return true;
});
