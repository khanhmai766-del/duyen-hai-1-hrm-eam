(() => {
  const cleanText = value => String(value || "").replace(/\s+/g, " ").trim();
  const normalized = value => cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
  const readValue = input => cleanText(input.value || input.getAttribute("value") || "");
  const CONTENT_SCRIPT_VERSION = "0.4.40";
  const PREPARED_DATE_KEY = "ctktktPreparedOperatingDate";
  const PREPARED_REFRESH_AT_KEY = "ctktktPreparedRefreshAt";
  const parseNumber = raw => {
    const original = cleanText(raw);
    if (/[A-Za-zÀ-ỹ]/u.test(original) || /\d{1,2}\/\d{1,2}\/\d{4}/.test(original)) return null;
    let value = original.replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
    if (!value) return null;
    const comma = value.lastIndexOf(","), dot = value.lastIndexOf(".");
    if (comma >= 0 && comma > dot) value = value.replace(/\./g, "").replace(",", ".");
    else if (dot >= 0 && dot > comma) value = value.replace(/,/g, "");
    else value = value.replace(",", ".");
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : null;
  };
  const normalizeQlktNumber = raw => {
    const original = cleanText(raw);
    if (!original || /[A-Za-zÀ-ỹ]/u.test(original) || /\d{1,2}\/\d{1,2}\/\d{4}/.test(original)) return null;
    let value = original.replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
    if (!value) return null;
    const comma = value.lastIndexOf(","), dot = value.lastIndexOf(".");
    if (comma >= 0 && comma > dot) value = value.replace(/\./g, "").replace(",", ".");
    else if (dot >= 0 && dot > comma) value = value.replace(/,/g, "");
    else if (comma >= 0) value = value.replace(",", ".");
    const number = Number(value);
    return Number.isFinite(number) ? value : null;
  };
  const visibleReportDateInputs = () => {
    const candidates = [...document.querySelectorAll("input")]
      .filter(input => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(readValue(input)))
      .map(input => ({ input, rect: input.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    if (!candidates.length) return [];
    const firstRowTop = Math.min(...candidates.map(({ rect }) => rect.top));
    return candidates.filter(({ rect }) => Math.abs(rect.top - firstRowTop) < 24).map(({ input }) => input);
  };
  const parseDate = expectedOperatingDate => {
    const values = visibleReportDateInputs().map(readValue);
    const expectedMatch = String(expectedOperatingDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const expectedDisplay = expectedMatch ? `${expectedMatch[3]}/${expectedMatch[2]}/${expectedMatch[1]}` : "";
    // PrimeFaces thường giữ các bản sao input ẩn mang ngày cũ. Chỉ đọc ô đang
    // hiển thị trong hàng bộ lọc và ưu tiên chính ngày được yêu cầu.
    if (expectedDisplay && values.includes(expectedDisplay)) return expectedOperatingDate;
    for (const value of values) {
      const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    }
    // Riêng màn hình Công tơ có ngày trong chính từng dòng dữ liệu nên bộ đọc
    // phía sau còn kiểm tra độc lập được ngày. Các màn hình khác tuyệt đối
    // không dùng ngày yêu cầu làm mặc định vì có thể che giấu bảng dữ liệu cũ.
    try {
      const preparedDate = sessionStorage.getItem(PREPARED_DATE_KEY);
      if (pageKind() === "meter" && /^\d{4}-\d{2}-\d{2}$/.test(String(expectedOperatingDate || "")) && preparedDate === expectedOperatingDate) return preparedDate;
    } catch {
      // sessionStorage có thể bị chặn; khi đó giữ nguyên cơ chế kiểm tra qua DOM.
    }
    return null;
  };

  function pageKind() {
    const path = location.pathname.toLowerCase();
    if (path.includes("rpt_ct_qlkt_02_pd") || path.includes("rpt_ct_qlkt_02")) return "pmis_02pd";
    if (path.includes("rpt_a_production_day")) return "production";
    if (path.includes("rpt_hour_operation")) return "operation";
    if (path.includes("nhienlieu")) return "fuel";
    if (path.includes("hieusuatlo") || path.includes("suathaonhiet") || path.includes("can_bang_nhiet")) return "heatrate";
    // "rpt_a_bu_tru_day.jsf" (Cập nhật sản lượng bù trừ) là 1 báo cáo KHÁC
    // nhưng có chung các cụm "điện năng đầu cực"/"SL điểm bán" trong nội dung
    // với đúng màn hình Sản lượng — từng khiến rememberPage() ghi nhớ NHẦM
    // URL của trang bù trừ này làm URL "production", làm đồng bộ đọc ra 0 chỉ
    // tiêu mỗi khi mở lại. Loại trừ tường minh theo path trước khi thử heuristic
    // theo nội dung trang.
    if (path.includes("bu_tru")) return null;
    const page = normalized(document.body?.innerText);
    if (page.includes("02-pd") || page.includes("khoi phat dien 02-pd")) return "pmis_02pd";
    if (page.includes("so lieu do dem cong to") && page.includes("nguon du lieu") && page.includes("kwhgiao")) return "meter";
    if (page.includes("dien nang dau cuc") && page.includes("sl diem ban")) return "production";
    if (page.includes("nhien lieu than") && page.includes("nhien lieu dau fo")) return "fuel";
    if (page.includes("so gio phat") && page.includes("luy ke so gio van hanh")) return "operation";
    if (page.includes("hieu suat lo") && page.includes("suat hao nhiet")) return "heatrate";
    return null;
  }

  function rememberPage() {
    const kind = pageKind();
    if (!kind) return;
    chrome.storage.local.get({ qlktPages: {} }, ({ qlktPages }) => {
      const pageUrl = `${location.origin}${location.pathname}${location.search}`;
      if (qlktPages[kind] === pageUrl) return;
      chrome.storage.local.set({ qlktPages: { ...qlktPages, [kind]: pageUrl } });
    });
  }

  function prepareDate(operatingDate) {
    const match = String(operatingDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error("Ngày báo cáo không hợp lệ.");
    const displayDate = `${match[3]}/${match[2]}/${match[1]}`;
    const dateInputs = visibleReportDateInputs();
    if (!dateInputs.length) throw new Error("Không tìm thấy ô ngày báo cáo trên màn hình QLKT.");
    if (dateInputs.every(input => readValue(input) === displayDate)) {
      try {
        sessionStorage.setItem(PREPARED_DATE_KEY, operatingDate);
        sessionStorage.removeItem(PREPARED_REFRESH_AT_KEY);
      } catch { /* tiếp tục kiểm tra ngày qua DOM */ }
      return { refreshed: false, changed: false, controlInfo: "Ngày trên QLKT đã đúng" };
    }
    const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    dateInputs.forEach(input => {
      input.focus();
      if (nativeValueSetter) nativeValueSetter.call(input, displayDate);
      else input.value = displayDate;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();
    });
    // QUAN TRỌNG: mọi cách dò nút "cập nhật ngày" bên dưới PHẢI giới hạn theo VỊ
    // TRÍ gần ô ngày — từng có lúc dò theo NHÃN CHỮ trên toàn trang (không giới
    // hạn vị trí) và vô tình bấm trúng 1 link MENU ĐIỀU HƯỚNG có chữ "Cập nhật"
    // (ví dụ "Cập nhật sản lượng bù trừ" — một báo cáo KHÁC), khiến tab bị điều
    // hướng sang nhầm trang thay vì chỉ làm mới bảng dữ liệu hiện tại.
    const dateRect = dateInputs[dateInputs.length - 1].getBoundingClientRect();
    const isExcludedLabel = label => label.includes("calendar") || label.includes("datepicker") || label.includes("cal-btn") || label.includes("calbutton") || label.includes("ghi") || label.includes("save") || label.includes("xuat") || label.includes("export") || label.includes("xoa") || label.includes("delete") || label.includes("trash") || label.includes("bu tru") || label.includes("bu-tru");
    const isNearDateRow = rect => Math.abs((rect.top + rect.height / 2) - (dateRect.top + dateRect.height / 2)) < 60;
    const refreshIcon = [...document.querySelectorAll(".ui-icon-refresh, [class*='icon-refresh'], [class*='refresh-icon'], [class*='arrowrefresh'], [class*='arrowreturn'], [class*='circle-arrow'], img[src*='refresh' i], img[src*='reload' i]")]
      .find(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && isNearDateRow(rect); });
    const labelledControl = [...document.querySelectorAll("button, a, input[type='button'], input[type='image'], input[type='submit'], input[type='reset'], [role='button']")].find(element => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || !isNearDateRow(rect)) return false;
      const label = normalized(`${element.textContent} ${element.getAttribute("title") || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("alt") || ""} ${element.getAttribute("src") || ""} ${element.className || ""}`);
      if (isExcludedLabel(label)) return false;
      return label.includes("lam moi") || label.includes("cap nhat") || label.includes("tai lai") || label.includes("refresh") || label.includes("reload") || label.includes("arrowrefresh") || label.includes("arrowreturn");
    });
    const nearbyControl = [...document.querySelectorAll("button, a, input[type='button'], input[type='image'], input[type='submit'], input[type='reset'], img, [role='button'], [onclick]")]
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => {
        if (!rect.width || !rect.height) return false;
        const label = normalized(`${element.textContent} ${element.getAttribute("title") || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("alt") || ""} ${element.getAttribute("src") || ""} ${element.className || ""}`);
        const sameLine = Math.abs((rect.top + rect.height / 2) - (dateRect.top + dateRect.height / 2)) < 24;
        const toTheRight = rect.left >= dateRect.right - 6 && rect.left - dateRect.right < 320;
        return sameLine && toTheRight && !isExcludedLabel(label);
      })
      .sort((left, right) => left.rect.left - right.rect.left)[0]?.element;
    const refreshControl = refreshIcon?.closest("button, a, input, [role='button'], [onclick]") || refreshIcon || labelledControl || nearbyControl;
    if (!refreshControl) {
      const visibleControls = [...document.querySelectorAll("button, a, input[type='button'], input[type='image'], input[type='submit'], [role='button'], [onclick]")]
        .filter(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }).length;
      throw new Error(`Không tìm thấy nút cập nhật ngày trên màn hình QLKT (đang chờ giao diện tải xong; đã thấy ${visibleControls} nút).`);
    }
    const controlText = cleanText(refreshControl.textContent).slice(0, 40);
    const controlInfo = `<${refreshControl.tagName?.toLowerCase() || "?"}${refreshControl.id ? `#${refreshControl.id}` : ""}${refreshControl.className ? `.${String(refreshControl.className).trim().replace(/\s+/g, ".")}` : ""}>${controlText ? ` "${controlText}"` : ""}`;
    try {
      sessionStorage.setItem(PREPARED_DATE_KEY, operatingDate);
      sessionStorage.setItem(PREPARED_REFRESH_AT_KEY, String(Date.now()));
    } catch { /* giữ kiểm tra ngày qua DOM */ }
    refreshControl.click();
    return { refreshed: true, changed: true, controlInfo };
  }

  function inputsWithContext(table) {
    const matrix = [], records = [];
    [...table.rows].forEach((row, rowIndex) => {
      matrix[rowIndex] ||= [];
      let column = 0;
      [...row.cells].forEach(cell => {
        while (matrix[rowIndex][column]) column++;
        const rowSpan = Math.max(1, Number(cell.rowSpan) || 1), colSpan = Math.max(1, Number(cell.colSpan) || 1);
        const info = { cell, rowIndex, column, rowSpan, colSpan, text: cleanText(cell.textContent) };
        records.push(info);
        for (let r = rowIndex; r < rowIndex + rowSpan; r++) {
          matrix[r] ||= [];
          for (let c = column; c < column + colSpan; c++) matrix[r][c] = info;
        }
        column += colSpan;
      });
    });
    const result = [];
    records.forEach(record => {
      const inputs = [...record.cell.querySelectorAll("input")].filter(input => !["checkbox", "radio", "hidden", "button", "submit"].includes((input.type || "text").toLowerCase()));
      inputs.forEach(input => {
        const headers = [], seen = new Set();
        for (let row = 0; row < record.rowIndex; row++) {
          const above = matrix[row]?.[record.column];
          if (above && above !== record && !seen.has(above) && above.text) { seen.add(above); headers.push(above.text); }
        }
        const rowLabels = records.filter(item => item.rowIndex === record.rowIndex && item.column < record.column && item.text).map(item => item.text);
        result.push({ input, value: parseNumber(readValue(input)), header: normalized(headers.join(" ")), row: normalized(rowLabels.join(" ")), rawHeader: headers.join(" · "), rawRow: rowLabels.join(" · ") });
      });
    });
    return result;
  }

  // Màn hình "Tính toán hiệu suất lò/suất hao nhiệt" (Cân bằng nhiệt) hiển thị 1 bảng PrimeFaces có
  // cột đóng băng (frozen columns) — thực chất là 2 <table> tách rời nhưng CÙNG CHỈ SỐ HÀNG:
  //  - Bảng "nhãn" (cột trái): STT | Tên đại lượng | Ký hiệu | ĐVT | TK/PT test | Hệ số liên hệ.
  //  - Bảng "giá trị" (cuộn ngang): Ca sáng | Ca chiều | Ca khuya | Trung bình (mỗi hàng ứng với
  //    đúng 1 đại lượng, cùng thứ tự hàng như bảng nhãn).
  // Nhờ vậy chỉ cần dò đúng CỘT theo tên (Ký hiệu / Trung bình) rồi khớp theo Ký hiệu chính xác (PG,
  // L1, Pbn, T) thay vì đoán tên hàng — đáng tin cậy hơn nhiều so với dò theo nhãn tiếng Việt.
  // PrimeFaces vẽ riêng 1 bảng "chỉ có dòng tiêu đề" (để giữ cố định khi cuộn) TÁCH KHỎI bảng dữ
  // liệu thật — cả 2 đều khớp cùng tên cột, nên phải chọn bảng có NHIỀU HÀNG NHẤT trong số các bảng
  // khớp (bảng tiêu đề giả chỉ có 1–2 hàng), nếu không sẽ vô tình vớ phải bảng rỗng không có dữ liệu.
  function findColumnTableByHeader(headerNames, expectedRoot = null) {
    let best = null;
    for (const table of document.querySelectorAll("table")) {
      const root = table.closest?.(".ui-datatable") || null;
      if (expectedRoot && root !== expectedRoot) continue;
      const rows = [...table.rows];
      const headerRows = table.tHead ? [...table.tHead.rows] : rows;
      const grid = [];
      for (let rowIndex = 0; rowIndex < headerRows.length; rowIndex++) {
        grid[rowIndex] ||= [];
        let column = 0;
        for (const cell of headerRows[rowIndex].cells) {
          while (grid[rowIndex][column] !== undefined) column++;
          for (let r = 0; r < (cell.rowSpan || 1); r++) {
            grid[rowIndex + r] ||= [];
            for (let c = 0; c < (cell.colSpan || 1); c++) grid[rowIndex + r][column + c] = normalized(cell.textContent);
          }
          column += cell.colSpan || 1;
        }
        const cells = grid[rowIndex];
        if (!headerNames.every(name => cells.includes(name))) continue;
        // Scrollable PrimeFaces headers and bodies are separate tables. For
        // frozen columns, resolve each side inside its own layout container.
        const side = table.closest?.(".ui-datatable-frozenlayout-left, .ui-datatable-frozenlayout-right");
        const scope = side || root;
        const bodyTables = scope ? [...scope.querySelectorAll(".ui-datatable-scrollable-body table")]
          .filter(candidate => candidate.closest(".ui-datatable") === root) : [];
        if (bodyTables.length > 1) throw new Error("Có nhiều vùng dữ liệu cùng tiêu đề; chưa thể ghép bảng an toàn.");
        const bodyTable = bodyTables[0] || table;
        const dataRows = bodyTable.tBodies?.length
          ? [...bodyTable.tBodies].flatMap(body => [...body.rows])
          : [...bodyTable.rows].slice(bodyTable === table ? rows.indexOf(headerRows[rowIndex]) + 1 : 0);
        if (!best || dataRows.length > best.dataRows.length) {
          best = { table, bodyTable, root, dataRows, headerRowIndex: rowIndex, headerCells: cells };
        }
      }
    }
    return best;
  }

  // Tổ máy đang xem trên màn hình QLKT (DH1_MF1/DH1_MF2) được chọn qua dropdown
  // "formMain:cbSelectMainAsset" (đã xác nhận trực tiếp trên hệ thống QLKT thật) — nhưng vẫn dò theo
  // kiểu chung (mọi <select> đang chọn, không khoá cứng id) để không vỡ nếu QLKT đổi id.
  function heatRateUnitFromText(value) {
    const text = normalized(value).replace(/[_-]+/g, " ");
    if (!text) return null;
    if (text === "2" || /(?:^|\s)(?:dh1\s*)?mf\s*2(?:\s|$)/.test(text) || /(?:^|\s)(?:s|tm)\s*2(?:\s|$)/.test(text) || text.includes("to may 2")) return "2";
    if (text === "1" || /(?:^|\s)(?:dh1\s*)?mf\s*1(?:\s|$)/.test(text) || /(?:^|\s)(?:s|tm)\s*1(?:\s|$)/.test(text) || text.includes("to may 1")) return "1";
    return null;
  }

  function optionHeatRateUnit(option) {
    return heatRateUnitFromText(`${option?.textContent || ""} ${option?.value || ""}`);
  }

  function detectHeatRateUnit() {
    const mainSelect = findMainAssetSelect();
    if (mainSelect) {
      // PrimeFaces can leave the hidden <select> value ahead of the displayed
      // SelectOneMenu label while an AJAX update is still pending. The visible
      // label represents the selection that the user/widget actually applied.
      const label = mainSelect.id ? document.getElementById(`${mainSelect.id.replace(/_input$/, "")}_label`) : null;
      const labelUnit = heatRateUnitFromText(label?.textContent || "");
      if (labelUnit) return labelUnit;
      const selected = mainSelect.options?.[mainSelect.selectedIndex];
      const selectedUnit = optionHeatRateUnit(selected) || heatRateUnitFromText(mainSelect.value);
      if (selectedUnit) return selectedUnit;
    }
    for (const select of document.querySelectorAll("select")) {
      if (select === mainSelect) continue;
      const selected = select.options?.[select.selectedIndex];
      const unit = optionHeatRateUnit(selected) || heatRateUnitFromText(select.value);
      if (unit) return unit;
      // PrimeFaces selectOneMenu đôi khi không phản ánh selectedIndex vào thẻ
      // <select> ẩn, mà chỉ cập nhật nhãn `<id>_label` đang hiển thị.
      const label = select.id ? document.getElementById(`${select.id.replace(/_input$/, "")}_label`) : null;
      const labelUnit = heatRateUnitFromText(label?.textContent || "");
      if (labelUnit) return labelUnit;
    }
    return null;
  }

  // Dropdown "Tổ máy" (formMain:cbSelectMainAsset) — dò theo kiểu chung (mọi <select> có cả 2 lựa
  // chọn MF1/MF2 trong danh sách) để không vỡ nếu QLKT đổi id, khác với detectHeatRateUnit() ở trên
  // vốn chỉ đọc lựa chọn ĐANG chọn chứ không cần liệt kê toàn bộ option.
  function findMainAssetSelect() {
    const exact = [...document.querySelectorAll("select")].find(select => /cbSelectMainAsset/i.test(select.id || select.name || ""));
    if (exact) return exact;
    for (const select of document.querySelectorAll("select")) {
      const units = new Set([...select.options].map(optionHeatRateUnit).filter(Boolean));
      if (units.has("1") && units.has("2")) return select;
    }
    return null;
  }

  // Dùng nội dung cột "Trung bình" làm "chữ ký" bảng — QLKT nạp lại dữ liệu bằng AJAX (PrimeFaces)
  // khi đổi Tổ máy, không đổi URL và cũng không có sự kiện "load" rõ ràng để chờ, nên phải so sánh
  // nội dung trước/sau để biết khi nào bảng đã thực sự cập nhật xong.
  function sampleHeatRateSignature() {
    const labels = findColumnTableByHeader(["ky hieu", "ten dai luong"]);
    const values = findColumnTableByHeader(["trung binh"], labels?.root);
    return values ? values.dataRows.map(row => [...row.cells].map(readHeatRateCell).join(";")).join("|") + `|${heatRateOutageForUnit(detectHeatRateUnit())}` : "";
  }

  function readHeatRateCell(cell) {
    const input = cell?.querySelector?.("input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea");
    return input ? readValue(input) : cleanText(cell?.textContent);
  }

  function heatRateOutageForUnit(unit) {
    if (unit !== "1" && unit !== "2") return false;
    const text = normalized(document.body?.innerText || "");
    return new RegExp(`(?:dung|ngung) (?:su co|sua chua|bao duong|du phong)\\s*:\\s*dh1[_ -]*mf${unit}\\b`).test(text);
  }

  async function switchHeatRateUnit(targetUnit) {
    const select = findMainAssetSelect();
    if (!select) throw new Error("Không tìm thấy danh sách chọn Tổ máy trên màn hình này.");
    const targetOption = [...select.options].find(option => optionHeatRateUnit(option) === targetUnit);
    if (!targetOption) throw new Error(`Không tìm thấy Tổ máy DH1_MF${targetUnit} trong danh sách chọn.`);
    if (detectHeatRateUnit() === targetUnit) return waitForHeatRateEntries(targetUnit);
    const before = sampleHeatRateSignature();
    const selection = await requestHeatRateUnit(targetUnit);
    return waitForHeatRateEntries(targetUnit, before, selection.ajaxStarted === true);
  }

  async function requestHeatRateUnit(unit) {
    const response = await chrome.runtime.sendMessage({ type: "SELECT_QLKT_HEATRATE_UNIT", unit });
    if (!response?.ok) throw new Error(response?.error || "QLKT chưa xác nhận chuyển Tổ máy.");
    return response;
  }

  // 4 chỉ tiêu mới của báo cáo "THEO PMIS" (Trung bình công suất đầu cực, Tổn thất khói khô trung
  // bình, Trung bình chân không bình ngưng, Trung bình nhiệt độ nước làm mát tuần hoàn) đọc từ cột
  // "Trung bình" của bảng kết quả, khớp đúng hàng theo Ký hiệu (PG/L1/Pbn/T) — đã đối chiếu trực
  // tiếp với màn hình QLKT thật (Vận hành › Tính toán hiệu suất lò/suất hao nhiệt, "Theo Ngày").
  function readHeatRateSnapshotForCurrentUnit(unit) {
    const labels = findColumnTableByHeader(["ky hieu", "ten dai luong"]);
    if (!labels) throw new Error("Không tìm thấy bảng \"Ký hiệu\" chỉ tiêu trên màn hình này.");
    const values = findColumnTableByHeader(["trung binh"], labels.root);
    if (!values) throw new Error("Không tìm thấy cột \"Trung bình\" trên màn hình này — hãy chắc chắn đang chọn \"Theo Ngày\".");
    const symbolColumn = labels.headerCells.indexOf("ky hieu");
    const avgColumn = values.headerCells.indexOf("trung binh");
    if (values.headerCells.filter(name => name === "trung binh").length !== 1) {
      throw new Error("Tiêu đề Trung bình không xác định duy nhất một cột dữ liệu.");
    }
    if (labels.dataRows.length !== values.dataRows.length) {
      throw new Error(`Số hàng hai vùng không khớp: Ký hiệu ${labels.dataRows.length}, Trung bình ${values.dataRows.length}.`);
    }
    const codeByMetric = unit === "2" ? { PG: "DB", L1: "DD", Pbn: "DF", T: "DH" } : { PG: "DA", L1: "DC", Pbn: "DE", T: "DG" };
    const entries = [];
    for (const [symbol, fieldCode] of Object.entries(codeByMetric)) {
      let rowIndex = -1;
      for (let index = 0; index < labels.dataRows.length; index++) {
        const cell = labels.dataRows[index].cells[symbolColumn];
        if (cell && cleanText(cell.textContent) === symbol) { rowIndex = index; break; }
      }
      if (rowIndex === -1) throw new Error(`Chưa thấy hàng ${symbol} trong bảng Cân bằng nhiệt.`);
      const labelRow = labels.dataRows[rowIndex];
      const rowKey = labelRow.getAttribute?.("data-ri") ?? labelRow.getAttribute?.("data-rk");
      const keyed = rowKey != null && values.dataRows.some(row => row.getAttribute?.("data-ri") != null || row.getAttribute?.("data-rk") != null);
      const valueRow = keyed ? values.dataRows.find(row => (row.getAttribute?.("data-ri") ?? row.getAttribute?.("data-rk")) === rowKey) : values.dataRows[rowIndex];
      if (!valueRow) throw new Error(`Không ghép được hàng ${symbol} giữa vùng Ký hiệu và Trung bình.`);
      const valueCell = valueRow.cells[avgColumn];
      if (!valueCell) throw new Error(`Hàng ${symbol} không có cột Trung bình tại vị trí ${avgColumn + 1}.`);
      const rawValue = readHeatRateCell(valueCell);
      const value = parseNumber(rawValue);
      // User rule: after the table has loaded, blank/zero PG means stopped.
      // Never infer a stop from a missing PG row or a missing average column.
      if (symbol === "PG" && (/^[\s\-–—]*$/.test(rawValue) || (value !== null && Number(value) === 0))) return { entries: [], unavailable: true };
      if (symbol === "PG" && value === null) throw new Error("Ô Trung bình PG có nội dung không phải số; chưa thể xác định tải tổ máy.");
      if (value === null) continue;
      entries.push({ fieldCode, value, sourceLabel: `QLKT · DH1_MF${unit} · Trung bình` });
    }
    return { entries, unavailable: false };
  }

  // AJAX có thể xóa bảng trước khi điền số liệu: chữ ký đổi chưa có nghĩa
  // bảng đã sẵn sàng. Chỉ đọc khi đủ 4 chỉ tiêu, đúng tổ máy và ổn định.
  async function waitForHeatRateEntries(unit, previousSignature = null, ajaxStarted = false) {
    const deadline = Date.now() + 12000;
    const readiness = await chrome.runtime.sendMessage({ type: "WAIT_QLKT_HEATRATE_READY" });
    if (!readiness?.ok) throw new Error(`QLKT DH1_MF${unit}: ${readiness?.error || "Chưa xác nhận được tải bảng."}`);
    let stableSignature = null, stableSince = 0, lastEntries = [], lastReadError = "";
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 300));
      try {
        const signature = sampleHeatRateSignature();
        const snapshot = readHeatRateSnapshotForCurrentUnit(unit);
        const entries = snapshot.entries;
        lastReadError = "";
        lastEntries = entries;
        const unavailable = snapshot.unavailable;
        if (unavailable && !readiness.ajaxVerified) throw new Error("PG trống nhưng chưa xác nhận AJAX đã tải xong; chưa thể kết luận tổ máy ngừng.");
        if (detectHeatRateUnit() === unit && (entries.length === 4 || unavailable)
          && (previousSignature === null || signature !== previousSignature || (ajaxStarted && readiness.ajaxVerified))) {
          if (signature !== stableSignature) { stableSignature = signature; stableSince = Date.now(); }
          else if (Date.now() - stableSince >= 600) return { entries, unavailable };
        } else stableSignature = null;
      } catch (error) {
        stableSignature = null;
        lastReadError = error instanceof Error ? error.message : String(error);
      }
    }
    const required = unit === "2" ? ["DB", "DD", "DF", "DH"] : ["DA", "DC", "DE", "DG"];
    const missing = required.filter(code => !lastEntries.some(entry => entry.fieldCode === code));
    const detail = lastReadError ? ` Lỗi đọc bảng: ${lastReadError}` : ` Đã thấy đủ hàng nhưng đọc được ${lastEntries.length}/4 ô Trung bình.`;
    throw new Error(`QLKT DH1_MF${unit} chưa nạp đủ/ổn định 4 chỉ tiêu Trung bình${missing.length ? ` (thiếu ${missing.join(", ")})` : ""}. Bộ đọc v${CONTENT_SCRIPT_VERSION}; tổ máy đang chọn: ${detectHeatRateUnit() ? `DH1_MF${detectHeatRateUnit()}` : "chưa xác định"}.${detail}`);
  }

  // Đọc cả 2 Tổ máy (S1+S2) trong 1 lần gọi: đọc Tổ máy đang chọn trước, rồi tự chuyển dropdown
  // "Tổ máy" sang Tổ máy còn lại, chờ bảng nạp lại xong (AJAX), đọc tiếp, rồi khôi phục lại đúng
  // Tổ máy ban đầu — để người dùng chỉ cần bấm 1 nút đồng bộ trên web Chỉ tiêu KTKT.
  async function extractHeatRatePayload(operatingDate) {
    const controlsDeadline = Date.now() + 12000;
    while (true) {
      const select = findMainAssetSelect();
      const units = new Set([...(select?.options || [])].map(optionHeatRateUnit).filter(Boolean));
      if (units.has("1") && units.has("2")) break;
      if (Date.now() >= controlsDeadline) {
        throw new Error(`Màn hình Cân bằng nhiệt chưa có danh sách DH1_MF1/DH1_MF2 sau 12 giây. Trang đang mở: ${location.href}`);
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    const originalUnit = detectHeatRateUnit();
    // Không phụ thuộc nhãn đang chọn: một số phiên bản PrimeFaces chỉ cập nhật
    // nhãn widget, khiến selectedIndex của <select> ẩn không xác định. Khi đó
    // chủ động chọn MF1 làm điểm bắt đầu rồi đọc lần lượt MF1 -> MF2.
    const firstUnit = originalUnit || "1";
    if (!originalUnit) await switchHeatRateUnit(firstUnit);
    const otherUnit = firstUnit === "2" ? "1" : "2";
    const readingsByUnit = { [firstUnit]: await waitForHeatRateEntries(firstUnit) };
    try {
      readingsByUnit[otherUnit] = await switchHeatRateUnit(otherUnit);
    } finally {
      if (originalUnit && detectHeatRateUnit() !== originalUnit) {
        // Restore the user's selection without waiting to read this unit again.
        try { await requestHeatRateUnit(originalUnit); } catch { /* giữ nguyên kết quả/lỗi đọc trước đó */ }
      }
    }
    const entries = [...(readingsByUnit["1"]?.entries || []), ...(readingsByUnit["2"]?.entries || [])];
    const unavailableHeatRateUnits = ["1", "2"].filter(unit => readingsByUnit[unit]?.unavailable);
    if (!entries.length && unavailableHeatRateUnits.length !== 2) throw new Error("Không tìm thấy các chỉ tiêu suất hao nhiệt trên màn hình này.");
    return { version: 1, operatingDate, sourcePage: location.href, kind: "heatrate", entries,
      ...(unavailableHeatRateUnits.length ? { unavailableHeatRateUnits } : {}) };
  }

  function extractPpaMeterPayload(operatingDate, options = {}) {
    const extractors = globalThis.QlktMeterExtractor;
    if (!extractors) throw new Error("Bộ đọc công tơ PPA chưa được nạp. Hãy tải lại tiện ích.");

    // Cách 1 (ưu tiên): đọc thẳng dữ liệu đầy đủ mà QLKT nhúng sẵn trong các
    // thẻ <script> khởi tạo bảng tính (không phụ thuộc bảng đã cuộn tới đâu).
    let scriptError = null;
    if (typeof extractors.extractPpaMeterReadingsFromScripts === "function") {
      try {
        const scriptTexts = [...document.querySelectorAll("script")].map(script => script.textContent || "");
        return extractors.extractPpaMeterReadingsFromScripts(scriptTexts, operatingDate, location.href, options);
      } catch (error) {
        scriptError = error instanceof Error ? error.message : String(error);
      }
    }

    // Cách 2 (dự phòng): dò bảng HTML đang hiển thị trên trang.
    let tableError = null;
    if (typeof extractors.extractPpaMeterReadings === "function") {
      try {
        const tables = [...document.querySelectorAll("table")].map(table => [...table.rows].map(row => [...row.cells].map(cell => {
          const input = cell.querySelector("input:not([type='checkbox']):not([type='radio']):not([type='hidden'])");
          return input ? readValue(input) : cleanText(cell.textContent);
        })));
        return extractors.extractPpaMeterReadings(tables, operatingDate, location.href, options);
      } catch (error) {
        tableError = error instanceof Error ? error.message : String(error);
      }
    }

    // Cả hai cách đều thất bại: đính kèm URL/tiêu đề trang thực tế mà tab nền
    // này đang đứng, để biết nó có đúng là màn hình công tơ hay đã bị chuyển
    // sang trang khác (đăng nhập lại, chọn đơn vị, v.v.).
    const pageDiag = `[Trang hiện tại: "${document.title || ""}" — ${location.href}]`;
    throw new Error(`${scriptError || tableError || "Không đọc được dữ liệu bảng công tơ."} ${pageDiag}`);
  }

  function extractPmis02PdPayload(arg1, arg2, arg3) {
    const operatingDate = typeof arg1 === "string" ? arg1 : (typeof arg2 === "string" ? arg2 : "");
    const tablesOrDoc = typeof arg1 !== "string" ? arg1 : arg2;
    const productionTablesOrDoc = typeof arg1 !== "string" ? arg3 : (arg3 || null);

    let allTables = [];
    if (Array.isArray(tablesOrDoc)) {
      allTables = tablesOrDoc;
    } else if (tablesOrDoc && typeof tablesOrDoc.querySelectorAll === "function") {
      allTables = [...tablesOrDoc.querySelectorAll("table")];
    } else if (typeof document !== "undefined") {
      allTables = [...document.querySelectorAll("table")];
    }

    let cellValues = null;
    for (const table of allTables) {
      const rows = Array.isArray(table) ? table : (table.rows ? [...table.rows] : []);
      for (const row of rows) {
        const cells = Array.isArray(row) ? row : (row.cells ? [...row.cells] : []);
        for (let i = 0; i < cells.length; i++) {
          const rawText = typeof cells[i] === "string" ? cells[i] : cells[i]?.textContent || "";
          const t = normalized(rawText);
          if (t.includes("duyen hai 1") && !t.includes("duyen hai 3") && !t.includes("tong cong")) {
            cellValues = cells.map(cell => {
              if (typeof cell === "string") return cleanText(cell);
              const input = cell?.querySelector ? cell.querySelector("input:not([type='checkbox']):not([type='radio']):not([type='hidden'])") : null;
              return input ? readValue(input) : cleanText(cell?.textContent || "");
            });
            break;
          }
        }
        if (cellValues) break;
      }
      if (cellValues) break;
    }

    if (!cellValues) {
      throw new Error("Không tìm thấy hàng \"Duyên Hải 1\" trên màn hình Báo cáo chỉ tiêu 02-PĐ.");
    }

    // 18 cột thứ tự tương ứng từ C181 đến T181 (ảnh media_1789829951895 & media_1789830004294)
    const CODES = [
      "C181", "D181", "E181", "F181", "G181", "H181", "I181", "J181", "K181",
      "L181", "M181", "N181", "O181", "P181", "Q181", "R181", "S181", "T181"
    ];

    const entries = [];
    for (let c = 0; c < CODES.length; c++) {
      const cellIdx = 1 + c; // Sau cột Tên đơn vị (cột 0)
      if (cellIdx < cellValues.length) {
        const code = CODES[c];
        const valStr = cellValues[cellIdx];
        if (code === "T181") {
          entries.push({ fieldCode: code, cell: code, value: valStr || "Đạt", sourceLabel: "QLKT · 02-PĐ · Duyên Hải 1 · Độ phát thải" });
        } else {
          const num = normalizeQlktNumber(valStr);
          entries.push({ fieldCode: code, cell: code, value: num !== null ? num : (valStr || "").replace(",", "."), sourceLabel: `QLKT · 02-PĐ · Duyên Hải 1 · Cột ${c + 1}` });
        }
      }
    }

    // Nếu có production tables được truyền kèm hoặc có thể đọc từ DOM, bóc tách thêm J157, K157, J158, K158
    let prodTables = [];
    if (Array.isArray(productionTablesOrDoc)) {
      prodTables = productionTablesOrDoc;
    } else if (productionTablesOrDoc && typeof productionTablesOrDoc.querySelectorAll === "function") {
      prodTables = [...productionTablesOrDoc.querySelectorAll("table")];
    }
    for (const table of prodTables) {
      const rows = Array.isArray(table) ? table : (table.rows ? [...table.rows] : []);
      for (const row of rows) {
        const cells = Array.isArray(row) ? row : (row.cells ? [...row.cells] : []);
        const rowText = cells.map(c => typeof c === "string" ? c : c?.textContent || "").join(" ");
        const t = normalized(rowText);
        if (t.includes("dh1_mf1") || (t.includes("mf1") && t.includes("sl phat"))) {
          const vals = cells.map(c => typeof c === "string" ? cleanText(c) : cleanText(c?.textContent || ""));
          if (vals[1]) {
            const num = normalizeQlktNumber(vals[1]);
            entries.push({ fieldCode: "J157", cell: "J157", value: num !== null ? num : vals[1].replace(",", "."), sourceLabel: "QLKT · DH1_MF1 · SL phát" });
          }
          if (vals[3]) {
            const num = normalizeQlktNumber(vals[3]);
            entries.push({ fieldCode: "K157", cell: "K157", value: num !== null ? num : vals[3].replace(",", "."), sourceLabel: "QLKT · DH1_MF1 · SL điểm bán" });
          }
        } else if (t.includes("dh1_mf2") || (t.includes("mf2") && t.includes("sl phat"))) {
          const vals = cells.map(c => typeof c === "string" ? cleanText(c) : cleanText(c?.textContent || ""));
          if (vals[1]) {
            const num = normalizeQlktNumber(vals[1]);
            entries.push({ fieldCode: "J158", cell: "J158", value: num !== null ? num : vals[1].replace(",", "."), sourceLabel: "QLKT · DH1_MF2 · SL phát" });
          }
          if (vals[3]) {
            const num = normalizeQlktNumber(vals[3]);
            entries.push({ fieldCode: "K158", cell: "K158", value: num !== null ? num : vals[3].replace(",", "."), sourceLabel: "QLKT · DH1_MF2 · SL điểm bán" });
          }
        }
      }
    }

    if (!entries.length) {
      throw new Error("Không đọc được chỉ tiêu nào từ hàng Duyên Hải 1 trên bảng 02-PĐ.");
    }

    return {
      version: 1,
      operatingDate,
      sourcePage: typeof location !== "undefined" ? location.href : "http://qlkt/pmis_02pd",
      kind: "pmis_02pd",
      entries,
    };
  }

  function operationRowSummary(row) {
    const cells = [...(row?.cells || [])];
    if (cells.length < 6) return null;
    const rowLabel = normalized(`${cells.slice(0, 2).map(cell => cell.textContent || "").join(" ")} ${row.textContent || ""}`);
    const unit = rowLabel.includes("dh1_mf1") || rowLabel.includes("dh1 mf1") ? "S1"
      : rowLabel.includes("dh1_mf2") || rowLabel.includes("dh1 mf2") ? "S2"
      : null;
    if (!unit) return null;
    const numericValues = [];
    for (const cell of cells) {
      const inputs = [...cell.querySelectorAll("input:not([type='checkbox']):not([type='radio']):not([type='hidden']), textarea")];
      const rawValues = inputs.length ? inputs.map(readValue) : [cell.textContent];
      for (const rawValue of rawValues) {
        const parsed = parseNumber(rawValue);
        if (parsed !== null) numericValues.push(Number(parsed));
      }
    }
    if (numericValues.length < 6) return null;
    const [starts, generationHours, standbyHours, plannedMaintenanceHours, unplannedRepairHours, incidentHours] = numericValues.slice(-6);
    return { unit, starts, generationHours, standbyHours, plannedMaintenanceHours, unplannedRepairHours, incidentHours };
  }

  function operationSummaryEntries(rows) {
    const summaries = new Map();
    for (const row of rows) {
      const summary = operationRowSummary(row);
      if (summary) summaries.set(summary.unit, summary);
    }
    const s1 = summaries.get("S1"), s2 = summaries.get("S2");
    if (!s1 || !s2) throw new Error("Không đọc đủ hai dòng DH1_MF1 và DH1_MF2 trên bảng Thời gian vận hành.");
    const standby = s1.standbyHours + s2.standbyHours;
    const incident = s1.incidentHours + s2.incidentHours;
    const maintenance = s1.plannedMaintenanceHours + s1.unplannedRepairHours + s2.plannedMaintenanceHours + s2.unplannedRepairHours;
    const startupRaw = 48 - s1.generationHours - s2.generationHours - standby - incident - maintenance;
    if (startupRaw < -0.01) throw new Error("Tổng giờ phát và giờ dừng trên QLKT vượt quá 48 giờ tổ máy/ngày.");
    const format = value => String(Number(Math.max(0, value).toFixed(6)));
    return [
      { fieldCode: "F", value: format(s1.generationHours), sourceLabel: "QLKT · DH1_MF1 · Số giờ phát" },
      { fieldCode: "L", value: format(s2.generationHours), sourceLabel: "QLKT · DH1_MF2 · Số giờ phát" },
      { fieldCode: "CS", value: format(standby), sourceLabel: "QLKT · Tổng dừng dự phòng S1 + S2" },
      { fieldCode: "CT", value: format(incident), sourceLabel: "QLKT · Tổng dừng sự cố S1 + S2" },
      { fieldCode: "CU", value: format(maintenance), sourceLabel: "QLKT · Bảo dưỡng kế hoạch + sửa chữa đột xuất S1 + S2" },
      { fieldCode: "CV", value: format(startupRaw), sourceLabel: "QLKT · Giờ khởi động còn lại trong 48 giờ tổ máy" },
    ];
  }

  function extract(expectedOperatingDate) {
    // PrimeFaces đổi giá trị ô ngày ngay lập tức nhưng bảng 02-PĐ/Sản lượng
    // vẫn có thể còn số liệu ngày cũ trong vài giây. Không cho bộ đọc trả kết
    // quả trong khoảng an toàn này; background sẽ tự thử lại.
    try {
      const preparedDate = sessionStorage.getItem(PREPARED_DATE_KEY);
      const refreshedAt = Number(sessionStorage.getItem(PREPARED_REFRESH_AT_KEY) || 0);
      const kind = pageKind();
      if (preparedDate === expectedOperatingDate && refreshedAt > 0
        && (kind === "pmis_02pd" || kind === "production")
        && Date.now() - refreshedAt < 4000) {
        throw new Error("QLKT đang tải dữ liệu của ngày vừa chọn, tiện ích đang chờ bảng cập nhật xong.");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("đang tải dữ liệu")) throw error;
    }
    const operatingDate = parseDate(expectedOperatingDate);
    if (!operatingDate) throw new Error("Không xác định được ngày báo cáo trên trang QLKT.");
    const currentPageKind = pageKind();
    if (currentPageKind === "meter") return extractPpaMeterPayload(operatingDate);
    if (currentPageKind === "heatrate") return extractHeatRatePayload(operatingDate);
    if (currentPageKind === "pmis_02pd") return extractPmis02PdPayload(operatingDate);
    const entries = new Map(), oilValues = [];
    const add = (fieldCode, candidate, sourceLabel) => {
      if (!candidate || candidate.value === null || entries.has(fieldCode)) return;
      entries.set(fieldCode, { fieldCode, value: candidate.value, sourceLabel });
    };
    if (currentPageKind === "operation") {
      for (const entry of operationSummaryEntries(document.querySelectorAll("tr"))) entries.set(entry.fieldCode, entry);
    }
    const allTables = [...document.querySelectorAll("table")];
    allTables.forEach(table => {
      const tableText = normalized(table.textContent);
      const candidates = inputsWithContext(table);
      const find = (headerParts, rowPart) => candidates.find(item => headerParts.every(part => item.header.includes(part)) && (!rowPart || item.row.includes(rowPart)));

      if (tableText.includes("sl diem ban") && tableText.includes("dien nang dau cuc")) {
        add("B", find(["dien nang dau cuc", "sl phat"], "mf1"), "QLKT · DH1_MF1 · SL phát");
        add("C", find(["sl diem ban"], "mf1"), "QLKT · DH1_MF1 · SL điểm bán");
        add("H", find(["dien nang dau cuc", "sl phat"], "mf2"), "QLKT · DH1_MF2 · SL phát");
        add("I", find(["sl diem ban"], "mf2"), "QLKT · DH1_MF2 · SL điểm bán");
      }

      if (tableText.includes("nhien lieu than")) {
        add("AJ", find(["nhiet tri cao lam viec"], null), "QLKT · Nhiệt trị cao làm việc HHV");
        add("AE", find(["to may dh1_mf1", "tong"], null), "QLKT · Than DH1_MF1 · Tổng");
        add("AF", find(["to may dh1_mf2", "tong"], null), "QLKT · Than DH1_MF2 · Tổng");
        add("AR", find(["ton (tan)"], null), "QLKT · Than tồn kho");
        add("AT", find(["kl than nhap"], null), "QLKT · Khối lượng than nhập");
      }

      if (tableText.includes("nhien lieu dau fo") && tableText.includes("nuoc tieu thu")) {
        const oilS1 = find(["nhien lieu dau fo", "tong"], "mf1"), oilS2 = find(["nhien lieu dau fo", "tong"], "mf2");
        if (oilS1?.value !== null && oilS1?.value !== undefined) oilValues.push(Number(oilS1.value));
        if (oilS2?.value !== null && oilS2?.value !== undefined) oilValues.push(Number(oilS2.value));
        add("CC", find(["nuoc tieu thu"], "mf1"), "QLKT · DH1_MF1 · Nước tiêu thụ");
        add("CD", find(["nuoc tieu thu"], "mf2"), "QLKT · DH1_MF2 · Nước tiêu thụ");
      }

      if (tableText.includes("so gio phat")) {
        const hours = candidates.filter(item => item.header.includes("so gio phat") && item.value !== null);
        add("F", hours.find(item => item.row.includes("mf1")) || hours[0], "QLKT · Tổ máy S1 · Số giờ phát");
        add("L", hours.find(item => item.row.includes("mf2")) || hours[1], "QLKT · Tổ máy S2 · Số giờ phát");
      }
    });
    if (currentPageKind === "production") {
      const rowInputs = unit => {
        const tables = [...document.querySelectorAll("table")];
        const numericInputs = [...document.querySelectorAll("input")]
          .map(input => ({ input, value: parseNumber(readValue(input)), rect: input.getBoundingClientRect() }))
          .filter(candidate => candidate.value !== null && candidate.rect.width > 0 && candidate.rect.height > 0);
        const unitLabels = [...document.querySelectorAll("td, th, div, span")]
          .map(element => ({ element, label: normalized(element.textContent), rect: element.getBoundingClientRect() }))
          .filter(candidate => candidate.label === unit && candidate.rect.width > 0 && candidate.rect.height > 0)
          .sort((left, right) => left.rect.width - right.rect.width);
        for (const label of unitLabels) {
          const labelCenterY = label.rect.top + label.rect.height / 2;
          const aligned = numericInputs
            .filter(candidate => Math.abs(candidate.rect.top + candidate.rect.height / 2 - labelCenterY) < 12 && candidate.rect.left > label.rect.left)
            .sort((left, right) => left.rect.left - right.rect.left);
          if (aligned.length >= 4) return aligned;
        }
        const labelRows = tables.flatMap(table => [...table.rows].map((row, rowIndex) => ({ row, rowIndex })))
          .filter(({ row }) => normalized(row.textContent).includes(unit));
        const ranked = [];
        for (const label of labelRows) {
          const labelRect = label.row.getBoundingClientRect();
          for (const table of tables) {
            [...table.rows].forEach((row, rowIndex) => {
              const inputs = [...row.querySelectorAll("input")]
                .map(input => ({ value: parseNumber(readValue(input)), input }))
                .filter(candidate => candidate.value !== null);
              if (inputs.length < 4) return;
              if (row === label.row) {
                ranked.push({ inputs, score: 2000 + inputs.length });
                return;
              }
              const rowRect = row.getBoundingClientRect();
              const aligned = labelRect.height > 0 && rowRect.height > 0
                && Math.abs((labelRect.top + labelRect.height / 2) - (rowRect.top + rowRect.height / 2)) < 12;
              const sameIndex = rowIndex === label.rowIndex;
              if (aligned || sameIndex) ranked.push({ inputs, score: (aligned ? 1000 : 0) + (sameIndex ? 100 : 0) + inputs.length });
            });
          }
        }
        return ranked.sort((left, right) => right.score - left.score)[0]?.inputs || [];
      };
      const s1 = rowInputs("dh1_mf1"), s2 = rowInputs("dh1_mf2");
      if (!entries.has("B")) add("B", s1[0], "QLKT · DH1_MF1 · SL phát");
      if (!entries.has("C")) add("C", s1[2], "QLKT · DH1_MF1 · SL điểm bán");
      if (!entries.has("H")) add("H", s2[0], "QLKT · DH1_MF2 · SL phát");
      if (!entries.has("I")) add("I", s2[2], "QLKT · DH1_MF2 · SL điểm bán");
      if (s1[0]?.value) entries.set("J157", { fieldCode: "J157", value: s1[0].value, sourceLabel: "QLKT · DH1_MF1 · SL phát (MWh)" });
      if (s1[2]?.value) entries.set("K157", { fieldCode: "K157", value: s1[2].value, sourceLabel: "QLKT · DH1_MF1 · SL điểm bán (MWh)" });
      if (s2[0]?.value) entries.set("J158", { fieldCode: "J158", value: s2[0].value, sourceLabel: "QLKT · DH1_MF2 · SL phát (MWh)" });
      if (s2[2]?.value) entries.set("K158", { fieldCode: "K158", value: s2[2].value, sourceLabel: "QLKT · DH1_MF2 · SL điểm bán (MWh)" });
      if (!entries.size) {
        const numericInputs = [...document.querySelectorAll("input")].filter(input => parseNumber(readValue(input)) !== null).length;
        throw new Error(`Bộ đọc v${CONTENT_SCRIPT_VERSION}: không ghép được hai hàng DH1_MF1/DH1_MF2 với vùng số liệu Sản lượng (đã thấy ${allTables.length} bảng, ${numericInputs} ô số).`);
      }
    }
    if (currentPageKind === "fuel" && ["AJ", "AE", "AF", "AR", "AT"].some(code => !entries.has(code))) {
      const coalRows = [...document.querySelectorAll("tr")]
        .filter(row => !row.querySelector("tr"))
        .map(row => [...row.querySelectorAll("input")]
        .map(input => ({ value: parseNumber(readValue(input)), input }))
        .filter(candidate => candidate.value !== null))
        .filter(row => row.length >= 15)
        .sort((left, right) => Math.abs(left.length - 15) - Math.abs(right.length - 15));
      const coal = coalRows[0] || [];
      if (!entries.has("AJ")) add("AJ", coal[0], "QLKT · Nhiệt trị cao làm việc HHV");
      if (!entries.has("AE")) add("AE", coal[4], "QLKT · Than DH1_MF1 · Tổng");
      if (!entries.has("AF")) add("AF", coal[8], "QLKT · Than DH1_MF2 · Tổng");
      if (!entries.has("AR")) add("AR", coal[13], "QLKT · Than tồn kho");
      if (!entries.has("AT")) add("AT", coal[14], "QLKT · Khối lượng than nhập");
    }
    if (currentPageKind === "operation" && (!entries.has("F") || !entries.has("L"))) {
      const hourHeader = [...document.querySelectorAll("th, td")].find(cell => {
        const label = normalized(cell.textContent);
        return !cell.querySelector("input") && label.includes("so gio phat") && label.length < 40;
      });
      const headerRect = hourHeader?.getBoundingClientRect();
      const hourFromRow = unit => {
        const row = [...document.querySelectorAll("tr")].find(candidate => normalized(candidate.textContent).includes(unit));
        if (!row) return null;
        const candidates = [...row.querySelectorAll("input")]
          .map(input => ({ input, value: parseNumber(readValue(input)), rect: input.getBoundingClientRect() }))
          .filter(candidate => candidate.value !== null && candidate.rect.width > 0 && candidate.rect.height > 0);
        if (!candidates.length) return null;
        if (headerRect?.width) {
          const headerCenter = headerRect.left + headerRect.width / 2;
          return candidates.sort((left, right) => {
            const leftDistance = Math.abs(left.rect.left + left.rect.width / 2 - headerCenter);
            const rightDistance = Math.abs(right.rect.left + right.rect.width / 2 - headerCenter);
            return leftDistance - rightDistance;
          })[0];
        }
        return candidates[1] || candidates[0];
      };
      if (!entries.has("F")) add("F", hourFromRow("dh1_mf1"), "QLKT · Tổ máy S1 · Số giờ phát");
      if (!entries.has("L")) add("L", hourFromRow("dh1_mf2"), "QLKT · Tổ máy S2 · Số giờ phát");
    }
    // QLKT reports electrical production in MWh, while the KTKT table stores
    // these four daily values in million kWh (1 million kWh = 1,000 MWh).
    for (const fieldCode of ["B", "C", "H", "I"]) {
      const entry = entries.get(fieldCode);
      if (!entry) continue;
      const sourceMwh = Number(entry.value);
      if (!Number.isFinite(sourceMwh)) continue;
      entries.set(fieldCode, {
        ...entry,
        value: String(sourceMwh / 1000),
        sourceLabel: `${entry.sourceLabel} · MWh → triệu kWh`,
      });
    }

    if (oilValues.length === 2) entries.set("X", { fieldCode: "X", value: String(oilValues[0] + oilValues[1]), sourceLabel: "QLKT · Tổng dầu FO S1 + S2" });
    if (!entries.size) {
      // Trước đây thông báo này không cho biết trang thực tế tab nền đang đứng
      // là gì — khiến không chẩn đoán được nguyên nhân thật khi tiện ích mở
      // nhầm trang (ví dụ URL đã ghi nhớ từ trước không còn hợp lệ, phiên hết
      // hạn, hoặc QLKT chuyển hướng về trang chủ) thay vì trang báo cáo đúng.
      const pageDiag = `[Trang hiện tại: "${document.title || ""}" — ${location.href}; nhận diện: ${currentPageKind || "không xác định"}; ${allTables.length} bảng trên trang]`;
      throw new Error(`Màn hình này chưa có chỉ tiêu nào trong danh sách đồng bộ. ${pageDiag}`);
    }
    return { version: 1, operatingDate, sourcePage: location.href, entries: [...entries.values()] };
  }

  function parseOperatingRow(row, defaultDate) {
    const cells = [...row.cells];
    if (cells.length < 4) return null;

    const dateTimeRegex = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/;
    const timeOnlyRegex = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

    const dateTimes = [];
    cells.forEach(cell => {
      const inputs = [...cell.querySelectorAll("input:not([type='checkbox']):not([type='radio']):not([type='hidden']), textarea")];
      const values = inputs.length ? inputs.map(i => cleanText(i.value || i.getAttribute("value") || "")) : [cleanText(cell.textContent)];
      for (const val of values) {
        const dtMatch = val.match(dateTimeRegex);
        if (dtMatch) {
          const formatted = `${dtMatch[3]}-${dtMatch[2].padStart(2, "0")}-${dtMatch[1].padStart(2, "0")} ${dtMatch[4].padStart(2, "0")}:${dtMatch[5].padStart(2, "0")}`;
          dateTimes.push(formatted);
        } else {
          const tMatch = val.match(timeOnlyRegex);
          if (tMatch && defaultDate) {
            dateTimes.push(`${defaultDate} ${tMatch[1].padStart(2, "0")}:${tMatch[2].padStart(2, "0")}`);
          }
        }
      }
    });

    if (dateTimes.length === 0) return null;
    const startAt = dateTimes[0];
    const endAt = dateTimes.length > 1 ? dateTimes[1] : "";

    // Event type: 1..5
    let eventType = 1;
    for (const cell of cells) {
      const select = cell.querySelector("select");
      if (select) {
        const selectedText = cleanText(select.options?.[select.selectedIndex]?.textContent || select.value || "");
        const numMatch = selectedText.match(/^([1-5])\b/);
        if (numMatch) { eventType = Number(numMatch[1]); break; }
      }
      const cellText = cleanText(cell.textContent);
      const textMatch = cellText.match(/^([1-5])\s*[-–]/);
      if (textMatch) { eventType = Number(textMatch[1]); break; }
    }

    // Description: text that is not a date/time/button
    let description = "";
    for (let i = cells.length - 1; i >= 0; i--) {
      const cell = cells[i];
      const input = cell.querySelector("input:not([type='checkbox']):not([type='radio']):not([type='hidden']), textarea");
      const text = cleanText(input ? (input.value || input.getAttribute("value") || "") : cell.textContent);
      if (text && !dateTimeRegex.test(text) && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text) && !/^[1-5]\s*[-–]/.test(text) && text.length > 2) {
        description = text;
        break;
      }
    }

    if (!startAt || !description) return null;
    return { startAt, endAt, eventType, description };
  }

  function classifyEventUnit(description) {
    const norm = normalized(description);
    const isS1 = /\b(s1|mf1)\b/i.test(description) || norm.includes("to may 1") || norm.includes("to may s1") || norm.includes("to 1") || norm.includes("lo 1") || norm.includes("s1");
    const isS2 = /\b(s2|mf2)\b/i.test(description) || norm.includes("to may 2") || norm.includes("to may s2") || norm.includes("to 2") || norm.includes("lo 2") || norm.includes("s2");

    if (isS1 && !isS2) return ["S1"];
    if (isS2 && !isS1) return ["S2"];
    return ["S1", "S2"];
  }

  function extractOperatingEvents(expectedOperatingDate) {
    const operatingDate = parseDate(expectedOperatingDate);
    if (!operatingDate) throw new Error("Không xác định được ngày báo cáo trên trang QLKT.");

    const tabHeader = [...document.querySelectorAll("a, button, span, th, td, div")].find(el => {
      const t = normalized(el.textContent);
      return t === "tinh hinh van hanh" && el.offsetWidth > 0;
    });
    if (tabHeader && tabHeader.getAttribute("aria-expanded") === "false") {
      try { tabHeader.click(); } catch { /* ignore */ }
    }

    const allRows = [...document.querySelectorAll("tr")];
    const s1Events = [];
    const s2Events = [];
    const seenS1 = new Set();
    const seenS2 = new Set();

    for (const row of allRows) {
      const parsed = parseOperatingRow(row, operatingDate);
      if (!parsed) continue;

      const units = classifyEventUnit(parsed.description);
      const key = `${parsed.startAt}|${parsed.endAt}|${parsed.eventType}|${parsed.description}`;

      if (units.includes("S1") && !seenS1.has(key)) {
        seenS1.add(key);
        s1Events.push(parsed);
      }
      if (units.includes("S2") && !seenS2.has(key)) {
        seenS2.add(key);
        s2Events.push(parsed);
      }
    }

    return {
      version: 1,
      operatingDate,
      sourcePage: location.href,
      kind: "operating-events",
      s1: s1Events.sort((a, b) => a.startAt.localeCompare(b.startAt)),
      s2: s2Events.sort((a, b) => a.startAt.localeCompare(b.startAt)),
      totalCount: s1Events.length + s2Events.length,
    };
  }

  globalThis.QlktOperatingExtractor = { parseOperatingRow, classifyEventUnit, extractOperatingEvents, operationRowSummary, operationSummaryEntries };
  globalThis.QlktHeatRateExtractor = { heatRateUnitFromText };
  globalThis.Qlkt02PdExtractor = { extractPmis02PdPayload };

  if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "GET_QLKT_PAGE_KIND") {
        const kind = pageKind();
        if (kind) rememberPage();
        sendResponse({ ok: Boolean(kind), pageKind: kind });
        return;
      }
      if (message?.type === "PREPARE_QLKT_DATE") {
        try { sendResponse({ ok: true, ...prepareDate(message.operatingDate) }); }
        catch (error) {
          const message = error instanceof Error ? error.message : "Không đặt được ngày QLKT.";
          sendResponse({ ok: false, retryable: message.includes("nút cập nhật ngày"), error: message });
        }
        return;
      }
      if (message?.type === "READ_QLKT_EVENTS") {
        try {
          const payload = extractOperatingEvents(message.operatingDate);
          sendResponse({ ok: true, payload });
        } catch (error) {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "Không đọc được nhật ký sự kiện." });
        }
        return;
      }
      if (message?.type !== "READ_QLKT_VALUES") return;
      // extract() đồng bộ với hầu hết màn hình, nhưng bất đồng bộ (Promise) với màn hình Cân bằng
      // nhiệt (phải chuyển dropdown Tổ máy và chờ AJAX) — bọc trong Promise.resolve().then() để xử lý
      // đúng cả 2 trường hợp mà không cần biết trước extract() trả về gì.
      Promise.resolve()
        .then(() => pageKind() === "meter" ? extractPpaMeterPayload(message.operatingDate, { stoppedUnits: message.stoppedUnits || [] }) : extract(message.operatingDate))
        .then(payload => sendResponse({ ok: true, payload, pageKind: pageKind() }))
        .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Không đọc được dữ liệu QLKT." }));
      return true;
    });
  }

  if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.documentElement) {
    rememberPage();
    const recognitionObserver = new MutationObserver(() => {
      if (!pageKind()) return;
      rememberPage();
      recognitionObserver.disconnect();
    });
    recognitionObserver.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => recognitionObserver.disconnect(), 15000);
  }
})();
