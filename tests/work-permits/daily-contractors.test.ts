import assert from "node:assert/strict";
import test from "node:test";
import type { prisma } from "../../lib/prisma";
import { loadDailyWorkingByCompany } from "../../lib/server/work-permit-daily-working";

test("Nhân sự và danh sách số hiệu PCT gộp nhiều lần làm việc, qua ngày, theo tên nhà thầu hiện tại", async () => {
  const company = "Nhà thầu đổi tên";
  const at = (time: string) => new Date(`2026-10-12T${time}+07:00`);
  const person = (id: string) => ({ personId: id, code: id, name: id, company: "Tên cũ", attendance: [{ in: at("08:00:00").toISOString(), out: at("09:00:00").toISOString() }] });
  const base = { commanderId: "ch", commanderCode: "ch", commanderName: "Chỉ huy", company: "Tên cũ", openedAt: at("08:00:00"), endedAt: at("09:00:00"), members: [person("w1")], permit: { id: "p1", number: "4299", year: 2026 } };
  let where: unknown;
  const db = { workPermitSession: { findMany: async (args: { where: unknown }) => { where = args.where; return [
    base, { ...base, members: [person("w1"), person("w2")] },
    { ...base, permit: { id: "p2", number: "4300", year: 2026 }, members: [person("w2")] },
    { ...base, openedAt: new Date("2026-10-11T23:00:00+07:00"), endedAt: at("01:00:00"), members: [] },
    { ...base, openedAt: new Date("2026-10-11T22:00:00+07:00"), endedAt: at("00:00:00"), permit: { id: "old", number: "4000", year: 2026 }, members: [] },
  ]; } }, workPermitPerson: { findMany: async () => ["ch", "w1", "w2"].map(id => ({ id, company })) } } as unknown as typeof prisma;
  const result = await loadDailyWorkingByCompany("2026-10-12", at("23:00:00"), "OVERHAUL", db);
  assert.equal(result.byCompany.get(company), 3);
  assert.deepEqual([...result.permitsByCompany.get(company)!.values()], ["4299/2026/VH1-NĐDH", "4300/2026/VH1-NĐDH"]);
  assert.deepEqual((where as { permit: unknown }).permit, { teamType: "CONTRACTOR", contractorScope: "OVERHAUL" });
});
