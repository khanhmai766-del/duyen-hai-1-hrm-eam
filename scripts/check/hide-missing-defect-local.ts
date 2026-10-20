/** Kiểm tra bằng PostgreSQL dev; mọi fixture đều ROLLBACK, không gọi dịch vụ ngoài. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { activeDefectWhere, outstandingDefectWhere } from "../../lib/defect-active-where";
import { markMissingN8nDefects } from "../../lib/defect-n8n-sync";
import { hideMissingDefect, HideMissingDefectError } from "../../lib/server/defect-hide";

async function main() {
  process.loadEnvFile(".env");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL!).hostname), "Chỉ chạy với DB dev local");
  assert.notEqual(process.env.NODE_ENV, "production");
  const tag = `local-hide-${randomUUID()}`;
  const rollback = new Error("rollback-fixtures");
  let id = "";
  try {
    await prisma.$transaction(async tx => {
      const creator = await tx.user.findFirst({ select: { id: true } });
      assert.ok(creator, "DB dev cần ít nhất một người dùng có sẵn");
      const data = {
        createdById: creator.id, sourceType: "GOOGLE_SHEETS", syncState: "MISSING", sourceKey: tag,
        sourceSpreadsheetId: tag, sourceSheetName: "TEST", unit: "S2", requestType: "Điện",
        requestNumber: "TEST/2026", status: "DA_XU_LY", note: "Giữ ghi chú",
        images: ["ảnh thử được giữ nguyên"], reminderCount: 2, requestNumberReuseEligible: false,
      };
      const row = await tx.defect.create({ data });
      id = row.id;
      await tx.defectReminderLog.create({ data: { defectId: id, createdById: creator.id, occurredAt: new Date() } });
      for (const status of ["PENDING", "PROCESSING", "FAILED"]) {
        const event = await tx.defectSyncOutbox.create({ data: { defectId: id, eventType: "UPDATE", status, payload: {} } });
        await assert.rejects(hideMissingDefect(tx, { id, updatedAt: row.updatedAt, canEdit: () => true }),
          (error: unknown) => error instanceof HideMissingDefectError && error.status === 409);
        await tx.defectSyncOutbox.delete({ where: { id: event.id } });
      }
      await hideMissingDefect(tx, { id, updatedAt: row.updatedAt, canEdit: () => true });
      const after = await tx.defect.findUniqueOrThrow({ where: { id } });
      assert.deepEqual(after, { ...row, syncState: "HIDDEN", updatedAt: after.updatedAt }, "Chỉ được đổi trạng thái hiển thị");
      assert.equal(await tx.defectReminderLog.count({ where: { defectId: id } }), 1);
      assert.equal(await tx.defectSyncOutbox.count({ where: { defectId: id } }), 0);
      assert.equal(await tx.defect.count({ where: { AND: [{ id }, activeDefectWhere()] } }), 0);
      await tx.defect.update({ where: { id }, data: { status: "CHUA_XU_LY" } });
      assert.equal(await tx.defect.count({ where: { AND: [{ id }, outstandingDefectWhere()] } }), 0);
      const active = await tx.defect.create({ data: { ...data, syncState: "ACTIVE", sourceKey: `${tag}-active` } });
      const confirmed = await tx.defect.create({ data: { ...data, syncState: "CONFIRMED", sourceKey: `${tag}-confirmed` } });
      assert.equal(await markMissingN8nDefects(tx, tag, [tag]), 1);
      assert.equal((await tx.defect.findUniqueOrThrow({ where: { id } })).syncState, "HIDDEN", "Snapshot không làm phiếu đã ẩn hiện lại");
      assert.equal((await tx.defect.findUniqueOrThrow({ where: { id: active.id } })).syncState, "MISSING");
      assert.equal((await tx.defect.findUniqueOrThrow({ where: { id: confirmed.id } })).syncState, "CONFIRMED");
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(await prisma.defect.count({ where: { id } }), 0, "Không được để lại fixture");
  console.log("Đạt: ẩn phiếu đã xử lý, chặn 3 trạng thái hàng đợi, giữ dữ liệu/nhật ký, bỏ khỏi KPI, snapshot giữ HIDDEN; đã rollback toàn bộ fixture.");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
