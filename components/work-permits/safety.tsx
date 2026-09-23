"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager, PlainHeader, ROW_HOVER, rowBackground, TABLE_SCROLLER, TD_ROW, TH_NAVY, TR_HEAD } from "@/components/pccc/pccc-table-card";
import { cn } from "@/lib/utils";
import { useDeletePermitSafety, usePermitSafety, useSavePermitSafety } from "@/hooks/useWorkPermitSafety";
import { PERMIT_KINDS, type PermitKind } from "@/lib/work-permits";
import { SAFETY_MAX_ROWS, SAFETY_PAGE_SIZES, safetyPrintData, type SafetyItem, type SafetySelection } from "@/lib/work-permit-safety";

const control = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
export function PermitSafetyCatalog({ kind, selected, onAdd }: { kind: PermitKind; selected?: SafetySelection[]; onAdd?: (items: SafetySelection[]) => void }) {
  const [q, setQ] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const [active, setActive] = useState("1"); const [editor, setEditor] = useState<SafetyItem | "new" | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [picked, setPicked] = useState<SafetyItem[]>([]);
  const remove = useDeletePermitSafety();
  /** Xóa hẳn mục trùng hoặc không còn phù hợp. Phiếu đã ghi giữ nguyên nội dung đã sao chép;
   *  muốn ngừng dùng mà vẫn giữ trong danh mục thì sửa mục đó sang "Ngừng sử dụng". */
  async function removeItem(row: SafetyItem) {
    if (!window.confirm(`Xóa biện pháp này khỏi danh mục?

${row.hazard} — ${row.measure}

Các phiếu đã ghi vẫn giữ nguyên nội dung. Nếu chỉ muốn ngừng dùng, hãy sửa mục sang "Ngừng sử dụng".`)) return;
    try { await remove.mutateAsync(row.id); toast.success("Đã xóa biện pháp khỏi danh mục"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không thể xóa biện pháp"); }
  }
  useEffect(() => { const timer = setTimeout(() => { setSearch(q); setPage(1); }, 300); return () => clearTimeout(timer); }, [q]);
  const query = usePermitSafety({ kind, q: search, page, active: onAdd ? "1" : active, pageSize: rowsPerPage });
  const meta = query.data?.meta; const rows = query.data?.data ?? [];
  const total = meta?.total ?? 0, pageSize = meta?.pageSize ?? 10;
  const existing = new Set(selected?.map(s => s.sourceId));
  const max = SAFETY_MAX_ROWS - (selected?.length ?? 0);
  function toggle(row: SafetyItem) {
    if (picked.some(p => p.id === row.id)) setPicked(picked.filter(p => p.id !== row.id));
    else if (picked.length >= max) toast.error(`Mỗi phiếu có tối đa ${SAFETY_MAX_ROWS} biện pháp`);
    else setPicked([...picked, row]);
  }
  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck size={18} />Biện pháp an toàn {kind === "MECHANICAL" ? "Cơ – Nhiệt – Hóa" : "Điện"}</h2><p className="mt-0.5 text-xs text-muted-foreground">{onAdd ? "Chọn các cặp mối nguy – biện pháp; sau đó phân công đơn vị thực hiện trên phiếu." : "Danh mục cặp mối nguy – biện pháp dành cho PCT giấy. Thêm, sửa, ngừng sử dụng hoặc xóa mục trùng."}</p></div>{!onAdd && <div className="flex flex-wrap items-center gap-2"><select aria-label="Trạng thái sử dụng biện pháp" className="h-9 rounded-lg border border-input bg-background px-2 text-xs font-medium sm:w-44" value={active} onChange={e => { setActive(e.target.value); setPage(1); }}><option value="1">Đang sử dụng</option><option value="0">Ngừng sử dụng</option><option value="all">Tất cả</option></select>{meta?.canWrite && <Button type="button" size="sm" className="h-9 text-xs" onClick={() => setEditor("new")}><Plus />Thêm biện pháp</Button>}</div>}</div>
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Thanh công cụ nằm TRONG thẻ bảng, như sổ TBYCNN/PCCC: ô tìm kiếm đi liền với bảng
          mà nó lọc, không trôi lên phần tiêu đề trang. */}
      <div className="flex flex-col gap-3 border-b border-border bg-muted/25 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Hiển thị</span>
          <select aria-label="Số dòng mỗi trang" className="h-8 rounded-lg border border-input bg-background px-2 text-sm font-medium text-ink" value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}>{SAFETY_PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}</select>
          <span>dòng</span>
        </div>
        <div className="flex w-full items-center gap-2 md:w-auto">
          <span className="hidden text-sm text-muted-foreground md:inline">Tìm kiếm:</span>
          <label className="relative w-full md:w-72"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input aria-label="Tìm biện pháp an toàn" className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Tìm mối nguy hoặc biện pháp an toàn…" value={q} maxLength={200} onChange={e => setQ(e.target.value)} /></label>
        </div>
      </div>
      {query.isError ? <p role="alert" className="p-6 text-red-700">{query.error.message}</p> : query.isPending ? <p role="status" className="p-6 text-sm">Đang tải biện pháp…</p> : !rows.length ? <div className="p-8 text-center"><ShieldCheck className="mx-auto mb-2 text-muted-foreground" /><p className="font-medium">Chưa có biện pháp phù hợp</p><p className="mt-1 text-sm text-muted-foreground">{kind === "ELECTRICAL" ? "Danh mục Điện độc lập với Cơ. Bổ sung biện pháp theo phiếu Điện của đơn vị." : "Thử đổi từ khóa hoặc bổ sung biện pháp mới."}</p></div> : <>
        {/* Bảng dùng chung khuôn của sổ TBYCNN/PCCC (đầu bảng xanh EVN, vạch xen kẽ, hover xanh)
            để ba sổ trông như một hệ thống. Mối nguy và biện pháp vẫn là hai cột riêng để đọc
            theo hàng ngang, đúng lối trình bày của phiếu giấy. */}
        <Table className="min-w-[860px] table-fixed" wrapperClassName={cn("hidden md:block", TABLE_SCROLLER)}>
          <colgroup>{onAdd && <col className="w-10" />}<col className="w-12" /><col className="w-[26%]" /><col />{!onAdd && meta?.canWrite && <col className="w-24" />}</colgroup>
          <TableHeader><TableRow className={TR_HEAD}>{onAdd && <TableHead className={TH_NAVY} aria-label="Chọn" />}<TableHead className={TH_NAVY}><PlainHeader label="STT" /></TableHead><TableHead className={TH_NAVY}><PlainHeader label="Nhận diện mối nguy" align="left" /></TableHead><TableHead className={TH_NAVY}><PlainHeader label="Biện pháp an toàn" align="left" /></TableHead>{!onAdd && meta?.canWrite && <TableHead className={TH_NAVY}><PlainHeader label="Thao tác" /></TableHead>}</TableRow></TableHeader>
          <TableBody>{rows.map((row, index) => {
            const added = existing.has(row.id), checked = picked.some(p => p.id === row.id);
            const rowBg = checked ? "bg-sky-100" : rowBackground({ index });
            return <TableRow key={row.id} className={cn(rowBg, ROW_HOVER, "align-top")}>
              {onAdd && <TableCell className={cn(TD_ROW, "py-2.5 text-center")}><input type="checkbox" aria-label={`Chọn ${row.hazard || row.measure}`} className="h-4 w-4 cursor-pointer accent-blue-700" checked={added || checked} disabled={added || query.isFetching} onChange={() => toggle(row)} /></TableCell>}
              <TableCell className={cn(TD_ROW, "py-2.5 text-center tabular-nums text-slate-500")}>{(page - 1) * (meta?.pageSize ?? 10) + index + 1}</TableCell>
              <TableCell className={cn(TD_ROW, "py-2.5")}><span className="block whitespace-pre-wrap break-words font-semibold text-ink">{row.hazard || "—"}</span>{added && <span className="mt-1 block text-[11px] text-emerald-700">Đã có trên phiếu</span>}{!row.isActive && <span className="mt-1 block text-[11px] text-amber-700">Ngừng sử dụng</span>}</TableCell>
              <TableCell className={cn(TD_ROW, "py-2.5")}><span className="block whitespace-pre-wrap break-words leading-5">{row.measure}</span></TableCell>
              
              {!onAdd && meta?.canWrite && <TableCell className={cn(TD_ROW, "py-2.5 text-center")}><div className="flex items-center justify-center gap-1"><Button type="button" size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => setEditor(row)}>Sửa</Button><Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-red-700 hover:bg-red-50 hover:text-red-800" disabled={remove.isPending} aria-label={`Xóa biện pháp ${row.hazard || row.measure}`} onClick={() => void removeItem(row)}><Trash2 size={14} /></Button></div></TableCell>}
            </TableRow>;
          })}</TableBody>
        </Table>
        <ul className="divide-y divide-border md:hidden">{rows.map(row => {
          const added = existing.has(row.id), checked = picked.some(p => p.id === row.id);
          return <li key={row.id} className={`flex items-start gap-3 px-4 py-3 ${checked ? "bg-sky-50 dark:bg-sky-950/30" : ""}`}>
            {onAdd && <input type="checkbox" aria-label={`Chọn ${row.hazard || row.measure}`} className="mt-1 h-4 w-4 shrink-0 accent-blue-700" checked={added || checked} disabled={added || query.isFetching} onChange={() => toggle(row)} />}
            <div className="min-w-0 flex-1 text-xs">{row.hazard && <h3 className="text-[13px] font-semibold">{row.hazard}</h3>}<p className="mt-0.5 whitespace-pre-wrap break-words leading-5">{row.measure}</p>{added && <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">Đã có trên phiếu</p>}{!row.isActive && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">Ngừng sử dụng</p>}</div>
            {!onAdd && meta?.canWrite && <div className="flex shrink-0 gap-1"><Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => setEditor(row)}>Sửa</Button><Button type="button" size="sm" variant="outline" className="h-8 px-2 text-red-700 hover:text-red-800" disabled={remove.isPending} aria-label={`Xóa biện pháp ${row.hazard || row.measure}`} onClick={() => void removeItem(row)}><Trash2 size={14} /></Button></div>}
          </li>;
        })}</ul>
      </>}
      {/* Chân bảng viết như sổ TBYCNN/PCCC: đếm bản ghi bên trái, dải số trang bên phải. */}
      <div className="flex flex-col gap-3 border-t border-border bg-muted/25 px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div>{total === 0 ? "Không có bản ghi nào" : <>Hiển thị <b className="font-mono text-ink">{(page - 1) * pageSize + 1}</b>–<b className="font-mono text-ink">{Math.min(page * pageSize, total)}</b> trong tổng số <b className="font-mono text-ink">{total}</b> bản ghi</>}</div>
        <Pager page={page} totalPages={Math.max(1, Math.ceil(total / pageSize))} onGo={setPage} />
      </div>
    </div>
    {onAdd && <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"><span className="text-sm">Đã chọn {picked.length} mục mới · Mặc định giao đơn vị công tác</span><Button type="button" disabled={!picked.length || picked.length > max} onClick={() => onAdd(picked.map(p => ({ sourceId: p.id, hazard: p.hazard, measure: p.measure, forAuthorization: false, forExecution: true })))}><Check />Thêm vào phiếu ({picked.length})</Button></div>}
    {editor && <SafetyEditor kind={kind} initial={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} />}
  </section>;
}

