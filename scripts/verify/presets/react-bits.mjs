import assert from "node:assert/strict";
import * as XLSX from "xlsx";

const importResult = {
  validCount: 1, willSchedule: 1, errors: [], created: 0, updated: 0, scheduled: 0,
  preview: [{ rowNumber: 2, materialName: "Dầu bôi trơn thử giao diện", deviceLabel: "Bơm dầu tổ máy S1", system: "Dầu bôi trơn", deviceCount: 1, quantity: 1, unit: "lít", intervalMonths: 3, lastReplacedAt: "2026-11-01" }],
};

export const reactBitsPreset = {
  prepare: async () => ({}),
  routes: () => ["/notifications", "/replacements?ui=import-ready", "/replacements?ui=import-error", "/replacements?ui=import-done"],
  async mock(context) {
    const commits = new WeakMap();
    await context.route("**/api/announcements?*", async (route) => {
      assert.equal(route.request().method(), "GET");
      const year = new Date().getFullYear();
      const now = new Date().toISOString();
      const data = Array.from({ length: 12 }, (_, index) => ({
        id: `ui-react-bits-${index}`, category: "BULLETIN", classification: null, stt: String(index + 1),
        title: `Mệnh lệnh thử giao diện ${index + 1}`, body: "Kiểm tra thiết bị và ghi nhận kết quả vận hành trước khi bàn giao ca. ".repeat(4),
        pinned: index === 0, orderedBy: "LĐPX", issuedAt: now, invalidatedAt: null,
        linkUrl: null, fileUrl: null, fileName: null, createdAt: now, updatedAt: now,
        createdBy: { name: "Người kiểm tra giao diện" }, reads: [],
      }));
      await route.fulfill({ json: { data, meta: { years: [year] }, error: null } });
    });
    // Both validation and confirmation are intercepted, so this scenario only changes browser state.
    await context.route("**/api/materials/import-replacements", async (route) => {
      const request = route.request();
      assert.equal(request.method(), "POST");
      const body = request.postDataJSON();
      assert.equal(body.rows.length, 1);
      const page = request.frame().page();
      const state = new URL(page.url()).searchParams.get("ui");
      const errors = state === "import-error" ? [{ rowNumber: 2, message: "Không tìm thấy thiết bị — hãy kiểm tra mã thiết bị trong tệp." }] : [];
      if (!body.dryRun) {
        assert.equal(state, "import-done");
        commits.set(page, (commits.get(page) ?? 0) + 1);
        assert.equal(commits.get(page), 1, "Xác nhận chỉ gửi một yêu cầu nhập");
      }
      await route.fulfill({ json: { data: { ...importResult, errors, scheduled: body.dryRun ? 0 : 1, created: body.dryRun ? 0 : 1 }, meta: null, error: null } });
    });
  },
  async interact(page, route) {
    await page.addStyleTag({ content: "[data-ui-overlay]{display:none!important}" });
    if (route.startsWith("/notifications")) {
      const list = page.getByRole("list", { name: "Danh sách thông báo" });
      await list.waitFor();
      assert.equal(await list.getByRole("listitem").count(), 10);
      const next = page.getByTitle("Trang sau", { exact: true });
      await next.evaluate(button => button.scrollIntoView({ block: "center" }));
      await next.click();
      await page.waitForTimeout(350);
      assert.equal(await list.getByRole("listitem").count(), 2);
      const previous = page.getByTitle("Trang trước", { exact: true });
      await previous.evaluate(button => button.scrollIntoView({ block: "center" }));
      await previous.click();
      await page.evaluate(() => window.scrollTo(0, 0));
      return;
    }
    await page.getByRole("button", { name: "Mở lựa chọn xuất dữ liệu", exact: true }).click();
    await page.getByText("Nhập lịch theo dõi", { exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Chọn tệp Excel và điền ngày thay gần nhất", { exact: false }).waitFor();
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Tên vật tư", "Mã thiết bị", "Lần thay gần nhất (dd/mm/yyyy)", "Chu kỳ thay thế"],
      ["Dầu bôi trơn thử giao diện", "UI-S1-001", "01/11/2026", 3],
    ]), "Nhập điểm thay thế");
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "lich-thay-the-vat-tu-kiem-tra-giao-dien-tren-dien-thoai.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    });
    const confirm = dialog.getByRole("button", { name: /Xác nhận nhập/ });
    if (route.includes("import-error")) {
      await dialog.getByText("Cần sửa file trước khi nhập", { exact: true }).waitFor();
      assert.equal(await confirm.isDisabled(), true);
    } else {
      await dialog.getByText("Dữ liệu hợp lệ", { exact: false }).waitFor();
      assert.equal(await confirm.isEnabled(), true);
      if (route.includes("import-done")) {
        await confirm.click();
        await dialog.getByText("Đã nhập lịch theo dõi", { exact: true }).waitFor();
        assert.equal(await confirm.count(), 0);
      }
    }
    await page.waitForTimeout(650);
  },
};
