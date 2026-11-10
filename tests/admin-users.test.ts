import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { NextRequest } from "next/server";
import { QueryClient } from "@tanstack/react-query";
import { effectiveUserPosition, isValidCurrentPosition } from "../lib/current-position";

const require = createRequire(import.meta.url);
function load<T>(file: string, imports: Record<string, unknown>): T {
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)((name: string) => {
    if (name in imports) return imports[name];
    assert.ok(!name.startsWith("@/"), `Thiếu mock: ${name}`);
    return require(name);
  }, loaded, loaded.exports);
  return loaded.exports as T;
}

const api = {
  requireUser: async () => ({ id: "admin", role: "ADMIN" }),
  handle: async (run: () => Promise<Response>) => run(),
  ok: (data: unknown) => Response.json({ data, error: null }),
  fail: (error: string, status = 400) => Response.json({ data: null, error }, { status }),
  audit: async () => {},
};

test("sau nhập liệu, cache danh sách phân trang và chi tiết đều bị đánh dấu cần tải lại", async () => {
  const source = ts.createSourceFile("users.tsx", readFileSync("app/(dashboard)/admin/users/page.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let fn: ts.FunctionDeclaration | undefined;
  function find(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "refreshAfterMutation") fn = node;
    ts.forEachChild(node, find);
  }
  find(source);
  assert.ok(fn);
  const qc = new QueryClient();
  const listKey = ["admin-users", { page: 1 }], detailKey = ["admin-user", "u1"];
  for (const key of [listKey, detailKey, ["devices"]]) qc.setQueryData(key, { data: "cũ" });
  const compiled = ts.transpileModule(fn.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  await new Function("qc", compiled + ";return refreshAfterMutation();")(qc);
  assert.equal(qc.getQueryState(listKey)?.isInvalidated, true);
  assert.equal(qc.getQueryState(detailKey)?.isInvalidated, true);
  assert.equal(qc.getQueryState(["devices"])?.isInvalidated, false);
  qc.clear();
});

test("sửa người dùng: xóa chức vụ đang dùng chuyển về chức vụ còn lại; thay đổi khác giữ nguyên", async () => {
  for (const [body, expected] of [
    [{ secondaryPosition: "" }, "A"],
    [{ secondaryPosition2: "" }, "B"],
    [{ secondaryPosition: "", position: "", secondaryPosition2: "" }, null],
    [{ department: "Vận hành" }, "B"],
  ] as const) {
    const before = { id: "u1", employeeId: "TEST-1", position: "A", secondaryPosition: "B", secondaryPosition2: "C", currentPosition: "B", passwordHash: "secret" };
    let invalidations = 0;
    const route = load<typeof import("../app/api/users/route")>("app/api/users/route.ts", {
      "@/lib/prisma": { prisma: { user: {
        findUnique: async () => before,
        update: async ({ data }: { data: object }) => ({ ...before, ...data }),
      } } },
      "@/lib/api": api,
      "@/lib/activity-log": { requestAuditMeta: () => ({}) },
      "@/lib/s3": { userWithSignedMedia: async (user: object) => user },
      "@/lib/user-avatar-storage": { avatarUpdate: async () => ({}), signatureUpdate: async () => ({}) },
      "@/lib/password-policy": {},
      "@/lib/password-hash": {},
      "@/lib/current-position": { effectiveUserPosition, isValidCurrentPosition },
      "@/lib/user-summary-cache": { invalidateUserSummaryCache: () => invalidations++ },
      "@/lib/user-admin-access": {},
      "@/lib/rbac-guard": { requirePermissionLevel: async () => {} },
    });
    const response = await route.PUT(new NextRequest("http://localhost/api/users", {
      method: "PUT", body: JSON.stringify({ id: before.id, ...body }),
    }));
    const { data } = await response.json();
    assert.equal(data.currentPosition, expected, JSON.stringify(body));
    assert.equal(isValidCurrentPosition(data, data.currentPosition), true);
    assert.equal("passwordHash" in data, false);
    assert.equal(invalidations, 1);
  }
});

test("upload ảnh/chữ ký xóa cache sau khi lưu; ghi thất bại không báo thành công", async () => {
  for (const kind of ["avatar", "signature"] as const) {
    for (const fails of [false, true]) {
      const calls: string[] = [];
      const media = load<typeof import("../lib/admin-user-media")>("lib/admin-user-media.ts", {
        "@/lib/prisma": { prisma: { user: {
          findUnique: async () => ({ id: "u1" }),
          update: async () => { calls.push("write"); if (fails) throw new Error("Lỗi ghi"); },
        } } },
        "@/lib/api": api,
        "@/lib/s3": {
          fileExtension: () => "png", safeEmployeeCode: (code: string) => code,
          uploadImageBufferToS3: async () => ({ key: "avatars/new.webp" }), uploadS3Object: async () => {},
        },
        "@/lib/upload-guard": { inspectUpload: async () => {} },
        "@/lib/user-summary-cache": { invalidateUserSummaryCache: () => calls.push("invalidate") },
      });
      const form = new FormData();
      form.set("employee_code", "TEST-1");
      form.set("file", new File(["ảnh giả lập, bộ kiểm upload đã mock"], "TEST-1.png", { type: "image/png" }));
      const result = media.uploadSingleUserMedia(form, "admin", kind);
      if (fails) await assert.rejects(result, /Lỗi ghi/);
      else await result;
      assert.deepEqual(calls, fails ? ["write"] : ["write", "invalidate"]);
    }
  }
});

test("import tạo/cập nhật xóa cache sau ghi; xem trước không ghi hay xóa cache", async () => {
  for (const existing of [false, true]) {
    for (const preview of [false, true]) {
      const calls: string[] = [];
      const imports = load<typeof import("../lib/admin-user-import")>("lib/admin-user-import.ts", {
        "@/lib/prisma": { prisma: { user: {
          findMany: async () => existing ? [{ id: "u1", employeeId: "TEST-1", email: "test@local.test", username: "test" }] : [],
          update: async () => { calls.push("write"); },
          create: async ({ data }: { data: object }) => { calls.push("write"); return { id: "u1", ...data }; },
        } } },
        "@/lib/api": api,
        "@/lib/password-hash": { hashPassword: async () => "hashed" },
        "@/lib/upload-guard": { inspectUpload: async () => {} },
        "@/lib/s3": { dateFolder: () => "test", fileExtension: () => "csv", uploadS3Object: async () => {} },
        "@/lib/user-summary-cache": { invalidateUserSummaryCache: () => calls.push("invalidate") },
      });
      const form = new FormData();
      form.set("preview", String(preview));
      form.set("file", new File(["employeeid,name,email,username\nTEST-1,Test,test@local.test,test"], "users.csv"));
      const result = await imports.importUsersFromForm(form, "admin");
      assert.equal(result.error_rows, 0);
      assert.equal(result.success_rows, preview ? 0 : 1);
      assert.deepEqual(calls, preview ? [] : ["write", "invalidate"]);
    }
  }
});
