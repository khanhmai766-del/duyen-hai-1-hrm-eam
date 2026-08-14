import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requireErpMaterialManage, requireErpMaterialView } from "@/lib/erp-material-access";
import { parseErpNumber } from "@/lib/parse-number";

export const dynamic = "force-dynamic";

type StockRow = { code?: unknown; erpStock?: unknown; warehouse?: unknown; unit?: unknown };

function syncCountsFromDetail(detail: string | null) {
  const current = detail?.match(
    /Đọc (\d+) dòng QLVT, xử lý (\d+) mã \((\d+) mã đổi tồn, (\d+) mã đổi kho, (\d+) mã đổi ĐVT\), bỏ qua (\d+) mã ngừng sử dụng, (\d+) mã không có trong hệ thống và (\d+) dòng không hợp lệ/
  );
  if (current) {
    return {
      sourceCount: Number(current[1]),
      updated: Number(current[2]),
      changed: Number(current[3]),
      warehouseChanged: Number(current[4]),
      unitChanged: Number(current[5]),
      inactiveSkipped: Number(current[6]),
      notFound: Number(current[7]),
      skipped: Number(current[8]),
    };
  }

  // Tương thích các nhật ký đã ghi trước khi bổ sung số dòng nguồn.
  const legacy = detail?.match(
    /Cập nhật (\d+) mã \((\d+) mã đổi tồn, (\d+) mã đổi kho, (\d+) mã đổi ĐVT\), bỏ qua (\d+) mã ngừng sử dụng, (\d+) mã không có trong hệ thống và (\d+) dòng không hợp lệ/
  );
  return legacy ? {
    sourceCount: Number(legacy[1]),
    updated: Number(legacy[1]),
    changed: Number(legacy[2]),
    warehouseChanged: Number(legacy[3]),
    unitChanged: Number(legacy[4]),
    inactiveSkipped: Number(legacy[5]),
    notFound: Number(legacy[6]),
    skipped: Number(legacy[7]),
  } : null;
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await requireErpMaterialView(user);
    const runs = await prisma.auditLog.findMany({
      where: { action: "UPDATE_ERP_STOCK_FROM_QLVT", entity: "ErpMaterial" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        detail: true,
        user: {
          select: {
            name: true,
            position: true,
            currentPosition: true,
          },
        },
      },
    });

    return ok(runs.map((run) => ({
      id: run.id,
      syncedAt: run.createdAt.toISOString(),
      syncedBy: run.user.name,
      position: run.user.currentPosition ?? run.user.position,
      detail: run.detail,
      ...syncCountsFromDetail(run.detail),
    })));
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireErpMaterialManage(user);

    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as StockRow[]) : [];
    const requestedSourceCount = Number(body?.sourceCount);
    const sourceCount = Number.isSafeInteger(requestedSourceCount) && requestedSourceCount >= rows.length
      ? requestedSourceCount
      : rows.length;
    if (!rows.length) return fail("QLVT chưa trả về dòng vật tư hợp lệ");

    const existing = await prisma.erpMaterial.findMany({ select: { id: true, code: true, unit: true, erpStock: true, warehouse: true, isActive: true } });
    const existingByCode = new Map(existing.map((item) => [item.code, item]));
    const seen = new Set<string>();
    const updates: Array<{ id: string; code: string; before: number; after: number; warehouseBefore: string | null; warehouse?: string; unitBefore: string; unit?: string }> = [];
    const errors: string[] = [];
    let notFound = 0;
    let skipped = 0;
    let inactiveSkipped = 0;

    for (const [index, row] of rows.entries()) {
      const line = index + 1;
      const code = String(row.code ?? "").trim();
      const parsedStock = parseErpNumber(row.erpStock);
      if (!code || !Number.isFinite(parsedStock) || parsedStock < 0) {
        skipped += 1;
        errors.push(`Dòng ${line}: thiếu mã hoặc số liệu ERP không hợp lệ`);
        continue;
      }
      // Từ chối số dương nhỏ bất thường để không biến thành 0 khi hiển thị.
      if (parsedStock > 0 && parsedStock < 1e-100) {
        return fail("Dữ liệu tồn kho có định dạng bất thường. Hãy khởi động lại máy chủ rồi đồng bộ QLVT lại.", 400);
      }
      if (seen.has(code)) {
        skipped += 1;
        errors.push(`Dòng ${line}: mã ${code} bị trùng trong file`);
        continue;
      }
      seen.add(code);

      const current = existingByCode.get(code);
      if (!current) {
        notFound += 1;
        continue;
      }
      if (!current.isActive) {
        inactiveSkipped += 1;
        continue;
      }
      const warehouse = typeof row.warehouse === "string" ? row.warehouse.trim() : undefined;
      const unit = typeof row.unit === "string" ? row.unit.trim() : undefined;
      updates.push({ id: current.id, code, before: current.erpStock, after: parsedStock, warehouseBefore: current.warehouse, warehouse, unitBefore: current.unit, unit });
    }

    if (updates.length) {
      await prisma.$transaction(
        updates.map((item) => prisma.$executeRaw(Prisma.sql`
          UPDATE "ErpMaterial"
          SET "erpStock" = CAST(${item.after} AS DOUBLE PRECISION),
              "warehouse" = COALESCE(CAST(${item.warehouse || null} AS TEXT), "warehouse"),
              "unit" = COALESCE(CAST(${item.unit || null} AS TEXT), "unit"),
              "updatedAt" = NOW()
          WHERE "id" = ${item.id}
        `))
      );
    }

    const changed = updates.filter((item) => item.before !== item.after).length;
    const warehouseChanged = updates.filter((item) => item.warehouse && item.warehouseBefore !== item.warehouse).length;
    const unitChanged = updates.filter((item) => item.unit && item.unitBefore !== item.unit).length;
    const syncedAt = new Date();
    const detail = auditDetailWithPosition(
      user,
      `Đọc ${sourceCount} dòng QLVT, xử lý ${updates.length} mã (${changed} mã đổi tồn, ${warehouseChanged} mã đổi kho, ${unitChanged} mã đổi ĐVT), bỏ qua ${inactiveSkipped} mã ngừng sử dụng, ${notFound} mã không có trong hệ thống và ${skipped} dòng không hợp lệ`
    );
    await audit(
      user.id,
      "UPDATE_ERP_STOCK_FROM_QLVT",
      "ErpMaterial",
      undefined,
      detail
    );

    return ok({
      updated: updates.length,
      changed,
      warehouseChanged,
      unitChanged,
      notFound,
      skipped,
      inactiveSkipped,
      errors,
      sync: {
        id: `pending-${syncedAt.getTime()}`,
        syncedAt: syncedAt.toISOString(),
        syncedBy: user.name ?? user.email ?? "Không xác định",
        position: user.currentPosition ?? user.position ?? null,
        detail,
        sourceCount,
        updated: updates.length,
        changed,
        warehouseChanged,
        unitChanged,
        inactiveSkipped,
        notFound,
        skipped,
      },
    });
  });
}
