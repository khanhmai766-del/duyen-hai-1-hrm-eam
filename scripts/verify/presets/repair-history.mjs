import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const content = "Kiểm tra xử lý tín hiệu đo chênh áp lưới thu bi nhánh ngoài (10PAB42CP302) nước tuần hoàn vào bình ngưng báo sai";
const device = "Bộ đo chênh áp lưới thu bi cao su bình ngưng A nhánh A (02 thiết bị)";
const permit = "PCT điện 5586/2026/VH1-NĐDH, CHTT Nguyễn Văn Đủ, nội dung: lưới thu bi nhánh ngoài (10PAB42CP302) nước tuần hoàn vào bình ngưng Tuabin S1 DH1 => KQ: đã kiểm tra tín hiệu và xác nhận thiết bị vận hành bình thường.";
const json = (data, meta = null) => ({ data, meta, error: null });
const base = {
  id: "ui-history-1", defectContent: content, device: "DH1.S1.2.13.4.1", workOrderNumber: permit,
  unit: "S1", requestType: "Điện", requestNumber: "5586", system: "Thiết bị đo lường điều khiển",
  performedAt: "2026-11-18T08:00:00Z", createdAt: "2026-11-18T08:00:00Z", finalizeAt: "2026-11-21T08:00:00Z",
  createdBy: { id: "ui-operator", name: "Nguyễn Văn Đủ", position: "Thiết bị đo lường điều khiển", avatarUrl: null },
  node: { seq: "DH1.S1.2.13.4.1", name: device }, relatedDevices: [], reminderCount: 0,
  content: "Đã kiểm tra và hiệu chỉnh tín hiệu đo chênh áp.", result: "Thiết bị vận hành bình thường.",
};

export const repairHistoryPreset = {
  description: "Lịch sử dài: tên thiết bị, mã, số phiếu; chờ chốt, mở chi tiết, đã chốt. Chỉ giả lập, không ghi DB.",
  async prepare() { mkdirSync("reports/verify/repair-history", { recursive: true }); return {}; },
  routes: () => ["pending", "expanded", "finalized"].map(mode => `/repair-history?verify=${mode}`),
  async mock(context) {
    await context.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() !== "GET") return route.abort();
      if (url.pathname === "/api/rbac/me") return route.fulfill({ json: json({ role: "ADMIN", permissions: { "defect-view": "full", "defect-manage": "full", "defect-close": "full", "defect-history-delete": "full" } }) });
      if (url.pathname === "/api/users") return route.fulfill({ json: json([base.createdBy]) });
      if (url.pathname === "/api/defect-history") {
        const pending = url.searchParams.get("status") !== "FINALIZED";
        const rows = [
          { ...base },
          { ...base, id: "ui-history-2", device: "DH1.S1.1.11.1.11", defectContent: "Xử lý IK11 bị xì chèn lớn – 10HCB21AT011", node: { seq: "DH1.S1.1.11.1.11", name: "Máy thổi bụi hành trình dài IK11" }, workOrderNumber: "5060/2026/VH1-NĐDH" },
          { ...base, id: "ui-history-3", device: "DH1.S1.2.7.1.14", defectContent: "Lấy mẫu dầu EH phân tích chỉ số nước trong dầu", node: { seq: "DH1.S1.2.7.1.14", name: "Bồn dầu EH" }, workOrderNumber: null },
        ].map(row => ({ ...row, historyStatus: pending ? "PENDING" : "FINALIZED", pendingDefectId: pending ? "ui-defect" : null }));
        return route.fulfill({ json: json(rows, { total: 3, totalPages: 1, page: 1, pageSize: 10 }) });
      }
      if (url.pathname === "/api/defects/ui-defect") return route.fulfill({ json: json({
        ...base, id: "ui-defect", content, deviceSeq: base.device, status: "DA_XU_LY", sourceType: "GOOGLE_SHEETS",
        syncState: "CONFIRMED", websiteCreated: false, severity: "3", condition: "A", detectedAt: base.createdAt,
        images: [], relatedDevices: [], reminderCount: 0, linkedWorkPermits: [], postRepairAwaitingMaterial: false,
        repairOrderNumberRaw: permit, repairPerformedContentRaw: base.content, repairResultRaw: base.result,
      }) });
      return route.continue();
    });
  },
  async interact(page, path) {
    const mode = new URL(path, "http://localhost").searchParams.get("verify");
    const desktop = page.viewportSize().width >= 768;
    await page.getByText(content, { exact: true }).filter({ visible: true }).first().waitFor();
    if (mode === "finalized") {
      await page.getByRole("button", { name: "Đã chốt", exact: true }).click();
      await page.getByTitle("Bản ghi đã chốt").filter({ visible: true }).first().waitFor();
    }
    if (mode === "pending") {
      const sorting = page.getByRole("combobox", { name: "Sắp xếp lịch sử" });
      const sortedRequest = page.waitForRequest(request => request.url().includes("/api/defect-history?") && new URL(request.url()).searchParams.get("sortKey") === "workOrderNumber");
      await sorting.selectOption("workOrderNumber");
      await sortedRequest;
      const filteredRequest = page.waitForRequest(request => request.url().includes("/api/defect-history?") && new URL(request.url()).searchParams.get("requestType") === "Điện");
      await page.getByRole("button", { name: "Lọc theo loại yêu cầu", exact: true }).click();
      await page.getByRole("menuitem", { name: "Điện", exact: true }).click();
      await filteredRequest;
    }
    if (mode === "expanded") {
      await page.getByRole("button", { name: desktop ? "Xem chi tiết lịch sử" : "Xem chi tiết", exact: true }).first().click();
      await page.getByText("Thông tin Vận hành", { exact: true }).filter({ visible: true }).waitFor();
      for (const name of ["Thông tin Vận hành", "Theo dõi Vận hành", "Nội dung Sửa chữa"]) {
        const width = await page.getByText(name, { exact: true }).filter({ visible: true }).evaluate(el => el.closest("button").parentElement.getBoundingClientRect().width);
        assert.ok(width >= 250, `Khối ${name} phải đủ rộng để đọc`);
      }
    }
    const overflow = await page.evaluate(() => {
      const main = document.querySelector("main");
      return { page: document.documentElement.scrollWidth > innerWidth + 1, main: main.scrollWidth > main.clientWidth + 1,
        tables: [...document.querySelectorAll("table")].filter(table => table.getBoundingClientRect().width && table.getBoundingClientRect().right > main.getBoundingClientRect().right + 1).length };
    });
    assert.deepEqual(overflow, { page: false, main: false, tables: 0 }, "Lịch sử không được tràn ngang");
    const summary = page.getByText(permit, { exact: true }).filter({ visible: true }).first();
    await summary.waitFor();
    assert.equal(await summary.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, "PCT/LCT phải xuống dòng trong ô");
    const panel = page.locator('select[aria-label="Số dòng mỗi trang"]').locator("..").locator("..").locator("..");
    await panel.screenshot({ path: `reports/verify/repair-history/${mode}-${page.viewportSize().width}.png`, style: "header, nav, [data-ui-overlay], nextjs-portal { visibility: hidden !important }" });
  },
};
