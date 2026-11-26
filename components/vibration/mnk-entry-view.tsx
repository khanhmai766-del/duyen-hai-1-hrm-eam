"use client";

import * as React from "react";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { useVibrationAccess } from "@/hooks/useVibrationAccess";
import { useVibrationDevices, useVibrationRecords } from "@/hooks/useVibration";
import { MNK_AREA, SHIFT_IDS, SHIFT_WINDOWS, type ShiftId } from "@/lib/vibration/constants";
import { vnShift } from "@/lib/vibration/parse";
import { VIBRATION_ENTRY_LEVELS } from "@/lib/vibration-permissions";
import { EntryDateBar } from "./entry-date-bar";
import { EntrySheet } from "./entry-sheet";
import { VcPageTitle } from "./export-ui";
import { mnkExport } from "./mnk-export-bar";

/** MNK_HIDE của bản cũ: ẩn vận tốc/biên độ X, Y của ĐC-KT (giữ nhiệt độ). */
const MNK_HIDDEN_VALUES = [3, 4, 5, 6] as const;
const shortName = (n: string) => n.replace(/^Động cơ MNK điều khiển và dịch vụ số /, "").replace(/^Động cơ MNK vận chuyển tro bay /, "");

export function MnkEntryView() {
  const { can } = useRbacAccess();
  const rbacEdit = can("vibration-entry", [...VIBRATION_ENTRY_LEVELS]);
  const vibAccess = useVibrationAccess();
  const canEdit = rbacEdit && vibAccess.canEditArea(MNK_AREA);
  const [now] = React.useState(() => vnShift());
  const [date, setDate] = React.useState(now.date);
  const [shift, setShift] = React.useState<ShiftId>(now.shift);
  const [exportScope, setExportScope] = React.useState("day");

  const devicesQ = useVibrationDevices({ kind: "MNK" });
  const recordsQ = useVibrationRecords({ kind: "MNK", date });

  const all = React.useMemo(() => devicesQ.data ?? [], [devicesQ.data]);
  const devices = React.useMemo(() => all.filter((d) => d.shift === shift), [all, shift]);
  const progress = React.useMemo(() => {
    const done = new Set((recordsQ.data?.records ?? []).map((r) => r.deviceId));
    return Object.fromEntries(
      SHIFT_IDS.map((s) => {
        const list = all.filter((d) => d.shift === s);
        return [s, { total: list.length, done: list.filter((d) => done.has(d.id)).length, names: list.map((d) => shortName(d.name)).join(", ") }];
      })
    ) as Record<ShiftId, { total: number; done: number; names: string }>;
  }, [all, recordsQ.data]);

  return (
    <>
      <VcPageTitle>Nhập thông số MNK theo ca</VcPageTitle>
      {devicesQ.isLoading ? (
        <p className="rs-msg" role="status">Đang tải danh sách động cơ...</p>
      ) : devicesQ.isError ? (
        <p className="rs-msg" data-kind="err" role="alert">Không tải được danh sách động cơ MNK.</p>
      ) : (
        <EntrySheet
          key={`${date}|${shift}`}
          kind="MNK"
          date={date}
          draftKey={`MNK|${date}|${shift}`}
          devices={devices}
          records={recordsQ.data?.records}
          recordsLoading={recordsQ.isLoading}
          captionPrefix={SHIFT_WINDOWS[shift].label}
          noun="máy"
          saveLabel={(n) => `Lưu ca (${n} máy)`}
          readOnly={!canEdit}
          readOnlyNotice={rbacEdit ? vibAccess.notice(MNK_AREA) : null}
          showSystem={false}
          showPower={false}
          hiddenIdx={MNK_HIDDEN_VALUES}
          layoutClass="mnk-layout"
          helpInside
          toolbar={({ person, actions }) => (
            <div className="mill-toolbar panel mnk-toolbar">
              <EntryDateBar
                label="Ngày ca"
                inputId="weekDate"
                date={date}
                onChange={setDate}
                resetLabel="Ca hiện tại"
                resetTitle="Về ngày và ca hiện tại"
                onReset={() => {
                  const cur = vnShift();
                  setDate(cur.date);
                  setShift(cur.shift);
                }}
              />
              <label>
                Cương vị
                <input value={MNK_AREA} readOnly />
              </label>
              {person}
              {actions}
              <div className="mnk-shifts" role="group" aria-label="Chọn ca đo MNK">
                {SHIFT_IDS.map((s) => {
                  const w = SHIFT_WINDOWS[s];
                  const p = progress[s];
                  const st = p.total && p.done === p.total ? "done" : p.done ? "part" : "todo";
                  return (
                    <button
                      key={s}
                      type="button"
                      data-mnk-shift={s}
                      className={shift === s ? "selected" : undefined}
                      data-progress={st}
                      aria-pressed={shift === s}
                      title={`${w.label} ${w.hours} · MNK ${p.names}`}
                      onClick={() => setShift(s)}
                    >
                      <strong>{w.label}</strong>
                      <span className="mnk-shift-h">{w.hours.replace(/:00/g, "").replace(" hôm sau", "")}</span>
                      <small>{p.names}</small>
                      {now.date === date && now.shift === s && <em title="Đang trong ca">●</em>}
                      <b className="mnk-shift-n">{p.done}/{p.total}</b>
                      <span className="mnk-progress"><i style={{ width: `${p.total ? Math.round((p.done / p.total) * 100) : 0}%` }} /></span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          exportSlot={(api) => mnkExport({ api, date, shift, all, records: recordsQ.data?.records ?? [], scope: exportScope, onScope: setExportScope })}
        />
      )}
    </>
  );
}
