"use client";

import * as React from "react";
import { ALERT_FIELDS, PUMP_FAN_AREA_OPTIONS, SCOPE_KEYS, isPumpFanScope, type AlertCfg, type AlertKey, type ScopeCfg, type ScopeKey } from "@/lib/vibration/catalog";
import { MEASURE_GROUP_RANGES } from "@/lib/vibration/constants";
import type { VibrationDeviceDto } from "@/lib/vibration/types";
import { DeviceAnalysisLink, deviceAnalysisHref } from "./analysis-links";

export type ScopeMap = Record<ScopeKey, ScopeCfg>;
export interface ConfigDraft { scopes: ScopeMap; alert: AlertCfg; alertText: Partial<Record<AlertKey, string>> }

export const SCOPE_LABEL: Record<ScopeKey, string> = {
  current: "Dòng điện động cơ",
  motorUnloaded: "Động cơ · Gối KT (NDE)",
  motorLoaded: "Động cơ · Gối CT (DE)",
  pumpFanUnloaded: "Bơm / quạt · Gối KT (NDE)",
  pumpFanLoaded: "Bơm / quạt · Gối CT (DE)",
};
const pointCount = (k: ScopeKey) => { const g = MEASURE_GROUP_RANGES.find((x) => x.key === k)!; return g.to - g.from + 1; };

/** Ô "Vùng đo": nhóm bơm/quạt chọn trong danh sách, nhóm khác nhập tự do (như app cũ). */
export function ScopeAreaControl({ k, value, disabled, onChange, label }: { k: ScopeKey; value: string; disabled?: boolean; onChange: (v: string) => void; label: string }) {
  if (isPumpFanScope(k)) {
    const opts = PUMP_FAN_AREA_OPTIONS.includes(value) ? PUMP_FAN_AREA_OPTIONS : [value, ...PUMP_FAN_AREA_OPTIONS];
    return (
      <select aria-label={label} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  }
  return <input aria-label={label} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />;
}

interface RowProps { d: VibrationDeviceDto; draft: ConfigDraft; dirty: boolean; disabled: boolean; onScope: (id: string, k: ScopeKey, p: Partial<ScopeCfg>) => void; onAlert: (id: string, p: Partial<AlertCfg>, text?: Partial<Record<AlertKey, string>>) => void; onEdit: (d: VibrationDeviceDto) => void }

const Row = React.memo(function Row({ d, draft, dirty, disabled, onScope, onAlert, onEdit }: RowProps) {
  return (
    <tr style={{ opacity: d.active ? undefined : 0.6, ...(dirty ? { background: "rgba(242,179,91,.12)" } : {}) }}>
      <td><button type="button" className="text-button" onClick={() => onEdit(d)}>{d.name}</button> <DeviceAnalysisLink href={deviceAnalysisHref(d)} className="ovd-link" title="Mở Phân tích độ rung của thiết bị này">{""}</DeviceAnalysisLink><small>{d.system || "—"} · {d.legacyId.slice(0, 12)}</small></td>
      <td>{d.area}</td>
      {SCOPE_KEYS.map((k) => (
        <td key={k}>
          <div className="inline-scope">
            <div className="inline-scope-heading"><strong>{SCOPE_LABEL[k]}</strong><span>{pointCount(k) === 3 ? "3 pha" : "5 điểm đo"}</span></div>
            <label><input type="checkbox" disabled={disabled} checked={draft.scopes[k].enabled} onChange={(e) => onScope(d.id, k, { enabled: e.target.checked })} /> Áp dụng</label>
            <ScopeAreaControl k={k} value={draft.scopes[k].area} disabled={disabled} label={`Vùng đo ${SCOPE_LABEL[k]} ${d.name}`} onChange={(v) => onScope(d.id, k, { area: v })} />
          </div>
        </td>
      ))}
      <td>
        <label className="alert-cell"><input type="checkbox" disabled={disabled} checked={draft.alert.enabled} onChange={(e) => onAlert(d.id, { enabled: e.target.checked })} /> Bật</label>
      </td>
      <AlertCells d={d} draft={draft} disabled={disabled} onAlert={onAlert} />
    </tr>
  );
});

function AlertCells({ d, draft, disabled, onAlert }: { d: VibrationDeviceDto; draft: ConfigDraft; disabled: boolean; onAlert: RowProps["onAlert"] }) {
  return (
    <>
      {ALERT_FIELDS.map((f) => (
        <td key={f.key}>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${f.label} ${d.name}`}
            disabled={disabled}
            value={draft.alertText[f.key] ?? String(draft.alert[f.key])}
            onChange={(e) => {
              const raw = e.target.value, n = Number(raw.replace(",", "."));
              onAlert(d.id, raw.trim() !== "" && Number.isFinite(n) ? { [f.key]: n } : {}, { [f.key]: raw });
            }}
          />
        </td>
      ))}
    </>
  );
}

/** Bảng "Vùng đo & cảnh báo" (port measurementTable của app.js). */
export function ConfigScopeTable({ rows, drafts, dirtyIds, disabled, onScope, onAlert, onEdit }: {
  rows: VibrationDeviceDto[];
  drafts: (d: VibrationDeviceDto) => ConfigDraft;
  dirtyIds: Set<string>;
  disabled: boolean;
  onScope: RowProps["onScope"];
  onAlert: RowProps["onAlert"];
  onEdit: (d: VibrationDeviceDto) => void;
}) {
  return (
    <div className="measurement-catalog panel">
      <div className="measurement-catalog-head">
        <div><strong>Danh mục vùng đo theo thiết bị</strong><span>Ngưỡng rung 4,5 / 7,1 mm/s là giá trị tạm. Khi đủ loại máy, công suất, tốc độ và kiểu bệ, hệ thống đánh giá theo bảng tiêu chuẩn phù hợp; giá trị tạm vẫn được giữ, không tự ghi đè. Ngưỡng nhiệt vẫn theo cấu hình thiết bị.</span></div>
        <span className="catalog-count">{rows.length} thiết bị</span>
      </div>
      <div className="device-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Thiết bị / hệ thống</th>
              <th>Cương vị</th>
              {SCOPE_KEYS.map((k) => <th key={k}>{SCOPE_LABEL[k]}</th>)}
              <th>Cảnh báo</th>
              {ALERT_FIELDS.map((f) => <th key={f.key}>{f.label} ({f.unit})</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => <Row key={d.id} d={d} draft={drafts(d)} dirty={dirtyIds.has(d.id)} disabled={disabled} onScope={onScope} onAlert={onAlert} onEdit={onEdit} />)}
            {!rows.length && <tr><td colSpan={12}>Không có thiết bị phù hợp bộ lọc.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
