import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadPcccPage } from "@/lib/pccc-pagination";
import { ok, requireUser, handle } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  PCCC_PERMISSION,
  cuongViListOf,
  giamSatListOf,
  pcccViewScopeMeta,
  pcccWriteScopeOf,
  resolvePcccViewScope,
  resolvePeriod,
  scopeWhere,
  signaturesOf,
} from "@/lib/pccc-service";
import { VALVE_LOAI_OPTIONS, tinhTrangWhere } from "@/lib/pccc-status";

export const dynamic = "force-dynamic";

const SORTABLE = ["stt", "maKks", "tenVan", "loaiVan", "viTri", "cuongVi", "machine", "tinhTrang", "soYcsc", "nguoiKiemTra"] as const;

function orderBy(sort: string | null, dir: string | null): Prisma.PcccValveOrderByWithRelationInput[] {
  const key = (SORTABLE as readonly string[]).includes(sort ?? "") ? (sort as string) : "stt";
  const direction: Prisma.SortOrder = dir === "desc" ? "desc" : "asc";
  return key === "stt"
    ? [{ stt: direction }, { rowKey: direction }]
    : [{ [key]: direction } as Prisma.PcccValveOrderByWithRelationInput, { stt: "asc" }, { rowKey: "asc" }];
}

// GET /api/pccc/valves?period=&cuongVi=&machine=&tinhTrang=&loaiVan=&q=&page=
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const sp = req.nextUrl.searchParams;
    const viewScope = await resolvePcccViewScope(user);
    const period = await resolvePeriod(sp.get("period"));
    const q = sp.get("q")?.trim();
    const tinhTrang = sp.get("tinhTrang");
    // Bảng này có cột Người giám sát nên lọc được theo CẤP GIÁM SÁT, y như bình chữa cháy.
    const giamSat = sp.get("giamSat");
    const loaiVan = sp.get("loaiVan");

    const where: Prisma.PcccValveWhereInput = {
      periodId: period.id,
      // Bảng van CÓ cột "Người giám sát" nên cấp giám sát xem được phần mình giám sát.
      ...scopeWhere(sp.get("cuongVi"), sp.get("machine"), viewScope, { withSupervisor: true }),
      ...(giamSat && giamSat !== "ALL" ? { nguoiGiamSatCode: giamSat } : {}),
      ...tinhTrangWhere(tinhTrang),
      ...((VALVE_LOAI_OPTIONS as readonly string[]).includes(loaiVan ?? "") ? { loaiVan: loaiVan as string } : {}),
      ...(q
        ? {
            OR: [
              { maKks: { contains: q, mode: "insensitive" } },
              { tenVan: { contains: q, mode: "insensitive" } },
              { viTri: { contains: q, mode: "insensitive" } },
              { moTa: { contains: q, mode: "insensitive" } },
              { soYcsc: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [{ total, rows, page, pageSize, pageCount }, signatures, cuongViList, giamSatList, writeScope] = await Promise.all([
      loadPcccPage(
        sp,
        () => prisma.pcccValve.count({ where }),
        (pagination) => prisma.pcccValve.findMany({
          where,
          orderBy: orderBy(sp.get("sort"), sp.get("dir")),
          ...pagination,
        }),
      ),
      signaturesOf(period.id, "VALVE"),
      cuongViListOf(period.id, viewScope),
      giamSatListOf(period.id, viewScope),
      pcccWriteScopeOf(user, "VALVE"),
    ]);

    return ok(
      rows.map((r) => ({ ...r, signature: signatures.get(r.id) ?? null })),
      {
        period,
        total,
        page,
        pageSize,
        pageCount,
        cuongViList,
        giamSatList,
        loaiVanList: [...VALVE_LOAI_OPTIONS],
        writeScope,
        viewScope: pcccViewScopeMeta(viewScope),
      }
    );
  });
}
