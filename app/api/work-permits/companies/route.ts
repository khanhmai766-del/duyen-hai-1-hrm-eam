import { prisma } from "@/lib/prisma";
import { ok, requireUser } from "@/lib/api";
import { permitHandle } from "@/lib/server/work-permits";
export const dynamic = "force-dynamic";

export async function GET() {
  return permitHandle(async () => {
    await requireUser();
    // Lấy từ toàn bộ danh bạ, không giới hạn bởi trang nhân sự hoặc vai trò CHTT.
    const rows = await prisma.$queryRaw<Array<{ company: string }>>`SELECT DISTINCT "company" FROM "WorkPermitPerson" WHERE btrim("company") <> '' ORDER BY "company"`;
    return ok(rows.map(row => row.company).filter(name => name.trim()));
  });
}
