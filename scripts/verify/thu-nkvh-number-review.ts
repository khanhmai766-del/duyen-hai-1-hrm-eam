/** Chỉ DB localhost. SQL/index và dữ liệu kiểm tra đều nằm trong giao dịch luôn HOÀN TÁC. */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { importExistingNkvhPermit, observeNkvhNumbers, parseNkvhPage } from "@/lib/server/work-permit-nkvh-claim";
import { nextPermitNumber, permitNumberHighWater, reservePermitNumber } from "@/lib/server/work-permit-number-reservations";
import { reviewObservedNumber } from "@/lib/server/work-permit-number-review";
loadEnvConfig(process.cwd(), true);
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL || "").hostname)) throw new Error("Chỉ chạy trên DB dev localhost");
const db = new PrismaClient();
const rollback = new Error("HOÀN TÁC KIỂM TRA");
const user = { id: "verify-number-review", name: "Trưởng ca kiểm tra", role: "SUPERVISOR" };
const year = 2099, now = new Date("2099-10-05T03:00:00Z");
async function main() {
  const sql = await readFile("prisma/manual/work-permit-nkvh-number-review.sql", "utf8");
  try {
    await db.$transaction(async tx => {
      // Kiểm tra luôn index mới, nhưng không giữ lại bất kỳ DDL nào khi kết thúc.
      for (const statement of sql.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "").split(";").filter(value => value.trim())) await tx.$executeRawUnsafe(statement);
      for (const kind of ["MECHANICAL", "ELECTRICAL"] as const) {
        assert.equal(await tx.workPermitNumberBaseline.count({ where: { kind, year } }), 0, "Phạm vi kiểm tra phải chưa có dữ liệu");
        assert.equal(await tx.workPermit.count({ where: { kind, year } }), 0);
        assert.equal(await tx.workPermitNumberReservation.count({ where: { kind, year } }), 0);
        await tx.workPermitNumberBaseline.create({ data: { kind, year, number: "4516", updatedById: user.id } });
        const expected = async () => nextPermitNumber(tx, kind, year, "4516", await permitNumberHighWater(tx, kind, year));
        const seen = await observeNkvhNumbers(tx, user, { kind, entries: [{ formattedNumber: `4836/${year}/VH1-NĐDH` }] }, now);
        assert.equal(seen.ahead.length, 1); assert.equal(await expected(), "4517");
        await assert.rejects(reservePermitNumber(tx, { kind, year, number: "4836", teamType: "CONTRACTOR", ownerId: user.id, ownerName: user.name }), error => error instanceof Response && error.status === 409);
        let row = await tx.workPermitNumberReservation.findFirstOrThrow({ where: { kind, year, number: "4836" } });
        const review = async (action: "confirm" | "ignore") => {
          row = await tx.workPermitNumberReservation.findUniqueOrThrow({ where: { id: row.id } });
          return reviewObservedNumber(tx, { id: "other-operator", name: "Trưởng kíp" }, { id: row.id, action,
            expectedStatus: row.status, expectedUpdatedAt: row.updatedAt.toISOString(), reason: "Đối chiếu số nguồn NKVH", sourceChecked: true });
        };
        await review("confirm"); assert.equal(await expected(), "4837");
        await tx.$executeRawUnsafe("SAVEPOINT unique_guard");
        await assert.rejects(tx.workPermitNumberReservation.create({ data: { kind, year, number: "4836", teamType: "INTERNAL", ownerId: user.id, ownerName: user.name } }));
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT unique_guard");
        await review("ignore"); assert.equal(await expected(), "4517");
        const repeat = await observeNkvhNumbers(tx, user, { kind, entries: [{ formattedNumber: `4836/${year}/VH1-NĐDH` }] }, now);
        assert.equal(repeat.recorded.length, 0); assert.equal(await expected(), "4517");
        await observeNkvhNumbers(tx, user, { kind, entries: ["4517", "4518"].map(number => ({ formattedNumber: `${number}/${year}/VH1-NĐDH` })) }, now);
        assert.equal(await expected(), "4519");
        const pct = kind === "MECHANICAL" ? "8bf98ecd-6b07-4a92-9d7a-92d4ed44b667" : "8bf98ecd-6b07-4a92-9d7a-92d4ed44b668";
        const page = parseNkvhPage({ qlvhCode: "VH", teamCode: "PCN", content: "Kiểm tra số nhảy cóc — hoàn tác", authorizerPosition: "Máy phó" }, kind);
        const input = { kind, nkvhPctId: pct, page, unit: "", position: "", formattedNumber: `4836/${year}/VH1-NĐDH` };
        const permit = await importExistingNkvhPermit(tx, user, input, now);
        assert.equal(permit.sequencePending, true); assert.equal(await expected(), "4519");
        row = await tx.workPermitNumberReservation.findFirstOrThrow({ where: { kind, year, number: "4836", status: "OBSERVED" } });
        const updatedAt = row.updatedAt.toISOString();
        await importExistingNkvhPermit(tx, user, input, now);
        assert.equal((await tx.workPermitNumberReservation.findUniqueOrThrow({ where: { id: row.id } })).updatedAt.toISOString(), updatedAt,
          "Đồng bộ không thay đổi dữ liệu không làm biểu mẫu đối chiếu hết hiệu lực");
        await assert.rejects(review("ignore"), error => error instanceof Response && error.status === 409);
        const corrected = await importExistingNkvhPermit(tx, user, { ...input, formattedNumber: `4519/${year}/VH1-NĐDH` }, now);
        assert.equal(corrected.id, permit.id); assert.equal(corrected.sequencePending, false); assert.equal(await expected(), "4520");
        await review("ignore"); assert.equal(await expected(), "4520");
        assert.ok(await tx.workPermitNumberReservationHistory.count({ where: { reservationId: row.id } }) >= 2);
        console.log(`✓ ${kind}: 4836 không nâng dãy; chặn trùng; xác nhận/bỏ số; quét lại không tái tạo; bỏ qua số liền kề; đồng bộ và sửa số giữ nguyên hồ sơ`);
      }
      throw rollback;
    }, { timeout: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await db.workPermitNumberBaseline.count({ where: { year } }), 0);
  assert.equal(await db.workPermit.count({ where: { year } }), 0);
  assert.equal(await db.workPermitNumberReservation.count({ where: { year } }), 0);
  console.log("✓ Đã hoàn tác dữ liệu và index kiểm tra");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
