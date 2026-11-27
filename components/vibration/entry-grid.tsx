"use client";

import * as React from "react";
import { touchDecimal } from "./touch-input";
import { MEASURE_GROUP_RANGES, QUICK_NOTES, VIB_LABELS } from "@/lib/vibration/constants";
import { normalizeTime, parseCell } from "@/lib/vibration/parse";
import type { VibrationDeviceDto } from "@/lib/vibration/types";
import { cn } from "@/lib/utils";
import {
  BLANK_ROW, COMMA_ERROR, NUMBER_PATTERN, OLD_CELL_ERROR, OLD_STATUS_LABEL, TIME_ERROR, TIME_PATTERN,
  colNo, enabledIdx, fieldCol, fmtDate, maskTime, padTime, rowStatus, splitLabel,
  type CellUpdate, type RowDraft,
} from "./entry-grid-model";
import { DeviceAnalysisLink, analysisHref } from "./analysis-links";

export interface EntryGridProps {
  /** Ngày nhập (hiện ở cột "Ngày nhập" của bảng Theo kỳ). */
  date: string;
  person: string;
  devices: VibrationDeviceDto[];
  draft: Record<string, RowDraft>;
  savedRows: Record<string, RowDraft>;
  missing: Set<string>;
  readOnly: boolean;
  /** Bảng Theo kỳ: hiện cột Ngày nhập / Hệ thống / Công suất. MNK: ẩn (class `mnk-compact`). */
  showSystem: boolean;
  showPower: boolean;
  /** Chỉ số (0–22) các cột đo đang hiển thị. */
  visibleIdx: number[];
  savingId: string | null;
  onUpdate: (updates: CellUpdate[]) => void;
  onSaveRow: (id: string) => void;
  onMessage: (message: string | null) => void;
}

const NOOP = () => {};
const NUM_TITLE = "Nhập số bằng dấu chấm, ví dụ 14.6; không dùng dấu phẩy";
const TIME_TITLE = "Giờ 24h: nhập 530 → 05:30 hoặc 1430 → 14:30";
const GROUP_META: Record<string, { cls: string; text: string }> = {
  current: { cls: "group-current", text: "DÒNG ĐIỆN ĐỘNG CƠ (A)" },
  motorUnloaded: { cls: "group-motor", text: "ĐỘNG CƠ (ĐC) · GỐI KT (NDE)" },
  motorLoaded: { cls: "group-motor", text: "ĐỘNG CƠ (ĐC) · GỐI CT (DE)" },
  pumpFanUnloaded: { cls: "group-machine", text: "QUẠT / BƠM (QB) · GỐI KT (NDE)" },
  pumpFanLoaded: { cls: "group-machine", text: "QUẠT / BƠM (QB) · GỐI CT (DE)" },
};

type Cell = HTMLInputElement | HTMLSelectElement;
const isCell = (el: EventTarget): el is Cell => el instanceof HTMLInputElement || el instanceof HTMLSelectElement;

