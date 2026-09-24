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

test("luôn lấy số tiếp theo; số đã hủy bị bỏ, không cấp lại", async () => {
  const created: Array<Record<string, unknown>> = [];
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "WorkPermitNumberBaseline"')) return [{ number: "12" }];
      // Mốc cao nhất tính cả phiếu/lượt giữ đã hủy (15 đã hủy) nên số mới là 16.
      if (sql.includes('max("number"::numeric)')) return [{ highest: "15" }];
      return [];
    },
    workPermitNumberReservation: { create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: "r1", ...data }; } },
    workPermitNumberReservationHistory: { create: async () => ({}) },
  } as unknown as Parameters<typeof reservePermitNumber>[0];
  const row = await reservePermitNumber(tx, { kind: "MECHANICAL", year: 2026, teamType: "CONTRACTOR", ownerId: "operator", ownerName: "Người cấp" });
  assert.equal(row.number, "16");
  assert.equal(created.length, 1);
});
