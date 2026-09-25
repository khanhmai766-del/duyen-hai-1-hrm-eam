"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Plus, Users, UserPlus, X, Play, Square, Pencil, Trash2, ScanLine, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PermitCompanyPicker } from "@/components/work-permits/company-picker";
import { PermitEmployeePicker } from "@/components/work-permits/employee-picker";
import { PermitCardScanner } from "@/components/work-permits/card-scanner";
import { PeopleSyncDialog } from "@/components/work-permits/people-sync";
import { cardExpired } from "@/lib/work-permit-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlainHeader, ROW_HOVER, RowExpander, rowBackground, TD_EXPAND, TD_ROW, TH_EXPAND, TH_NAVY, TR_HEAD } from "@/components/pccc/pccc-table-card";
import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/nav";
import { useCreatePermitCompany, useDeletePermitCompany, useDeletePermitPerson, usePermitCompanySummary, usePermitPeople, useRenamePermitCompany, useSavePermitPerson, usePermitSessionAction, usePermitActivity } from "@/hooks/useWorkPermits";
import { formatPermitNumber, PERMIT_KINDS } from "@/lib/work-permits";
import type { PermitDetailRow, PermitMember, PermitPerson, PermitSession } from "@/lib/work-permits";

const control = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
const vnNow = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
const fmt = (v: string) => new Date(v).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

/**
 * Tab "Nhân sự nhà thầu": bảng ĐƠN VỊ trước, bấm vào một dòng mới bung danh sách người của đơn vị đó.
 *
 * Danh bạ phẳng vài trăm người không trả lời được câu hỏi người dùng thực sự hỏi ("đơn vị này có
 * ai, có đủ CHTT không"). Xếp theo đơn vị thì hai con số sĩ số / số CHTT nằm ngay trên bảng, còn
 * thông tin từng người chỉ hiện khi mở đúng đơn vị cần tra.
 *
 * Luồng nhập: "Thêm đơn vị" ở đầu trang → mỗi dòng đơn vị có nút "Thêm nhân sự" điền sẵn đơn vị.
 * Thêm xong thì dòng đơn vị tự bung ra để thấy ngay người vừa thêm.
 */
