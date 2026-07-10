import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$queryRaw`
    SELECT indexname, indexdef FROM pg_indexes 
    WHERE tablename = 'Material' AND indexdef LIKE '%code%'
  `;
  console.log(JSON.stringify(result, null, 2));
  
  // Also check all constraints
  const constraints = await prisma.$queryRaw`
    SELECT conname, contype, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conrelid = '"Material"'::regclass
    AND contype = 'u'
  `;
  console.log('\nUnique constraints:', JSON.stringify(constraints, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
