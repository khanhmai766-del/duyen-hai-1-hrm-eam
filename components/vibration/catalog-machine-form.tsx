"use client";

import * as React from "react";
import {
  BEARING_KINDS, COUPLING_KINDS, FOUNDATION_KINDS, FOUNDATION_Y_KINDS, MACHINE_NUMBER_RULES, MACHINE_TYPES, METER_KINDS,
  ORIENTATION_KINDS, PUMP_KINDS, VSD_KINDS, X_AXIS_KINDS, derivedFoundation, excitationHz, foundationOf, machineMissing,
  type Machine, type MachineNumberKey, type MachinePatch,
} from "@/lib/vibration/catalog";

/** Biểu mẫu "Thông số máy phục vụ phân tích rung" (port machine-params.js). Giữ giá trị dạng chuỗi khi nhập. */
export type MachineForm = Record<string, string>;

const NUM_KEYS = Object.keys(MACHINE_NUMBER_RULES) as MachineNumberKey[];
const TEXT_KEYS = ["type", "pumpKind", "vsd", "orientation", "coupling", "foundation", "foundationY", "bearing", "xAxis", "meterValue", "bearingCodes", "lastOverhaul", "sparePair"];
const DEFAULTS: MachineForm = { pumpKind: "canh_dong", orientation: "ngang", foundation: "chua_xac_dinh", xAxis: "chua_ro", meterValue: "chua_ro" };

export function machineToForm(m: Machine | null | undefined): MachineForm {
  const f: MachineForm = { ...DEFAULTS };
  for (const k of [...NUM_KEYS, ...TEXT_KEYS]) {
    const v = m?.[k];
    if (v !== undefined && v !== null) f[k] = String(v);
    else if (!(k in f)) f[k] = "";
  }
  return f;
}

/** Chuyển biểu mẫu → patch gửi API; trả lỗi tiếng Việt khi số sai. */
export function formToMachine(f: MachineForm): { patch: MachinePatch; error: string | null } {
  const patch: Record<string, unknown> = {};
  for (const k of NUM_KEYS) {
    const raw = (f[k] ?? "").trim().replace(",", ".");
    const [lo, hi, label] = MACHINE_NUMBER_RULES[k];
    if (raw === "") { patch[k] = null; continue; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < lo || n > hi) return { patch, error: `${label} phải từ ${lo} đến ${hi}` };
    if ((k === "poles" || k === "blades") && !Number.isInteger(n)) return { patch, error: `${label} phải là số nguyên` };
    patch[k] = k === "speedRpm" ? Math.round(n) : n;
  }
  for (const k of TEXT_KEYS) patch[k] = (f[k] ?? "").trim();
  return { patch: patch as MachinePatch, error: null };
}

/** Giá trị số để tính gợi ý hiển thị (không tính tiêu chuẩn). */
function numeric(f: MachineForm): Machine {
  const m: Machine = { ...f };
  for (const k of NUM_KEYS) { const n = Number((f[k] ?? "").replace(",", ".")); m[k] = f[k] && Number.isFinite(n) ? n : null; }
  return m;
}
export const formMissing = (f: MachineForm) => machineMissing(numeric(f));

const fmtHz = (v: number | null) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")} Hz`);

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label>
      {label}
      {children}
      {hint ? <small className="machine-hint">{hint}</small> : null}
    </label>
  );
}

