// MAIN world: chỉ báo kết quả lưu, không gọi API sổ và không bấm nút NKVH.
(() => {
  let pending = null;
  const fold = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/\s+/g, " ").trim();
  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("button, input[type=submit]") : null;
    if (!button || button.closest(".ui-dialog, #pxvh1-nkvh-pct") || !button.closest("#formContent")) return;
    if (!/^(luu|luu phieu|cap phieu)$/.test(fold(button.textContent || button.value))) return;
    pending = { id: button.id, at: Date.now() };
  }, true);
  let tries = 0;
  const attach = () => {
    if (typeof window.jQuery !== "function") {
      if (++tries < 80) setTimeout(attach, 250);
      return;
    }
    window.jQuery(document).on("pfAjaxComplete.pxvh1Save", (_event, xhr, settings) => {
      if (!pending || Date.now() - pending.at > 30_000) return;
      const parameters = typeof settings?.data === "string" ? new URLSearchParams(settings.data) : null;
      const source = parameters?.get("javax.faces.source") || parameters?.get("jakarta.faces.source");
      if (source && source !== pending.id) return;
      const xml = xhr?.responseXML;
      if (!xml || xhr.status < 200 || xhr.status >= 300 || xml.querySelector("error")) return;
      const raw = xml.documentElement.textContent || "";
      if (/"validationFailed"\s*:\s*true/.test(raw)) { pending = null; return; }
      // Chỉ xét thông báo trả về của request này; không lấy growl thành công cũ trên trang.
      const fragments = [...xml.querySelectorAll("update")].map(update => update.textContent || "").join(" ");
      const response = new DOMParser().parseFromString(fragments, "text/html");
      const message = fold([...response.querySelectorAll(".ui-growl-message, .ui-messages-info, .ui-message-info")].map(el => el.textContent).join(" "));
      if (!/(luu|cap|ghi).*(thanh cong)|da luu/.test(message)) return;
      pending = null;
      window.postMessage({ type: "PXVH1_NKVH_SAVED", version: 1 }, location.origin);
    });
  };
  attach();
})();
