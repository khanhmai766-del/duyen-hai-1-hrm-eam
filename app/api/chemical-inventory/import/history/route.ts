import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { MANAGE_LEVELS } from "@/lib/chemical-inventory/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/chemical-inventory/import/history?limit=20
 * Lịch sử các lần nhập workbook. `detail` chứa thống kê theo tab và danh sách ô lệch.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...MANAGE_LEVELS], "Không đủ quyền xem lịch sử đồng bộ");

    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 20));
    const batches = await prisma.chemicalImportBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return ok(
      batches.map((b) => ({
        id: b.id,
        fileName: b.fileName,
        fileHash: b.fileHash,
        status: b.status,
        importedRows: b.importedRows,
        updatedRows: b.updatedRows,
        skippedRows: b.skippedRows,
        errorRows: b.errorRows,
        detail: b.detail,
        createdById: b.createdById,
        createdAt: b.createdAt.toISOString(),
      }))
    );
  });
}
