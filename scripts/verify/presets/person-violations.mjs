import assert from "node:assert/strict";

const company = "Nhà thầu đại tu kiểm tra vi phạm";
const person = { id: "ui-violation-person", code: "UI-VP-01", name: "Nguyễn Văn Nhân Viên Đại Tu", company, phone: "", canCommand: false, isActive: true, version: 1, scope: "OVERHAUL", jobTitle: "Công nhân giàn giáo", activeWorks: [], violations: [
  { id: "v1", description: "Không đeo dây an toàn khi làm việc trên cao trong phạm vi PCT.", recordedAt: "2026-10-14T08:00:00+07:00", recordedById: "ui", recordedByName: "Người cho phép" },
  { id: "v2", description: "Tự ý làm việc ngoài phạm vi cho phép của phiếu công tác.", recordedAt: "2026-10-15T09:00:00+07:00", recordedById: "ui", recordedByName: "Người cho phép" },
] };

export function personViolationsPreset(dialog = false) {
  return {
    description: "Nhân sự có lịch sử vi phạm, dữ liệu giả lập; không ghi DB",
    async prepare() { return {}; },
    routes: () => ["/work-permits"],
    async mock(context) {
      await context.route("**/api/overhaul-milestones**", route => route.fulfill({ json: { data: [], meta: null, error: null } }));
      await context.route("**/api/work-permits**", async route => {
        const path = new URL(route.request().url()).pathname;
        let data = [], meta = null;
        if (path === "/api/work-permits") meta = { total: 0, pageSize: 25, counts: {}, overhaulCount: 0, canIssue: false, canIssueNew: false, canExecute: false };
        else if (path === "/api/work-permits/companies") {
          data = [{ company, code: "VP", sctx: false, overhaul: true, investment: false, cardsValid: 2, cardsExpired: 0, trained: 2, total: 2, commanders: 0, active: 2, working: 0, workingToday: 0, violatingPeople: 1 }];
          meta = { canWrite: true, working: 0 };
        } else if (path === "/api/work-permits/people") {
          data = [person, { ...person, id: "ui-clean", code: "UI-VP-02", name: "Trần Văn Chưa Vi Phạm", violations: [] }];
          meta = { total: 2, pageSize: 200, canWrite: true };
        } else if (path.endsWith("/violations")) {
          if (route.request().method() === "GET") return route.fulfill({ json: { data: person, meta: null, error: null } });
          assert.equal(route.request().method(), "POST");
          const body = route.request().postDataJSON();
          assert.equal(body.version, person.version);
          assert.equal(body.description, "Không sử dụng bảo hộ lao động");
          data = { ...person, version: 2, violations: [...person.violations, { ...person.violations[0], id: "v3", description: body.description }] };
        }
        await route.fulfill({ json: { data, meta, error: null } });
      });
    },
    async interact(page) {
      const desktop = page.getByRole("button", { name: /^Nhân sự nhà thầu/ }).locator("visible=true");
      if (await desktop.count()) await desktop.first().click();
      else await page.getByRole("button", { name: /^Đang xem:/ }).click();
      await page.getByRole("menuitem", { name: /Đại tu/ }).first().click();
      await page.getByText("1 nhân viên đã vi phạm").locator("visible=true").waitFor();
      if (page.viewportSize().width < 768) await page.getByRole("button", { name: new RegExp(company) }).first().click();
      else await page.getByRole("row").filter({ hasText: company }).click();
      await page.getByText("Đã vi phạm 2 lần · Cần chú ý đặc biệt").locator("visible=true").waitFor();
      if (dialog) {
        await page.getByRole("button", { name: "Ghi nhận vi phạm", exact: true }).locator("visible=true").first().click();
        await page.getByRole("dialog").getByRole("textbox").fill("Không sử dụng bảo hộ lao động");
      }
    },
  };
}
