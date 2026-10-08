import { audit, fail, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermitIssuer } from "@/lib/server/work-permit-permissions";
import { nextPermitNumber, permitNumberHighWater, permitNumberScope } from "@/lib/server/work-permit-number-reservations";
import { reviewObservedNumber } from "@/lib/server/work-permit-number-review";
import { permitBody, permitHandle } from "@/lib/server/work-permits";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); requirePermitIssuer(user);
    const params = new URL(req.url).searchParams;
    const { kind, year } = permitNumberScope(params.get("kind"), params.get("year"));
    const data = await prisma.$transaction(async tx => {
      const highest = await permitNumberHighWater(tx, kind, year);
      const baseline = await tx.workPermitNumberBaseline.findUnique({ where: { kind_year: { kind, year } } });
      const floor = BigInt(baseline?.number ?? "0") > BigInt(highest) ? baseline!.number : highest;
      const entries = await tx.$queryRaw<Array<{ id: string; number: string; status: string; nkvhPctId: string | null; permitId: string | null; draftPermitId: string | null; updatedAt: Date; ownerName: string; total: number }>>`
        SELECT r."id", r."number", r."status", r."nkvhPctId",
          CASE WHEN EXISTS (SELECT 1 FROM "WorkPermit" p WHERE p."id" = r."permitId") THEN r."permitId" ELSE NULL END AS "permitId",
          -- Lượt lấy từ NKVH không gắn permitId khi còn chờ: tìm phiếu nháp "Chờ NKVH lưu" mang chính số này.
          (SELECT p."id" FROM "WorkPermit" p WHERE p."kind" = r."kind" AND p."year" = r."year" AND p."number" = r."number" AND p."status" = 'DRAFT' ORDER BY p."createdAt" DESC LIMIT 1) AS "draftPermitId",
          r."updatedAt", r."ownerName", count(*) OVER()::int AS total
        FROM "WorkPermitNumberReservation" r
        WHERE "kind" = ${kind} AND "year" = ${year} AND "number" ~ '^[0-9]+$'
          AND ("status" = 'OBSERVED_CONFIRMED' OR ("status" = 'OBSERVED'
            AND ("number"::numeric > ${floor}::numeric OR "permitId" IS NOT NULL)))
        ORDER BY "number"::numeric DESC LIMIT 20`;
      return { highest, suggested: baseline ? await nextPermitNumber(tx, kind, year, baseline.number, highest) : null,
        total: entries[0]?.total ?? 0, entries: entries.map(({ total: _total, ...entry }) => entry) };
    });
    return ok(data);
  });
}

export async function POST(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); requirePermitIssuer(user);
    const body = await permitBody(req);
    if (typeof body.id !== "string" || !body.id || !["confirm", "ignore"].includes(String(body.action))) return fail("Thao tác đối chiếu số không hợp lệ.", 400);
    if (typeof body.expectedStatus !== "string" || typeof body.expectedUpdatedAt !== "string" || typeof body.reason !== "string") return fail("Thiếu thông tin đối chiếu. Tải lại danh sách số.", 400);
    const saved = await prisma.$transaction(tx => reviewObservedNumber(tx, user, {
      id: body.id as string, action: body.action as "confirm" | "ignore", expectedStatus: body.expectedStatus as string,
      expectedUpdatedAt: body.expectedUpdatedAt as string, reason: body.reason as string, sourceChecked: body.sourceChecked === true,
    }));
    await audit(user.id, "REVIEW_WORK_PERMIT_NUMBER_NKVH", "WorkPermitNumberReservation", saved.id,
      `${saved.kind} ${saved.number}/${saved.year}: ${body.action === "confirm" ? "Xác nhận nâng dãy" : "Bỏ ghi nhận sai"} — ${body.reason}`);
    return ok(saved);
  });
}
