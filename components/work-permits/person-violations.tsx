"use client";

import { useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useChangePermitPersonViolation, usePermitViolationPerson, useRecordPermitPersonViolation, type PermitViolationContext, type PermitViolationPerson } from "@/hooks/useWorkPermits";
import { useAdminMode } from "@/hooks/useAdminMode";
import type { PermitMember, PermitPerson, PermitPersonViolation } from "@/lib/work-permits";

export function PersonViolations({ person, compact = false, actions, className }: { person: Pick<PermitPerson, "violations">; compact?: boolean; actions?: (violation: PermitPersonViolation, index: number) => ReactNode; className?: string }) {
  const violations = person.violations ?? [];
  if (!violations.length) return null;
  return <div className={cn("mt-1 min-w-0 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-900", className)}>
    <p className="font-bold">Đã vi phạm {violations.length} lần{!compact && " · Cần chú ý đặc biệt"}</p>
    <ul className="mt-1 space-y-1">{violations.map((violation, index) => <li key={violation.id} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      <span className="font-semibold">{index + 1}.</span> {violation.description}
      {!compact && <span className="block text-[11px] text-red-800">{violation.permitNumber && <span className="font-medium">PCT {violation.permitNumber} · </span>}{new Date(violation.recordedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · {violation.recordedByName}</span>}
      {actions?.(violation, index)}
    </li>)}</ul>
  </div>;
}

/**
 * Số lần vi phạm: chấm đỏ nhỏ (vùng bấm vẫn 32px cho điện thoại) — bấm mở popup danh sách lỗi, không bung khung đỏ
 * trong dòng làm xô lệch danh sách (17/10/2026).
 */
function ViolationCount({ violations, compact }: { violations: PermitPersonViolation[]; compact?: boolean }) {
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={`Xem chi tiết ${violations.length} lần vi phạm`} title="Xem chi tiết vi phạm"
        className="group -ml-2 inline-flex h-8 min-w-8 items-center justify-center rounded-full focus-visible:outline-none md:h-7 md:min-w-7">
        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none tabular-nums text-white group-hover:bg-red-700 group-focus-visible:ring-2 group-focus-visible:ring-red-400 group-focus-visible:ring-offset-1">{violations.length}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" sideOffset={4} className="max-h-[60vh] w-[calc(100vw-24px)] max-w-[380px] overflow-y-auto border-red-200 p-0">
      <PersonViolations person={{ violations }} compact={compact} className="mt-0 rounded-md border-0" />
    </PopoverContent>
  </Popover>;
}

/**
 * `inline`: nhãn đứng cùng dòng, bên phải họ tên — nơi gọi bọc họ tên + nhãn trong một hàng flex-wrap; lớp bọc ở đây
 * là `contents` nên nút và ô số là phần tử của hàng đó.
 */
const tagRow = (inline?: boolean) => inline ? "contents" : "mt-1 flex flex-wrap items-center gap-1";

/** Nhãn chỉ xem (người không có quyền ghi nhận): "Vi phạm" + số lần; chưa vi phạm thì không hiện gì. */
export function PersonViolationTag({ violations, compact, inline }: { violations?: PermitPersonViolation[]; compact?: boolean; inline?: boolean }) {
  if (!violations?.length) return null;
  return <div className={tagRow(inline)}>
    <span className="inline-flex h-8 items-center gap-1 px-2 text-[11px] font-medium text-red-700 md:h-7"><Flag aria-hidden="true" className="size-3" />Vi phạm</span>
    <ViolationCount violations={violations} compact={compact} />
  </div>;
}

function ViolationHistory({ person, busy, onReload }: { person: PermitViolationPerson; busy: boolean; onReload: () => void }) {
  const { data: session } = useSession();
  const [adminMode] = useAdminMode();
  const isAdmin = session?.user?.role === "ADMIN" && adminMode;
  const change = useChangePermitPersonViolation();
  const [selected, setSelected] = useState<{ id: string; action: "edit" | "delete"; description: string } | null>(null);
  async function apply() {
    if (!selected || busy || change.isPending) return;
    try {
      await change.mutateAsync({ id: person.id, violationId: selected.id, action: selected.action, version: person.version, description: selected.description });
      toast.success(selected.action === "edit" ? "Đã sửa lỗi vi phạm" : "Đã xóa lần vi phạm");
      setSelected(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật vi phạm");
      setSelected(null);
      onReload();
    }
  }
  return <PersonViolations person={person} actions={isAdmin ? (violation, index) => selected?.id === violation.id ? <div className="mt-2 space-y-2 rounded-md border border-red-200 bg-background p-2 text-foreground">
    {selected.action === "edit" ? <label className="block space-y-1"><span className="font-medium">Sửa lỗi vi phạm lần {index + 1}</span><textarea aria-label={`Sửa lỗi vi phạm lần ${index + 1}`} rows={3} maxLength={2000} className="w-full rounded-lg border border-input bg-background p-2 text-base sm:text-sm" value={selected.description} disabled={change.isPending || busy} onChange={event => setSelected({ ...selected, description: event.target.value })} /></label> : <p>Xóa lần vi phạm này của {person.name}? Số lần vi phạm sẽ giảm sau khi xóa.</p>}
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={selected.action === "delete" ? "destructive" : "default"} className="h-10" disabled={change.isPending || busy || (selected.action === "edit" && !selected.description.trim())} onClick={() => void apply()}>{change.isPending ? "Đang lưu…" : selected.action === "edit" ? "Lưu chỉnh sửa" : "Xác nhận xóa"}</Button><Button type="button" size="sm" variant="outline" className="h-10" disabled={change.isPending} onClick={() => setSelected(null)}>Hủy</Button></div>
  </div> : <div className="mt-1 flex gap-2"><Button type="button" size="sm" variant="outline" className="h-10 text-xs" aria-label={`Sửa vi phạm lần ${index + 1}`} disabled={busy || change.isPending} onClick={() => setSelected({ id: violation.id, action: "edit", description: violation.description })}>Sửa</Button><Button type="button" size="sm" variant="outline" className="h-10 text-xs text-red-700" aria-label={`Xóa vi phạm lần ${index + 1}`} disabled={busy || change.isPending} onClick={() => setSelected({ id: violation.id, action: "delete", description: violation.description })}>Xóa</Button></div> : undefined} />;
}

export function RecordPersonViolation(props: ({ person: PermitPerson; member?: never; context?: never } | { member: PermitMember; context: PermitViolationContext; violations?: PermitPerson["violations"]; person?: never }) & { compact?: boolean; inline?: boolean }) {
  const snapshot = props.person ?? props.member;
  const id = props.person?.id ?? props.member?.personId ?? "";
  const context = props.context;
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const save = useRecordPermitPersonViolation();
  const query = usePermitViolationPerson(id, open, context);
  const person = query.data?.data;
  const history = props.person?.violations ?? ("violations" in props ? props.violations : undefined) ?? person?.violations;
  const status = history === undefined ? "unknown" : history.length ? "violated" : "clean";
  const tone = status === "violated" ? "text-red-700 hover:bg-red-50 hover:text-red-800" : status === "clean" ? "text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700";
  const statusLabel = status === "violated" ? `Đã vi phạm ${history?.length ?? 0} lần` : status === "clean" ? "Chưa ghi nhận vi phạm" : "Đang chờ thông tin vi phạm";
  return <>
    {/* Đã vi phạm: nhãn đỏ "Vi phạm" (vẫn bấm để ghi thêm lần mới) + số lần — bấm số mở popup chi tiết. */}
    <div className={tagRow(props.inline)}>
      <Button type="button" variant="ghost" size="sm" aria-label="Ghi nhận vi phạm" title={`Ghi nhận vi phạm · ${snapshot.name} · ${statusLabel}`} className={`h-8 gap-1 px-2 text-[11px] font-medium md:h-7 [&_svg]:size-3 ${tone}`} onClick={() => setOpen(true)}><Flag aria-hidden="true" />{status === "violated" ? "Vi phạm" : "Ghi nhận vi phạm"}</Button>
      {status === "violated" && history && <ViolationCount violations={history} compact={props.compact} />}
    </div>
    {open && <Dialog open onOpenChange={value => { if (!value && !save.isPending) setOpen(false); }}><DialogContent>
      <DialogTitle>Ghi nhận vi phạm</DialogTitle>
      <DialogDescription>{snapshot.name} · {snapshot.code} · {snapshot.company}{context && <span className="mt-1 block font-medium">PCT {context.permitNumber}</span>}</DialogDescription>
      {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Đang tải hồ sơ nhân viên…</p> : query.isError ? <div role="alert" className="space-y-2 text-sm text-red-700"><p>{query.error.message}</p><Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>Tải lại hồ sơ</Button></div> : person && <ViolationHistory person={person} busy={query.isFetching || save.isPending} onReload={() => void query.refetch()} />}
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
