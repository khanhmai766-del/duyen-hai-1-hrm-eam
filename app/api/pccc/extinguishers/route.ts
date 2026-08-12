import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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
import { periodEndDate } from "@/lib/pccc-summary";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

/** Cột được phép sắp xếp — chặn tên cột tuỳ ý từ client. */
const SORTABLE = ["stt", "ma", "chungLoai", "tinhTrang", "apSuat", "cuongVi", "machine", "viTriHienTai", "nguoiKiemTra", "denHanThayThe"] as const;

function orderBy(sort: string | null, dir: string | null): Prisma.PcccExtinguisherOrderByWithRelationInput[] {
  const key = (SORTABLE as readonly string[]).includes(sort ?? "") ? (sort as string) : "stt";
  const direction: Prisma.SortOrder = dir === "desc" ? "desc" : "asc";
  return key === "stt" ? [{ stt: direction }, { ma: direction }] : [{ [key]: direction } as Prisma.PcccExtinguisherOrderByWithRelationInput, { stt: "asc" }];
}

// GET /api/pccc/extinguishers?period=&cuongVi=&tinhTrang=&chungLoai=&quaHan=1&q=&page=
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const sp = req.nextUrl.searchParams;
    // Phạm vi XEM chặn ngay ở câu truy vấn — không phải lọc ở client (xem lib/pccc-service.ts)
    const viewScope = await resolvePcccViewScope(user);
    const period = await resolvePeriod(sp.get("period"));
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(sp.get("pageSize") ?? DEFAULT_PAGE_SIZE)));
    const q = sp.get("q")?.trim();
    const tinhTrang = sp.get("tinhTrang");
    const chungLoai = sp.get("chungLoai");
    const giamSat = sp.get("giamSat");

    const where: Prisma.PcccExtinguisherWhereInput = {
      periodId: period.id,
      // Lọc theo MÃ chức danh + tổ máy (tổ máy là bộ lọc xem, không phải rào quyền)
      ...scopeWhere(sp.get("cuongVi"), sp.get("machine"), viewScope, { withSupervisor: true }),
      ...(giamSat && giamSat !== "ALL" ? { nguoiGiamSatCode: giamSat } : {}),
      ...(tinhTrang && tinhTrang !== "ALL" ? { tinhTrang } : {}),
      ...(chungLoai && chungLoai !== "ALL" ? { chungLoai } : {}),
      ...(sp.get("quaHan") === "1" ? { denHanThayThe: { lt: periodEndDate(period.label) } } : {}),
      ...(q
        ? {
            OR: [
              { ma: { contains: q, mode: "insensitive" } },
              { viTri: { contains: q, mode: "insensitive" } },
              { viTriHienTai: { contains: q, mode: "insensitive" } },
              { nguonGoc: { contains: q, mode: "insensitive" } },
              { ghiChu: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, rows, signatures, cuongViList, giamSatList, writeScope] = await Promise.all([
      prisma.pcccExtinguisher.count({ where }),
      prisma.pcccExtinguisher.findMany({
        where,
        orderBy: orderBy(sp.get("sort"), sp.get("dir")),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      signaturesOf(period.id, "EXTINGUISHER"),
      cuongViListOf(period.id, viewScope),
      giamSatListOf(period.id, viewScope),
      // Phạm vi GHI của người đang xem — UI khoá sẵn dòng ngoài phạm vi (xem lib/pccc-service.ts)
      pcccWriteScopeOf(user),
    ]);

    return ok(
      rows.map((r) => ({ ...r, signature: signatures.get(r.id) ?? null })),
      {
        period,
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        cuongViList,
        giamSatList,
        writeScope,
        viewScope: pcccViewScopeMeta(viewScope),
      }
    );
  });
}
