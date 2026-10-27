import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { activeGroundingDuties, buildGroundingReminder, groundingItemPending, type GroundingDuty, type GroundingReminderItem } from "../../lib/grounding-reminder";
import { claimGroundingReminder, getGroundingReminder } from "../../lib/server/grounding-reminder";

const now = new Date("2026-10-27T15:00:00+07:00");
const access = { all: false, positionCode: "COAL_MILL", user: { position: "Máy nghiền S1" } };
function duty(label = "14. Máy nghiền S1", patch: Partial<GroundingDuty> = {}): GroundingDuty {
  return { isApproved: true, positionLabel: label,
    shift: { date: new Date("2026-10-27T00:00:00Z"), shiftType: "AFTERNOON", checkIns: [] }, ...patch };
}
function item(id: string, machine = "S1", assignedShift: string | null = "AFTERNOON"): GroundingReminderItem {
  return { id, isActive: true, positionCode: "COAL_MILL", position: "Máy nghiền", machine,
    areaEquipment: `Khu vực ${id}`, assignedShift, updatedAt: new Date("2026-10-26T12:00:00+07:00"), points: [], inspections: [] };
}
function inspection(date = "2026-10-27", shift = "AFTERNOON", signedAt = "2026-10-27T14:30:00+07:00") {
  return { signedAt: new Date(signedAt), inspectionDate: date, inspectionShift: shift };
}

test("Chỉ người trong ca đã duyệt đang diễn ra; không lấy hồ sơ/ca sớm/ca cũ/vắng/đã ra ca", () => {
  const current = duty();
  const rows = [current, duty("Máy nghiền S1", { isApproved: false }),
    duty("Máy nghiền S1", { shift: { ...current.shift, shiftType: "NIGHT" } }),
    duty("Máy nghiền S1", { shift: { ...current.shift, date: new Date("2026-10-26T00:00:00Z") } }),
    duty("Máy nghiền S1", { shift: { ...current.shift, checkIns: [{ status: "ABSENT", checkOutAt: null }] } }),
    duty("Máy nghiền S1", { shift: { ...current.shift, checkIns: [{ status: "PRESENT", checkOutAt: now }] } }),
  ];
  assert.deepEqual(activeGroundingDuties(rows, now), [current]);
  assert.equal(buildGroundingReminder([], [item("1")], now, access), null);
  assert.equal(buildGroundingReminder([current], [item("1")], new Date("2026-10-27T22:00:00+07:00"), access), null);
});

test("Ca đêm qua nửa đêm vẫn thuộc ngày vận hành cũ, hết ca không còn nhắc dù được ký muộn", () => {
  const night = duty("Máy nghiền S1", { shift: { ...duty().shift, shiftType: "NIGHT" } });
  const row = item("1", "S1", "NIGHT");
  const reminder = buildGroundingReminder([night], [row], new Date("2026-10-28T04:00:00+07:00"), access)!;
  assert.equal(reminder.key, "2026-10-27:NIGHT");
  assert.equal(reminder.endsAt, new Date("2026-10-28T06:00:00+07:00").toISOString());
  assert.equal(buildGroundingReminder([night], [row], new Date(reminder.endsAt), access), null);
  assert.equal(buildGroundingReminder([night], [row], new Date("2026-10-27T21:59:59+07:00"), access), null);
});

test("Theo cương vị trực thay và đúng tổ máy; không kéo nhiệm vụ của cương vị hồ sơ khác", () => {
  const result = buildGroundingReminder([duty()], [item("1"), item("2", "S2"),
    { ...item("3"), positionCode: "BOILER_DEPUTY", position: "Lò phó" }, item("4", "S1", "MORNING")], now,
  { all: false, positionCode: "BOILER_DEPUTY", user: { position: "Lò phó S2", secondaryPosition: "Máy nghiền S1" } })!;
  assert.equal(result.pending, 1);
  assert.equal(result.groups[0].machine, "S1");
  assert.equal(result.groups[0].workingPosition, "Máy nghiền S1");
  assert.match(result.groups[0].href, /positionCode=COAL_MILL&machine=S1&shiftType=CURRENT/);
  assert.equal(buildGroundingReminder([duty()], [item("1")], now,
    { all: false, positionCode: "BOILER_DEPUTY", user: { position: "Lò phó S1" } }), null, "Không mở rộng quyền hồ sơ");
});

