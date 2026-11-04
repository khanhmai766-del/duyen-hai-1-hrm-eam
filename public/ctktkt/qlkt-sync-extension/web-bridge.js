(() => {
  if (!/^(?:\/|\/ppa-heat-rate\/?|\/pmis-report\/?|\/bcsx-report\/?|\/ctktkt-report\/?)$/.test(window.location.pathname.replace(/^\/tien-ich\/chi-tieu-ktkt/, "") || "/")) return;
  const channel = "ctktkt-qlkt-sync";
  const post = message => window.postMessage({ channel, sender: "ctktkt-extension", ...message }, window.location.origin);

  window.addEventListener("message", async event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.channel !== channel || message.sender !== "ctktkt-web") return;
    if (message.type === "PING") {
      post({ type: "READY", version: chrome.runtime.getManifest().version });
      return;
    }
    const runtimeType = message.type === "SYNC_UNIFIED" ? "SYNC_UNIFIED_QLKT"
      : message.type === "SYNC_PPA" ? "SYNC_PPA_QLKT"
      : message.type === "SYNC_HEATRATE" ? "SYNC_HEATRATE_QLKT"
      : message.type === "SYNC_BCSX" ? "SYNC_BCSX_QLKT"
      : message.type === "SYNC_BCSX_EVENTS" ? "SYNC_BCSX_EVENTS_QLKT"
      : message.type === "SYNC_PMIS_02PD" ? "SYNC_PMIS_02PD_QLKT"
      : message.type === "SYNC_ALL" ? "SYNC_ALL_QLKT"
      : "";
    const resultType = message.type === "SYNC_UNIFIED" ? "SYNC_UNIFIED_RESULT"
      : message.type === "SYNC_PPA" ? "SYNC_PPA_RESULT"
      : message.type === "SYNC_HEATRATE" ? "SYNC_HEATRATE_RESULT"
      : message.type === "SYNC_BCSX" ? "SYNC_BCSX_RESULT"
      : message.type === "SYNC_BCSX_EVENTS" ? "SYNC_BCSX_EVENTS_RESULT"
      : message.type === "SYNC_PMIS_02PD" ? "SYNC_PMIS_02PD_RESULT"
      : "SYNC_ALL_RESULT";
    if (!runtimeType || !/^\d{4}-\d{2}-\d{2}$/.test(String(message.operatingDate || ""))) return;
    try {
      const result = await chrome.runtime.sendMessage({ type: runtimeType, operatingDate: message.operatingDate,
        ...(message.type === "SYNC_PPA" ? { stoppedUnits: Array.isArray(message.stoppedUnits) ? message.stoppedUnits.filter(unit => ["S1", "S2"].includes(unit)) : [] } : {}) });
      post({ type: resultType, requestId: message.requestId, result });
    } catch (error) {
      post({ type: resultType, requestId: message.requestId, result: { ok: false, error: error instanceof Error ? error.message : "Không kết nối được với tiện ích QLKT." } });
    }
  });

  post({ type: "READY", version: chrome.runtime.getManifest().version });
})();
