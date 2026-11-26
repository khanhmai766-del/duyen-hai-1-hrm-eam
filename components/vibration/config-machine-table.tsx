"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from "react";
import { toast } from "sonner";
import { useUpdateVibrationDevice } from "@/hooks/useVibrationCatalog";
import {
  BEARING_KINDS, COUPLING_KINDS, FOUNDATION_KINDS, FOUNDATION_Y_KINDS, MACHINE_NUMBER_RULES, MACHINE_TYPES, METER_KINDS, ORIENTATION_KINDS, PUMP_KINDS,
  VSD_KINDS, X_AXIS_KINDS, derivedFoundation, excitationHz, foundationOf, machineMissing, type Machine, type MachineNumberKey,
} from "@/lib/vibration/catalog";
import { standardPlan, STD_SHORT } from "@/lib/vibration/analysis";
import type { VibrationDeviceDto } from "@/lib/vibration/types";
import { formToMachine, machineToForm, type MachineForm } from "./catalog-machine-form";
import { DeviceAnalysisLink, deviceAnalysisHref } from "./analysis-links";

const fmtHz = (v: number | null) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")} Hz`);
const nm = (g: string | null) => (g === "cung" ? "cứng" : g === "mem" ? "mềm" : "chưa rõ");
const guess = (name: string) => { const s = name.toLocaleLowerCase("vi"); return /quạt/.test(s) ? "quat" : /bơm/.test(s) ? "bom" : /nghiền/.test(s) ? "may_nghien" : /băng tải/.test(s) ? "bang_tai" : ""; };

function numeric(f: MachineForm): Machine {
  const m: Machine = { ...f };
  for (const k of Object.keys(MACHINE_NUMBER_RULES)) { const n = Number((f[k] ?? "").replace(",", ".")); m[k] = f[k] && Number.isFinite(n) ? n : null; }
  return m;
}

function hints(m: Machine) {
  const n = (m.speedMaxRpm as number) || (m.speedRpm as number), f = m.freqLowHz as number | null;
  const dx = derivedFoundation(m, "X"), dy = derivedFoundation(m, "Y"), fe = excitationHz(m);
  const sync = m.poles ? 6000 / (m.poles as number) : null;
  return {
    speedRpm: m.speedRpm ? `1X ≈ ${((m.speedRpm as number) / 60).toFixed(1).replace(".", ",")} Hz` : "",
    speedMaxRpm: m.speedMaxRpm && m.speedRpm && (m.speedMaxRpm as number) < (m.speedRpm as number) ? "⚠ nhỏ hơn tốc độ định mức" : "",
    natFreqX: dx ? `→ ${nm(dx)} (so 1,25 × ${fmtHz(fe)})` : m.natFreqX ? "cần tốc độ quay" : "",
    natFreqY: dy ? `→ ${nm(dy)} (so 1,25 × ${fmtHz(fe)})` : m.natFreqY ? "cần tốc độ quay" : "",
    freqLowHz: !f ? "" : n && n <= 600 && f > 2 ? "⚠ máy ≤ 600 v/p cần ≤ 2 Hz (R1 §4.3)" : f > 10 ? "⚠ cần ≤ 10 Hz (R1 §4.3)" : "đạt R1 §4.3",
    poles: sync ? `Đồng bộ ${Math.round(sync)} v/p (50 Hz)${m.speedRpm ? (sync - (m.speedRpm as number) < 0 ? " · ⚠ tốc độ > đồng bộ" : ` · trượt ${(((sync - (m.speedRpm as number)) / sync) * 100).toFixed(1).replace(".", ",")} %`) : ""}` : "",
    fnd: `Áp dụng: X ${nm(foundationOf(m, "X"))} · Y ${nm(foundationOf(m, "Y"))}${(!m.foundation || m.foundation === "chua_xac_dinh") && dx ? " (suy từ tần số riêng)" : ""}`,
  };
}

