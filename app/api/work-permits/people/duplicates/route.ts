import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireUser } from "@/lib/api";
import { permitHandle } from "@/lib/server/work-permits";
import { personCardSelect, withPhotoUrl } from "@/lib/server/work-permit-people";
import { PERMIT_CONTRACTOR_SCOPES } from "@/lib/work-permits";
export const dynamic = "force-dynamic";

/**
 * Nhân sự trùng HỌ TÊN + NĂM SINH (19/10/2026) — dò một người có hai hồ sơ / hai thẻ (máy quét chặn trùng theo thẻ nên
 * không bắt được). `mode=same`: trùng trong CÙNG một nhà thầu; `mode=cross`: trùng với người ở nhà thầu KHÁC.
 * Họ tên so không phân biệt hoa thường / khoảng trắng; năm sinh lấy 4 chữ số trong ô (Sheet có thể ghi cả ngày).
 * Hồ sơ chưa có năm sinh bị bỏ qua. Tính trong nhóm nhân sự đang xem (scope) để khớp bảng đơn vị.
 */
export async function GET(req: Request) {
  return permitHandle(async () => {
    await requireUser();
    const p = new URL(req.url).searchParams;
    const mode = p.get("mode"), scope = p.get("scope") ?? "";
    if ((mode !== "same" && mode !== "cross") || (scope && !(scope in PERMIT_CONTRACTOR_SCOPES))) return fail("Bộ lọc trùng không hợp lệ");
    const scopeWhere = scope ? Prisma.sql`AND "scope" = ${scope}` : Prisma.empty;
    // Regex dùng lớp POSIX: Prisma.sql giữ nguyên dấu "\\" của chuỗi mẫu nên '\s' / '\d' không tới được Postgres đúng.
    const keyed = Prisma.sql`SELECT id, lower(regexp_replace(trim(normalize(name, NFC)), '[[:space:]]+', ' ', 'g')) AS n,
        substring("birthYear" from '([0-9]{4})') AS y, lower(trim(normalize(company, NFC))) AS c
      FROM "WorkPermitPerson" WHERE substring("birthYear" from '([0-9]{4})') IS NOT NULL ${scopeWhere}`;
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(mode === "same"
      ? Prisma.sql`WITH k AS (${keyed}) SELECT id FROM k WHERE (n, y, c) IN (SELECT n, y, c FROM k GROUP BY n, y, c HAVING count(*) > 1)`
      : Prisma.sql`WITH k AS (${keyed}) SELECT id FROM k WHERE (n, y) IN (SELECT n, y FROM k GROUP BY n, y HAVING count(DISTINCT c) > 1)`);
    const people = rows.length ? await prisma.workPermitPerson.findMany({
      where: { id: { in: rows.map(row => row.id) } },
      select: { id: true, code: true, name: true, company: true, phone: true, canCommand: true, isActive: true, version: true, ...personCardSelect },
      orderBy: [{ name: "asc" }, { company: "asc" }, { code: "asc" }],
    }) : [];
    return ok(people.map(withPhotoUrl), { total: people.length });
  });
}
