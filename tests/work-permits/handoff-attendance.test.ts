import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { closeInsideVisits, handoffMembers } from "../../lib/server/work-permit-attendance";
import { attendanceInside } from "../../lib/work-permit-attendance";
import type { PermitMember } from "../../lib/work-permits";

const enteredAt = "2026-10-02T01:00:00.000Z";
const exitedAt = "2026-10-02T02:00:00.000Z";
const handoffAt = new Date("2026-10-02T03:00:00.000Z");
const person = (id: string): PermitMember => ({ personId: id, code: id, name: `Nhân viên ${id}`, company: "Nhà thầu A" });
const stored = (members: PermitMember[]): Prisma.JsonValue => JSON.parse(JSON.stringify(members));

test("bàn giao sau khi rút 3 người giữ 2 người trong khu vực, kể cả CHTT mới", () => {
  const previous = [
    { ...person("1"), attendance: [{ in: enteredAt, out: null }] },
    ...["2", "3", "4"].map(id => ({ ...person(id), attendance: [{ in: enteredAt, out: exitedAt }] })),
  ];
  const snapshot = structuredClone(previous);
  // Danh sách sau resolveSessionMembers chỉ còn thông tin nhân sự, không còn attendance.
  const next = handoffMembers(previous.map(({ attendance: _attendance, ...member }) => member), previous, handoffAt);
  assert.equal(1 + next.filter(attendanceInside).length, 2);
  assert.equal(next.filter(member => !attendanceInside(member)).length, 3);
  assert.deepEqual(next[0].attendance, [{ in: handoffAt.toISOString(), out: null }]);
  for (const member of next.slice(1)) assert.deepEqual(member.attendance, [{ in: enteredAt, out: exitedAt }]);
  assert.deepEqual(previous, snapshot);
  const ended = closeInsideVisits(previous, handoffAt);
  assert.equal(ended.filter(attendanceInside).length, 0);
  assert.equal(ended[0].attendance![0].out, handoffAt.toISOString());
  assert.equal(ended[1].attendance![0].out, exitedAt);
});

test("trạng thái đã RA mới nhất trong DB thắng dữ liệu VÀO cũ từ cửa sổ bàn giao", () => {
  const previous = [{ ...person("1"), attendance: [{ in: enteredAt, out: exitedAt }] }];
  const stale = [{ ...person("1"), attendance: [{ in: enteredAt, out: null }] }];
  const next = handoffMembers(stale, previous, handoffAt);
  assert.equal(attendanceInside(next[0]), false);
  assert.deepEqual(next[0].attendance, previous[0].attendance);
});

test("người chưa ghi VÀO vẫn ở ngoài, người mới bổ sung được ghi VÀO", () => {
  const next = handoffMembers([person("1"), person("2")], stored([person("1")]), handoffAt);
  assert.deepEqual(next[0].attendance, []);
  assert.equal(attendanceInside(next[0]), false);
  assert.deepEqual(next[1].attendance, [{ in: handoffAt.toISOString(), out: null }]);
});

test("người nhập tay được đối chiếu theo mã thẻ hoặc tên và đơn vị", () => {
  const manual: PermitMember[] = [
    { code: "the-1", name: "Nguyễn An", company: "Nhà thầu A" },
    { code: "", name: "Trần Bình", company: "Nhà thầu A" },
  ];
  const previous = manual.map(member => ({ ...member, attendance: [{ in: enteredAt, out: exitedAt }] }));
  const next = handoffMembers([{ ...manual[0], code: "THE-1" }, manual[1]], previous, handoffAt);
  assert.equal(next.filter(attendanceInside).length, 0);
  assert.deepEqual(next.map(member => member.attendance), previous.map(member => member.attendance));
});

test("bàn giao liên tiếp không đưa người đã RA trở vào; lượt vào lại rõ ràng được chuyển tiếp", () => {
  const previous = [{ ...person("1"), attendance: [{ in: enteredAt, out: exitedAt }] }];
  const first = handoffMembers([person("1")], previous, handoffAt);
  const later = new Date("2026-10-02T05:00:00.000Z");
  assert.equal(attendanceInside(handoffMembers([person("1")], stored(first), later)[0]), false);
  first[0].attendance!.push({ in: "2026-10-02T04:00:00.000Z", out: null });
  const next = handoffMembers([person("1")], stored(first), later);
  assert.deepEqual(next[0].attendance, [{ in: later.toISOString(), out: null }]);
  assert.equal(first[0].attendance!.length, 2);
});
