"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PersonViolations } from "@/components/work-permits/person-violations";
import { usePermitCompanySummary, usePermitPeople } from "@/hooks/useWorkPermits";
import { normalizeText } from "@/lib/nav";
import { isCardlessCode } from "@/lib/work-permit-card";

const control = "min-h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm";

/** Tra cứu độc lập với nhóm phiếu và tình trạng tham gia PCT; phân trang trên máy chủ. */
export function ContractorPeopleSearch() {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="outline" className="h-10 text-xs sm:h-9" onClick={() => setOpen(true)}><Search size={16} />Tra cứu nhân viên</Button>
    {open && <Dialog open onOpenChange={setOpen}><DialogContent className="flex w-[calc(100%-1rem)] max-w-3xl flex-col gap-3 overflow-hidden rounded-xl p-4 sm:p-6">
      <DialogTitle className="pr-7">Tra cứu nhân viên</DialogTitle>
      <DialogDescription>Tìm trong toàn danh bạ nhà thầu, kể cả người chưa tham gia PCT hoặc đã ngừng hoạt động.</DialogDescription>
      <PeopleSearch />
    </DialogContent></Dialog>}
  </>;
}

function PeopleSearch() {
  const companies = usePermitCompanySummary();
  const [companySearch, setCompanySearch] = useState("");
  const [company, setCompany] = useState("");
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState({ q: "", company: "", page: 1 });
  useEffect(() => {
    if (filter.q === input.trim() && filter.company === company) return;
    const timer = setTimeout(() => setFilter({ q: input.trim(), company, page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [input, company, filter.q, filter.company]);
  const people = usePermitPeople(filter);
  const waiting = filter.q !== input.trim() || filter.company !== company;
  const companyTerm = normalizeText(companySearch.trim());
  const options = (companies.data?.data ?? []).filter(row => row.company === company || normalizeText(`${row.code} ${row.company}`).includes(companyTerm));
  const total = people.data?.meta.total ?? 0;
  const pageSize = people.data?.meta.pageSize ?? 25;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block min-w-0 space-y-1 text-sm font-medium"><span>Tìm nhà thầu</span><input type="search" className={control} value={companySearch} maxLength={200} onChange={event => setCompanySearch(event.target.value)} placeholder="Mã hoặc tên nhà thầu, có thể nhập không dấu…" /></label>
      <label className="block min-w-0 space-y-1 text-sm font-medium"><span>Nhà thầu</span><select aria-label="Nhà thầu" className={control} value={company} onChange={event => setCompany(event.target.value)}><option value="">Tất cả nhà thầu</option>{options.map(row => <option key={row.company} value={row.company}>{row.code ? `${row.code} · ` : ""}{row.company}</option>)}</select></label>
    </div>
    {companies.isPending ? <p role="status" className="text-xs text-muted-foreground">Đang tải nhà thầu…</p> : companies.isError ? <div role="alert" className="text-sm text-red-700">{companies.error.message} <Button type="button" variant="outline" className="h-10" onClick={() => void companies.refetch()}>Tải lại nhà thầu</Button></div> : options.length === 0 && <p className="text-xs text-muted-foreground">Không có nhà thầu khớp từ khóa.</p>}
    <label className="block space-y-1 text-sm font-medium"><span>Tìm nhân viên</span><input type="search" className={control} value={input} maxLength={200} onChange={event => setInput(event.target.value)} placeholder="Họ tên không dấu, số thẻ hoặc SĐT…" /></label>
    {(input || company || companySearch) && <Button type="button" variant="outline" className="h-10" onClick={() => { setInput(""); setCompany(""); setCompanySearch(""); }}>Xóa bộ lọc</Button>}
    {people.isError ? <div role="alert" className="space-y-2 text-sm text-red-700"><p>{people.error.message}</p><Button type="button" variant="outline" className="h-10" onClick={() => void people.refetch()}>Tải lại kết quả</Button></div>
      : waiting || people.isPending ? <p role="status" className="py-5 text-sm text-muted-foreground">Đang tìm nhân viên…</p>
      : <>
        <p role="status" className="text-sm text-muted-foreground"><strong className="text-foreground">{total}</strong> nhân viên{company ? ` thuộc ${company}` : " trong toàn danh bạ"}</p>
        {!total ? <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Không có nhân viên phù hợp. Hãy đổi từ khóa hoặc chọn nhà thầu khác.</p>
          : <ul aria-label="Kết quả tra cứu nhân viên" className="max-h-[40vh] space-y-2 overflow-y-auto overscroll-contain pr-1">{people.data?.data.map(person => <li key={person.id} className="min-w-0 space-y-1 rounded-lg border border-border p-3 text-sm [overflow-wrap:anywhere]">
            <div className="flex flex-wrap items-center gap-2"><strong>{person.name}</strong>{person.canCommand && <span className="rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-800">CHTT</span>}{!person.isActive && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Ngừng hoạt động</span>}</div>
            <p className="text-muted-foreground">{person.company}</p>
            <p className="text-xs text-muted-foreground">{isCardlessCode(person.code) ? "Chưa có thẻ" : `Số thẻ: ${person.code}`}{person.phone && ` · SĐT: ${person.phone}`}</p>
            {person.violations?.length ? <PersonViolations person={person} compact /> : <p className="text-xs font-medium text-emerald-700">Chưa ghi nhận vi phạm</p>}
          </li>)}</ul>}
        {pages > 1 && <nav aria-label="Phân trang tra cứu" className="flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="outline" className="h-10" disabled={filter.page <= 1 || people.isFetching} onClick={() => setFilter(current => ({ ...current, page: current.page - 1 }))}>Trước</Button><span className="text-sm text-muted-foreground">Trang {filter.page}/{pages}</span><Button type="button" variant="outline" className="h-10" disabled={filter.page >= pages || people.isFetching} onClick={() => setFilter(current => ({ ...current, page: current.page + 1 }))}>Sau</Button></nav>}
      </>}
  </div>;
}
