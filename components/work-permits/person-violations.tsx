"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usePermitViolationPerson, useRecordPermitPersonViolation, type PermitViolationContext } from "@/hooks/useWorkPermits";
import type { PermitMember, PermitPerson } from "@/lib/work-permits";

export function PersonViolations({ person }: { person: Pick<PermitPerson, "violations"> }) {
  const violations = person.violations ?? [];
  if (!violations.length) return null;
  return <div className="mt-1 min-w-0 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-900">
    <p className="font-bold">Đã vi phạm {violations.length} lần · Cần chú ý đặc biệt</p>
    <ul className="mt-1 space-y-1">{violations.map((violation, index) => <li key={violation.id} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      <span className="font-semibold">{index + 1}.</span> {violation.description}
      <span className="block text-[11px] text-red-800">{violation.permitNumber && <span className="font-medium">PCT {violation.permitNumber} · </span>}{new Date(violation.recordedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · {violation.recordedByName}</span>
    </li>)}</ul>
  </div>;
}

export function RecordPersonViolation(props: { person: PermitPerson; member?: never; context?: never } | { member: PermitMember; context: PermitViolationContext; person?: never }) {
  const snapshot = props.person ?? props.member;
  const id = props.person?.id ?? props.member?.personId ?? "";
  const context = props.context;
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const save = useRecordPermitPersonViolation();
  const query = usePermitViolationPerson(id, open, context);
  const person = query.data?.data;
  return <>
    <Button type="button" variant="ghost" size="sm" aria-label="Ghi nhận vi phạm" title={`Ghi nhận vi phạm · ${snapshot.name}`} className="mt-1 h-8 gap-1 px-2 text-[11px] font-medium text-red-700 hover:bg-red-50 hover:text-red-800 md:h-7 [&_svg]:size-3" onClick={() => setOpen(true)}><Flag aria-hidden="true" />Vi phạm</Button>
    {open && <Dialog open onOpenChange={value => { if (!value && !save.isPending) setOpen(false); }}><DialogContent>
      <DialogTitle>Ghi nhận vi phạm</DialogTitle>
      <DialogDescription>{snapshot.name} · {snapshot.code} · {snapshot.company}{context && <span className="mt-1 block font-medium">PCT {context.permitNumber}</span>}</DialogDescription>
      {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Đang tải hồ sơ nhân viên…</p> : query.isError ? <div role="alert" className="space-y-2 text-sm text-red-700"><p>{query.error.message}</p><Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>Tải lại hồ sơ</Button></div> : person && <PersonViolations person={person} />}
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault(); event.stopPropagation();
        if (!person || query.isError || save.isPending) return;
        try {
          await save.mutateAsync({ id: person.id, description, version: person.version, context });
          toast.success("Đã ghi nhận một lần vi phạm"); setDescription(""); setOpen(false);
        } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể ghi nhận vi phạm"); void query.refetch(); }
      }}>
        <label className="block space-y-2 text-sm"><span>Lỗi vi phạm *</span><textarea required maxLength={2000} rows={4} value={description} disabled={save.isPending || !person || query.isError} onChange={event => setDescription(event.target.value)} className="w-full rounded-lg border border-input bg-background p-3 text-base sm:text-sm" placeholder="Nhập lỗi vi phạm quy định làm việc của PCT…" /></label>
        <p className="text-xs text-muted-foreground">Mỗi lần lưu tính là một lần vi phạm và bổ sung vào lịch sử của nhân viên.</p>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setOpen(false)}>Để sau</Button><Button type="submit" disabled={save.isPending || !person || query.isError || query.isFetching || !description.trim()}>{save.isPending ? "Đang ghi nhận…" : "Ghi nhận vi phạm"}</Button></div>
      </form>
    </DialogContent></Dialog>}
  </>;
}