export function PermitCompanyDirectory() {
  const [q, setQ] = useState("");
  const [openCompany, setOpenCompany] = useState<string | null>(null);
  const [editing, setEditing] = useState<PermitPerson | null>(null);
  const [addingPersonTo, setAddingPersonTo] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState<{ mode: "create" } | { mode: "rename"; company: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const remove = useDeletePermitPerson();
  const removeCompany = useDeletePermitCompany();
  const companies = usePermitCompanySummary();
  // Chỉ gọi danh sách người khi có đơn vị đang mở; `limit: 200` để không phải phân trang trong khối bung.
  const people = usePermitPeople({ company: openCompany ?? "", limit: 200, enabled: Boolean(openCompany) });
  const canWrite = companies.data?.meta.canWrite ?? false;
  const rows = (companies.data?.data ?? []).filter(row => !q.trim() || normalizeText(`${row.code} ${row.company}`).includes(normalizeText(q)));
  const colCount = canWrite ? 7 : 6;
  async function removePerson(person: PermitPerson) {
    if (!window.confirm(`Xóa ${person.name} (${person.code}) khỏi danh sách nhân sự nhà thầu?\n\nNếu người này đã xuất hiện trên PCT, hệ thống sẽ giữ hồ sơ và hướng dẫn chuyển sang ngừng hoạt động.`)) return;
    try { await remove.mutateAsync({ id: person.id, version: person.version }); toast.success("Đã xóa nhân sự nhà thầu"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không thể xóa hồ sơ"); }
  }
  async function deleteCompany(company: string) {
    if (!window.confirm(`Xóa đơn vị "${company}"? Đơn vị chưa có nhân sự nào.`)) return;
    try { await removeCompany.mutateAsync(company); toast.success("Đã xóa đơn vị nhà thầu"); if (openCompany === company) setOpenCompany(null); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không thể xóa đơn vị"); }
  }
  // Nút trong dòng không được làm bung/đóng dòng.
  const act = (event: React.MouseEvent, run: () => void) => { event.stopPropagation(); run(); };
  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-base font-semibold"><Users size={18} />Đơn vị nhà thầu</h2><p className="mt-0.5 text-xs text-muted-foreground">Thêm đơn vị trước, rồi thêm nhân sự và CHTT ngay trên dòng của đơn vị đó. Bấm một dòng để xem danh sách người.</p></div>
      {canWrite && <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" className="h-9 text-xs" title="Lấy họ tên, số thẻ, hạn thẻ, huấn luyện và ảnh từ bảng quản lý thẻ ra vào cổng" onClick={() => setSyncing(true)}><RefreshCw />Đồng bộ từ Google Sheets</Button><Button type="button" size="sm" className="h-9 text-xs" onClick={() => setCompanyForm({ mode: "create" })}><Plus />Thêm đơn vị</Button></div>}
    </div>
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border bg-muted/25 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground"><strong className="font-semibold text-foreground">{rows.length}</strong> đơn vị · <strong className="font-semibold text-foreground">{rows.reduce((sum, row) => sum + row.total, 0)}</strong> người</p>
        <div className="flex w-full items-center gap-2 md:w-auto">
          <span className="hidden text-sm text-muted-foreground md:inline">Tìm kiếm:</span>
          <input className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring md:w-72" aria-label="Tìm đơn vị nhà thầu" placeholder="Mã hoặc tên đơn vị nhà thầu…" value={q} maxLength={200} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      {companies.isPending ? <p role="status" className="p-6 text-sm">Đang tải danh sách đơn vị…</p>
        : companies.isError ? <p role="alert" className="p-6 text-red-700">{companies.error.message}</p>
        : !rows.length ? <p className="p-8 text-center text-sm text-muted-foreground">{q.trim() ? "Không có đơn vị nào khớp từ khóa." : "Chưa có đơn vị nhà thầu nào. Bấm “Thêm đơn vị” để bắt đầu."}</p>
        : <Table className="min-w-[720px]">
          <TableHeader><TableRow className={TR_HEAD}>
            <TableHead className={cn(TH_NAVY, TH_EXPAND)} />
            <TableHead className={cn(TH_NAVY, "w-16")}><PlainHeader label="STT" /></TableHead>
            <TableHead className={cn(TH_NAVY, "w-32")}><PlainHeader label="Mã đơn vị" /></TableHead>
            <TableHead className={TH_NAVY}><PlainHeader label="Tên đơn vị" align="left" /></TableHead>
            <TableHead className={cn(TH_NAVY, "w-40")}><PlainHeader label="Số lượng nhân viên" /></TableHead>
            <TableHead className={cn(TH_NAVY, "w-36")}><PlainHeader label="Số lượng CHTT" /></TableHead>
            {canWrite && <TableHead className={cn(TH_NAVY, "w-56")}><PlainHeader label="Thao tác" /></TableHead>}
          </TableRow></TableHeader>
          <TableBody>{rows.map((row, index) => {
            const expanded = openCompany === row.company;
            const rowBg = expanded ? "bg-sky-50" : rowBackground({ index });
            return <Fragment key={row.company}>
              <TableRow className={cn(rowBg, ROW_HOVER, "cursor-pointer")} onClick={() => setOpenCompany(expanded ? null : row.company)}>
                <TableCell className={cn(TD_EXPAND, "py-2.5")}><RowExpander expanded={expanded} onToggle={() => setOpenCompany(expanded ? null : row.company)} /></TableCell>
                <TableCell className={cn(TD_ROW, "py-2.5 text-center tabular-nums text-slate-500")}>{index + 1}</TableCell>
                <TableCell className={cn(TD_ROW, "py-2.5 text-center font-semibold tracking-wide text-blue-800")}>{row.code || <span className="font-normal text-slate-400">—</span>}</TableCell>
                <TableCell className={cn(TD_ROW, "py-2.5 font-semibold text-ink")}>{row.company}{row.active < row.total && <span className="ml-2 text-[11px] font-medium text-amber-700">{row.total - row.active} ngừng hoạt động</span>}</TableCell>
                <TableCell className={cn(TD_ROW, "py-2.5 text-center tabular-nums")}>{row.total}</TableCell>
                <TableCell className={cn(TD_ROW, "py-2.5 text-center tabular-nums")}>{row.commanders ? <span className="font-semibold text-emerald-700">{row.commanders}</span> : <span className="text-amber-700">0</span>}</TableCell>
                {canWrite && <TableCell className={cn(TD_ROW, "py-2.5")}>
                  <div className="flex items-center justify-center gap-1.5">
                    <Button type="button" size="sm" className="h-8 px-2.5 text-xs" title="Thêm nhân sự / CHTT cho đơn vị này" onClick={e => act(e, () => setAddingPersonTo(row.company))}><UserPlus size={14} />Thêm nhân sự</Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 px-2" aria-label={`Sửa đơn vị ${row.company}`} title="Sửa tên / mã đơn vị" onClick={e => act(e, () => setCompanyForm({ mode: "rename", company: row.company }))}><Pencil size={14} /></Button>
                    {row.total === 0 && <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-red-700 hover:text-red-800" disabled={removeCompany.isPending} aria-label={`Xóa đơn vị ${row.company}`} title="Xóa đơn vị chưa có nhân sự" onClick={e => act(e, () => void deleteCompany(row.company))}><Trash2 size={14} /></Button>}
                  </div>
                </TableCell>}
              </TableRow>
              {expanded && <TableRow className="hover:bg-transparent"><TableCell colSpan={colCount} className="border-b border-slate-100 bg-slate-50/80 p-0">
                <div className="border-l-[3px] border-[#00558F] px-4 py-3">
                  {people.isPending ? <p role="status" className="text-sm text-muted-foreground">Đang tải nhân sự…</p>
                    : people.isError ? <p role="alert" className="text-sm text-red-700">{people.error.message}</p>
                    : !people.data?.data.length ? <p className="text-sm text-muted-foreground">Đơn vị này chưa có nhân sự.{canWrite ? " Bấm “Thêm nhân sự” trên dòng đơn vị để thêm." : ""}</p>
                    : <CompanyPeopleTable people={people.data.data} canWrite={canWrite} removing={remove.isPending} onEdit={setEditing} onRemove={person => void removePerson(person)} />}
                </div>
              </TableCell></TableRow>}
            </Fragment>;
          })}</TableBody>
        </Table>}
    </div>
    {editing && <PersonEditor initial={editing} onClose={() => setEditing(null)} />}
    {addingPersonTo !== null && <PersonEditor presetCompany={addingPersonTo} onClose={() => setAddingPersonTo(null)} onSaved={() => setOpenCompany(addingPersonTo)} />}
    {syncing && <PeopleSyncDialog onClose={() => setSyncing(false)} />}
    {companyForm && <CompanyEditor company={companyForm.mode === "rename" ? companyForm.company : undefined} onClose={() => setCompanyForm(null)} onSaved={name => setOpenCompany(name)} />}
  </section>;
}

/** Danh sách người của một đơn vị, mỗi người một dòng: Họ tên · Số thẻ an toàn · SĐT · Vai trò. */
function CompanyPeopleTable({ people, canWrite, removing, onEdit, onRemove }: { people: PermitPerson[]; canWrite: boolean; removing: boolean; onEdit: (person: PermitPerson) => void; onRemove: (person: PermitPerson) => void }) {
  const th = "px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500";
  return <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
    <table className="w-full min-w-[640px] text-[12px]">
      <thead className="border-b border-slate-200 bg-slate-50"><tr>
        <th className={cn(th, "w-12 text-center")}>STT</th><th className={th}>Họ tên</th><th className={th}>Số thẻ an toàn</th><th className={th}>SĐT liên hệ</th><th className={th}>Vai trò</th>{canWrite && <th className={cn(th, "w-24 text-center")}>Thao tác</th>}
      </tr></thead>
      <tbody>{people.map((person, index) => <tr key={person.id} className="border-b border-slate-100 align-top last:border-0">
        <td className="px-3 py-2 text-center tabular-nums text-slate-500">{index + 1}</td>
        <td className="px-3 py-2">
          <span className="font-semibold text-ink">{person.name}</span>
          {person.activeWorks?.map(work => <p key={work.sessionId} className="mt-0.5 text-[11px] font-medium text-amber-700">Đang làm PCT {formatPermitNumber(work.permit)} · {PERMIT_KINDS[work.permit.kind]} · {work.role === "CHTT" ? "CHTT" : "Nhân viên công tác"} · từ {fmt(work.openedAt)}</p>)}
        </td>
        <td className="px-3 py-2 font-medium text-ink">{person.code}</td>
        <td className="px-3 py-2">{person.phone ? <a className="font-medium text-blue-700 underline" href={`tel:${person.phone.replace(/[^+\d]/g, "")}`}>{person.phone}</a> : <span className="text-muted-foreground">Chưa có</span>}</td>
        <td className="px-3 py-2"><div className="flex flex-wrap gap-1">
          {person.canCommand ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700">CHTT</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-600">Nhân viên</span>}
          {!person.isActive && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-700">Ngừng hoạt động</span>}
        </div></td>
        {canWrite && <td className="px-3 py-2"><div className="flex justify-center gap-1">
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" aria-label={`Sửa hồ sơ ${person.name}`} onClick={() => onEdit(person)}><Pencil size={13} /></Button>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-red-700 hover:text-red-800" disabled={removing} aria-label={`Xóa hồ sơ ${person.name}`} onClick={() => onRemove(person)}><Trash2 size={13} /></Button>
        </div></td>}
      </tr>)}</tbody>
    </table>
  </div>;
}

/**
 * Thêm mới hoặc sửa tên một đơn vị nhà thầu. Sửa tên là một lượt sửa hàng loạt trên hồ sơ người;
 * đổi sang tên đã có tức là GỘP hai đơn vị, cũng là cách duy nhất để dọn các bản ghi gõ sai.
 * PCT đã ghi giữ nguyên tên tại thời điểm thực hiện.
 */
function CompanyEditor({ company, onClose, onSaved }: { company?: string; onClose: () => void; onSaved?: (name: string) => void }) {
  const rename = useRenamePermitCompany();
  const create = useCreatePermitCompany();
  const companies = usePermitCompanySummary();
  const currentCode = companies.data?.data.find(row => row.company === company)?.code ?? "";
  const [name, setName] = useState(company ?? "");
  const [code, setCode] = useState(currentCode);
  const pending = rename.isPending || create.isPending;
  const exists = companies.data?.data.some(row => row.company !== company && row.company === name.trim()) ?? false;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); event.stopPropagation();
    const next = name.trim(), nextCode = code.trim().toUpperCase();
    if (!next) return;
    try {
      if (company === undefined) {
        await create.mutateAsync({ name: next, code: nextCode });
        toast.success(`Đã thêm đơn vị "${next}"`);
      } else {
        if (next === company && nextCode === currentCode) { onClose(); return; }
        if (exists && !window.confirm(`Đơn vị "${next}" đã có sẵn. Toàn bộ nhân sự của "${company}" sẽ được gộp vào đơn vị đó. Tiếp tục?`)) return;
        const result = await rename.mutateAsync({ from: company, to: next, code: nextCode });
        toast.success(next === company ? `Đã cập nhật mã đơn vị "${next}"` : `Đã cập nhật đơn vị "${next}" (${result.updated} hồ sơ nhân sự)`);
      }
      onSaved?.(next);
      onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể lưu đơn vị"); }
  }
  return <Dialog open onOpenChange={v => { if (!v && !pending) onClose(); }}><DialogContent>
    <DialogTitle>{company === undefined ? "Thêm đơn vị nhà thầu" : "Sửa đơn vị nhà thầu"}</DialogTitle>
    <DialogDescription>{company === undefined ? "Thêm đơn vị trước, sau đó bấm “Thêm nhân sự” trên dòng của đơn vị để khai báo từng người." : "Tên mới được áp cho mọi hồ sơ nhân sự của đơn vị này. Các PCT đã ghi giữ nguyên tên đơn vị tại thời điểm thực hiện."}</DialogDescription>
    <form onSubmit={submit}><fieldset disabled={pending} className="space-y-4">
      <label className="block space-y-1 text-sm"><span>Tên đơn vị *</span><input className={control} value={name} required autoFocus maxLength={200} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Công ty CP Cơ điện Miền Nam" /></label>
      <label className="block space-y-1 text-sm"><span>Mã đơn vị</span><input className={cn(control, "uppercase")} value={code} maxLength={30} onChange={e => setCode(e.target.value)} placeholder="Tên gọi tắt, ví dụ: VTTBCN" /><span className="block text-xs text-muted-foreground">Tên gọi tắt để nhận ra đơn vị nhanh; không trùng với đơn vị khác.</span></label>
      {exists && (company === undefined
        ? <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Đơn vị này đã có trong danh sách.</p>
        : <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Đơn vị này đã tồn tại — lưu sẽ GỘP toàn bộ nhân sự của &ldquo;{company}&rdquo; vào đó.</p>)}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Để sau</Button><Button type="submit" disabled={pending || (company === undefined && exists)}>{pending ? "Đang lưu…" : company === undefined ? "Thêm đơn vị" : "Lưu đơn vị"}</Button></div>
    </fieldset></form>
  </DialogContent></Dialog>;
}

/** Hộp thoại danh bạ nhân sự nhà thầu: chọn CHTT, chọn nhân viên công tác, hoặc tra cứu nhanh. */
export function PermitPeopleDirectory({ onClose, onPick, onPickMany, existingMembers = [], commandersOnly = false, company }: {
  onClose?: () => void; onPick?: (p: PermitPerson) => void; onPickMany?: (people: PermitPerson[]) => void; existingMembers?: PermitMember[]; commandersOnly?: boolean;
  /** Chỉ hiện người của đơn vị này (đơn vị công tác của phiếu) — không để chọn nhầm người đơn vị khác. */
  company?: string;
}) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<PermitPerson | "new" | null>(null);
  const [selected, setSelected] = useState<PermitPerson[]>([]);
  const remove = useDeletePermitPerson();
  const alreadyAdded = (person: PermitPerson) => existingMembers.some(member => member.personId === person.id || Boolean(member.code && member.code.normalize("NFC").trim().toUpperCase() === person.code.normalize("NFC").trim().toUpperCase()));
  const capacity = Math.max(0, 200 - existingMembers.length);
  function toggle(person: PermitPerson) {
    if (alreadyAdded(person)) return;
    setSelected(previous => previous.some(p => p.id === person.id) ? previous.filter(p => p.id !== person.id) : previous.length < capacity ? [...previous, person] : previous);
  }
  async function removePerson(person: PermitPerson) {
    if (!window.confirm(`Xóa ${person.name} (${person.code}) khỏi danh sách nhân sự nhà thầu?\n\nNếu người này đã xuất hiện trên PCT, hệ thống sẽ giữ hồ sơ và hướng dẫn chuyển sang ngừng hoạt động.`)) return;
    try { await remove.mutateAsync({ id: person.id, version: person.version }); toast.success("Đã xóa nhân sự nhà thầu"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không thể xóa hồ sơ"); }
  }
  useEffect(() => { const timer = setTimeout(() => { setSearch(q); setPage(1); }, 300); return () => clearTimeout(timer); }, [q]);
  const query = usePermitPeople({ q: search, page, active: Boolean(onPick || onPickMany), commander: commandersOnly, polling: Boolean(onPick || onPickMany), company });
  const heading = commandersOnly ? "Chọn CHTT nhà thầu" : onPickMany ? "Chọn nhân viên công tác" : "Danh sách nhân sự nhà thầu";
  const description = onPickMany ? "Đánh dấu nhiều nhân viên rồi bấm Thêm người đã chọn. Lựa chọn được giữ khi tìm kiếm hoặc chuyển trang; tối đa 200 nhân viên trong danh sách công tác." : "Mỗi người dùng một hồ sơ và số thẻ an toàn thống nhất giữa hai sổ Cơ và Điện. Đánh dấu CHTT cho người thuộc danh sách được cung cấp.";
  const body = <>
      <div className="flex flex-wrap gap-2">
        <input className={`${control} flex-1`} aria-label="Tìm nhân sự nhà thầu" placeholder="Số thẻ an toàn, họ tên, đơn vị nhà thầu…" value={q} maxLength={200} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} onChange={e => setQ(e.target.value)} />
        {query.data?.meta.canWrite && <Button type="button" onClick={() => setEditing("new")}><Plus />Thêm người</Button>}
      </div>
      {query.isPending ? <p role="status">Đang tải danh sách…</p> : query.isError ? <p role="alert" className="text-red-700">{query.error.message}</p> : <div className="space-y-2">
        {query.data?.data.map(p => <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div><b>{p.name}</b><p className="text-sm text-muted-foreground">{p.code} · {p.company}</p><p className="text-xs text-muted-foreground">{p.canCommand ? "CHTT / nhân viên công tác" : "Nhân viên công tác"}{!p.isActive ? " · Ngừng hoạt động" : ""}</p>{cardExpired(p.cardExpiresAt) && <p className="text-xs font-medium text-red-700">Thẻ ra vào hết hạn {new Date(p.cardExpiresAt!).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>}{p.activeWorks?.map(work => <p key={work.sessionId} className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">Đang làm PCT {formatPermitNumber(work.permit)} · {PERMIT_KINDS[work.permit.kind]} · {work.role === "CHTT" ? "CHTT" : "Nhân viên công tác"} · từ {fmt(work.openedAt)}</p>)}</div>
          <div className="flex gap-2">{onPickMany && <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" aria-label={`Chọn ${p.name} · ${p.code}`} checked={alreadyAdded(p) || selected.some(person => person.id === p.id)} disabled={alreadyAdded(p) || (!selected.some(person => person.id === p.id) && selected.length >= capacity)} onChange={() => toggle(p)} />{alreadyAdded(p) ? "Đã có" : "Chọn"}</label>}{onPick && <Button type="button" size="sm" onClick={() => onPick(p)}>Chọn</Button>}{!onPickMany && query.data?.meta.canWrite && <Button size="sm" variant="outline" aria-label={`Sửa hồ sơ ${p.name}`} onClick={() => setEditing(p)}><Pencil /></Button>}{!onPick && !onPickMany && query.data?.meta.canWrite && <Button size="sm" variant="outline" className="text-red-700 hover:text-red-800" disabled={remove.isPending} aria-label={`Xóa hồ sơ ${p.name}`} onClick={() => void removePerson(p)}><Trash2 /></Button>}</div>
        </div>)}
        {!query.data?.data.length && <p className="py-8 text-center text-muted-foreground">Chưa có nhân sự phù hợp.</p>}
      </div>}
      <div className="flex items-center justify-between gap-2 text-sm"><span>{query.data?.meta.total ?? 0} người · Trang {page}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={page <= 1 || query.isFetching} onClick={() => setPage(page - 1)}>Trước</Button><Button type="button" variant="outline" disabled={!query.data || page * 25 >= query.data.meta.total || query.isFetching} onClick={() => setPage(page + 1)}>Sau</Button></div></div>
      {onPickMany && <div className="space-y-3 border-t border-border pt-3">
        <p aria-live="polite" className="text-sm font-medium">Đã chọn thêm {selected.length} người · Danh sách hiện có {existingMembers.length} người</p>
        {selected.length > 0 && <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">{selected.map(person => <Button key={person.id} type="button" size="sm" variant="outline" aria-label={`Bỏ chọn ${person.name} · ${person.code}`} onClick={() => toggle(person)}>{person.name}<X size={14} /></Button>)}</div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onClose?.()}>Để sau</Button><Button type="button" disabled={!selected.length} onClick={() => onPickMany(selected)}>Thêm {selected.length || ""} người đã chọn</Button></div>
      </div>}
      {editing && <PersonEditor initial={editing === "new" ? undefined : editing} presetCompany={editing === "new" ? company : undefined} onClose={() => setEditing(null)} />}
  </>;
  return <Dialog open onOpenChange={v => { if (!v) onClose?.(); }}>
    <DialogContent className="max-w-3xl">
      <DialogTitle>{heading}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      {company && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">Chỉ hiện nhân sự của đơn vị công tác trên phiếu: <b>{company}</b></p>}
      {body}
    </DialogContent>
  </Dialog>;
}

/**
 * Thêm/sửa hồ sơ một người. Mở từ nút "Thêm nhân sự" trên dòng đơn vị thì `presetCompany` điền
 * sẵn và KHOÁ đơn vị — người dùng đã chọn đơn vị bằng chính dòng họ bấm, hỏi lại là thừa. Mặc định
 * đánh dấu CHTT vì nhập theo đơn vị chủ yếu là để khai báo danh sách CHTT nhà thầu cung cấp.
 */
function PersonEditor({ initial, presetCompany, onClose, onSaved }: { initial?: PermitPerson; presetCompany?: string; onClose: () => void; onSaved?: () => void }) {
  const [form, setForm] = useState(initial ?? { code: "", name: "", company: presetCompany ?? "", phone: "", canCommand: presetCompany !== undefined, isActive: true });
  const save = useSavePermitPerson();
  async function submit(e: React.FormEvent) {
    e.preventDefault(); e.stopPropagation();
    try { await save.mutateAsync({ id: initial?.id, body: form }); toast.success("Đã lưu hồ sơ nhân sự nhà thầu"); onSaved?.(); onClose(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không thể lưu hồ sơ"); }
  }
  return <Dialog open onOpenChange={v => { if (!v && !save.isPending) onClose(); }}><DialogContent>
    <DialogTitle>{initial ? "Cập nhật nhân sự nhà thầu" : presetCompany ? `Thêm nhân sự · ${presetCompany}` : "Thêm nhân sự nhà thầu"}</DialogTitle>
    <DialogDescription>Tìm hồ sơ có sẵn trước khi thêm. Có thể cập nhật số thẻ, họ tên, nhà thầu và vai trò khi thông tin thực tế thay đổi.</DialogDescription>
    <form onSubmit={submit}><fieldset disabled={save.isPending} className="space-y-4">
      {(["code", "name"] as const).map(key => <label key={key} className="block space-y-1 text-sm"><span>{({ code: "Số thẻ an toàn *", name: "Họ tên *", company: "Nhà thầu *" })[key]}</span><input className={control} value={form[key]} required maxLength={key === "code" ? 80 : 200} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
      <p className="text-xs text-muted-foreground">Có thể sửa số thẻ, họ tên, nhà thầu và vai trò. Các PCT đã ghi vẫn giữ nguyên thông tin tại thời điểm thực hiện.</p>
      {presetCompany !== undefined ? <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">Đơn vị: <strong>{presetCompany}</strong></p> : <PermitCompanyPicker value={form.company} onChange={company => setForm(prev => ({ ...prev, company }))} />}
      <label className="block space-y-1 text-sm"><span>SĐT liên hệ</span><input className={control} type="tel" inputMode="tel" maxLength={40} value={form.phone ?? ""} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Ví dụ: 0912 345 678" /><span className="block text-xs text-muted-foreground">Không bắt buộc; dùng để gọi khi cần liên hệ đơn vị công tác.</span></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.canCommand} onChange={e => setForm({ ...form, canCommand: e.target.checked })} />Có trong danh sách CHTT nhà thầu</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />Đang hoạt động</label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Để sau</Button><Button disabled={save.isPending}>{save.isPending ? "Đang lưu…" : "Lưu hồ sơ"}</Button></div>
    </fieldset></form>
  </DialogContent></Dialog>;
}

export function PermitMembersEditor({ members, onChange, commander, scan }: {
  members: PermitMember[]; onChange: (value: PermitMember[]) => void; commander?: PermitMember;
  /** Có thì hiện "Quét thẻ" và lọc "Chọn từ danh sách" theo đơn vị công tác của phiếu. */
  scan?: { unit: string; companies: string[]; permitId: string };
}) {
  const [picking, setPicking] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Máy quét thêm từng người liên tiếp nhanh hơn một lần render → cộng dồn trên bản mới nhất, không trên props cũ.
  const latest = useRef(members);
  useEffect(() => { latest.current = members; }, [members]);
  function addOne(member: PermitMember) {
    const current = latest.current;
    if (current.some(m => m.personId === member.personId || Boolean(m.code && m.code.normalize("NFC").trim().toUpperCase() === member.code))) return true;
    if (current.length >= 200) return false;
    latest.current = [...current, member];
    onChange(latest.current);
    return true;
  }
  function add(people: PermitPerson[]) {
    const additions = people.filter(person => !members.some(member => member.personId === person.id || Boolean(member.code && member.code.normalize("NFC").trim().toUpperCase() === person.code.normalize("NFC").trim().toUpperCase())));
    if (members.length + additions.length > 200) { toast.error("Danh sách công tác tối đa 200 người"); return; }
    onChange([...members, ...additions.map(p => ({ personId: p.id, code: p.code, name: p.name, company: p.company }))]);
    setPicking(false);
  }
  return <div className="space-y-3 rounded-lg border border-border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Nhân viên công tác bổ sung (nếu có) · {members.length} người</h4><div className="flex flex-wrap gap-2">{scan && <Button size="sm" type="button" disabled={members.length >= 200} onClick={() => setScanning(true)}><ScanLine />Quét thẻ</Button>}<Button size="sm" variant="outline" type="button" disabled={members.length >= 200} onClick={() => setPicking(true)}><Users />Chọn từ danh sách</Button><Button size="sm" variant="outline" type="button" disabled={members.length >= 200} onClick={() => onChange([...members, { code: "", name: "", company: "" }])}><Plus />Nhập tên</Button></div></div>
    <p className="text-xs text-muted-foreground">CHTT đã được tính là người công tác, không cần chọn lại. Chỉ thêm người đi cùng nếu cần; có thể để trống.</p>
    {members.map((m, i) => <div key={m.personId ?? i} className="flex items-start gap-2"><div className="grid flex-1 gap-2 sm:grid-cols-3">{(["code", "name", "company"] as const).map(key => <input key={key} className={control} required={key === "name"} maxLength={key === "code" ? 80 : 200} readOnly={Boolean(m.personId)} aria-label={`${({ code: "Số thẻ an toàn", name: "Họ tên", company: "Đơn vị" })[key]} nhân viên ${i + 1}`} placeholder={({ code: "Số thẻ an toàn (nếu có)", name: "Họ tên *", company: "Đơn vị" })[key]} value={m[key]} onChange={e => onChange(members.map((p, index) => index === i ? { ...p, [key]: e.target.value } : p))} />)}</div><Button type="button" variant="ghost" size="icon" aria-label={`Bỏ nhân viên ${i + 1}`} onClick={() => onChange(members.filter((_, index) => index !== i))}><X /></Button></div>)}
    {picking && <PermitPeopleDirectory onClose={() => setPicking(false)} onPickMany={add} existingMembers={commander ? [...members, commander] : members} company={scan?.unit} />}
    {scanning && scan && <PermitCardScanner unit={scan.unit} companies={scan.companies} permitId={scan.permitId} existing={commander ? [...members, commander] : members} onAdd={addOne} onClose={() => setScanning(false)} />}
  </div>;
}

export function ContractorSessions({ permit, canExecute }: { permit: PermitDetailRow; canExecute: boolean }) {
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [action, setAction] = useState<"open" | PermitSession | null>(null);
  const [handoff, setHandoff] = useState(false);
  const older = usePermitActivity<PermitSession>(permit.id, "sessions", permit.version, showAllSessions && permit.teamType === "CONTRACTOR");
  const visibleSessions = [...permit.sessions, ...(showAllSessions ? older.data?.pages.flatMap(page => page.data) ?? [] : [])];
  if (permit.teamType !== "CONTRACTOR") return null;
  const live = permit.sessions.find(s => !s.endedAt);
  return <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/40 p-4 dark:bg-sky-950/20">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Các lần làm việc của nhà thầu</h3>{canExecute && !live && ["ISSUED", "WAITING"].includes(permit.status) && <Button onClick={() => { setHandoff(false); setAction("open"); }}><Play />Cho phép / mở lần làm việc</Button>}</div>
    <p className="text-sm text-muted-foreground">Mỗi lần lưu riêng CHTT, nhân viên và thời gian. Kết thúc lần làm việc giải phóng CHTT để làm phiếu khác; PCT vẫn giữ để tiếp tục lần sau.</p>
    {!permit.sessions.length && <p className="rounded-lg bg-background p-3 text-sm">Chưa ghi nhận lần làm việc. Phiếu phải được cấp trước khi mở lần đầu.</p>}
    {visibleSessions.map(s => <article key={s.id} className={`space-y-2 rounded-lg border bg-background p-3 ${s.endedAt ? "border-border" : "border-emerald-400"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div><b>{s.commanderName} · {s.commanderCode}</b><p className="text-sm text-muted-foreground">{s.company}</p></div>{!s.endedAt && canExecute && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setHandoff(true); setAction(s); }}>Bàn giao / đổi CHTT</Button><Button variant="outline" onClick={() => { setHandoff(false); setAction(s); }}><Square />Kết thúc lần làm việc</Button></div>}</div>
      <p className="text-sm"><strong>{fmt(s.openedAt)}</strong> → {s.endedAt ? fmt(s.endedAt) : <strong className="text-emerald-700">Đang làm · chưa kết thúc</strong>}</p>
      <p className="text-sm">Người cho phép: {s.authorizerName} · CHTT và {s.members.filter(m => m.personId ? m.personId !== s.commanderId : m.code !== s.commanderCode).length} nhân viên bổ sung</p>
      {s.endedAt && <p className="text-sm">Xác nhận kết thúc: {s.endConfirmedByName}{s.progress != null ? ` · Tiến độ ${s.progress}%` : ""}{s.endNote ? ` · ${s.endNote}` : ""}</p>}
      <details className="text-sm"><summary className="cursor-pointer">Nhân viên và thông tin ghi nhận</summary><div className="mt-2 space-y-1">{s.members.length ? s.members.map((m, i) => <p key={i}>{i + 1}. {[m.name, m.code, m.company].filter(Boolean).join(" · ")}</p>) : <p>Chưa bổ sung danh sách chi tiết.</p>}<p className="pt-2 text-xs text-muted-foreground">Người nhập mở: {s.createdByName}{s.endedByName ? ` · Người nhập kết thúc: ${s.endedByName}` : ""}</p></div></details>
    </article>)}
    {showAllSessions && older.isError && <p role="alert" className="text-sm text-red-700">{older.error.message}</p>}
    {permit._count.sessions > 2 && <div className="flex flex-wrap gap-2">
      {(!showAllSessions || older.hasNextPage || older.isPending || older.isError) && <Button type="button" variant="outline" disabled={showAllSessions && older.isFetching} onClick={() => { if (!showAllSessions) setShowAllSessions(true); else if (older.isError) older.refetch(); else older.fetchNextPage(); }}>{showAllSessions && older.isFetching ? "Đang tải…" : showAllSessions && older.isError ? "Thử lại" : `Xem thêm lần làm việc (${Math.max(0, permit._count.sessions - visibleSessions.length)} còn lại)`}</Button>}
      {showAllSessions && <Button type="button" variant="ghost" onClick={() => setShowAllSessions(false)}>Thu gọn — 2 lần gần nhất</Button>}
    </div>}
    {action && <SessionEditor handoff={handoff} permit={permit} session={action === "open" ? undefined : action} onClose={() => setAction(null)} />}
  </section>;
}

function SessionEditor({ permit, session, handoff = false, onClose }: { permit: PermitDetailRow; session?: PermitSession; handoff?: boolean; onClose: () => void }) {
  const ending = Boolean(session) && !handoff;
  const [person, setPerson] = useState<Pick<PermitPerson, "id" | "name" | "code" | "company"> | null>(() => {
    if (handoff) return null;
    const previous = permit.sessions[0];
    if (previous) return { id: previous.commanderId, name: previous.commanderName, code: previous.commanderCode, company: previous.company };
    return permit.commanderPersonId ? { id: permit.commanderPersonId, name: permit.commanderName, code: "", company: permit.teamName } : null;
  });
  const [picking, setPicking] = useState(false);
  const [at, setAt] = useState(vnNow());
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState(String(permit.progress ?? 0));
  const [members, setMembers] = useState<PermitMember[]>(permit.sessions[0]?.members ?? permit.members ?? []);
  const additionalMembers = members.filter(m => !person || (m.personId ? m.personId !== person.id : !person.code || m.code !== person.code));
  const [error, setError] = useState("");
  const save = usePermitSessionAction(permit.id);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); e.stopPropagation(); setError("");
    const timestamp = `${at}:00+07:00`;
    const body = ending && session
      ? { action: "end", version: permit.version, sessionId: session.id, endedAt: timestamp, endConfirmedByName: name, endNote: note, progress: Number(progress) }
      : { action: handoff ? "handoff" : "open", sessionId: session?.id, endNote: note, version: permit.version, commanderId: person?.id, openedAt: timestamp, authorizerName: name, members: additionalMembers };
    try { await save.mutateAsync(body); toast.success(handoff ? "Đã bàn giao sang CHTT mới, giữ lịch sử và thời điểm bàn giao" : ending ? "Đã kết thúc lần làm việc; CHTT được giải phóng, PCT chờ làm tiếp" : "Đã mở lần làm việc và ghi nhận CHTT đang thực hiện"); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Không thể ghi nhận lần làm việc"); }
  }
  return <Dialog open onOpenChange={v => { if (!v && !save.isPending) onClose(); }}><DialogContent className="max-w-3xl">
    <DialogTitle>{handoff ? "Bàn giao / đổi CHTT" : ending ? "Kết thúc lần làm việc" : "Cho phép / mở lần làm việc"} · PCT {formatPermitNumber(permit)}</DialogTitle>
    <DialogDescription>{handoff ? "Chọn CHTT mới và thời điểm bàn giao thực tế. Hệ thống kết thúc lần cũ, mở lần mới cùng thời điểm trong một lần lưu; nếu CHTT mới đang bận, việc bàn giao không được thực hiện." : ending ? "Ghi thời điểm kết thúc thực tế. Thao tác này không đóng toàn bộ PCT." : "CHTT phải có trong danh sách nhà thầu và không trùng thời gian làm việc trên PCT khác, kể cả khác sổ Cơ/Điện."}</DialogDescription>
    <form onSubmit={submit}><fieldset disabled={save.isPending} className="space-y-4">
      {!ending && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"><Button type="button" variant="outline" onClick={() => setPicking(true)}>Chọn CHTT nhà thầu *</Button><span className="text-sm">{person ? `${person.name} · ${person.code} · ${person.company}` : "Chưa chọn CHTT"}</span></div>}
      {session && <p className="text-sm">CHTT: <b>{session.commanderName}</b> · Mở lúc {fmt(session.openedAt)}</p>}
      <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>{handoff ? "Thời điểm bàn giao" : ending ? "Thời điểm kết thúc" : "Thời điểm cho phép"} (giờ Việt Nam) *</span><input className={control} type="datetime-local" value={at} required onChange={e => setAt(e.target.value)} /></label><PermitEmployeePicker label={handoff ? "Người xác nhận bàn giao" : ending ? "Người xác nhận kết thúc" : "Người cho phép làm việc"} value={name} onChange={setName} required /></div>
      {ending && <label className="block space-y-2 text-sm"><span className="font-medium">Tiến độ công việc *</span><div className="flex items-center gap-4 rounded-lg border border-border p-3"><input className="h-2 flex-1 cursor-pointer accent-blue-700" type="range" min={0} max={100} step={1} value={progress} onChange={e => setProgress(e.target.value)} /><div className="relative w-28"><input className={`${control} pr-8 text-right tabular-nums`} type="number" min={0} max={100} step={1} required value={progress} onChange={e => setProgress(e.target.value)} /><span className="pointer-events-none absolute right-3 top-2.5 text-muted-foreground">%</span></div></div><p className="text-xs text-muted-foreground">Ghi tiến độ lũy kế của toàn bộ công việc tại thời điểm kết thúc lần này.</p></label>}
      {!ending && <><p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-950">CHTT tự được tính vào người công tác. Tổng: {person ? 1 + additionalMembers.length : additionalMembers.length} người.</p><PermitMembersEditor members={additionalMembers} onChange={setMembers} commander={person ? { personId: person.id, name: person.name, code: person.code, company: person.company } : undefined}
        scan={{ unit: permit.teamName, companies: [permit.teamName, person?.company ?? ""].filter(Boolean), permitId: permit.id }} /></>}
      {(ending || handoff) && <label className="block space-y-1 text-sm"><span>{handoff ? "Ghi chú bàn giao" : "Ghi chú kết thúc lần làm việc"}</span><textarea className={control} rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Để sau</Button><Button type="submit" disabled={save.isPending || !name || (ending && progress === "") || (!ending && (!person || (handoff && person.id === session?.commanderId)))}>{save.isPending ? "Đang ghi nhận…" : handoff ? "Xác nhận bàn giao CHTT" : ending ? "Ghi nhận kết thúc lần làm việc" : "Ghi nhận cho phép làm việc"}</Button></div>
    </fieldset></form>
    {picking && <PermitPeopleDirectory commandersOnly company={permit.teamName || undefined} onClose={() => setPicking(false)} onPick={p => { setPerson(p); setPicking(false); }} />}
  </DialogContent></Dialog>;
}
