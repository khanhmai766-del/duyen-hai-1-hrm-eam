import assert from "node:assert/strict";
import test from "node:test";
import { buildGroundingCatalogPlan, type SavedCatalogItem } from "../../lib/server/grounding-catalog-plan";
import { millDetail, type CatalogLocation } from "../../lib/server/grounding-catalog-workbook";

const location = (name: string, row: number): CatalogLocation => ({ sheet: "Máy nghiền 2", rows: [row], areaEquipment: name,
  position: "Máy nghiền", positionCode: "COAL_MILL", machine: "S2", machineExplicit: true, parentName: "Mill 2A", note: null,
  points: [{ type: "GROUNDING", status: "NORMAL", defectDescription: null }], warnings: [] });
const parent: SavedCatalogItem = { id: "parent", areaEquipment: "Mill 2A", positionCode: "COAL_MILL", machine: "S2",
  sourceKey: "legacy", isActive: true, points: [{ type: "GROUNDING", status: "DEFECT" }] };

test("Tên bộ phận ở F không phải khiếm khuyết; đọc lỗi ở cả F và G, không bỏ dòng chưa ghi kết quả", () => {
  assert.equal(millDetail("Động cơ chính Mill 2A (2 dây)", "X", "", "Mill 2A").point.status, "NORMAL");
  const fault = millDetail("Động cơ chính Mill 2A (2 dây)", "X (2 dây bị bung 1 dây)", "", "Mill 2A");
  assert.equal(fault.point.status, "DEFECT");
  assert.match(fault.point.defectDescription!, /bung/);
  assert.equal(millDetail("Bơm HGT mill 2D Mất tiếp địa", "", "Chưa xử lý", "Mill 2D").areaEquipment, "Bơm HGT mill 2D");
  assert.equal(millDetail("Bơm A trạm dầu DCC Mill 2E", "", "", "Mill 2E").point.status, "UNCHECKED");
  assert.equal(millDetail("Động cơ Phân ly A mất tiếp địa", "", "", "Mill 2D").areaEquipment, "Động cơ Phân ly A · Mill 2D");
});

test("Giữ từng dòng trùng tên, tạo vị trí riêng, lưu mục tổng thành lịch sử và bỏ nhiệm vụ ngoài file", () => {
  const rows = [location("Bơm A trạm dầu HP mill 2A", 30), location("Bơm A trạm dầu HP mill 2A", 31)];
  const extra = { ...parent, id: "extra", areaEquipment: "Mục không còn trong file" };
  const plan = buildGroundingCatalogPlan(rows, [parent, extra]);
  assert.equal(plan.summary.activeAfter, 2);
  assert.equal(plan.summary.create, 2);
  assert.equal(new Set(plan.entries.map((entry) => entry.sourceKey)).size, 2);
  assert.ok(plan.entries.every((entry) => entry.splitFromId === parent.id));
  assert.deepEqual(plan.archiveIds, [parent.id, extra.id]);
  assert.equal(parent.points[0].status, "DEFECT");
});

test("Chạy lại cùng danh sách không tạo trùng hoặc giảm sai số nhiệm vụ", () => {
  const rows = [location("Bơm A trạm dầu HP mill 2A", 30), location("Bơm A trạm dầu HP mill 2A", 31)];
  const first = buildGroundingCatalogPlan(rows, [parent]);
  const saved = [{ ...parent, isActive: false }, ...first.entries.map((entry, index) => ({
    id: `child-${index}`, sourceKey: entry.sourceKey, isActive: true, splitFromId: parent.id,
    areaEquipment: entry.incoming.areaEquipment, positionCode: entry.incoming.positionCode, machine: entry.machine, points: entry.incoming.points,
  }))];
  const repeated = buildGroundingCatalogPlan(rows, saved);
  assert.equal(repeated.summary.create, 0);
  assert.equal(repeated.summary.retireTotal, 0);
  assert.equal(repeated.summary.activeAfter, 2);
  assert.ok(repeated.entries.every((entry) => entry.splitFromId === parent.id));
});

test("Giữ ID và kết quả cho vị trí hiện có; sửa tổ máy Common cũ khi tên/file xác định rõ S1", () => {
  const saved = { ...parent, id: "generator", areaEquipment: "Máy phát S1", positionCode: "ELECTRICAL_MAIN_OPERATOR", machine: "COMMON" };
  const row = { ...location("Máy phát S1", 4), positionCode: saved.positionCode, machine: "S1", parentName: null };
  const plan = buildGroundingCatalogPlan([row], [saved]);
  assert.equal(plan.entries[0].existingId, saved.id);
  assert.equal(plan.entries[0].machine, "S1");
  assert.equal(plan.entries[0].addedTypes.length, 0);
  assert.equal(saved.points[0].status, "DEFECT");
});
