import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  PCCC_PERMISSION,
  assertPcccScope,
  assertPeriodWritable,
  cuongViListOf,
  pcccCabinetViewScope,
  pcccViewScopeMeta,
  pcccWriteScopeOf,
  resolvePcccViewScope,
  resolvePcccWriteScope,
  resolvePeriod,
  scopeWhere,
  signaturesOf,
} from "@/lib/pccc-service";
import { HOSE_REEL_GROUPS, deriveCabinetStatus } from "@/lib/pccc-status";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

const SORTABLE = ["stt", "ma", "ten", "viTri", "cuongVi", "machine", "tinhTrangTongThe", "soYcsc", "nguoiKiemTra"] as const;

function orderBy(sort: string | null, dir: string | null): Prisma.PcccHoseReelOrderByWithRelationInput[] {
  const key = (SORTABLE as readonly string[]).includes(sort ?? "") ? (sort as string) : "stt";
  const direction: Prisma.SortOrder = dir === "desc" ? "desc" : "asc";
  return key === "stt" ? [{ stt: direction }, { ma: direction }] : [{ [key]: direction } as Prisma.PcccHoseReelOrderByWithRelationInput, { stt: "asc" }];
}

// GET /api/pccc/hose-reels?period=&cuongVi=&machine=&tinhTrang=&cabinetId=&q=&page=
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const sp = req.nextUrl.searchParams;
    // Cuộn vòi là danh mục CON của tủ chữa cháy nên đi theo ĐÚNG phạm vi của tủ —
    // cương vị được giao trọn bảng tủ thì cũng xem được trọn bảng cuộn vòi.
    const viewScope = pcccCabinetViewScope(await resolvePcccViewScope(user), user);
    const period = await resolvePeriod(sp.get("period"));
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(sp.get("pageSize") ?? DEFAULT_PAGE_SIZE)));
    const q = sp.get("q")?.trim();
    // Ô lọc RIÊNG (`tinhTrangCvcc`), không dùng chung `tinhTrang` với bảng tủ: hai bảng
    // nằm cùng một tab nhưng vốn từ tình trạng khác nhau (tủ ba mức, cuộn vòi hai mức),
    // dùng chung một tham số thì lọc bảng này là bảng kia trắng trơn.
    const tinhTrang = sp.get("tinhTrangCvcc");
    const cabinetId = sp.get("cabinetId")?.trim();

    const where: Prisma.PcccHoseReelWhereInput = {
      periodId: period.id,
      ...scopeWhere(sp.get("cuongVi"), sp.get("machine"), viewScope),
      ...(tinhTrang && tinhTrang !== "ALL" ? { tinhTrangTongThe: tinhTrang } : {}),
      ...(cabinetId ? { cabinetId } : {}),
      ...(q
        ? {
            OR: [
              { ma: { contains: q, mode: "insensitive" } },
              { ten: { contains: q, mode: "insensitive" } },
              { viTri: { contains: q, mode: "insensitive" } },
              { soYcsc: { contains: q, mode: "insensitive" } },
              { ghiChu: { contains: q, mode: "insensitive" } },
              // Tìm được cả theo mã/tên tủ cha: người dùng nhớ mã tủ chứ ít khi nhớ mã cuộn vòi.
              { cabinet: { ma: { contains: q, mode: "insensitive" } } },
              { cabinet: { ten: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [total, rows, signatures, cuongViList, writeScope] = await Promise.all([
      prisma.pcccHoseReel.count({ where }),
      prisma.pcccHoseReel.findMany({
        where,
        orderBy: orderBy(sp.get("sort"), sp.get("dir")),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          components: { orderBy: [{ groupOrder: "asc" }, { statusOrder: "asc" }] },
          cabinet: { select: { id: true, ma: true, ten: true } },
        },
      }),
      signaturesOf(period.id, "HOSE_REEL"),
      cuongViListOf(period.id, viewScope),
      pcccWriteScopeOf(user, "HOSE_REEL"),
    ]);

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

// POST /api/pccc/hose-reels { cabinetId, ma, ten? } -> thêm một cuộn vòi vào tủ đã có
//
// Đây là bảng DUY NHẤT của module cho thêm dòng bằng tay: cuộn vòi không có trong
// Excel gốc nên số lượng thực tế mỗi tủ chỉ hiện trường mới biết. Ghi ngay chứ không
// chờ ký, vì thêm/bớt một thiết bị là thay đổi CẤU TRÚC chứ không phải sửa một ô.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolvePcccWriteScope(user, "Không đủ quyền thêm cuộn vòi", "HOSE_REEL");

    const body = (await req.json()) as { cabinetId?: string; ma?: string; ten?: string };
    const cabinetId = String(body.cabinetId ?? "").trim();
    const ma = String(body.ma ?? "").trim();
    if (!cabinetId || !ma) return fail("Thiếu tủ chữa cháy cha hoặc mã cuộn vòi");

    const cabinet = await prisma.pcccCabinet.findUnique({ where: { id: cabinetId }, include: { period: true, components: true } });
    if (!cabinet) return fail("Không tìm thấy tủ chữa cháy", 404);
    assertPeriodWritable(cabinet.period);
    // Quyền theo TỦ CHA: ai sửa được tủ thì thêm được cuộn vòi cho tủ đó.
    assertPcccScope(scope, cabinet);

    if (await prisma.pcccHoseReel.findUnique({ where: { periodId_ma: { periodId: cabinet.periodId, ma } } })) {
      return fail(`Mã "${ma}" đã có trong kỳ ${cabinet.period.label}`, 409);
    }

    // STT nối tiếp, KHÔNG đánh số lại các dòng cũ — đánh lại thì mọi dòng đều "bị sửa"
    // và mất sạch chữ ký của cả bảng.
    const last = await prisma.pcccHoseReel.findFirst({
      where: { periodId: cabinet.periodId },
      orderBy: { stt: "desc" },
      select: { stt: true },
    });

    // Ô tích sao từ tủ cha tại thời điểm thêm; sau đó hai bảng sửa độc lập.
    const components = HOSE_REEL_GROUPS.flatMap((g, groupOrder) =>
      g.statuses.map((status, statusOrder) => ({
        groupLabel: g.label,
        status,
        checked: cabinet.components.find((c) => c.groupLabel === g.label && c.status === status)?.checked ?? false,
        groupOrder,
        statusOrder,
      }))
    );

    const created = await prisma.pcccHoseReel.create({
      data: {
        periodId: cabinet.periodId,
        cabinetId: cabinet.id,
        stt: (last?.stt ?? 0) + 1,
        ma,
        ten: String(body.ten ?? "").trim() || "Cuộn vòi chữa cháy",
        viTri: cabinet.viTri,
        cuongVi: cabinet.cuongVi,
        cuongViCode: cabinet.cuongViCode,
        machine: cabinet.machine,
        tinhTrangTongThe: deriveCabinetStatus(components),
        components: { create: components },
      },
      include: { components: { orderBy: [{ groupOrder: "asc" }, { statusOrder: "asc" }] }, cabinet: { select: { id: true, ma: true, ten: true } } },
    });

    await audit(
      user.id,
      "CREATE_PCCC_HOSE_REEL",
      "PcccHoseReel",
      created.id,
      auditDetailWithPosition(user, `${cabinet.period.label} · ${ma} (tủ ${cabinet.ma})`),
      { afterData: created }
    );
    return ok({ ...created, signature: null });
  });
}
