import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildWorkScopeTree,
  legacyContractTimeRuleDrafts,
  parseContractTimeRuleInput,
  parseWorkScopeInput,
} from "../../lib/tcms/server/contracts/contract-structure-service";
import { parseContractItemInput } from "../../lib/tcms/server/contracts/contract-item-service";
import type { WorkScope } from "../../lib/tcms/types/contract-structure";

test("HĐ117-style legacy fields map to CONTRACT, SERVICE and continuous UNIT rules", () => {
  const rules = legacyContractTimeRuleDrafts({
    contractDurationDays: 210,
    serviceProvisionDurationDays: 150,
    unitExecutionDurationDays: 20,
    unitExecutionContinuous: true,
    unitExecutionTriggerText: "Kể từ ngày nhận bàn giao mặt bằng",
    serviceDurationText: "210 ngày; dịch vụ 150 ngày; 20 ngày liên tục/tổ máy",
  });
  assert.deepEqual(rules.map((rule) => [rule.scopeType, rule.durationValue]), [
    ["CONTRACT", 210], ["SERVICE", 150], ["UNIT", 20],
  ]);
  assert.equal(rules[2].isContinuous, true);
  assert.equal(rules[2].startTriggerType, "SITE_HANDOVER");
});

test("HĐ171-style mapping creates only one CONTRACT rule and no fake UNIT", () => {
  const rules = legacyContractTimeRuleDrafts({
    contractDurationDays: 255,
    unitExecutionTriggerText: "Kể từ ngày hợp đồng có hiệu lực",
    effectiveConditionText: "Hợp đồng có hiệu lực sau khi ký",
  });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].scopeType, "CONTRACT");
  assert.equal(rules[0].durationValue, 255);
  assert.equal(rules[0].startTriggerType, "CONTRACT_EFFECTIVE");
  assert.equal(rules.some((rule) => rule.scopeType === "UNIT"), false);
});

test("HĐ136-style supports three LOT scopes and rules attached to the correct scope", () => {
  const contractId = "10000000-0000-4000-8000-000000000001";
  const scopes: WorkScope[] = [150, 60, 45].map((_, index) => ({
    id: `20000000-0000-4000-8000-00000000000${index + 1}`,
    contractId, scopeType: "LOT", code: `LOT-${index + 1}`, name: `Lô ${index + 1}`,
    sequence: index + 1, version: 1,
  }));
  const durations = [150, 60, 45];
  const rules = scopes.map((scope, index) => parseContractTimeRuleInput({
    scopeType: "WORK_SCOPE", workScopeId: scope.id, durationValue: durations[index], durationUnit: "DAY",
    startTriggerType: "CONTRACT_EFFECTIVE",
  }));
  assert.equal(buildWorkScopeTree(scopes).length, 3);
  assert.deepEqual(rules.map((rule) => [rule.workScopeId, rule.durationValue]), scopes.map((scope, index) => [scope.id, durations[index]]));
  assert.deepEqual(parseWorkScopeInput({ scopeType: "LOT", code: "LOT-1", name: "Lô 1" }), { scopeType: "LOT", code: "LOT-1", name: "Lô 1" });
});

test("time rule validation keeps duration/unit paired and WorkScope targeting explicit", () => {
  const scopeId = "20000000-0000-4000-8000-000000000001";
  assert.deepEqual(parseContractTimeRuleInput({ scopeType:"OTHER" }), { scopeType:"OTHER" });
  assert.throws(() => parseContractTimeRuleInput({ scopeType:"CONTRACT", durationUnit:"DAY" }), SyntaxError);
  assert.throws(() => parseContractTimeRuleInput({ scopeType:"CONTRACT", durationValue:30 }), SyntaxError);
  assert.throws(() => parseContractTimeRuleInput({ scopeType:"WORK_SCOPE", durationValue:30, durationUnit:"DAY" }), SyntaxError);
  assert.throws(() => parseContractTimeRuleInput({ scopeType:"ITEM", workScopeId:scopeId }), SyntaxError);
  assert.equal(parseContractTimeRuleInput({ scopeType:"WORK_SCOPE", workScopeId:scopeId }).workScopeId, scopeId);
});

test("ContractItem workScopeId remains nullable and validates an optional UUID", () => {
  const existing = parseContractItemInput({ serviceDescription:"Hạng mục cũ",weightPercent:100,progressPercent:0,status:"NOT_STARTED" });
  assert.equal(existing.workScopeId, undefined);
  const attached = parseContractItemInput({ serviceDescription:"Hạng mục mới",workScopeId:"20000000-0000-4000-8000-000000000001",weightPercent:100,progressPercent:0,status:"NOT_STARTED" });
  assert.equal(attached.workScopeId, "20000000-0000-4000-8000-000000000001");
});

test("migration 007 keeps additive schema, RLS, audit and cross-contract foreign keys", () => {
  const sql = readFileSync(new URL("../../prisma/manual/tcms/007_contract_time_rules_and_work_scopes.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE tcms\.contract_time_rules/);
  assert.match(sql, /CREATE TABLE tcms\.work_scopes/);
  assert.match(sql, /ADD COLUMN work_scope_id uuid/);
  assert.match(sql, /scope_type text NOT NULL CHECK \(scope_type IN \('CONTRACT','WORK_SCOPE','SERVICE','GOODS','ITEM','UNIT','OTHER'\)\)/);
  assert.equal((sql.match(/FOREIGN KEY \(work_scope_id, contract_id\)/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /\bscope_id\b/);
  assert.match(sql, /UNIQUE NULLS NOT DISTINCT \(contract_id, parent_scope_id, sequence\)/);
  assert.match(sql, /duration_value IS NULL AND duration_unit IS NULL/);
  assert.match(sql, /duration_value IS NOT NULL AND duration_unit IS NOT NULL/);
  assert.match(sql, /scope_type = 'WORK_SCOPE' AND work_scope_id IS NOT NULL/);
  assert.equal((sql.match(/REFERENCES tcms\.work_scopes\(id, contract_id\) ON DELETE RESTRICT/g) ?? []).length, 3);
  for (const command of ["SELECT", "INSERT", "UPDATE", "DELETE"]) assert.match(sql, new RegExp(`FOR ${command}`));
  assert.match(sql, /FORCE ROW LEVEL SECURITY/g);
  assert.match(sql, /write_row_audit/g);
  assert.doesNotMatch(sql, /DROP (TABLE|COLUMN)|TRUNCATE|UPDATE tcms\.contracts/i);
});
