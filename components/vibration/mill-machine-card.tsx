"use client";

import * as React from "react";
import { touchDecimal } from "./touch-input";
import { cellNumber, parseCell } from "@/lib/vibration/parse";
import { fixedCellLevel, millMax, riseVsPrevious } from "@/lib/vibration/severity";
import type { VibrationDeviceDto, VibrationRecordDto } from "@/lib/vibration/types";
import { padTime, maskTime } from "./entry-grid-model";
import { filledCount, fmtVi, keyKind, keyWhere, MILL_AXES, MILL_BEARINGS, MILL_FIELD_TOTAL, vnClock, type MillRow } from "./mill-utils";
import { DeviceAnalysisLink, millAnalysisHref } from "./analysis-links";

const SHIFT_NAME = { sang: "Ca sáng", chieu: "Ca chiều", dem: "Ca đêm" } as const;
const noop = () => {};

function Cell({ field, row, prev, readOnly, label, onChange }: {
  field: string;
  row: MillRow;
  prev: Record<string, unknown> | null;
  readOnly: boolean;
  label: string;
  onChange: (field: string, value: string) => void;
}) {
  const raw = row.v[field] ?? "";
  const parsed = parseCell(raw);
  const previous = prev ? cellNumber(prev[field]) : null;
  const level = parsed === undefined ? "normal" : fixedCellLevel(keyKind(field), parsed ?? null, previous);
  const cls = parsed === undefined ? "invalid" : level === "over" ? "up2" : level === "rise" ? "up" : "";
  return (
    <input
      type="text"
      inputMode="decimal"
      enterKeyHint="next"
      autoComplete="off"
      data-field={field}
      value={raw}
      className={cls}
      aria-label={label}
      readOnly={readOnly}
      {...(previous != null ? { "data-prev": previous, title: `Lần trước: ${previous}` } : {})}
      onChange={(e) => onChange(field, touchDecimal(e.target.value))}
    />
  );
}

function Spark({ pts }: { pts: number[] }) {
  if (pts.length < 2) return <span className="mill-spark-empty">chưa đủ lần đo để vẽ xu hướng</span>;
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const span = max - min || 1;
  const xy = pts.map((v, i) => [(i * (116 / (pts.length - 1)) + 2).toFixed(1), (26 - ((v - min) / span) * 22).toFixed(1)]);
  const last = xy[xy.length - 1];
  return (
    <svg className="mill-spark" viewBox="0 0 120 30" role="img" aria-label={`Rung lớn nhất ${pts.length} lần đo gần nhất: ${pts.map((v) => fmtVi(v)).join(", ")} mm/s`}>
      <polyline points={xy.map((p) => p.join(",")).join(" ")} />
      <circle cx={last[0]} cy={last[1]} r="2.6" />
    </svg>
  );
}

