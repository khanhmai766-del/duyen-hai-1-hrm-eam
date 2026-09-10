import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireUser } from "@/lib/api";
import { permitHandle, permitSearchTerm } from "@/lib/server/work-permits";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return permitHandle(async () => {
    await requireUser();
    const params = new URL(req.url).searchParams, q = params.get("q") ?? "", page = Number(params.get("page") ?? 1);
    if (q.length > 200 || !Number.isInteger(page) || page < 1 || page > 100000) return fail("Bộ lọc nhân sự không hợp lệ");
    const accents = "đ\u0300\u0301\u0303\u0309\u0323\u0302\u0306\u031b";
    const search = q.trim() ? Prisma.sql`AND translate(lower(normalize(concat_ws(' ', "name", "employeeId", "position", "department"), NFD)), ${accents}, 'd') LIKE ${`%${permitSearchTerm(q)}%`}` : Prisma.empty;
    const [rows, counts] = await prisma.$transaction([
      prisma.$queryRaw<Array<{ id: string; name: string; employeeId: string | null; position: string | null; department: string | null }>>`SELECT "id", "name", "employeeId", "position", "department" FROM "User" WHERE "isActive" = true ${search} ORDER BY "name", "id" LIMIT 20 OFFSET ${(page - 1) * 20}`,
      prisma.$queryRaw<Array<{ total: bigint }>>`SELECT count(*) AS total FROM "User" WHERE "isActive" = true ${search}`,
    ]);
    return ok(rows, { total: Number(counts[0].total), page, pageSize: 20 });
  });
}
