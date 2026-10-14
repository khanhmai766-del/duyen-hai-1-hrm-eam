import { CONTRACTOR_SCOPE_TONE, PERMIT_CONTRACTOR_SCOPES, type PermitContractorScope } from "@/lib/work-permits";
import { cn } from "@/lib/utils";


/**
 * Nhãn nhóm nhân sự (SCTX / Đại tu / Đầu tư; màu ở CONTRACTOR_SCOPE_TONE) khi quét thẻ trong hộp quét của PCT — để người cho phép nhìn là biết,
 * không phải đọc dòng chữ nhỏ. `large`: cỡ chữ to hơn khi cần.
 */
export function PersonScopeBadge({ scope, large = false, className }: { scope?: string | null; large?: boolean; className?: string }) {
  const known = scope && Object.hasOwn(PERMIT_CONTRACTOR_SCOPES, scope) ? scope as PermitContractorScope : null;
  const label = known ? `Nhân sự ${PERMIT_CONTRACTOR_SCOPES[known]}` : "Chưa phân nhóm";
  return <span className={cn("inline-flex items-center rounded-md font-bold uppercase tracking-wide",
    large ? "px-3 py-1.5 text-sm" : "px-1.5 py-0.5 text-[11px]", known ? CONTRACTOR_SCOPE_TONE[known].solid : "bg-slate-200 text-slate-700", className)}>{label}</span>;
}
