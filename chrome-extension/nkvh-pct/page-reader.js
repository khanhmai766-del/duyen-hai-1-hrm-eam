// Đọc cùng một bản HTML đã lưu cho trang chi tiết và đối chiếu danh sách.
(() => {
  const fold = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/\s+/g, " ").trim();
  const numberPattern = /^\d{1,80}\/20\d{2}\/(?:vh1-nddh|nddh-vh1)$/;
  function read(doc, kind) {
    const form = doc.getElementById("formContent");
    const cells = [...(form?.querySelectorAll(".ui-panelgrid-cell") || [])].filter(el => !el.closest(".ui-dialog"));
    const cell = pattern => cells.find(el => !el.querySelector("input, select, textarea, table") && pattern.test(fold(el.textContent)))?.nextElementSibling;
    const selected = el => {
      if (!el) return "";
      return (el.querySelector("select option:checked")?.textContent || el.querySelector(".ui-selectonemenu-label")?.textContent || el.textContent || "").replace(/\u00a0/g, " ").trim();
    };
    const areas = {};
    let pending = null;
    for (const el of form?.querySelectorAll(".ui-panelgrid-cell, textarea") || []) {
      if (el.closest(".ui-dialog")) continue;
      if (el.tagName === "TEXTAREA") { if (pending && !areas[pending]) areas[pending] = el.value.trim(); pending = null; }
      else if (!el.querySelector("input, select, textarea, table")) {
        const label = fold(el.textContent);
        pending = /dia diem/.test(label) ? "location" : /noi dung/.test(label) ? "content" : /^pham vi/.test(label) ? "workScope" : null;
      }
    }
    const end = doc.getElementById("formContent:id_endDateKH_input");
    const calendars = [...(end?.closest("tr")?.querySelectorAll(".ui-calendar input") || [])];
    const teamCell = cell(/^don vi cong tac:?$/);
    const qlvhCell = cell(/^don vi qlvh:?$/);
    const team = teamCell?.querySelector("select option:checked");
    const qlvh = qlvhCell?.querySelector("select option:checked");
    const qlvhCode = qlvh?.value || (/phan xuong van hanh 1/.test(fold(selected(qlvhCell))) ? "VH" : "");
    const formattedNumber = doc.getElementById("formContent:txtSoPhieu")?.value.trim() || "";
    const step = Number(cells.map(el => fold(el.textContent)).find(label => /^trang thai b\d+:?$/.test(label))?.match(/b(\d+)/)?.[1] || 0);
    const page = {
      step, registrationNumber: cell(/^so phieu dkct:?$/)?.textContent.trim() || "",
      teamCode: team?.value || "", teamLabel: selected(teamCell), qlvhCode,
      classification: form?.querySelector('input[name="formContent:city2"]:checked')?.value || "",
      disciplines: [...(doc.getElementById("formContent:pngLoaiPhieu")?.querySelectorAll("td") || [])]
        .filter(td => td.querySelector("input[type=checkbox]")?.checked || td.querySelector(".ui-chkbox-box.ui-state-active")).map(td => td.textContent.trim()),
      location: areas.location || [...doc.querySelectorAll("#formContent\\:dtThietBi_data tr:not(.ui-datatable-empty-message)")].map(row => [...row.cells].slice(0, 2).map(td => td.textContent.trim()).join(" - ")).join("; "),
      content: areas.content || "", workScope: areas.workScope || "",
      plannedStartAt: calendars.find(input => input !== end)?.value || "", plannedEndAt: end?.value || "",
      commanderName: selected(cell(/nguoi chi huy truc tiep/)), leaderName: selected(cell(/nguoi lanh dao cong viec/)),
      workerCount: cell(/so luong nhan vien/)?.querySelector("input")?.value.trim() || "",
      issuedAt: selected(cell(/phieu cong tac cap ngay|thoi gian cap phieu/)),
      issuerName: selected(cell(/^nguoi cap phieu:?$/)), authorizerPosition: selected(cell(/chuc danh nguoi cho phep lam viec/)),
    };
    let sourceStatus = "ISSUED", sourceReason = "";
    for (const el of form?.querySelectorAll("span") || []) {
      if (el.closest(".ui-dialog")) continue;
      const notice = fold(el.textContent).match(/^phieu (?:da |bi )*(huy|dung)\b/);
      if (notice) {
        sourceStatus = notice[1] === "huy" ? "CANCELLED" : "PAUSED";
        sourceReason = el.textContent.match(/L[ýy]\s*do[^:]*:\s*(.*)$/i)?.[1]?.replace(/[\s.]+$/, "") || "";
        break;
      }
    }
    if (sourceStatus === "ISSUED") {
      const expected = kind === "ELECTRICAL" ? /^b8:\s*hoan thanh phieu$/ : /^b5:\s*khoa phieu cong tac$/;
      const last = [...doc.querySelectorAll("button, a, [role=button], input[type=button]")].find(el => expected.test(fold(el.value || el.textContent)));
      if (last && [last, ...last.querySelectorAll("*")].some(el => {
        if (/success/.test(String(el.className))) return true;
        const rgb = el.style.backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)?.slice(1).map(Number);
        return rgb && rgb[1] >= 120 && rgb[1] > rgb[0] * 1.25 && rgb[1] > rgb[2] * 1.15;
      })) sourceStatus = "CLOSED";
    }
    if (!numberPattern.test(fold(formattedNumber).replace(/\s+/g, "")) || step !== 1 || !page.content || qlvhCode !== "VH") {
      throw new Error("Chưa đọc đủ số, nội dung và đơn vị PXVH1 từ phiếu đã lưu ở bước B1 trên NKVH.");
    }
    return { formattedNumber, page, sourceStatus, sourceReason };
  }
  window.PXVH1_NKVH_READER = { read };
})();