export function CatalogMachineForm({
  value, onChange, disabled, nameGuess, pairOptions,
}: {
  value: MachineForm;
  onChange: (key: string, v: string) => void;
  disabled?: boolean;
  nameGuess?: string;
  pairOptions: { value: string; label: string }[];
}) {
  const m = numeric(value);
  const sel = (k: string, items: [string, string][]) => (
    <select disabled={disabled} value={value[k] ?? ""} onChange={(e) => onChange(k, e.target.value)}>
      {items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const num = (k: MachineNumberKey, hint?: string) => (
    <Field label={`${MACHINE_NUMBER_RULES[k][2]}`} hint={hint}>
      <input inputMode="decimal" disabled={disabled} value={value[k] ?? ""} onChange={(e) => onChange(k, e.target.value)} />
    </Field>
  );
  const guess = guessType(nameGuess ?? "");
  const missing = formMissing(value);
  const sync = m.poles ? 6000 / (m.poles as number) : null;
  const fe = excitationHz(m);
  const dx = derivedFoundation(m, "X"), dy = derivedFoundation(m, "Y");
  const nm = (g: string) => (g === "cung" ? "cứng" : g === "mem" ? "mềm" : "chưa rõ");

  return (
    <div className="form-grid" style={{ marginTop: 12 }}>
      <p className="machine-hint full-field">
        Lấy từ nhãn máy / hồ sơ thiết bị. Bắt buộc: loại máy, công suất, tốc độ, kiểu bệ (chọn tay hoặc suy từ tần số riêng đo bằng gõ búa). Chọn loại theo máy công tác (quạt / bơm); động cơ đi kèm đánh giá riêng.{" "}
        <span className="machine-complete" data-state={missing ? "missing" : "ok"}>{missing ? `Thiếu ${missing}/4` : "Đủ thông số"}</span>
      </p>
      <>
        <Field label="Loại máy *" hint={guess && !value.type ? `Gợi ý: ${MACHINE_TYPES.find((t) => t[0] === guess)?.[1]}` : undefined}>
          {sel("type", [["", "— Chọn —"], ...MACHINE_TYPES])}
        </Field>
        <Field label="Kiểu bơm">
          <select disabled={disabled || value.type !== "bom"} value={value.pumpKind} onChange={(e) => onChange("pumpKind", e.target.value)}>
            {PUMP_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {num("powerKw", undefined)}
        {num("speedRpm", m.speedRpm ? `1X ≈ ${((m.speedRpm as number) / 60).toFixed(1).replace(".", ",")} Hz` : undefined)}
        {num("speedMaxRpm", m.speedMaxRpm && m.speedRpm && (m.speedMaxRpm as number) < (m.speedRpm as number) ? "⚠ nhỏ hơn tốc độ định mức" : undefined)}
        <Field label="Tốc độ cố định / biến tần">{sel("vsd", VSD_KINDS)}</Field>
        {num("poles", sync ? `Đồng bộ ${Math.round(sync)} v/p (50 Hz)${m.speedRpm ? (sync - (m.speedRpm as number) < 0 ? " · ⚠ tốc độ > đồng bộ" : ` · trượt ${(((sync - (m.speedRpm as number)) / sync) * 100).toFixed(1).replace(".", ",")} %`) : ""}` : undefined)}
        {num("shaftHeightMm")}
        <Field label="Hướng trục">{sel("orientation", ORIENTATION_KINDS)}</Field>
        <Field label="Kiểu nối trục">{sel("coupling", COUPLING_KINDS)}</Field>
        <Field label="Kiểu bệ phương X *">{sel("foundation", FOUNDATION_KINDS)}</Field>
        <Field label="Kiểu bệ phương Y" hint={`Áp dụng: X ${nm(foundationOf(m, "X"))} · Y ${nm(foundationOf(m, "Y"))}${(!value.foundation || value.foundation === "chua_xac_dinh") && dx ? " (suy từ tần số riêng)" : ""}`}>
          {sel("foundationY", FOUNDATION_Y_KINDS)}
        </Field>
        {num("natFreqX", dx ? `→ ${nm(dx)} (so 1,25 × ${fmtHz(fe)})` : m.natFreqX ? "cần tốc độ quay" : undefined)}
        {num("natFreqY", dy ? `→ ${nm(dy)} (so 1,25 × ${fmtHz(fe)})` : m.natFreqY ? "cần tốc độ quay" : undefined)}
        <Field label="Loại ổ đỡ">{sel("bearing", BEARING_KINDS)}</Field>
        <Field label="Phương X là">{sel("xAxis", X_AXIS_KINDS)}</Field>
        <Field label="Máy đo: giá trị">{sel("meterValue", METER_KINDS)}</Field>
        {num("freqLowHz", freqHint(m))}
        <Field label="Ngày sửa chữa / đại tu gần nhất" hint="Mức nền & nghiệm thu tính từ ngày này">
          <input type="date" disabled={disabled} value={value.lastOverhaul ?? ""} onChange={(e) => onChange("lastOverhaul", e.target.value)} />
        </Field>
        <Field label="Mã ổ lăn (phân tích phổ)">
          <input disabled={disabled} maxLength={200} value={value.bearingCodes ?? ""} onChange={(e) => onChange("bearingCodes", e.target.value)} />
        </Field>
        {num("blades")}
        <Field label="Cặp dự phòng A/B">
          <select disabled={disabled} value={value.sparePair ?? ""} onChange={(e) => onChange("sparePair", e.target.value)}>
            <option value="">—</option>
            {pairOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </>
    </div>
  );
}

function guessType(name: string) {
  const s = name.toLocaleLowerCase("vi");
  return /quạt/.test(s) ? "quat" : /bơm/.test(s) ? "bom" : /nghiền/.test(s) ? "may_nghien" : /băng tải/.test(s) ? "bang_tai" : "";
}
function freqHint(m: Machine) {
  const n = (m.speedMaxRpm as number) || (m.speedRpm as number), f = m.freqLowHz as number | null;
  if (!f) return undefined;
  if (n && n <= 600 && f > 2) return "⚠ máy ≤ 600 v/p cần ≤ 2 Hz";
  if (f > 10) return "⚠ cần ≤ 10 Hz";
  return "đạt yêu cầu dải tần";
}
