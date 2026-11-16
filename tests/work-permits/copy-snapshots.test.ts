import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { copyPermitSnapshots } from "../../lib/work-permit-copy";
import { resolvePermitSafety } from "../../lib/server/work-permit-safety";

const oldSafety = [
  { sourceId: "deleted", hazard: "Khí bụi có hại cho sức khỏe;", measure: "Mang mặt nạ hoặc khẩu trang phòng độc", forAuthorization: false, forExecution: true },
  { sourceId: "inactive", hazard: "Thiếu ánh sáng", measure: "Trang bị đèn chiếu phù hợp.\nKiểm tra trước khi làm.", forAuthorization: true, forExecution: true },
];
const body = { kind: "MECHANICAL", format: "PAPER", teamType: "CONTRACTOR", status: "ISSUED" };
const tx = { workPermitSafetyMeasure: { findMany: async () => [{ id: "inactive", kind: "MECHANICAL", isActive: false }] } } as unknown as Prisma.TransactionClient;

test("Sao chép giữ nguyên mối nguy, biện pháp, phân công dù danh mục cũ đã xóa/ngừng dùng", async () => {
  const source = { safetyItems: structuredClone(oldSafety) };
  const copied = copyPermitSnapshots(source);
  assert.deepEqual(copied.safetyItems, oldSafety.map(({ hazard, measure, forAuthorization, forExecution }) => ({ hazard, measure, forAuthorization, forExecution })));
  assert.deepEqual(await resolvePermitSafety(tx, { ...body, safetyItems: copied.safetyItems }), copied.safetyItems);
  copied.safetyItems[0].measure = "Nội dung phiếu mới";
  assert.deepEqual(source.safetyItems, oldSafety);
});

test("Biểu mẫu cũ đang mở cũng lưu được biện pháp đã xóa/ngừng dùng, không cần nhập lại", async () => {
  const expected = copyPermitSnapshots({ safetyItems: oldSafety }).safetyItems;
  assert.deepEqual(await resolvePermitSafety(tx, { ...body, safetyItems: oldSafety }), expected);
  assert.equal(oldSafety[0].sourceId, "deleted");
  assert.equal(oldSafety[1].sourceId, "inactive");
});

test("Không bắt buộc số lượng biện pháp, vẫn kiểm tra nội dung, phân công và loại phiếu", async () => {
  assert.deepEqual(await resolvePermitSafety(tx, { ...body, safetyItems: [] }), []);
  const copied = copyPermitSnapshots({ safetyItems: oldSafety }).safetyItems;
  await assert.rejects(resolvePermitSafety(tx, { ...body, safetyItems: [{ ...copied[0], forAuthorization: false, forExecution: false }] }), error => error instanceof Response && error.status === 400);
  await assert.rejects(resolvePermitSafety(tx, { ...body, safetyItems: [{ ...copied[0], measure: "" }] }), error => error instanceof Response && error.status === 400);
  const otherKind = { workPermitSafetyMeasure: { findMany: async () => [{ id: "inactive", kind: "ELECTRICAL", isActive: true }] } } as unknown as Prisma.TransactionClient;
  await assert.rejects(resolvePermitSafety(otherKind, { ...body, safetyItems: [oldSafety[1]] }), error => error instanceof Response && error.status === 400);
});

test("Sao chép hạng mục đại tu độc lập, không kế thừa xác nhận dùng chung", () => {
  const item = { code: "2.1.17", device: "Van tay", content: "Đại tu van tay", method: "Cô lập\nKiểm tra", source: "TURBINE", sheet: "Trợ thủ-Cơ", confirmedShared: true };
  const copied = copyPermitSnapshots({ overhaulItems: [item] });
  assert.deepEqual(copied.overhaulItems, [{ code: item.code, device: item.device, content: item.content, method: item.method, source: item.source, sheet: item.sheet }]);
  copied.overhaulItems[0].method = "Sửa trên phiếu mới";
  assert.equal(item.method, "Cô lập\nKiểm tra");
  assert.deepEqual(copyPermitSnapshots({}), { safetyItems: [], overhaulItems: [] });
});
