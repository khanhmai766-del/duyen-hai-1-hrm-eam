window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "DUYENHAI1_WEB") return;
  if (event.data?.type === "QLVT_EXTENSION_PING") {
    window.postMessage({ source: "DUYENHAI1_EXTENSION", type: "QLVT_EXTENSION_READY" }, window.location.origin);
    return;
  }
  if (event.data?.type !== "QLVT_SYNC_REQUEST") return;
  const requestId = event.data.requestId;

  chrome.runtime.sendMessage({ type: "START_QLVT_SYNC" }, (result) => {
    const error = chrome.runtime.lastError;
    window.postMessage({
      source: "DUYENHAI1_EXTENSION",
      type: "QLVT_SYNC_RESPONSE",
      requestId,
      result: error ? { ok: false, message: "Không gọi được tiện ích đồng bộ QLVT" } : result
    }, window.location.origin);
  });
});

window.postMessage({ source: "DUYENHAI1_EXTENSION", type: "QLVT_EXTENSION_READY" }, window.location.origin);
