import test from "node:test";
import assert from "node:assert/strict";
import { claimNkvhPermit, importExistingNkvhPermit, parseNkvhPage, parseExistingNkvhPermitNumber } from "../../lib/server/work-permit-nkvh-claim";
import { consumePermitNumberReservation, reservePermitNumber } from "../../lib/server/work-permit-number-reservations";
import { reviewObservedNumber } from "../../lib/server/work-permit-number-review";
import { formatPermitNumber } from "../../lib/work-permits";

const kind = "MECHANICAL" as const;
const user = { id: "shift", name: "Trưởng ca", role: "SUPERVISOR" };
const pct = "11111111-2222-3333-4444-555555555555";
const page = parseNkvhPage({ content: "Kiểm tra vòi phun", qlvhCode: "VH", teamCode: "PCN", authorizerPosition: "Máy phó" }, kind);
// Bộ nhớ cô lập: kiểm tra nghiệp vụ; khóa/unique thực trên PostgreSQL được kiểm tra bằng script hoàn tác.
function fixture() {
  const permits: Record<string, unknown>[] = [], reservations: Record<string, unknown>[] = [], history: Record<string, unknown>[] = [], queries: string[] = [];
  let sequence = 0;
  const match = (row: Record<string, unknown>, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object") {
      const filter = value as { in?: unknown[]; not?: unknown };
      return filter.in ? filter.in.includes(row[key]) : row[key] !== filter.not;
    }
    return row[key] === value;
  });
  function table(rows: Record<string, unknown>[]) {
    return {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find(row => match(row, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => rows.filter(row => match(row, where)),
      findUniqueOrThrow: async ({ where }: { where: Record<string, unknown> }) => { const row = rows.find(row => match(row, where)); assert.ok(row); return { ...row }; },
      findUnique: async ({ where }: { where: Record<string, unknown> }) => rows.find(row => match(row, where)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `id-${++sequence}`, version: 1, status: "RESERVED", nkvhPctId: null, permitId: null, nkvhNumber: null,
          createdAt: new Date("2026-10-05"), updatedAt: new Date("2026-10-05"), ...data };
        rows.push(row); return { ...row };
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const row = rows.find(row => match(row, where)); assert.ok(row);
        Object.assign(row, data, { version: typeof data.version === "object" ? Number(row.version) + 1 : row.version }); return { ...row };
      },
      updateMany: async () => ({ count: 0 }),
    };
  }
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join("?"); queries.push(sql);
      if (sql.includes('FROM "WorkPermitNumberBaseline"')) return [{ number: "4450" }];
      if (sql.includes('max("number"::numeric)')) return [{ highest: "4454" }];
      if (sql.includes('"number"::numeric =')) {
        const [k, year, number, exclude] = values;
        return permits.filter(row => row.kind === k && row.year === year && BigInt(String(row.number)) === BigInt(String(number)) && row.id !== exclude
          && (!sql.includes('NOT IN') || !["DRAFT", "CANCELLED"].includes(String(row.status))));
      }
      return [];
    },
    workPermitNumberBaseline: { findUnique: async () => ({ number: "4450" }) },
    workPermit: table(permits), workPermitNumberReservation: table(reservations),
    workPermitHistory: { create: async ({ data }: { data: Record<string, unknown> }) => { history.push(data); return data; } },
    workPermitNumberReservationHistory: { create: async ({ data }: { data: Record<string, unknown> }) => { history.push(data); return data; } },
  } as unknown as Parameters<typeof claimNkvhPermit>[0];
  return { tx, permits, reservations, history, queries };
}
const rejected = async (run: () => Promise<unknown>, message: RegExp) => {
  try { await run(); assert.fail("Lẽ ra phải từ chối"); } catch (error) {
    assert.ok(error instanceof Response); assert.equal(error.status, 409); assert.match((await error.json()).error, message);
  }
};
const input = (number = "4451") => ({ kind, nkvhPctId: pct, page, unit: "", position: "", formattedNumber: `${number}/2026/VH1-NĐDH` });

