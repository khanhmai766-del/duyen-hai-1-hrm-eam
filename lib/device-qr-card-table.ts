import { prisma } from "@/lib/prisma";

let ready = false;

/** Tạo bảng thẻ QR có chọn lọc trên database cũ mà không cần db push toàn schema. */
export async function ensureDeviceQrCardTable() {
  if (ready) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DeviceQrCard" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "deviceSeq" TEXT NOT NULL UNIQUE,
      "createdById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DeviceQrCard_deviceSeq_fkey"
        FOREIGN KEY ("deviceSeq") REFERENCES "EquipmentNode"("seq")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  ready = true;
}
