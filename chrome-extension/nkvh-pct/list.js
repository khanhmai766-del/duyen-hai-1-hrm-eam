// Tự đồng bộ trạng thái kết thúc từ danh sách NKVH. Chỉ các dòng có đúng số sổ PXVH1 và trạng thái
// cuối (T-C-N-H: "Khóa phiếu", Điện: "Hoàn thành") mới được gửi; server kiểm tra lại đây là PCT
// nội bộ điện tử đã liên kết NKVH trước khi đóng. Trang chi tiết đã do content.js xử lý.
(() => {
  if (new URLSearchParams(location.search).has("id_pct")) return;
  const KIND = location.pathname.includes("pctd") ? "ELECTRICAL" : location.pathname.includes("pctc") ? "MECHANICAL" : null;
  if (!KIND) return;

  const API = "/api/work-permits/nkvh-claim";
  const expectedStatus = KIND === "ELECTRICAL" ? "hoan thanh" : "khoa phieu";
  const sourceStatus = KIND === "ELECTRICAL" ? "Hoàn thành" : "Khóa phiếu";
  const attempted = new Map();
  let scanning = false;

  const fold = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d").toLowerCase().replace(/\s+/g, " ").trim();

  function api(body) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "NKVH_PCT_API", method: "POST", path: API, body }, (result) => {
          resolve(chrome.runtime.lastError || !result ? { ok: false, message: "Tiện ích vừa được cập nhật. Hãy tải lại trang NKVH." } : result);
        });
      } catch {
        resolve({ ok: false, message: "Tiện ích vừa được cập nhật. Hãy tải lại trang NKVH." });
      }
    });
  }

  function rowsToClose() {
    const rows = [];
    for (const row of document.querySelectorAll("table tbody tr")) {
      const cells = [...row.querySelectorAll(":scope > td")];
      if (!cells.some((cell) => fold(cell.textContent) === expectedStatus)) continue;
      const match = row.textContent.replace(/\s+/g, "").match(/\d{1,80}\/20\d{2}\/VH1-N[ĐD]DH/iu);
      if (match) rows.push(match[0].toUpperCase());
    }
    return [...new Set(rows)];
  }

  function notice(message, error = false) {
    let el = document.getElementById("pxvh1-nkvh-list-sync");
    if (!el) {
      el = document.createElement("div"); el.id = "pxvh1-nkvh-list-sync";
      el.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:420px;padding:10px 12px;border-radius:6px;box-shadow:0 4px 18px #0003;font:13px Verdana,Arial,sans-serif;";
      document.body.append(el);
    }
    el.style.background = error ? "#fee2e2" : "#dcfce7";
    el.style.color = error ? "#991b1b" : "#166534";
    el.textContent = message;
  }

  async function scan() {
    if (scanning || document.hidden) return;
    scanning = true;
    let closed = 0;
    for (const formattedNumber of rowsToClose()) {
      const last = attempted.get(formattedNumber) || 0;
      if (Date.now() - last < 60_000) continue;
      attempted.set(formattedNumber, Date.now());
      const result = await api({ mode: "close", kind: KIND, formattedNumber, sourceStatus });
      if (result.ok && result.data?.status === "CLOSED") closed++;
      else if (!result.ok && result.status !== 404) notice(`Chưa đồng bộ được ${formattedNumber}: ${result.message}`, true);
    }
    if (closed) notice(`Sổ PXVH1: đã tự đồng bộ đóng ${closed} phiếu ${sourceStatus.toLowerCase()} đang hiển thị.`);
    scanning = false;
  }

  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 500);
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) scan(); });
  scan();
})();
