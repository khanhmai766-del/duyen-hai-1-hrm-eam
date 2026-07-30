// Cầu nối LIMS trong ISOLATED world. Chỉ file này dùng chrome.runtime; mọi
// thao tác với PF / PrimeFaces / jQuery được chuyển sang bridge-lims-page.js
// trong MAIN world bằng message có requestId và kiểm tra cùng origin.
(() => {
  const PAGE_REQUEST = "DUYENHAI1_LIMS_PAGE_REQUEST";
  const PAGE_RESPONSE = "DUYENHAI1_LIMS_PAGE_RESPONSE";
  // Chỉ tính thời gian xử lý BÊN TRONG tab LIMS. Thời gian service worker mở/
  // tải tab nguồn được tính riêng, nên timeout phía web phải dài hơn mốc này.
  const PAGE_TIMEOUT_MS = 120_000;

  function createRequestId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "FETCH_LIMS_OIL_FAILURES") return false;

    const requestId = createRequestId();
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onPageResponse);
      sendResponse(result);
    }

    function onPageResponse(event) {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        event.data?.source !== "DUYENHAI1_LIMS_PAGE" ||
        event.data?.type !== PAGE_RESPONSE ||
        event.data?.requestId !== requestId
      ) return;
      finish(event.data.result ?? {
        ok: false,
        code: "LIMS_EMPTY_RESPONSE",
        message: "Trang LIMS không trả về kết quả đồng bộ.",
      });
    }

    const timeout = window.setTimeout(() => {
      finish({
        ok: false,
        code: "LIMS_PAGE_BRIDGE_TIMEOUT",
        message: "Không kết nối được bộ điều khiển trang LIMS. Hãy tải lại trang LIMS rồi thử lại.",
      });
    }, PAGE_TIMEOUT_MS);

    window.addEventListener("message", onPageResponse);
    window.postMessage({
      source: "DUYENHAI1_LIMS_EXTENSION",
      type: PAGE_REQUEST,
      requestId,
      payload: {
        days: message.days,
        donVi: message.donVi,
        khuVuc: message.khuVuc,
      },
    }, window.location.origin);

    return true;
  });
})();
