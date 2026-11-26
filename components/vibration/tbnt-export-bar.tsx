"use client";

import * as React from "react";
import { fetchVibrationRecords } from "@/hooks/useVibration";
import { SHIFT_WINDOWS } from "@/lib/vibration/constants";
import { addDays, cellNumber } from "@/lib/vibration/parse";
import { fixedCellLevel } from "@/lib/vibration/severity";
import type { VibrationDeviceDto } from "@/lib/vibration/types";
import { copyCanvasPng, downloadBlob, downloadJson, openPrintWindow } from "./export-core";
import { dailyFilename, dailyPdfHtml, dailyWorkbook, DAILY_LABELS, makeDailyRow, type DailySheet } from "./export-daily";
import { tbntCanvas, type TbntTrendPoint } from "./export-tbnt";
import { EntryCaption, EntryHelp } from "./export-ui";
import { dmy } from "./mill-utils";
import { TBNT_BEARINGS, wowkLimitMmRms, wowkStatus } from "./tbnt-wowk";

/** Một bơm có số/nhận xét (đã lưu + bản nháp) để xuất. `values` = 23 ô số. */
export interface TbntExportRow {
  d: VibrationDeviceDto;
  time: string;
  note: string;
  values: (number | null)[];
  dirty: boolean;
  person: string;
  prevValues: unknown[] | null;
}

const SHIFT = SHIFT_WINDOWS.chieu;
const COL_IDX = TBNT_BEARINGS.flatMap((b) => [b.vx, b.vy, b.t]);
const VEL_IDX: [number, string][] = TBNT_BEARINGS.flatMap((b) => [[b.vx, `${b.label} X`], [b.vy, `${b.label} Y`]] as [number, string][]);

function maxVib(values: unknown[] | null | undefined): { v: number; where: string } | null {
  let best: { v: number; where: string } | null = null;
  for (const [i, where] of VEL_IDX) {
    const v = cellNumber(values?.[i]);
    if (v != null && v > 0 && (!best || v > best.v)) best = { v, where };
  }
  return best;
}

