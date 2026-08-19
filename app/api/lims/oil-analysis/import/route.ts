import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { limsText, parseLimsDate, parseLimsDateTime } from "@/lib/lims-parse";

export const dynamic = "force-dynamic";

const SYNC_DETAIL_RE =
  /Đọc (\d+) dòng LIMS, ghi nhận (\d+) mẫu Không Đạt \((\d+) phiếu mới, (\d+) phiếu đã có, (\d+) phiếu đổi đánh giá\/ý kiến\), bỏ qua (\d+) dòng không hợp lệ/;

function syncCountsFromDetail(detail: string | null) {
  const match = detail?.match(SYNC_DETAIL_RE);
  if (!match) return null;
  return {
    sourceCount: Number(match[1]),
    total: Number(match[2]),
    created: Number(match[3]),
    updated: Number(match[4]),
    opinionChanged: Number(match[5]),
    skipped: Number(match[6]),
  };
}

/** 5 lần đồng bộ gần nhất — để hiển thị trạng thái "Đã đồng bộ / Cần đồng bộ". */
export async function GET() {
  return handle(async () => {
    await requireUser();
    const runs = await prisma.auditLog.findMany({
      where: { action: "SYNC_OIL_ANALYSIS_FROM_LIMS", entity: "OilAnalysisFailure" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        detail: true,
        user: { select: { name: true, position: true, currentPosition: true } },
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

type LimsRow = {
  limsId?: unknown;
  soPhieu?: unknown;
  khuVuc?: unknown;
  donVi?: unknown;
  tenMau?: unknown;
  ngayLayMau?: unknown;
  danhGia?: unknown;
  ykienPkt?: unknown;
  ykienQlvh?: unknown;
  ngayTraKq?: unknown;
};

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "lims-sync", ["manage", "full", "personal"], "Bạn không có quyền đồng bộ kết quả phân tích dầu từ LIMS");

    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as LimsRow[]) : [];
    // Số dòng tiện ích đã ĐỌC trên LIMS trước khi lọc "Không Đạt" — chỉ để ghi nhật ký.
    const requestedSourceCount = Number(body?.sourceCount);
    const sourceCount = Number.isSafeInteger(requestedSourceCount) && requestedSourceCount >= rows.length
      ? requestedSourceCount
      : rows.length;
    if (!rows.length) return fail("LIMS chưa trả về mẫu dầu Không Đạt nào trong khoảng thời gian đã chọn");

    const seen = new Set<string>();
    const errors: string[] = [];
    const parsed: Array<{
      limsId: string;
      soPhieu: string;
      khuVuc: string;
      donVi: string;
      tenMau: string;
      ngayLayMau: Date | null;
      danhGia: string | null;
      ykienPkt: string | null;
      ykienQlvh: string | null;
      ngayTraKq: Date | null;
    }> = [];

    for (const [index, row] of rows.entries()) {
      const line = index + 1;
      const limsId = String(row.limsId ?? "").trim();
      const soPhieu = limsText(row.soPhieu);
      const tenMau = limsText(row.tenMau);
      if (!limsId || !soPhieu || !tenMau) {
        errors.push(`Dòng ${line}: thiếu mã phiếu LIMS, số phiếu hoặc tên mẫu`);
        continue;
      }
      if (seen.has(limsId)) {
        errors.push(`Dòng ${line}: phiếu ${soPhieu} bị lặp trong dữ liệu đọc về`);
        continue;
      }
      seen.add(limsId);
      parsed.push({
        limsId,
        soPhieu,
        khuVuc: limsText(row.khuVuc) ?? "Duyên Hải 1",
        donVi: limsText(row.donVi) ?? "",
        tenMau,
        ngayLayMau: parseLimsDate(row.ngayLayMau),
        danhGia: limsText(row.danhGia),
        ykienPkt: limsText(row.ykienPkt),
        ykienQlvh: limsText(row.ykienQlvh),
        ngayTraKq: parseLimsDateTime(row.ngayTraKq),
      });
    }

    if (!parsed.length) return fail("Không đọc được dòng nào hợp lệ từ LIMS");

    const existing = await prisma.oilAnalysisFailure.findMany({
      where: { limsId: { in: parsed.map((item) => item.limsId) } },
      select: { limsId: true, danhGia: true, ykienPkt: true, ykienQlvh: true, ngayTraKq: true },
    });
    const existingByLimsId = new Map(existing.map((item) => [item.limsId, item]));

    const syncedAt = new Date();
    let created = 0;
    let updated = 0;
    // Phiếu đã có nhưng LIMS vừa bổ sung/sửa ý kiến — đáng chú ý hơn là chỉ "updated".
    let opinionChanged = 0;

    await prisma.$transaction(
      parsed.map((item) => {
        const current = existingByLimsId.get(item.limsId);
        if (!current) created += 1;
        else {
          updated += 1;
          const sameOpinion =
            current.ykienPkt === item.ykienPkt &&
            current.ykienQlvh === item.ykienQlvh &&
            current.danhGia === item.danhGia;
          if (!sameOpinion) opinionChanged += 1;
        }
        return prisma.oilAnalysisFailure.upsert({
          where: { limsId: item.limsId },
          // firstSeenAt chỉ đặt lúc tạo — giữ nguyên khi cập nhật để biết phiếu về từ bao giờ.
          create: { ...item, firstSeenAt: syncedAt, syncedAt },
          update: {
            soPhieu: item.soPhieu,
            khuVuc: item.khuVuc,
            donVi: item.donVi,
            tenMau: item.tenMau,
            ngayLayMau: item.ngayLayMau,
            danhGia: item.danhGia,
            ykienPkt: item.ykienPkt,
            ykienQlvh: item.ykienQlvh,
            ngayTraKq: item.ngayTraKq,
            syncedAt,
          },
        });
      })
    );

    const detail = auditDetailWithPosition(
      user,
      `Đọc ${sourceCount} dòng LIMS, ghi nhận ${parsed.length} mẫu Không Đạt (${created} phiếu mới, ${updated} phiếu đã có, ${opinionChanged} phiếu đổi đánh giá/ý kiến), bỏ qua ${errors.length} dòng không hợp lệ`
    );
    await audit(user.id, "SYNC_OIL_ANALYSIS_FROM_LIMS", "OilAnalysisFailure", undefined, detail);

    return ok({
      total: parsed.length,
      created,
      updated,
      opinionChanged,
      skipped: errors.length,
      errors,
      sync: {
        id: `pending-${syncedAt.getTime()}`,
        syncedAt: syncedAt.toISOString(),
        syncedBy: user.name ?? user.email ?? "Không xác định",
        position: user.currentPosition ?? user.position ?? null,
        detail,
        sourceCount,
        total: parsed.length,
        created,
        updated,
        opinionChanged,
        skipped: errors.length,
      },
    });
  });
}
