"use client";

import * as React from "react";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { useVibrationAccess } from "@/hooks/useVibrationAccess";
import { useVibrationDevices, useVibrationRecords } from "@/hooks/useVibration";
import { groupsOf } from "@/lib/vibration/classify";
import { DEFAULT_MEASURE_GROUP, MEASURE_GROUPS } from "@/lib/vibration/constants";
import { vnToday } from "@/lib/vibration/parse";
import { VIBRATION_ENTRY_LEVELS } from "@/lib/vibration-permissions";
import { EntryDateBar } from "./entry-date-bar";
import { EntrySheet } from "./entry-sheet";
import { VcPageTitle } from "./export-ui";
import { compareAreas } from "./vibration-area-order";
import { weeklyExport } from "./weekly-export-bar";

const collator = new Intl.Collator("vi", { numeric: true });

export function WeeklyEntryView() {
  const { can } = useRbacAccess();
  const rbacEdit = can("vibration-entry", [...VIBRATION_ENTRY_LEVELS]);
  const vibAccess = useVibrationAccess();
  const [date, setDate] = React.useState(() => vnToday());
  const [areaPick, setAreaPick] = React.useState("");
  const [groupPick, setGroupPick] = React.useState(DEFAULT_MEASURE_GROUP);
  const [exportScope, setExportScope] = React.useState("current");

  const devicesQ = useVibrationDevices({ kind: "WEEKLY" });
  const recordsQ = useVibrationRecords({ kind: "WEEKLY", date });

  const all = React.useMemo(() => devicesQ.data ?? [], [devicesQ.data]);
  const allAreas = React.useMemo(() => [...new Set(all.map((d) => d.area))].sort(compareAreas), [all]);
  const areas = vibAccess.entryAreas(allAreas);
  const area = areas.includes(areaPick) ? areaPick : vibAccess.defaultArea(areas);
  // RBAC (vibration-entry) + cương vị: chỉ nhập thiết bị thuộc cương vị của mình (app cũ).
  const canEdit = rbacEdit && vibAccess.canEditArea(area);
  const inArea = React.useMemo(() => all.filter((d) => d.area === area), [all, area]);

  const groupOptions = React.useMemo(
    () =>
      MEASURE_GROUPS.map((g) => ({ ...g, count: inArea.filter((d) => groupsOf(d.measureGroups).includes(g.id)).length })).filter((g) => g.count > 0),
    [inArea]
  );
  const group =
    groupPick === "all" || groupOptions.some((g) => g.id === groupPick)
      ? groupPick
      : groupOptions.find((g) => g.id === DEFAULT_MEASURE_GROUP)?.id ?? groupOptions[0]?.id ?? "all";
  const groupLabel = group === "all" ? "Tất cả thiết bị" : MEASURE_GROUPS.find((g) => g.id === group)?.label ?? group;

  const devices = React.useMemo(() => {
    const list = group === "all" ? inArea : inArea.filter((d) => groupsOf(d.measureGroups).includes(group));
    return area === "Trạm nước thô" ? [...list].sort((a, b) => collator.compare(a.name, b.name)) : list;
  }, [inArea, group, area]);

  const devicesOfArea = (a: string) => {
    const list = all.filter((d) => d.area === a && (group === "all" || groupsOf(d.measureGroups).includes(group)));
    return a === "Trạm nước thô" ? [...list].sort((x, y) => collator.compare(x.name, y.name)) : list;
  };

  return (
    <>
      <VcPageTitle>Nhập thông số theo kỳ</VcPageTitle>
      {devicesQ.isLoading ? (
        <p className="rs-msg" role="status">Đang tải danh sách thiết bị...</p>
      ) : devicesQ.isError ? (
        <p className="rs-msg" data-kind="err" role="alert">Không tải được danh sách thiết bị đo độ rung.</p>
      ) : (
        <EntrySheet
          key={`${date}|${area}`}
          kind="WEEKLY"
          date={date}
          draftKey={`WEEKLY|${date}|${area}`}
          devices={devices}
          records={recordsQ.data?.records}
          recordsLoading={recordsQ.isLoading}
          captionPrefix={`${area} · ${groupLabel}`}
          noun="thiết bị"
          saveLabel={(n) => `Lưu bảng (${n} thiết bị)`}
          readOnly={!canEdit}
          readOnlyNotice={rbacEdit ? vibAccess.notice(area) : null}
          showSystem
          showPower
          layoutClass="weekly-layout"
          toolbar={({ person, actions }) => (
            <div className="mill-toolbar panel weekly-toolbar">
              <EntryDateBar label="Ngày nhập" inputId="weekDate" date={date} onChange={setDate} resetLabel="Hôm nay" resetTitle="Về ngày hôm nay (giờ Việt Nam)" onReset={() => setDate(vnToday())} />
              <label>
                Cương vị
                <select id="weekArea" value={area} onChange={(e) => setAreaPick(e.target.value)}>
                  {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label>
                Kỳ đo
                <select id="weekGroup" value={group} onChange={(e) => setGroupPick(e.target.value)}>
                  <option value="all">Tất cả thiết bị ({inArea.length})</option>
                  {groupOptions.map((g) => <option key={g.id} value={g.id}>{g.label} ({g.count})</option>)}
                </select>
              </label>
              {person}
              {actions}
            </div>
          )}
          exportSlot={(api) =>
            weeklyExport({ api, date, area, areas, currentDevices: devices, records: recordsQ.data?.records ?? [], devicesOfArea, scope: exportScope, onScope: setExportScope })
          }
        />
      )}
    </>
  );
}
