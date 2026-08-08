import type { NextRequest } from "next/server";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { PCCC_PERMISSION } from "@/lib/pccc-service";
import {
  PCCC_ARCHIVE_LIST_MONTHS,
  archiveFileNameOf,
  isPeriodLabel,
  listPcccArchives,
  readPcccArchive,
} from "@/lib/pccc-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pccc/archive            → danh sách bản lưu trữ (12 tháng gần nhất)
 * GET /api/pccc/archive?label=…    → tải đúng file Excel của tháng đó
 *
 * Nguồn là S3, KHÔNG phải DB: DB chỉ giữ 6 kỳ gần nhất, mà đây chính là chỗ người dùng
 * tra lại tháng đã bị dọn khỏi DB. File được truyền qua server thay vì đưa link ký sẵn
 * để bucket không phải mở ra ngoài và mỗi lượt tải đều vào được nhật ký.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const label = req.nextUrl.searchParams.get("label");
    if (!label) {
      const items = await listPcccArchives();
      return ok(items, { months: PCCC_ARCHIVE_LIST_MONTHS });
    }

    if (!isPeriodLabel(label)) return fail("Nhãn kỳ không hợp lệ");
    const buffer = await readPcccArchive(label).catch(() => null);
    if (!buffer) return fail(`Chưa có bản lưu trữ của kỳ ${label}`, 404);

    await audit(
      user.id,
      "DOWNLOAD_PCCC_ARCHIVE",
      "PcccPeriod",
      label,
      auditDetailWithPosition(user, `Tải bản lưu trữ ${label} từ S3`)
    );

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${archiveFileNameOf(label)}"`,
      },
    });
  });
}
