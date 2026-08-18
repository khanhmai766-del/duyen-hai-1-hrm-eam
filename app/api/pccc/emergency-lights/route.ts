import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle } from "@/lib/api";
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
import { LIGHT_TINH_TRANG_OPTIONS, isPcccLightLoai } from "@/lib/pccc-status";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

const SORTABLE = ["stt", "maKks", "tenKhuVuc", "maBanVe", "cuongVi", "machine", "tinhTrang", "nguoiKiemTra"] as const;

function orderBy(sort: string | null, dir: string | null): Prisma.PcccEmergencyLightOrderByWithRelationInput[] {
  const key = (SORTABLE as readonly string[]).includes(sort ?? "") ? (sort as string) : "stt";
  const direction: Prisma.SortOrder = dir === "desc" ? "desc" : "asc";
  return key === "stt"
    ? [{ stt: direction }, { rowKey: direction }]
    : [{ [key]: direction } as Prisma.PcccEmergencyLightOrderByWithRelationInput, { stt: "asc" }, { rowKey: "asc" }];
}

// GET /api/pccc/emergency-lights?loai=EXIT|CSSC&period=&cuongVi=&machine=&tinhTrang=&q=&page=
//
// Hai loại đèn nằm CHUNG một bảng nên `loai` là tham số BẮT BUỘC: thiếu nó thì trang
// sẽ trộn đèn EXIT với đèn chiếu sáng sự cố thành một danh sách vô nghĩa.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const sp = req.nextUrl.searchParams;
    const loai = sp.get("loai");
    if (!isPcccLightLoai(loai)) return fail("Thiếu tham số loai (EXIT hoặc CSSC)");

    const viewScope = await resolvePcccViewScope(user);
    const period = await resolvePeriod(sp.get("period"));
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(sp.get("pageSize") ?? DEFAULT_PAGE_SIZE)));
    const q = sp.get("q")?.trim();
    const tinhTrang = sp.get("tinhTrang");
    // Bảng này có cột Người giám sát nên lọc được theo CẤP GIÁM SÁT, y như bình chữa cháy.
    const giamSat = sp.get("giamSat");

    const where: Prisma.PcccEmergencyLightWhereInput = {
      periodId: period.id,
      loai,
      // Bảng đèn CÓ cột "Người giám sát" nên cấp giám sát xem được phần mình giám sát.
      ...scopeWhere(sp.get("cuongVi"), sp.get("machine"), viewScope, { withSupervisor: true }),
      ...(giamSat && giamSat !== "ALL" ? { nguoiGiamSatCode: giamSat } : {}),
      ...(tinhTrang && tinhTrang !== "ALL" ? { tinhTrang } : {}),
      ...(q
        ? {
            OR: [
              { maKks: { contains: q, mode: "insensitive" } },
              { tenKhuVuc: { contains: q, mode: "insensitive" } },
              { maBanVe: { contains: q, mode: "insensitive" } },
              { ketQuaTest: { contains: q, mode: "insensitive" } },
              { ghiChu: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, rows, signatures, cuongViList, giamSatList, writeScope] = await Promise.all([
      prisma.pcccEmergencyLight.count({ where }),
      prisma.pcccEmergencyLight.findMany({
        where,
        orderBy: orderBy(sp.get("sort"), sp.get("dir")),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      signaturesOf(period.id, "EMERGENCY_LIGHT"),
      cuongViListOf(period.id, viewScope),
      giamSatListOf(period.id, viewScope),
      pcccWriteScopeOf(user, "EMERGENCY_LIGHT"),
    ]);

    return ok(
      rows.map((r) => ({ ...r, signature: signatures.get(r.id) ?? null })),
      {
        period,
        loai,
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        cuongViList,
        giamSatList,
        tinhTrangList: [...LIGHT_TINH_TRANG_OPTIONS],
        writeScope,
        viewScope: pcccViewScopeMeta(viewScope),
      }
    );
  });
}
