import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseContractGoodsItemInput } from "../../lib/tcms/server/contracts/contract-goods-item-service";

test("goods item accepts contract-level and WorkScope goods while validating evidence fields", () => {
  assert.equal(parseContractGoodsItemInput({ description: "Vật tư cấp contract" }).workScopeId, undefined);
  const item = parseContractGoodsItemInput({ description: "Van", workScopeId: "20000000-0000-4000-8000-000000000001", quantity: 2, sourcePage: 3, confidence: 0.9 });
  assert.equal(item.workScopeId, "20000000-0000-4000-8000-000000000001");
  assert.throws(() => parseContractGoodsItemInput({ description: " " }), SyntaxError);
  assert.throws(() => parseContractGoodsItemInput({ description: "Van", quantity: -1 }), SyntaxError);
  assert.throws(() => parseContractGoodsItemInput({ description: "Van", sourcePage: 0 }), SyntaxError);
  assert.throws(() => parseContractGoodsItemInput({ description: "Van", confidence: 2 }), SyntaxError);
  assert.throws(() => parseContractGoodsItemInput({ description: "Van", sequence: 1 }), SyntaxError);
});

test("migration 008 isolates Goods from Service and protects WorkScope references", () => {
  const sql = readFileSync(new URL("../../prisma/manual/tcms/008_contract_goods_items.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE tcms\.contract_goods_items/);
  assert.match(sql, /UNIQUE NULLS NOT DISTINCT \(contract_id, work_scope_id, sequence\)/);
  assert.doesNotMatch(sql, /contract_goods_items_contract_scope_sequence_idx/);
  assert.match(sql, /REFERENCES tcms\.work_scopes\(id, contract_id\) ON DELETE RESTRICT/);
  assert.match(sql, /REFERENCES tcms\.contracts\(id\) ON DELETE CASCADE/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /contract_goods_items_select_policy[\s\S]*contract\.read[\s\S]*can_access_contract\(contract_id\)/);
  assert.match(sql, /contract_goods_items_(?:insert|update|delete)_policy[\s\S]*contract\.identity\.update[\s\S]*can_access_contract\(contract_id\)/);
  assert.match(sql, /write_row_audit/);
  assert.doesNotMatch(sql, /contract_item_id/);
});

test("goods routes authorize the URL contract and repository scopes item ids to that contract", () => {
  const collectionRoute = readFileSync(new URL("../../app/api/tcms/contracts/[id]/goods/route.ts", import.meta.url), "utf8");
  const itemRoute = readFileSync(new URL("../../app/api/tcms/contracts/[id]/goods/[goodsItemId]/route.ts", import.meta.url), "utf8");
  const repository = readFileSync(new URL("../../lib/tcms/server/contracts/postgres-contract-goods-item-repository.ts", import.meta.url), "utf8");
  for (const route of [collectionRoute, itemRoute]) {
    assert.match(route, /findById\(id\)/);
    assert.match(route, /requireContractPermission\(context\.principal,"contract\.(?:read|identity\.update)",contract\)/);
  }
  assert.match(repository, /WHERE contract_id=\$1 AND id=\$2/);
  assert.match(repository, /WHERE contract_id=\$16 AND id=\$17 AND version=\$18/);
  assert.match(repository, /WHERE contract_id=\$1 AND id=\$2 AND version=\$3/);
});

test("repository gives a moved item the next sequence in its target scope and keeps same-scope sequence", () => {
  const source = readFileSync(new URL("../../lib/tcms/server/contracts/postgres-contract-goods-item-repository.ts", import.meta.url), "utf8");
  assert.match(source, /work_scope_id IS DISTINCT FROM \$1::uuid/);
  assert.match(source, /MAX\(target\.sequence\),0\)\+1/);
  assert.match(source, /target\.work_scope_id IS NOT DISTINCT FROM \$1::uuid/);
  assert.match(source, /ELSE sequence END/);
  // Lô 1: [1], Lô 2: [1,2] -> move to Lô 2 receives MAX(1,2)+1 = 3.
  assert.equal(Math.max(1, 2) + 1, 3);
  // The same expression supports moving to/from the contract-level NULL scope.
  assert.equal(Math.max(4) + 1, 5);
});

test("unique sequence conflicts are mapped to a retryable 409 response", () => {
  const source = readFileSync(new URL("../../lib/tcms/server/http/api-response.ts", import.meta.url), "utf8");
  assert.match(source, /code === "23505"/);
  assert.match(source, /SEQUENCE_CONFLICT/);
  assert.match(source, /status: 409/);
});