/** Lưới nhập chung cho Theo kỳ và MNK theo ca (DOM/class như bảng `.entry-sheet` của web độ rung cũ). */
export function EntryGrid(props: EntryGridProps) {
  const { date, person, devices, draft, savedRows, missing, readOnly, showSystem, showPower, visibleIdx, savingId, onUpdate, onSaveRow, onMessage } = props;
  const compact = !showSystem; // MNK
  const tableRef = React.useRef<HTMLTableElement>(null);

  function onChange(e: React.ChangeEvent<HTMLElement>) {
    const el = e.target;
    if (!isCell(el) || readOnly) return;
    const id = el.dataset.id;
    const col = fieldCol(el.dataset.field);
    if (!id || col === null) return;
    if (el instanceof HTMLSelectElement) {
      // Chọn nhận xét nhanh: điền vào ô nhận xét rồi đưa con trỏ vào ô đó.
      if (!el.value) return;
      onUpdate([{ id, col: "note", value: el.value }]);
      const input = el.parentElement?.querySelector<HTMLInputElement>('input[data-field="note"]');
      requestAnimationFrame(() => input?.focus());
      return;
    }
    let value = el.value;
    if (col !== "time" && col !== "note") value = touchDecimal(value); // điện thoại: bàn phím số gõ "," ⇒ đổi thành "."
    if (col === "time") {
      const ev = e.nativeEvent as InputEvent;
      if (!/^delete/.test(ev.inputType || "")) value = maskTime(value);
      el.setCustomValidity("");
    } else if (col !== "note") {
      if (value.includes(",")) return onMessage(COMMA_ERROR); // như beforeinput của bản cũ: dấu phẩy không vào ô
      if (parseCell(value) === undefined) onMessage(OLD_CELL_ERROR);
    }
    onUpdate([{ id, col, value }]);
  }

  function onBlur(e: React.FocusEvent<HTMLElement>) {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.dataset.field !== "measureTime" || readOnly || !el.dataset.id) return;
    const padded = padTime(el.value);
    const n = normalizeTime(padded);
    if (n === null) {
      el.setCustomValidity(TIME_ERROR);
      el.reportValidity();
      onMessage(TIME_ERROR);
      return;
    }
    el.setCustomValidity("");
    if (n !== el.value) onUpdate([{ id: el.dataset.id, col: "time", value: n }]);
  }

  function cellAt(r: number, c: number) {
    return tableRef.current?.querySelector<HTMLInputElement>(`input[data-row="${r}"][data-col="${c}"]:not(:disabled)`) ?? null;
  }

  /** Enter/↓ xuống cùng cột, Shift+Enter/↑ lên (đúng như bản cũ). */
  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || !el.dataset.id) return;
    let r = Number(el.dataset.row);
    const c = Number(el.dataset.col);
    if (e.key === "Enter") r += e.shiftKey ? -1 : 1;
    else if (e.key === "ArrowDown") r++;
    else if (e.key === "ArrowUp") r--;
    else return;
    const cell = cellAt(r, c);
    if (cell) {
      e.preventDefault();
      cell.focus();
    }
  }

  /** Dán khối TSV từ Excel bắt đầu từ ô đang đứng; sai hoặc vượt bảng thì không dán gì. */
  function onPaste(e: React.ClipboardEvent<HTMLElement>) {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || !el.dataset.id || readOnly) return;
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text)) {
      if (el.dataset.numeric && parseCell(text) === undefined) {
        e.preventDefault();
        onMessage(OLD_CELL_ERROR);
      }
      return;
    }
    e.preventDefault();
    const rows = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((s) => s.split("\t"));
    const r = Number(el.dataset.row);
    const c = Number(el.dataset.col);
    const vis = [...new Set([...(tableRef.current?.querySelectorAll<HTMLInputElement>(`input[data-row="${r}"]`) ?? [])].map((x) => Number(x.dataset.col)))].sort((a, b) => a - b);
    const at = vis.indexOf(c);
    const colOf = (j: number) => (at >= 0 && vis[at + j] != null ? vis[at + j] : c + j);
    const updates: CellUpdate[] = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < rows[i].length; j++) {
        const cell = cellAt(r + i, colOf(j));
        const col = cell ? fieldCol(cell.dataset.field) : null;
        if (!cell || !cell.dataset.id || col === null) return onMessage("Vùng dán vượt bảng hoặc đi qua ô không áp dụng. Chưa dán dữ liệu.");
        const value = rows[i][j].trim();
        if (cell.dataset.numeric && parseCell(value) === undefined) return onMessage(`${OLD_CELL_ERROR} Chưa dán dữ liệu.`);
        updates.push({ id: cell.dataset.id, col, value });
      }
    }
    onUpdate(updates);
  }

  const groupHeads = MEASURE_GROUP_RANGES.map((g) => ({ ...g, span: visibleIdx.filter((i) => i >= g.from && i <= g.to).length })).filter((g) => g.span > 0);
  const infoSpan = 1 + (showSystem ? 2 : 0) + 1 + (showPower ? 1 : 0) + 1;

  return (
    <div className="sheet-scroll">
      <table
        ref={tableRef}
        className={cn("entry-sheet", compact && "mnk-compact")}
        style={compact ? ({ "--mnk-left": "38px" } as React.CSSProperties) : undefined}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      >
        <thead>
          <tr className="group-row">
            <th colSpan={infoSpan} className="group-info">THÔNG TIN CHUNG</th>
            {groupHeads.map((g) => {
              const meta = GROUP_META[g.key];
              return compact && g.key === "motorUnloaded" ? (
                <th key={g.key} colSpan={g.span} className={meta.cls} title="Động cơ · gối KT (NDE): MNK chỉ đo nhiệt độ">ĐC · KT (NDE)</th>
              ) : (
                <th key={g.key} colSpan={g.span} className={meta.cls}>{meta.text}</th>
              );
            })}
            <th colSpan={4} className="group-notes">GHI NHẬN &amp; ĐÁNH GIÁ</th>
          </tr>
          <tr className="column-row">
            <th className="fixed-col fixed-stt">STT</th>
            {showSystem && <th className="fixed-col fixed-date">Ngày nhập</th>}
            {showSystem && <th className="fixed-col fixed-system">Hệ thống</th>}
            <th className="fixed-col fixed-device">Tên thiết bị</th>
            {showPower && <th>Công suất tổ máy (MW)</th>}
            <th className={compact ? "mnk-time-col" : undefined}>Giờ đo</th>
            {visibleIdx.map((i) => {
              const [name, unit] = splitLabel(i);
              return compact ? (
                <th key={i} title={VIB_LABELS[i]}>{name}<small>{unit}</small></th>
              ) : (
                <th key={i}>{VIB_LABELS[i]}</th>
              );
            })}
            <th className={compact ? "mnk-person-col" : undefined}>Người đo</th>
            <th className="note-col" style={{ minWidth: 300, width: 300 }}>Nhận xét</th>
            <th className={compact ? "mnk-status-col" : undefined}>Trạng thái cảnh báo</th>
            <th className={compact ? "mnk-save-col" : undefined}>Lưu riêng</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d, r) => (
            <EntryRow
              key={d.id}
              date={date}
              person={person}
              device={d}
              index={r}
              row={draft[d.id] ?? savedRows[d.id] ?? BLANK_ROW}
              hasSaved={!!savedRows[d.id]}
              missing={missing.has(d.id)}
              readOnly={readOnly}
              showSystem={showSystem}
              showPower={showPower}
              visibleIdx={visibleIdx}
              saving={savingId === d.id}
              onSaveRow={onSaveRow}
            />
          ))}
          {!devices.length && (
            <tr><td colSpan={20}>Không có thiết bị nào trong phạm vi đã chọn.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const EntryRow = React.memo(function EntryRow({
  date, person, device: d, index, row, hasSaved, missing, readOnly, showSystem, showPower, visibleIdx, saving, onSaveRow,
}: {
  date: string;
  person: string;
  device: VibrationDeviceDto;
  index: number;
  row: RowDraft;
  hasSaved: boolean;
  missing: boolean;
  readOnly: boolean;
  showSystem: boolean;
  showPower: boolean;
  visibleIdx: number[];
  saving: boolean;
  onSaveRow: (id: string) => void;
}) {
  const status = OLD_STATUS_LABEL[React.useMemo(() => rowStatus(d, row), [d, row])];
  const common = { "data-row": index, "data-id": d.id } as const;
  const numeric = (field: string, col: number, value: string, label: string, disabled: boolean) => (
    <input
      aria-label={`${d.name} / ${label}`}
      {...common}
      data-col={col}
      data-field={field}
      value={value}
      data-numeric="true"
      type="text"
      inputMode="decimal"
      enterKeyHint="next"
      pattern={NUMBER_PATTERN}
      title={NUM_TITLE}
      aria-invalid={parseCell(value) === undefined ? true : undefined}
      disabled={disabled}
      onChange={NOOP}
    />
  );
  return (
    <tr className={missing ? "row-missing" : undefined}>
      <td className="fixed-col fixed-stt row-number">{index + 1}</td>
      {showSystem && <td className="fixed-col fixed-date sheet-readonly">{fmtDate(date)}</td>}
      {showSystem && <td className="fixed-col fixed-system sheet-readonly">{d.system || ""}</td>}
      <th className="fixed-col fixed-device device-name"><DeviceAnalysisLink href={analysisHref(d.id)} title="Mở Phân tích độ rung của máy này">{d.name}</DeviceAnalysisLink></th>
      {showPower && <td>{numeric("power", 4, row.power, "Công suất tổ máy (MW)", readOnly)}</td>}
      <td>
        <input
          aria-label={`${d.name} / Giờ đo`}
          {...common}
          data-col={5}
          data-field="measureTime"
          value={row.time}
          type="text"
          inputMode="numeric"
          enterKeyHint="next"
          maxLength={5}
          pattern={TIME_PATTERN}
          placeholder=":"
          data-time-mask=""
          title={TIME_TITLE}
          disabled={readOnly}
          onChange={NOOP}
        />
      </td>
      {visibleIdx.map((i) => (
        <td key={i}>{numeric(`v${i}`, colNo(i), row.v[i], VIB_LABELS[i], readOnly || !enabledIdx(d, i))}</td>
      ))}
      <td className="sheet-readonly person-cell">{person || "—"}</td>
      <td className="note-col">
        <div className="note-entry">
          <input aria-label={`${d.name} / Nhận xét`} {...common} data-col={29} data-field="note" enterKeyHint="next" value={row.note} maxLength={500} disabled={readOnly} onChange={NOOP} />
          <select data-note-choice="" {...common} data-field="note" aria-label={`${d.name} / Chọn nhận xét`} value="" disabled={readOnly} onChange={NOOP}>
            <option value="">⌄</option>
            {QUICK_NOTES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </td>
      <td className="sheet-status" data-status-id={d.id} data-state={status}>{status}</td>
      <td className="entry-save-cell">
        <button type="button" className={cn("device-save", hasSaved && "is-saved")} data-save-device={d.id} disabled={readOnly || saving} onClick={() => onSaveRow(d.id)}>
          {saving ? "Đang lưu…" : hasSaved ? "Lưu lại" : "Lưu riêng"}
        </button>
      </td>
    </tr>
  );
});
