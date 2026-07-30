// Cầu nối phía web app PXVH1. Luồng QLVT được giữ nguyên như bản 1.0.4 đã
// hoạt động ổn định; LIMS dùng một nhánh message độc lập để tránh hồi quy.
function announceReady() {
  window.postMessage(
    {
      source: "DUYENHAI1_EXTENSION",
      type: "QLVT_EXTENSION_READY",
    },
    window.location.origin
  );
}

function sendRuntimeMessage(message, responseType, requestId, fallbackMessage) {
  try {
    chrome.runtime.sendMessage(message, (result) => {
      const error = chrome.runtime.lastError;
      window.postMessage({
        source: "DUYENHAI1_EXTENSION",
        type: responseType,
        requestId,
        result: error
          ? { ok: false, code: "EXTENSION_CONTEXT_INVALIDATED", message: fallbackMessage }
          : result,
      }, window.location.origin);
    });
  } catch {
    window.postMessage({
      source: "DUYENHAI1_EXTENSION",
      type: responseType,
      requestId,
      result: {
        ok: false,
        code: "EXTENSION_CONTEXT_INVALIDATED",
        message: "Tiện ích vừa được cập nhật. Hãy tải lại trang PXVH1 rồi thử lại.",
      },
    }, window.location.origin);
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "DUYENHAI1_WEB") return;

  if (event.data?.type === "QLVT_EXTENSION_PING") {
    announceReady();
    return;
  }

  if (event.data?.type === "QLVT_SYNC_REQUEST") {
    const requestId = event.data.requestId;
    sendRuntimeMessage(
      { type: "START_QLVT_SYNC" },
      "QLVT_SYNC_RESPONSE",
      requestId,
      "Không gọi được tiện ích đồng bộ QLVT. Hãy tải lại trang PXVH1 rồi thử lại."
    );
    return;
  }

  if (event.data?.type === "LIMS_SYNC_REQUEST") {
    const requestId = event.data.requestId;
    sendRuntimeMessage(
      {
        type: "START_LIMS_SYNC",
        days: event.data.days,
        donVi: event.data.donVi,
        khuVuc: event.data.khuVuc,
      },
      "LIMS_SYNC_RESPONSE",
      requestId,
      "Không gọi được tiện ích đồng bộ LIMS. Hãy tải lại trang PXVH1 rồi thử lại."
    );
  }
});

announceReady();
