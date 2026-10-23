// Hộp "Lịch sử làm việc trong ngày" (tab Nhân sự nhà thầu · Đại tu): bảng đơn vị và đơn vị giả lập, không ghi DB.
const COMPANIES = [
  ["CTy Cổ Phần EPS", "EPS", 66], ["CTy Cổ Phần Sửa Chữa Nhiệt Điện Miền Bắc", "NPS", 303], ["CTy Cổ phần Vật tư & Thiết bị công nghiệp", "VATCO", 12],
  ["CTy CP Đầu tư và Phát triển S3A", "S3A", 31], ["Công ty TNHH Sinh Lộc", "SINH LỘC", 122], ["Công ty CP Kỹ thuật Dịch vụ IDC (tên đơn vị rất dài để thử cắt chữ)", "IDC", 462],
  ["AK-PVPS-MEI.26", "AK-PVPS-MEI.26", 78], ["Công ty TEE", "TEE", 53],
];
const json = (data, meta = null) => ({ data, meta, error: null });
const vnDay = (offset) => new Date(Date.now() + 7 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);

function history(from, to) {
  const days = [];
  for (let offset = -61; offset <= 0; offset++) { const day = vnDay(offset); if (day >= from && day <= to) days.push(day); }
  return days.map((day, index) => {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const byCompany = {};
    COMPANIES.forEach(([name, , active], k) => {
      // Cuối tuần ít người, có đơn vị nghỉ hẳn vài ngày — đủ để thấy các nấc màu và ô trống.
      const factor = (weekday === 0 ? 0.15 : weekday === 6 ? 0.45 : 0.55) + ((index * 7 + k * 3) % 5) * 0.07;
      const count = k === 2 && index % 3 === 0 ? 0 : Math.round(active * factor);
      if (count) byCompany[name] = count;
    });
    const sum = Object.values(byCompany).reduce((a, b) => a + b, 0);
    return { day, total: Math.max(0, sum - (index % 4)), byCompany };
  });
}

export const dailyHistoryPreset = {
  description: "Hộp Lịch sử làm việc trong ngày: bảng đơn vị × ngày, xem một đơn vị và bung danh sách người của một ngày — giả lập, không ghi",
  async prepare() { return {}; },
  routes: () => ["/work-permits?ui=lich-su-tat-ca", "/work-permits?ui=lich-su-don-vi"],
  async mock(context) {
    await context.route("**/api/overhaul-milestones**", route => route.fulfill({ json: json([]) }));
    await context.route("**/api/work-permits/companies?summary=1**", route => route.fulfill({ json: json(COMPANIES.map(([company, code, active], k) => ({
      company, code, sctx: false, overhaul: true, investment: false, total: active + (k % 3), commanders: Math.ceil(active / 4), active,
      cardsValid: active, cardsExpired: 0, trained: active, working: k % 2 ? Math.round(active / 5) : 0, workingToday: Math.round(active * 0.6), violatingPeople: k === 1 ? 1 : 0,
    })), { canWrite: true, working: 40, workingToday: 623, workingDay: vnDay(0), scope: "OVERHAUL" }) }));
    await context.route("**/api/work-permits/companies/daily-history?**", route => {
      if (route.request().method() !== "GET") throw new Error("Lịch sử chỉ đọc");
      const params = new URL(route.request().url()).searchParams;
      if (params.has("company")) return route.fulfill({ json: json(Array.from({ length: 23 }, (_, i) => ({
        name: ["Nguyễn Văn An", "Trần Thị Bích Ngọc", "Lê Hoàng Phúc", "Phạm Minh Đức", "Võ Thanh Hải"][i % 5] + (i >= 5 ? ` ${i}` : ""),
        code: `EPS-${String(100 + i)}`, commander: i < 3, permits: i % 4 === 0 ? ["0123/2026/VH1-NĐDH", "0131/2026/VH1-NĐDH"] : ["0123/2026/VH1-NĐDH"],
      }))) });
      const from = params.get("from"), to = params.get("to");
      return route.fulfill({ json: json(history(from, to), { from, to }) });
    });
  },
  async interact(page, route) {
    const desktop = page.getByRole("button", { name: /^Nhân sự nhà thầu\. Bấm|^Nhân sự nhà thầu ·/ }).locator("visible=true");
    if (await desktop.count()) {
      await desktop.first().click();
      await page.getByRole("menuitem", { name: "Đại tu" }).click();
    } else {
      await page.getByRole("button", { name: /^Đang xem:/ }).click();
      await page.getByRole("menuitem", { name: "Nhân sự Đại tu" }).click();
    }
    await page.getByText("Đơn vị nhà thầu · Đại tu").waitFor();
    await page.getByRole("button", { name: "Xem lịch sử theo ngày" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Tổng", { exact: true }).waitFor();
    if (route.endsWith("don-vi")) {
      await dialog.getByRole("button", { name: "EPS", exact: true }).click();
      await dialog.getByRole("button", { name: /Hôm nay/ }).first().click();
      await dialog.getByText("23 người · 3 CHTT · 20 nhân viên").waitFor();
    }
    await page.waitForTimeout(600);
  },
};
