import assert from "node:assert/strict";

const COMPANY = "Công ty Cổ phần Dịch vụ Kỹ thuật Nhà máy Nhiệt điện (giả lập)";
const OTHER = "Đơn vị có kết quả sau người thứ 200";
const envelope = (data, meta = null) => ({ data, meta, error: null });
const fold = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
const person = (i, patch = {}) => ({ id: `ui-chtt-${i}`, code: `UI-CHTT-${i}`, name: `Nguyễn Văn Đối Chiếu ${String(i).padStart(3, "0")}`,
  company: COMPANY, phone: "0912345678", canCommand: false, isActive: true, version: 1, scope: "OVERHAUL",
  jobTitle: "Công nhân cơ khí (CHTT đạt)", activeWorks: [], violations: [], ...patch });

/** Gợi ý CHTT, tìm chức vụ >200 người, phân trang và bật vai trò: chỉ ghi vào dữ liệu giả lập. */
export const commanderCandidatesPreset = {
  description: "Nhân sự nhà thầu: tìm chức vụ không dấu, rà soát CHTT và bật vai trò bằng dữ liệu giả lập",
  async prepare() { return {}; },
  routes: () => ["base", "search", "pending", "last"].map(state => `/work-permits?tab=people&nhom=OVERHAUL&ui=${state}`),
  async mock(context) {
    const createPeople = () => [
      ...Array.from({ length: 26 }, (_, i) => person(i + 1)),
      ...Array.from({ length: 201 }, (_, i) => person(i + 101, { canCommand: true, company: i === 200 ? OTHER : COMPANY })),
      person(401, { jobTitle: "CHTT chưa đạt" }), person(402, { jobTitle: "Không đạt CHTT" }),
      person(403, { isActive: false }), person(404, { scope: "SCTX" }),
    ];
    const pages = new WeakMap();
    await context.route("**/api/overhaul-milestones**", route => route.fulfill({ json: envelope([]) }));
    await context.route("**/api/work-permits**", async route => {
      const page = route.request().frame().page();
      if (!pages.has(page)) pages.set(page, createPeople());
      const people = pages.get(page);
      const url = new URL(route.request().url()), p = url.searchParams;
      if (url.pathname === "/api/work-permits/companies") {
        const rows = [COMPANY, OTHER].map((company, i) => {
          const list = people.filter(row => row.company === company && row.scope === "OVERHAUL");
          return { company, code: i ? "SAU200" : "KT", overhaul: true, sctx: false, investment: false,
            total: list.length, active: list.filter(row => row.isActive).length, commanders: list.filter(row => row.canCommand).length,
            cardsValid: 0, cardsExpired: 0, trained: list.length, working: 0, workingToday: 0 };
        });
        return route.fulfill({ json: envelope(rows, { canWrite: true, working: 0, workingToday: 0 }) });
      }
      if (url.pathname.startsWith("/api/work-permits/people/")) {
        assert.equal(route.request().method(), "PUT", "Chỉ cho đổi vai trò trên hồ sơ giả lập");
        const current = people.find(row => row.id === url.pathname.split("/").pop());
        assert.ok(current);
        const body = route.request().postDataJSON();
        assert.equal(body.version, current.version);
        assert.equal(body.canCommand, true);
        Object.assign(current, body, { version: current.version + 1 });
        return route.fulfill({ json: envelope(current) });
      }
      if (url.pathname === "/api/work-permits/people") {
        let list = people.filter(row => !p.get("scope") || row.scope === p.get("scope"));
        if (p.get("company")) list = list.filter(row => row.company === p.get("company"));
        if (p.get("pendingCommand") === "1") list = list.filter(row => row.isActive && !row.canCommand && row.jobTitle === "Công nhân cơ khí (CHTT đạt)");
        const q = fold(p.get("q") || "");
        list = list.filter(row => fold([row.code, row.name, row.phone, row.company, row.jobTitle].join(" ")).includes(q));
        const total = list.length, size = p.get("limit") === "200" ? 200 : 25, page = Number(p.get("page") || 1);
        list.sort((a, b) => Number(b.canCommand) - Number(a.canCommand) || a.name.localeCompare(b.name));
        return route.fulfill({ json: envelope(list.slice((page - 1) * size, page * size), { total, pageSize: size, canWrite: true }) });
      }
      return route.fulfill({ json: envelope([], { total: 0, counts: {}, canIssue: true, canExecute: true }) });
    });
  },
  async interact(page, route) {
    // Linh vật nổi không thuộc màn hình đang kiểm tra và có thể che nút phân trang.
    await page.addStyleTag({ content: "[data-ui-overlay]{display:none!important}" });
    const state = new URL(route, "http://localhost").searchParams.get("ui");
    const filter = () => page.getByRole("button", { name: /^Chờ cập nhật CHTT/ });
    await page.getByRole("button", { name: "Chờ cập nhật CHTT (26)", exact: true }).waitFor();
    const search = page.getByRole("searchbox", { name: "Tìm đơn vị nhà thầu, nhân viên hoặc CHTT" });
    if (state === "search") {
      await search.fill("chtt dat");
      if (page.viewportSize().width < 768) await page.getByText(OTHER, { exact: true }).locator("visible=true").waitFor();
      else await page.getByRole("row").filter({ hasText: OTHER }).waitFor();
      assert.equal(await filter().getAttribute("aria-pressed"), "false");
      // Kết quả của đơn vị OTHER nằm ở trang API thứ hai.
      await page.getByRole("combobox", { name: "Lọc theo nhà thầu", exact: true }).selectOption(OTHER);
      await page.getByText("Nguyễn Văn Đối Chiếu 301", { exact: true }).locator("visible=true").waitFor();
      return;
    }
    if (state === "base") return;
    await filter().click();
    await page.getByText("Số thẻ: UI-CHTT-1", { exact: true }).locator("visible=true").waitFor();
    assert.equal(await page.getByText("CHTT chưa đạt", { exact: true }).locator("visible=true").count(), 0);
    assert.equal(await page.getByText("Không đạt CHTT", { exact: true }).locator("visible=true").count(), 0);
    if (state === "last") {
      await page.getByRole("button", { name: "Sau", exact: true }).click();
      await page.getByText("Số thẻ: UI-CHTT-26", { exact: true }).locator("visible=true").waitFor();
      await page.getByRole("switch", { name: /^Vai trò của Nguyễn Văn Đối Chiếu 026:/ }).locator("visible=true").click();
      await page.getByRole("button", { name: "Chờ cập nhật CHTT (25)", exact: true }).waitFor();
      await page.getByText("25 người · Trang 1", { exact: true }).waitFor();
      await page.getByText("Số thẻ: UI-CHTT-1", { exact: true }).locator("visible=true").waitFor();
    } else {
      await page.getByRole("combobox", { name: "Lọc theo nhà thầu", exact: true }).selectOption(COMPANY);
      await search.fill("chtt dat");
      await page.getByText("Số thẻ: UI-CHTT-1", { exact: true }).locator("visible=true").waitFor();
      await page.getByRole("switch", { name: /^Vai trò của Nguyễn Văn Đối Chiếu 001:/ }).locator("visible=true").click();
      await page.getByRole("button", { name: "Chờ cập nhật CHTT (25)", exact: true }).waitFor();
      await page.getByText("Số thẻ: UI-CHTT-1", { exact: true }).locator("visible=true").waitFor({ state: "hidden" });
      await search.fill("khong-ton-tai");
      await page.getByText(/Không có người chờ cập nhật CHTT khớp bộ lọc/).waitFor();
      await search.fill("chtt dat");
      await page.getByText("Số thẻ: UI-CHTT-2", { exact: true }).locator("visible=true").waitFor();
    }
    await filter().scrollIntoViewIfNeeded();
    const box = await filter().boundingBox();
    if (box) await page.evaluate(y => window.scrollBy(0, y - 120), box.y);
  },
};
