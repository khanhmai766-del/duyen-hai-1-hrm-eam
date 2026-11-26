"use client";

import { fetchVibrationRecords } from "@/hooks/useVibration";
import { SHIFT_IDS, SHIFT_WINDOWS, type ShiftId } from "@/lib/vibration/constants";
import { actualDateOf, addDays, normalizeTime, parseCell } from "@/lib/vibration/parse";
import type { VibrationDeviceDto, VibrationRecordDto } from "@/lib/vibration/types";
import { copyCanvasPng, displayDate, downloadBlob, downloadJson, openPrintWindow } from "./export-core";
import { millAssessment, millCanvas, millPdfHtml, millWorkbook, type MillExportItem, type MillGroup } from "./export-mill";
import { EntryCaption, EntryHelp, Swatch } from "./export-ui";
import { buildMillData, dmy, rowHasData, type MillEdit, type MillRow } from "./mill-utils";

const shiftIdx = (s: string | null) => (s ? SHIFT_IDS.indexOf(s as ShiftId) : -1);

/** Dòng chú thích + nút xuất (Excel / PDF / Copy bảng thông số / Sao lưu) + hướng dẫn của tab "Độ rung/nhiệt độ MILL". */
export function MillExportBar({
  date, shift, unit, devices, rowOf, person, drafts, dayRecords, savedCount, total, scope, onScope, onMessage,
}: {
  scope: string;
  onScope: (v: string) => void;
  onMessage: (m: string) => void;
  date: string;
  shift: ShiftId;
  unit: "S1" | "S2" | "all";
  /** Máy nghiền của cương vị đang chọn (mọi ca). */
  devices: VibrationDeviceDto[];
  rowOf: (d: VibrationDeviceDto, s: ShiftId) => MillRow;
  person: string;
  drafts: Record<string, MillEdit>;
  dayRecords: VibrationRecordDto[];
  savedCount: number;
  total: number;
}) {
  const shifts: ShiftId[] = scope === "all" ? [...SHIFT_IDS] : [scope as ShiftId];
  const label = scope === "all" ? "Toàn bộ ca" : SHIFT_WINDOWS[scope as ShiftId].label;
  const unitName = unit === "all" ? "Máy nghiền S1 S2" : `Máy nghiền ${unit}`;

  /** Gom dữ liệu xuất (số đã lưu + bản nháp đang nhập), kèm bản ghi 30 ngày để tính ca trước / xu hướng. */
  async function collect(withAssess: boolean) {
    const range = await fetchVibrationRecords({ kind: "MILL", from: addDays(date, -29), to: date });
    const groups: MillGroup[] = [];
    for (const s of shifts) {
      for (const d of devices.filter((x) => x.shift === s)) {
        const row = rowOf(d, s);
        if (!rowHasData(row)) continue;
        const built = buildMillData(row);
        if (built.error) throw new Error(`${d.name}: ${built.error}`);
        const oil = parseCell(row.v.oil);
        const time = normalizeTime(row.time);
        if (time === null) throw new Error(`${d.name}: giờ đo phải có dạng HH:mm (24h).`);
        const own = range.filter((r) => r.deviceId === d.id);
        const saved = own.find((r) => r.date === date && r.shift === s);
        const prev = own
          .filter((r) => r.date && (r.date < date || (r.date === date && shiftIdx(r.shift) < shiftIdx(s))))
          .sort((a, b) => (a.date === b.date ? shiftIdx(b.shift) - shiftIdx(a.shift) : (a.date! < b.date! ? 1 : -1)))[0];
        const item: MillExportItem = {
          device: { name: d.name, area: d.area },
          data: { ...built.data, oil: oil === undefined ? null : oil },
          meta: { shift: s, note: row.note.trim(), time, actualDate: actualDateOf(date, s, time) ?? "", person: saved?.person || person },
          prev: prev?.millData ?? {},
          assess: withAssess ? millAssessment(own, date) : undefined,
        };
        let g = groups.find((x) => x.area === d.area);
        if (!g) groups.push((g = { area: d.area, items: [] }));
        g.items.push(item);
      }
    }
    if (!groups.length) throw new Error("Chưa có thông số hoặc nhận xét trong phạm vi xuất đã chọn.");
    groups.sort((a, b) => a.area.localeCompare(b.area, "vi"));
    for (const g of groups) g.items.sort((a, b) => a.device.name.localeCompare(b.device.name, "vi"));
    return { groups, count: groups.reduce((n, g) => n + g.items.length, 0) };
  }

  const actions = [
    {
      key: "excel",
      label: "Excel",
      run: async () => {
        const { groups, count } = await collect(false);
        downloadBlob(millWorkbook(groups, date, label), `Bảng đo - ${unitName} - ${displayDate(date).replace(/\//g, "-")} - ${label}.xlsx`);
        return `Đã xuất Excel ${count} máy · ${label}. Có thể gồm bản nháp chưa lưu.`;
      },
    },
    {
      key: "pdf",
      label: "PDF",
      run: async () => {
        const { groups, count } = await collect(false);
        openPrintWindow(millPdfHtml(groups, date, label), 250);
        return `Đã mở bản in ${count} máy · ${label}; chọn “Lưu dưới dạng PDF”.`;
      },
    },
    {
      key: "copy",
      label: "Copy bảng thông số",
      title: "Copy ảnh bảng thông số trong ngày (theo «Xuất»), thêm xu hướng độ rung và khuyến cáo",
      run: async () => {
        const { groups, count } = await collect(true);
        const how = await copyCanvasPng(millCanvas(groups, date, label), `Bảng thông số máy nghiền ${date} ${label}.png`);
        return how === "copied"
          ? `Đã copy ảnh bảng thông số ${count} máy · ${label} — dán vào Zalo (Ctrl+V). Có thể gồm bản nháp; xu hướng / khuyến cáo theo số đã lưu.`
          : `Trình duyệt chặn clipboard — đã tải ảnh PNG ${count} máy · ${label}.`;
      },
    },
    {
      key: "backup",
      label: "Sao lưu",
      title: "Tải bản sao dữ liệu mill (JSON)",
      run: () => {
        const ids = new Set(devices.map((d) => d.id));
        const recs = dayRecords.filter((r) => ids.has(r.deviceId) && (scope === "all" || r.shift === scope));
        downloadJson(
          {
            schema: "mill-shift-v1",
            date,
            scope,
            drafts: Object.fromEntries(Object.entries(drafts).filter(([k]) => k.startsWith(`${date}|`))),
            records: devices
              .map((d) => ({ id: d.legacyId || d.id, area: d.area, name: d.name, records: recs.filter((r) => r.deviceId === d.id) }))
              .filter((x) => x.records.length),
          },
          `Mill theo ca - ${date}.json`
        );
        return "Đã tải bản sao lưu dữ liệu mill (JSON).";
      },
    },
  ];

  return (
      <EntryCaption
        title={`${SHIFT_WINDOWS[shift].label} · ${dmy(date)} · ${savedCount}/${total} máy đã lưu`}
        hint={shift === "dem" ? "Ca đêm thuộc ngày bắt đầu ca; giờ đo trước 06:00 tính là ngày hôm sau." : "Hướng đo X / Y / Z · Ô trống là chưa đo, không phải số 0."}
        scopes={[{ value: "all", label: "Cả ngày" }, ...SHIFT_IDS.map((s) => ({ value: s, label: SHIFT_WINDOWS[s].label }))]}
        scope={scope}
        onScope={onScope}
        onMessage={onMessage}
        actions={actions}
      />
  );
}

/** Hướng dẫn "Cách nhập & ý nghĩa màu" của tab Độ rung/nhiệt độ MILL (đúng chữ bản cũ). */
export function MillHelp() {
  return (
    <EntryHelp list title="Cách nhập & ý nghĩa màu">
      <li>Nhập / dán vùng ô từ Excel; <b>Enter</b> xuống ô dưới cùng cột, <b>Tab</b> sang ô bên phải. Chỉ dùng dấu chấm thập phân (14.6).</li>
      <li><Swatch kind="red">đỏ</Swatch> vượt mức: vận tốc rung &gt; 5 mm/s hoặc biên độ &gt; 50 µm.</li>
      <li><Swatch kind="yellow">vàng</Swatch> xu hướng tăng ≥ 25 % so với lần đo ca trước của cùng máy (vận tốc, biên độ, nhiệt độ).</li>
      <li>Lưu lại ca sáng/chiều giữ người đo đã lưu; ca đêm lấy tên tài khoản đăng nhập.</li>
      <li>Lưu thiếu ô được nhắc; lưu lại cùng máy/ngày/ca sẽ ghi đè bản trước.</li>
    </EntryHelp>
  );
}
