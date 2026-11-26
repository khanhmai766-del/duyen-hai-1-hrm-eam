"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchVibrationRecords, useSaveVibrationRecords, useVibrationDevices, useVibrationRecords } from "@/hooks/useVibration";
import { unitOfArea } from "@/lib/vibration/classify";
import { SHIFT_IDS, SHIFT_WINDOWS, type ShiftId } from "@/lib/vibration/constants";
import { addDays, normalizeTime, parseCell, timeInShift, vnShift } from "@/lib/vibration/parse";
import { millMax } from "@/lib/vibration/severity";
import type { VibrationDeviceDto, VibrationRecordDto } from "@/lib/vibration/types";
import { EntryDateBar } from "./entry-date-bar";
import { MillExportBar, MillHelp } from "./mill-export-bar";
import { MillMachineCard } from "./mill-machine-card";
import {
  draftKey, fieldName, filledCount, mergeRow, MILL_KEYS, MILL_NUM_ERROR, rowHasData, savedRow, useDrafts,
  type MillEdit, type MillRow,
} from "./mill-utils";

const MSG_DEFAULT = "Số đo lưu xong được ghi vào hệ thống; số đang nhập chưa lưu được giữ tạm trên máy này.";
const shiftIdx = (s: string | null) => (s ? SHIFT_IDS.indexOf(s as ShiftId) : -1);

/** Một bản ghi tính là "đã đo" khi có số đo (không tính bản ghi chỉ có dầu VRL) hoặc nhận xét. */
export function isMeasured(rec: VibrationRecordDto | undefined) {
  if (!rec) return false;
  if (rec.note.trim()) return true;
  return Object.entries(rec.millData ?? {}).some(([k, v]) => k !== "oil" && /^(b\d|gear)/.test(k) && typeof v === "number");
}

/** Phím tắt kiểu Excel trong bảng gối: Enter/↑↓ cùng cột (hết bảng sang máy kế), ←/→ khi con trỏ ở đầu/cuối số. Giống mill-shift.js. */
function millKeyDown(e: React.KeyboardEvent<HTMLElement>) {
  const i = e.target;
  if (!(i instanceof HTMLInputElement) || !i.closest(".mill-sheet") || e.altKey || e.ctrlKey || e.metaKey) return;
  const tr = i.closest("tr");
  if (!tr) return;
  const cells = [...tr.querySelectorAll("td")];
  const col = cells.indexOf(i.closest("td") as HTMLTableCellElement);
  const at = (row: Element | null | undefined, c: number) => row?.querySelectorAll("td")[c]?.querySelector("input") ?? null;
  const sel = i.selectionStart;
  const end = i.selectionEnd;
  const len = i.value.length;
  let next: HTMLInputElement | null = null;
  if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
    const up = e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey);
    const tbody = i.closest("tbody");
    const rows = tbody ? [...tbody.rows] : [];
    const sheets = [...document.querySelectorAll<HTMLTableElement>(".mill-sheet")];
    const k = sheets.indexOf(i.closest(".mill-sheet") as HTMLTableElement);
    next = at(up ? tr.previousElementSibling : tr.nextElementSibling, col);
    if (!next && e.key !== "Enter") {
      const other = sheets[k + (up ? -1 : 1)]?.tBodies[0]?.rows;
      next = other ? at(up ? other[other.length - 1] : other[0], col) : null;
    }
    if (!next && rows.length && e.key === "Enter") return e.preventDefault();
  } else if ((e.key === "ArrowLeft" && sel === 0 && (end === 0 || end === len)) || (e.key === "ArrowRight" && end === len && (sel === len || sel === 0))) {
    next = cells[col + (e.key === "ArrowLeft" ? -1 : 1)]?.querySelector("input") ?? null;
  } else return;
  if (next) {
    e.preventDefault();
    next.focus();
    next.select?.();
  }
}