test("Chia tuyến từ toàn nhóm trước khi đếm, tôn trọng ca cố định, không đếm trùng ghế trực", () => {
  const rows = [item("1", "S1", null), item("2", "S1", null), item("3", "S1", null), { ...item("old"), isActive: false }];
  const result = buildGroundingReminder([duty(), duty()], rows, now, access)!;
  assert.equal(result.pending, 1);
  assert.equal(result.groups[0].total, 1);
  rows[1].inspections = [inspection()];
  assert.equal(buildGroundingReminder([duty()], rows, now, access), null);
  assert.equal(buildGroundingReminder([duty()], [item("only", "S1", "MORNING")], now, access), null);
});

test("Ghế không ghi hậu tố có thể trực cả hai tổ máy; chỉ nhắc nhiệm vụ đúng chức danh", () => {
  const result = buildGroundingReminder([duty("Máy nghiền")], [item("1"), item("2", "S2")], now, access)!;
  assert.equal(result.groups.length, 2);
  assert.equal(result.pending, 2);
});

test("Lượt ký đúng ca của bất kỳ người nào hoàn thành nhiệm vụ; sửa kết quả/ảnh sau ký cần xác nhận lại", () => {
  const row = item("1");
  const slot = { date: "2026-10-27", shiftType: "AFTERNOON" as const };
  row.inspections = [inspection("2026-10-26"), inspection("2026-10-27", "MORNING")];
  assert.equal(groundingItemPending(row, slot), true);
  row.inspections.push(inspection());
  assert.equal(groundingItemPending(row, slot), false);
  row.points = [{ updatedAt: row.updatedAt, attachments: [{ createdAt: now }] }];
  assert.equal(groundingItemPending(row, slot), true);
  row.points = [];
  row.inspections = [{ signedAt: new Date("2026-10-27T15:00:00+07:00"), inspectionDate: null, inspectionShift: null }];
  assert.equal(groundingItemPending(row, slot), false, "Lượt cũ dùng thời điểm ký");
  row.inspections = [inspection("2026-10-27", "MORNING", "2026-10-27T15:00:00+07:00")];
  assert.equal(groundingItemPending(row, slot), true, "Ký muộn ca sáng không hoàn thành ca chiều");
});

test("API chỉ đọc phân công của tài khoản hiện tại; GET vẫn trả tiến độ sau khi đã hiện popup", async () => {
  let shown = false;
  const calls: unknown[] = [];
  const db = {
    shiftAssignment: { findMany: async (args: unknown) => { calls.push(args); return [duty()]; } },
    groundingLightningItem: { findMany: async () => [item("1")] },
    groundingShiftReminder: {
      findUnique: async () => shown ? { id: "shown" } : null,
      createMany: async () => { if (shown) return { count: 0 }; shown = true; return { count: 1 }; },
    },
  } as unknown as Pick<PrismaClient, "shiftAssignment" | "groundingLightningItem" | "groundingShiftReminder">;
  const reminder = (await getGroundingReminder(db, "user-1", access, now))!;
  assert.equal(reminder.shown, false);
  const args = calls[0] as { where: { userId: string; isApproved: boolean; shift: { shiftType: string } } };
  assert.equal(args.where.userId, "user-1");
  assert.equal(args.where.isApproved, true);
  assert.equal(args.where.shift.shiftType, "AFTERNOON");
  assert.deepEqual(await Promise.all([claimGroundingReminder(db, "user-1", reminder), claimGroundingReminder(db, "user-1", reminder)]), [true, false]);
  const after = (await getGroundingReminder(db, "user-1", access, now))!;
  assert.equal(after.shown, true);
  assert.equal(after.pending, 1, "Đã hiểu không hoàn thành kiểm tra hoặc xoá mục trong chuông");
});
