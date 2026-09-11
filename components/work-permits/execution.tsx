"use client";
import { useState } from "react";
import { toast } from "sonner";
import { PermitEmployeePicker } from "@/components/work-permits/employee-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useExecuteWorkPermit } from "@/hooks/useWorkPermits";
import { CONTRACTOR_PERMIT_TRANSITIONS, PERMIT_TRANSITIONS, PERMIT_STATUSES, formatPermitNumber, type PermitRow, type PermitStatus } from "@/lib/work-permits";
import { PERMIT_EXECUTION_STATUSES } from "@/lib/work-permit-permissions";
const inputClass = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
const localTime = (value: string | null) => value ? new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0,16) : "";
export function PermitExecutionDialog({ permit, onClose }: { permit: PermitRow; onClose: () => void }) {
  const save = useExecuteWorkPermit(permit.id);
  const [status, setStatus] = useState(permit.status);
  const [authorizerName, setAuthorizer] = useState(permit.authorizerName);
  const [authorizedAt, setAuthorized] = useState(localTime(permit.authorizedAt));
  const [closedAt, setClosed] = useState(localTime(permit.closedAt));
  const [result, setResult] = useState(permit.result);
  const [reason, setReason] = useState(permit.statusReason);
  const [progress, setProgress] = useState(permit.progress == null ? "" : String(permit.progress));
  const options = [permit.status, ...(permit.teamType === "CONTRACTOR" ? CONTRACTOR_PERMIT_TRANSITIONS : PERMIT_TRANSITIONS)[permit.status].filter(s => (PERMIT_EXECUTION_STATUSES as readonly string[]).includes(s))];
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await save.mutateAsync({ version: permit.version, status, result, statusReason: reason,
        ...(progress !== "" ? { progress: Number(progress) } : {}),
        ...(permit.teamType === "INTERNAL" ? { authorizerName, authorizedAt: authorizedAt === localTime(permit.authorizedAt) ? permit.authorizedAt : authorizedAt ? `${authorizedAt}:00+07:00` : null } : {}),
        closedAt: status === "CLOSED" && closedAt ? `${closedAt}:00+07:00` : null,
      });
      toast.success("Đã cập nhật thực hiện phiếu"); onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể cập nhật phiếu"); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}><DialogContent className="max-w-xl"><DialogTitle>Thực hiện PCT {formatPermitNumber(permit)}</DialogTitle><DialogDescription>Ghi nhận cho phép làm việc, tiến độ và kết quả thực tế.</DialogDescription><form onSubmit={submit}><fieldset disabled={save.isPending} className="space-y-4">
    <label className="block space-y-1 text-sm">Trạng thái<select className={inputClass} value={status} onChange={e => setStatus(e.target.value as PermitStatus)}>{options.map(s => <option key={s} value={s}>{PERMIT_STATUSES[s]}</option>)}</select></label>
    {permit.teamType === "INTERNAL" && <><PermitEmployeePicker label="Người cho phép vào làm việc" value={authorizerName} required={status !== "ISSUED"} onChange={setAuthorizer} /><label className="block space-y-1 text-sm">Thời điểm cho phép (giờ Việt Nam)<input className={inputClass} type="datetime-local" required={status !== "ISSUED"} value={authorizedAt} onChange={e => setAuthorized(e.target.value)} /></label></>}
    {status !== "ISSUED" && <label className="block space-y-1 text-sm">Tiến độ (%)<input className={inputClass} type="number" min={0} max={100} step={1} value={progress} onChange={e => setProgress(e.target.value)} /></label>}
    {status === "PAUSED" && <label className="block space-y-1 text-sm">Lý do tạm dừng<textarea className={inputClass} required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>}
    <label className="block space-y-1 text-sm">Kết quả công việc<textarea className={inputClass} required={status === "CLOSED"} maxLength={5000} value={result} onChange={e => setResult(e.target.value)} /></label>
    {status === "CLOSED" && <label className="block space-y-1 text-sm">Thời điểm đóng phiếu (giờ Việt Nam)<input type="datetime-local" className={inputClass} required value={closedAt} onChange={e => setClosed(e.target.value)} /></label>}
    <div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={onClose}>Để sau</Button><Button type="submit">{save.isPending ? "Đang lưu…" : "Lưu thực hiện"}</Button></div>
  </fieldset></form></DialogContent></Dialog>;
}
