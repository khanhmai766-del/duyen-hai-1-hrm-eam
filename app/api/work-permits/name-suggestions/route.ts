import { prisma } from "@/lib/prisma";
import { fail, ok, requireUser } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { PERMIT_KINDS } from "@/lib/work-permits";
import { permitHandle } from "@/lib/server/work-permits";
export const dynamic = "force-dynamic";

/**
 * Gợi ý tên CHỈ HUY TRỰC TIẾP và LÃNH ĐẠO CÔNG VIỆC cho PCT NỘI BỘ, lấy từ chính các phiếu nội bộ
 * đã ghi của cùng sổ (Cơ ↔ PXSC Cơ nhiệt, Điện ↔ PXSC Điện tự động).
 *
 * Người chỉ huy/lãnh đạo phiếu nội bộ là người bên phân xưởng sửa chữa, KHÔNG phải tài khoản của web,
 * nên gợi ý theo danh sách người dùng (như trước) không trúng ai. Tên đã gõ trên phiếu vốn được lưu
 * sẵn, nên chỉ cần gom lại — không cần bảng danh bạ riêng. Tên dùng gần nhất đứng đầu; hai cách gõ
 * chỉ khác hoa/thường hoặc dấu cách thì gộp làm một (giữ cách gõ mới nhất).
 */
export async function GET(req: Request) {
  return permitHandle(async () => {
    await requireUser();
    const kind = new URL(req.url).searchParams.get("kind") ?? "";
    if (!Object.hasOwn(PERMIT_KINDS, kind)) return fail("Loại PCT không hợp lệ");
    const rows = await prisma.$queryRaw<Array<{ field: "commander" | "leader"; name: string }>>`
      SELECT field, name FROM (
        SELECT 'commander' AS field, btrim("commanderName") AS name, "createdAt" AS used_at FROM "WorkPermit"
          WHERE "kind" = ${kind} AND "teamType" = 'INTERNAL' AND "status" <> 'DRAFT' AND btrim("commanderName") <> ''
        UNION ALL
        SELECT 'leader', btrim("leaderName"), "createdAt" FROM "WorkPermit"
          WHERE "kind" = ${kind} AND "teamType" = 'INTERNAL' AND "status" <> 'DRAFT' AND btrim("leaderName") <> ''
      ) used
      GROUP BY field, name
      ORDER BY max(used_at) DESC
      LIMIT 1000`;
    const pick = (field: "commander" | "leader") => {
      const seen = new Set<string>();
      return rows.filter(row => row.field === field).map(row => row.name.replace(/\s+/g, " ")).filter(name => {
        const key = normalizeText(name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 200);
    };
    return ok({ commanders: pick("commander"), leaders: pick("leader") });
  });
}
