import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  PCCC_PERMISSION,
  cuongViListOf,
  pcccViewScopeMeta,
  pcccWriteScopeOf,
  resolvePcccViewScope,
  resolvePeriod,
  scopeWhere,
  signaturesOf,
} from "@/lib/pccc-service";
import { tinhTrangWhere } from "@/lib/pccc-status";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;
const SORTABLE = ["stt", "heThong", "ma", "viTri", "cuongVi", "machine", "tinhTrang", "nguoiKiemTra"] as const;

function orderBy(sort: string | null, dir: string | null): Prisma.PcccFireControlCabinetOrderByWithRelationInput[] {
  const key = (SORTABLE as readonly string[]).includes(sort ?? "") ? (sort as string) : "stt";
  const direction: Prisma.SortOrder = dir === "desc" ? "desc" : "asc";
  return key === "stt"
    ? [{ stt: direction }, { ma: direction }]
    : [{ [key]: direction } as Prisma.PcccFireControlCabinetOrderByWithRelationInput, { stt: "asc" }, { ma: "asc" }];
}

// GET /api/pccc/fire-control-cabinets?period=&cuongVi=&machine=&heThong=&tinhTrang=&q=&page=
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const sp = req.nextUrl.searchParams;
    const viewScope = await resolvePcccViewScope(user);
    const period = await resolvePeriod(sp.get("period"));
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(sp.get("pageSize") ?? DEFAULT_PAGE_SIZE)));
    const q = sp.get("q")?.trim();
    const heThong = sp.get("heThong")?.trim();

    const where: Prisma.PcccFireControlCabinetWhereInput = {
      periodId: period.id,
      ...scopeWhere(sp.get("cuongVi"), sp.get("machine"), viewScope),
      ...tinhTrangWhere(sp.get("tinhTrang")),
      ...(heThong && heThong !== "ALL" ? { heThong } : {}),
      ...(q
        ? {
            OR: [
              { ma: { contains: q, mode: "insensitive" } },
              { heThong: { contains: q, mode: "insensitive" } },
              { viTri: { contains: q, mode: "insensitive" } },
              { ghiChu: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, rows, signatures, cuongViList, heThongRows, writeScope] = await Promise.all([
      prisma.pcccFireControlCabinet.count({ where }),
      prisma.pcccFireControlCabinet.findMany({
        where,
        orderBy: orderBy(sp.get("sort"), sp.get("dir")),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      signaturesOf(period.id, "FIRE_CONTROL_CABINET"),
      cuongViListOf(period.id, viewScope),
      prisma.pcccFireControlCabinet.findMany({
        where: { periodId: period.id, ...scopeWhere(sp.get("cuongVi"), sp.get("machine"), viewScope) },
        distinct: ["heThong"],
        select: { heThong: true },
        orderBy: { heThong: "asc" },
      }),
      pcccWriteScopeOf(user, "FIRE_CONTROL_CABINET"),
    ]);

    return ok(
      rows.map((row) => ({ ...row, signature: signatures.get(row.id) ?? null })),
      {
        period,
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        cuongViList,
        heThongList: heThongRows.map((row) => row.heThong),
        writeScope,
        viewScope: pcccViewScopeMeta(viewScope),
      }
    );
  });
}
