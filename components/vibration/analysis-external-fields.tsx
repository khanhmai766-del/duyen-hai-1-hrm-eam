"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Biểu mẫu phẳng giống FormData của ứng dụng cũ: mọi giá trị là chuỗi (ô tích là boolean). */
export type Form = Record<string, string | boolean>;
export type FormPatch = (patch: Form) => void;

export const todayVn = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
export const str = (f: Form, k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");

/** Ép bản nháp (có thể đến từ localStorage / phiếu đã lưu) về Form, rồi phủ giá trị mặc định mà ô chọn đang hiển thị. */
export function toForm(draft: Record<string, unknown>, defaults: Form): Form {
  const out: Form = { ...defaults };
  for (const [k, v] of Object.entries(draft || {})) {
    if (typeof v === "string" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "number") out[k] = String(v);
  }
  return out;
}

export function Fld({ label, unit, className, children }: { label: React.ReactNode; unit?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      {label}
      {unit && <> <small>{unit}</small></>}
      {children}
    </label>
  );
}

/** Ô nhập văn bản / số / ngày / giờ. Ô số: chỉ nhận dấu chấm (engine báo lỗi nếu có dấu phẩy). */
export function In({ form, set, name, label, unit, type = "text", placeholder, className, readOnly, disabled, describedBy }: {
  form: Form; set: FormPatch; name: string; label: React.ReactNode; unit?: string; type?: "text" | "number" | "date" | "time"; placeholder?: string; className?: string; readOnly?: boolean; disabled?: boolean; describedBy?: string;
}) {
  return (
    <Fld label={label} unit={unit} className={className}>
      <input
        name={name}
        type={type}
        {...(type === "number" ? { min: 0, step: "any", inputMode: "decimal" as const } : {})}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={disabled}
        aria-describedby={describedBy}
        value={str(form, name)}
        onChange={(e) => set({ [name]: e.target.value })}
      />
    </Fld>
  );
}

export function Sel({ form, set, name, label, options, disabled, className, onPick }: {
  form: Form; set: FormPatch; name: string; label: React.ReactNode; options: readonly (readonly [string, string])[]; disabled?: boolean; className?: string; onPick?: (v: string) => Form;
}) {
  return (
    <Fld label={label} className={className}>
      <select
        name={name}
        disabled={disabled}
        value={str(form, name)}
        onChange={(e) => set({ [name]: e.target.value, ...(onPick ? onPick(e.target.value) : {}) })}
      >
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </Fld>
  );
}

/** Ô số nằm trong bảng (có aria-label). */
export function CellIn({ form, set, name, label, type = "number" }: { form: Form; set: FormPatch; name: string; label: string; type?: "number" | "text" }) {
  return (
    <input
      aria-label={label}
      name={name}
      type={type}
      {...(type === "number" ? { min: 0, step: "any", inputMode: "decimal" as const } : { maxLength: 80 })}
      value={str(form, name)}
      onChange={(e) => set({ [name]: e.target.value })}
    />
  );
}

/** Khung mục có số thứ tự (01, 02…) của phiếu (external-card). */
export function Card({ no, title, hint, children }: { no: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="external-card">
      <div className="external-card-head"><span>{no}</span><div><h3>{title}</h3>{hint && <p>{hint}</p>}</div></div>
      {children}
    </section>
  );
}
export const FieldGrid = ({ children }: { children: React.ReactNode }) => <div className="external-fields">{children}</div>;
export const Hint = ({ children }: { children: React.ReactNode }) => <p className="external-hint">{children}</p>;
/** Bảng nhập số đo (external-table-wrap > external-measure-table). */
export const MeasureTable = ({ children, extra }: { children: React.ReactNode; extra?: boolean }) => (
  <div className="external-table-wrap"><table className={cn("external-measure-table", extra && "external-extra-table")}>{children}</table></div>
);

export const Btn = ({ primary, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) => (
  <button type="button" {...p} className={cn(primary ? "primary-button" : "secondary-button", className)} />
);

/** Khối "báo cáo": chỉ phần này được in (class vc-print-area + body.vc-printing). */
export function PrintStyle() {
  return (
    <style>{`@media print{body.vc-printing{overflow:visible!important;height:auto!important}body.vc-printing *{visibility:hidden!important}body.vc-printing .vc-print-area,body.vc-printing .vc-print-area *{visibility:visible!important}body.vc-printing .vc-print-area{position:absolute!important;left:0;top:0;width:100%;border:0!important}}`}</style>
  );
}
export function printReport() {
  document.body.classList.add("vc-printing");
  window.addEventListener("afterprint", () => document.body.classList.remove("vc-printing"), { once: true });
  window.print();
}
