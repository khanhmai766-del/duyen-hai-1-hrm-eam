import { PrismaClient } from "@prisma/client";
import { invalidateDefectListCache } from "@/lib/defect-list-cache";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // Xoá cache danh sách khiếm khuyết ngay tại tầng Prisma thay vì gọi tay ở từng route.
  // Có 16 đường ghi vào Defect/DefectRelatedDevice/DefectHistory (form, đồng bộ hai chiều,
  // outbox n8n, gộp lịch sử...) — đặt ở đây thì không đường nào bị bỏ sót, kể cả đường
  // thêm mới sau này. Middleware chạy cho cả thao tác trong $transaction.
  client.$use(async (params, next) => {
    const result = await next(params);
    if (
      params.model
      && DEFECT_CACHE_MODELS.has(params.model)
      && WRITE_ACTIONS.has(params.action)
    ) {
      invalidateDefectListCache();
    }
    return result;
  });

  return client;
}

const DEFECT_CACHE_MODELS = new Set(["Defect", "DefectRelatedDevice", "DefectHistory"]);
const WRITE_ACTIONS = new Set([
  "create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany",
]);

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
