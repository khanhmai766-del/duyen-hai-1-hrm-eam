import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { parsePermit } from "../../lib/server/work-permits";
import { resolvePermitIdentities } from "../../lib/server/work-permit-identities";

const user = { id: "issuer", name: "Trưởng ca" };
const body = {
  kind: "MECHANICAL", unit: "S1", year: 2026, number: "4455", workDate: "2026-10-05",
  teamType: "CONTRACTOR", contractorScope: "SCTX", format: "PAPER", status: "ISSUED",
  content: "Ghi nhận PCT sửa chữa thường xuyên", issuedAt: "2026-10-05T10:00:00+07:00",
  teamName: "", commanderName: "", commanderPersonId: null,
};
function fixture(person: { id: string; name: string; company: string; isActive: boolean; canCommand: boolean } | null = null) {
  let reads = 0;
  const tx = {
    $queryRaw: async () => [],
    workPermitPerson: { findUnique: async () => { reads++; return person; } },
  } as unknown as Prisma.TransactionClient;
  return { tx, reads: () => reads };
}

test("cấp SCTX Cơ/Điện được khi chưa có nhà thầu và CHTT", async () => {
  for (const kind of ["MECHANICAL", "ELECTRICAL"]) {
    const f = fixture();
    const resolved = await resolvePermitIdentities(f.tx, { ...body, kind }, user);
    const parsed = parsePermit(resolved, "ISSUED");
    assert.equal(parsed.teamName, "");
    assert.equal(parsed.commanderName, "");
    assert.equal(parsed.commanderPersonId, null);
    assert.equal(parsed.workerCount, null);
    assert.equal(parsed.issuerUserId, user.id);
    assert.equal(f.reads(), 0);
  }
});

test("SCTX giữ tên CHTT nhập tay mà không gắn hồ sơ danh bạ", async () => {
  const f = fixture();
  const resolved = await resolvePermitIdentities(f.tx, { ...body, commanderName: " Nguyễn Văn Bình " }, user);
  const parsed = parsePermit(resolved, "ISSUED");
  assert.equal(parsed.commanderName, "Nguyễn Văn Bình");
  assert.equal(parsed.commanderPersonId, null);
  assert.equal(parsed.teamName, "");
  assert.equal(f.reads(), 0);
});

test("SCTX chọn từ danh bạ vẫn nhận đúng tên và đơn vị", async () => {
  const f = fixture({ id: "person", name: "Nguyễn Văn Bình", company: "Nhà thầu A", isActive: true, canCommand: true });
  const resolved = await resolvePermitIdentities(f.tx, { ...body, commanderPersonId: "person", commanderName: "Tên khác" }, user);
  const parsed = parsePermit(resolved, "ISSUED");
  assert.equal(parsed.commanderPersonId, "person");
  assert.equal(parsed.commanderName, "Nguyễn Văn Bình");
  assert.equal(parsed.teamName, "Nhà thầu A");
  assert.equal(f.reads(), 1);
});

test("SCTX không nhận hồ sơ CHTT không hợp lệ", async () => {
  for (const person of [null, { id: "person", name: "A", company: "B", isActive: false, canCommand: true },
    { id: "person", name: "A", company: "B", isActive: true, canCommand: false }]) {
    await assert.rejects(resolvePermitIdentities(fixture(person).tx, { ...body, commanderPersonId: "person" }, user),
      (error: unknown) => error instanceof Response && error.status === 400);
  }
});

test("Đại tu vẫn yêu cầu chọn CHTT; nội bộ vẫn yêu cầu tên và đơn vị", async () => {
  await assert.rejects(resolvePermitIdentities(fixture().tx, { ...body, contractorScope: "OVERHAUL", commanderName: "Tên nhập tay" }, user),
    (error: unknown) => error instanceof Response && error.status === 400);
  for (const patch of [{ contractorScope: "OVERHAUL" }, { teamType: "INTERNAL", contractorScope: null, workerCount: 1 }]) {
    assert.throws(() => parsePermit({ ...body, issuerName: user.name, ...patch }, "ISSUED"),
      (error: unknown) => error instanceof Response && error.status === 400);
  }
});

test("SCTX vẫn bắt buộc nội dung, người cấp và thời điểm cấp", () => {
  for (const patch of [{ content: "" }, { issuerName: "" }, { issuedAt: null }]) {
    assert.throws(() => parsePermit({ ...body, issuerName: user.name, ...patch }, "ISSUED"),
      (error: unknown) => error instanceof Response && error.status === 400);
  }
});
