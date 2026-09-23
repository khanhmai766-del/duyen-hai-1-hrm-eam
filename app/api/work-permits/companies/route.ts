import { prisma } from "@/lib/prisma";
import { ok, requireUser } from "@/lib/api";
import { permitCapabilities } from "@/lib/server/work-permit-permissions";
import { permitHandle } from "@/lib/server/work-permits";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return permitHandle(async () => {
    await requireUser();
    // `summary=1`: bảng đơn vị nhà thầu (mỗi dòng kèm sĩ số và số CHTT). Đếm ngay trong SQL vì
    // danh bạ có thể vài nghìn người — kéo hết về rồi đếm ở Node là phí một vòng dữ liệu.
    if (new URL(req.url).searchParams.get("summary") === "1") {
      const rows = await prisma.$queryRaw<Array<{ company: string; total: bigint; commanders: bigint; active: bigint }>>`
        SELECT "company", COUNT(*) AS total,
               COUNT(*) FILTER (WHERE "canCommand") AS commanders,
               COUNT(*) FILTER (WHERE "isActive") AS active
        FROM "WorkPermitPerson" WHERE btrim("company") <> '' GROUP BY "company" ORDER BY "company"`;
      return ok(rows.map(row => ({ company: row.company, total: Number(row.total), commanders: Number(row.commanders), active: Number(row.active) })), { canWrite: (await permitCapabilities(await requireUser())).canIssue });
    }
    // Lấy từ toàn bộ danh bạ, không giới hạn bởi trang nhân sự hoặc vai trò CHTT.
    const rows = await prisma.$queryRaw<Array<{ company: string }>>`SELECT DISTINCT "company" FROM "WorkPermitPerson" WHERE btrim("company") <> '' ORDER BY "company"`;
    return ok(rows.map(row => row.company).filter(name => name.trim()));
  });
}