export function MillVibTab({ date, setDate, person, setPerson, canEdit }: {
  date: string;
  setDate: (d: string) => void;
  person: string;
  setPerson: (p: string) => void;
  canEdit: boolean;
}) {
  const [shift, setShift] = React.useState<ShiftId>(() => vnShift().shift);
  const [unit, setUnit] = React.useState<"S1" | "S2" | "all">("S1");
  const [exportScope, setExportScope] = React.useState("all");
  const [message, setMessage] = React.useState(MSG_DEFAULT);
  const [drafts, updateDrafts] = useDrafts<MillEdit>("vibration-mill-drafts-v1");
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const devicesQ = useVibrationDevices({ kind: "MILL" });
  const dayQ = useVibrationRecords({ kind: "MILL", date });
  const shiftQ = useVibrationRecords({ kind: "MILL", date, shift, withPrevious: true });
  const rangeQ = useQuery({
    queryKey: ["vibration-records", { kind: "MILL", spark: date }],
    queryFn: () => fetchVibrationRecords({ kind: "MILL", from: addDays(date, -45), to: date }),
    staleTime: 60_000,
  });
  const save = useSaveVibrationRecords();

  const devices = React.useMemo(
    () => (devicesQ.data ?? []).filter((d) => unit === "all" || unitOfArea(d.area) === unit),
    [devicesQ.data, unit]
  );
  const shiftDevices = React.useMemo(() => devices.filter((d) => d.shift === shift), [devices, shift]);
  const recordOf = React.useMemo(() => {
    const m = new Map<string, VibrationRecordDto>();
    for (const r of dayQ.data?.records ?? []) if (r.shift) m.set(`${r.shift}|${r.deviceId}`, r);
    return m;
  }, [dayQ.data]);
  const previous = shiftQ.data?.previous ?? {};
  const live = vnShift();

  /** Rung lớn nhất của tối đa 8 lần đo gần nhất (đến ngày/ca đang xem) của từng máy. */
  const trendOf = React.useMemo(() => {
    const by = new Map<string, { key: string; v: number }[]>();
    for (const r of rangeQ.data ?? []) {
      if (!r.date || !r.millData) continue;
      const key = `${r.date}${shiftIdx(r.shift)}`;
      if (key > `${date}${shiftIdx(shift)}`) continue;
      const v = millMax(r.millData).maxVelocity;
      if (v == null) continue;
      const list = by.get(r.deviceId) ?? [];
      list.push({ key, v });
      by.set(r.deviceId, list);
    }
    return (id: string) => (by.get(id) ?? []).sort((a, b) => a.key.localeCompare(b.key)).slice(-8).map((x) => x.v);
  }, [rangeQ.data, date, shift]);

  const rowOf = (d: VibrationDeviceDto, s: ShiftId = shift): MillRow =>
    mergeRow(savedRow(recordOf.get(`${s}|${d.id}`)), drafts[draftKey(date, s, d.id)]);
  const isDirty = (d: VibrationDeviceDto) => {
    const edit = drafts[draftKey(date, shift, d.id)];
    return !!edit && JSON.stringify(mergeRow(savedRow(recordOf.get(`${shift}|${d.id}`)), edit)) !== JSON.stringify(savedRow(recordOf.get(`${shift}|${d.id}`)));
  };

  function edit(d: VibrationDeviceDto, patch: (e: MillEdit) => MillEdit) {
    const k = draftKey(date, shift, d.id);
    updateDrafts((prev) => ({ ...prev, [k]: patch(prev[k] ?? {}) }));
  }

  function onField(d: VibrationDeviceDto, field: string, value: string) {
    edit(d, (e) => ({ ...e, v: { ...(e.v ?? {}), [field]: value } }));
    setMessage(parseCell(value) === undefined ? MILL_NUM_ERROR : "Đang nhập bản nháp — bấm Lưu để xác nhận.");
  }

  /** Dán khối TSV từ Excel: phải nằm gọn trong bảng gối của máy đang đứng, sai thì không dán gì. */
  function onPaste(e: React.ClipboardEvent<HTMLElement>) {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || !el.closest(".mill-sheet")) return;
    const text = e.clipboardData.getData("text/plain") || "";
    if (!/[\t\r\n]/.test(text)) return;
    e.preventDefault();
    try {
      const card = el.closest<HTMLElement>("[data-mill-card]");
      const d = shiftDevices.find((x) => x.id === card?.dataset.millCard);
      const tbody = el.closest("tbody");
      if (!d || !tbody || !canEdit) throw new Error("Vùng dán vượt bảng của máy đang nhập.");
      const trs = [...tbody.querySelectorAll("tr")];
      const start = trs.indexOf(el.closest("tr") as HTMLTableRowElement);
      const col = [...trs[start].querySelectorAll("input")].indexOf(el);
      const matrix = text.trimEnd().split(/\r?\n/).map((l) => l.split("\t"));
      const pending: [string, string][] = [];
      matrix.forEach((vals, i) =>
        vals.forEach((v, j) => {
          const target = trs[start + i]?.querySelectorAll("input")[col + j];
          if (!target || target.readOnly || !target.dataset.field) throw new Error("Vùng dán vượt bảng của máy đang nhập.");
          if (parseCell(v) === undefined) throw new Error(MILL_NUM_ERROR);
          pending.push([target.dataset.field, v.trim()]);
        })
      );
      edit(d, (x) => ({ ...x, v: { ...(x.v ?? {}), ...Object.fromEntries(pending) } }));
      setMessage(`Đã dán ${pending.length} ô vào bản nháp. Bấm Lưu để xác nhận.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không dán được.");
    }
  }

  function notify(text: string, kind: "ok" | "warn" | "err") {
    setMessage(text);
    if (kind === "ok") toast.success(text);
    else if (kind === "warn") toast.warning(text);
    else toast.error(text);
  }

  function flag(deviceId: string, field: string) {
    const i = document.querySelector<HTMLInputElement>(`[data-mill-card="${deviceId}"] [data-field="${field}"]`);
    i?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    i?.focus?.({ preventScroll: true });
  }

  async function doSave(targets: VibrationDeviceDto[], whole: boolean) {
    if (!canEdit) return;
    const items: { deviceId: string; person: string; measureTime: string; note: string; millData: Record<string, number | null> }[] = [];
    const missing: string[] = [];
    for (const d of targets) {
      const row = rowOf(d);
      if (!rowHasData(row)) {
        missing.push(`${d.name}: chưa nhập`);
        continue;
      }
      const data: Record<string, number | null> = {};
      for (const k of MILL_KEYS) {
        const n = parseCell(row.v[k]);
        if (n === undefined) {
          notify(`Chưa lưu: ${d.name} · ${fieldName(k)}: ${MILL_NUM_ERROR}`, "err");
          flag(d.id, k);
          return;
        }
        data[k] = n;
      }
      const time = normalizeTime(row.time);
      if (time === null) {
        notify(`Chưa lưu: ${d.name} · Giờ đo: Giờ đo phải có dạng HH:mm (24h).`, "err");
        flag(d.id, "time");
        return;
      }
      if (time && !timeInShift(time, shift)) {
        notify(`Chưa lưu: ${d.name} · Giờ đo: Giờ đo không thuộc ca đã chọn.`, "err");
        flag(d.id, "time");
        return;
      }
      if (!time) missing.push(`${d.name}: thiếu giờ`);
      const gaps = MILL_KEYS.length - filledCount(row, false);
      if (gaps > 0) missing.push(`${d.name}: thiếu ${gaps} ô số`);
      items.push({ deviceId: d.id, person: person.trim() || recordOf.get(`${shift}|${d.id}`)?.person || "", measureTime: time, note: row.note.trim(), millData: data });
    }
    if (!items.length) {
      notify(whole ? "Chưa lưu: Chưa có máy nào có thông số / nhận xét để lưu, hoặc bạn không có quyền nhập cương vị này." : "Chưa lưu: Máy này chưa có thông số / nhận xét để lưu, hoặc bạn không có quyền nhập cương vị này.", "err");
      return;
    }
    if (!person.trim()) return notify("Chưa lưu: Vui lòng nhập người đo.", "err");
    if (missing.length && !window.confirm(`${missing.join("\n")}\n\nVẫn lưu phần đã nhập?`)) {
      notify(`Chưa lưu — đã huỷ để nhập tiếp. ${missing.slice(0, 3).join(" · ")}${missing.length > 3 ? " …" : ""}`, "warn");
      return;
    }
    setSavingId(whole ? "all" : targets[0].id);
    try {
      await save.mutateAsync({ kind: "MILL", date, shift, items });
      updateDrafts((prev) => {
        const next = { ...prev };
        for (const it of items) delete next[draftKey(date, shift, it.deviceId)];
        return next;
      });
      notify(`Đã lưu ${items.length} máy.`, "ok");
    } catch (e) {
      notify(`Chưa lưu: ${e instanceof Error ? e.message : "Không lưu được số đo"}`, "err");
    } finally {
      setSavingId(null);
    }
  }

  const shiftTotals = SHIFT_IDS.map((s) => {
    const list = devices.filter((d) => d.shift === s);
    return { id: s, list, total: list.length, done: list.filter((d) => isMeasured(recordOf.get(`${s}|${d.id}`))).length };
  });
  const savedCount = shiftTotals.find((s) => s.id === shift)?.done ?? 0;
  const loading = devicesQ.isLoading || dayQ.isLoading;

  return (
    <section className="mill-entry">
      <div className="mill-toolbar panel">
        <EntryDateBar
          label="Ngày ca"
          inputId="millDate"
          date={date}
          onChange={setDate}
          resetLabel="Ca hiện tại"
          resetTitle="Về ngày và ca hiện tại"
          onReset={() => {
            const now = vnShift();
            setDate(now.date);
            setShift(now.shift);
          }}
        />
        <label>
          Cương vị
          <select id="millUnit" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
            <option value="S1">Máy nghiền S1</option>
            <option value="S2">Máy nghiền S2</option>
            <option value="all">Tất cả cương vị máy nghiền</option>
          </select>
        </label>
        <label>
          Người đo
          <input id="millPerson" value={person} readOnly={!canEdit} onChange={(e) => setPerson(e.target.value)} />
        </label>
        <div className="mill-actions">
          <button id="millSave" type="button" className="primary-button" disabled={!canEdit || savingId !== null || !shiftDevices.length} onClick={() => doSave(shiftDevices, true)}>
            {savingId === "all" ? "Đang lưu…" : `Lưu ca (${shiftDevices.length} máy)`}
          </button>
        </div>
        <div className="mill-shifts" role="group" aria-label="Chọn ca đo">
          {shiftTotals.map((s) => {
            const w = SHIFT_WINDOWS[s.id];
            const st = s.total && s.done === s.total ? "done" : s.done ? "part" : "todo";
            return (
              <button
                key={s.id}
                type="button"
                data-mill-shift={s.id}
                className={shift === s.id ? "selected" : undefined}
                data-progress={st}
                aria-pressed={shift === s.id}
                title={`${w.label} ${w.hours}`}
                onClick={() => setShift(s.id)}
              >
                <strong>{w.label}</strong>
                <span className="mill-shift-h">{w.hours.replace(/:00/g, "").replace(" hôm sau", "")}</span>
                {live.date === date && live.shift === s.id && <em title="Đang trong ca">●</em>}
                <small>{s.list.map((d) => d.name.replace(/^Máy nghiền /, "")).join(" · ")}</small>
                <b className="mill-shift-n">{s.done}/{s.total}</b>
                <span className="mill-progress"><i style={{ width: `${s.total ? Math.round((s.done / s.total) * 100) : 0}%` }} /></span>
              </button>
            );
          })}
        </div>
      </div>

      <MillExportBar
        date={date}
        shift={shift}
        unit={unit}
        devices={devices}
        rowOf={rowOf}
        person={person}
        drafts={drafts}
        dayRecords={dayQ.data?.records ?? []}
        savedCount={savedCount}
        total={shiftDevices.length}
        scope={exportScope}
        onScope={setExportScope}
        onMessage={setMessage}
      />
      <p id="millMessage" role="status">{message}</p>
      {!canEdit && <p className="rs-msg" data-kind="warn">Chỉ xem: tài khoản không có quyền nhập số đo độ rung.</p>}
      <MillHelp />
      <datalist id="millNoteHints">
        <option value="Máy dự phòng" />
        <option value="Ngừng sửa chữa" />
        <option value="Máy không vận hành" />
      </datalist>
      <div className="mill-cards" onKeyDown={millKeyDown} onPaste={onPaste}>
        {loading ? (
          <p className="panel">Đang tải...</p>
        ) : !shiftDevices.length ? (
          <p className="panel">Không có máy nghiền thuộc ca hoặc cương vị được phép xem.</p>
        ) : (
          shiftDevices.map((d) => (
            <MillMachineCard
              key={`${date}|${shift}|${d.id}`}
              device={d}
              date={date}
              row={rowOf(d)}
              saved={recordOf.get(`${shift}|${d.id}`)}
              previous={previous[d.id]}
              trend={trendOf(d.id)}
              dirty={isDirty(d)}
              canEdit={canEdit}
              saving={savingId === d.id}
              onField={(field, value) => onField(d, field, value)}
              onTime={(value) => edit(d, (e) => ({ ...e, time: value }))}
              onNote={(value) => edit(d, (e) => ({ ...e, note: value }))}
              onSave={() => doSave([d], false)}
            />
          ))
        )}
      </div>
    </section>
  );
}

