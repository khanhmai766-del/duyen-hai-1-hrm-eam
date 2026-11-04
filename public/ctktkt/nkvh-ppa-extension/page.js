// Injected only on NKVH in the page's world to use its existing filter handlers.
async function nkvhPage(action, args) {
  if (location.hostname !== "nkvh.tpcduyenhai.com.vn") throw new Error("Sai tên miền.");
  const norm = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi,"d").toLowerCase().replace(/[_\s]+/g," ").trim();
  const tableWith = needle => [...document.querySelectorAll("table")].filter(table => [...table.rows].some(row => [...row.cells].some(cell => cell.tagName === "TH") && norm(row.innerText).includes(needle)));
  const busy = () => {
    try { return !!(window.PrimeFaces?.ajax?.Queue && !window.PrimeFaces.ajax.Queue.isEmpty()); } catch { return false; }
  };
  const bookSelect = () => document.getElementById("formContent:cbxSoNkvh_input") || [...document.querySelectorAll("select")].find(el => [...el.options].some(o => /dh1.*lo truong.*s1/.test(norm(o.text))));
  if (action === "state") return {path:location.pathname,ready:document.readyState,busy:busy()};
  if (action === "book") {
    const el = bookSelect();
    if (!el || ![...el.options].some(o => o.value === args.book)) throw new Error("Không tìm thấy sổ cần đọc.");
    el.value = args.book;
    if (window.jQuery) window.jQuery(el).trigger("change");
    else el.dispatchEvent(new Event("change",{bubbles:true}));
    return true;
  }
  if (action === "filter") {
    const book = bookSelect();
    const begin = document.getElementById("formContent:j_idt83_input");
    const end = document.getElementById("formContent:cldEnd_input");
    const button = [...document.querySelectorAll("button,input[type=submit]")].find(el => norm(el.innerText || el.value) === "tong hop");
    if (!book || book.value !== args.book || !begin || !end || !button) throw new Error("Bộ lọc NKVH đã thay đổi; không thao tác tiếp.");
    begin.value = args.from; end.value = args.to;
    button.click(); return true;
  }
  if (action === "list") {
    const books = bookSelect();
    const table = tableWith("so nkvh").find(table => [...table.rows].some(row => row.cells.length >= 8 && !row.querySelector("th")));
    if (!table) return {rows:[],book:books?.value,busy:busy()};
    const rows = [...table.rows].filter(row => row.cells.length >= 8 && !row.querySelector("th")).map(row => {
      const cells = [...row.cells];
      const button = cells[7].querySelector("button");
      return {book:cells[1].innerText.trim(),shift:cells[2].innerText.trim(),date:cells[3].innerText.trim(),start:cells[4].innerText.trim(),end:cells[5].innerText.trim(),status:cells[6].innerText.trim(),button:button?.id};
    });
    // PrimeFaces paginator metadata, without changing or storing form state.
    const container = table.closest(".ui-datatable");
    const next = container?.querySelector(".ui-paginator-next");
    return {rows,book:books?.value,busy:busy(),hasNext:!!next && !next.classList.contains("ui-state-disabled")};
  }
  if (action === "next") {
    const table = tableWith("so nkvh")[0];
    const next = table?.closest(".ui-datatable")?.querySelector(".ui-paginator-next:not(.ui-state-disabled)");
    if (!next) throw new Error("Không tìm thấy trang nhật ký tiếp theo.");
    next.click(); return true;
  }
  if (action === "open") {
    const el = document.getElementById(args.button);
    const row = el?.closest("tr"), cells = row ? [...row.cells] : [];
    if (el?.tagName !== "BUTTON" || cells.length < 8 || cells[7].querySelector("button") !== el ||
        cells[1].innerText.trim() !== args.bookLabel || cells[2].innerText.trim() !== args.shift || cells[3].innerText.trim() !== args.date) {
      throw new Error("Dòng nhật ký thay đổi; không mở nhầm ca.");
    }
    el.click(); return true;
  }
  if (action === "detail") {
    const table = document.querySelector('textarea[id*="formContent:dt_thvh:"]')?.closest("table") || tableWith("tinh hinh trong ca").find(table => [...table.rows].some(row => row.querySelector("textarea")));
    const header = tableWith("tinh hinh trong ca").length > 0;
    if (!header) throw new Error("Chưa thấy bảng Tình hình trong ca.");
    const rows = table ? [...table.rows].filter(row => row.cells.length === 3 && row.cells[2].querySelector("textarea")).map((row,index) => ({index,
      start:row.cells[0].querySelector("input:not([type=hidden])")?.value || "",
      end:row.cells[1].querySelector("input:not([type=hidden])")?.value || "",
      content:row.cells[2].querySelector("textarea")?.value || ""})) : [];
    const begin = document.getElementById("formContent:j_idt100_input");
    const end = document.getElementById("formContent:cldEnd_input");
    const url = new URL(location.href);
    return {rows,shiftStart:begin?.value || "",shiftEnd:end?.value || "",url:url.origin+url.pathname+"?"+new URLSearchParams([...url.searchParams].filter(([key]) => ["path","idnkvh"].includes(key))).toString()};
  }
  throw new Error("Thao tác không được hỗ trợ.");
}
