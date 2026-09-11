import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseDepartmentInput, parseDepartmentVersion } from "../../lib/tcms/server/master-data/department-service";

test("department input normalizes code and rejects unsafe fields", () => {
  assert.deepEqual(parseDepartmentInput({ code:" pxvh2 ", name:" Phân xưởng Vận hành 2 ", active:true }), { code:"PXVH2", name:"Phân xưởng Vận hành 2", active:true });
  assert.throws(() => parseDepartmentInput({ code:"PX VH2", name:"Đơn vị", active:true }));
  assert.throws(() => parseDepartmentInput({ code:"PX2", name:"Đơn vị", active:true, role:"SYSTEM_ADMIN" }));
  assert.equal(parseDepartmentVersion("2"), 2);
});

test("migration 009 protects department writes and keeps soft-deactivation", async () => {
  const sql = await readFile(new URL("../../prisma/manual/tcms/009_department_management.sql", import.meta.url), "utf8");
  assert.match(sql, /system\.configure permission is required/);
  assert.match(sql, /departments_write_audit/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /GRANT[^;]*DELETE ON tcms\.departments/i);
  assert.match(sql, /version integer NOT NULL DEFAULT 1/);
});

test("audit runtime grant is read-only and remains behind RLS", async () => {
  const sql = await readFile(new URL("../../prisma/manual/tcms/010_audit_runtime_read.sql", import.meta.url), "utf8");
  assert.match(sql, /GRANT SELECT ON tcms\.audit_events TO tcms_app_runtime/);
  assert.doesNotMatch(sql, /GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*audit_events/i);
});
