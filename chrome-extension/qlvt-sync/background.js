const QLVT_PAGE = "https://qlvt.tpcduyenhai.com.vn/webapp/erp/page/EVN_INV_TONKHO/";
const QLVT_ORIGIN = "https://qlvt.tpcduyenhai.com.vn";
const QLVT_PATH = "/webapp/erp/page/EVN_INV_TONKHO/";
const TAB_LOAD_TIMEOUT_MS = 30_000;

function isQlvtInventoryUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === QLVT_ORIGIN && parsed.pathname.startsWith(QLVT_PATH);
  } catch {
    return false;
  }
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("QLVT tải trang quá lâu"));
    }, TAB_LOAD_TIMEOUT_MS);

    function finish(tab) {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(tab);
    }

    function onUpdated(updatedTabId, changeInfo, tab) {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish(tab);
    }

    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish(tab);
    }).catch((error) => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(error);
    });
  });
}

async function focusTab(tab) {
  if (!tab.id) return;
  await chrome.tabs.update(tab.id, { active: true });
  if (typeof tab.windowId === "number") {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
  }
}

async function findOrOpenInventoryTab() {
  const tabs = await chrome.tabs.query({ url: `${QLVT_ORIGIN}/*` });
  const inventoryTab = tabs.find((item) => isQlvtInventoryUrl(item.url));
  if (inventoryTab?.id) return { tab: inventoryTab, opened: false };

  const tab = await chrome.tabs.create({ url: QLVT_PAGE, active: true });
  if (!tab.id) throw new Error("Không mở được trang tồn kho QLVT");
  const loadedTab = await waitForTabComplete(tab.id);
  return { tab: loadedTab, opened: true };
}

async function requestStockFromTab(tab) {
  if (!tab.id) throw new Error("Không xác định được tab tồn kho QLVT");

  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "FETCH_QLVT_STOCK" });
  } catch {
    // Tab có thể đã mở trước lúc cài/cập nhật tiện ích. Tải lại đúng một lần
    // để content script được nạp, sau đó mới kết luận là không kết nối được.
    await chrome.tabs.reload(tab.id);
    const reloadedTab = await waitForTabComplete(tab.id);
    if (!isQlvtInventoryUrl(reloadedTab.url)) {
      await focusTab(reloadedTab);
      return {
        ok: false,
        code: "QLVT_SESSION_EXPIRED",
        message: "Phiên QLVT đã hết hạn. Vui lòng đăng nhập lại, mở trang tồn kho rồi bấm “Tiếp tục đồng bộ”.",
        qlvtUrl: QLVT_PAGE
      };
    }
    try {
      return await chrome.tabs.sendMessage(tab.id, { type: "FETCH_QLVT_STOCK" });
    } catch {
      return {
        ok: false,
        code: "QLVT_BRIDGE_MISSING",
        message: "Không kết nối được với trang tồn kho QLVT sau khi tải lại. Hãy kiểm tra tiện ích đã được bật.",
        qlvtUrl: QLVT_PAGE
      };
    }
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

    const result = await requestStockFromTab(tab);
    if (!result?.ok && result?.code === "QLVT_SESSION_EXPIRED") await focusTab(tab);
    sendResponse({
      ...result,
      qlvtUrl: result?.ok ? undefined : (result?.qlvtUrl ?? QLVT_PAGE),
      openedQlvtTab: opened
    });
  })().catch((error) => sendResponse({ ok: false, message: error?.message || "Không kết nối được QLVT" }));

  return true;
});
