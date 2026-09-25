import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { permitCapabilities, requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { permitBody, permitHandle, permitText } from "@/lib/server/work-permits";
export const dynamic = "force-dynamic";

/*
 * Đơn vị nhà thầu có HAI nguồn: bảng `WorkPermitCompany` (giữ đơn vị vừa tạo, chưa có người) và
 * chữ `company` trên hồ sơ người (dữ liệu cũ, và người được thêm với tên đơn vị gõ tay). Mọi chỗ
 * đọc danh sách đều lấy HỢP của hai nguồn, nên không cần đồng bộ ngược hai chiều.
 */
const COMPANY_NAMES = `SELECT "name" AS company FROM "WorkPermitCompany"
  UNION SELECT "company" FROM "WorkPermitPerson" WHERE btrim("company") <> ''`;

async function companyExists(name: string) {
  const [company, person] = await Promise.all([
    prisma.workPermitCompany.count({ where: { name } }),
    prisma.workPermitPerson.count({ where: { company: name } }),
  ]);
  return company + person > 0;
}

/** Mã đơn vị (tên gọi tắt): tuỳ chọn, chữ hoa, không khoảng trắng thừa. `undefined` = không gửi. */
function companyCode(body: Record<string, unknown>) {
  if (body.code === undefined) return undefined;
  const code = permitText(body, "code", 30).normalize("NFC").toUpperCase().replace(/\s+/g, " ");
  if (code && !/^[\p{L}\p{N}][\p{L}\p{N} ._&/-]*$/u.test(code)) throw fail("Mã đơn vị chỉ gồm chữ, số và các dấu . _ & / -");
  return code;
}
async function assertCodeFree(code: string | undefined, exceptNames: string[]) {
  if (!code) return;
  const taken = await prisma.workPermitCompany.findFirst({ where: { code: { equals: code, mode: "insensitive" }, name: { notIn: exceptNames } }, select: { name: true } });
  if (taken) throw fail(`Mã "${code}" đã dùng cho đơn vị "${taken.name}"`, 409);
}

export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser();
    // `summary=1`: bảng đơn vị nhà thầu (mỗi dòng kèm sĩ số và số CHTT). Đếm ngay trong SQL vì
    // danh bạ có thể vài nghìn người — kéo hết về rồi đếm ở Node là phí một vòng dữ liệu.
    if (new URL(req.url).searchParams.get("summary") === "1") {
      const rows = await prisma.$queryRawUnsafe<Array<{ company: string; code: string; total: bigint; commanders: bigint; active: bigint }>>(`
        SELECT c.company, COALESCE(MAX(w."code"), '') AS code, COUNT(p.id) AS total,
               COUNT(p.id) FILTER (WHERE p."canCommand") AS commanders,
               COUNT(p.id) FILTER (WHERE p."isActive") AS active
        FROM (${COMPANY_NAMES}) c
        LEFT JOIN "WorkPermitCompany" w ON w."name" = c.company
        LEFT JOIN "WorkPermitPerson" p ON p."company" = c.company
        GROUP BY c.company ORDER BY c.company`);
      return ok(rows.map(row => ({ company: row.company, code: row.code, total: Number(row.total), commanders: Number(row.commanders), active: Number(row.active) })), { canWrite: (await permitCapabilities(user)).canIssue });
    }
    // Lấy từ toàn bộ danh bạ, không giới hạn bởi trang nhân sự hoặc vai trò CHTT.
    const rows = await prisma.$queryRawUnsafe<Array<{ company: string }>>(`SELECT company FROM (${COMPANY_NAMES}) c ORDER BY company`);
    return ok(rows.map(row => row.company).filter(name => name.trim()));
  });
}

/** Thêm một đơn vị nhà thầu (chưa cần có nhân sự). */
export async function POST(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const body = await permitBody(req);
    const name = permitText(body, "name"), code = companyCode(body) ?? "";
    if (!name) return fail("Vui lòng nhập tên đơn vị nhà thầu");
    if (await companyExists(name)) return fail(`Đơn vị "${name}" đã có trong danh sách`, 409);
    await assertCodeFree(code, []);
    const row = await prisma.workPermitCompany.create({ data: { name, code } });
    await audit(user.id, "CREATE_WORK_PERMIT_COMPANY", "WorkPermitCompany", row.id, `Thêm đơn vị nhà thầu "${name}"${code ? ` (mã ${code})` : ""}`);
    return ok(row);
  });
}

