"use client";

import * as React from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { useVibrationAccess } from "@/hooks/useVibrationAccess";
import { useSaveVibrationRecords, useVibrationDevices, useVibrationRecords } from "@/hooks/useVibration";
import { QUICK_NOTES, SHIFT_WINDOWS, TBNT_AREA, VIB_VALUE_COUNT } from "@/lib/vibration/constants";
import { cellNumber, normalizeTime, parseCell, timeInShift, vnShift, vnToday } from "@/lib/vibration/parse";
import { fixedCellLevel } from "@/lib/vibration/severity";
import type { VibrationDeviceDto, VibrationRecordDto } from "@/lib/vibration/types";
import { cn } from "@/lib/utils";
import { maskTime, padTime, TIME_ERROR } from "./entry-grid-model";
import { VcPageTitle } from "./export-ui";
import { dmy, draftKey, useDrafts, vnClock } from "./mill-utils";
import { TbntExportBar, TbntHelp, type TbntExportRow } from "./tbnt-export-bar";
import { TBNT_BEARINGS, wowkStatus, type WowkLevel } from "./tbnt-wowk";
import { DeviceAnalysisLink, analysisHref } from "./analysis-links";

const SHIFT = "chieu" as const;
// Mỗi bơm 2 hàng (Động cơ, Bơm), mỗi hàng NDE rồi DE; mỗi gối X, Y (mm/s), nhiệt độ (chỉ số trong mảng 23 giá trị).
const MACHINE_ROWS = [
  { label: "Động cơ", groups: [TBNT_BEARINGS[0], TBNT_BEARINGS[1]] },
  { label: "Bơm", groups: [TBNT_BEARINGS[2], TBNT_BEARINGS[3]] },
];
const ENTRY_INDEXES = TBNT_BEARINGS.flatMap((b) => [b.vx, b.vy, b.t]);
const VELOCITY_INDEXES = new Set(TBNT_BEARINGS.flatMap((b) => [b.vx, b.vy]));
/** Cột nhận xét trong lưới (`data-col`): 0 giờ, 1–6 hàng Động cơ, 7–12 hàng Bơm, 13 nhận xét. */
const NOTE_COL = 13;
const NUM_ERROR = "Chỉ nhập số không âm, dùng dấu chấm thập phân, không dùng dấu phẩy.";
const LV_KIND: Record<WowkLevel, string> = { na: "", normal: "ok", watch: "warn", plan: "warn", soon: "bad", stop: "bad" };

interface TbntRow {
  time: string;
  note: string;
  v: Record<number, string>;
}
interface TbntEdit {
  time?: string;
  note?: string;
  v?: Record<number, string>;
}

function savedRow(rec: VibrationRecordDto | undefined): TbntRow {
  const vals = Array.isArray(rec?.values) ? rec.values : [];
  return {
    time: rec?.measureTime ?? "",
    note: rec?.note ?? "",
    v: Object.fromEntries(ENTRY_INDEXES.map((i) => [i, cellNumber(vals[i]) == null ? "" : String(cellNumber(vals[i]))])),
  };
}
const merge = (saved: TbntRow, edit?: TbntEdit): TbntRow =>
  edit ? { time: edit.time ?? saved.time, note: edit.note ?? saved.note, v: { ...saved.v, ...(edit.v ?? {}) } } : saved;
const hasData = (r: TbntRow) => ENTRY_INDEXES.some((i) => r.v[i] !== "") || r.note.trim() !== "";

/** 23 giá trị: giữ số đã lưu ở ô không nhập, ghi đè các ô của bảng. */
function buildValues(row: TbntRow, rec: VibrationRecordDto | undefined): { values: (number | null)[]; error?: string } {
  const old = Array.isArray(rec?.values) ? rec.values : [];
  const values = Array.from({ length: VIB_VALUE_COUNT }, (_, i) => cellNumber(old[i]));
  for (const i of ENTRY_INDEXES) {
    const n = parseCell(row.v[i]);
    if (n === undefined) return { values, error: NUM_ERROR };
    values[i] = n;
  }
  return { values };
}