test("lấy số trên NKVH chỉ giữ; bấm lại cùng lượt, chưa tạo PCT", async () => {
  const f = fixture();
  const first = await claimNkvhPermit(f.tx, user, input(), new Date("2026-10-05"));
  const again = await claimNkvhPermit(f.tx, user, input(), new Date("2026-10-05"));
  assert.equal(first.status, "RESERVED"); assert.equal(first.number, "4455"); assert.equal(again.id, first.id);
  assert.equal(f.permits.length, 0); assert.equal(f.reservations.length, 1);
  assert.ok(f.queries[0].includes("pg_advisory_xact_lock"));
});
test("số 4451 chưa dùng vẫn lấy được khi dãy đã đến 4454", async () => {
  const f = fixture();
  const held = await reservePermitNumber(f.tx, { kind, year: 2026, number: "04451", teamType: "INTERNAL", ownerId: user.id, ownerName: user.name });
  assert.equal(held.number, "4451");
});
test("số phiếu đã hủy không được coi là số trống", async () => {
  const f = fixture(); f.permits.push({ id: "cancelled", kind, year: 2026, number: "4451", status: "CANCELLED" });
  await rejected(() => reservePermitNumber(f.tx, { kind, year: 2026, number: "4451", teamType: "INTERNAL", ownerId: user.id, ownerName: user.name }), /hủy/);
});
test("nhận phiếu NKVH đã lưu hoàn tất số người khác giữ để cấp giấy", async () => {
  const f = fixture(); f.reservations.push({ id: "paper-hold", kind, year: 2026, number: "4451", status: "RESERVED", ownerId: "other", ownerName: "Trưởng kíp", teamType: "CONTRACTOR", permitId: null });
  const result = await importExistingNkvhPermit(f.tx, user, input(), new Date("2026-10-05"));
  assert.equal(result.number, "4451"); assert.equal(f.reservations[0].status, "ISSUED"); assert.equal(f.reservations[0].permitId, result.id);
  assert.equal(f.permits[0].position, "Máy phó"); assert.equal(f.permits[0].unit, "UNKNOWN");
  assert.ok(f.history.some(row => String(row.note).includes("Trưởng kíp")));
  await rejected(() => consumePermitNumberReservation(f.tx, { reservationId: "paper-hold", kind, year: 2026, number: "4451", teamType: "CONTRACTOR", userId: "other", userName: "Trưởng kíp", isAdmin: false, permitId: "paper" }), /không còn hiệu lực/);
});
test("đồng bộ lại một phiếu không tạo thêm hồ sơ, lịch sử hoặc phiên bản", async () => {
  const f = fixture(); const first = await importExistingNkvhPermit(f.tx, user, input(), new Date("2026-10-05"));
  const count = f.history.length, version = f.permits[0].version;
  const again = await importExistingNkvhPermit(f.tx, user, input(), new Date("2026-10-05"));
  assert.equal(again.id, first.id); assert.equal(again.changed, false); assert.equal(f.permits.length, 1); assert.equal(f.history.length, count); assert.equal(f.permits[0].version, version);
});
test("đổi số theo NKVH cập nhật cùng hồ sơ, số cũ chờ đối chiếu", async () => {
  const f = fixture(); const first = await importExistingNkvhPermit(f.tx, user, input(), new Date("2026-10-05"));
  const changed = await importExistingNkvhPermit(f.tx, user, { ...input("4456"), page: { ...page, content: "Nội dung sửa trên NKVH" } }, new Date("2026-10-05"));
  assert.equal(changed.id, first.id); assert.equal(changed.number, "4456"); assert.equal(f.permits[0].content, "Nội dung sửa trên NKVH");
  assert.equal(f.reservations[0].status, "REVIEW"); assert.equal(f.reservations[0].permitId, null); assert.equal(changed.pendingReservations.length, 1);
});
test("không ghi đè PCT giấy đã cấp chỉ vì trùng số", async () => {
  const f = fixture(); f.permits.push({ id: "paper", kind, year: 2026, number: "4451", status: "ISSUED", format: "PAPER" });
  await rejected(() => importExistingNkvhPermit(f.tx, user, input()), /PCT giấy đã cấp/); assert.equal(f.permits.length, 1);
});
test("nhận chính phiếu NKVH đã hủy dưới trạng thái hủy", async () => {
  const f = fixture(); const result = await importExistingNkvhPermit(f.tx, user, { ...input(), sourceStatus: "CANCELLED", sourceReason: "Sai phạm vi" });
  assert.equal(result.status, "CANCELLED"); assert.equal(f.reservations[0].status, "CANCELLED");
});
test("giữ nguyên số chính thức kể cả hậu tố NKVH", () => {
  assert.deepEqual(parseExistingNkvhPermitNumber("04451/2026/NĐDH-VH1"), { number: "4451", year: 2026 });
  assert.equal(formatPermitNumber({ number: "4451", year: 2026, nkvhNumber: "04451/2026/NĐDH-VH1" }), "04451/2026/NĐDH-VH1");
});

