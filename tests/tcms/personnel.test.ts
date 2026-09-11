import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseCreatePersonnelInput, parsePersonnelVersion, parseUpdatePersonnelInput } from "../../lib/tcms/server/master-data/personnel-service";

const departmentId = "11111111-1111-4111-8111-111111111111";

test("personnel input is strict and normalizes the username", () => {
  const input = parseCreatePersonnelInput({
    identitySubject: " oidc-subject-01 ", username: " USER@VH1.VN ", displayName: " Nguyễn Văn A ",
    primaryDepartmentId: departmentId, active: true,
    roleAssignments: [{ roleCode:"VIEWER",scopeType:"DEPARTMENT",departmentId,contractId:null,validFrom:null,validUntil:null }],
  });
  assert.equal(input.identitySubject, "oidc-subject-01");
  assert.equal(input.username, "user@vh1.vn");
  assert.equal(parsePersonnelVersion("2"), 2);
  assert.throws(() => parseCreatePersonnelInput({ ...input, password:"secret" }));
});

test("personnel role scopes reject ambiguous or unsafe combinations", () => {
  const base = { username:"user@vh1.vn",displayName:"Người dùng",primaryDepartmentId:departmentId,active:true };
  assert.throws(() => parseUpdatePersonnelInput({ ...base, roleAssignments:[{ roleCode:"SYSTEM_ADMIN",scopeType:"DEPARTMENT",departmentId,contractId:null,validFrom:null,validUntil:null }] }));
  assert.throws(() => parseUpdatePersonnelInput({ ...base, roleAssignments:[
    { roleCode:"VIEWER",scopeType:"DEPARTMENT",departmentId,contractId:null,validFrom:null,validUntil:null },
    { roleCode:"CONTRACT_EDITOR",scopeType:"CONTRACT",departmentId:null,contractId:"22222222-2222-4222-8222-222222222222",validFrom:null,validUntil:null },
  ] }));
});

test("migration 011 uses least privilege, audit, optimistic lock and last-admin guard", async () => {
  const sql = await readFile(new URL("../../prisma/manual/tcms/011_personnel_and_role_management.sql", import.meta.url), "utf8");
  assert.match(sql, /user\.manage[\s\S]*role\.manage permissions are required/);
  assert.match(sql, /LAST_GLOBAL_SYSTEM_ADMIN_REQUIRED/);
  assert.match(sql, /app_users_write_audit/);
  assert.match(sql, /version integer NOT NULL DEFAULT 1/);
  assert.doesNotMatch(sql, /GRANT[^;]*DELETE ON tcms\.app_users/i);
  assert.doesNotMatch(sql, /tcms_app_runtime/);
});

test("migration 012 keeps table-specific trigger fields in separate branches", async () => {
  const sql = await readFile(new URL("../../prisma/manual/tcms/012_fix_last_admin_guard.sql", import.meta.url), "utf8");
  assert.match(sql, /IF TG_TABLE_NAME = 'user_role_scopes' THEN/);
  assert.match(sql, /ELSIF TG_TABLE_NAME = 'app_users' THEN/);
  assert.doesNotMatch(sql, /TG_TABLE_NAME = 'user_role_scopes' AND TG_OP/);
});

test("migration 013 counts only effective admins and forbids expiring admin grants", async () => {
  const sql = await readFile(new URL("../../prisma/manual/tcms/013_harden_system_admin_lifecycle.sql", import.meta.url), "utf8");
  assert.match(sql, /SYSTEM_ADMIN_MUST_BE_CURRENT_GLOBAL_AND_NON_EXPIRING/);
  assert.match(sql, /valid_from<=clock_timestamp\(\)/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON tcms\.user_role_scopes/);
});
