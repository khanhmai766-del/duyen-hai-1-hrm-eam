import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const envelope = data => ({ data, meta: null, error: null });
const signals = ["Bản thể bao hơi", "Bồn dầu phụ", "Bộ làm mát khí H2 tổ máy 1", "Van an toàn bao hơi", "Máy cắt kích từ"].map((name, i) => ({
  name, code: `DH1.S1.1.${i + 1}`, system: "Hệ thống lò hơi", managingPosition: "Trực chính lò", repairCount: 0,
  openDefectCount: i < 2 ? 2 : 1, replacementWarn: 1, signalTotal: 3, riskScore: 6, recommendation: "Ưu tiên xử lý khiếm khuyết",
}));
const data = {
  totalSystemDevices: 22708, systems: ["Lò hơi", "Tua bin"], positions: ["Trực chính lò"], openDefectCount: 942, urgentDefectCount: 24,
  dueGroups: { OVERDUE: 712, DUE_SOON: 13, OK: 60 }, materialSummary: { totalGroups: 240, categoryCount: 12 },
  systemRowsByPosition: { ALL: [{ name: "Lò hơi", devices: 320, defects: 42, warning: 12 }] }, positionRows: [{ name: "Trực chính lò", value: 320 }],
  statusRows: [{ name: "Chưa xử lý", value: 570 }, { name: "Có PCT", value: 152 }, { name: "Chờ vật tư", value: 220 }, { name: "Đã xử lý", value: 28 }],
  defectChartRows: [], replacementChartRows: [], currentYear: new Date().getFullYear(),
  monthlyTrendByRequestType: { ALL: Array.from({ length: 12 }, (_, i) => ({ month: `Th${i + 1}`, detected: i * 7, handled: i * 12 })) },
  repairYearCounts: [{ year: String(new Date().getFullYear()), repairs: 668 }, { year: "2025", repairs: 0 }],
  upcomingReplacements: Array.from({ length: 6 }, (_, i) => ({ id: `ui-${i}`, material: "Dầu Shell Omala S2 GX220 (giả lập)",
    device: `DH1.S1.6.5.2.${i + 1} · Quạt tháp giải nhiệt #${i + 1}`, system: "Hệ thống tháp giải nhiệt ND 300m3", nextDueAt: "2021-09-06T00:00:00.000Z", daysLeft: -1800, status: "OVERDUE" })),
};