function SafetyEditor({ kind, initial, onClose }: { kind: PermitKind; initial?: SafetyItem; onClose: () => void }) {
  const [form, setForm] = useState(initial ?? { kind, hazard: "", measure: "", isActive: true });
  const save = useSavePermitSafety();
  async function submit(e: React.FormEvent) {
    e.preventDefault(); e.stopPropagation();
    try { await save.mutateAsync({ id: initial?.id, body: form }); toast.success("Đã lưu biện pháp an toàn"); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Không thể lưu biện pháp"); }
  }
  return <Dialog open onOpenChange={v => { if (!v && !save.isPending) onClose(); }}><DialogContent className="max-w-2xl"><DialogTitle>{initial ? "Sửa" : "Thêm"} biện pháp an toàn</DialogTitle><DialogDescription>Danh mục {PERMIT_KINDS[kind]}. Thay đổi ở đây không làm đổi nội dung đã lưu trên phiếu.</DialogDescription><form onSubmit={submit} className="space-y-4"><fieldset disabled={save.isPending} className="space-y-4">
    <label className="block space-y-1 text-sm"><span>Nhận diện mối nguy *</span><textarea className={control} rows={2} required maxLength={1000} value={form.hazard} onChange={e => setForm({ ...form, hazard: e.target.value })} /></label>
    <label className="block space-y-1 text-sm"><span>Biện pháp an toàn *</span><textarea className={control} rows={5} required maxLength={5000} value={form.measure} onChange={e => setForm({ ...form, measure: e.target.value })} /></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />Đang sử dụng — cho phép chọn khi cấp phiếu</label>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Đóng</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? "Đang lưu…" : "Lưu biện pháp"}</Button></div>
  </fieldset></form></DialogContent></Dialog>;
}

