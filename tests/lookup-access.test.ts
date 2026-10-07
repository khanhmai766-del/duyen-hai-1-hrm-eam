import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_LOOKUP_MODULES, LOOKUP_MODULES, LOOKUP_ACCESS_MODE, lookupModulesForUser, lookupLandingPage, lookupNavSections, lookupPageAllowed, lookupPermissionIds, lookupRequestAllowed, normalizeLookupConfig } from "../lib/lookup-access";
import { removeRoleProfile } from "../lib/rbac-role-profile";
import { DEFAULT_RBAC_MATRIX } from "../lib/rbac-defaults";
const allowed = (path: string, method = "GET", modules = DEFAULT_LOOKUP_MODULES) => lookupRequestAllowed(new URL(path, "http://localhost"), method, modules);

test("tài khoản cũ giữ khiếm khuyết; danh sách rỗng thu hồi hết; không nhận quyền lạ", () => {
  const config = normalizeLookupConfig({ users: { legacy: undefined, empty: [], selected: ["defects", "work-permits", "ADMIN", "work-permits"] } });
  assert.deepEqual(lookupModulesForUser(config, "legacy"), ["defects"]);
  assert.deepEqual(lookupModulesForUser(config, "empty"), []);
  assert.deepEqual(lookupModulesForUser(config, "selected"), ["defects", "work-permits"]);
  assert.equal(lookupLandingPage([]), "/account");
});
test("bật PCT mở trang, danh sách, chi tiết và xuất sổ; tắt quyền chặn trực tiếp", () => {
  for (const path of ["/work-permits", "/api/work-permits?kind=ELECTRICAL", "/api/work-permits/permit-1", "/api/work-permits/permit-1/history/h1", "/api/work-permits/permit-1/results", "/api/work-permits/export", "/api/work-permits/live-sessions"]) {
    assert.equal(allowed(path), false, path);
    assert.equal(allowed(path, "GET", ["work-permits"]), true, path);
  }
  assert.equal(allowed("/api/defects", "GET", []), false);
});
test("chọn tất cả vẫn không mở thao tác ghi và API quản trị hoặc cấp số", () => {
  const all = LOOKUP_MODULES.map(module => module.id);
  for (const path of ["/api/work-permits", "/api/defects", "/api/pccc/items", "/api/users", "/api/forum", "/api/tcms/contracts", "/api/lookup-permissions"]) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(allowed(path, method, all), false, `${method} ${path}`);
  }
  for (const path of ["/admin/roles", "/api/rbac", "/api/work-permits/number-reservations", "/api/work-permits/number-review", "/api/work-permits/number-baselines", "/api/work-permits/nkvh-claim", "/api/defects/two-way-sync", "/api/model-control/open", "/api/tcms/admin/roles"]) assert.equal(allowed(path, "GET", all), false, path);
});
test("giữ các thao tác cá nhân; chặn giả đường dẫn và phân hệ ngoài quyền", () => {
  assert.equal(allowed("/api/me/password", "PUT", []), true);
  assert.equal(allowed("/api/device-qr/resolve", "POST", []), true);
  assert.equal(allowed("/api/work-permits-other", "GET", ["work-permits"]), false);
  assert.equal(allowed("/api/users?summary=1"), true);
  assert.equal(allowed("/api/users"), false);
  assert.equal(allowed("/api/documents?category=PROCEDURE", "GET", ["procedures"]), true);
  assert.equal(allowed("/api/documents?category=PID", "GET", ["procedures"]), false);
  assert.equal(lookupPageAllowed("/pccc", ["work-permits"]), false);
});
test("menu giữ PCT khi không được xem khiếm khuyết; không hiện trang bị thu hồi", () => {
  const nav = [{ title: "Thiết bị", items: [{ label: "Khiếm khuyết", href: "/defects", icon: (() => null) as never, children: [{ label: "Cơ", href: "/defects?phan=co", icon: (() => null) as never }, { label: "PCT", href: "/work-permits", icon: (() => null) as never }] }] }];
  const filtered = lookupNavSections(nav, ["work-permits"]);
  assert.equal(filtered[0].items[0].href, "/work-permits");
  assert.equal(filtered[0].items[0].children?.length, 1);
  assert.deepEqual(lookupNavSections(nav, []), []);
});
test("xoá hồ sơ quyền dọn đúng cột/liên kết và giữ vai trò/quyền riêng khác", () => {
  const permissions = [{ id: "p1", matrix: { ADMIN: "full", custom: "manage", other: "read" } }];
  const overrides = [{ roleId: "custom", userId: "u1" }, { roleId: "other", userId: "u1" }, { userId: "u2" }];
  const next = removeRoleProfile("custom", permissions, overrides);
  assert.deepEqual(next.permissions[0].matrix, { ADMIN: "full", other: "read" });
  assert.deepEqual(next.userOverrides, overrides.slice(1));
  assert.equal(permissions[0].matrix.custom, "manage");
});
test("RBAC server: vai trò ADMIN/override full không nâng quyền ghi tài khoản tra cứu", async () => {
  const source = ts.transpileModule(readFileSync("lib/rbac-permissions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} as typeof import("../lib/rbac-permissions") };
  const imports: Record<string, unknown> = {
    "@/lib/prisma": { prisma: { $queryRawUnsafe: async () => [] } },
    "@/lib/rbac-defaults": { DEFAULT_RBAC_MATRIX },
    "@/lib/lookup-access": { LOOKUP_ACCESS_MODE: "DEFECT_READ_ONLY", lookupPermissionIds },
    "@/lib/server/lookup-access": { lookupModulesFor: async () => ["work-permits", "pccc"] },
  };
  new Function("require", "module", "exports", source)((name: string) => { assert.ok(name in imports, name); return imports[name]; }, loaded, loaded.exports);
  for (const role of ["ADMIN", "MANAGER", "VIEWER"]) {
    const user = { id: "u1", role, accessMode: "DEFECT_READ_ONLY" };
    assert.equal(await loaded.exports.hasAssignedPermissionLevel(user, "work-permit-view", ["read"]), true);
    assert.equal(await loaded.exports.hasAssignedPermissionLevel(user, "work-permit-issue", ["manage", "full"]), false);
    assert.equal(await loaded.exports.hasAssignedPermissionLevel(user, "pccc-manage", ["personal", "manage", "full"]), false);
    assert.equal(await loaded.exports.hasAssignedPermissionLevel(user, "defect-view", ["read"]), false);
  }
  assert.equal(await loaded.exports.hasAssignedPermissionLevel({ id: "normal", role: "ADMIN", accessMode: "NORMAL" }, "work-permit-issue", ["full"]), true);
});
test("proxy dùng quyền DB hiện tại, cấp/thu hồi trong phiên cũ và vẫn chặn ghi", async () => {
  const source = ts.transpileModule(readFileSync("proxy.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} as typeof import("../proxy") };
  let mode = LOOKUP_ACCESS_MODE;
  let modules = ["defects"] as typeof DEFAULT_LOOKUP_MODULES;
  const imports: Record<string, unknown> = {
    "next/server": { NextResponse },
    "next-auth/jwt": { getToken: async () => ({ id: "u1", accessMode: "NORMAL" }) },
    "@/lib/prisma": { prisma: { user: { findUnique: async () => ({ id: "u1", accessMode: mode, isActive: true, lockedAt: null }) } } },
    "@/lib/lookup-access": { LOOKUP_ACCESS_MODE, lookupLandingPage, lookupRequestAllowed },
    "@/lib/server/lookup-access": { lookupModulesFor: async () => modules },
  };
  new Function("require", "module", "exports", source)((name: string) => { assert.ok(name in imports, name); return imports[name]; }, loaded, loaded.exports);
  const request = (path: string, method = "GET") => new NextRequest(`http://localhost${path}`, { method, headers: { cookie: "authjs.session-token=test" } });
  assert.equal((await loaded.exports.proxy(request("/api/work-permits"))).status, 403);
  modules = ["defects", "work-permits"];
  assert.equal((await loaded.exports.proxy(request("/api/work-permits"))).headers.get("x-middleware-next"), "1");
  assert.equal((await loaded.exports.proxy(request("/api/work-permits", "POST"))).status, 403);
  modules = [];
  assert.equal((await loaded.exports.proxy(request("/api/work-permits"))).status, 403);
  assert.equal((await loaded.exports.proxy(request("/work-permits"))).headers.get("location"), "http://localhost/account");
  mode = "NORMAL";
  assert.equal((await loaded.exports.proxy(request("/api/work-permits", "POST"))).headers.get("x-middleware-next"), "1");
});
