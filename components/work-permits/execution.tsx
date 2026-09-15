"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useExecuteWorkPermit } from "@/hooks/useWorkPermits";
import { CONTRACTOR_PERMIT_TRANSITIONS, PERMIT_STATUSES, formatPermitNumber, type PermitRow, type PermitStatus } from "@/lib/work-permits";
import { PERMIT_EXECUTION_STATUSES } from "@/lib/work-permit-permissions";
const inputClass = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
const localTime = (value: string | null) => value ? new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0,16) : "";
const vnNow = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
export function PermitExecutionDialog({ permit, onClose }: { permit: PermitRow; onClose: () => void }) {
  const save = useExecuteWorkPermit(permit.id);
  const internal = permit.teamType === "INTERNAL";
  const [status, setStatus] = useState<PermitStatus>(internal ? "CLOSED" : permit.status);
  const [closedAt, setClosed] = useState(() => localTime(permit.closedAt) || vnNow());
  const [result, setResult] = useState(permit.result);
  const [reason, setReason] = useState(permit.statusReason);
  const [progress, setProgress] = useState(permit.progress == null ? "" : String(permit.progress));
  const options: PermitStatus[] = internal ? ["CLOSED"] : [permit.status, ...CONTRACTOR_PERMIT_TRANSITIONS[permit.status].filter(s => (PERMIT_EXECUTION_STATUSES as readonly string[]).includes(s))];
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await save.mutateAsync(internal ? { version: permit.version, status: "CLOSED", result, closedAt: closedAt ? `${closedAt}:00+07:00` : null } : { version: permit.version, status, result, statusReason: reason,
        ...(progress !== "" ? { progress: Number(progress) } : {}),
        closedAt: status === "CLOSED" && closedAt ? `${closedAt}:00+07:00` : null,
      });
      toast.success(internal ? "Đã ghi nhận đóng phiếu trong sổ" : "Đã cập nhật thực hiện phiếu"); onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể cập nhật phiếu"); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}><DialogContent className="max-w-xl"><DialogTitle>{internal ? "Ghi nhận đóng PCT" : "Thực hiện PCT"} {formatPermitNumber(permit)}</DialogTitle><DialogDescription>{internal ? "Ghi nhận trạng thái trong sổ, không thực hiện thủ tục đóng trên NKVH." : "Ghi nhận cho phép làm việc, tiến độ và kết quả thực tế."}</DialogDescription><form onSubmit={submit}><fieldset disabled={save.isPending} className="space-y-4">
    <label className="block space-y-1 text-sm">Trạng thái<select className={inputClass} value={status} onChange={e => setStatus(e.target.value as PermitStatus)}>{options.map(s => <option key={s} value={s}>{PERMIT_STATUSES[s]}</option>)}</select></label>
    {internal && <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-950">Chỉ ghi nhận đóng PCT nội bộ trong sổ. Không yêu cầu bước cho phép và không tác động phiếu trên NKVH hoặc phiếu giấy. Nếu có SYC đã xử lý đủ 24 giờ, hệ thống tự đóng.</p>}
    {!internal && status !== "ISSUED" && <label className="block space-y-1 text-sm">Tiến độ (%)<input className={inputClass} type="number" min={0} max={100} step={1} value={progress} onChange={e => setProgress(e.target.value)} /></label>}
    {status === "PAUSED" && <label className="block space-y-1 text-sm">Lý do tạm dừng<textarea className={inputClass} required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>}
    <label className="block space-y-1 text-sm">{internal ? "Ghi nhận kết quả (không bắt buộc)" : "Kết quả công việc"}<textarea className={inputClass} required={!internal && status === "CLOSED"} maxLength={5000} value={result} onChange={e => setResult(e.target.value)} /></label>
    {status === "CLOSED" && <label className="block space-y-1 text-sm">Thời điểm đóng phiếu (giờ Việt Nam)<input type="datetime-local" className={inputClass} required value={closedAt} onChange={e => setClosed(e.target.value)} /></label>}
    <div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={onClose}>Để sau</Button><Button type="submit">{save.isPending ? "Đang lưu…" : "Lưu thực hiện"}</Button></div>
  </fieldset></form></DialogContent></Dialog>;
}
