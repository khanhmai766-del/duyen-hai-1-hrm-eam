import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { permitCapabilities, requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { permitBody, permitHandle, permitText } from "@/lib/server/work-permits";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return permitHandle(async () => {
    await requireUser();
    // `summary=1`: bảng đơn vị nhà thầu (mỗi dòng kèm sĩ số và số CHTT). Đếm ngay trong SQL vì
    // danh bạ có thể vài nghìn người — kéo hết về rồi đếm ở Node là phí một vòng dữ liệu.
    if (new URL(req.url).searchParams.get("summary") === "1") {
      const rows = await prisma.$queryRaw<Array<{ company: string; total: bigint; commanders: bigint; active: bigint }>>`
        SELECT "company", COUNT(*) AS total,
               COUNT(*) FILTER (WHERE "canCommand") AS commanders,
               COUNT(*) FILTER (WHERE "isActive") AS active
        FROM "WorkPermitPerson" WHERE btrim("company") <> '' GROUP BY "company" ORDER BY "company"`;
      return ok(rows.map(row => ({ company: row.company, total: Number(row.total), commanders: Number(row.commanders), active: Number(row.active) })), { canWrite: (await permitCapabilities(await requireUser())).canIssue });
    }
    // Lấy từ toàn bộ danh bạ, không giới hạn bởi trang nhân sự hoặc vai trò CHTT.
    const rows = await prisma.$queryRaw<Array<{ company: string }>>`SELECT DISTINCT "company" FROM "WorkPermitPerson" WHERE btrim("company") <> '' ORDER BY "company"`;
    return ok(rows.map(row => row.company).filter(name => name.trim()));
  });
}

/**
 * Đổi tên một ĐƠN VỊ nhà thầu: cập nhật `company` của mọi hồ sơ nhân sự đang mang tên cũ.
 *
 * Đơn vị không phải một bảng riêng — nó là chữ tự do trên từng hồ sơ người, nên "sửa đơn vị"
 * chính là sửa hàng loạt. Đổi sang tên đã tồn tại thì hai đơn vị GỘP làm một, đó là cách duy
 * nhất để dọn các bản ghi gõ sai chính tả.
 *
 * PCT và lần làm việc đã ghi KHÔNG bị sửa: chúng lưu bản chụp tên đơn vị tại thời điểm thực
 * hiện, cùng quy ước với `teamName` trên phiếu.
 */
export async function PUT(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const body = await permitBody(req);
    const from = permitText(body, "from"), to = permitText(body, "to");
    if (!from || !to) return fail("Vui lòng nhập tên đơn vị cũ và tên mới");
    if (from === to) return fail("Tên đơn vị mới trùng với tên hiện tại");
    const existing = await prisma.workPermitPerson.count({ where: { company: from } });
    if (!existing) return fail("Không tìm thấy đơn vị nhà thầu này", 404);
    const merged = await prisma.workPermitPerson.count({ where: { company: to } });
    const updated = await prisma.workPermitPerson.updateMany({ where: { company: from }, data: { company: to } });
    // searchText có chứa tên đơn vị nên phải dựng lại, nếu không tìm theo tên mới sẽ không ra.
    const rows = await prisma.workPermitPerson.findMany({ where: { company: to }, select: { id: true, code: true, name: true, company: true, phone: true } });
    await prisma.$transaction(rows.map(row => prisma.workPermitPerson.update({
      where: { id: row.id },
      data: { searchText: normalizeText([row.code, row.name, row.company, row.phone].join(" ")) },
    })));
    await audit(user.id, "RENAME_WORK_PERMIT_COMPANY", "WorkPermitPerson", undefined, `Đổi đơn vị nhà thầu "${from}" → "${to}" (${updated.count} hồ sơ)`);
    return ok({ from, to, updated: updated.count, merged });
  });
}
