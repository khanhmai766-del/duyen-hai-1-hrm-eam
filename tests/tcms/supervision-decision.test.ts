import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertSupervisionDecisionUpdate,
  parseSupervisionDecisionInput,
  parseSupervisionDecisionVersion,
} from "../../lib/tcms/server/supervision/supervision-decision-service";
import type { SupervisionDecision } from "../../lib/tcms/types/supervision-decision";

const input={contractId:"11111111-1111-4111-8111-111111111111",decisionNumber:" QĐ-01 ",decisionDate:"2026-09-07",title:" Phân công giám sát ",effectiveFrom:"2026-09-08",effectiveUntil:"2026-12-31",status:"DRAFT" as const,notes:" Ghi chú ",assignments:[{userId:"22222222-2222-4222-8222-222222222222",workScopeId:"33333333-3333-4333-8333-333333333333",supervisorRole:" Giám sát chính ",responsibility:" Theo dõi tiến độ ",activeFrom:"2026-09-08",activeUntil:"2026-12-31"}]};

test("supervision decision parser is strict and validates dates and duplicates",()=>{
  const parsed=parseSupervisionDecisionInput(input);
  assert.equal(parsed.decisionNumber,"QĐ-01"); assert.equal(parsed.assignments[0].supervisorRole,"Giám sát chính");
  assert.throws(()=>parseSupervisionDecisionInput({...input,effectiveUntil:"2026-01-01"}));
  assert.throws(()=>parseSupervisionDecisionInput({...input,assignments:[input.assignments[0],input.assignments[0]]}));
  assert.throws(()=>parseSupervisionDecisionInput({...input,createdBy:"attacker"}));
  assert.equal(parseSupervisionDecisionVersion("2"),2);
});

test("issued supervision decision content is immutable but can be revoked",()=>{
  const parsed=parseSupervisionDecisionInput(input);
  const current={...parsed,id:"44444444-4444-4444-8444-444444444444",contractNumber:"HD-01",packageName:"Gói thầu",status:"ISSUED" as const,version:1,createdAt:"2026-09-07T00:00:00Z",updatedAt:"2026-09-07T00:00:00Z",assignments:parsed.assignments.map((item,index)=>({...item,id:String(index),displayName:"Nguyễn Văn A",departmentId:null,departmentCode:null,departmentName:null}))} satisfies SupervisionDecision;
  assert.doesNotThrow(()=>assertSupervisionDecisionUpdate(current,{...parsed,status:"REVOKED"}));
  assert.throws(()=>assertSupervisionDecisionUpdate(current,{...parsed,status:"ISSUED",title:"Đã sửa"}));
});

test("migration 015 enforces RLS, assignment scope and minimal grants",async()=>{
  const sql=await readFile(new URL("../../prisma/manual/tcms/015_supervision_decisions.sql",import.meta.url),"utf8");
  assert.match(sql,/FOREIGN KEY\(work_scope_id,contract_id\)/);
  assert.match(sql,/FORCE ROW LEVEL SECURITY/);
  assert.match(sql,/contract\.assignment\.manage/);
  assert.doesNotMatch(sql,/GRANT[^;]*DELETE ON tcms\.supervision_decisions/i);
});

test("identity resolver derives supervisor access only from effective issued decisions",async()=>{
  const source=await readFile(new URL("../../lib/tcms/server/auth/identity.ts",import.meta.url),"utf8");
  assert.match(source,/d\.status='ISSUED'/);
  assert.match(source,/d\.effective_from<=current_date/);
  assert.match(source,/a\.active_until IS NULL OR a\.active_until>=current_date/);
});
