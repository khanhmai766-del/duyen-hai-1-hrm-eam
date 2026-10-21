import type { Prisma, PrismaClient } from "@prisma/client";
import { permitAllianceCodes } from "@/lib/work-permits";

/**
 * Tên các đơn vị được nhận trên một PCT: chính các đơn vị `names` cộng mọi đơn vị cùng liên danh
 * (PERMIT_COMPANY_ALLIANCES, khớp theo mã đơn vị). Đơn vị không thuộc liên danh → trả lại đúng `names`.
 */
export async function permitPartnerCompanies(db: PrismaClient | Prisma.TransactionClient, names: string[]) {
  const list = [...new Set(names.map(name => name.trim()).filter(Boolean))];
  if (!list.length) return [];
  const rows = await db.workPermitCompany.findMany({ where: { OR: list.map(name => ({ name: { equals: name, mode: "insensitive" as const } })) }, select: { code: true } });
  const codes = [...new Set(rows.flatMap(row => permitAllianceCodes(row.code)))];
  if (!codes.length) return list;
  const partners = await db.workPermitCompany.findMany({ where: { OR: codes.map(code => ({ code: { equals: code, mode: "insensitive" as const } })) }, select: { name: true } });
  return [...new Set([...list, ...partners.map(row => row.name)])];
}
