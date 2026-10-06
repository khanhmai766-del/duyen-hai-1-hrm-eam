/**
 * Phiếu "Chờ NKVH lưu" trên Postgres thật (khóa, unique có điều kiện). Chỉ DB localhost; mọi dữ liệu kiểm tra
 * nằm trong giao dịch luôn HOÀN TÁC. Chạy: npx tsx scripts/verify/thu-nkvh-phieu-cho.ts
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { cancelNkvhPermit, claimNkvhPermit, closeNkvhPermit, importExistingNkvhPermit, parseNkvhPage } from "@/lib/server/work-permit-nkvh-claim";
import { activePermitNumberExists, releaseUnusedReservation, reservePermitNumber } from "@/lib/server/work-permit-number-reservations";
loadEnvConfig(process.cwd(), true);
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL || "").hostname)) throw new Error("Chỉ chạy trên DB dev localhost");
const db = new PrismaClient();
const rollback = new Error("HOÀN TÁC KIỂM TRA");
const user = { id: "verify-nkvh-pending", name: "Trưởng ca kiểm tra", role: "SUPERVISOR" };
const year = 2099, now = new Date("2099-10-05T03:00:00Z");
const pctOf = (kind: string, n: number) => `9c0f3a52-1b7d-4e0a-8d11-${kind === "MECHANICAL" ? "1" : "2"}0000000000${n}`;

async function main() {
  try {
    await db.$transaction(async tx => {
      for (const kind of ["MECHANICAL", "ELECTRICAL"] as const) {
        assert.equal(await tx.workPermit.count({ where: { kind, year } }), 0, "Phạm vi kiểm tra phải chưa có dữ liệu");
        await tx.workPermitNumberBaseline.create({ data: { kind, year, number: "4516", updatedById: user.id } });
        const page = parseNkvhPage({ qlvhCode: "VH", teamCode: "PCN", content: "Kiểm tra phiếu chờ — hoàn tác", authorizerPosition: "Máy phó" }, kind);
        const claim = (n: number) => claimNkvhPermit(tx, user, { kind, nkvhPctId: pctOf(kind, n), page, unit: "", position: "" }, now);
        const draftOf = (n: number) => tx.workPermit.findFirst({ where: { kind, nkvhPctId: pctOf(kind, n) } });

        // 1. Lấy số → giữ số + phiếu nháp; bấm lại không tạo thêm; nháp không tính là số đã cấp.
        const a = await claim(1); await claim(1);
        assert.equal(a.status, "RESERVED"); assert.equal(a.number, "4517");
        const draftA = await draftOf(1);
        assert.equal(draftA?.status, "DRAFT"); assert.equal(draftA?.number, "4517");
        assert.equal(await tx.workPermit.count({ where: { kind, year } }), 1);
        assert.equal(await activePermitNumberExists(tx, kind, year, "4517"), false);
        // Phiếu khác lấy số tiếp theo, không trùng số đang chờ.
        assert.equal((await claim(2)).number, "4518");

        // 2. NKVH lưu xong → chính phiếu nháp thành Đã cấp, lượt giữ số gắn vào phiếu.
        const issued = await importExistingNkvhPermit(tx, user, { kind, nkvhPctId: pctOf(kind, 1), page, unit: "", position: "",
          formattedNumber: `4517/${year}/VH1-NĐDH` }, now);
        assert.equal(issued.id, draftA?.id); assert.equal((await draftOf(1))?.status, "ISSUED");
        assert.equal((await tx.workPermitNumberReservation.findFirstOrThrow({ where: { kind, year, number: "4517" } })).permitId, draftA?.id);

        // 3. Đóng phiếu NKVH khi sổ chỉ có nháp → như chưa có hồ sơ (404), không đóng nhầm nháp.
        await assert.rejects(closeNkvhPermit(tx, user, { kind, nkvhPctId: pctOf(kind, 2), sourceStatus: "Khóa phiếu" }, now),
          error => error instanceof Response && error.status === 404);

        // 4. Trả số chưa dùng → nháp bị hủy, bỏ liên kết NKVH, số 4518 cấp lại được (unique có điều kiện cho qua).
        const heldB = await tx.workPermitNumberReservation.findFirstOrThrow({ where: { kind, year, number: "4518", status: "RESERVED" } });
        await releaseUnusedReservation(tx, heldB, user.id, user.name, "Kiểm tra trả số");
        const draftB = await tx.workPermit.findFirstOrThrow({ where: { kind, year, number: "4518" } });
        assert.equal(draftB.status, "CANCELLED"); assert.equal(draftB.nkvhPctId, null);
        const c = await claim(3);
        assert.equal(c.number, "4518", "số đã trả được cấp lại");
        assert.equal((await draftOf(3))?.status, "DRAFT");

        // 5. NKVH hủy phiếu còn đang chờ → nháp hủy, số trả lại.
        const cancelled = await cancelNkvhPermit(tx, user, { kind, nkvhPctId: pctOf(kind, 3), reason: "Lập nhầm" });
        assert.equal(cancelled.status, "CANCELLED");
        assert.equal((await tx.workPermitNumberReservation.findFirstOrThrow({ where: { kind, year, number: "4518", ownerId: user.id }, orderBy: { createdAt: "desc" } })).status, "RELEASED");
        await reservePermitNumber(tx, { kind, year, number: "4518", teamType: "CONTRACTOR", ownerId: user.id, ownerName: user.name });
        console.log(`✓ ${kind}: lấy số tạo nháp; lưu NKVH thành Đã cấp; đóng bỏ qua nháp; trả số/hủy theo NKVH trả lại số`);
      }
      throw rollback;
    }, { timeout: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await db.workPermitNumberBaseline.count({ where: { year } }), 0);
  assert.equal(await db.workPermit.count({ where: { year } }), 0);
  assert.equal(await db.workPermitNumberReservation.count({ where: { year } }), 0);
  console.log("✓ Đã hoàn tác dữ liệu kiểm tra");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
