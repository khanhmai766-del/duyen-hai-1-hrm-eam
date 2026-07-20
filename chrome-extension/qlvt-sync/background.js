const QLVT_PAGE = "https://qlvt.tpcduyenhai.com.vn/webapp/erp/page/EVN_INV_TONKHO/";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "START_QLVT_SYNC") return false;

  (async () => {
    const tabs = await chrome.tabs.query({ url: "https://qlvt.tpcduyenhai.com.vn/*" });
    if (!tabs.length) {
      sendResponse({
        ok: false,
        code: "QLVT_TAB_MISSING",
        message: "Chưa mở trang QLVT. Hãy mở QLVT, đăng nhập và thử lại.",
        qlvtUrl: QLVT_PAGE
      });
      return;
    }

    const tab = tabs.find((item) => item.url?.includes("EVN_INV_TONKHO")) ?? tabs[0];
    if (!tab.id) throw new Error("Không xác định được tab QLVT");

    try {
      const result = await chrome.tabs.sendMessage(tab.id, { type: "FETCH_QLVT_STOCK" });
      sendResponse(result);
    } catch {
      sendResponse({
        ok: false,
        code: "QLVT_BRIDGE_MISSING",
        message: "Tiện ích chưa kết nối với tab QLVT. Hãy tải lại trang QLVT rồi thử lại.",
        qlvtUrl: QLVT_PAGE
      });
    }
  })().catch((error) => sendResponse({ ok: false, message: error?.message || "Không kết nối được QLVT" }));

  return true;
});
