import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 180;
/** Số câu bị đánh giá "chưa đúng" đưa ra soát tay. Đủ để sửa prompt/công cụ, không thành kho log. */
const NEGATIVE_SAMPLE = 20;

type DailyRow = { day: string; turns: number; ok: number; error: number; stopped: number };
type PercentileRow = { p50: number | null; p90: number | null; p95: number | null; max: number | null };
type NegativeRow = { id: string; ratedAt: Date; question: string | null; answer: string; userId: string };

/**
 * SỐ LIỆU CHẤT LƯỢNG TRỢ LÝ AI.
 *
 * Nguồn là `AiTurnLog` (một dòng mỗi lượt hỏi, sống 180 ngày, KHÔNG chứa nội dung câu hỏi).
 * Riêng danh sách câu bị chấm "chưa đúng" đọc từ hội thoại còn hạn — chỉ những cặp hỏi–đáp mà
 * chính người dùng đã bấm "Chưa đúng", và chỉ người có quyền `ai-chat` mức manage/full mới xem.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "ai-chat", ["manage", "full"], "Không đủ quyền xem số liệu trợ lý AI");

    const requestedDays = Number(req.nextUrl.searchParams.get("days"));
    const days = Number.isFinite(requestedDays) ? Math.min(MAX_DAYS, Math.max(1, Math.trunc(requestedDays))) : DEFAULT_DAYS;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [byStatus, byError, byPage, quality, latency, daily, negatives] = await Promise.all([
      prisma.aiTurnLog.groupBy({ by: ["status"], where: { createdAt: { gte: from } }, _count: { _all: true } }),
      prisma.aiTurnLog.groupBy({
        by: ["errorCode"],
        where: { createdAt: { gte: from }, status: "ERROR" },
        _count: { _all: true },
        orderBy: { _count: { errorCode: "desc" } },
      }),
      prisma.aiTurnLog.groupBy({
        by: ["pagePath"],
        where: { createdAt: { gte: from }, pagePath: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { pagePath: "desc" } },
        take: 8,
      }),
      prisma.aiTurnLog.aggregate({
        where: { createdAt: { gte: from }, status: "OK" },
        _count: { _all: true },
        _avg: { toolCalls: true, answerChars: true },
        _sum: { retries: true },
      }),
      prisma.$queryRaw<PercentileRow[]>`
        SELECT
          percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs")::int AS p50,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY "latencyMs")::int AS p90,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs")::int AS p95,
          MAX("latencyMs")::int AS max
        FROM "AiTurnLog"
        WHERE "createdAt" >= ${from} AND "status" = 'OK'
      `,
      prisma.$queryRaw<DailyRow[]>`
        SELECT
          to_char("createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day,
          COUNT(*)::int AS turns,
          COUNT(*) FILTER (WHERE "status" = 'OK')::int AS ok,
          COUNT(*) FILTER (WHERE "status" = 'ERROR')::int AS error,
          COUNT(*) FILTER (WHERE "status" = 'STOPPED')::int AS stopped
        FROM "AiTurnLog"
        WHERE "createdAt" >= ${from}
        GROUP BY 1
        ORDER BY 1
      `,
      // LATERAL lấy câu hỏi đứng ngay trước câu trả lời trong cùng hội thoại.
      prisma.$queryRaw<NegativeRow[]>`
        SELECT m."id", m."ratedAt", q."content" AS question, m."content" AS answer, c."userId"
        FROM "AiMessage" m
        JOIN "AiConversation" c ON c."id" = m."conversationId"
        LEFT JOIN LATERAL (
          SELECT u."content"
          FROM "AiMessage" u
          WHERE u."conversationId" = m."conversationId" AND u."role" = 'USER' AND u."createdAt" <= m."createdAt"
          ORDER BY u."createdAt" DESC
          LIMIT 1
        ) q ON TRUE
        WHERE m."rating" = -1 AND m."ratedAt" >= ${from}
        ORDER BY m."ratedAt" DESC
        LIMIT ${NEGATIVE_SAMPLE}
      `,
    ]);

    const [distinctUsers, withoutCitation, helpful, unhelpful] = await Promise.all([
      prisma.aiTurnLog.findMany({ where: { createdAt: { gte: from } }, distinct: ["userId"], select: { userId: true } }),
      prisma.aiTurnLog.count({ where: { createdAt: { gte: from }, status: "OK", citationCount: 0 } }),
      prisma.aiTurnLog.count({ where: { createdAt: { gte: from }, rating: 1 } }),
      prisma.aiTurnLog.count({ where: { createdAt: { gte: from }, rating: -1 } }),
    ]);

    const names = new Map((await prisma.user.findMany({
      where: { id: { in: [...new Set(negatives.map((row) => row.userId))] } },
      select: { id: true, name: true },
    })).map((row) => [row.id, row.name]));

    const countOf = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
    const okTurns = countOf("OK");

    return ok({
      range: { days, from: from.toISOString() },
      totals: {
        turns: byStatus.reduce((sum, row) => sum + row._count._all, 0),
        ok: okTurns,
        error: countOf("ERROR"),
        stopped: countOf("STOPPED"),
        users: distinctUsers.length,
      },
      quality: {
        withoutCitation,
        helpful,
        unhelpful,
        avgToolCalls: quality._avg.toolCalls ?? 0,
        avgAnswerChars: Math.round(quality._avg.answerChars ?? 0),
        retries: quality._sum.retries ?? 0,
      },
      latency: latency[0] ?? { p50: null, p90: null, p95: null, max: null },
      errors: byError.map((row) => ({ code: row.errorCode ?? "KHÔNG RÕ", count: row._count._all })),
      pages: byPage.map((row) => ({ path: row.pagePath!, count: row._count._all })),
      daily,
      negatives: negatives.map((row) => ({
        id: row.id,
        ratedAt: row.ratedAt,
        userName: names.get(row.userId) ?? "Không rõ",
        question: row.question ?? "",
        answer: row.answer.slice(0, 600),
      })),
    });
  });
}
