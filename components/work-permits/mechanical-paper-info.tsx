"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { FilePlus2, Paperclip, Trash2 } from "lucide-react";
import { EquipmentTreePicker } from "@/components/devices/equipment-tree-picker";
import { Button } from "@/components/ui/button";
import { PERMIT_DISCIPLINES, PERMIT_UNITS, type PermitDiscipline, type PermitInput } from "@/lib/work-permits";
import { PERMIT_MAX_ATTACHMENTS, PERMIT_MAX_ATTACHMENT_BYTES, PERMIT_MAX_EQUIPMENT, type PermitAttachment, type PermitEquipmentItem } from "@/lib/work-permit-source-fields";

const control = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10";
const label = "block space-y-1.5 text-[13px]";
const section = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-border dark:bg-background sm:p-5";
const title = "mb-4 border-b border-slate-200 pb-2 text-sm font-bold text-slate-900 dark:border-border dark:text-foreground";

export function MechanicalPaperInfo({ form, issued, onChange, onPickSyc, pendingFiles, onPendingFilesChange, attachments, onDeleteAttachment, attachmentBusy, permitId }: {
  form: PermitInput;
  issued: boolean;
  onChange: <K extends keyof PermitInput>(key: K, value: PermitInput[K]) => void;
  onPickSyc: () => void;
  pendingFiles: File[];
  onPendingFilesChange: (files: File[]) => void;
  attachments: PermitAttachment[];
  onDeleteAttachment: (id: string) => void;
  attachmentBusy: boolean;
  permitId?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const equipment = form.equipmentItems ?? [];
  const changeEquipment = (rows: PermitEquipmentItem[]) => onChange("equipmentItems", rows);
  const updateEquipment = (index: number, key: keyof PermitEquipmentItem, value: string) =>
    changeEquipment(equipment.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const remaining = PERMIT_MAX_ATTACHMENTS - attachments.length - pendingFiles.length;
  const field = (key: "managingUnit" | "plantName" | "teamName" | "registrationNumber" | "location", fieldLabel: string, required = false) =>
    <label className={label}><span className="font-medium">{fieldLabel}{required ? " *" : ""}</span><input className={control} required={required} maxLength={key === "location" ? 500 : 200} value={String(form[key] ?? "")} onChange={event => onChange(key, event.target.value)} /></label>;

  return <div className="space-y-4">
    <section className={section}><h3 className={title}>Thông tin chung trên phiếu</h3>
      <div className="grid gap-4 md:grid-cols-2">
        {field("registrationNumber", "Số phiếu ĐKCT")}
        {field("managingUnit", "Đơn vị QLVH", true)}
        {field("teamName", "Đơn vị công tác", issued)}
        {field("plantName", "Nhà máy", true)}
        <label className={label}><span className="font-medium">Tổ máy *</span><select className={control} value={form.unit} onChange={event => onChange("unit", event.target.value as PermitInput["unit"])}>{Object.entries(PERMIT_UNITS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        <label className={label}><span className="font-medium">Ngày thực hiện *</span><input className={control} required type="date" value={form.workDate} onChange={event => onChange("workDate", event.target.value)} /></label>
        <div className={label}><span className="font-medium">Số SYC</span><div className="flex gap-2"><input className={control} maxLength={100} value={form.repairRequestNumber} onChange={event => { onChange("repairRequestNumber", event.target.value); onChange("defectId", null); }} /><Button type="button" variant="outline" className="shrink-0" onClick={onPickSyc}>Chọn SYC</Button></div><p className="text-xs text-muted-foreground">Chọn SYC để tạo liên kết; số nhập tay chỉ để đối chiếu.</p></div>
      </div>
      <fieldset className="mt-5 rounded-lg border border-slate-200 p-3 dark:border-border"><legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-muted-foreground">Chuyên môn trên PCT</legend><div className="flex flex-wrap gap-x-6 gap-y-3">{Object.entries(PERMIT_DISCIPLINES).map(([key, value]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-blue-700" checked={(form.disciplines ?? []).includes(key as PermitDiscipline)} onChange={event => onChange("disciplines", event.target.checked ? [...(form.disciplines ?? []), key as PermitDiscipline] : (form.disciplines ?? []).filter(item => item !== key))} />{value}</label>)}</div></fieldset>
    </section>

    <section className={section}><div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-border"><h3 className="text-sm font-bold">Thiết bị công tác</h3><span className="text-xs text-muted-foreground">{equipment.length}/{PERMIT_MAX_EQUIPMENT} thiết bị</span></div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><EquipmentTreePicker value="" onChange={node => { if (node && equipment.length < PERMIT_MAX_EQUIPMENT && !equipment.some(item => item.sourceSeq === node.seq)) changeEquipment([...equipment, { sourceSeq: node.seq, code: node.fullCode, name: node.name, kks: node.kks ?? "", technicalSpec: "" }]); }} includeLeaves leafOnly keepOpenOnSelect allowClear={false} selectedValues={equipment.map(item => item.sourceSeq).filter((value): value is string => Boolean(value))} scope={form.unit} disabled={equipment.length >= PERMIT_MAX_EQUIPMENT} placeholder="Tìm hoặc chọn từ cây thiết bị" /></div><Button type="button" variant="outline" disabled={equipment.length >= PERMIT_MAX_EQUIPMENT} onClick={() => changeEquipment([...equipment, { code: "", name: "", kks: "", technicalSpec: "" }])}>Nhập thiết bị khác</Button></div>
      {equipment.length ? <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-border"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-slate-600 dark:bg-muted/30 dark:text-muted-foreground"><tr><th className="w-10 px-2 py-2">STT</th><th className="min-w-32 px-2 py-2">Mã thiết bị</th><th className="min-w-48 px-2 py-2">Tên thiết bị</th><th className="min-w-28 px-2 py-2">KKS</th><th className="min-w-40 px-2 py-2">Thông số kỹ thuật</th><th className="w-10 px-2 py-2" /></tr></thead><tbody>{equipment.map((item, index) => <tr key={`${item.sourceSeq ?? "manual"}-${index}`} className="border-t border-slate-200 align-top dark:border-border"><td className="px-2 py-3 tabular-nums">{index + 1}</td>{(["code", "name", "kks", "technicalSpec"] as const).map(key => <td key={key} className="px-1.5 py-1.5"><input className={`${control} min-h-9 px-2 py-1 text-xs`} aria-label={`${key} thiết bị ${index + 1}`} maxLength={key === "technicalSpec" ? 1000 : key === "name" ? 300 : 120} value={item[key]} onChange={event => updateEquipment(index, key, event.target.value)} /></td>)}<td className="px-1 py-1.5"><Button type="button" size="icon" variant="ghost" className="h-9 w-9" aria-label={`Bỏ thiết bị ${index + 1}`} onClick={() => changeEquipment(equipment.filter((_, i) => i !== index))}><Trash2 size={14} /></Button></td></tr>)}</tbody></table></div> : <p className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-xs text-muted-foreground dark:bg-muted/20">Chưa ghi thiết bị. Có thể để trống nếu công việc chỉ xác định bằng địa điểm và phạm vi.</p>}
    </section>

    <section className={section}><h3 className={title}>Địa điểm và nội dung công việc</h3><div className="space-y-4">
      {field("location", "Địa điểm công tác")}
      <label className={label}><span className="font-medium">Nội dung công việc *</span><textarea className={control} rows={3} required maxLength={5000} value={form.content} onChange={event => onChange("content", event.target.value)} /></label>
      <label className={label}><span className="font-medium">Phạm vi công tác</span><textarea className={control} rows={2} maxLength={5000} value={form.workScope ?? ""} onChange={event => onChange("workScope", event.target.value)} /></label>
      <div className="grid gap-4 md:grid-cols-2">{(["plannedStartAt", "plannedEndAt"] as const).map(key => <label key={key} className={label}><span className="font-medium">{key === "plannedStartAt" ? "Bắt đầu công việc" : "Kết thúc công việc"} dự kiến</span><input className={control} type="datetime-local" value={form[key] ? new Date(new Date(form[key]!).getTime() + 7 * 3600000).toISOString().slice(0, 16) : ""} onChange={event => onChange(key, event.target.value ? `${event.target.value}:00+07:00` : null)} /></label>)}</div>
    </div></section>

    <section className={section}><div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-bold"><Paperclip size={16} />Tài liệu đính kèm và hình ảnh</h3><span className="text-xs text-muted-foreground">{attachments.length + pendingFiles.length}/{PERMIT_MAX_ATTACHMENTS}</span></div><p className="mb-3 text-xs leading-5 text-muted-foreground">PDF, DOCX, JPG, PNG hoặc WEBP; tối đa 15 MB mỗi tệp. Tệp được tải lên sau khi lưu phiếu.</p>
      <input ref={fileInput} className="sr-only" type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png,.webp" onChange={event => { const next = Array.from(event.target.files ?? []); const allowed = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/webp"]); const eligible = next.filter(file => file.size > 0 && file.size <= PERMIT_MAX_ATTACHMENT_BYTES && allowed.has(file.type)); if (eligible.length !== next.length) toast.error("Chỉ chọn PDF, DOCX hoặc ảnh JPG/PNG/WEBP tối đa 15 MB mỗi tệp."); if (eligible.length > remaining) toast.error("Mỗi phiếu có tối đa 10 tệp đính kèm."); onPendingFilesChange([...pendingFiles, ...eligible.slice(0, Math.max(0, remaining))]); event.target.value = ""; }} />
      <Button type="button" size="sm" variant="outline" disabled={remaining <= 0 || attachmentBusy} onClick={() => fileInput.current?.click()}><FilePlus2 size={15} />Chọn tệp</Button>
      {(attachments.length > 0 || pendingFiles.length > 0) && <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 text-xs dark:divide-border dark:border-border">{attachments.map(item => <li key={item.id} className="flex items-center gap-2 px-3 py-2"><a className="min-w-0 flex-1 truncate font-medium text-blue-700 underline-offset-2 hover:underline" href={`/api/work-permits/${permitId}/attachments/${item.id}`} target="_blank" rel="noopener noreferrer">{item.originalName}</a><span className="text-muted-foreground">{(item.bytes / 1024 / 1024).toFixed(1)} MB</span><Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={attachmentBusy} aria-label={`Xóa tệp ${item.originalName}`} onClick={() => onDeleteAttachment(item.id)}><Trash2 size={13} /></Button></li>)}{pendingFiles.map((file, index) => <li key={`${file.name}-${index}`} className="flex items-center gap-2 px-3 py-2"><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-amber-700">Chờ tải</span><Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Bỏ tệp chờ tải ${file.name}`} onClick={() => onPendingFilesChange(pendingFiles.filter((_, i) => i !== index))}><Trash2 size={13} /></Button></li>)}</ul>}
    </section>
  </div>;
}
