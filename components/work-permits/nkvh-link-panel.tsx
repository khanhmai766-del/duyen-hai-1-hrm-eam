"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSaveNkvhPermitLink } from "@/hooks/useWorkPermits";
import { nkvhPctUrl, parseNkvhPctLink } from "@/lib/nkvh-pct";
import type { PermitRow } from "@/lib/work-permits";
import { NkvhLinkEditor } from "./nkvh-link-editor";

export function NkvhLinkPanel({ permit, canEdit }: { permit: PermitRow; canEdit: boolean }) {
  const [value, setValue] = useState(() => permit.nkvhPctId ? nkvhPctUrl(permit.kind, permit.nkvhPctId) : "");
  const save = useSaveNkvhPermitLink(permit.id);
  let id: string | null = null;
  let invalid = false;
  try { id = parseNkvhPctLink(value, permit.kind); } catch { invalid = true; }
  const editable = canEdit && !["CLOSED", "CANCELLED"].includes(permit.status);
  const dirty = invalid || id !== (permit.nkvhPctId ?? null);
  async function submit() {
    try {
      await save.mutateAsync({ version: permit.version, nkvhPctId: parseNkvhPctLink(value, permit.kind) });
      toast.success("Đã cập nhật liên kết NKVH");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Không thể lưu liên kết NKVH"); }
  }
  return <div className="space-y-2">
    <NkvhLinkEditor kind={permit.kind} value={value} onChange={setValue} readOnly={!editable} disabled={save.isPending} />
    {editable && dirty && <div className="flex flex-wrap items-center gap-3"><Button type="button" size="sm" disabled={invalid || save.isPending} onClick={submit}>{save.isPending ? "Đang lưu…" : "Lưu liên kết"}</Button><button type="button" disabled={save.isPending} className="text-xs text-muted-foreground underline underline-offset-4" onClick={() => setValue(permit.nkvhPctId ? nkvhPctUrl(permit.kind, permit.nkvhPctId) : "")}>Hủy thay đổi</button><span className="text-[11px] text-muted-foreground">Chỉ cập nhật link, không thay đổi thông tin cấp phiếu.</span></div>}
  </div>;
}
