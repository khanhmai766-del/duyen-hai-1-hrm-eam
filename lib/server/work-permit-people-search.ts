import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeText } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import { hasCommanderJobTitle } from "@/lib/work-permit-person-search";
import { permitSearchTerm } from "@/lib/server/work-permits";

export async function permitPeopleSearchWhere(baseWhere: Prisma.WorkPermitPersonWhereInput, q: string, pendingCommand: boolean, db: Pick<PrismaClient, "workPermitPerson"> = prisma): Promise<Prisma.WorkPermitPersonWhereInput> {
  // Chức vụ cũ chưa nằm trong searchText. Đối chiếu các chức vụ phân biệt bằng normalizeText
  // để tìm không dấu ngay trên dữ liệu hiện có, không cần ghi lại danh bạ hay đổi schema.
  const titles = q.trim() || pendingCommand ? await db.workPermitPerson.findMany({
    where: { AND: [baseWhere, { jobTitle: { not: "" } }, ...(pendingCommand ? [{ canCommand: false }] : [])] },
    select: { jobTitle: true }, distinct: ["jobTitle"],
  }) : [];
  const term = normalizeText(q.trim());
  const matchingTitles = titles.filter(row => normalizeText(row.jobTitle).includes(term)).map(row => row.jobTitle);
  return { AND: [
    baseWhere,
    { OR: [{ searchText: { contains: permitSearchTerm(q) } }, ...(matchingTitles.length ? [{ jobTitle: { in: matchingTitles } }] : [])] },
    ...(pendingCommand ? [{ isActive: true, canCommand: false, jobTitle: { in: titles.filter(row => hasCommanderJobTitle(row.jobTitle)).map(row => row.jobTitle) } }] : []),
  ] };
}