const HEAD = ["Thiết bị / hệ thống", "Cương vị", "Loại máy *", "Kiểu bơm", "Công suất (kW) *", "Tốc độ quay định mức (v/p) *", "Tốc độ lớn nhất · biến tần (R1 §4.5)", "Số cực động cơ", "Chiều cao tâm trục H (mm) (R1 §5.2)", "Hướng trục (R1 §4.2)", "Kiểu nối trục (R1 §1)", "Kiểu bệ theo phương (R1 §5.3) *", "Tần số riêng thấp nhất của bệ X / Y (Hz) (R1 §5.3)", "Loại ổ đỡ", "Phương X là", "Máy đo: giá trị · cận dưới dải tần (R1 §4.3)", "Ngày sửa chữa / đại tu gần nhất (R1 §6.2.3)", "Mã ổ lăn (phân tích phổ)", "Số cánh (phân tích phổ)", "Cặp dự phòng A/B", "Tiêu chuẩn gợi ý", "Đủ thông số"];

const Row = React.memo(function Row({ d, pairs, disabled, onEdit }: { d: VibrationDeviceDto; pairs: VibrationDeviceDto[]; disabled: boolean; onEdit: (d: VibrationDeviceDto) => void }) {
  const update = useUpdateVibrationDevice();
  const [f, setF] = React.useState<MachineForm>(() => machineToForm(d.machine as any));
  React.useEffect(() => setF(machineToForm(d.machine as any)), [d.machine]);
  const m = numeric(f);
  const h = hints(m);
  const missing = machineMissing(m);
  const plan = standardPlan({ machine: m });
  /** Tự lưu khi đổi (như app cũ: change → save). */
  const commit = async (next: MachineForm) => {
    const r = formToMachine(next);
    if (r.error) { toast.error(`${d.name}: ${r.error}`); return; }
    try { await update.mutateAsync({ id: d.id, patch: { machine: r.patch } }); } catch (e) { toast.error(e instanceof Error ? e.message : "Không lưu được"); }
  };
  const setK = (k: string, v: string, save: boolean) => { const next = { ...f, [k]: v }; setF(next); if (save) void commit(next); };
  const sel = (k: string, items: readonly (readonly [string, string])[], extra?: boolean) => (
    <select value={f[k] ?? ""} disabled={disabled || extra} onChange={(e) => setK(k, e.target.value, true)}>{items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  );
  const inp = (k: string, ph?: string, type = "number") => (
    <input type={type} step="any" placeholder={ph} disabled={disabled} min={type === "number" ? (MACHINE_NUMBER_RULES as any)[k]?.[0] : undefined} max={type === "number" ? (MACHINE_NUMBER_RULES as any)[k]?.[1] : undefined}
      value={f[k] ?? ""} onChange={(e) => setK(k, e.target.value, false)} onBlur={() => commit(f)} onKeyDown={(e) => { if (e.key === "Enter") void commit(f); }} />
  );
  const g = guess(`${d.name} ${d.system}`);
  const typeItems: [string, string][] = [["", "— Chọn —" + (g ? " (gợi ý: " + MACHINE_TYPES.find((t) => t[0] === g)?.[1] + ")" : "")], ...MACHINE_TYPES];
  return (
    <tr>
      <td><button type="button" className="text-button" onClick={() => onEdit(d)}>{d.name}</button> <DeviceAnalysisLink href={deviceAnalysisHref(d)} className="ovd-link" title="Mở Phân tích độ rung của thiết bị này">{""}</DeviceAnalysisLink><small>{d.system} · {d.legacyId}</small></td>
      <td>{d.area}</td>
      <td>{sel("type", typeItems)}</td>
      <td>{sel("pumpKind", PUMP_KINDS, f.type !== "bom")}</td>
      <td>{inp("powerKw")}<small className="machine-hint"></small></td>
      <td>{inp("speedRpm")}<small className="machine-hint">{h.speedRpm}</small></td>
      <td className="stack-cell">{inp("speedMaxRpm", "Lớn nhất, v/p")}<small className="machine-hint">{h.speedMaxRpm}</small>{sel("vsd", VSD_KINDS)}</td>
      <td>{inp("poles")}<small className="machine-hint">{h.poles}</small></td>
      <td>{inp("shaftHeightMm")}<small className="machine-hint"></small></td>
      <td>{sel("orientation", ORIENTATION_KINDS)}</td>
      <td>{sel("coupling", COUPLING_KINDS)}</td>
      <td className="fnd-cell"><label>X {sel("foundation", FOUNDATION_KINDS)}</label><label>Y {sel("foundationY", FOUNDATION_Y_KINDS)}</label><small className="machine-hint">{h.fnd}</small></td>
      <td className="stack-cell"><label>X {inp("natFreqX", "Hz")}</label><small className="machine-hint">{h.natFreqX}</small><label>Y {inp("natFreqY", "Hz")}</label><small className="machine-hint">{h.natFreqY}</small></td>
      <td>{sel("bearing", BEARING_KINDS)}</td>
      <td>{sel("xAxis", X_AXIS_KINDS)}</td>
      <td className="stack-cell">{sel("meterValue", METER_KINDS)}{inp("freqLowHz", "Cận dưới dải tần, Hz")}<small className="machine-hint">{h.freqLowHz}</small></td>
      <td>{inp("lastOverhaul", undefined, "date")}<small className="machine-hint">mức nền &amp; nghiệm thu tính từ ngày này</small></td>
      <td>{inp("bearingCodes", undefined, "text")}</td>
      <td>{inp("blades")}<small className="machine-hint"></small></td>
      <td>{sel("sparePair", [["", "—"], ...pairs.map((x) => [x.legacyId, x.name + " · " + x.legacyId] as [string, string])])}</td>
      <td className="standard-cell"><strong>{plan.main ? STD_SHORT[plan.main] : "Chưa đủ thông số"}</strong>{(plan.notes || []).map((n: string, i: number) => <small key={i}>{n}</small>)}</td>
      <td className="complete-cell"><span className="machine-complete" data-state={missing ? "missing" : "ok"}>{missing ? `Thiếu ${missing}/4` : "Đủ"}</span></td>
    </tr>
  );
});

/** Bảng "Thông số máy phục vụ phân tích rung" 22 cột (machine-params.js:machineTable) — sửa trực tiếp, tự lưu như app cũ. */
export function ConfigMachineTable({ rows, all, disabled, onEdit }: { rows: VibrationDeviceDto[]; all: VibrationDeviceDto[]; disabled: boolean; onEdit: (d: VibrationDeviceDto) => void }) {
  const full = rows.filter((d) => machineMissing(d.machine) === 0).length;
  return (
    <div className="measurement-catalog machine-catalog panel">
      <div className="measurement-catalog-head">
        <div><strong>Thông số máy phục vụ phân tích rung</strong><span>Lấy từ nhãn máy / hồ sơ thiết bị. Bắt buộc: loại máy, công suất, tốc độ, kiểu bệ (chọn tay hoặc suy từ tần số riêng đo bằng gõ búa). Chọn loại theo máy công tác (quạt / bơm); động cơ đi kèm đánh giá riêng theo ISO 20816-3.</span></div>
        <span className="catalog-count">{full}/{rows.length} đủ thông số</span>
      </div>
      <div className="device-table-wrap">
        <table>
          <thead><tr>{HEAD.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((d) => <Row key={d.id} d={d} disabled={disabled} onEdit={onEdit} pairs={all.filter((x) => x.id !== d.id && x.area === d.area && x.system === d.system)} />)}
            {!rows.length && <tr><td colSpan={HEAD.length}>Không có thiết bị phù hợp bộ lọc.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
