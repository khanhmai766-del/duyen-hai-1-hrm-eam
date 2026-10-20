import assert from "node:assert/strict";

// Tái hiện Máy nghiền S1: 30 bình, 11 tủ và 11 cuộn vòi. Chỉ giả lập GET, không ghi dữ liệu PCCC.
export const pcccPaginationPreset = {
  description: "PCCC: đổi từ trang 2 bình chữa cháy sang tủ/cuộn vòi phải về trang 1",
  async prepare() { return {}; },
  routes: () => ["/pccc?tab=BCC"],
  async mock(context) {
    // Khung trang đọc mốc đại tu; DB dev có thể chưa có các cột của module này.
    await context.route("**/api/overhaul-milestones", (route) => route.fulfill({
      json: { data: [], meta: null, error: null },
    }));
    const period = { id: "ui-pccc-period", label: "T10.2026", year: 2026, monthNo: 10,
      isClosed: false, allowItemCreation: false, allowItemDeletion: false, closedAt: null };
    const scope = { all: false, codes: ["COAL_MILL"], labels: ["Máy nghiền"],
      superviseCodes: ["COAL_MILL"], superviseLabels: ["Máy nghiền"], admin: false };
    const meta = { period, cuongViList: [{ code: "COAL_MILL", label: "Máy nghiền" }],
      giamSatList: [], writeScope: scope, viewScope: scope, groups: [], heThongList: [] };
    const rows = (prefix, count) => Array.from({ length: count }, (_, index) => ({
      id: `ui-${prefix}-${index + 1}`, stt: index + 1, ma: `${prefix}-${String(index + 1).padStart(3, "0")}`,
      ten: "Tủ chữa cháy INDOOR", chungLoai: "Bình MFZ", cuongVi: "Máy nghiền",
      cuongViCode: "COAL_MILL", machine: "S1", viTri: "Khu vực máy nghiền S1",
      tinhTrang: "Đạt", tinhTrangTongThe: "Đạt", apSuat: 100, sl: 1, dvt: "Cái",
      components: [], signature: null, updatedAt: "2026-10-20T00:00:00.000Z",
      cabinetId: `ui-TCC-${index + 1}`, cabinet: { id: `ui-TCC-${index + 1}`, ma: `TCC-${String(index + 1).padStart(3, "0")}`, ten: "Tủ chữa cháy INDOOR" },
    }));
    const tables = { extinguishers: rows("BCC", 30), cabinets: rows("TCC", 11), "hose-reels": rows("CVCC", 11) };
    await context.route("**/api/pccc/**", async (route) => {
      assert.equal(route.request().method(), "GET", "Kịch bản chỉ được đọc PCCC");
      const url = new URL(route.request().url());
      const endpoint = url.pathname.split("/").at(-1);
      const reply = (data, responseMeta = meta) => route.fulfill({ json: { data, meta: responseMeta, error: null } });
      if (endpoint === "periods") return reply([period], { clock: { currentLabel: period.label,
        today: "20/10/2026", isLastDayOfMonth: false, rolloverWindow: false, keepPeriods: 6 } });
      if (endpoint === "summary" || endpoint === "so-theo-doi") return reply(null);
      if (endpoint === "bulks") return reply({ bulks: [], panels: [] });
      const all = tables[endpoint] ?? [];
      const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
      const pageSize = Number(url.searchParams.get("pageSize") ?? 25);
      // Cố ý không chặn trang vượt giới hạn ở mock: kiểm tra frontend độc lập với lớp bảo vệ API.
      return reply(all.slice((page - 1) * pageSize, page * pageSize), {
        ...meta, total: all.length, page, pageSize, pageCount: Math.max(1, Math.ceil(all.length / pageSize)),
      });
    });
  },
  async interact(page) {
    await page.getByText("BCC-001", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Trang sau", exact: true }).click();
    await page.getByText("BCC-026", { exact: true }).waitFor();
    const requests = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (/\/api\/pccc\/(cabinets|hose-reels)$/.test(url.pathname)) requests.push(url);
    });
    await page.getByRole("button", { name: "Bình chữa cháy", exact: true }).click();
    await page.getByRole("menuitem", { name: "Tủ chữa cháy", exact: true }).click();
    await page.getByText("TCC-001", { exact: true }).first().waitFor();
    await page.getByText("CVCC-001", { exact: true }).waitFor();
    for (const endpoint of ["cabinets", "hose-reels"]) {
      const requested = requests.filter((url) => url.pathname.endsWith(`/${endpoint}`));
      assert.ok(requested.length, `Phải tải bảng ${endpoint} sau khi đổi tab`);
      assert.ok(requested.every((url) => url.searchParams.get("page") === "1"), `${endpoint} phải yêu cầu trang 1`);
    }
    assert.equal(new URL(page.url()).searchParams.get("tab"), "TCC");
    assert.equal(await page.locator('[aria-current="true"]').filter({ hasText: "1" }).count(), 2);
  },
};
