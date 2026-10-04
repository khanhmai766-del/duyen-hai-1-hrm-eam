// Tự đồng bộ trạng thái kết thúc từ danh sách NKVH. Chỉ các dòng có đúng số sổ PXVH1 và trạng thái
// cuối (T-C-N-H: "Khóa phiếu", Điện: "Hoàn thành") mới được gửi; server kiểm tra lại đây là PCT
// nội bộ điện tử đã liên kết NKVH trước khi đóng. Trang chi tiết đã do content.js xử lý.
//
// Chống lệch số (1.0.7): mọi số …/VH1-NĐDH đang hiển thị (kể cả số gõ tay không qua tiện ích) được
// báo về sổ (mode "observe"). Sổ chỉ giữ chỗ số nằm ngay sau số cao nhất nó đang biết, nên "Lấy số PCT"
// lần sau không cấp trùng số đã dùng trên NKVH; số đã có trên sổ được bỏ qua, số nhảy cóc chỉ cảnh báo.
(() => {
  if (new URLSearchParams(location.search).has("id_pct")) return;
  const KIND = location.pathname.includes("pctd") ? "ELECTRICAL" : location.pathname.includes("pctc") ? "MECHANICAL" : null;
  if (!KIND) return;

  const API = "/api/work-permits/nkvh-claim";
  const expectedStatus = KIND === "ELECTRICAL" ? "hoan thanh" : "khoa phieu";
  const sourceStatus = KIND === "ELECTRICAL" ? "Hoàn thành" : "Khóa phiếu";
  const attempted = new Map();
  const observedNumbers = new Set();
  const warnedAhead = new Set();
  let observeFailedAt = 0;
  const NUMBER_PATTERN = /\d{1,80}\/20\d{2}\/VH1-N[ĐD]DH/iu;
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
      const match = row.textContent.replace(/\s+/g, "").match(NUMBER_PATTERN);
      if (match) rows.push(match[0].toUpperCase());
    }
    return [...new Set(rows)];
  }

  /** Mọi dòng có số dạng sổ PXVH1 (mọi trạng thái), kèm id_pct nếu dòng có liên kết tới trang chi tiết. */
  function numbersOnPage() {
    const found = new Map();
    for (const row of document.querySelectorAll("table tbody tr")) {
      const match = row.textContent.replace(/\s+/g, "").match(NUMBER_PATTERN);
      if (!match) continue;
      const formattedNumber = match[0].toUpperCase();
      const link = [...row.querySelectorAll("a[href], [onclick]")].map((el) => `${el.getAttribute("href") || ""} ${el.getAttribute("onclick") || ""}`)
        .join(" ").match(/id_pct=([0-9a-f-]{36})/i);
      if (!found.has(formattedNumber) || link) found.set(formattedNumber, link ? link[1].toLowerCase() : "");
    }
    return [...found].map(([formattedNumber, nkvhPctId]) => ({ formattedNumber, ...(nkvhPctId ? { nkvhPctId } : {}) }));
  }

  /** Báo các số chưa gửi trong phiên này; lỗi mạng thì để lần quét sau gửi lại. */
  async function observe() {
    if (Date.now() - observeFailedAt < 60_000) return;
    const entries = numbersOnPage().filter((entry) => !observedNumbers.has(entry.formattedNumber)).slice(0, 200);
    if (!entries.length) return;
    const result = await api({ mode: "observe", kind: KIND, entries });
    // Lỗi (chưa đăng nhập, máy chủ bản cũ…) → nghỉ 1 phút; không để mỗi lần DOM đổi lại gọi sổ.
    if (!result.ok || !Array.isArray(result.data?.recorded)) { observeFailedAt = Date.now(); return; }
    for (const entry of entries) observedNumbers.add(entry.formattedNumber);
    const ahead = (result.data.ahead || []).filter((item) => !warnedAhead.has(item.formatted));
    for (const item of ahead) warnedAhead.add(item.formatted);
    if (ahead.length) {
      notice(`Sổ PXVH1: số ${ahead.map((item) => item.formatted).join(", ")} trên NKVH vượt dãy sổ (số kế tiếp của sổ là ${ahead[0].expected}). Kiểm tra lại số đã nhập trên NKVH; nếu đúng, báo quản trị đối chiếu mốc sổ.`, true);
    } else if (result.data.recorded.length) {
      notice(`Sổ PXVH1: đã ghi nhận ${result.data.recorded.join(", ")} là số đã dùng trên NKVH (chưa có trên sổ) để không cấp trùng. Mở từng phiếu, bấm "Đồng bộ số hiện có" để đưa vào sổ.`);
    }
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
    // Ghi nhận số trước khi đóng phiếu: đây là phần chặn cấp trùng, không được để lỗi đóng làm lỡ.
    try { await observe(); } catch { /* lần quét sau thử lại */ }
    let closed = 0;
    for (const formattedNumber of rowsToClose()) {
      const last = attempted.get(formattedNumber) || 0;
      if (Date.now() - last < 60_000) continue;
      attempted.set(formattedNumber, Date.now());
      const result = await api({ mode: "close", kind: KIND, formattedNumber, sourceStatus });
      // Phiếu đã đóng từ lần trước vẫn trả về CLOSED để gọi lặp an toàn, nhưng không được tính là
      // vừa đồng bộ; nếu không, mỗi lần mở danh sách lại hiện thông báo đóng lại toàn bộ phiếu cũ.
      if (result.ok && result.data?.status === "CLOSED" && result.data.changed === true) closed++;
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