test("cấp giấy đổi sang số đang giữ bởi người khác: giải phóng số ban đầu, số đích chỉ cấp một phiếu", async () => {
  const f = fixture();
  f.reservations.push({ id: "own", kind, year: 2026, number: "4455", status: "RESERVED", ownerId: user.id, teamType: "INTERNAL" },
    { id: "other", kind, year: 2026, number: "4451", status: "RESERVED", ownerId: "other", ownerName: "Trưởng kíp", teamType: "INTERNAL" });
  f.permits.push({ id: "new-paper", kind, year: 2026, number: "4451", status: "ISSUED", format: "PAPER" });
  await consumePermitNumberReservation(f.tx, { reservationId: "own", kind, year: 2026, number: "4451", teamType: "INTERNAL", userId: user.id, userName: user.name, isAdmin: false, permitId: "new-paper", releasePrevious: true });
  assert.equal(f.reservations[0].status, "RELEASED"); assert.equal(f.reservations[1].status, "ISSUED"); assert.equal(f.reservations[1].permitId, "new-paper");
  assert.ok(f.history.some(row => row.action === "TRANSFERRED"));
});

test("hai người lấy số đồng thời được tuần tự hóa qua khóa dãy", async () => {
  const f = fixture();
  let tail = Promise.resolve();
  const take = async (ownerId: string) => {
    let release: (() => void) | undefined, locked = false;
    const tx = { ...f.tx, $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "WorkPermitNumberBaseline"') && !locked) {
        locked = true;
        const previous = tail;
        tail = new Promise<void>(resolve => { release = resolve; });
        await previous;
      }
      if (sql.includes('max("number"::numeric)')) {
        const highest = f.reservations.reduce((max, row) => BigInt(String(row.number)) > max ? BigInt(String(row.number)) : max, BigInt(4454));
        return [{ highest: highest.toString() }];
      }
      return (f.tx.$queryRaw as unknown as (parts: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>)(parts, ...values);
    } } as typeof f.tx;
    try { return await reservePermitNumber(tx, { kind, year: 2026, teamType: "INTERNAL", ownerId, ownerName: ownerId }); }
    finally { release?.(); }
  };
  const rows = await Promise.all([take("Trưởng ca"), take("Trưởng kíp")]);
  assert.deepEqual(rows.map(row => row.number), ["4455", "4456"]);
  assert.equal(f.reservations.length, 2);
});


