import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
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

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

const SORTABLE = ["stt", "maKks", "tenKhuVuc", "viTri", "cuongVi", "machine", "tinhTrangTongThe", "nguoiKiemTra"] as const;

function orderBy(sort: string | null, dir: string | null): Prisma.PcccAlarmButtonOrderByWithRelationInput[] {
  const key = (SORTABLE as readonly string[]).includes(sort ?? "") ? (sort as string) : "stt";
  const direction: Prisma.SortOrder = dir === "desc" ? "desc" : "asc";
  // Chốt thứ tự phụ bằng `rowKey` chứ không bằng `maKks`: mã KKS của bảng này KHÔNG
  // duy nhất (xem ghi chú `rowKey` trong schema), nên hai dòng cùng mã sẽ nhảy chỗ
  // giữa các lần tải nếu chỉ sắp theo mã.
  return key === "stt"
    ? [{ stt: direction }, { rowKey: direction }]
    : [{ [key]: direction } as Prisma.PcccAlarmButtonOrderByWithRelationInput, { stt: "asc" }, { rowKey: "asc" }];
}

// GET /api/pccc/alarm-buttons?period=&cuongVi=&machine=&tinhTrang=&q=&page=
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const sp = req.nextUrl.searchParams;
    // Phạm vi XEM chặn ngay ở câu truy vấn — không lọc ở client (xem lib/pccc-service.ts).
    const viewScope = await resolvePcccViewScope(user);
    const period = await resolvePeriod(sp.get("period"));
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(sp.get("pageSize") ?? DEFAULT_PAGE_SIZE)));
    const q = sp.get("q")?.trim();
    const tinhTrang = sp.get("tinhTrang");

    const where: Prisma.PcccAlarmButtonWhereInput = {
      periodId: period.id,
      // Bảng này CÓ cột "Người giám sát" như bình chữa cháy, nên cấp giám sát xem được
      // phần mình giám sát (vẫn không sửa được — phạm vi ghi tính riêng).
      ...scopeWhere(sp.get("cuongVi"), sp.get("machine"), viewScope, { withSupervisor: true }),
      ...(tinhTrang && tinhTrang !== "ALL" ? { tinhTrangTongThe: tinhTrang } : {}),
      ...(q
        ? {
            OR: [
              { maKks: { contains: q, mode: "insensitive" } },
              { tenKhuVuc: { contains: q, mode: "insensitive" } },
              { viTri: { contains: q, mode: "insensitive" } },
              { khac: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, rows, signatures, cuongViList, writeScope] = await Promise.all([
      prisma.pcccAlarmButton.count({ where }),
      prisma.pcccAlarmButton.findMany({
        where,
        orderBy: orderBy(sp.get("sort"), sp.get("dir")),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { components: { orderBy: [{ groupOrder: "asc" }, { statusOrder: "asc" }] } },
      }),
      signaturesOf(period.id, "ALARM_BUTTON"),
      cuongViListOf(period.id, viewScope),
      pcccWriteScopeOf(user, "ALARM_BUTTON"),
    ]);

    // Khung header 2 tầng (nhóm × trạng thái) dựng từ chính dữ liệu, giữ thứ tự cột gốc.
    const groups: { label: string; statuses: string[] }[] = [];
    for (const c of rows[0]?.components ?? []) {
      const g = groups.find((x) => x.label === c.groupLabel);
      if (g) g.statuses.push(c.status);
      else groups.push({ label: c.groupLabel, statuses: [c.status] });
    }

    return ok(
      rows.map((r) => ({ ...r, signature: signatures.get(r.id) ?? null })),
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
