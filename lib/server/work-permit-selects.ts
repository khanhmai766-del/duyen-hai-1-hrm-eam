import type { Prisma } from "@prisma/client";
export const permitListSelect = {
  id: true, number: true, year: true, kind: true, format: true, workType: true,
  workDate: true, content: true, location: true, unit: true, issuerName: true,
  commanderName: true, teamName: true, teamType: true, workerCount: true,
  authorizerName: true, status: true, repairRequestNumber: true,
  sessions: { where: { endedAt: null }, orderBy: { openedAt: "desc" }, take: 1,
    select: { commanderName: true, company: true, authorizerName: true } },
} satisfies Prisma.WorkPermitSelect;
export const historySummarySelect = { id: true, actorName: true, action: true, createdAt: true } satisfies Prisma.WorkPermitHistorySelect;
