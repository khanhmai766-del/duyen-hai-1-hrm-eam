import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { bbktFormOf, bbktToolTabOf, BBKT_MAX_MEMBERS, type BbktMember } from "@/lib/tbycnn-bbkt";
import { buildBbktDocx, demSoDat, DOCX_MIME } from "@/lib/tbycnn-bbkt-doc";
import {
  resolvePeriod,
  TBYCNN_ORDER_BY,
  TBYCNN_PERMISSION,
  TBYCNN_READ_LEVELS,
  resolveTbycnnViewScope,
  scopeWhere,
} from "@/lib/tbycnn-service";

// docxtemplater + pizzip cần Node runtime (không chạy trên Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tbycnn/export-bbkt  → tệp .docx
 *
 * BIÊN BẢN KIỂM TRA ĐỊNH KỲ dụng cụ ATLĐ. Dùng POST chứ không phải GET như hai nút xuất
 * kia: biên bản mang theo cả danh sách thành phần kiểm tra, nhét vào query string thì vừa
 * dài vừa khó đọc trong nhật ký máy chủ.
 *
 * Bảng phụ lục dựng LẠI từ sổ ở mỗi lượt xuất, nên sửa số liệu trên web rồi xuất lại là
 * biên bản khớp ngay.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      TBYCNN_PERMISSION.view,
      [...TBYCNN_READ_LEVELS],
      "Không đủ quyền xem sổ thiết bị yêu cầu nghiêm ngặt"
    );

    const body = await req.json();
    const form = bbktFormOf(String(body.bang ?? ""));
    if (!form) return fail("Không có biểu mẫu biên bản cho bảng này");
    const tab = bbktToolTabOf(form);

    const period = await resolvePeriod(typeof body.period === "string" ? body.period : null);

    // Cùng lý do như hai nút xuất kia: nút xuất không được là cửa sau vượt phạm vi xem.
    const viewScope = await resolveTbycnnViewScope(user);
    const rows = await prisma.tbycnnEquipment.findMany({
      where: { periodId: period.id, ...scopeWhere(viewScope), danhMuc: tab.danhMuc },
      orderBy: TBYCNN_ORDER_BY,
    });
    if (!rows.length) return fail(`Kỳ ${period.label} chưa có thiết bị nào trong bảng ${tab.label}`, 404);

    const thanhPhan: BbktMember[] = Array.isArray(body.thanhPhan)
      ? (body.thanhPhan as unknown[])
          .slice(0, BBKT_MAX_MEMBERS)
          .map((item) => {
            const m = (item ?? {}) as Record<string, unknown>;
            return { ten: String(m.ten ?? "").trim(), chucDanh: String(m.chucDanh ?? "").trim() };
          })
          .filter((m) => m.ten || m.chucDanh)
      : form.macDinh.thanhPhan;

    const buffer = buildBbktDocx({
      form,
      rows,
      ngayBanHanh: typeof body.ngayBanHanh === "string" ? body.ngayBanHanh : null,
      gio: String(body.gio ?? form.macDinh.gio),
      ngayKiemTra: typeof body.ngayKiemTra === "string" ? body.ngayKiemTra : null,
      diaDiem: String(body.diaDiem ?? form.macDinh.diaDiem),
      thanhPhan: thanhPhan.length ? thanhPhan : form.macDinh.thanhPhan,
    });

    await audit(
      user.id,
      "EXPORT_TBYCNN_BBKT",
      "TbycnnPeriod",
      period.id,
      auditDetailWithPosition(
        user,
        `Xuất ${form.label} kỳ ${period.label} (${rows.length} thiết bị, ${demSoDat(rows)} đạt)`
      )
    );

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": `attachment; filename="${form.fileBase}-${period.label}.docx"`,
      },
    });
  });
}
