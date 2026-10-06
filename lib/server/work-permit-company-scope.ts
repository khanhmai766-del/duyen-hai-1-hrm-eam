import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { companyAllowsScope, companyScopeLabel, PERMIT_CONTRACTOR_SCOPES, type PermitContractorScope } from "@/lib/work-permits";

/**
 * Chặn cấp PCT nhà thầu cho đơn vị đã phân loại KHÁC nhóm phiếu (nghiệp vụ 06/10/2026), ví dụ đơn vị chỉ Đại tu mà cấp
 * phiếu SCTX. Đơn vị chưa phân loại, hoặc chỉ có trên hồ sơ nhân sự (chưa có dòng danh bạ đơn vị) → không chặn.
 * Khi sửa phiếu chỉ kiểm khi đổi đơn vị / nhóm phiếu (`before`), để phân loại về sau không khoá phiếu cũ.
 */
export async function assertContractorCompanyScope(
  tx: Prisma.TransactionClient,
  data: { teamType: string; contractorScope: string | null; teamName: string },
  before?: { teamType: string; contractorScope: string | null; teamName: string },
) {
  const company = data.teamName.trim();
  if (data.teamType !== "CONTRACTOR" || !company || !data.contractorScope) return;
  if (before && before.teamType === data.teamType && before.contractorScope === data.contractorScope && before.teamName.trim() === company) return;
  const row = await tx.workPermitCompany.findUnique({ where: { name: company }, select: { sctx: true, overhaul: true } });
  if (companyAllowsScope(row, data.contractorScope)) return;
  const scope = PERMIT_CONTRACTOR_SCOPES[data.contractorScope as PermitContractorScope] ?? data.contractorScope;
  throw fail(`Đơn vị “${company}” được phân loại ${companyScopeLabel(row!)} — không cấp được PCT nhà thầu nhóm ${scope}. Chọn đơn vị khác hoặc sửa phân loại trong danh bạ đơn vị nhà thầu.`, 400);
}
