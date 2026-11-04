import { buildMilestoneSchedule } from "../../../lib/overhaul-milestones.ts";
export const ctktktIntegrationPreset = {
  description: "Các báo cáo KTKT với số liệu đã chuyển local; chỉ đọc. Giả lập thông báo đại tu vì DB dev cũ thiếu cột ngoài phân hệ này.",
  async prepare() { return {}; },
  routes: () => [...["", "/ctktkt-report", "/pmis-report", "/ppa-heat-rate", "/water-report", "/chemical-usage", "/bcsx-report", "/admin/data-backup", "/admin/data-history", "/tien-ich-dong-bo"].map(path => "/tien-ich/chi-tieu-ktkt" + path), "/admin/roles"],
  async mock(context) {
    await context.route("**/api/overhaul-milestones", route => route.fulfill({ json: { data: buildMilestoneSchedule([], new Date()), meta: null, error: null } }));
  },
  async interact(page, route) {
    if (route.includes("/admin/")) return;
    const month = page.locator('input[type="month"]').first();
    if (await month.count()) await month.fill("2026-10");
    else {
      const date = page.locator('input[type="date"]').first();
      if (await date.count()) await date.fill("2026-10-19");
    }
    await page.waitForTimeout(1000);
  },
};
