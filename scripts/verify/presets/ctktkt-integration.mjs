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

export const ctktktPermissionsPreset = {
  ...ctktktIntegrationPreset,
  description: "Phân quyền KTKT theo cương vị: bảng quản trị, nhóm KTKT, hộp khôi phục và RBAC chỉ còn cửa vào. Chỉ đọc và sửa bản nháp trên trình duyệt.",
  routes: () => ["/tien-ich/chi-tieu-ktkt", "/tien-ich/chi-tieu-ktkt/phan-quyen", "/tien-ich/chi-tieu-ktkt/phan-quyen?verify=ktkt", "/tien-ich/chi-tieu-ktkt/phan-quyen?verify=reset", "/tien-ich/chi-tieu-ktkt/admin/data-backup", "/tien-ich/chi-tieu-ktkt/admin/data-history", "/admin/roles"],
  async interact(page, route) {
    if (!route.includes("/phan-quyen")) return ctktktIntegrationPreset.interact(page, route);
    await page.getByRole("heading", { name: "Phân quyền KTKT", exact: true }).waitFor();
    await page.getByLabel("Nhóm quyền", { exact: true }).waitFor();
    if (route.includes("verify=ktkt")) {
      await page.getByLabel("Nhóm quyền", { exact: true }).selectOption("2");
      await page.getByLabel("Tìm cương vị", { exact: true }).fill("Trưởng kíp điện");
      await page.getByRole("checkbox", { name: "Trưởng kíp điện — Bảng TKĐ trend DCS", exact: true }).uncheck();
      await page.getByText("Có thay đổi chưa lưu.", { exact: true }).waitFor();
    }
    if (route.includes("verify=reset")) await page.getByRole("button", { name: "Khôi phục mặc định bản gốc", exact: true }).click();
  },
};
