import { prisma } from "@/lib/prisma";

let ready = false;

/** Tương thích database cũ: bổ sung ngữ cảnh tổ máy mà không cần db push toàn schema. */
export async function ensureRepairMachineColumn() {
  if (ready) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "RepairLog"
    ADD COLUMN IF NOT EXISTS "machine" TEXT NOT NULL DEFAULT 'COMMON'
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RepairLog_deviceSeq_machine_idx"
    ON "RepairLog"("deviceSeq", "machine")
  `);
  ready = true;
}