/**
 * Đổi tên một ĐƠN VỊ nhà thầu: đổi dòng trong bảng đơn vị và `company` của mọi hồ sơ nhân sự
 * đang mang tên cũ. Đổi sang tên đã tồn tại thì hai đơn vị GỘP làm một, đó là cách duy nhất để
 * dọn các bản ghi gõ sai chính tả.
 *
 * PCT và lần làm việc đã ghi KHÔNG bị sửa: chúng lưu bản chụp tên đơn vị tại thời điểm thực
 * hiện, cùng quy ước với `teamName` trên phiếu.
 */
export async function PUT(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const body = await permitBody(req);
    const from = permitText(body, "from"), to = permitText(body, "to"), code = companyCode(body);
    if (!from || !to) return fail("Vui lòng nhập tên đơn vị cũ và tên mới");
    if (from === to && code === undefined) return fail("Tên đơn vị mới trùng với tên hiện tại");
    if (!(await companyExists(from))) return fail("Không tìm thấy đơn vị nhà thầu này", 404);
    await assertCodeFree(code, [from, to]);
    // Chỉ đổi mã: đơn vị có thể chưa có dòng trong bảng (tên chỉ nằm trên hồ sơ người) nên upsert.
    if (from === to) {
      await prisma.workPermitCompany.upsert({ where: { name: from }, update: { code }, create: { name: from, code } });
      await audit(user.id, "UPDATE_WORK_PERMIT_COMPANY", "WorkPermitCompany", undefined, `Đổi mã đơn vị nhà thầu "${from}" thành "${code || "(trống)"}"`);
      return ok({ from, to, updated: 0, merged: false });
    }
    const merged = await companyExists(to);
    const updated = await prisma.$transaction(async tx => {
      // Bảng đơn vị: tên đích đã có thì bỏ dòng nguồn (gộp), chưa có thì đổi tên / tạo mới.
      const target = await tx.workPermitCompany.findUnique({ where: { name: to } });
      if (target) await tx.workPermitCompany.deleteMany({ where: { name: from } });
      else {
        const source = await tx.workPermitCompany.findUnique({ where: { name: from } });
        if (source) await tx.workPermitCompany.update({ where: { id: source.id }, data: { name: to } });
        else await tx.workPermitCompany.create({ data: { name: to } });
      }
      if (code !== undefined) await tx.workPermitCompany.update({ where: { name: to }, data: { code } });
      const result = await tx.workPermitPerson.updateMany({ where: { company: from }, data: { company: to } });
      // searchText có chứa tên đơn vị nên phải dựng lại, nếu không tìm theo tên mới sẽ không ra.
      const rows = await tx.workPermitPerson.findMany({ where: { company: to }, select: { id: true, code: true, name: true, company: true, phone: true } });
      for (const row of rows) {
        await tx.workPermitPerson.update({ where: { id: row.id }, data: { searchText: normalizeText([row.code, row.name, row.company, row.phone].join(" ")) } });
      }
      return result.count;
    });
    await audit(user.id, "RENAME_WORK_PERMIT_COMPANY", "WorkPermitCompany", undefined, `Đổi đơn vị nhà thầu "${from}" → "${to}" (${updated} hồ sơ)`);
    return ok({ from, to, updated, merged });
  });
}

/** Xoá một đơn vị CHƯA có nhân sự (tạo nhầm). Đơn vị còn người thì phải xoá/chuyển người trước. */
export async function DELETE(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const name = (new URL(req.url).searchParams.get("name") ?? "").trim();
    if (!name) return fail("Thiếu tên đơn vị cần xoá");
    const people = await prisma.workPermitPerson.count({ where: { company: name } });
    if (people) return fail(`Đơn vị "${name}" còn ${people} nhân sự — xoá hoặc chuyển nhân sự sang đơn vị khác trước.`, 409);
    const removed = await prisma.workPermitCompany.deleteMany({ where: { name } });
    if (!removed.count) return fail("Không tìm thấy đơn vị nhà thầu này", 404);
    await audit(user.id, "DELETE_WORK_PERMIT_COMPANY", "WorkPermitCompany", undefined, `Xoá đơn vị nhà thầu "${name}"`);
    return ok({ name });
  });
}
