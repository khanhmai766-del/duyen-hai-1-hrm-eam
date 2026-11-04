import assert from "node:assert/strict";
import { test } from "node:test";
import { addDaysIso, canEditOperatingDate, defaultOperatingDate,defaultBcsxDate,millisecondsToBcsxRollover, isFutureOperatingDate, vietnamDateIso } from "../../../modules/ctktkt/lib/operating-date.ts";

test("BCSX switches D-1 to D at exactly 06:00 Vietnam time independently of host timezone",()=>{
  assert.equal(defaultBcsxDate(new Date('2026-10-26T22:59:59.999Z')),'2026-10-26');
  assert.equal(defaultBcsxDate(new Date('2026-10-26T23:00:00.000Z')),'2026-10-27');
  assert.equal(defaultBcsxDate(new Date('2026-10-27T16:59:59.999Z')),'2026-10-27');
  assert.equal(defaultBcsxDate(new Date('2026-10-27T17:00:00.000Z')),'2026-10-27','midnight still belongs to previous day until 06h');
  assert.equal(defaultBcsxDate(new Date('2026-12-31T22:59:59Z')),'2026-12-31');
  assert.equal(defaultBcsxDate(new Date('2026-12-31T23:00:00Z')),'2027-01-01');
  assert.equal(defaultBcsxDate(new Date('2028-02-29T23:00:00Z')),'2028-03-01');
});
test('BCSX schedules next 06h boundary instead of polling or switching at midnight',()=>{
  assert.equal(millisecondsToBcsxRollover(new Date('2026-10-26T22:59:59Z')),1000);
  assert.equal(millisecondsToBcsxRollover(new Date('2026-10-26T23:00:00Z')),24*3600000);
  assert.equal(millisecondsToBcsxRollover(new Date('2026-10-27T17:00:00Z')),6*3600000);
});

test("ngày vận hành mặc định là D-1 theo múi giờ Việt Nam", () => {
  const instant = new Date("2026-09-21T00:30:00Z"); // 07:30 ngày 21/09 tại Việt Nam
  assert.equal(vietnamDateIso(instant), "2026-09-21");
  assert.equal(defaultOperatingDate(instant), "2026-09-20");
});

test("D-1 xử lý đúng khi lùi qua tháng và năm", () => {
  assert.equal(addDaysIso("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysIso("2026-01-01", -1), "2025-12-31");
});

test("ngày hiện tại và quá khứ được phép; ngày tương lai bị chặn theo giờ Việt Nam", () => {
  const now = new Date("2026-10-04T02:00:00Z"); // 09:00 ngày 04/10 tại Việt Nam
  const today = vietnamDateIso(now);
  assert.equal(isFutureOperatingDate("2026-10-03", today), false);
  assert.equal(isFutureOperatingDate("2026-10-04", today), false);
  assert.equal(isFutureOperatingDate("2026-10-05", today), true);
});

test("tài khoản có quyền được sửa D và D-1; ngày cũ chỉ admin; ngày tương lai bị chặn", () => {
  const today = "2026-10-10";
  assert.equal(canEditOperatingDate("2026-10-10", true, today), true);
  assert.equal(canEditOperatingDate("2026-10-10", false, today), true);
  assert.equal(canEditOperatingDate("2026-10-09", true, today), true);
  assert.equal(canEditOperatingDate("2026-10-09", false, today), true);
  assert.equal(canEditOperatingDate("2026-10-08", true, today), true);
  assert.equal(canEditOperatingDate("2026-10-08", false, today), false);
  assert.equal(canEditOperatingDate("2026-10-11", true, today), false);
  assert.equal(canEditOperatingDate("2026-10-11", false, today), false);
});