export const equipmentChartsPreset = {
  description: "Biểu đồ dashboard thiết bị: dữ liệu thường, số lớn, rỗng, năm không có lượt và mở lịch chi tiết; chỉ giả lập, không ghi DB.",
  async prepare() { mkdirSync("reports/verify/equipment-charts-elements", { recursive: true }); return {}; },
  routes: () => ["charts", "details", "empty", "large", "zero-year"].map(mode => `/reports?verify=${mode}`),
  async mock(context) {
    await context.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() !== "GET") return route.abort();
      if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { id: "ui-user", name: "Người kiểm tra giả lập", role: "ADMIN", accessMode: "ADMIN" }, expires: "2099-01-01" } });
      if (url.pathname === "/api/rbac/me") return route.fulfill({ json: envelope({ permissions: { "device-view": "read", "report-view": "read" } }) });
      if (url.pathname !== "/api/reports/equipment-dashboard") return route.continue();
      const mode = new URL(request.headers().referer || "http://localhost").searchParams.get("verify"), result = structuredClone(data);
      if (mode === "empty") {
        result.statusRows = []; result.dueGroups = { OVERDUE: 0, DUE_SOON: 0, OK: 0 }; result.upcomingReplacements = [];
        result.repairYearCounts = [];
      }
      if (mode === "large") {
        result.repairYearCounts[0].repairs = 1234567;
        result.statusRows[0].value = 1234567;
        result.dueGroups = { OVERDUE: 1234567, DUE_SOON: 20314, OK: 60123 };
      }
      if (mode?.startsWith("ranking")) {
        result.defectChartRows = structuredClone(signals);
        result.replacementChartRows = structuredClone(signals.slice(0, 4));
        if (mode === "ranking-long") {
          result.defectChartRows[0].name = "Bộ làm mát khí H2 và hệ thống giám sát nhiệt độ gối đỡ tua bin tổ máy số 1";
          result.defectChartRows[0].openDefectCount = 1234567;
          result.replacementChartRows[0].name = result.defectChartRows[0].name;
          result.replacementChartRows[0].replacementWarn = 1234567;
        }
        if (mode === "ranking-single") {
          result.defectChartRows = result.defectChartRows.slice(0, 1);
          result.replacementChartRows = result.replacementChartRows.slice(0, 1);
        }
        if (mode === "ranking-empty") { result.defectChartRows = []; result.replacementChartRows = []; }
      }
      return route.fulfill({ json: envelope(result) });
    });
  },
  async interact(page, route) {
    await page.addStyleTag({ content: "[data-ui-overlay]{display:none!important}" });
    const mode = new URL(route, "http://localhost").searchParams.get("verify");
    const annual = page.locator('figure[aria-label^="Lượt sửa chữa:"]');
    await annual.waitFor();
    if (mode?.startsWith("ranking")) {
      if (mode === "ranking-empty") {
        await page.getByText("Không có thiết bị đang tồn đọng khiếm khuyết", { exact: true }).scrollIntoViewIfNeeded();
        await page.getByText("Không có thiết bị cần cảnh báo thay thế", { exact: true }).waitFor();
        return;
      }
      const figures = page.locator('figure[aria-label="Top khiếm khuyết tồn đọng"], figure[aria-label="Cảnh báo thay thế theo thiết bị"]');
      assert.equal(await figures.count(), 2);
      for (const [index, figure] of (await figures.all()).entries()) {
        await figure.scrollIntoViewIfNeeded();
        await figure.locator(".recharts-bar-rectangle").first().waitFor();
        await figure.locator(".recharts-bar-rectangle").first().hover();
        await figure.locator(".recharts-tooltip-wrapper").getByText("DH1.S1.1.1", { exact: true }).waitFor();
        await figure.getByText("Xem mã thiết bị và số liệu", { exact: true }).click();
        const rows = figure.locator("ol li");
        assert.equal(await rows.count(), mode === "ranking-single" ? 1 : index ? 4 : 5);
        const counts = await rows.locator("span:last-child").allTextContents();
        const values = counts.map(value => Number(value.replaceAll(".", "")));
        assert.deepEqual(values, [...values].sort((a, b) => b - a));
        assert.match(await rows.first().innerText(), /DH1\.S1\.1\.1/);
        if (mode === "ranking-long") assert.match(await rows.first().innerText(), /1\.234\.567/);
        await figure.getByText("Xem mã thiết bị và số liệu", { exact: true }).click();
        const clipped = await figure.locator("svg text").evaluateAll(nodes => nodes.filter(node => {
          const r = node.getBoundingClientRect(), s = node.closest("svg").getBoundingClientRect();
          return r.left < s.left - 1 || r.right > s.right + 1 || r.top < s.top - 1 || r.bottom > s.bottom + 1;
        }).map(node => node.textContent));
        assert.deepEqual(clipped, [], "Tên và số liệu phải nằm đầy đủ trong khung biểu đồ");
        await figure.locator("..").locator("..").screenshot({ path: `reports/verify/equipment-charts-elements/${mode}-${page.viewportSize().width}-${index}.png`,
          style: "[data-ui-overlay], header, nav, nextjs-portal { visibility:hidden!important }" });
      }
      await figures.first().scrollIntoViewIfNeeded();
      return;
    }
    if (mode === "zero-year") {
      await page.getByRole("combobox", { name: "Năm sửa chữa" }).click();
      await page.getByRole("option", { name: "2025", exact: true }).click();
      await page.locator('figure[aria-label="Lượt sửa chữa: 2025: 0 lượt"]').waitFor();
    } else {
      assert.match(await annual.getAttribute("aria-label"), mode === "large" ? /1\.234\.567/ : mode === "empty" ? /0 lượt/ : /668 lượt/);
    }
    const replacements = page.locator('figure[aria-label="Phân bố lịch thay thế theo mức đến hạn"]');
    await replacements.waitFor();
    if (mode === "empty") await replacements.getByText("Chưa có điểm thay thế được lập lịch.", { exact: true }).waitFor();
    else {
      const legend = replacements.locator("dl");
      assert.match(await legend.innerText(), mode === "large" ? /1\.234\.567/ : /712/);
      assert.match(await legend.innerText(), /Sắp đến hạn/);
    }
    if (mode === "details") {
      await page.getByText("Xem 6 lịch thay thế gần nhất", { exact: true }).click();
      assert.equal(await page.locator("details[open]").count(), 1);
      await page.locator("details[open]").scrollIntoViewIfNeeded();
    } else await annual.scrollIntoViewIfNeeded();
    const figures = page.locator('figure[aria-label]');
    const clippedLabels = await figures.locator("svg text").evaluateAll(nodes => nodes.filter(node => {
      const bounds = node.getBoundingClientRect(), svg = node.closest("svg").getBoundingClientRect();
      return bounds.left < svg.left - 1 || bounds.right > svg.right + 1;
    }).map(node => node.textContent));
    assert.deepEqual(clippedLabels, [], "Nhãn biểu đồ phải nằm trong khung SVG");
    if (["charts", "large", "empty"].includes(mode)) {
      for (const [index, figure] of (await figures.all()).entries()) {
        await figure.locator("..").locator("..").screenshot({ path: `reports/verify/equipment-charts-elements/${mode}-${page.viewportSize().width}-${index}.png`,
          style: "[data-ui-overlay], header, nav, nextjs-portal { visibility:hidden!important }" });
      }
      await annual.scrollIntoViewIfNeeded();
    }
  },
};
