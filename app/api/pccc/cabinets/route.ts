import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  PCCC_PERMISSION,
  cuongViListOf,
  pcccCabinetViewScope,
  pcccViewScopeMeta,
  pcccWriteScopeOf,
  resolvePcccViewScope,
  resolvePeriod,
  scopeWhere,
  signaturesOf,
} from "@/lib/pccc-service";
import { cabinetComponentsForTcc } from "@/lib/pccc-status";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

const SORTABLE = ["stt", "ma", "ten", "cuongVi", "machine", "tinhTrangTongThe", "soYcsc", "nguoiKiemTra"] as const;

function orderBy(sort: string | null, dir: string | null): Prisma.PcccCabinetOrderByWithRelationInput[] {
  const key = (SORTABLE as readonly string[]).includes(sort ?? "") ? (sort as string) : "stt";
  const direction: Prisma.SortOrder = dir === "desc" ? "desc" : "asc";
  return key === "stt" ? [{ stt: direction }, { ma: direction }] : [{ [key]: direction } as Prisma.PcccCabinetOrderByWithRelationInput, { stt: "asc" }];
}

// GET /api/pccc/cabinets?period=&cuongVi=&tinhTrang=&loaiTu=INDOOR&q=&page=
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const sp = req.nextUrl.searchParams;
    // Phạm vi XEM chặn ngay ở câu truy vấn — không phải lọc ở client (xem lib/pccc-service.ts).
    // Bọc qua `pcccCabinetViewScope`: cương vị được giao trọn bảng tủ thì xem hết.
    const viewScope = pcccCabinetViewScope(await resolvePcccViewScope(user), user);
    const period = await resolvePeriod(sp.get("period"));
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(sp.get("pageSize") ?? DEFAULT_PAGE_SIZE)));
    const q = sp.get("q")?.trim();
    const tinhTrang = sp.get("tinhTrang");
    const loaiTu = sp.get("loaiTu");

    const where: Prisma.PcccCabinetWhereInput = {
      periodId: period.id,
      ...scopeWhere(sp.get("cuongVi"), sp.get("machine"), viewScope),
      ...(tinhTrang && tinhTrang !== "ALL" ? { tinhTrangTongThe: tinhTrang } : {}),
      // INDOOR/OUTDOOR nằm trong tên tủ, đúng như file gốc
      ...(loaiTu === "INDOOR" ? { ten: { contains: "INDOOR", mode: "insensitive" } } : {}),
      ...(loaiTu === "OUTDOOR" ? { NOT: { ten: { contains: "INDOOR", mode: "insensitive" } } } : {}),
      ...(q
        ? {
            OR: [
              { ma: { contains: q, mode: "insensitive" } },
              { ten: { contains: q, mode: "insensitive" } },
              { viTri: { contains: q, mode: "insensitive" } },
              { soYcsc: { contains: q, mode: "insensitive" } },
              { ghiChu: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, rows, signatures, cuongViList, writeScope] = await Promise.all([
      prisma.pcccCabinet.count({ where }),
      prisma.pcccCabinet.findMany({
        where,
        orderBy: orderBy(sp.get("sort"), sp.get("dir")),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { components: { orderBy: [{ groupOrder: "asc" }, { statusOrder: "asc" }] } },
      }),
      signaturesOf(period.id, "CABINET"),
      cuongViListOf(period.id, viewScope),
      // Phạm vi GHI của người đang xem — UI khoá sẵn dòng ngoài phạm vi (xem lib/pccc-service.ts)
      pcccWriteScopeOf(user, "CABINET"),
    ]);

    // Khung header 2 tầng (nhóm × trạng thái) lấy từ chính dữ liệu, giữ thứ tự cột gốc
    // Hai nhóm CUỘN ỐNG / LĂNG PHUN đã chuyển hẳn xuống bảng cuộn vòi — lọc ở ĐÂY,
    // trước khi dựng khung header và trước khi trả về, để bảng tủ không còn dấu vết.
    const visibleRows = rows.map((r) => ({ ...r, components: cabinetComponentsForTcc(r.components) }));
    const groups: { label: string; statuses: string[] }[] = [];
    for (const c of visibleRows[0]?.components ?? []) {
      const g = groups.find((x) => x.label === c.groupLabel);
      if (g) g.statuses.push(c.status);
      else groups.push({ label: c.groupLabel, statuses: [c.status] });
    }

    return ok(
      visibleRows.map((r) => ({ ...r, signature: signatures.get(r.id) ?? null })),
      {
        period,
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        cuongViList,
        groups,
        writeScope,
        viewScope: pcccViewScopeMeta(viewScope),
      }
    );
  });
}
