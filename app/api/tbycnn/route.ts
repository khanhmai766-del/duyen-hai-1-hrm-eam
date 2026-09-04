import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { computeDefaultKdTiepTheo, parseVNDate, validateSoLuong } from "@/lib/tbycnn";
import {
  assertTbycnnScope,
  identityData,
  operationalData,
  resolvePeriod,
  serializeEquipment,
  TBYCNN_ORDER_BY,
  TBYCNN_PERMISSION,
  TBYCNN_READ_LEVELS,
  resolveTbycnnWriteScope,
  tbycnnWriteScopeOf,
  resolveTbycnnViewScope,
  tbycnnScopeMeta,
  scopeWhere,
} from "@/lib/tbycnn-service";
import { ensureTbycnnRollover } from "@/lib/tbycnn-rollover";

export const dynamic = "force-dynamic";

/**
 * GET /api/tbycnn?period=YYYY-MM
 *
 * Trả TOÀN BỘ thiết bị của kỳ trong một lượt (709 dòng ≈ vài trăm KB) rồi để giao diện
 * lọc/nhóm tại chỗ — giống bản cũ và giữ được trải nghiệm đổi bộ lọc không chờ mạng.
 * Danh sách cương vị/danh mục dựng luôn từ dữ liệu trả về nên client không phải gọi thêm.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      TBYCNN_PERMISSION.view,
      [...TBYCNN_READ_LEVELS],
      "Không đủ quyền xem sổ thiết bị yêu cầu nghiêm ngặt"
    );

    // Sang kỳ đúng hạn kể cả khi bộ hẹn giờ chết: lượt tải trang đầu tiên của tháng mới
    // tự chốt kỳ cũ và sinh kỳ mới. Lỗi ở đây KHÔNG được chặn việc xem sổ.
    await ensureTbycnnRollover().catch((e) => console.error("[tbycnn] tự động chuyển kỳ lỗi:", e));

    const period = await resolvePeriod(req.nextUrl.searchParams.get("period"));
    // Sổ chỉ hiện thiết bị thuộc cương vị quản lý của người đang xem — lọc NGAY TRONG
    // truy vấn như PCCC, không trả hết rồi để giao diện ẩn bớt: các thẻ thống kê và
    // tiêu đề "N thiết bị của M cương vị" đều đếm từ danh sách trả về, nên lọc ở server
    // là chỗ duy nhất khiến mọi con số cùng nói một phạm vi.
    const viewScope = await resolveTbycnnViewScope(user);
    const [rows, periods, writeScope] = await Promise.all([
      prisma.tbycnnEquipment.findMany({
        where: { periodId: period.id, ...scopeWhere(viewScope) },
        orderBy: TBYCNN_ORDER_BY,
        include: { signature: true },
      }),
      prisma.tbycnnPeriod.findMany({
        orderBy: [{ year: "desc" }, { monthNo: "desc" }],
        select: { label: true, isClosed: true, closedAt: true },
      }),
      tbycnnWriteScopeOf(user),
    ]);

    const now = new Date();
    const scope = { all: writeScope.all, codes: writeScope.codes as never[] };
    return ok(
      rows.map((row) => serializeEquipment(row, now, scope)),
      {
        period: { label: period.label, isClosed: period.isClosed, closedAt: period.closedAt },
        periods,
        // Có quyền ghi hay không, và ghi được cương vị nào — giao diện dùng để hiện menu
        // "Chỉnh sửa" và khoá sẵn ô ngoài phạm vi.
        canManage: writeScope.all || writeScope.codes.length > 0,
        writeScope,
        // Giao diện hiện nhãn "Phạm vi xem: …" để người dùng biết vì sao bảng ít dòng.
        viewScope: tbycnnScopeMeta(viewScope),
      }
    );
  });
}

/**
 * POST /api/tbycnn — thêm thiết bị vào kỳ đang mở.
 *
 * Thiết bị thêm qua đây có `sourceId = null`, nhờ đó phân biệt được với thiết bị gốc
 * theo hồ sơ nhà máy: chỉ dòng tự thêm mới xoá được (và chỉ trong 30 ngày).
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolveTbycnnWriteScope(user);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const period = await resolvePeriod(body.period as string | undefined);
    if (period.isClosed) throw fail(`Kỳ ${period.label} đã chốt sổ, không thêm được thiết bị`, 409);

    const identity = identityData(body);
    if (!identity.khuVuc) throw fail("Thiếu cương vị quản lý", 400);
    // Thêm thiết bị cũng phải nằm trong phạm vi cương vị của người thêm.
    assertTbycnnScope(scope, identity);
    if (!identity.tenThietBi) throw fail("Thiếu tên thiết bị", 400);
    if (!identity.nhom) throw fail("Thiếu danh mục thiết bị", 400);

    const operational = operationalData(body);
    const error = validateSoLuong(
      identity.soLuong,
      operational.soLuongKhaDung ?? null,
      operational.soLuongKhongKhaDung ?? null
    );
    if (error) throw fail(error, 400);

    // Bỏ trống "KĐ tiếp theo" thì tự tính = KĐ gần nhất + chu kỳ thử (mục 6.4 bản cũ).
    if (!operational.kdTiepTheoText) {
      const auto = computeDefaultKdTiepTheo(
        parseVNDate(operational.kdGanNhatText),
        operational.chuKyThu ?? null
      );
      if (auto) {
        operational.kdTiepTheo = auto;
        operational.kdTiepTheoText = null;
      }
    }

    const created = await prisma.tbycnnEquipment.create({
      data: { periodId: period.id, sourceId: null, ...identity, ...operational },
    });

    await audit(
      user.id,
      "CREATE_TBYCNN",
      "TbycnnEquipment",
      created.id,
      auditDetailWithPosition(user, `Thêm thiết bị "${created.tenThietBi}" (${created.khuVuc}) kỳ ${period.label}`)
    );

    return ok(serializeEquipment(created));
  });
}
