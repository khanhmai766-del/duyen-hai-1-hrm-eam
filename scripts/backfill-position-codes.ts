import { prisma } from "../lib/prisma";
import { positionCodeOf } from "../lib/position-catalog";

const BATCH_SIZE = 500;

async function backfillDefects() {
  let cursor: string | undefined;
  let updated = 0;
  do {
    const rows = await prisma.defect.findMany({
      where: {
        positionCode: null,
        system: { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, system: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    });
    if (!rows.length) break;
    cursor = rows.at(-1)?.id;
    const writes = rows.flatMap((row) => {
      const positionCode = positionCodeOf(row.system);
      return positionCode
        ? [prisma.defect.update({ where: { id: row.id }, data: { positionCode } })]
        : [];
    });
    if (writes.length) await prisma.$transaction(writes);
    updated += writes.length;
  } while (cursor);
  return updated;
}

async function backfillReplacements() {
  let cursor: string | undefined;
  let updated = 0;
  do {
    const rows = await prisma.materialReplacement.findMany({
      where: {
        managingPositionCode: null,
        managingPosition: { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, managingPosition: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    });
    if (!rows.length) break;
    cursor = rows.at(-1)?.id;
    const writes = rows.flatMap((row) => {
      const managingPositionCode = positionCodeOf(row.managingPosition);
      return managingPositionCode
        ? [prisma.materialReplacement.update({
            where: { id: row.id },
            data: { managingPositionCode },
          })]
        : [];
    });
    if (writes.length) await prisma.$transaction(writes);
    updated += writes.length;
  } while (cursor);
  return updated;
}

async function backfillScopes() {
  const rows = await prisma.positionSystemScope.findMany({
    where: { positionCode: null },
    select: { id: true, position: true },
  });
  const writes = rows.flatMap((row) => {
    const positionCode = positionCodeOf(row.position);
    return positionCode
      ? [prisma.positionSystemScope.update({ where: { id: row.id }, data: { positionCode } })]
      : [];
  });
  if (writes.length) await prisma.$transaction(writes);
  return writes.length;
}

async function main() {
  const [defects, replacements, scopes] = await Promise.all([
    backfillDefects(),
    backfillReplacements(),
    backfillScopes(),
  ]);
  const [defectRowsMissingCode, replacementRowsMissingCode, scopeRowsMissingCode] =
    await Promise.all([
      prisma.defect.count({
        where: { positionCode: null, system: { not: null } },
      }),
      prisma.materialReplacement.count({
        where: {
          managingPositionCode: null,
          managingPosition: { not: null },
        },
      }),
      prisma.positionSystemScope.count({ where: { positionCode: null } }),
    ]);
  console.log(
    JSON.stringify(
      {
        updated: { defects, replacements, scopes },
        remaining: {
          defects: defectRowsMissingCode,
          replacements: replacementRowsMissingCode,
          scopes: scopeRowsMissingCode,
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
