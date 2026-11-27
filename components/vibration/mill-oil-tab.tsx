"use client";

import * as React from "react";
import { touchDecimal } from "./touch-input";
import { toast } from "sonner";
import { useVibrationAccess } from "@/hooks/useVibrationAccess";
import { useSaveVibrationRecords, useVibrationDevices, useVibrationRecords } from "@/hooks/useVibration";
import { unitOfArea } from "@/lib/vibration/classify";
import { SHIFT_IDS, SHIFT_WINDOWS, type ShiftId } from "@/lib/vibration/constants";
import { cellNumber, parseCell, vnToday } from "@/lib/vibration/parse";
import type { VibrationDeviceDto, VibrationRecordDto } from "@/lib/vibration/types";
import { EntryDateBar } from "./entry-date-bar";
import { MillOilChart } from "./mill-oil-chart";
import { isMeasured } from "./mill-vib-tab";
import { dmy, MILL_NUM_ERROR, OIL_HIGH, OIL_LOW } from "./mill-utils";
import { DeviceAnalysisLink, millAnalysisHref } from "./analysis-links";

function OilTable({ date, devices, recordOf, edits, canEdit, canEditDev, onEdit }: {
  date: string;
  devices: VibrationDeviceDto[];
  recordOf: (d: VibrationDeviceDto) => VibrationRecordDto | undefined;
  edits: Record<string, string>;
  canEdit: boolean;
  canEditDev: (d: VibrationDeviceDto) => boolean;
  onEdit: (id: string, value: string) => void;
}) {
  return (
    <div className="an-table-wrap">
      <table className="rs-table mill-oil-table">
        <thead>
          <tr>
            <th>Máy</th>
            <th>Ca đo</th>
            <th>Bảng ca</th>
            <th>Dầu VRL (cm/ngày)</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => {
            const rec = recordOf(d);
            const raw = edits[d.id] ?? (rec?.millData?.oil != null ? String(cellNumber(rec.millData.oil) ?? "") : "");
            const n = parseCell(raw);
            const out = typeof n === "number" && (n < OIL_LOW || n > OIL_HIGH);
            return (
              <tr key={d.id}>
                <th scope="row">
                  <DeviceAnalysisLink href={millAnalysisHref(d.id, date)} className="mill-an-link" title={`Mở Phân tích độ rung MILL — ${d.name}`} arrow={false}>{d.name.replace(/^Máy nghiền /, "")}</DeviceAnalysisLink>
                  <small>{d.area}</small>
                </th>
                <td>{d.shift ? SHIFT_WINDOWS[d.shift].label : ""}</td>
                <td>{isMeasured(rec) ? "Đã đo" : "Chưa đo"}</td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    enterKeyHint="next"
                    autoComplete="off"
                    data-oil={d.id}
                    data-oil-shift={d.shift ?? undefined}
                    value={raw}
                    aria-label={`${d.name} dầu VRL tiêu hao (cm)`}
                    data-oil-bad={out ? "" : undefined}
                    readOnly={!canEdit || !canEditDev(d)}
                    onChange={(e) => onEdit(d.id, touchDecimal(e.target.value))}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


const MILL_UNITS = [
  { id: "S1", area: "Máy nghiền S1" },
  { id: "S2", area: "Máy nghiền S2" },
] as const;

export function MillOilTab({ date, setDate, person, canEdit }: {
  date: string;
  setDate: (d: string) => void;
  person: string;
  canEdit: boolean;
}) {
  // Cương vị máy nghiền: người vận hành chỉ thấy / nhập cương vị của mình (app cũ); mặc định = cương vị đầu tiên của người dùng.
  const vibAccess = useVibrationAccess();
  const ownAreas = vibAccess.entryAreas(MILL_UNITS.map((u) => u.area));
  const [unitPick, setUnitPick] = React.useState<"S1" | "S2" | "all" | null>(null);
  const defaultUnit = MILL_UNITS.find((u) => u.area === ownAreas[0])?.id ?? "S1";
  const unit = unitPick && (unitPick === "all" ? ownAreas.length > 1 : ownAreas.includes("Máy nghiền " + unitPick)) ? unitPick : defaultUnit;
  const canEditDev = (d: VibrationDeviceDto) => canEdit && vibAccess.canEditArea(d.area);
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const devicesQ = useVibrationDevices({ kind: "MILL" });
  const dayQ = useVibrationRecords({ kind: "MILL", date });
  const save = useSaveVibrationRecords();

  const byName = (a: VibrationDeviceDto, b: VibrationDeviceDto) => a.name.localeCompare(b.name, "vi");
  const devices = React.useMemo(
    () =>
      (devicesQ.data ?? [])
        .filter((d) => unit === "all" || unitOfArea(d.area) === unit)
        .sort((a, b) => SHIFT_IDS.indexOf(a.shift ?? "sang") - SHIFT_IDS.indexOf(b.shift ?? "sang") || byName(a, b)),
    [devicesQ.data, unit]
  );
  const recordOf = React.useCallback(
    (d: VibrationDeviceDto) => dayQ.data?.records.find((r) => r.deviceId === d.id && r.shift === d.shift),
    [dayQ.data]
  );
  // A,B,C | D,E,F theo chữ cái cuối của tên máy.
  const left = devices.filter((d) => /[A-C]$/i.test(d.name)).sort(byName);
  const right = devices.filter((d) => /[D-F]$/i.test(d.name)).sort(byName);

  // Giá trị đã sửa khác giá trị đã lưu.
  const changed = devices.filter((d) => {
    if (edits[d.id] === undefined) return false;
    const rec = recordOf(d);
    const old = rec?.millData?.oil != null ? String(cellNumber(rec.millData.oil) ?? "") : "";
    return edits[d.id] !== old;
  });

  function notify(text: string, kind: "ok" | "warn" | "err") {
    setMessage(text);
    if (kind === "ok") toast.success(text);
    else if (kind === "warn") toast.warning(text);
    else toast.error(text);
  }

  async function onSave() {
    if (!canEdit) return;
    if (!changed.length) return notify("Không có thay đổi dầu VRL để lưu.", "warn");
    if (!person.trim()) return notify("Chưa lưu: Vui lòng nhập người đo ở tab Độ rung/nhiệt độ MILL.", "err");
    const byShift = new Map<ShiftId, { deviceId: string; person: string; millData: { oil: number | null } }[]>();
    for (const d of changed.filter(canEditDev)) {
      const n = parseCell(edits[d.id]);
      if (n === undefined) {
        notify(`Chưa lưu: ${d.name} · Dầu VRL: ${MILL_NUM_ERROR}`, "err");
        document.querySelector<HTMLInputElement>(`[data-oil="${d.id}"]`)?.focus();
        return;
      }
      if (!d.shift) continue;
      const list = byShift.get(d.shift) ?? [];
      list.push({ deviceId: d.id, person: recordOf(d)?.person || person.trim(), millData: { oil: n } });
      byShift.set(d.shift, list);
    }
    setSaving(true);
    try {
      let count = 0;
      for (const s of SHIFT_IDS) {
        const items = byShift.get(s);
        if (!items?.length) continue;
        await save.mutateAsync({ kind: "MILL", date, shift: s, items });
        count += items.length;
      }
      setEdits((prev) => {
        const next = { ...prev };
        for (const d of changed) delete next[d.id];
        return next;
      });
      notify(`Đã lưu dầu VRL ${count} máy · ngày ${dmy(date)}; đã điền vào bảng máy nghiền đúng ca đo.`, "ok");
    } catch (e) {
      notify(`Chưa lưu: ${e instanceof Error ? e.message : "Không lưu được dầu VRL"}`, "err");
    } finally {
      setSaving(false);
    }
  }

  const onEdit = (id: string, value: string) => setEdits((p) => ({ ...p, [id]: value }));

  return (
    <section className="mill-entry mill-oil">
      <div className="mill-toolbar panel">
        <EntryDateBar label="Ngày" inputId="oilDate" date={date} onChange={setDate} resetLabel="Hôm nay" onReset={() => setDate(vnToday())} />
        <label>
          Cương vị
          <select id="oilUnit" value={unit} onChange={(e) => setUnitPick(e.target.value as typeof unit)}>
            {MILL_UNITS.filter((u) => ownAreas.includes(u.area)).map((u) => <option key={u.id} value={u.id}>{u.area}</option>)}
            {ownAreas.length > 1 && <option value="all">Tất cả cương vị máy nghiền</option>}
          </select>
        </label>
        <div className="mill-actions">
          <button id="oilSave" type="button" className="primary-button" disabled={!canEdit || saving || !changed.some(canEditDev)} onClick={onSave}>
            {saving ? "Đang lưu…" : `Lưu dầu VRL (${devices.length} máy)`}
          </button>
        </div>
      </div>
      <p className="mill-caption">
        <span>Nhập cuối ngày — số tự điền vào ô «Dầu VRL tiêu hao/ngày» của bảng máy nghiền đúng ca đo của từng máy, ngày {dmy(date)}. Ô trống = chưa nhập.</span>
      </p>
      {!canEdit ? <p className="rs-msg" data-kind="warn">Chỉ xem: tài khoản không có quyền nhập số đo độ rung.</p> : devices.some((d) => !canEditDev(d)) && <p className="rs-msg" data-kind="warn">{vibAccess.notice(devices.find((d) => !canEditDev(d))?.area) ?? "Chỉ xem: thiết bị ngoài cương vị của bạn."}</p>}
      <div className="panel mill-oil-grid">
        {devicesQ.isLoading || dayQ.isLoading ? (
          <p>Đang tải...</p>
        ) : (
          <>
            <OilTable date={date} devices={left} recordOf={recordOf} edits={edits} canEdit={canEdit} canEditDev={canEditDev} onEdit={onEdit} />
            <OilTable date={date} devices={right} recordOf={recordOf} edits={edits} canEdit={canEdit} canEditDev={canEditDev} onEdit={onEdit} />
          </>
        )}
      </div>
      <p className="mill-oil-legend">
        <span className="mill-oil-key bad" />Đỏ: tiêu hao &lt; {OIL_LOW} cm hoặc &gt; {OIL_HIGH} cm / ngày
      </p>
      <p id="millMessage" className="mill-message" role="status">{message}</p>
      <MillOilChart date={date} devices={devices} />
    </section>
  );
}
