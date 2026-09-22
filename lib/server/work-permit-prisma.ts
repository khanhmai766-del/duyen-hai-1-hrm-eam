import type { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";

const globalForPermitPrisma = globalThis as unknown as { workPermitPrisma?: PrismaClient };

function hasNumberRegister(client: PrismaClient) {
  return typeof client.workPermitNumberReservationHistory !== "undefined";
}

// Next dev giữ Prisma Client cũ trong bộ nhớ khi vừa thêm bảng vào schema.
// Nạp bản đã sinh trên đĩa cho các API cấp số mà không thay đổi phiên DB của
// những phân hệ khác. Production dùng Prisma Client chung như trước.
export const workPermitPrisma: PrismaClient = process.env.NODE_ENV !== "development" || hasNumberRegister(prisma)
  ? prisma
  : (() => {
      if (globalForPermitPrisma.workPermitPrisma && hasNumberRegister(globalForPermitPrisma.workPermitPrisma)) {
        return globalForPermitPrisma.workPermitPrisma;
      }
      const generatedRequire = createRequire(join(process.cwd(), "package.json"));
      const clientPath = join(process.cwd(), "node_modules", ".prisma", "client", "index.js");
      delete generatedRequire.cache[generatedRequire.resolve(clientPath)];
      const GeneratedClient = generatedRequire(clientPath).PrismaClient as typeof PrismaClient;
      const client = new GeneratedClient({ log: ["error", "warn"] });
      globalForPermitPrisma.workPermitPrisma = client;
      return client;
    })();
