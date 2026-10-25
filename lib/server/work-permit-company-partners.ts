import type { Prisma, PrismaClient } from "@prisma/client";
import { permitAllianceCodes } from "@/lib/work-permits";
import { overhaulItemsOf } from "@/lib/work-permit-overhaul";
import { normalizeText } from "@/lib/nav";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Tên các đơn vị được nhận trên một PCT: chính các đơn vị `names` cộng mọi đơn vị cùng liên danh
 * (PERMIT_COMPANY_ALLIANCES, khớp theo mã đơn vị). Đơn vị không thuộc liên danh → trả lại đúng `names`.
 * Có `permitId` thì kèm các nhà thầu làm chung hạng mục đại tu trên phiếu (permitJointCompanies).
 */
export async function permitPartnerCompanies(db: Db, names: string[], permitId?: string) {
  const list = [...new Set(names.map(name => name.trim()).filter(Boolean))];
  const joint = permitId ? await permitJointCompanies(db, permitId) : [];
  if (!list.length) return joint;
  const rows = await db.workPermitCompany.findMany({ where: { OR: list.map(name => ({ name: { equals: name, mode: "insensitive" as const } })) }, select: { code: true } });
  const codes = [...new Set(rows.flatMap(row => permitAllianceCodes(row.code)))];
  if (!codes.length) return [...new Set([...list, ...joint])];
  const partners = await db.workPermitCompany.findMany({ where: { OR: codes.map(code => ({ code: { equals: code, mode: "insensitive" as const } })) }, select: { name: true } });
  return [...new Set([...list, ...partners.map(row => row.name), ...joint])];
}

/**
 * Hạng mục đại tu đánh dấu làm chung (WorkPermitOverhaulItem.sharedJointWork, vd 7.6.1.2 / 7.6.1.3 của IDC mở cho
 * Sinh Lộc): phiếu có hạng mục đó nhận nhân sự của nhà thầu gốc và mọi nhà thầu được mở thêm. Trả tên đơn vị.
 */
async function permitJointCompanies(db: Db, permitId: string) {
  const permit = await db.workPermit.findUnique({ where: { id: permitId }, select: { overhaulItems: true } });
  const items = overhaulItemsOf(permit?.overhaulItems);
  if (!items.length) return [];
  const rows = await db.workPermitOverhaulItem.findMany({
    where: { sharedJointWork: true, OR: items.map(item => ({ source: item.source, sheet: item.sheet, code: item.code })) },
    select: { contractorCode: true, sharedContractorCodes: true },
  });
  const codes = new Set(rows.flatMap(row => [row.contractorCode, ...row.sharedContractorCodes]).filter(Boolean));
  if (!codes.size) return [];
  const companies = await db.workPermitCompany.findMany({ where: { code: { not: "" } }, select: { name: true, code: true } });
  return companies.filter(company => codes.has(normalizeText(company.code))).map(company => company.name);
}
