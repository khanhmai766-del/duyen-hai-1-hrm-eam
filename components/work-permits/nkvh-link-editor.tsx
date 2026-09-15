"use client";
import { useId, useState } from "react";
import { ExternalLink } from "lucide-react";
import { nkvhPctUrl, parseNkvhPctLink } from "@/lib/nkvh-pct";

export function NkvhLinkEditor({ kind, value, onChange, disabled = false, readOnly = false }: { kind: string; value: string; onChange: (value: string) => void; disabled?: boolean; readOnly?: boolean }) {
  let id: string | null = null;
  let error = "";
  try { id = parseNkvhPctLink(value, kind); } catch (e) { error = e instanceof Error ? e.message : "Link không hợp lệ"; }
  const [editing, setEditing] = useState(!value);
  const hintId = useId();
  const showInput = !readOnly && (editing || !!error);
  return <section className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/20">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-200"><ExternalLink className="h-4 w-4" />{id ? "Đã liên kết NKVH" : "Liên kết NKVH"}</span>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {id && <a className="font-semibold text-sky-800 underline underline-offset-4 dark:text-sky-200" href={nkvhPctUrl(kind, id)} target="_blank" rel="noopener noreferrer">Mở phiếu</a>}
        {!readOnly && <><button type="button" disabled={disabled} className="text-sky-800 underline underline-offset-4 disabled:opacity-50 dark:text-sky-200" onClick={() => setEditing(true)}>{id ? "Thay link" : "Gắn link NKVH"}</button>{id && <button type="button" disabled={disabled} className="text-muted-foreground underline underline-offset-4 disabled:opacity-50" onClick={() => { if (window.confirm("Gỡ liên kết NKVH khỏi PCT này?")) { onChange(""); setEditing(true); } }}>Gỡ</button>}</>}
      </div>
    </div>
    {showInput ? <label className="block space-y-1.5 text-xs"><span className="font-medium">Dán link chi tiết phiếu {kind === "ELECTRICAL" ? "Điện" : "Cơ"}</span><input disabled={disabled} className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" value={value} maxLength={2048} placeholder="http://nkvh.…/pct…_ct?…&id_pct=…" aria-invalid={!!error} aria-describedby={hintId} onChange={e => onChange(e.target.value)} onBlur={() => { if (id && !error) setEditing(false); }} /><span id={hintId} className={`block ${error ? "text-red-700" : "text-muted-foreground"}`}>{error || (id ? "Đã nhận ID; chỉ lưu UUID, không lưu URL dài." : "Không bắt buộc. Chưa có link thì bấm số PCT để sao chép số và mở danh sách NKVH.")}</span></label> : <p className="text-xs text-muted-foreground">{id ? "Bấm số PCT sẽ mở phiếu đã gắn. Chỉ lưu UUID." : "Chưa có link; bấm số PCT để sao chép số và mở danh sách NKVH."}</p>}
    {showInput && <p className="text-[11px] text-muted-foreground">Đối chiếu số phiếu trên NKVH trước khi lưu.</p>}
  </section>;
}