export function MillMachineCard({ device, date, row, saved, previous, trend, dirty, canEdit, saving, onField, onTime, onNote, onSave }: {
  device: VibrationDeviceDto;
  /** Ngày ca đang nhập — đưa sang trang Phân tích MILL. */
  date: string;
  row: MillRow;
  saved: VibrationRecordDto | undefined;
  previous: VibrationRecordDto | undefined;
  /** Rung lớn nhất (mm/s) của tối đa 8 lần đo gần nhất, cũ → mới. */
  trend: number[];
  dirty: boolean;
  canEdit: boolean;
  saving: boolean;
  onField: (field: string, value: string) => void;
  onTime: (value: string) => void;
  onNote: (value: string) => void;
  onSave: () => void;
}) {
  const filled = filledCount(row);
  const numeric = Object.fromEntries(Object.entries(row.v).map(([k, v]) => [k, parseCell(v) ?? null]));
  const { maxVelocity, maxTemp } = millMax(numeric);
  const where = (kind: "v" | "t") => {
    let best: { k: string; n: number } | null = null;
    for (const [k, n] of Object.entries(numeric)) {
      if (n == null) continue;
      const isV = /^b[1-6]v[XYZ]$/.test(k);
      const isT = /^b[1-6]t$/.test(k) || k === "gearSmall" || k === "gearRing";
      if ((kind === "v" ? isV : isT) && (!best || n > best.n)) best = { k, n };
    }
    return best ? keyWhere(best.k) : "";
  };
  const prevMax = previous ? millMax(previous.millData).maxVelocity : null;
  const change = riseVsPrevious(maxVelocity, prevMax);
  const changeCls = change == null ? "" : change >= 25 ? "up" : change <= -25 ? "down" : "";
  const measured = !!saved && (filledCount(row, false) > 0 || row.note.trim() !== "");

  let state: "empty" | "draft" | "saved" = "empty";
  let badge = "Chưa nhập";
  if (dirty) {
    state = "draft";
    badge = measured ? "Đã sửa — chưa lưu" : "Bản nháp — chưa lưu";
  } else if (measured) {
    state = "saved";
    badge = `Đã lưu ${vnClock(saved!.savedAt)}`;
  }

  const groups = [
    { cls: "mill-velocity", kind: "v", title: "Vận tốc rung", unit: "mm/s" },
    { cls: "mill-displacement", kind: "d", title: "Biên độ", unit: "µm" },
  ] as const;
  const ro = !canEdit;
  const prevMd = previous?.millData ?? null;
  const cell = (k: string, label: string) => <Cell field={k} row={row} prev={prevMd} readOnly={ro} label={`${device.name} ${label}`} onChange={onField} />;
  const extraLabel = (k: "gearSmall" | "gearRing", text: string, title: string) => (
    <label title={title}>
      {text} (°C)
      <span className="mill-extra-input">{cell(k, `${text} °C`)}</span>
    </label>
  );

  return (
    <article className="mill-card" data-state={state} data-mill-card={device.id}>
      <header>
        <div>
          <span>{device.area} · {device.legacyId || device.id}</span>
          <h2><DeviceAnalysisLink href={millAnalysisHref(device.id, date)} className="mill-an-link" title="Mở Phân tích độ rung MILL của máy này">{device.name}</DeviceAnalysisLink></h2>
        </div>
        <span className="mill-fill" data-fill={device.id}>{filled}/{MILL_FIELD_TOTAL} ô số</span>
        <span className="mill-saved" data-state={state}>{badge}</span>
        <button type="button" className="secondary-button small" data-save-mill={device.id} disabled={ro || saving} onClick={onSave}>
          {saving ? "Đang lưu…" : "Lưu máy này"}
        </button>
      </header>
      <dl className="mill-summary">
        <div className={maxVelocity != null && maxVelocity > 5 ? "up2" : ""}>
          <dt>Rung lớn nhất</dt>
          <dd>{maxVelocity != null ? <><b>{fmtVi(maxVelocity)}</b> mm/s<small>{where("v")}</small></> : "—"}</dd>
        </div>
        <div>
          <dt>Nhiệt cao nhất</dt>
          <dd>{maxTemp != null ? <><b>{fmtVi(maxTemp, 1)}</b> °C<small>{where("t")}</small></> : "—"}</dd>
        </div>
        <div className={changeCls}>
          <dt>So với lần trước</dt>
          <dd>
            {previous ? (
              <>
                <b>{change != null ? `${change > 0 ? "+" : ""}${fmtVi(change, 0)} %` : "—"}</b>
                <small>
                  {previous.date?.split("-").reverse().join("/")} · {previous.shift ? SHIFT_NAME[previous.shift] : ""}
                  {prevMax != null ? ` · ${fmtVi(prevMax)} mm/s` : ""}
                </small>
              </>
            ) : (
              <>
                <b>—</b>
                <small>chưa có lần đo trước</small>
              </>
            )}
          </dd>
        </div>
        <div className="mill-trend">
          <dt>Xu hướng rung lớn nhất</dt>
          <dd><Spark pts={trend} /></dd>
        </div>
      </dl>
      <div className="mill-sheet-scroll">
        <table className="mill-sheet">
          <thead>
            <tr>
              <th>Thông số</th>
              {MILL_BEARINGS.map((n) => <th key={n}>Gối #{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) =>
              MILL_AXES.map((axis, i) => (
                <tr key={`${g.kind}${axis}`} className={`${g.cls}${i === 2 ? " mill-group-end" : ""}`}>
                  {i === 0 && <th rowSpan={3}>{g.title}<small>{g.unit}</small></th>}
                  {MILL_BEARINGS.map((n) => (
                    <td key={n}>
                      <span className="mill-axis">{axis}</span>
                      {cell(`b${n}${g.kind}${axis}`, `Gối #${n} ${g.title} ${axis} (${g.unit})`)}
                    </td>
                  ))}
                </tr>
              ))
            )}
            <tr className="mill-temperature">
              <th>Nhiệt độ<small>°C</small></th>
              {MILL_BEARINGS.map((n) => (
                <td key={n}>
                  <span className="mill-axis">T</span>
                  {cell(`b${n}t`, `Gối #${n} nhiệt độ °C`)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mill-extra">
        {extraLabel("gearSmall", "Bánh răng nhỏ", "Bánh răng nhỏ")}
        {extraLabel("gearRing", "Vành răng lớn", "Vành răng lớn")}
        <label title="Tiêu hao dầu VRL trong ngày — nhập ở thẻ «Mức tiêu hao dầu VRL trong ngày»">
          Dầu VRL tiêu hao/ngày (cm)
          <span className="mill-extra-input">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              data-field="oil"
              value={row.v.oil ?? ""}
              aria-label={`${device.name} Dầu VRL tiêu hao/ngày cm`}
              readOnly
              data-oil-ro=""
              title="Nhập ở thẻ «Mức tiêu hao dầu VRL trong ngày»"
              onChange={noop}
            />
          </span>
        </label>
        <label>
          Giờ đo (24h)
          <input
            type="text"
            inputMode="numeric"
            enterKeyHint="next"
            placeholder=":"
            data-time-mask=""
            maxLength={5}
            data-field="time"
            value={row.time}
            readOnly={ro}
            onChange={(e) => onTime(/^delete/.test((e.nativeEvent as InputEvent).inputType || "") ? e.target.value : maskTime(e.target.value))}
            onBlur={(e) => {
              const v = padTime(e.target.value);
              if (v !== e.target.value) onTime(v);
            }}
          />
        </label>
        <label className="mill-note-field">
          Nhận xét
          <input data-field="note" value={row.note} list="millNoteHints" readOnly={ro} maxLength={500} onChange={(e) => onNote(e.target.value)} />
        </label>
      </div>
    </article>
  );
}
