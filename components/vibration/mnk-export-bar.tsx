"use client";

import { fetchVibrationRecords } from "@/hooks/useVibration";
import { MNK_AREA, SHIFT_IDS, SHIFT_WINDOWS, type ShiftId } from "@/lib/vibration/constants";
import { addDays } from "@/lib/vibration/parse";
import type { VibrationDeviceDto, VibrationRecordDto } from "@/lib/vibration/types";
import { dailyRowFromRecord, dailyRowOf } from "./entry-export";
import type { SheetExportApi } from "./entry-sheet";
import { downloadBlob, downloadJson, openPrintWindow } from "./export-core";
import { dailyFilename, dailyPdfHtml, dailyWorkbook, DAILY_LABELS, type DailyRow, type DailySheet } from "./export-daily";
import { mnkDayData, mnkReportText } from "./export-mnk";
import { EntryCaption, EntryHelp } from "./export-ui";

/** Dòng nút Copy báo cáo ngày / Excel / PDF / Sao lưu + hướng dẫn của màn MNK theo ca (hàm thường, `scope` do trang bọc ngoài giữ). */
export function mnkExport({
  api, date, shift, all, records, scope, onScope,
}: {
  scope: string;
  onScope: (v: string) => void;
  api: SheetExportApi;
  date: string;
  shift: ShiftId;
  /** 14 động cơ MNK (mọi ca). */
  all: VibrationDeviceDto[];
  records: VibrationRecordDto[];
}) {
  function sheets(): DailySheet[] {
    const recOf = new Map(records.map((r) => [r.deviceId, r]));
    const ids: ShiftId[] = scope === "day" ? [...SHIFT_IDS] : [scope as ShiftId];
    const rows: DailyRow[] = ids.flatMap((s) =>
      all
        .filter((d) => d.shift === s)
        .map((d) =>
          s === shift
            ? dailyRowOf(d, api.rowOf(d.id), api.person.trim() || recOf.get(d.id)?.person || "", api.isDirty(d.id) ? "Bản nháp" : recOf.has(d.id) ? "Đã lưu" : "Chưa đo", false)
            : dailyRowFromRecord(d, recOf.get(d.id), false)
        )
        .filter((r): r is DailyRow => !!r)
    );
    if (!rows.length) throw new Error("Chưa có thông số hoặc nhận xét để xuất.");
    return [{ area: MNK_AREA, labels: DAILY_LABELS, extras: [], rows }];
  }
  const scopeLabel = scope === "day" ? "Cả ngày" : SHIFT_WINDOWS[scope as ShiftId].label;
  const name = `${MNK_AREA} - ${scopeLabel}`;

  return {
    caption: (
      <EntryCaption
        className="mnk-caption"
        messageId="dailyExportMessage"
        title={api.summary}
        hint="Ô trống là chưa đo, không phải số 0."
        scopes={[{ value: "day", label: "Cả ngày" }, ...SHIFT_IDS.map((s) => ({ value: s, label: SHIFT_WINDOWS[s].label }))]}
        scope={scope}
        onScope={onScope}
        actions={[
          {
            key: "copyday",
            beforeScope: true,
            label: "Copy báo cáo ngày",
            title: "Copy tin báo cáo độ rung MNK cả ngày, kèm nhận định so với ngày trước",
            run: async () => {
              const range = await fetchVibrationRecords({ kind: "MNK", from: addDays(date, -7), to: date });
              const days = mnkDayData(all, range, date);
              if (!days.length || days[0].day !== date) throw new Error(`Chưa có số đo MNK đã lưu ngày ${date.split("-").reverse().join("/")} — lưu ca trước rồi copy.`);
              const text = mnkReportText(date, days);
              try {
                await navigator.clipboard.writeText(text);
                return `Đã copy báo cáo ngày: ${text}`;
              } catch {
                window.prompt("Trình duyệt chặn copy tự động — bấm Ctrl+C:", text);
                return;
              }
            },
          },
          {
            key: "excel",
            label: "Excel",
            run: () => {
              const s = sheets();
              downloadBlob(dailyWorkbook(s, date), dailyFilename(name, date));
              return `Đã xuất Excel: ${s[0].rows.length} thiết bị.`;
            },
          },
          {
            key: "pdf",
            label: "PDF",
            run: () => {
              openPrintWindow(dailyPdfHtml(sheets(), date));
              return "Đã mở bản in; chọn “Lưu dưới dạng PDF” trong hộp thoại in.";
            },
          },
          {
            key: "backup",
            label: "Sao lưu",
            title: "Tải bản sao bảng đo MNK đang chọn (JSON)",
            run: () => {
              downloadJson({ schema: "mnk-export-v1", date, scope, sheets: sheets() }, `Bảng đo MNK - ${date} - ${scope}.json`);
              return "Đã tải bản sao lưu bảng đo MNK (JSON).";
            },
          },
        ]}
      />
    ),
    help: (
      <EntryHelp title="Cách nhập">
        Nhập trực tiếp hoặc dán vùng từ Excel (Ctrl+V). Enter để xuống cùng cột, Tab để sang ô kế tiếp. Ô trống là chưa đo; số 0 được giữ nguyên. Thông số dùng dấu chấm thập phân (14.6), không dùng dấu phẩy. Số liệu đã lưu trong ngày được nạp lại để xem hoặc chỉnh sửa.
      </EntryHelp>
    ),
  };
}
