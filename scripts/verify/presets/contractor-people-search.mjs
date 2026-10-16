import assert from "node:assert/strict";
import { personViolationsPreset } from "./person-violations.mjs";

const company = "Công ty Cổ phần Dịch vụ Kỹ thuật và Bảo dưỡng Nhà máy Điện Duyên Hải";
const other = "Nhà thầu SXKD kiểm tra tra cứu";
const fold = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
const rows = Array.from({ length: 27 }, (_, i) => ({
  id: `ui-search-${i}`, code: `SEARCH-${String(i).padStart(3, "0")}`, name: i === 0 ? "Nguyễn Văn An" : `Trần Văn Bình ${i}`,
  company: i === 26 ? other : company, phone: `090012${String(i).padStart(4, "0")}`,
  canCommand: false, isActive: i !== 26, version: 1, scope: i === 26 ? "SCTX" : "OVERHAUL", activeWorks: [],
  violations: i === 0 ? [{ id: "v1", description: "Không đeo dây an toàn khi làm việc trên cao.", recordedAt: "2026-10-16T08:00:00+07:00", recordedByName: "Người cho phép" }] : [],
}));

export const contractorPeopleSearchPreset = {
  description: "Tra cứu toàn danh bạ: nhà thầu, không dấu, thẻ, SĐT, phân trang và vi phạm; không ghi DB",
  async prepare() { return {}; },
  routes: () => ["/work-permits"],
  async mock(context) {
    await personViolationsPreset().mock(context);
    await context.route("**/api/work-permits/companies?**", route => route.fulfill({ json: { data: [
      { company, code: "DHKT", overhaul: true, investment: false, cardsValid: 26, cardsExpired: 0, trained: 26, total: 26, active: 26, commanders: 0, working: 0, violatingPeople: 1 },
      { company: other, code: "SXKD", sctx: true, investment: false, cardsValid: 0, cardsExpired: 0, trained: 0, total: 1, active: 0, commanders: 0, working: 0, violatingPeople: 0 },
    ], meta: { canWrite: false, working: 0 }, error: null } }));
    await context.route("**/api/work-permits/people?**", route => {
      const p = new URL(route.request().url()).searchParams;
      assert.equal(p.has("scope"), false);
      assert.equal(p.get("active"), "0");
      const q = fold(p.get("q") || "");
      const matches = rows.filter(row => (!p.get("company") || row.company === p.get("company")) && fold(`${row.name} ${row.code} ${row.phone}`).includes(q));
      const page = Number(p.get("page") || 1), pageSize = 25;
      return route.fulfill({ json: { data: matches.slice((page - 1) * pageSize, page * pageSize), meta: { total: matches.length, pageSize, canWrite: false }, error: null } });
    });
  },
  async interact(page) {
    const desktop = page.getByRole("button", { name: /^Nhân sự nhà thầu/ }).locator("visible=true");
    if (await desktop.count()) await desktop.first().click();
    else await page.getByRole("button", { name: /^Đang xem:/ }).click();
    await page.getByRole("menuitem", { name: /Đại tu/ }).first().click();
    await page.getByRole("button", { name: "Tra cứu nhân viên", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const list = dialog.getByRole("list", { name: "Kết quả tra cứu nhân viên" });
    await dialog.getByText("Trang 1/2", { exact: true }).waitFor();
    assert.equal(await list.locator(":scope > li").count(), 25, "Trang đầu phải có 25 kết quả");
    await dialog.getByRole("button", { name: "Sau", exact: true }).click();
    await dialog.getByText("Trang 2/2", { exact: true }).waitFor();
    await list.getByText("Ngừng hoạt động", { exact: true }).waitFor();
    await dialog.getByLabel("Tìm nhà thầu", { exact: true }).fill("sxkd");
    await dialog.getByLabel("Nhà thầu", { exact: true }).selectOption(other);
    await dialog.getByText(`1 nhân viên thuộc ${other}`, { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
    const input = dialog.getByLabel("Tìm nhân viên", { exact: true });
    for (const q of ["nguyen van an", "SEARCH-000", "0900120000"]) {
      await input.fill(q);
      await dialog.getByText("1 nhân viên trong toàn danh bạ", { exact: true }).waitFor();
      await list.getByText("Nguyễn Văn An", { exact: true }).waitFor();
    }
    await dialog.getByLabel("Nhà thầu", { exact: true }).selectOption(other);
    await dialog.getByText(/Không có nhân viên phù hợp/).waitFor();
    await dialog.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
    await dialog.getByLabel("Tìm nhà thầu", { exact: true }).fill("dhkt");
    await dialog.getByLabel("Nhà thầu", { exact: true }).locator("option").filter({ hasText: "DHKT" }).waitFor({ state: "attached" });
    assert.equal(await dialog.getByLabel("Nhà thầu", { exact: true }).locator("option").count(), 2, "Tìm theo mã DHKT chỉ còn nhà thầu tương ứng và lựa chọn tất cả");
    await dialog.getByLabel("Nhà thầu", { exact: true }).selectOption(company);
    await dialog.getByText(`26 nhân viên thuộc ${company}`, { exact: true }).waitFor();
    await dialog.getByText("Đã vi phạm 1 lần", { exact: true }).waitFor();
    await dialog.getByText("Chưa ghi nhận vi phạm", { exact: true }).first().waitFor();
  },
};
