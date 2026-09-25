// Chạy trên trang chi tiết PCT của NKVH (pctc_ct = sổ T-C-N-H, pctd_ct = sổ Điện).
//
// Gắn nút "Lấy số PCT" ngay cạnh ô Số phiếu. Bấm → hỏi Tổ máy + Cương vị → sổ PXVH1 cấp số tiếp
// theo và ghi phiếu nội bộ vào sổ theo nội dung NKVH đang hiện → điền số vào ô Số phiếu. Tiện ích
// KHÔNG BAO GIỜ bấm Lưu trên NKVH: VHV kiểm tra rồi tự lưu.
// Trang phiếu đã hủy chỉ hiện "Báo hủy về sổ"; số đã hủy bị bỏ, phiếu tạo lại lấy số mới.
//
// Cách tìm ô trên trang (xem README): chỉ tin các id do lập trình viên NKVH đặt (txtSoPhieu, city2,
// pngLoaiPhieu, id_endDateKH, dtThietBi); id tự sinh j_idtNNN khác nhau giữa hai sổ và có thể đổi
// khi NKVH sửa trang, nên các ô còn lại tìm theo NHÃN chữ (đã bỏ dấu, đ→d).
(() => {
  const KIND = location.pathname.includes("/pctd_ct") ? "ELECTRICAL" : "MECHANICAL";
  const PCT_ID = (new URLSearchParams(location.search).get("id_pct") || "").toLowerCase();
  const TOOLBAR_ID = "pxvh1-nkvh-pct";
  const API = "/api/work-permits/nkvh-claim";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(PCT_ID)) return;

  const state = { loading: true, permit: null, cancelledPermit: null, positions: [], units: {}, panel: false, unit: null, position: null, busy: false, message: "", tone: "info" };

  // ---------- Đọc trang NKVH ----------
  const fold = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d").toLowerCase().replace(/\s+/g, " ").trim();
  const form = () => document.getElementById("formContent");
  const numberInput = () => document.getElementById("formContent:txtSoPhieu");
  const outsideDialog = (el) => !el.closest(".ui-dialog");
  const cells = () => [...(form()?.querySelectorAll(".ui-panelgrid-cell") || [])].filter(outsideDialog);
  const isLabelCell = (cell) => !cell.querySelector("input, select, textarea, table");
  /** Ô giá trị nằm ngay sau ô nhãn (bố cục "Nhãn: | giá trị" của PrimeFaces panelGrid). */
  const valueCell = (pattern) => cells().find((cell) => isLabelCell(cell) && pattern.test(fold(cell.textContent)))?.nextElementSibling || null;
  // Phiếu đã ký/đã hủy: NKVH bỏ ô chọn, chỉ in chữ ("1052 - Nguyễn Quốc Thái") → đọc chữ của ô.
  const selectedText = (cell) => {
    if (!cell) return "";
    const hasMenu = cell.querySelector("select, .ui-selectonemenu");
    const option = cell.querySelector("select option:checked");
    const value = hasMenu ? option?.textContent || cell.querySelector(".ui-selectonemenu-label")?.textContent || "" : cell.textContent;
    return value.replace(/\u00a0/g, " ").trim();
  };

  /**
   * Dòng đỏ NKVH in phía trên ô Số phiếu (đã thấy cả hai trên trang thật): "Phiếu đã hủy. Lý do: …" và
   * "Phiếu đã dừng. Lý do: … ." (NKVH thêm " ." cuối — bị cắt). Luồng dừng vẫn giữ nút xác nhận dự phòng
   * (pendingStopPrompt) phòng khi NKVH không vẽ lại dòng đỏ ngay. Trả về { action: "cancel"|"stop", reason } hoặc null.
   */
  function pageNotice() {
    for (const el of form()?.querySelectorAll("span") || []) {
      if (!outsideDialog(el)) continue;
      const match = fold(el.textContent).match(/^phieu (?:da |bi )*(huy|dung)\b/);
      if (!match) continue;
      const reason = (el.textContent.replace(/\s+/g, " ").trim().match(/L[ýy]\s*do[^:]*:\s*(.*)$/i)?.[1] || "").replace(/[\s.]+$/, "").trim();
      return { action: match[1] === "huy" ? "cancel" : "stop", reason };
    }
    return null;
  }
  /** Lý do hủy nếu trang là phiếu đã hủy, ngược lại null. */
  const cancelNotice = () => { const notice = pageNotice(); return notice?.action === "cancel" ? notice.reason : null; };

  // Đơn vị QLVH của phiếu: mã "VH" = Phân xưởng Vận hành 1 (mã do NKVH đặt, xem README). Phiếu của phân
  // xưởng khác (ví dụ "VH3" = PXVH2, số dạng …/VH2-NĐDH) không thuộc sổ PXVH1 → tiện ích đứng ngoài.
  const OWN_QLVH = "VH";
  function qlvh() {
    const option = valueCell(/^don vi qlvh:?$/)?.querySelector("select option:checked");
    return { code: option?.value || "", label: option?.textContent.trim() || "" };
  }
  /** Nhãn phân xưởng khác nếu phiếu không thuộc PXVH1; chưa đọc được ô QLVH thì coi như của PXVH1. */
  const foreignQlvh = () => { const unit = qlvh(); return unit.code && unit.code !== OWN_QLVH ? unit.label || unit.code : null; };

  /** Số NKVH tự sinh ("2392/2026/NĐDH-VH1") — khác dạng số của sổ ("1234/2026/VH1-NĐDH"). */
  const isNkvhAutoNumber = (value) => /^\d+\/\d{4}\/nddh-vh\d*$/.test(fold(value));

  // ---------- Hộp thoại Hủy/Dừng phiếu của NKVH ----------
  // NKVH dùng CHUNG hộp #formContent:dlgHuyPhieu cho "Hủy phiếu" (phiếu ra sai) và "Dừng phiếu" (đang
  // thực hiện thì xảy ra sự cố thiết bị / tai nạn lao động); tiêu đề hộp đổi theo: "Xác nhận hủy phiếu"
  // / "Xác nhận dừng phiếu". VHV bấm Lưu trong hộp → lưu {thao tác, lý do} vào sessionStorage (sống qua
  // cả lần NKVH tải lại trang). Khi dòng đỏ của NKVH xuất hiện (NKVH đã lưu xong) → tự báo về sổ:
  //   Hủy → sổ Hủy, số bị bỏ.   Dừng → sổ Tạm dừng, số GIỮ (công việc đã diễn ra).
  // NKVH từ chối (thiếu lý do…) thì không có dòng đỏ, không làm gì. Tiện ích chỉ nghe click, không bao
  // giờ bấm nút nào của NKVH.
  const CANCEL_DIALOG = "formContent:dlgHuyPhieu";
  const PENDING_KEY = `pxvh1-nkvh-cancel:${PCT_ID}`;
  const PENDING_TTL = 10 * 60 * 1000;
  // Sau Lưu mà chưa thấy dòng đỏ "đã dừng" (NKVH chưa vẽ lại trang) → hiện nút xác nhận một chạm.
  const PROMPT_DELAY = 4000;
  const NOTE_ID = "pxvh1-nkvh-cancel-note";
  let dialogAction = null; // nút vừa mở hộp: "cancel" | "stop"
  const cancelDialog = () => document.getElementById(CANCEL_DIALOG);
  /** Thao tác của hộp: theo tiêu đề hộp (NKVH vẽ lại khi mở); chưa có tiêu đề thì theo nút vừa bấm. */
  function dialogKind() {
    const title = fold(cancelDialog()?.querySelector(".ui-dialog-title")?.textContent);
    return /dung phieu/.test(title) ? "stop" : /huy phieu/.test(title) ? "cancel" : dialogAction;
  }

  function pendingAction() {
    try {
      const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
      return value && Date.now() - value.at < PENDING_TTL ? value : null;
    } catch { return null; }
  }
  function setPending(value) {
    // Lỗi sessionStorage chỉ làm mất phần tự báo; nút báo về sổ vẫn còn.
    try { value ? sessionStorage.setItem(PENDING_KEY, JSON.stringify(value)) : sessionStorage.removeItem(PENDING_KEY); } catch { /* bỏ qua */ }
  }

  document.addEventListener("click", (event) => {
    const btn = event.target instanceof Element ? event.target.closest("button") : null;
    if (!btn) return;
    const label = fold(btn.textContent);
    if (btn.closest(`[id="${CANCEL_DIALOG}"]`)) {
      const action = dialogKind();
      if (label === "luu" && action) {
        setPending({ action, reason: cancelDialog()?.querySelector("textarea")?.value.trim() || "", at: Date.now() });
        setTimeout(render, PROMPT_DELAY + 100);
      }
      return;
    }
    if (label === "huy phieu") dialogAction = "cancel";
    else if (label === "dung phieu") dialogAction = "stop";
    else return;
    renderDialogNote();
  }, true);

  /** Dòng nhắc trong hộp Hủy/Dừng phiếu: VHV biết trước sổ PXVH1 sẽ làm gì khi bấm Lưu. */
  function renderDialogNote() {
    const content = cancelDialog()?.querySelector(".ui-dialog-content");
    let note = document.getElementById(NOTE_ID);
    const permit = state.permit;
    const text = !content || !permit ? "" : dialogKind() === "stop"
      ? permit.status === "PAUSED"
        ? `Sổ PXVH1: phiếu ${permit.formatted} đã ghi Tạm dừng trên sổ.`
        : `Sổ PXVH1: bấm Lưu thì phiếu ${permit.formatted} trên sổ chuyển Tạm dừng, lý do như ô bên dưới. Số PCT vẫn giữ (không bỏ như khi hủy).`
      : `Sổ PXVH1: bấm Lưu thì phiếu ${permit.formatted} trên sổ được hủy theo, lý do như ô bên dưới. Số này bị bỏ, không cấp lại.`;
    if (!text) { note?.remove(); return; }
    if (!note || !content.contains(note)) {
      note?.remove();
      note = h("div", { id: NOTE_ID, style: "margin:0 0 8px;padding:6px 8px;border:1px solid #bfdbfe;border-radius:4px;background:#eff6ff;color:#1e3a8a;font:12px Verdana,Arial,sans-serif;" });
      content.prepend(note);
    }
    // Chỉ ghi khi đổi chữ: ghi lại y nguyên vẫn sinh mutation → MutationObserver chạy vòng tròn.
    if (note.textContent !== text) note.textContent = text;
  }

  /** NKVH vừa hủy/dừng xong (có dòng đỏ) sau khi VHV bấm Lưu trong hộp → tự báo về sổ. */
  function maybeAutoReport() {
    if (foreignQlvh()) return;
    const pending = pendingAction();
    if (!pending || state.loading || state.busy) return;
    const notice = pageNotice();
    if (!notice) return;
    setPending(null);
    if (!state.permit) return;
    const reason = notice.reason || pending.reason;
    if (notice.action === "cancel") reportCancel({ auto: true, reason });
    else if (state.permit.status !== "PAUSED") reportStop({ auto: true, reason });
  }

  /** Đã Lưu "Dừng phiếu" quá PROMPT_DELAY mà chưa thấy dòng đỏ → cần VHV xác nhận một chạm. */
  function pendingStopPrompt() {
    const pending = pendingAction();
    return pending?.action === "stop" && pending.reason && Date.now() - pending.at >= PROMPT_DELAY
      && !pageNotice() && state.permit && state.permit.status !== "PAUSED" ? pending : null;
  }

  function currentStep() {
    const cell = cells().find((item) => /^trang thai b\d+:?$/.test(fold(item.textContent)));
    const match = cell && fold(cell.textContent).match(/b(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function textareas() {
    const found = {};
    let pending = null;
    for (const el of form()?.querySelectorAll(".ui-panelgrid-cell, textarea") || []) {
      if (!outsideDialog(el)) continue;
      if (el.tagName === "TEXTAREA") {
        if (pending && !found[pending]) found[pending] = el;
        pending = null;
        continue;
      }
      if (!isLabelCell(el)) continue;
      const label = fold(el.textContent);
      pending = /dia diem/.test(label) ? "location" : /noi dung/.test(label) ? "content" : /^pham vi/.test(label) ? "workScope" : null;
    }
    return found;
  }

  function plannedTimes() {
    const end = document.getElementById("formContent:id_endDateKH_input");
    const inputs = [...(end?.closest("tr")?.querySelectorAll(".ui-calendar input") || [])];
    return { start: inputs.find((input) => input !== end)?.value || "", end: end?.value || "" };
  }

  function readPage() {
    const areas = textareas();
    const devices = [...document.querySelectorAll("#formContent\\:dtThietBi_data tr:not(.ui-datatable-empty-message)")]
      .map((row) => [...row.cells].slice(0, 2).map((cell) => cell.textContent.trim()).filter(Boolean).join(" - ")).filter(Boolean);
    const team = valueCell(/^don vi cong tac:?$/)?.querySelector("select option:checked");
    const disciplines = [...(document.getElementById("formContent:pngLoaiPhieu")?.querySelectorAll("td") || [])]
      .filter((td) => td.querySelector("input[type=checkbox]")?.checked || td.querySelector(".ui-chkbox-box.ui-state-active"))
      .map((td) => td.textContent.trim());
    const times = plannedTimes();
    return {
      step: currentStep(),
      registrationNumber: valueCell(/^so phieu dkct:?$/)?.textContent.trim() || "",
      teamCode: team?.value || "",
      teamLabel: team?.textContent.trim() || "",
      qlvhCode: qlvh().code,
      classification: form()?.querySelector('input[name="formContent:city2"]:checked')?.value || "",
      disciplines,
      location: areas.location?.value.trim() || devices.join("; "),
      content: areas.content?.value.trim() || "",
      workScope: areas.workScope?.value.trim() || "",
      plannedStartAt: times.start,
      plannedEndAt: times.end,
      commanderName: selectedText(valueCell(/nguoi chi huy truc tiep/)),
      leaderName: selectedText(valueCell(/nguoi lanh dao cong viec/)),
      workerCount: valueCell(/so luong nhan vien/)?.querySelector("input")?.value.trim() || "",
      issuerName: valueCell(/^nguoi cap phieu:?$/)?.textContent.trim() || "",
    };
  }

  /** Đoán tổ máy từ địa điểm/nội dung ("…S1…", KKS "10HFB…" = tổ 1) — chỉ để chọn sẵn, VHV vẫn xác nhận. */
  function guessUnit(page) {
    const value = `${page.location} ${page.content}`.toUpperCase();
    if (/(^|[^A-Z0-9])S1([^0-9]|$)/.test(value)) return "S1";
    if (/(^|[^A-Z0-9])S2([^0-9]|$)/.test(value)) return "S2";
    const kks = value.match(/(^|[^0-9A-Z])([12])0[A-Z]{3}\s?\d{2}/);
    return kks ? `S${kks[2]}` : "";
  }

  function fillNumber(value) {
    const input = numberInput();
    if (!input) return false;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.style.transition = "background-color .6s";
    input.style.backgroundColor = "#dcfce7";
    setTimeout(() => { input.style.backgroundColor = ""; }, 1800);
    return true;
  }

  // ---------- Gọi sổ PXVH1 qua service worker ----------
  function api(method, path, body) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "NKVH_PCT_API", method, path, body }, (result) => {
          if (chrome.runtime.lastError || !result) {
            resolve({ ok: false, message: "Tiện ích vừa được cập nhật. Hãy tải lại trang NKVH rồi thử lại." });
          } else resolve(result);
        });
      } catch {
        resolve({ ok: false, message: "Tiện ích vừa được cập nhật. Hãy tải lại trang NKVH rồi thử lại." });
      }
    });
  }

  async function load() {
    if (foreignQlvh()) { state.loading = false; render(); return; }
    state.loading = true; render();
    const result = await api("GET", `${API}?kind=${KIND}&nkvhPctId=${PCT_ID}`);
    state.loading = false;
    if (result.ok) {
      state.permit = result.data.permit;
      state.cancelledPermit = result.data.cancelledPermit || null;
      state.positions = result.data.positions || [];
      state.units = result.data.units || {};
      state.message = "";
    } else {
      state.message = result.message; state.tone = "error";
    }
    render();
  }

  function say(message, tone = "info") { state.message = message; state.tone = tone; render(); }

  async function openPanel() {
    const input = numberInput();
    if (currentStep() !== 1) return say("Hãy mở bước B1 (Cấp phiếu) rồi bấm lại.", "error");
    if (input?.readOnly || input?.disabled) return say("Ô Số phiếu đang bị khoá trên NKVH, không điền được.", "error");
    const current = input?.value.trim() || "";
    // Số NKVH tự sinh thì cho thay thẳng (có hỏi); số khác (gõ tay theo dạng sổ…) vẫn không ghi đè.
    if (current && !isNkvhAutoNumber(current)) return say(`Ô Số phiếu đã có “${current}”. Nếu muốn lấy số từ sổ PXVH1, hãy xoá ô này rồi bấm lại.`, "error");
    if (current && !confirm(`Ô Số phiếu đang có số NKVH tự sinh “${current}”.\nLấy số từ sổ PXVH1 sẽ thay số này. Tiếp tục?`)) return;
    state.panel = true; state.message = ""; render();
  }

  async function claim(unit, position) {
    const page = readPage();
    if (page.step !== 1) return say("Hãy mở bước B1 (Cấp phiếu) rồi bấm lại.", "error");
    if (!unit || !position) return say("Vui lòng chọn Tổ máy và Cương vị.", "error");
    state.busy = true; render();
    try { await chrome.storage.local.set({ lastPosition: position }); } catch { /* chỉ là ghi nhớ tiện lợi */ }
    const result = await api("POST", API, { mode: "claim", kind: KIND, nkvhPctId: PCT_ID, unit, position, page });
    state.busy = false;
    if (!result.ok) return say(result.message, "error");
    state.permit = result.data; state.panel = false;
    fillNumber(result.data.formatted);
    say(result.data.created
      ? `Đã lấy số ${result.data.formatted} và điền vào ô Số phiếu. Kiểm tra lại rồi bấm Lưu trên NKVH.`
      : `Phiếu này đã có số ${result.data.formatted} trên sổ — đã điền lại vào ô Số phiếu.`, "success");
  }

  /** `auto`: VHV vừa xác nhận hủy trên NKVH nên không hỏi lại; lỗi thì nút "Báo hủy về sổ" vẫn còn để bấm lại. */
  async function reportCancel(options = {}) {
    const reason = options.reason ?? cancelNotice();
    if (reason === null || !state.permit) return;
    if (!options.auto && !confirm(`Hủy phiếu ${state.permit.formatted} trên sổ PXVH1?\nLý do theo NKVH: ${reason || "(không ghi)"}`)) return;
    state.busy = true; render();
    const result = await api("POST", API, { mode: "cancel", kind: KIND, nkvhPctId: PCT_ID, reason });
    state.busy = false;
    if (!result.ok) return say(`${options.auto ? "Chưa tự hủy được phiếu trên sổ: " : ""}${result.message}${options.auto ? " — bấm Báo hủy về sổ để thử lại." : ""}`, "error");
    state.permit = null; state.cancelledPermit = result.data;
    say(`${options.auto ? "Đã tự hủy" : "Đã hủy"} phiếu ${result.data.formatted} trên sổ PXVH1 theo NKVH. Số này bị bỏ; phiếu tạo lại trên NKVH bấm Lấy số PCT để lấy số mới.`, "success");
  }

  /** Phiếu dừng trên NKVH → sổ Tạm dừng (số giữ). `auto`: VHV vừa xác nhận trên NKVH nên không hỏi lại. */
  async function reportStop(options = {}) {
    if (!state.permit) return;
    const reason = options.reason ?? (pageNotice()?.reason || pendingAction()?.reason || "");
    if (!options.auto && !confirm(`Ghi phiếu ${state.permit.formatted} trên sổ PXVH1 là Tạm dừng?\nLý do: ${reason || "(không ghi)"}\n\nChỉ bấm khi NKVH đã lưu Dừng phiếu.`)) return;
    state.busy = true; render();
    const result = await api("POST", API, { mode: "stop", kind: KIND, nkvhPctId: PCT_ID, reason });
    state.busy = false;
    if (!result.ok) return say(`${options.auto ? "Chưa tự ghi Tạm dừng được trên sổ: " : ""}${result.message}${options.auto ? " — bấm Báo dừng về sổ để thử lại." : ""}`, "error");
    // Máy chủ sổ bản cũ không biết mode "stop" và rơi vào nhánh lấy số (trả phiếu cũ) → không báo nhầm là đã dừng.
    if (result.data?.status !== "PAUSED") return say("Sổ PXVH1 chưa hỗ trợ báo dừng (máy chủ chưa cập nhật). Báo quản trị cập nhật sổ rồi bấm Báo dừng về sổ lại.", "error");
    setPending(null);
    state.permit = result.data;
    say(`${options.auto ? "Đã tự ghi" : "Đã ghi"} phiếu ${result.data.formatted} trên sổ PXVH1 là Tạm dừng (dừng trên NKVH). Số PCT vẫn giữ.`, "success");
  }

  async function sync() {
    const page = readPage();
    if (page.step !== 1) return say("Hãy mở bước B1 (Cấp phiếu) để đồng bộ nội dung phiếu.", "error");
    state.busy = true; render();
    const result = await api("POST", API, { mode: "sync", kind: KIND, nkvhPctId: PCT_ID, page });
    state.busy = false;
    if (!result.ok) return say(result.message, "error");
    state.permit = result.data;
    say(`Đã cập nhật nội dung phiếu ${result.data.formatted} về sổ PXVH1.`, "success");
  }

  // ---------- Giao diện gắn cạnh ô Số phiếu ----------
  function h(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "style") el.style.cssText = value;
      else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else if (value !== undefined && value !== null) el[key] = value;
    }
    for (const child of [].concat(children)) if (child) el.append(child);
    return el;
  }
  const BTN = "margin-left:6px;padding:3px 10px;border:1px solid #1d4ed8;border-radius:4px;background:#1d4ed8;color:#fff;font:12px Verdana,Arial,sans-serif;cursor:pointer;";
  const BTN_LIGHT = "margin-left:6px;padding:3px 10px;border:1px solid #94a3b8;border-radius:4px;background:#fff;color:#0f172a;font:12px Verdana,Arial,sans-serif;cursor:pointer;";
  const TONES = { info: "#334155", success: "#047857", error: "#b91c1c" };

  function button(label, onclick, light) {
    return h("button", { type: "button", textContent: label, disabled: state.busy, style: (light ? BTN_LIGHT : BTN) + (state.busy ? "opacity:.6;cursor:wait;" : ""), onclick: (event) => { event.preventDefault(); onclick(); } });
  }

  function panel() {
    const page = readPage();
    const unitSelect = h("select", { style: "margin:0 10px 0 4px;padding:2px;font:12px Verdana,Arial,sans-serif;", onchange: () => { state.unit = unitSelect.value; } },
      [h("option", { value: "", textContent: "— Chọn —" }), ...Object.entries(state.units).map(([value, label]) => h("option", { value, textContent: label }))]);
    unitSelect.value = state.unit ?? guessUnit(page);
    const positionSelect = h("select", { style: "margin:0 10px 0 4px;padding:2px;max-width:240px;font:12px Verdana,Arial,sans-serif;", onchange: () => { state.position = positionSelect.value; } },
      [h("option", { value: "", textContent: "— Chọn cương vị —" }), ...state.positions.map((value) => h("option", { value, textContent: value }))]);
    if (state.position !== null) positionSelect.value = state.position;
    else chrome.storage.local.get("lastPosition").then(({ lastPosition }) => {
      if (lastPosition && state.positions.includes(lastPosition) && state.position === null) positionSelect.value = state.position = lastPosition;
    }).catch(() => undefined);
    return h("div", { style: "margin-top:6px;padding:8px 10px;border:1px solid #bfdbfe;border-radius:6px;background:#eff6ff;" }, [
      h("div", { style: "margin-bottom:6px;color:#1e3a8a;", textContent: `Lấy số PCT ${KIND === "ELECTRICAL" ? "Điện" : "Cơ – Nhiệt – Hóa"} từ sổ PXVH1 · phiếu nội bộ điện tử` }),
      h("label", { textContent: "Tổ máy*" }), unitSelect,
      h("label", { textContent: "Cương vị*" }), positionSelect,
      button(state.busy ? "Đang lấy số…" : "Lấy số & điền", () => claim(unitSelect.value, positionSelect.value)),
      button("Đóng", () => { state.panel = false; render(); }, true),
      h("div", { style: "margin-top:6px;color:#475569;", textContent: "CHTT, số nhân viên và SYC còn thiếu sẽ hiện “Cần bổ sung” trên sổ để khai sau." }),
    ]);
  }

  function render() {
    const input = numberInput();
    if (!input) return;
    let root = document.getElementById(TOOLBAR_ID);
    if (!root) {
      root = h("div", { id: TOOLBAR_ID, style: "margin-top:4px;font:12px Verdana,Geneva,Arial,sans-serif;" });
      input.insertAdjacentElement("afterend", root);
    }
    const parts = [h("strong", { textContent: "Sổ PXVH1: ", style: "color:#1e3a8a;" })];
    const notice = pageNotice();
    const prompt = pendingStopPrompt();
    const foreign = foreignQlvh();
    if (foreign) parts.push(h("span", { textContent: `phiếu của ${foreign} — không thuộc sổ PXVH1, tiện ích không lấy số hay báo về sổ.`, style: "color:#64748b;" }));
    else if (state.loading) parts.push(h("span", { textContent: "đang kiểm tra…" }));
    else if (notice?.action === "cancel") {
      // Trang phiếu đã hủy: không bao giờ lấy số hay đồng bộ nội dung, chỉ báo hủy về sổ.
      if (state.permit) {
        parts.push(h("span", { textContent: `${state.permit.formatted} · NKVH đã hủy, sổ chưa hủy`, style: "font-weight:bold;" }));
        parts.push(button(state.busy ? "Đang hủy…" : "Báo hủy về sổ", reportCancel));
      } else if (state.cancelledPermit) {
        parts.push(h("span", { textContent: `${state.cancelledPermit.formatted} · đã hủy trên sổ` }));
      } else {
        parts.push(h("span", { textContent: "phiếu đã hủy, không có trên sổ" }));
      }
    } else if (notice?.action === "stop") {
      // Trang phiếu đã dừng: không lấy số hay đồng bộ nội dung, chỉ báo dừng về sổ.
      if (state.permit?.status === "PAUSED") parts.push(h("span", { textContent: `${state.permit.formatted} · Tạm dừng trên sổ` }));
      else if (state.permit) {
        parts.push(h("span", { textContent: `${state.permit.formatted} · NKVH đã dừng, sổ chưa ghi`, style: "font-weight:bold;" }));
        parts.push(button(state.busy ? "Đang ghi…" : "Báo dừng về sổ", reportStop));
      } else parts.push(h("span", { textContent: "phiếu đã dừng, không có trên sổ" }));
    } else if (state.permit) {
      parts.push(h("span", { textContent: state.permit.formatted, style: "font-weight:bold;" }));
      if (state.permit.status === "PAUSED") parts.push(h("span", { textContent: " · Tạm dừng trên sổ" }));
      if (input.value.trim() !== state.permit.formatted) parts.push(button("Điền số", () => { fillNumber(state.permit.formatted); say("Đã điền số. Kiểm tra lại rồi bấm Lưu trên NKVH.", "success"); }));
      parts.push(button(state.busy ? "Đang đồng bộ…" : "Đồng bộ về sổ", sync, true));
    } else if (state.positions.length) {
      parts.push(h("span", { textContent: "chưa có số" }));
      if (!state.panel) parts.push(button("Lấy số PCT", openPanel));
    } else {
      parts.push(button("Thử lại", load, true));
    }
    const children = [h("div", {}, parts)];
    if (prompt) children.push(h("div", { style: "margin-top:6px;padding:6px 8px;border:1px solid #fcd34d;border-radius:6px;background:#fffbeb;color:#78350f;" }, [
      h("span", { textContent: `Vừa lưu Dừng phiếu trên NKVH (lý do: ${prompt.reason})? Ghi phiếu trên sổ là Tạm dừng:` }),
      button(state.busy ? "Đang ghi…" : "Báo dừng về sổ", () => reportStop({ reason: prompt.reason })),
      button("Không phải", () => { setPending(null); render(); }, true),
    ]));
    if (state.panel && !state.permit) children.push(panel());
    if (state.message) children.push(h("div", { textContent: state.message, style: `margin-top:4px;color:${TONES[state.tone] || TONES.info};` }));
    root.replaceChildren(...children);
  }

  // PrimeFaces vẽ lại cả formContent khi chuyển bước (B1 → B2…) nên thanh công cụ bị xoá theo:
  // theo dõi DOM và gắn lại khi mất.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (numberInput() && !document.getElementById(TOOLBAR_ID)) render();
      renderDialogNote();
      maybeAutoReport();
    });
  }).observe(document.body, { childList: true, subtree: true });

  load().then(maybeAutoReport);
})();