/** Giờ đo của bảng TBNT: pad → kiểm tra 24h → phải thuộc ca chiều (giống parseTime của bản cũ). */
function parseTimeOld(v: string): string {
  const t = normalizeTime(padTime(String(v ?? "").trim()));
  if (t === null) throw new Error(TIME_ERROR);
  if (t && !timeInShift(t, SHIFT)) throw new Error("Giờ đo không thuộc ca đã chọn.");
  return t;
}

export function TbntShiftView() {
  const { data: session } = useSession();
  const rbac = useRbacAccess();
  const rbacEdit = rbac.can("vibration-entry", ["personal", "manage", "full"]);
  const vibAccess = useVibrationAccess();
  const canEdit = rbacEdit && vibAccess.canEditArea(TBNT_AREA);
  const [date, setDate] = React.useState(() => vnShift().date);
  const [personEdit, setPerson] = React.useState<string | null>(null);
  const [drafts, updateDrafts] = useDrafts<TbntEdit>("vibration-tbnt-drafts-v1");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ text: string; kind: "ok" | "err" } | null>(null);
  const tableRef = React.useRef<HTMLTableElement>(null);
  const person = personEdit ?? session?.user?.name ?? "";

  const devicesQ = useVibrationDevices({ kind: "TBNT" });
  const recordsQ = useVibrationRecords({ kind: "TBNT", date, shift: SHIFT, withPrevious: true });
  const save = useSaveVibrationRecords();
  const devices = React.useMemo(() => devicesQ.data ?? [], [devicesQ.data]);
  const recordOf = React.useMemo(() => new Map((recordsQ.data?.records ?? []).map((r) => [r.deviceId, r])), [recordsQ.data]);
  const previous = recordsQ.data?.previous ?? {};
  const live = vnShift();

  const rowOf = (d: VibrationDeviceDto) => merge(savedRow(recordOf.get(d.id)), drafts[draftKey(date, SHIFT, d.id)]);
  const isDirty = (d: VibrationDeviceDto) => {
    const e = drafts[draftKey(date, SHIFT, d.id)];
    const base = savedRow(recordOf.get(d.id));
    return !!e && JSON.stringify(merge(base, e)) !== JSON.stringify(base);
  };
  function edit(d: VibrationDeviceDto, patch: (e: TbntEdit) => TbntEdit) {
    const k = draftKey(date, SHIFT, d.id);
    updateDrafts((prev) => ({ ...prev, [k]: patch(prev[k] ?? {}) }));
  }

  function fail(text: string) {
    setMsg({ text: `Chưa lưu: ${text}`, kind: "err" });
    toast.error(`Chưa lưu: ${text}`);
  }

  async function doSave(targets: VibrationDeviceDto[], whole: boolean) {
    if (!canEdit) return;
    if (!person.trim()) return fail("Vui lòng nhập người đo.");
    const items: { deviceId: string; person: string; measureTime: string; note: string; values: (number | null)[] }[] = [];
    const warn: string[] = [];
    const empty: string[] = [];
    for (const d of targets) {
      const row = rowOf(d);
      if (!hasData(row)) {
        if (!whole) return fail(`${d.name}: chưa có thông số hoặc nhận xét.`);
        empty.push(d.name);
        continue;
      }
      let time: string;
      try {
        time = parseTimeOld(row.time);
      } catch (e) {
        return fail(`${d.name} · Giờ đo: ${e instanceof Error ? e.message : ""}`);
      }
      if (!time) warn.push(`${d.name}: thiếu giờ đo`);
      const { values, error } = buildValues(row, recordOf.get(d.id));
      if (error) return fail(`${d.name}: ${error}`);
      items.push({ deviceId: d.id, person: person.trim(), measureTime: time, note: row.note.trim(), values });
    }
    if (!items.length) return fail("Chưa có bơm nào có thông số hoặc nhận xét để lưu.");
    if (whole && empty.length && empty.length < targets.length) warn.unshift(`Chưa có thông số hoặc nhận xét: ${empty.join(", ")}`);
    if (warn.length && !window.confirm(`${warn.join("\n")}\n\nVẫn lưu?`)) return;
    setSavingId(whole ? "all" : targets[0].id);
    try {
      await save.mutateAsync({ kind: "TBNT", date, shift: SHIFT, items });
      updateDrafts((prev) => {
        const next = { ...prev };
        for (const it of items) delete next[draftKey(date, SHIFT, it.deviceId)];
        return next;
      });
      const text = `Đã lưu ${items.length} bơm · ${SHIFT_WINDOWS[SHIFT].label.toLowerCase()} ${dmy(date)}.`;
      setMsg({ text, kind: "ok" });
      toast.success(text);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Không lưu được số đo");
    } finally {
      setSavingId(null);
    }
  }

  const collectExport = (): TbntExportRow[] =>
    devices.flatMap((d) => {
      const row = rowOf(d);
      if (!hasData(row)) return [];
      const rec = recordOf.get(d.id);
      const { values, error } = buildValues(row, rec);
      if (error) throw new Error(`${d.name}: ${error}`);
      let time: string;
      try {
        time = parseTimeOld(row.time);
      } catch (e) {
        throw new Error(`${d.name} · Giờ đo: ${e instanceof Error ? e.message : ""}`);
      }
      return [{ d, time, note: row.note.trim(), values, dirty: !rec || isDirty(d), person: rec?.person || person, prevValues: previous[d.id]?.values ?? null }];
    });

  // ---- Phím tắt / dán khối kiểu Excel (đúng như tbnt-shift.js): data-r = bơm thứ k, data-col = ô trong hàng bơm ----
  const cellAt = (r: number, c: number) => tableRef.current?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-col="${c}"]`) ?? null;
  const deviceOf = (el: HTMLElement) => devices.find((d) => d.id === el.dataset.tb);

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const i = e.target;
    if (!(i instanceof HTMLInputElement) || !i.dataset.tb || i.readOnly || !canEdit) return;
    let r = Number(i.dataset.r);
    let c = Number(i.dataset.col);
    if (e.key === "Enter" || e.key === "ArrowDown") r += e.key === "Enter" && e.shiftKey ? -1 : 1;
    else if (e.key === "ArrowUp") r--;
    else if (e.key === "Tab") {
      c += e.shiftKey ? -1 : 1;
      if (c > NOTE_COL) {
        r++;
        c = 0;
      }
      if (c < 0) {
        r--;
        c = NOTE_COL;
      }
    } else return;
    const next = cellAt(r, c);
    if (next) {
      e.preventDefault();
      next.focus();
      next.select();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLElement>) {
    const i = e.target;
    if (!(i instanceof HTMLInputElement) || !i.dataset.tb || i.readOnly || !canEdit) return;
    const text = e.clipboardData.getData("text/plain") || "";
    if (!/[\t\r\n]/.test(text)) return;
    e.preventDefault();
    try {
      const grid = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((x) => x.split("\t"));
      const updates: { d: VibrationDeviceDto; f: string; v: string }[] = [];
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const cell = cellAt(Number(i.dataset.r) + r, Number(i.dataset.col) + c);
          const d = cell ? deviceOf(cell) : undefined;
          if (!cell || cell.readOnly || !d || !cell.dataset.f) throw new Error("Vùng dán vượt bảng. Chưa dán dữ liệu.");
          let v = grid[r][c];
          if (/^v\d+$/.test(cell.dataset.f) && parseCell(v) === undefined) throw new Error(NUM_ERROR);
          if (cell.dataset.f === "time") v = parseTimeOld(v);
          updates.push({ d, f: cell.dataset.f, v });
        }
      }
      for (const u of updates) {
        edit(u.d, (x) =>
          u.f === "time" ? { ...x, time: u.v } : u.f === "note" ? { ...x, note: u.v } : { ...x, v: { ...(x.v ?? {}), [Number(u.f.slice(1))]: u.v } }
        );
      }
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Không dán được.", kind: "err" });
    }
  }

  const done = devices.filter((d) => recordOf.has(d.id)).length;
  const isLive = live.date === date && live.shift === SHIFT;
  const st = devices.length && done === devices.length ? "done" : done ? "part" : "todo";
  const w = SHIFT_WINDOWS[SHIFT];
  const loading = devicesQ.isLoading || recordsQ.isLoading;
  const attrs = (d: VibrationDeviceDto, f: string, r: number, col: number, label: string) =>
    ({ "data-tb": d.id, "data-f": f, "data-r": r, "data-col": col, "aria-label": `${d.name} · ${label}` }) as const;

  return (
    <section className="rs-page tbnt-page">
      <VcPageTitle>Nhập thông số Trạm bơm nước thô theo ca</VcPageTitle>
      <div className="panel tbnt-tools">
        <div className="tbnt-top">
          <div className="tbnt-date">
            <label>
              Ngày đo
              <input type="date" id="tbntDate" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </label>
            <button type="button" className="secondary-button small" aria-label="Ngày trước" onClick={() => setDate((x) => new Date(Date.parse(`${x}T00:00:00Z`) - 86400e3).toISOString().slice(0, 10))}>‹</button>
            <button type="button" className="secondary-button small" aria-label="Ngày sau" onClick={() => setDate((x) => new Date(Date.parse(`${x}T00:00:00Z`) + 86400e3).toISOString().slice(0, 10))}>›</button>
            <button type="button" className="secondary-button small" onClick={() => setDate(vnToday())}>Hôm nay</button>
          </div>
          <label className="tbnt-area">
            Cương vị
            <input value={TBNT_AREA} readOnly />
          </label>
          <label className="tbnt-person">
            Người đo
            <input id="tbntPerson" value={person} readOnly={!canEdit} onChange={(e) => setPerson(e.target.value)} placeholder="Họ tên người đo" />
          </label>
        </div>
        <div className="tbnt-row2">
          <div className="mnk-shifts tbnt-shifts" role="group" aria-label="Chọn ca">
            <button type="button" data-tbnt-shift={SHIFT} className="selected" aria-pressed data-progress={st}>
              <strong>{w.label}</strong>
              <span className="mnk-shift-h">14–22</span>
              {isLive && <em title="Đang trong ca">●</em>}
              <b className="mnk-shift-n">{done}/{devices.length}</b>
              <span className="mnk-progress"><i style={{ width: `${devices.length ? Math.round((done / devices.length) * 100) : 0}%` }} /></span>
            </button>
          </div>
          <div className="mill-actions">
            {canEdit && (
              <button type="button" className="primary-button" id="tbntSaveAll" disabled={savingId !== null || !devices.length} onClick={() => doSave(devices, true)}>
                {savingId === "all" ? "Đang lưu…" : `Lưu ngày (${devices.length} bơm)`}
              </button>
            )}
          </div>
        </div>
      </div>

      <TbntExportBar date={date} person={person} collect={collectExport} savedCount={done} total={devices.length} onMessage={(text, kind) => setMsg({ text, kind })} />
      <p className="tbnt-muted" id="tbntGoogleStatus" role="status" aria-live="polite">Một lần/bơm/ngày · Ca chiều. Lưu lại cập nhật đúng ngày; nhập theo kỳ vẫn giữ riêng trên web.</p>
      <p className="rs-msg" id="tbntMsg" role="status" hidden={!msg} data-kind={msg?.kind}>{msg?.text}</p>
      {!canEdit && <p className="rs-msg" data-kind="warn">{(rbacEdit && vibAccess.notice(TBNT_AREA)) || "Chỉ xem: tài khoản không có quyền nhập số đo độ rung."}</p>}

      <div className="panel tbnt-wrap">
        <div className="sheet-scroll" onKeyDown={onKeyDown} onPaste={onPaste}>
          <table className="tbnt-sheet" ref={tableRef}>
            <colgroup>
              <col className="tbnt-col-name" />
              <col className="tbnt-col-time" />
              <col className="tbnt-col-bearing" />
              {Array.from({ length: 6 }, (_, i) => <col key={i} className="tbnt-col-number" />)}
              <col className="tbnt-col-note" />
              <col className="tbnt-col-status" />
              <col className="tbnt-col-save" />
            </colgroup>
            <thead>
              <tr className="group-row">
                <th colSpan={3}>BƠM &amp; ĐIỂM ĐO</th>
                <th colSpan={3}>KHÔNG DẪN ĐỘNG (NDE)</th>
                <th colSpan={3} className="tbnt-nde">DẪN ĐỘNG (DE)</th>
                <th colSpan={3}>GHI NHẬN &amp; ĐÁNH GIÁ</th>
              </tr>
              <tr>
                <th>Tên bơm</th>
                <th>Giờ đo</th>
                <th>Điểm đo</th>
                {[0, 1].flatMap((g) =>
                  [["tbnt-vel", "Phương X", "mm/s"], ["tbnt-vel", "Phương Y", "mm/s"], ["tbnt-temp", "Nhiệt độ", "°C"]].map(([cls, l, u], j) => (
                    <th key={`${g}${j}`} className={cn(cls, g === 1 && j === 0 && "tbnt-nde")}>{l}<small>{u}</small></th>
                  ))
                )}
                <th>Nhận xét</th>
                <th>Theo dõi (Wowk)</th>
                <th>Lưu riêng</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12}>Đang tải...</td></tr>
              ) : !devices.length ? (
                <tr><td colSpan={12}>Chưa có bơm nào của Trạm nước thô trong danh mục.</td></tr>
              ) : (
                devices.map((d, k) => {
                  const row = rowOf(d);
                  const rec = recordOf.get(d.id);
                  const prev = previous[d.id];
                  const dirty = isDirty(d);
                  const parsed = Array.from({ length: VIB_VALUE_COUNT }, (_, i) => {
                    const base = cellNumber(rec?.values?.[i]);
                    if (!ENTRY_INDEXES.includes(i)) return base;
                    return parseCell(row.v[i]) ?? null;
                  });
                  const status = wowkStatus(d.machine, parsed);
                  const alt = k % 2 ? "tbnt-alt" : "";
                  const ro = !canEdit;
                  return (
                    <React.Fragment key={d.id}>
                      {MACHINE_ROWS.map((mr, ri) => (
                        <tr key={mr.label} className={ri === 0 ? `tbnt-pump ${alt}` : `tbnt-pump-end ${alt}`} data-row={ri === 0 ? d.id : undefined}>
                          {ri === 0 && (
                            <>
                              <th rowSpan={2} scope="rowgroup" className="tbnt-name">
                                <small className="tbnt-index">{k + 1}</small>
                                <DeviceAnalysisLink href={analysisHref(d.id)} title="Mở Phân tích độ rung của bơm này">{d.name}</DeviceAnalysisLink>
                                {rec && !dirty && <small className="tbnt-saved" title={`${rec.person} · ${rec.measureTime}`}>Đã lưu ngày</small>}
                                {dirty && <small className="tbnt-muted">Bản nháp chưa lưu{rec ? ` (đã lưu ${vnClock(rec.savedAt)})` : ""}</small>}
                              </th>
                              <td rowSpan={2}>
                                <input
                                  {...attrs(d, "time", k, 0, "Giờ đo")}
                                  value={row.time}
                                  placeholder=":"
                                  data-time-mask=""
                                  maxLength={5}
                                  inputMode="numeric"
                                  autoComplete="off"
                                  className="tbnt-time"
                                  title="Giờ 24h: nhập 730 → 07:30 hoặc 1430 → 14:30"
                                  readOnly={ro}
                                  onChange={(e) => {
                                    e.target.setCustomValidity("");
                                    e.target.removeAttribute("aria-invalid");
                                    const raw = e.target.value;
                                    edit(d, (x) => ({ ...x, time: /^delete/.test((e.nativeEvent as InputEvent).inputType || "") ? raw : maskTime(raw) }));
                                  }}
                                  onBlur={(e) => {
                                    const i = e.target;
                                    if (ro) return;
                                    try {
                                      const t = parseTimeOld(i.value);
                                      i.setCustomValidity("");
                                      i.removeAttribute("aria-invalid");
                                      if (t !== i.value) edit(d, (x) => ({ ...x, time: t }));
                                    } catch (err) {
                                      i.setCustomValidity(err instanceof Error ? err.message : "");
                                      i.setAttribute("aria-invalid", "true");
                                      i.reportValidity();
                                    }
                                  }}
                                />
                              </td>
                            </>
                          )}
                          <th scope="row" className="tbnt-bearing" title={mr.groups.map((b) => b.label).join(" · ")}>{mr.label}</th>
                          {mr.groups.flatMap((b, gi) =>
                            [b.vx, b.vy, b.t].map((idx, ci) => {
                              const raw = row.v[idx] ?? "";
                              const n = parseCell(raw);
                              const pv = prev ? cellNumber(prev.values?.[idx]) : null;
                              const lvl = n === undefined ? "normal" : fixedCellLevel(VELOCITY_INDEXES.has(idx) ? "velocity" : "temperature", n ?? null, pv);
                              const col = ri * 6 + gi * 3 + ci + 1;
                              return (
                                <td key={idx} className={cn(ci === 2 ? "tbnt-temp" : "tbnt-vel", gi === 1 && ci === 0 && "tbnt-nde")}>
                                  <input
                                    {...attrs(d, `v${idx}`, k, col, `${b.label} ${ci === 0 ? "Phương X" : ci === 1 ? "Phương Y" : "Nhiệt độ"}`)}
                                    className={lvl === "over" ? "up2" : lvl === "rise" ? "up" : ""}
                                    value={raw}
                                    inputMode="decimal"
                                    autoComplete="off"
                                    aria-invalid={n === undefined ? true : undefined}
                                    title={pv != null && prev ? `Lần đo trước ${dmy(prev.date ?? "")}: ${pv} ${ci === 2 ? "°C" : "mm/s"}` : undefined}
                                    readOnly={ro}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      edit(d, (x) => ({ ...x, v: { ...(x.v ?? {}), [idx]: v } }));
                                    }}
                                  />
                                </td>
                              );
                            })
                          )}
                          {ri === 0 && (
                            <>
                              <td rowSpan={2} className="tbnt-note-cell">
                                <div className="note-entry">
                                  <input
                                    {...attrs(d, "note", k, NOTE_COL, "Nhận xét")}
                                    value={row.note}
                                    className="tbnt-note"
                                    maxLength={500}
                                    readOnly={ro}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      edit(d, (x) => ({ ...x, note: v }));
                                    }}
                                  />
                                  <select
                                    data-tbnt-note={d.id}
                                    aria-label={`${d.name} · Chọn nhận xét`}
                                    value=""
                                    disabled={ro}
                                    onChange={(e) => e.target.value && edit(d, (x) => ({ ...x, note: e.target.value }))}
                                  >
                                    <option value="">⌄</option>
                                    {QUICK_NOTES.map((n) => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                </div>
                              </td>
                              <td rowSpan={2} className="tbnt-status" data-status={d.id}>
                                {status.state === "none" ? (
                                  <span className="tbnt-muted">{row.note.trim() ? "Đã ghi nhận xét" : "Chưa nhập"}</span>
                                ) : (
                                  <span className="tbnt-st" data-k={LV_KIND[status.level] || ""} title={status.detail}>
                                    <b>{status.text}</b>
                                    {status.where && <small>{status.where}</small>}
                                  </span>
                                )}
                              </td>
                              <td rowSpan={2}>
                                {canEdit && (
                                  <button type="button" className="secondary-button small" data-tbnt-save={d.id} title={`${rec ? "Lưu lại" : "Lưu riêng"} ${d.name}`} disabled={savingId !== null} onClick={() => doSave([d], false)}>
                                    {savingId === d.id ? "Đang lưu…" : rec ? "Lưu lại" : "Lưu"}
                                  </button>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <TbntHelp />
    </section>
  );
}

