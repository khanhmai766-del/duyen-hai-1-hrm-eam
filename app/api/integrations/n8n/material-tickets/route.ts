import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import {
  decodeMaterialTicketSyncCursor,
  encodeMaterialTicketSyncCursor,
  materialTicketRowsForN8n,
  materialTicketRowsForN8nV2,
  parseMaterialTicketSyncLimit,
  parseMaterialTicketUpdatedAfter,
  verifyN8nMaterialTicketToken,
} from "@/lib/material-ticket-n8n-sync";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ITEM_INCLUDE = {
  items: {
    include: {
      material: { select: { code: true, name: true, unit: true } },
      device: { select: { name: true } },
    },
    orderBy: { id: "asc" as const },
  },
} as const;

export async function GET(req: NextRequest) {
  return handle(async () => {
    if (!verifyN8nMaterialTicketToken(req.headers.get("authorization"))) {
      return fail("Không có quyền đồng bộ vật tư", 401);
    }

    try {
      const sp = req.nextUrl.searchParams;
      const limit = parseMaterialTicketSyncLimit(sp.get("limit"));
      const layout = sp.get("layout") === "vh1_v2" ? "vh1_v2" : "legacy";
      const cursorValue = sp.get("cursor")?.trim();
      const cursor = cursorValue ? decodeMaterialTicketSyncCursor(cursorValue) : null;
      const updatedAfter = cursor ? null : parseMaterialTicketUpdatedAfter(sp.get("updatedAfter"));
      // Cố định biên trên cho cả lượt phân trang để phiếu thay đổi trong lúc n8n
      // đang chạy không bị nhảy qua watermark của lượt hiện tại.
      const boundary = cursor?.boundary ?? new Date();

      const tickets = await prisma.materialTicket.findMany({
        where: cursor
          ? {
              AND: [
                { updatedAt: { lte: boundary } },
                {
                  OR: [
                    { updatedAt: { gt: cursor.updatedAt } },
                    { updatedAt: cursor.updatedAt, id: { gt: cursor.id } },
                  ],
                },
              ],
            }
          : { updatedAt: { gt: updatedAfter!, lte: boundary } },
        include: ITEM_INCLUDE,
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: limit + 1,
      });

      const hasMore = tickets.length > limit;
      const page = hasMore ? tickets.slice(0, limit) : tickets;
      const lastTicket = page.at(-1);
      const rows = layout === "vh1_v2"
        ? page.flatMap(materialTicketRowsForN8nV2)
        : page.flatMap(materialTicketRowsForN8n);

      return ok(rows, {
        hasMore,
        nextCursor: hasMore && lastTicket ? encodeMaterialTicketSyncCursor(lastTicket, boundary) : null,
        watermark: boundary.toISOString(),
        serverTime: new Date().toISOString(),
        ticketCount: page.length,
        rowCount: rows.length,
        layout,
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Dữ liệu đồng bộ không hợp lệ", 400);
    }
  });
}
