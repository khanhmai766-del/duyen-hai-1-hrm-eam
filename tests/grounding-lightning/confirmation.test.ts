import assert from "node:assert/strict";
import test from "node:test";
import { assertGroundingInspectionSlot } from "../../lib/server/grounding-inspection-schedule";
import { serializeGroundingOverviewItem, serializeGroundingSlotItem } from "../../lib/grounding-lightning";

const catalog = ["A", "B", "C"].map((areaEquipment) => ({
  id: areaEquipment, positionCode: "BOILER_DEPUTY", position: "Lò phó", machine: "S1", areaEquipment,
}));
const now = new Date("2026-10-06T15:00:00+07:00");

test("Máy chủ chỉ cho xác nhận tuyến được giao trong ca hiện tại", () => {
  assert.deepEqual(assertGroundingInspectionSlot(catalog[1], catalog, { date: "2026-10-06", shiftType: "AFTERNOON" }, now), { date: "2026-10-06", shiftType: "AFTERNOON" });
  assert.throws(() => assertGroundingInspectionSlot(catalog[0], catalog, undefined, now), asyncResponse409);
  assert.throws(() => assertGroundingInspectionSlot(catalog[1], catalog, { date: "2026-10-05", shiftType: "AFTERNOON" }, now), asyncResponse409);
  assert.throws(() => assertGroundingInspectionSlot(catalog[1], catalog, { date: "2026-10-06", shiftType: "NIGHT" }, now), asyncResponse409);
});
function asyncResponse409(error: unknown) { return error instanceof Response && error.status === 409; }

const item = () => ({
  ...catalog[1], note: null, updatedAt: "2026-10-06T15:00:00+07:00",
  points: [{ id: "p", type: "GROUNDING", status: "DEFECT", defectDescription: "Khiếm khuyết phát hiện ca chiều", updatedAt: "2026-10-06T15:00:00+07:00", attachments: [] }],
  inspections: [{ id: "i", inspectedById: "u", inspectorName: "Người kiểm tra", inspectorPosition: "Lò phó", signedAt: "2026-10-06T08:00:00+07:00", note: "Ghi chú ca sáng", results: [{ type: "GROUNDING", status: "NORMAL", defectDescription: null, imageKeys: [] }] }],
});

test("Xác nhận buổi sáng không hoàn thành buổi chiều; ca đã kết thúc giữ nguyên kết quả được ký", () => {
  const row = item();
  const morning = serializeGroundingSlotItem(row, { date: "2026-10-06", shiftType: "MORNING" }, ["MORNING", "AFTERNOON"], undefined, now);
  assert.equal(morning.needsSignature, false);
  assert.equal(morning.canInspect, false);
  assert.equal(morning.points[0].status, "NORMAL");
  assert.equal(morning.note, "Ghi chú ca sáng");
  const afternoon = serializeGroundingSlotItem(row, { date: "2026-10-06", shiftType: "AFTERNOON" }, ["MORNING", "AFTERNOON"], undefined, now);
  assert.equal(afternoon.needsSignature, true);
  assert.equal(afternoon.canInspect, true);
  assert.equal(afternoon.latestInspection, null);
  assert.equal(afternoon.points[0].status, "DEFECT");
});

test("Dòng có xác nhận trong ca vẫn cần xác nhận lại khi kết quả đã được sửa sau đó", () => {
  const row = item();
  row.inspections[0].signedAt = "2026-10-06T14:30:00+07:00";
  const slot = { date: "2026-10-06", shiftType: "AFTERNOON" as const };
  const before = serializeGroundingSlotItem(row, slot, ["AFTERNOON"], undefined, now);
  assert.equal(before.needsSignature, true);
  row.inspections[0].signedAt = "2026-10-06T15:00:01+07:00";
  const after = serializeGroundingSlotItem(row, slot, ["AFTERNOON"], undefined, new Date("2026-10-06T15:01:00+07:00"));
  assert.equal(after.needsSignature, false);
});

test("Toàn thiết bị giữ khiếm khuyết hiện tại dù ca cũ đã ký bình thường", () => {
  const row = serializeGroundingOverviewItem(item(), "2026-10-06", ["MORNING"], undefined, now);
  assert.equal(row.points[0].status, "DEFECT");
  assert.equal(row.note, null);
  assert.equal(row.canInspect, false);
  assert.equal(row.needsSignature, false);
});
