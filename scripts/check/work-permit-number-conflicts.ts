/** Chỉ SELECT. Kiểm tra trước khi áp SQL work-permit-nkvh-saved-sync.sql. */
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";
loadEnvConfig(process.cwd(), true);
async function main() {
  const links = await prisma.$queryRaw`SELECT "kind", "nkvhPctId", array_agg("id") AS "ids", array_agg("number") AS "numbers"
    FROM "WorkPermit" WHERE "nkvhPctId" IS NOT NULL GROUP BY "kind", "nkvhPctId" HAVING count(*) > 1`;
  const numbers = await prisma.$queryRaw`SELECT "kind", "year", "number"::numeric::text AS "number", array_agg("id") AS "ids"
    FROM "WorkPermit" WHERE "status" NOT IN ('DRAFT', 'CANCELLED') AND "number" ~ '^[0-9]+$'
    GROUP BY "kind", "year", "number"::numeric HAVING count(*) > 1`;
  const held = await prisma.$queryRaw`SELECT "kind", "year", "number"::numeric::text AS "number", array_agg("id") AS "ids"
    FROM "WorkPermitNumberReservation" WHERE "status" IN ('RESERVED', 'ISSUED', 'OBSERVED', 'OBSERVED_CONFIRMED', 'REVIEW') AND "number" ~ '^[0-9]+$'
    GROUP BY "kind", "year", "number"::numeric HAVING count(*) > 1`;
  console.log(JSON.stringify({ duplicateLinks: links, duplicateNumbers: numbers, duplicateReservations: held }, null, 2));
}
main().finally(() => prisma.$disconnect());
