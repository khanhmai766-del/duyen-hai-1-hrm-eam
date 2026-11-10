import assert from "node:assert/strict";

const envelope = (data, meta = null) => ({ data, meta, error: null });
const contexts = new WeakMap();
const point = { id: "point-a", materialId: "material-a", deviceSeq: "DH1.S1.1.1", deviceId: "DH1.S1.1.1", machine: "S1", system: "Hệ thống giả lập", location: null,
  managingPosition: "Trực chính lò", managingPositionCode: "LO_CHINH", quantity: 2, deviceCount: 1, intervalMonths: 6, intervalNote: null, isActive: false,
  recoveryOnSupplement: false, separateTracking: false, samplingOnly: false, lastReplacedAt: null, nextDueAt: "2027-01-01T00:00:00.000Z", note: null,
  _count: { logs: 0 }, defectRequests: [], device: { id: "DH1.S1.1.1", code: "DH1.S1.1.1", name: "Bơm giả lập", system: "Hệ thống giả lập" } };

export const materialIntegrityPreset = {
  description: "Danh mục vật tư: form sửa và lưu đúng ID điểm khai báo; API ghi đều giả lập, không chạm dữ liệu thật.",
  async prepare() { return {}; },
  routes: () => ["list", "edit", "save"].map(mode => `/materials?may=S1&verify=${mode}`),
  async mock(context) {
    const state = { payload: null, reads: 0, material: { id: "material-a", code: "ERP-OIL", erpCodes: ["ERP-OIL"], name: "Dầu kiểm tra giả lập", category: "Dầu bôi trơn", machine: "S1", machines: ["S1"],
      quantity: 10, minStock: 20, unit: "Lít", location: null, system: null, imageUrl: null, documentUrl: null, documentName: null,
      unitPrice: null, note: null, replacements: [structuredClone(point)], deviceMaterials: [], totalNeed: 2, shortfall: 0 } };
    contexts.set(context, state);
    await context.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === "/api/materials" && request.method() === "PUT") {
        state.payload = request.postDataJSON();
        assert.equal(state.payload.id, "material-a"); assert.equal(state.payload.replacements[0].id, "point-a");
        assert.deepEqual(state.payload.deletedReplacementIds, []);
        state.material.replacements[0].quantity = state.payload.replacements[0].quantity;
        return route.fulfill({ json: envelope(state.material) });
      }
      if (request.method() !== "GET") return route.abort();
      if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { id: "ui-admin", name: "Kiểm tra giả lập", role: "ADMIN", accessMode: "ADMIN", position: "Trực chính lò" }, expires: "2099-01-01" } });
      if (url.pathname === "/api/rbac/me") return route.fulfill({ json: envelope({ permissions: { "material-manage": "full", "erp-material-manage": "read", "replacement-manage": "full" } }) });
      if (url.pathname === "/api/materials") { state.reads++; return route.fulfill({ json: envelope([state.material]) }); }
      if (url.pathname === "/api/users") return route.fulfill({ json: envelope([{ id: "u", name: "Giả lập", position: "Trực chính lò" }]) });
      if (url.pathname === "/api/vat-tu/oil-grouping/stock") {
        const category = url.searchParams.get("category");
        return route.fulfill({ json: envelope({ category, groups: category === "Dầu bôi trơn" ? [{ id: "g", code: "ERP-OIL", name: state.material.name, baseUnit: "Lít", onHandQty: 10, totalQty: 20, materialCount: 1,
          materials: [{ id: "erp", erpCode: "ERP-OIL", name: state.material.name, unit: "Lít", erpQty: 20 }] }] : [] }) });
      }
      if (url.pathname.startsWith("/api/equipment-tree")) {
        const node = { seq: "DH1.S1.1.1", code: "DH1.S1.1.1", fullCode: "DH1.S1.1.1", name: "Bơm giả lập", parentSeq: "DH1.S1.1", depth: 4, hasChildren: false, childCount: 0, machine: "S1" };
        return route.fulfill({ json: envelope(url.pathname.endsWith("/roots") || url.pathname.endsWith("/children") ? [] : node) });
      }
      return route.continue();
    });
  },
  async interact(page, route) {
    await page.addStyleTag({ content: "[data-ui-overlay]{display:none!important} html[data-mascot-toasts] [data-sonner-toaster]{visibility:visible!important}" });
    await page.getByText("Dầu kiểm tra giả lập", { exact: true }).filter({ visible: true }).first().waitFor();
    const mode = new URL(route, "http://localhost").searchParams.get("verify");
    if (mode === "list") return;
    await page.getByRole("button", { name: page.viewportSize().width < 768 ? "Tác vụ vật tư" : "Chọn nội dung cần chỉnh sửa", exact: true }).click();
    await page.getByRole("menuitem", { name: "Chi tiết điểm thay thế", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Lưu chi tiết", exact: true }).waitFor();
    if (mode === "edit") return;
    await dialog.locator('input[type="number"]').nth(1).fill("7");
    await dialog.getByRole("button", { name: "Lưu chi tiết", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    const state = contexts.get(page.context());
    assert.equal(state.payload.replacements[0].quantity, 7);
    assert.ok(state.reads >= 2, "Danh mục phải được tải lại sau khi lưu");
  },
};
