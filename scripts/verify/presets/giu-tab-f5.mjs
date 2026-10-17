import assert from "node:assert/strict";

// Tải lại trang (F5) vẫn ở đúng tab đang xem (17/10/2026, hooks/useUrlState.ts) — chỉ bấm tab, không ghi DB.
// Mỗi tuyến: bấm sang một tab không phải mặc định → kiểm URL có tham số → page.reload() → kiểm tab đó vẫn đang chọn.
const pressed = (locator) => locator.evaluate((el) => el.getAttribute("aria-pressed") === "true" || el.getAttribute("aria-selected") === "true" || el.getAttribute("data-state") === "active");

export const keepTabPreset = {
  description: "F5 giữ tab: Thư mục lưu trữ › Vòi thổi bụi (S2 · GGH · Sơ đồ), Sổ PCT › Đang làm việc, PCCC, Hoá chất — chỉ bấm tab",
  async prepare() { return {}; },
  routes: () => ["/documents/archive", "/work-permits", "/pccc", "/chemical-inventory"],
  async interact(page, route) {
    if (route === "/documents/archive") {
      await page.getByRole("button", { name: "Vòi thổi bụi" }).first().evaluate((el) => el.click());
      await page.getByText("Vòi cần xử lý").first().waitFor({ timeout: 60_000 });
      await page.getByRole("button", { name: "S2", exact: true }).first().click();
      await page.getByRole("tab", { name: /GGH/ }).first().click();
      await page.getByRole("button", { name: "Sơ đồ", exact: true }).first().click();
      const url = new URL(page.url());
      assert.equal(url.searchParams.get("tab"), "SOOT_BLOWER_BOARD");
      assert.equal(url.searchParams.get("may"), "S2");
      assert.equal(url.searchParams.get("loai"), "GGH");
      assert.equal(url.searchParams.get("xem"), "dcs");
      await page.reload();
      await page.getByText("Vòi cần xử lý").first().waitFor({ timeout: 60_000 });
      await page.getByText(/Tổ máy S2/).first().waitFor();
      // chế độ Sơ đồ ẩn tab loại vòi không có trên vách đang xem (GGH ở trang phải) — kiểm qua danh sách đang lọc theo GGH
      await page.getByText("Vòi thổi bụi GGH").first().waitFor();
      assert.ok(await pressed(page.getByRole("button", { name: "Sơ đồ", exact: true }).first()) || (await page.getByText("Sơ đồ theo màn DCS").count()) > 0, "Sau F5 phải còn ở chế độ Sơ đồ");
    }
    if (route === "/work-permits") {
      // máy tính: hàng tab; điện thoại: nút "Đang xem: …" mở danh sách mục
      const live = page.getByRole("button", { name: /^Đang làm việc/ }).locator("visible=true").first();
      if (await live.count()) await live.click();
      else {
        await page.getByRole("button", { name: /^Đang xem:/ }).locator("visible=true").first().click();
        await page.getByRole("menuitem", { name: /Đang làm việc/ }).first().click();
      }
      assert.equal(new URL(page.url()).searchParams.get("tab"), "live");
      await page.reload();
      await page.waitForLoadState("networkidle");
      assert.equal(new URL(page.url()).searchParams.get("tab"), "live");
      await page.getByText(/Đang làm việc/).locator("visible=true").first().waitFor();
    }
    if (route === "/pccc") {
      const tab = page.getByRole("button", { name: /^Bình chữa cháy|BCC/ }).locator("visible=true").first();
      if (!(await tab.count())) return;
      await tab.click();
      const key = new URL(page.url()).searchParams.get("tab");
      assert.ok(key && key !== "OVERVIEW", `URL phải ghi tab PCCC, đang là ${key}`);
      await page.reload();
      await page.waitForLoadState("networkidle");
      assert.equal(new URL(page.url()).searchParams.get("tab"), key);
    }
    if (route === "/chemical-inventory") {
      const tab = page.getByRole("tab", { name: "Phiếu nhập" }).first();
      if (!(await tab.count())) return;
      await tab.click();
      assert.equal(new URL(page.url()).searchParams.get("tab"), "receipts");
      assert.ok(await pressed(tab), "Bấm phải đổi sang tab Phiếu nhập trước khi F5");
      await page.reload();
      const again = page.getByRole("tab", { name: "Phiếu nhập" }).first();
      await again.waitFor({ timeout: 60_000 });
      assert.ok(await pressed(again), "Sau F5 phải còn ở tab Phiếu nhập");
    }
    await page.waitForTimeout(300);
  },
};
