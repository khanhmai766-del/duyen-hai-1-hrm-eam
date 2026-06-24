import { Prisma, type PrismaClient } from "@prisma/client";

export type DefectImpactFields = {
  fireSafetyImpact: string | null;
  environmentSafetyImpact: string | null;
};

export async function ensureDefectImpactColumns(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe('ALTER TABLE "Defect" ADD COLUMN IF NOT EXISTS "fireSafetyImpact" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE "Defect" ADD COLUMN IF NOT EXISTS "environmentSafetyImpact" TEXT');
}

export function normalizeImpactValue(value: unknown) {
  return value === "Có" || value === "Không" ? value : null;
}

export async function readDefectImpactFields(prisma: PrismaClient, ids: string[]) {
  if (ids.length === 0) return new Map<string, DefectImpactFields>();

  const rows = await prisma.$queryRaw<Array<{ id: string } & DefectImpactFields>>(
    Prisma.sql`
      SELECT id, "fireSafetyImpact", "environmentSafetyImpact"
      FROM "Defect"
      WHERE id IN (${Prisma.join(ids)})
    `
  );

  return new Map(rows.map((row) => [row.id, {
    fireSafetyImpact: row.fireSafetyImpact,
    environmentSafetyImpact: row.environmentSafetyImpact,
  }]));
}

export async function updateDefectImpactFields(
  prisma: PrismaClient,
  id: string,
  fields: Partial<DefectImpactFields>
) {
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "Defect"
      SET
        "fireSafetyImpact" = ${fields.fireSafetyImpact ?? null},
        "environmentSafetyImpact" = ${fields.environmentSafetyImpact ?? null}
      WHERE id = ${id}
    `
  );
}
