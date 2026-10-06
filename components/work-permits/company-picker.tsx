"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePermitCompanies, usePermitCompanySummary, type PermitCompanySummary } from "@/hooks/useWorkPermits";
import { normalizeText } from "@/lib/nav";
import { companyAllowsScope, companyUnclassified } from "@/lib/work-permits";

const control = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const optionLabel = (row: PermitCompanySummary) => row.code ? `${row.code} · ${row.company}` : row.company;

/**
 * Bộ chọn dùng trên biểu mẫu PCT: tìm theo mã hoặc tên đơn vị, kể cả khi nhập không dấu. `scope` (nhóm phiếu SCTX / Đại tu)
 * → chỉ hiện đơn vị đã phân loại đúng nhóm, rồi nhóm "Chưa phân loại" ở cuối; đơn vị khác nhóm bị ẩn (máy chủ cũng chặn).
 */
export function PermitCompanySelect({ value, onChange, required = false, label = "Đơn vị công tác", scope }: {
  value: string;
  onChange: (company: string) => void;
  required?: boolean;
  label?: string;
  scope?: string | null;
}) {
  const companies = usePermitCompanySummary();
  const [search, setSearch] = useState("");
  const term = normalizeText(search.trim());
  const rows = (companies.data?.data ?? []).filter(row => companyAllowsScope(row, scope));
  const matches = rows.filter(row => row.company === value || normalizeText(`${row.code} ${row.company}`).includes(term));
  const classified = matches.filter(row => !companyUnclassified(row)), unclassified = matches.filter(row => companyUnclassified(row));
  const currentMissing = value && !matches.some(row => row.company === value);
  // Phiếu cũ đang ghi đơn vị mà nay đã phân loại khác nhóm: vẫn hiện để không mất giá trị, kèm nhãn.
  const currentOther = currentMissing && (companies.data?.data ?? []).some(row => row.company === value && !companyAllowsScope(row, scope));

  return <div className="space-y-1.5 text-[13px]">
    <span className="block font-medium">{label}{required ? " *" : ""}</span>
    <input
      type="search"
      className={control}
      aria-label={`Tìm ${label.toLowerCase()}`}
      value={search}
      maxLength={200}
      placeholder="Tìm theo mã hoặc tên nhà thầu, có thể nhập không dấu…"
      onChange={event => setSearch(event.target.value)}
      onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
    />
    <select className={control} required={required} value={value} onChange={event => onChange(event.target.value)}>
      <option value="">{companies.isPending ? "Đang tải đơn vị nhà thầu…" : "Chọn đơn vị nhà thầu"}</option>
      {currentMissing && <option value={value}>{value}{currentOther ? " (khác nhóm phiếu)" : ""}</option>}
      {scope && unclassified.length && classified.length
        ? <>
          <optgroup label={`Nhà thầu ${scope === "OVERHAUL" ? "Đại tu" : "SCTX"}`}>{classified.map(row => <option key={row.company} value={row.company}>{optionLabel(row)}</option>)}</optgroup>
          <optgroup label="Chưa phân loại">{unclassified.map(row => <option key={row.company} value={row.company}>{optionLabel(row)}</option>)}</optgroup>
        </>
        : [...classified, ...unclassified].map(row => <option key={row.company} value={row.company}>{optionLabel(row)}</option>)}
    </select>
    {companies.isError
      ? <span role="alert" className="block text-xs text-red-700">{companies.error.message}</span>
      : currentOther ? <span role="alert" className="block text-xs text-red-700">Đơn vị này đã phân loại khác nhóm phiếu. Phiếu mới, hoặc đổi đơn vị / nhóm phiếu, sẽ bị chặn khi lưu — hãy chọn đơn vị khác.</span>
      : !companies.isPending && !matches.length && <span className="block text-xs text-muted-foreground">Không có đơn vị phù hợp.</span>}
  </div>;
}

export function PermitCompanyPicker({ value, onChange }: { value: string; onChange: (company: string) => void }) {
  const companies = usePermitCompanies();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const term = normalizeText(search.trim());
  const names = companies.data?.data ?? [];
  // Giữ lựa chọn hiện tại khi lọc hoặc khi đang tải danh sách.
  const matches = names.filter(name => name === value || normalizeText(name).includes(term));
  const options = value && !matches.includes(value) ? [value, ...matches] : matches;
  return <div className="space-y-2 rounded-lg border border-border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">Nhà thầu *</span><Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(!adding); setSearch(""); onChange(""); }}>{adding ? "Chọn nhà thầu đã có" : "Nhập nhà thầu mới"}</Button></div>
    {adding ? <label className="block space-y-1 text-sm"><span>Tên nhà thầu mới</span><input className={control} value={value} required maxLength={200} placeholder="Nhập tên đầy đủ của nhà thầu" onChange={e => onChange(e.target.value)} /><span className="block text-xs text-muted-foreground">Tên mới sẽ có trong danh sách sau khi lưu nhân sự.</span></label> : <>
      <label className="block space-y-1 text-sm"><span>Tìm nhà thầu</span><input className={control} value={search} maxLength={200} placeholder="Tìm theo tên, có thể nhập không dấu…" onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} /></label>
      <label className="block space-y-1 text-sm"><span>Chọn nhà thầu đã nhập</span><select className={control} required value={value} onChange={e => onChange(e.target.value)}><option value="">{companies.isPending ? "Đang tải nhà thầu…" : "Chọn nhà thầu"}</option>{options.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      {companies.isError ? <div role="alert" className="text-sm text-red-700">{companies.error.message} <Button type="button" variant="ghost" size="sm" onClick={() => companies.refetch()}>Tải lại</Button></div> : !companies.isPending && !matches.length && <p className="text-xs text-muted-foreground">Không có nhà thầu phù hợp. Có thể chọn “Nhập nhà thầu mới”.</p>}
      <p className="text-xs text-muted-foreground">Dùng lại tên đã có để tránh nhập khác nhau giữa các nhân sự.</p>
    </>}
  </div>;
}
