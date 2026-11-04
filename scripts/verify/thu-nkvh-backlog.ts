/** Chỉ DB localhost. Danh sách tồn đọng của tiện ích NKVH, chạy SQL thật trong giao dịch luôn HOÀN TÁC. */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { claimNkvhPermit, importExistingNkvhPermit, nkvhSyncBacklog, observeNkvhNumbers, parseNkvhPage } from "@/lib/server/work-permit-nkvh-claim";
loadEnvConfig(process.cwd(), true);
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL || "").hostname)) throw new Error("Chỉ chạy trên DB dev localhost");
const db = new PrismaClient();
const rollback = new Error("HOÀN TÁC KIỂM TRA");
const user = { id: "verify-nkvh-backlog", name: "Trưởng ca kiểm tra", role: "SUPERVISOR" };
const year = 2099, now = new Date("2099-10-05T03:00:00Z"), kind = "MECHANICAL" as const;
const pct = (last: number) => `8bf98ecd-6b07-4a92-9d7a-${String(last).padStart(12, "0")}`;
const page = parseNkvhPage({ qlvhCode: "VH", teamCode: "PCN", content: "Kiểm tra tồn đọng — hoàn tác", authorizerPosition: "Máy phó" }, kind);

async function main() {
  try {
    await db.$transaction(async tx => {
      assert.equal(await tx.workPermit.count({ where: { year } }), 0, "Phạm vi kiểm tra phải chưa có dữ liệu");
      await tx.workPermitNumberBaseline.create({ data: { kind, year, number: "100", updatedById: user.id } });
      const mine = async () => (await nkvhSyncBacklog(tx, 10_000)).items.filter(item => item.formatted.includes(`/${year}/`)).map(item => item.nkvhPctId).sort();

      // Số thấy trên NKVH, chưa có hồ sơ → vào danh sách; không có id_pct → không đọc được nên không vào.
      await observeNkvhNumbers(tx, user, { kind, entries: [
        { formattedNumber: `101/${year}/VH1-NĐDH`, nkvhPctId: pct(1) },
        { formattedNumber: `102/${year}/VH1-NĐDH` },
      ] }, now);
      assert.deepEqual(await mine(), [pct(1)]);

      // Nháp "Chờ NKVH lưu": RESERVED thì chưa biết NKVH đã lưu chưa; thấy số trên danh sách NKVH mới vào danh sách.
      const claimed = await claimNkvhPermit(tx, user, { kind, nkvhPctId: pct(2), page, unit: "", position: "" }, now);
      assert.deepEqual(await mine(), [pct(1)]);
      await observeNkvhNumbers(tx, user, { kind, entries: [{ formattedNumber: claimed.formatted, nkvhPctId: pct(2) }] }, now);
      assert.deepEqual(await mine(), [pct(1), pct(2)]);

      // Đồng bộ xong thì rời danh sách, kể cả số nhảy cóc còn chờ xác nhận nâng dãy.
      const issued = await importExistingNkvhPermit(tx, user, { kind, nkvhPctId: pct(2), page, unit: "", position: "", formattedNumber: claimed.formatted }, now);
      assert.equal(issued.status, "ISSUED");
      assert.deepEqual(await mine(), [pct(1)]);
      const ahead = await importExistingNkvhPermit(tx, user, { kind, nkvhPctId: pct(1), page, unit: "", position: "", formattedNumber: `101/${year}/VH1-NĐDH` }, now);
      assert.equal(ahead.status, "ISSUED");
      assert.deepEqual(await mine(), []);
      console.log("✓ Tồn đọng: có số chưa đồng bộ + id_pct; bỏ số chưa thấy trên NKVH, số không có id_pct và phiếu đã đồng bộ");
      throw rollback;
    }, { timeout: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await db.workPermit.count({ where: { year } }), 0);
  assert.equal(await db.workPermitNumberReservation.count({ where: { year } }), 0);
  console.log("✓ Đã hoàn tác dữ liệu kiểm tra");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
