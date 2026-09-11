import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseContractorInput,parseContractorVersion } from "../../lib/tcms/server/master-data/contractor-service";
import { readFileSync } from "node:fs";

test("contractor input is strict and normalizes code without accepting audit fields",()=>{
  assert.deepEqual(parseContractorInput({code:" nt-01 ",name:" Nhà thầu A ",taxCode:"0123456789",address:" Địa chỉ A ",phone:"0123",representative:"Ông A",active:true}),{code:"NT-01",name:"Nhà thầu A",taxCode:"0123456789",address:"Địa chỉ A",phone:"0123",representative:"Ông A",active:true});
  assert.throws(()=>parseContractorInput({code:"NT 01",name:"Nhà thầu",active:true}));
  assert.throws(()=>parseContractorInput({code:"NT-01",name:"Nhà thầu",active:true,createdBy:"attacker"}));
  assert.equal(parseContractorVersion("2"),2);
});

test("contractor API only requests sensitive fields for managers",()=>{
  const route=readFileSync(new URL("../../app/api/tcms/contractors/route.ts",import.meta.url),"utf8");
  assert.match(route,/\.list\(access\.canManage,access\.canManage\)/);
});

test("migration 014 backfills contract links and protects contractor writes",async()=>{
  const sql=await readFile(new URL("../../prisma/manual/tcms/014_contractor_management.sql",import.meta.url),"utf8");
  assert.match(sql,/UPDATE tcms\.contracts c SET contractor_id/);
  assert.match(sql,/contract\.identity\.update permission is required/);
  assert.match(sql,/contractors_write_audit/);
  assert.match(sql,/to_jsonb\(NEW\)-'sensitive_ciphertext'/);
  assert.doesNotMatch(sql,/GRANT[^;]*DELETE ON tcms\.contractors/i);
});
