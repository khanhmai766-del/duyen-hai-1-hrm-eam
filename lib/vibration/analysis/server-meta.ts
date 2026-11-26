// Truy cập bảng "VibrationAnalysisMeta" (khoá–giá trị) bằng SQL thô — không phụ thuộc client Prisma đã được generate lại.
// Chỉ dùng ở phía máy chủ (route API). Khoá: "settings", "baseline:<deviceId>", "report:<id>".
import { prisma } from "@/lib/prisma";

export interface MetaRow<T = unknown> { key: string; value: T; updatedAt: Date; updatedById: string | null; updatedByName: string }

let ready = false;
/** Tạo bảng nếu chưa có (bản migration đã có; đây chỉ là lưới an toàn khi môi trường chưa chạy migration). */
export async function ensureMetaTable() {
  if (ready) return;
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "VibrationAnalysisMeta" ("key" TEXT NOT NULL, "value" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedById" TEXT, "updatedByName" TEXT NOT NULL DEFAULT '', CONSTRAINT "VibrationAnalysisMeta_pkey" PRIMARY KEY ("key"))`);
  ready = true;
}
export async function metaGetPrefix<T = unknown>(prefix: string): Promise<MetaRow<T>[]> {
  await ensureMetaTable();
  return prisma.$queryRaw<MetaRow<T>[]>`SELECT "key","value","updatedAt","updatedById","updatedByName" FROM "VibrationAnalysisMeta" WHERE "key" LIKE ${prefix + "%"} ORDER BY "updatedAt" DESC`;
}
export async function metaGet<T = unknown>(key: string): Promise<MetaRow<T> | null> {
  await ensureMetaTable();
  const rows = await prisma.$queryRaw<MetaRow<T>[]>`SELECT "key","value","updatedAt","updatedById","updatedByName" FROM "VibrationAnalysisMeta" WHERE "key" = ${key}`;
  return rows[0] ?? null;
}
export async function metaSet(key: string, value: unknown, user: { id: string; name?: string | null }) {
  await ensureMetaTable();
  const json = JSON.stringify(value);
  await prisma.$executeRaw`INSERT INTO "VibrationAnalysisMeta" ("key","value","updatedAt","updatedById","updatedByName") VALUES (${key}, ${json}::jsonb, NOW(), ${user.id}, ${user.name ?? ""}) ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW(), "updatedById" = EXCLUDED."updatedById", "updatedByName" = EXCLUDED."updatedByName"`;
}
export async function metaDelete(key: string) {
  await ensureMetaTable();
  await prisma.$executeRaw`DELETE FROM "VibrationAnalysisMeta" WHERE "key" = ${key}`;
}
