"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { usePermitCompanySummary } from "@/hooks/useWorkPermits";
import { OPERATION_POSITION_TITLES } from "@/lib/positions";
import { PERMIT_DISCIPLINES, PERMIT_SOURCE_CLASSIFICATIONS, PERMIT_UNITS, type PermitDiscipline, type PermitInput, type PermitSourceClassification } from "@/lib/work-permits";

const control = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10";
const label = "block space-y-1.5 text-[13px]";
const section = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-border dark:bg-background sm:p-5";
const title = "mb-4 border-b border-slate-200 pb-2 text-sm font-bold text-slate-900 dark:border-border dark:text-foreground";

export function MechanicalPaperInfo({ form, issued, numberField, onChange, onPickSyc }: {
  form: PermitInput;
  issued: boolean;
  numberField: ReactNode;
  onChange: <K extends keyof PermitInput>(key: K, value: PermitInput[K]) => void;
  onPickSyc: () => void;
}) {
  const field = (key: "managingUnit" | "teamName" | "registrationNumber" | "location", fieldLabel: string, required = false) =>
    <label className={label}><span className="font-medium">{fieldLabel}{required ? " *" : ""}</span><input className={control} required={required} maxLength={key === "location" ? 500 : 200} value={String(form[key] ?? "")} onChange={event => onChange(key, event.target.value)} /></label>;
  const contractor = form.teamType === "CONTRACTOR";
  // Phiếu nhà thầu: chọn đúng tên đơn vị trong danh bạ để quét thẻ/lọc nhân sự khớp đơn vị của phiếu.
  const companies = usePermitCompanySummary();
  const companyRows = companies.data?.data ?? [];
  const teamField = contractor
    ? <label className={label}><span className="font-medium">Đơn vị công tác{issued ? " *" : ""}</span>
      <select className={control} required={issued} value={form.teamName} onChange={event => onChange("teamName", event.target.value)}>
        <option value="">{companies.isPending ? "Đang tải đơn vị nhà thầu…" : "Chọn đơn vị nhà thầu"}</option>
        {form.teamName && !companyRows.some(row => row.company === form.teamName) && <option value={form.teamName}>{form.teamName}</option>}
        {companyRows.map(row => <option key={row.company} value={row.company}>{row.code ? `${row.code} · ${row.company}` : row.company}</option>)}
      </select>
      {companies.isError && <span role="alert" className="block text-xs text-red-700">{companies.error.message}</span>}
    </label>
    : field("teamName", "Đơn vị công tác", issued);

  return <div className="space-y-4">
    <section className={section}><h3 className={title}>Thông tin chung trên phiếu</h3>
      <div className="grid gap-4 md:grid-cols-2">
        {field("registrationNumber", "Số phiếu ĐKCT")}
        {numberField}
        {teamField}
        {field("managingUnit", "Đơn vị QLVH", true)}
        <fieldset className="rounded-lg border border-slate-200 px-3 pb-3 pt-1 md:col-span-2 dark:border-border">
          <legend className="px-1 text-[13px] font-medium">Phân loại</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {Object.entries(PERMIT_SOURCE_CLASSIFICATIONS).map(([key, value]) => <label key={key} className="flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md px-2 text-[13px] hover:bg-slate-50 dark:hover:bg-muted/50"><input type="radio" name="permit-source-classification" className="h-4 w-4 accent-blue-700" checked={form.sourceClassification === key} onChange={() => onChange("sourceClassification", key as PermitSourceClassification)} />{value}</label>)}
          </div>
        </fieldset>
        <label className={label}><span className="font-medium">Tổ máy *</span><select className={control} value={form.unit} onChange={event => onChange("unit", event.target.value as PermitInput["unit"])}>{Object.entries(PERMIT_UNITS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        <label className={label}><span className="font-medium">Ngày thực hiện *</span><input className={control} required type="date" value={form.workDate} onChange={event => onChange("workDate", event.target.value)} /></label>
        <div className={label}><span className="font-medium">Số SYC</span><div className="flex gap-2"><input className={control} maxLength={100} value={form.repairRequestNumber} onChange={event => { onChange("repairRequestNumber", event.target.value); onChange("defectId", null); }} /><Button type="button" variant="outline" className="shrink-0" onClick={onPickSyc}>Chọn SYC</Button></div><p className="text-xs text-muted-foreground">Chọn SYC để tạo liên kết; số nhập tay chỉ để đối chiếu.</p></div>
        <label className={label}><span className="font-medium">Cương vị</span><select className={control} value={form.position} onChange={event => onChange("position", event.target.value)}><option value="">Tất cả cương vị</option>{OPERATION_POSITION_TITLES.map(value => <option key={value} value={value}>{value}</option>)}</select><span className="block text-xs text-muted-foreground">Dùng để ghi cương vị trên phiếu.</span></label>
      </div>
    </section>

    <section className={section}><h3 className={title}>Phần A. Cấp phiếu công tác</h3><div className="space-y-4">
      <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-border">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-muted-foreground">Chuyên môn trên PCT</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(PERMIT_DISCIPLINES).map(([key, value]) => <label key={key} className="flex min-h-8 cursor-pointer items-center justify-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-blue-700" checked={(form.disciplines ?? []).includes(key as PermitDiscipline)} onChange={event => onChange("disciplines", event.target.checked ? [...(form.disciplines ?? []), key as PermitDiscipline] : (form.disciplines ?? []).filter(item => item !== key))} />{value}</label>)}
        </div>
      </fieldset>
      {field("location", "Địa điểm công tác")}
      <label className={label}><span className="font-medium">Nội dung công việc *</span><textarea className={control} rows={3} required maxLength={5000} value={form.content} onChange={event => onChange("content", event.target.value)} /></label>
      <label className={label}><span className="font-medium">Phạm vi công tác</span><textarea className={control} rows={2} maxLength={5000} value={form.workScope ?? ""} onChange={event => onChange("workScope", event.target.value)} /></label>
      <div className="grid gap-4 md:grid-cols-2">{(["plannedStartAt", "plannedEndAt"] as const).map(key => <label key={key} className={label}><span className="font-medium">{key === "plannedStartAt" ? "Bắt đầu công việc" : "Kết thúc công việc"} dự kiến</span><input className={control} type="datetime-local" value={form[key] ? new Date(new Date(form[key]!).getTime() + 7 * 3600000).toISOString().slice(0, 16) : ""} onChange={event => onChange(key, event.target.value ? `${event.target.value}:00+07:00` : null)} /></label>)}</div>
    </div></section>

  </div>;
}
