"use client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorkPermit } from "@/hooks/useWorkPermits";
import { effectivePermitFormat, formatPermitNumber } from "@/lib/work-permits";
import { NkvhLinkPanel } from "./nkvh-link-panel";

export function NkvhLinkDialog({ permitId, number, onClose }: { permitId: string; number: string; onClose: () => void }) {
  const query = useWorkPermit(permitId);
  const permit = query.data?.data;
  const canEdit = !!(query.data?.meta?.canIssue || query.data?.meta?.canExecute);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-lg">
      <DialogTitle>Liên kết NKVH — {permit ? formatPermitNumber(permit) : number}</DialogTitle>
      <DialogDescription>Gắn hoặc thay link cho riêng PCT này. Không thay đổi SYC hay thông tin cấp phiếu.</DialogDescription>
      {query.isError ? <div role="alert" className="space-y-2 text-sm text-red-700"><p>{query.error.message}</p><Button type="button" variant="outline" onClick={() => query.refetch()}>Thử lại</Button></div>
        : !permit ? <p role="status" className="text-sm text-muted-foreground">Đang tải PCT…</p>
        : effectivePermitFormat(permit) !== "ELECTRONIC" ? <p className="text-sm text-muted-foreground">PCT này là phiếu giấy, không gắn liên kết NKVH.</p>
        : <><p className="line-clamp-3 text-sm text-muted-foreground">{permit.content}</p><NkvhLinkPanel key={`${permit.id}-${permit.version}`} permit={permit} canEdit={canEdit} />{["CLOSED", "CANCELLED"].includes(permit.status) && <p className="text-xs text-muted-foreground">Phiếu đã đóng hoặc hủy, không thể thay đổi liên kết.</p>}</>}
    </DialogContent>
  </Dialog>;
}
