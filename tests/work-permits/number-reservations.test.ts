import test from "node:test";
import assert from "node:assert/strict";
import { canonicalPermitNumber, permitNumberScope, reservePermitNumber } from "../../lib/server/work-permit-number-reservations";

test("số nhập tay dùng cùng một dạng chuẩn để tránh 001 và 1 chiếm hai lượt", () => {
  assert.equal(canonicalPermitNumber(" 000897 "), "897");
  assert.equal(canonicalPermitNumber("9".repeat(80)), "9".repeat(80));
  for (const value of ["0", "000", "-1", "1.5", "1A", "9".repeat(81)]) {
    assert.throws(() => canonicalPermitNumber(value));
  }
});

test("phạm vi cấp số chỉ gồm loại PCT và năm hợp lệ", () => {
  assert.deepEqual(permitNumberScope("MECHANICAL", "2026"), { kind: "MECHANICAL", year: 2026 });
  assert.deepEqual(permitNumberScope("ELECTRICAL", 2026), { kind: "ELECTRICAL", year: 2026 });
  for (const [kind, year] of [["OTHER", 2026], ["MECHANICAL", 1999], ["ELECTRICAL", 2026.5]]) {
    assert.throws(() => permitNumberScope(kind, year));
  }
});

test("không cho nhập số mới tùy ý thay cho lấy số tiếp theo", async () => {
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "WorkPermitNumberBaseline"')) return [{ number: "12" }];
      if (sql.includes('max("number"::numeric)')) return [{ highest: "12" }];
      return [];
    },
    workPermitNumberReservation: { findFirst: async () => null },
  } as unknown as Parameters<typeof reservePermitNumber>[0];
  await assert.rejects(reservePermitNumber(tx, {
    kind: "MECHANICAL", year: 2026, teamType: "CONTRACTOR", requestedNumber: "50",
    ownerId: "operator", ownerName: "Người cấp",
  }), (error: unknown) => error instanceof Response && error.status === 409);
});