export function TbntExportBar({
  date, collect, person, savedCount, total, onMessage,
}: {
  onMessage: (m: string, kind: "ok" | "err") => void;
  date: string;
  collect: () => TbntExportRow[];
  person: string;
  savedCount: number;
  total: number;
}) {
  const [scope, setScope] = React.useState("day");
  const scopeLabel = scope === "day" ? "Cả ngày" : SHIFT.label;

  function sheets(): DailySheet[] {
    const rows = collect().map((r) => {
      const st = wowkStatus(r.d.machine, r.values);
      const status = st.state === "none" ? "Chưa đánh giá" : [st.text, st.where].filter(Boolean).join(" · ");
      return { ...makeDailyRow(r.d, { time: r.time, note: r.note, values: r.values, person: r.person, origin: r.dirty ? "Bản nháp" : "Đã lưu" }), status };
    });
    if (!rows.length) throw new Error("Chưa có thông số hoặc nhận xét để xuất.");
    return [
      {
        area: `TBNT · ${SHIFT.label}`,
        title: `BẢNG ĐO TRẠM BƠM NƯỚC THÔ · ${SHIFT.label.toUpperCase()}`,
        labels: DAILY_LABELS,
        extras: [],
        rows,
        columnIndices: [0, 1, 3, 5, ...COL_IDX.map((i) => 6 + i), 29, 30, 31, 32],
        columnGroups: [
          ["THÔNG TIN", 4, 2],
          ...TBNT_BEARINGS.map((b) => [`${b.label.toUpperCase()} (mm/s, °C)`, 3, 5] as [string, number, number]),
          ["GHI NHẬN & ĐÁNH GIÁ", 4, 7],
        ],
      },
    ];
  }
  const name = `TBNT theo ca - ${scopeLabel}`;

  const actions = [
    {
      key: "excel",
      label: "Excel",
      run: () => {
        const s = sheets();
        downloadBlob(dailyWorkbook(s, date), dailyFilename(name, date));
        return `Đã xuất ${s.reduce((n, x) => n + x.rows.length, 0)} dòng · bản nháp được ghi rõ trong tệp.`;
      },
    },
    {
      key: "pdf",
      label: "PDF",
      run: () => {
        openPrintWindow(dailyPdfHtml(sheets(), date));
        return "Đã mở bản in. Chọn Lưu dưới dạng PDF.";
      },
    },
    {
      key: "backup",
      label: "Sao lưu",
      run: () => {
        downloadJson({ schema: "tbnt-export-v1", date, scope, sheets: sheets() }, dailyFilename(name, date, "json"));
        return "Đã tải bản sao lưu bảng đo TBNT (JSON).";
      },
    },
    {
      key: "copy",
      label: "Copy bảng + trend",
      title: "Ảnh bảng ca + trend độ rung lớn nhất 30 ngày của từng bơm",
      run: async () => {
        const rows = collect();
        if (!rows.length) throw new Error("Chưa có thông số hoặc nhận xét để tạo ảnh.");
        const range = await fetchVibrationRecords({ kind: "TBNT", from: addDays(date, -29), to: date });
        const byId = new Map(rows.map((r) => [r.d.id, r]));
        const ds = rows.map((r) => r.d);
        const series: TbntTrendPoint[][] = ds.map((d) => {
          const byDay = new Map<string, TbntTrendPoint>();
          const put = (day: string, m: { v: number; where: string } | null) => {
            if (m && (!byDay.has(day) || m.v > byDay.get(day)!.v)) byDay.set(day, { date: day, ...m });
          };
          for (const r of range) if (r.deviceId === d.id && r.date && !(r.date === date && r.shift === "chieu")) put(r.date, maxVib(r.values));
          put(date, maxVib(byId.get(d.id)!.values));
          return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
        });
        const lims = ds.map((d) => wowkLimitMmRms(d.machine)).filter((x): x is number => x != null && x > 0);
        const cv = tbntCanvas(
          {
            date,
            shiftLabel: SHIFT.label,
            shiftHours: SHIFT.hours,
            person,
            series,
            limit: lims.length ? Math.min(...lims) : null,
            rows: rows.map((r) => {
              const st = wowkStatus(r.d.machine, r.values);
              const cellOf = (idx: number, kind: "velocity" | "temperature") => {
                const n = r.values[idx];
                return { t: n == null ? "" : String(n), level: fixedCellLevel(kind, n, cellNumber(r.prevValues?.[idx])) };
              };
              return {
                name: r.d.name,
                time: r.time,
                note: r.note,
                cells: [[TBNT_BEARINGS[0], TBNT_BEARINGS[1]], [TBNT_BEARINGS[2], TBNT_BEARINGS[3]]].map((pair) =>
                  pair.flatMap((b) => [cellOf(b.vx, "velocity"), cellOf(b.vy, "velocity"), cellOf(b.t, "temperature")])
                ),
                status: st.state === "none" || st.state === "unrated" && !st.where ? r.note.trim() || (st.state === "none" ? "Chưa nhập" : st.text) : [st.text, st.where].filter(Boolean).join("\n"),
                statusLevel: st.level,
              };
            }),
          },
          ds.map((d) => d.name)
        );
        const how = await copyCanvasPng(cv, `TBNT ${date} bang-trend.png`);
        return how === "copied" ? "Đã copy ảnh bảng + trend — dán vào Zalo (Ctrl+V)." : "Trình duyệt chặn clipboard — đã tải ảnh PNG.";
      },
    },
  ];

  return (
      <EntryCaption
        bare
        className="tbnt-caption"
        title={`${SHIFT.label} · ${dmy(date)} · ${savedCount}/${total} bơm đã lưu`}
        hint="Ô trống = chưa đo · Rê chuột vào ô để xem lần đo trước."
        scopes={[{ value: "day", label: "Cả ngày" }, { value: "chieu", label: SHIFT.label }]}
        scope={scope}
        onScope={setScope}
        onMessage={(m) => onMessage(m, /^(Đã|Trình duyệt)/.test(m) ? "ok" : "err")}
        actions={actions}
      />
  );
}

/** Hướng dẫn "Cách nhập" của màn TBNT (đúng chữ bản cũ). */
export function TbntHelp() {
  return (
    <EntryHelp title="Cách nhập">
      Gõ giờ 3–4 số hoặc HH:mm. Chọn nhận xét nhanh hoặc gõ nội dung riêng. Dán vùng từ Excel theo thứ tự giờ, rồi dòng Động cơ (NDE: X, Y, nhiệt độ · DE: X, Y, nhiệt độ), dòng Bơm như vậy, nhận xét; Enter xuống bơm tiếp, Tab sang ô kế. Trạng thái Wowk theo gối rung cao nhất, kèm vị trí.
    </EntryHelp>
  );
}
