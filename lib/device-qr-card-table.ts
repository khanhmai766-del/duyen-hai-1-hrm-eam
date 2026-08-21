import { prisma } from "@/lib/prisma";

let ready = false;

/** Tạo bảng thẻ QR có chọn lọc trên database cũ mà không cần db push toàn schema. */
export async function ensureDeviceQrCardTable() {
  if (ready) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DeviceQrCard" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "deviceSeq" TEXT NOT NULL,
      "machine" TEXT NOT NULL DEFAULT 'COMMON',
      "createdById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DeviceQrCard_deviceSeq_fkey"
        FOREIGN KEY ("deviceSeq") REFERENCES "EquipmentNode"("seq")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "DeviceQrCard"
      ADD COLUMN IF NOT EXISTS "machine" TEXT NOT NULL DEFAULT 'COMMON'
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "DeviceQrCard" DROP CONSTRAINT IF EXISTS "DeviceQrCard_deviceSeq_key"`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "DeviceQrCard_deviceSeq_key"`);
  await prisma.$executeRawUnsafe(`
    UPDATE "DeviceQrCard" AS source
      SET "machine" = 'S1'
      WHERE source."machine" = 'COMMON'
        AND source."deviceSeq" !~ '^DH1\\.S1\\.(5|6)(\\.|$)'
        AND source."deviceSeq" !~ '^(5|6)(\\.|$)'
        AND NOT EXISTS (
          SELECT 1 FROM "DeviceQrCard" AS target
          WHERE target."deviceSeq" = source."deviceSeq" AND target."machine" = 'S1'
        )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "DeviceQrCard_deviceSeq_machine_key"
      ON "DeviceQrCard"("deviceSeq", "machine")
  `);
  ready = true;
}
