import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateEqualWeights,
  parseChecklistCompletionInput,
  parseContractItemInput,
  parseDailyLogInput,
  splitWorkContentIntoChecklistItems,
  summarizeContractItems,
  validateImportWeightTotal,
} from "../../lib/tcms/server/contracts/contract-item-service";
import type { ContractItem } from "../../lib/tcms/types/contract-item";

function item(overrides: Partial<ContractItem>): ContractItem {
  return { id:"item",contractId:"contract",sequenceNumber:1,serviceDescription:"Hạng mục",weightPercent:50,progressPercent:20,status:"IN_PROGRESS",version:1,...overrides };
}

test("contract item validation rejects invalid quantity and percentages",()=>{
  assert.throws(()=>parseContractItemInput({serviceDescription:"A",weightPercent:101,progressPercent:0,status:"NOT_STARTED"}),SyntaxError);
  assert.throws(()=>parseContractItemInput({serviceDescription:"A",quantity:2,completedQuantity:3,weightPercent:50,progressPercent:0,status:"NOT_STARTED"}),SyntaxError);
});

test("weighted progress is available only when total weight is 100",()=>{
  const incomplete=summarizeContractItems([item({weightPercent:40,progressPercent:50})]);
  assert.equal(incomplete.weightComplete,false); assert.equal(incomplete.weightedProgressPercent,null);
  const complete=summarizeContractItems([item({id:"a",weightPercent:40,progressPercent:50}),item({id:"b",weightPercent:60,progressPercent:100,status:"COMPLETED"})]);
  assert.equal(complete.weightComplete,true); assert.equal(complete.weightedProgressPercent,80); assert.equal(complete.completedItems,1);
});

test("equal weight allocation always totals exactly 100.00 percent", () => {
  assert.deepEqual(allocateEqualWeights(8), Array(8).fill(12.5));
  assert.deepEqual(allocateEqualWeights(3), [33.33, 33.33, 33.34]);
  assert.equal(allocateEqualWeights(7).reduce((sum, weight) => sum + weight, 0), 100);
  assert.doesNotThrow(() => validateImportWeightTotal([33.33, 33.33, 33.34]));
  assert.throws(() => validateImportWeightTotal([50, 49]), SyntaxError);

  // Partial available weight allocation (e.g. 80% or 50% available when existing items exist)
  assert.deepEqual(allocateEqualWeights(8, 80), Array(8).fill(10));
  assert.deepEqual(allocateEqualWeights(2, 50), [25, 25]);
  assert.doesNotThrow(() => validateImportWeightTotal([10, 10, 10, 10, 10, 10, 10, 10], 80));
  assert.throws(() => validateImportWeightTotal([10, 10], 50), SyntaxError);
});

test("work content is split only when every line is a clear list item", () => {
  assert.deepEqual(splitWorkContentIntoChecklistItems("1. Kiểm tra\n2. Thí nghiệm\n3. Bàn giao"), ["Kiểm tra", "Thí nghiệm", "Bàn giao"]);
  assert.deepEqual(splitWorkContentIntoChecklistItems("Kiểm tra tổng thể rồi bàn giao"), ["Kiểm tra tổng thể rồi bàn giao"]);
  assert.deepEqual(splitWorkContentIntoChecklistItems("Phạm vi:\n- Kiểm tra\n- Bàn giao"), ["Phạm vi:\n- Kiểm tra\n- Bàn giao"]);
});

test("work content splits inline and multiline numbered steps into separate checklist items", () => {
  // Continuous single-line numbered list
  assert.deepEqual(
    splitWorkContentIntoChecklistItems("1. Chuẩn bị tài liệu... 2. Vận chuyển công cụ... 3. Lắp đặt..."),
    ["Chuẩn bị tài liệu...", "Vận chuyển công cụ...", "Lắp đặt..."],
  );

  // Parentheses numbering: 1) 2) or (1) (2)
  assert.deepEqual(
    splitWorkContentIntoChecklistItems("1) Chuẩn bị vật tư 2) Thi công 3) Nghiệm thu"),
    ["Chuẩn bị vật tư", "Thi công", "Nghiệm thu"],
  );
  assert.deepEqual(
    splitWorkContentIntoChecklistItems("(1) Chuẩn bị (2) Thi công (3) Bàn giao"),
    ["Chuẩn bị", "Thi công", "Bàn giao"],
  );

  // Lettered list: a. b. c.
  assert.deepEqual(
    splitWorkContentIntoChecklistItems("a. Khảo sát hiện trường b. Lập bản vẽ c. Bàn giao"),
    ["Khảo sát hiện trường", "Lập bản vẽ", "Bàn giao"],
  );

  // Technical data & decimals are preserved without false splitting
  assert.deepEqual(
    splitWorkContentIntoChecklistItems(
      "1. Cắt ống D=1.5m và áp suất 2.0 bar 2. Hàn nối 3 mối hàn 3. Thử áp 10.5 kg/cm2 trong 24h",
    ),
    [
      "Cắt ống D=1.5m và áp suất 2.0 bar",
      "Hàn nối 3 mối hàn",
      "Thử áp 10.5 kg/cm2 trong 24h",
    ],
  );

  // Fallback to single item if no reliable list structure
  assert.deepEqual(
    splitWorkContentIntoChecklistItems("Thi công theo tiêu chuẩn 1.5 với 2 thiết bị."),
    ["Thi công theo tiêu chuẩn 1.5 với 2 thiết bị."],
  );

  // Empty or null returns empty array
  assert.deepEqual(splitWorkContentIntoChecklistItems(null), []);
  assert.deepEqual(splitWorkContentIntoChecklistItems("   "), []);
});

test("checklist and daily log inputs reject client-owned audit metadata", () => {
  assert.deepEqual(parseChecklistCompletionInput({ isCompleted: true, expectedVersion: 2, completedBy: "forged" }), { isCompleted: true, expectedVersion: 2 });
  assert.deepEqual(parseDailyLogInput({ logDate: "2026-08-27", note: "  Đang thực hiện  ", createdBy: "forged" }), { logDate: "2026-08-27", note: "Đang thực hiện" });
  assert.throws(() => parseDailyLogInput({ logDate: "27/08/2026", note: "A" }), SyntaxError);
});