/**
 * Nút "Chọn từ danh mục" có thể được đặt ở header của bước 2 thay vì trong thẻ này: khi
 * `onPickOpenChange` được truyền, trang cha giữ trạng thái mở hộp chọn và tự vẽ nút.
 */
export function PermitSafetySelection({ kind, value, onChange, pickOpen, onPickOpenChange }: { kind: PermitKind; value: SafetySelection[]; onChange: (v: SafetySelection[]) => void; pickOpen?: boolean; onPickOpenChange?: (v: boolean) => void }) {
  const [localPick, setLocalPick] = useState(false);
  const pick = onPickOpenChange ? Boolean(pickOpen) : localPick;
  const setPick = onPickOpenChange ?? setLocalPick;
  const update = (index: number, patch: Partial<SafetySelection>) => onChange(value.map((row, i) => i === index ? { ...row, ...patch } : row));
  const groups = safetyPrintData(value);
  function move(index: number, direction: -1 | 1) {
    const copy = [...value]; [copy[index], copy[index + direction]] = [copy[index + direction], copy[index]]; onChange(copy);
  }
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-border dark:bg-background"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} />Mối nguy và biện pháp an toàn</h3><p className="mt-1 text-xs text-muted-foreground">Chọn cặp mối nguy – biện pháp của {PERMIT_KINDS[kind]}, rồi phân công đơn vị thực hiện. Có thể chọn cả hai đơn vị.</p></div>{!onPickOpenChange && <Button type="button" variant="outline" disabled={value.length >= SAFETY_MAX_ROWS} onClick={() => setPick(true)}><Plus />Chọn từ danh mục</Button>}</div>
    {kind === "MECHANICAL" && <div className="space-y-4"><div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-border"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-slate-50 font-semibold dark:bg-muted/30"><tr><th className="w-12 px-3 py-2">STT</th><th className="w-[30%] px-3 py-2">Phần A · Nhận diện mối nguy</th><th className="px-3 py-2">Biện pháp an toàn</th></tr></thead><tbody>{groups.hazards.length ? groups.hazards.map((item, index) => <tr key={index} className="border-t border-slate-200 align-top dark:border-border"><td className="px-3 py-2 tabular-nums">{index + 1}</td><td className="px-3 py-2 whitespace-pre-wrap">{item.hazard}</td><td className="px-3 py-2 whitespace-pre-wrap">{item.measure}</td></tr>) : <tr><td colSpan={3} className="px-3 py-4 text-muted-foreground">Chưa chọn mối nguy và biện pháp.</td></tr>}</tbody></table></div><div className="grid gap-3 xl:grid-cols-2">{([{ title: "Phần B · Đơn vị cho phép thực hiện", rows: groups.authorization }, { title: "Phần C · Đơn vị công tác thực hiện", rows: groups.execution }] as const).map(group => <div key={group.title} className="overflow-hidden rounded-lg border border-slate-200 dark:border-border"><h4 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold dark:border-border dark:bg-muted/30">{group.title}</h4>{group.rows.length ? <ol className="list-decimal space-y-1.5 px-7 py-3 text-xs">{group.rows.map((measure, index) => <li key={`${measure}-${index}`} className="whitespace-pre-wrap">{measure}</li>)}</ol> : <p className="px-3 py-3 text-xs text-muted-foreground">Chưa phân công biện pháp.</p>}</div>)}</div><p className="text-xs text-muted-foreground">Bảng B/C tự cập nhật theo ô phân công ở từng dòng phần A; không cần nhập lại.</p></div>}
    {!value.length && <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">Chưa chọn cặp mối nguy – biện pháp. Chọn từ danh mục hoặc bổ sung riêng cho công việc này.</p>}
    {value.map((row, index) => <div key={index} className="space-y-3 rounded-xl border border-border bg-muted/20 p-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Cặp {index + 1}{row.sourceId ? " · Từ danh mục" : " · Bổ sung riêng"}</span><div className="flex gap-1"><Button type="button" size="sm" variant="ghost" aria-label={`Đưa cặp ${index + 1} lên`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button><Button type="button" size="sm" variant="ghost" aria-label={`Đưa cặp ${index + 1} xuống`} disabled={index === value.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button><Button type="button" size="sm" variant="ghost" aria-label={`Bỏ cặp ${index + 1}`} onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 size={14} /></Button></div></div>
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]"><label className="block text-xs font-medium">Nhận diện mối nguy *<textarea required className={`${control} mt-1`} rows={3} maxLength={1000} value={row.hazard} onChange={e => update(index, { hazard: e.target.value })} /></label><label className="block text-xs font-medium">Biện pháp an toàn *<textarea required className={`${control} mt-1`} rows={3} maxLength={5000} value={row.measure} onChange={e => update(index, { measure: e.target.value })} /></label></div>
      <fieldset className="rounded-lg border border-border bg-background p-3"><legend className="px-1 text-xs font-medium">Đơn vị thực hiện — người cấp phiếu chọn</legend><div className="flex flex-wrap gap-x-6 gap-y-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-blue-700" checked={row.forAuthorization} onChange={e => update(index, { forAuthorization: e.target.checked })} />Đơn vị cho phép</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-blue-700" checked={row.forExecution} onChange={e => update(index, { forExecution: e.target.checked })} />Đơn vị công tác</label></div>{!row.forAuthorization && !row.forExecution && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">Chưa phân công. Chọn ít nhất một đơn vị trước khi ghi Đã cấp.</p>}</fieldset>
    </div>)}
    <Button type="button" size="sm" variant="ghost" disabled={value.length >= SAFETY_MAX_ROWS} onClick={() => onChange([...value, { hazard: "", measure: "", forAuthorization: false, forExecution: true }])}><Plus />Bổ sung cặp riêng cho phiếu</Button>
    {value.length > 0 && <div className="rounded-lg bg-sky-50 p-3 text-xs text-sky-950 dark:bg-sky-950/40 dark:text-sky-100"><b>{value.length} cặp mối nguy – biện pháp</b> · Đơn vị cho phép: {groups.authorization.length} biện pháp · Đơn vị công tác: {groups.execution.length} biện pháp.<p className="mt-1">{kind === "MECHANICAL" ? "Mẫu Cơ: tự điền A → B/C theo phân công." : "Mẫu Điện: điền mục 2.5 và phụ lục phân công riêng."} Nội dung biện pháp trùng nguyên văn được gộp trong từng đơn vị.</p></div>}
    {pick && <Dialog open onOpenChange={v => { if (!v) setPick(false); }}><DialogContent className="max-w-4xl"><DialogTitle>Chọn mối nguy và biện pháp an toàn</DialogTitle><DialogDescription className="sr-only">Chỉ hiển thị danh mục {PERMIT_KINDS[kind]} đang sử dụng.</DialogDescription><PermitSafetyCatalog kind={kind} selected={value} onAdd={items => { onChange([...value, ...items]); setPick(false); }} /></DialogContent></Dialog>}
  </section>;
}

export function PermitSafetyReadOnly({ value }: { value: SafetySelection[] }) {
  const groups = safetyPrintData(value);
  return <section className="space-y-3 rounded-xl border border-border p-4"><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} />Mối nguy và biện pháp đã ghi trên phiếu</h3>{!value.length ? <p className="text-sm text-muted-foreground">Phiếu chưa ghi nhận nội dung an toàn.</p> : <><ol className="list-decimal space-y-3 pl-5 text-sm">{value.map((row, i) => <li key={i}><strong className="block">{row.hazard}</strong><p className="whitespace-pre-wrap break-words">{row.measure}</p><div className="mt-1 flex flex-wrap gap-2 text-xs">{row.forAuthorization && <span className="rounded bg-sky-50 px-2 py-1 text-sky-900">Đơn vị cho phép</span>}{row.forExecution && <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-900">Đơn vị công tác</span>}{!row.forAuthorization && !row.forExecution && <span className="text-amber-700">Chưa phân công</span>}</div></li>)}</ol><p className="border-t border-border pt-3 text-xs text-muted-foreground">Đơn vị cho phép: {groups.authorization.length} biện pháp · Đơn vị công tác: {groups.execution.length} biện pháp.</p></>}</section>;
}
