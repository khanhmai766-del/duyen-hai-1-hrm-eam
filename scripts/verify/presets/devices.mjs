import assert from "node:assert/strict";

const seq = "DH1.S1.1.1", parent = "DH1.S1.1", next = "DH1.S1.1.2";
const envelope = (data, meta = null) => ({ data, meta, error: null });
const contexts = new WeakMap();
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z1sAAAAASUVORK5CYII=";
function detail(id, machine) {
  return { id, code: machine === "S2" ? id.replace(".S1.", ".S2.") : id, machine,
    name: `Bơm ${machine} (giả lập)`, kks: machine === "S2" ? "20PUMP" : "10PUMP", system: "Hệ thống giả lập", systemSeq: parent,
    managingPosition: "Trực chính lò", managingPositions: ["Trực chính lò"], images: machine === "S2" ? [] : [pixel], attachedInfo: "Thông tin giả lập", documentUrl: null,
    hasQrCard: true, qrCardKey: `${id}:${machine}`, repairLogs: [], materials: [], materialDeclarations: [], materialUsage: [], currentDefects: [], defectHistory: [],
    _count: { repairLogs: machine === "S2" ? 2 : 1 }, includedDeviceCount: 1, includedDescendantDepth: 2 };
}

export const devicesPreset = {
  description: "Cây S2, thẻ QR, quyền tạo personal và sửa/đổi mã lý lịch S2; mọi thao tác ghi đều giả lập.",
  async prepare() { return {}; },
  routes: () => ["/devices?scope=S2&verify=tree", "/devices?view=detail&verify=cards", "/devices?view=form&verify=personal",
    ...["detail", "edit", "edit-save", "rename"].map(mode => `/devices/${seq}?machine=S2&verify=${mode}`)],
  async mock(context) {
    const state = { id: seq, saved: null, payloads: [] };
    contexts.set(context, state);
    await context.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url());
      const mode = new URL(request.headers().referer || "http://localhost").searchParams.get("verify");
      if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { id: "ui-user", name: "Người kiểm tra giả lập", role: "MANAGER", accessMode: "NORMAL", position: "Trực chính lò" }, expires: "2099-01-01" } });
      if (url.pathname === "/api/rbac/me") return route.fulfill({ json: envelope({ permissions: { "device-view": "read", "device-manage": mode === "personal" ? "personal" : "full", "device-code": "full", "device-delete": "full" } }) });
      if (url.pathname === "/api/users") return route.fulfill({ json: envelope([]) });
      if (url.pathname === "/api/device-guide") return route.fulfill({ json: envelope({ documentUrl: null }) });
      if (url.pathname === "/api/equipment-tree/access") return route.fulfill({ json: envelope({ access: "edit" }) });
      if (url.pathname === "/api/device-qr-cards") return route.fulfill({ json: envelope([detail(seq, "S1"), detail(seq, "S2")]) });
      if (url.pathname.startsWith("/api/devices/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/devices/".length));
        if (request.method() === "PUT") {
          const body = request.postDataJSON(); state.payloads.push(body);
          state.id = body.code || id;
          state.saved = { ...detail(state.id, body.machine), ...body, id: state.id, code: body.machine === "S2" ? state.id.replace(".S1.", ".S2.") : state.id };
          return route.fulfill({ json: envelope(state.saved) });
        }
        if (id !== state.id) return route.fulfill({ status: 404, json: { data: null, error: "Mã cũ không còn tồn tại (giả lập)" } });
        return route.fulfill({ json: envelope(state.saved ?? detail(id, url.searchParams.get("machine") || "S1")) });
      }
      if (url.pathname.startsWith("/api/equipment-tree")) {
        const scope = url.searchParams.get("scope") || url.searchParams.get("machine") || "S1";
        const node = (code, name, hasChildren) => ({ seq: code, name, parentSeq: code === parent ? null : parent, depth: code.split(".").length,
          machine: scope, fullCode: scope === "S2" ? code.replace(".S1.", ".S2.") : code, code, kks: null, childCount: Number(hasChildren), hasChildren });
        const root = node(parent, "Hệ thống giả lập", true), leaf = node(seq, "Bơm giả lập", false);
        if (url.pathname.endsWith("/roots")) return route.fulfill({ json: envelope([root]) });
        if (url.pathname.endsWith("/children") || url.pathname.endsWith("/search")) return route.fulfill({ json: envelope([leaf], { nextCursor: null }) });
        if (url.pathname === "/api/equipment-tree") return route.fulfill({ json: envelope([root, leaf]) });
        return route.fulfill({ json: envelope({ ...root, imageUrl: null, attachedInfo: null, documentUrl: null, baseName: root.name, baseKks: null }) });
      }
      if (request.method() !== "GET") return route.abort();
      return route.continue();
    });
  },
  async interact(page, route) {
    await page.addStyleTag({ content: "[data-ui-overlay]{display:none!important} html[data-mascot-toasts] [data-sonner-toaster]{visibility:visible!important}" });
    const mode = new URL(route, "http://localhost").searchParams.get("verify");
    if (mode === "tree") { await page.getByText("Hệ thống giả lập", { exact: true }).first().waitFor(); return; }
    if (mode === "personal") {
      assert.equal(await page.getByRole("button", { name: "Thêm mới", exact: true }).isVisible(), true);
      await page.getByText("Thiết bị theo tổ máy (S1 & S2)", { exact: true }).first().waitFor(); return;
    }
    if (mode === "cards") {
      const card = page.locator('[role="button"][tabindex="0"]').filter({ hasText: "Bơm S2 (giả lập)" });
      await card.waitFor();
      assert.match(await card.getByRole("link", { name: "Xem lý lịch", exact: true }).getAttribute("href"), /machine=S2/);
      assert.match(await card.getByRole("link", { name: /Sửa chữa/ }).getAttribute("href"), /mappedUnit=S2/);
      return;
    }
    await page.getByRole("heading", { name: /Bơm S2/ }).first().waitFor();
    if (mode === "detail") return;
    await page.getByRole("button", { name: "Sửa", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Lưu thay đổi", exact: true }).waitFor();
    if (mode === "edit") return;
    if (mode === "rename") await dialog.getByText("Mã thiết bị *", { exact: true }).locator("..").locator("input").fill(next.replace(".S1.", ".S2."));
    else await dialog.getByText("Tên thiết bị *", { exact: true }).locator("..").locator("input").fill("Bơm S2 đã sửa (giả lập)");
    await dialog.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    const state = contexts.get(page.context());
    assert.equal(state.payloads.at(-1).machine, "S2");
    assert.deepEqual(state.payloads.at(-1).images, []);
    if (mode === "rename") await page.waitForURL(url => url.pathname.endsWith(next) && url.searchParams.get("machine") === "S2");
    else await page.getByText("Bơm S2 đã sửa (giả lập)", { exact: true }).first().waitFor();
  },
};
