"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usePermitSafety, useSavePermitSafety } from "@/hooks/useWorkPermitSafety";
import { PERMIT_KINDS, type PermitKind } from "@/lib/work-permits";
import { SAFETY_MAX_ROWS, safetyPrintData, type SafetyItem, type SafetySelection } from "@/lib/work-permit-safety";

const control = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
export function PermitSafetyCatalog({ kind, selected, onAdd }: { kind: PermitKind; selected?: SafetySelection[]; onAdd?: (items: SafetySelection[]) => void }) {
  const [q, setQ] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const [active, setActive] = useState("1"); const [editor, setEditor] = useState<SafetyItem | "new" | null>(null);
  const [picked, setPicked] = useState<SafetyItem[]>([]);
  useEffect(() => { const timer = setTimeout(() => { setSearch(q); setPage(1); }, 300); return () => clearTimeout(timer); }, [q]);
  const query = usePermitSafety({ kind, q: search, page, active: onAdd ? "1" : active });
  const meta = query.data?.meta; const rows = query.data?.data ?? [];
  const existing = new Set(selected?.map(s => s.sourceId));
  const max = SAFETY_MAX_ROWS - (selected?.length ?? 0);
  function toggle(row: SafetyItem) {
    if (picked.some(p => p.id === row.id)) setPicked(picked.filter(p => p.id !== row.id));
    else if (picked.length >= max) toast.error(`Mỗi phiếu có tối đa ${SAFETY_MAX_ROWS} biện pháp`);
    else setPicked([...picked, row]);
  }
  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={20} />Biện pháp an toàn {kind === "MECHANICAL" ? "Cơ – Nhiệt – Hóa" : "Điện"}</h2><p className="mt-1 text-sm text-muted-foreground">{onAdd ? "Chọn các cặp mối nguy – biện pháp; sau đó phân công đơn vị thực hiện trên phiếu." : "Danh mục cặp mối nguy – biện pháp dành cho PCT giấy. Thêm, sửa hoặc ngừng sử dụng từng biện pháp."}</p></div>{!onAdd && meta?.canWrite && <Button type="button" onClick={() => setEditor("new")}><Plus />Thêm biện pháp</Button>}</div>
    <div className="flex flex-wrap gap-3"><label className="relative min-w-52 flex-1"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><input aria-label="Tìm biện pháp an toàn" className={`${control} pl-9`} placeholder="Tìm mối nguy, biện pháp hoặc tên phiếu mẫu…" value={q} maxLength={200} onChange={e => setQ(e.target.value)} /></label>{!onAdd && <select aria-label="Trạng thái sử dụng biện pháp" className={`${control} sm:w-48`} value={active} onChange={e => { setActive(e.target.value); setPage(1); }}><option value="1">Đang sử dụng</option><option value="0">Ngừng sử dụng</option><option value="all">Tất cả</option></select>}</div>
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {query.isError ? <p role="alert" className="p-6 text-red-700">{query.error.message}</p> : query.isPending ? <p role="status" className="p-6">Đang tải biện pháp…</p> : !rows.length ? <div className="p-8 text-center"><ShieldCheck className="mx-auto mb-2 text-muted-foreground" /><p className="font-medium">Chưa có biện pháp phù hợp</p><p className="mt-1 text-sm text-muted-foreground">{kind === "ELECTRICAL" ? "Danh mục Điện độc lập với Cơ. Bổ sung biện pháp theo phiếu Điện của đơn vị." : "Thử đổi từ khóa hoặc bổ sung biện pháp mới."}</p></div> : <ul className="divide-y divide-border">{rows.map(row => {
        const added = existing.has(row.id), checked = picked.some(p => p.id === row.id);
        return <li key={row.id} className={`flex items-start gap-3 p-4 ${checked ? "bg-sky-50 dark:bg-sky-950/30" : ""}`}>
          {onAdd && <input type="checkbox" aria-label={`Chọn ${row.hazard || row.measure}`} className="mt-1 h-5 w-5 shrink-0 accent-blue-700" checked={added || checked} disabled={added || query.isFetching} onChange={() => toggle(row)} />}
          <div className="min-w-0 flex-1">{row.hazard && <h3 className="font-semibold">{row.hazard}</h3>}<p className="mt-1 whitespace-pre-wrap break-words text-sm">{row.measure}</p>{row.source && <p className="mt-2 break-words text-xs text-muted-foreground">Nguồn: {row.source}</p>}{added && <p className="mt-1 text-xs text-emerald-700">Đã có trên phiếu</p>}{!row.isActive && <p className="mt-1 text-xs text-amber-700">Ngừng sử dụng</p>}</div>
          {!onAdd && meta?.canWrite && <Button type="button" size="sm" variant="outline" onClick={() => setEditor(row)}>Sửa</Button>}
        </li>;
      })}</ul>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3 text-sm"><span>{meta?.total ?? 0} mục · Trang {page}/{Math.max(1, Math.ceil((meta?.total ?? 0) / (meta?.pageSize ?? 10)))}</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page <= 1 || query.isFetching} onClick={() => setPage(page - 1)}>Trước</Button><Button type="button" size="sm" variant="outline" disabled={!meta || page * meta.pageSize >= meta.total || query.isFetching} onClick={() => setPage(page + 1)}>Sau</Button></div></div>
    </div>
    {onAdd && <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"><span className="text-sm">Đã chọn {picked.length} mục mới · Mặc định giao đơn vị công tác</span><Button type="button" disabled={!picked.length || picked.length > max} onClick={() => onAdd(picked.map(p => ({ sourceId: p.id, hazard: p.hazard, measure: p.measure, forAuthorization: false, forExecution: true })))}><Check />Thêm vào phiếu ({picked.length})</Button></div>}
    {editor && <SafetyEditor kind={kind} initial={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} />}
  </section>;
}

function SafetyEditor({ kind, initial, onClose }: { kind: PermitKind; initial?: SafetyItem; onClose: () => void }) {
  const [form, setForm] = useState(initial ?? { kind, hazard: "", measure: "", source: "", isActive: true });
  const save = useSavePermitSafety();
  async function submit(e: React.FormEvent) {
    e.preventDefault(); e.stopPropagation();
    try { await save.mutateAsync({ id: initial?.id, body: form }); toast.success("Đã lưu biện pháp an toàn"); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Không thể lưu biện pháp"); }
  }
  return <Dialog open onOpenChange={v => { if (!v && !save.isPending) onClose(); }}><DialogContent className="max-w-2xl"><DialogTitle>{initial ? "Sửa" : "Thêm"} biện pháp an toàn</DialogTitle><DialogDescription>Danh mục {PERMIT_KINDS[kind]}. Thay đổi ở đây không làm đổi nội dung đã lưu trên phiếu.</DialogDescription><form onSubmit={submit} className="space-y-4"><fieldset disabled={save.isPending} className="space-y-4">
    <label className="block space-y-1 text-sm"><span>Nhận diện mối nguy *</span><textarea className={control} rows={2} required maxLength={1000} value={form.hazard} onChange={e => setForm({ ...form, hazard: e.target.value })} /></label>
    <label className="block space-y-1 text-sm"><span>Biện pháp an toàn *</span><textarea className={control} rows={5} required maxLength={5000} value={form.measure} onChange={e => setForm({ ...form, measure: e.target.value })} /></label>
    <label className="block space-y-1 text-sm"><span>Nguồn / công việc tham khảo</span><input className={control} maxLength={500} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} /></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />Đang sử dụng — cho phép chọn khi cấp phiếu</label>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Đóng</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? "Đang lưu…" : "Lưu biện pháp"}</Button></div>
  </fieldset></form></DialogContent></Dialog>;
}

export function PermitSafetySelection({ kind, value, onChange }: { kind: PermitKind; value: SafetySelection[]; onChange: (v: SafetySelection[]) => void }) {
  const [pick, setPick] = useState(false);
  const update = (index: number, patch: Partial<SafetySelection>) => onChange(value.map((row, i) => i === index ? { ...row, ...patch } : row));
  const groups = safetyPrintData(value);
  function move(index: number, direction: -1 | 1) {
    const copy = [...value]; [copy[index], copy[index + direction]] = [copy[index + direction], copy[index]]; onChange(copy);
  }
  return <section className="space-y-4 rounded-xl border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} />Mối nguy và biện pháp an toàn</h3><p className="mt-1 text-xs text-muted-foreground">Chọn cặp mối nguy – biện pháp của {PERMIT_KINDS[kind]}, rồi phân công đơn vị thực hiện. Có thể chọn cả hai đơn vị.</p></div><Button type="button" variant="outline" disabled={value.length >= SAFETY_MAX_ROWS} onClick={() => setPick(true)}><Plus />Chọn từ danh mục</Button></div>
    {!value.length && <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">Chưa chọn cặp mối nguy – biện pháp. Chọn từ danh mục hoặc bổ sung riêng cho công việc này.</p>}
    {value.map((row, index) => <div key={index} className="space-y-3 rounded-xl border border-border bg-muted/20 p-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Cặp {index + 1}{row.sourceId ? " · Từ danh mục" : " · Bổ sung riêng"}</span><div className="flex gap-1"><Button type="button" size="sm" variant="ghost" aria-label={`Đưa cặp ${index + 1} lên`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button><Button type="button" size="sm" variant="ghost" aria-label={`Đưa cặp ${index + 1} xuống`} disabled={index === value.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button><Button type="button" size="sm" variant="ghost" aria-label={`Bỏ cặp ${index + 1}`} onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 size={14} /></Button></div></div>
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]"><label className="block text-xs font-medium">Nhận diện mối nguy *<textarea required className={`${control} mt-1`} rows={3} maxLength={1000} value={row.hazard} onChange={e => update(index, { hazard: e.target.value })} /></label><label className="block text-xs font-medium">Biện pháp an toàn *<textarea required className={`${control} mt-1`} rows={3} maxLength={5000} value={row.measure} onChange={e => update(index, { measure: e.target.value })} /></label></div>
      <fieldset className="rounded-lg border border-border bg-background p-3"><legend className="px-1 text-xs font-medium">Đơn vị thực hiện — người cấp phiếu chọn</legend><div className="flex flex-wrap gap-x-6 gap-y-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-blue-700" checked={row.forAuthorization} onChange={e => update(index, { forAuthorization: e.target.checked })} />Đơn vị cho phép</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-blue-700" checked={row.forExecution} onChange={e => update(index, { forExecution: e.target.checked })} />Đơn vị công tác</label></div>{!row.forAuthorization && !row.forExecution && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">Chưa phân công. Chọn ít nhất một đơn vị trước khi ghi Đã cấp.</p>}</fieldset>
    </div>)}
    <Button type="button" size="sm" variant="ghost" disabled={value.length >= SAFETY_MAX_ROWS} onClick={() => onChange([...value, { hazard: "", measure: "", forAuthorization: false, forExecution: true }])}><Plus />Bổ sung cặp riêng cho phiếu</Button>
    {value.length > 0 && <div className="rounded-lg bg-sky-50 p-3 text-xs text-sky-950 dark:bg-sky-950/40 dark:text-sky-100"><b>{value.length} cặp mối nguy – biện pháp</b> · Đơn vị cho phép: {groups.authorization.length} biện pháp · Đơn vị công tác: {groups.execution.length} biện pháp.<p className="mt-1">{kind === "MECHANICAL" ? "Mẫu Cơ: tự điền A → B/C theo phân công." : "Mẫu Điện: điền mục 2.5 và phụ lục phân công riêng."} Nội dung biện pháp trùng nguyên văn được gộp trong từng đơn vị.</p></div>}
    {pick && <Dialog open onOpenChange={v => { if (!v) setPick(false); }}><DialogContent className="max-w-4xl"><DialogTitle>Chọn mối nguy và biện pháp an toàn</DialogTitle><DialogDescription>Chỉ hiển thị danh mục {PERMIT_KINDS[kind]} đang sử dụng.</DialogDescription><PermitSafetyCatalog kind={kind} selected={value} onAdd={items => { onChange([...value, ...items]); setPick(false); }} /></DialogContent></Dialog>}
  </section>;
}

export function PermitSafetyReadOnly({ value }: { value: SafetySelection[] }) {
  const groups = safetyPrintData(value);
  return <section className="space-y-3 rounded-xl border border-border p-4"><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} />Mối nguy và biện pháp đã ghi trên phiếu</h3>{!value.length ? <p className="text-sm text-muted-foreground">Phiếu chưa ghi nhận nội dung an toàn.</p> : <><ol className="list-decimal space-y-3 pl-5 text-sm">{value.map((row, i) => <li key={i}><strong className="block">{row.hazard}</strong><p className="whitespace-pre-wrap break-words">{row.measure}</p><div className="mt-1 flex flex-wrap gap-2 text-xs">{row.forAuthorization && <span className="rounded bg-sky-50 px-2 py-1 text-sky-900">Đơn vị cho phép</span>}{row.forExecution && <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-900">Đơn vị công tác</span>}{!row.forAuthorization && !row.forExecution && <span className="text-amber-700">Chưa phân công</span>}</div></li>)}</ol><p className="border-t border-border pt-3 text-xs text-muted-foreground">Đơn vị cho phép: {groups.authorization.length} biện pháp · Đơn vị công tác: {groups.execution.length} biện pháp.</p></>}</section>;
}
