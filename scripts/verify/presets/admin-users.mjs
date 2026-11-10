import assert from "node:assert/strict";

const envelope = (data, meta = null) => ({ data, meta, error: null });
const states = new WeakMap();
const user = { id: "ui-user", name: "Nhân viên giả lập", employeeId: "UI-001", username: "ui-user", email: "ui@local.test", workEmail: "", phone: "0900000000",
  position: "Trực chính lò", secondaryPosition: "Máy phó", secondaryPosition2: "", currentPosition: "Máy phó", department: "Vận hành 1",
  role: "VIEWER", accessMode: "NORMAL", isActive: true, avatarUrl: null, signatureUrl: null, lockedAt: null };
const config = { permissions: [{ id: "user-manage", group: "Quản trị", feature: "Người dùng", note: "", matrix: { MANAGER: "full" } }],
  roles: [{ id: "ui-profile", label: "Quản lý mở rộng (giả lập)", desc: "", scope: "", accent: "" }], userOverrides: [] };

export const adminUsersPreset = {
  description: "Quản lý người dùng: form thêm/sửa, quyền RBAC, tạo tài khoản khi gán quyền lỗi/thành công; mọi thao tác ghi đều giả lập.",
  async prepare() { return {}; },
  routes: () => ["list", "create", "create-bottom", "edit", "edit-bottom", "no-rbac", "partial-create", "profile-success"].map(state => `/admin/users?verify=${state}`),
  async mock(context) {
    const state = { created: 0, assigned: 0 };
    states.set(context, state);
    await context.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url());
      const mode = new URL(request.headers().referer || "http://localhost").searchParams.get("verify");
      if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { ...user, id: "ui-admin", role: "MANAGER" }, expires: "2099-01-01" } });
      if (url.pathname === "/api/rbac/me") return route.fulfill({ json: envelope({ permissions: { "user-manage": "full", "rbac-manage": mode === "no-rbac" ? "none" : "full", "system_audit_log:view": "read" } }) });
      if (url.pathname === "/api/rbac") {
        if (request.method() === "PUT") {
          state.assigned++;
          return mode === "partial-create"
            ? route.fulfill({ status: 403, json: { data: null, error: "Quyền RBAC đã bị thu hồi (giả lập)" } })
            : route.fulfill({ json: envelope(request.postDataJSON()) });
        }
        return route.fulfill({ json: envelope(config) });
      }
      if (url.pathname === "/api/admin/users") return route.fulfill({ json: envelope({ rows: [user], total: 1, page: 1, pageSize: 10 }) });
      if (url.pathname === "/api/admin/users/ui-user") return route.fulfill({ json: envelope(user) });
      if (url.pathname === "/api/users") {
        if (request.method() === "POST") {
          state.created++;
          return route.fulfill({ json: envelope({ ...request.postDataJSON(), id: "ui-created" }) });
        }
        return route.fulfill({ json: envelope([user]) });
      }
      if (["/api/audit", "/api/system-audit"].includes(url.pathname)) return route.fulfill({ json: envelope([], { page: 1, total: 0, totalPages: 1 }) });
      // Không cho bất kỳ thao tác ghi ngoài kịch bản chạm DB dev.
      if (request.method() !== "GET") return route.abort();
      return route.continue();
    });
  },
  async interact(page, route) {
    // Ẩn mascot để chụp form; bật lại toast Sonner mà mascot thường thay thế.
    await page.addStyleTag({ content: "[data-ui-overlay]{display:none!important} html[data-mascot-toasts] [data-sonner-toaster]{visibility:visible!important}" });
    const mode = new URL(route, "http://localhost").searchParams.get("verify");
    await page.getByRole("row").filter({ hasText: user.employeeId }).waitFor();
    if (mode === "list") return;
    if (mode.startsWith("edit")) {
      await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).click();
      const dialog = page.getByRole("dialog");
      const name = dialog.getByText("Họ tên", { exact: true }).locator("..").locator("input");
      await name.waitFor();
      assert.equal(await name.inputValue(), user.name);
      assert.equal(await dialog.getByText("SĐT", { exact: true }).locator("..").locator("input").inputValue(), user.phone);
      if (mode === "edit-bottom") await dialog.getByRole("button", { name: "Lưu", exact: true }).scrollIntoViewIfNeeded();
      return;
    }
    if (mode === "no-rbac") {
      assert.equal(await page.getByRole("row").filter({ hasText: user.employeeId }).getByRole("combobox").nth(1).isDisabled(), true);
    }
    await page.getByRole("button", { name: "Thêm người dùng", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const profile = dialog.getByText("Phân quyền mở rộng", { exact: true }).locator("..").getByRole("combobox");
    await profile.waitFor();
    if (mode === "no-rbac") { assert.equal(await profile.isDisabled(), true); return; }
    if (mode.startsWith("create")) {
      if (mode === "create-bottom") await dialog.getByRole("button", { name: "Tạo", exact: true }).scrollIntoViewIfNeeded();
      return;
    }
    for (const [label, value] of [["Họ tên *", "TEST người dùng"], ["Email công ty *", "new@local.test"], ["User *", "ui-new"], ["Mã NV *", "UI-NEW"]]) {
      await dialog.getByText(label, { exact: true }).locator("..").locator("input").fill(value);
    }
    await profile.click();
    await page.getByRole("option", { name: config.roles[0].label, exact: true }).click();
    const before = { ...states.get(page.context()) };
    await dialog.getByRole("button", { name: "Tạo", exact: true }).click();
    const message = mode === "partial-create" ? "Đã tạo người dùng nhưng chưa gán được phân quyền mở rộng" : "Đã tạo người dùng";
    await page.locator("[data-sonner-toast] [data-title]").filter({ hasText: message }).first().waitFor();
    await dialog.waitFor({ state: "detached" });
    assert.equal(states.get(page.context()).created, before.created + 1, "Chỉ tạo một tài khoản");
    assert.equal(states.get(page.context()).assigned, before.assigned + 1, "Chỉ gửi một lần gán quyền");
    if (mode === "partial-create") assert.equal(await page.getByText("Đã tạo người dùng", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Thêm người dùng", exact: true }).click();
    assert.equal(await page.getByRole("dialog").getByText("Họ tên *", { exact: true }).locator("..").locator("input").inputValue(), "");
  },
};
