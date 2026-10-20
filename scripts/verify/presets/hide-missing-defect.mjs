import assert from "node:assert/strict";

const id = "ui-missing-2178";
const updatedAt = "2026-10-20T12:00:00.000Z";
const reason = "Phiếu gốc đã hủy, bản sao không còn trên Google Sheet";

export const hideMissingDefectPreset = {
  description: "Ẩn phiếu mất nguồn đã xử lý khi đồng bộ tắt; chỉ giả lập, không ghi DB",
  async prepare() { return {}; },
  routes: () => ["/defects?phan=dien", "/defects?phan=dien&uiState=actions", "/defects?phan=dien&uiState=dialog", "/defects?phan=dien&uiState=hidden"],
  async mock(context) {
    let hidden = false;
    const defect = {
      id, requestNumber: "2178/2026", requestType: "Điện", unit: "S2", deviceSeq: null,
      sourceType: "GOOGLE_SHEETS", syncState: "MISSING", status: "DA_XU_LY", websiteCreated: false,
      cancelledAt: null, pendingHistory: null, postRepairAwaitingMaterial: false, isMaterialRequest: false,
      system: "Lò phó S2", sourcePositionRaw: "Lò phó S2", content: "Xử lý tủ máy cắt cấp nguồn quạt pha loãng bị vỡ kính cửa và hư khóa cửa",
      severity: "3", condition: "A", repairResultRaw: "Chưa thực hiện", sourceStatusRaw: "Chưa xử lý",
      detectedAt: "2026-10-16T00:00:00.000Z", updatedAt, reminderCount: 0, relatedDevices: [], images: [],
      createdBy: { id: "ui-user", name: "Người đồng bộ", position: "Lò phó", avatarUrl: null },
    };
    const json = (data, meta = null) => ({ data, meta, error: null });
    // DB dev có thể chưa có bảng mốc đại tu; mục này thuộc khung app, ngoài bài kiểm tra.
    await context.route("**/api/overhaul-milestones", route => route.fulfill({ json: json(null) }));
    await context.route("**/api/rbac/me", route => route.fulfill({ json: json({ role: "ADMIN", permissions: { "defect-view": "full", "defect-manage": "full", "defect-delete": "full" } }) }));
    await context.route("**/api/defects/two-way-sync", route => route.fulfill({ json: json({ twoWaySyncEnabled: false, operationUpdateEnabled: false, reusableRequestNumbers: [], metrics: {} }) }));
    await context.route("**/api/defects/sync", route => route.fulfill({ json: json({ runs: [], health: null }) }));
    await context.route("**/api/defects/unnumbered?**", route => route.fulfill({ json: json([]) }));
    await context.route("**/api/defects/shift-summary?**", route => route.fulfill({ json: json({ issued: 0, cancelled: 0, active: 0, byRequestType: [] }) }));
    await context.route("**/api/defects?**", route => route.fulfill({ json: json(hidden ? [] : [defect], {
      total: hidden ? 0 : 1, scopeTotal: hidden ? 0 : 1, page: 1, totalPages: 1,
      kpi: { chuaXuLy: 0, coPct: 0, choVatTu: 0, choNgungMay: 0, tonDong: hidden ? 0 : 1 },
      positionScope: { all: true, codes: [], labels: [] }, repairResults: ["Chưa thực hiện"],
    }) }));
    await context.route(`**/api/defects/${id}/hide`, async route => {
      assert.equal(route.request().method(), "POST");
      assert.deepEqual(route.request().postDataJSON(), { reason, updatedAt });
      hidden = true;
      await route.fulfill({ json: json({ id, syncState: "HIDDEN" }) });
    });
  },
  async interact(page, route) {
    if (!route.includes("uiState=")) return;
    const mobile = page.viewportSize().width < 768;
    if (mobile) await page.getByRole("button", { name: "Thao tác phiếu 2178/2026", exact: true }).click();
    const hide = mobile
      ? page.getByRole("menuitem", { name: "Ẩn phiếu mất nguồn", exact: true })
      : page.getByRole("button", { name: "Ẩn phiếu mất nguồn", exact: true });
    await hide.waitFor({ state: "visible" });
    if (route.endsWith("actions")) return;
    await hide.click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Ẩn phiếu", exact: true });
    assert.equal(await confirm.isDisabled(), true, "Phải nhập lý do trước khi ẩn");
    await dialog.getByLabel("Lý do ẩn", { exact: false }).fill(reason);
    assert.equal(await confirm.isEnabled(), true);
    if (!route.endsWith("hidden")) return;
    await confirm.click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByText("Đã ẩn phiếu mất nguồn", { exact: true }).first().waitFor();
    await page.getByText("2178/2026", { exact: true }).first().waitFor({ state: "hidden" });
  },
};