test("số NKVH nhảy cóc giữ nguyên hồ sơ nhưng chờ xác nhận nâng dãy", async () => {
  const f = fixture();
  const first = await importExistingNkvhPermit(f.tx, user, input("4836"), new Date("2026-10-05"));
  assert.equal(first.sequencePending, true); assert.equal(first.number, "4836");
  assert.equal(f.permits[0].status, "ISSUED"); assert.equal(f.permits[0].nkvhNumber, "4836/2026/VH1-NĐDH");
  assert.equal(f.reservations[0].status, "OBSERVED"); assert.equal(f.reservations[0].permitId, first.id);
  const again = await importExistingNkvhPermit(f.tx, user, input("4836"), new Date("2026-10-05"));
  assert.equal(again.sequencePending, true); assert.equal(f.permits.length, 1);
  const corrected = await importExistingNkvhPermit(f.tx, user, input("4455"), new Date("2026-10-05"));
  assert.equal(corrected.sequencePending, false); assert.equal(corrected.id, first.id);
  assert.equal(f.reservations[0].status, "OBSERVED"); assert.equal(f.reservations[0].permitId, null);
});

const reviewInput = (row: Record<string, unknown>, action: "confirm" | "ignore") => ({
  id: String(row.id), action, expectedStatus: String(row.status), expectedUpdatedAt: (row.updatedAt as Date).toISOString(),
  reason: "Đã đối chiếu phiếu nguồn NKVH", sourceChecked: true,
});
test("người cấp khác được xác nhận số NKVH, không cần admin hay người giữ ban đầu", async () => {
  const f = fixture();
  const row = { id: "seen", kind, year: 2026, number: "4836", status: "OBSERVED", updatedAt: new Date("2026-10-05"), ownerId: "other", permitId: null };
  f.reservations.push(row);
  const saved = await reviewObservedNumber(f.tx, user, reviewInput(row, "confirm"));
  assert.equal(saved.status, "OBSERVED_CONFIRMED"); assert.ok(f.history.some(item => item.actorId === user.id));
});
test("bỏ ghi nhận sai giữ lịch sử, số đã xác nhận vẫn có thể đối chiếu lại", async () => {
  const f = fixture();
  const row = { id: "seen", kind, year: 2026, number: "4836", status: "OBSERVED_CONFIRMED", updatedAt: new Date("2026-10-05"), permitId: null };
  f.reservations.push(row);
  const saved = await reviewObservedNumber(f.tx, user, reviewInput(row, "ignore"));
  assert.equal(saved.status, "OBSERVED_IGNORED"); assert.equal(f.reservations.length, 1); assert.equal(f.history.length, 1);
});
test("không bỏ số còn phiếu đã cấp, kể cả phiếu đã hủy", async () => {
  for (const status of ["ISSUED", "CANCELLED"]) {
    const f = fixture();
    const row = { id: "seen", kind, year: 2026, number: "4836", status: "OBSERVED", updatedAt: new Date("2026-10-05"), permitId: null };
    f.reservations.push(row); f.permits.push({ id: "existing", kind, year: 2026, number: "4836", status });
    await rejected(() => reviewObservedNumber(f.tx, user, reviewInput(row, "ignore")), /còn hồ sơ/);
    assert.equal(row.status, "OBSERVED"); assert.equal(f.history.length, 0);
  }
});
test("phiếu đã đồng bộ được xác nhận nâng dãy mà không đổi trạng thái phiếu", async () => {
  const f = fixture(); await importExistingNkvhPermit(f.tx, user, input("4836"));
  const row = f.reservations[0];
  const saved = await reviewObservedNumber(f.tx, user, reviewInput(row, "confirm"));
  assert.equal(saved.status, "ISSUED"); assert.equal(f.permits[0].status, "ISSUED");
});
test("biểu mẫu đối chiếu cũ bị chặn sau khi trạng thái thay đổi", async () => {
  const f = fixture();
  const row = { id: "seen", kind, year: 2026, number: "4836", status: "OBSERVED", updatedAt: new Date("2026-10-05"), permitId: null };
  f.reservations.push(row); const input = reviewInput(row, "ignore"); row.status = "ISSUED";
  await rejected(() => reviewObservedNumber(f.tx, user, input), /vừa được cập nhật/);
  assert.equal(f.history.length, 0);
});
