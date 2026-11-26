"use client";

import type { VibrationDeviceDto, VibrationRecordDto } from "@/lib/vibration/types";
import { dailyRowFromRecord, dailyRowOf } from "./entry-export";
import type { SheetExportApi } from "./entry-sheet";
import { downloadBlob, openPrintWindow } from "./export-core";
import { dailyFilename, dailyPdfHtml, dailyWorkbook, DAILY_LABELS, type DailyRow, type DailySheet } from "./export-daily";
import { EntryCaption, EntryHelp } from "./export-ui";

/** Dòng nút Excel / PDF + hướng dẫn của màn Theo kỳ (hàm thường, không hook: `scope` do trang bọc ngoài giữ): cương vị đang chọn (gồm bản nháp) hoặc tất cả cương vị (số đã lưu). */
export function weeklyExport({
  api, date, area, areas, devicesOfArea, currentDevices, records, scope, onScope,
}: {
  scope: string;
  onScope: (v: string) => void;
  api: SheetExportApi;
  date: string;
  area: string;
  areas: string[];
  /** Thiết bị của một cương vị theo kỳ đo đang chọn. */
  devicesOfArea: (area: string) => VibrationDeviceDto[];
  currentDevices: VibrationDeviceDto[];
  records: VibrationRecordDto[];
}) {
  function sheets(): DailySheet[] {
    const recOf = new Map(records.map((r) => [r.deviceId, r]));
    const list = scope === "all" ? areas : [area];
    const out: DailySheet[] = [];
    for (const a of list) {
      const rows = (a === area ? currentDevices : devicesOfArea(a))
        .map((d) =>
          a === area
            ? dailyRowOf(d, api.rowOf(d.id), api.person.trim() || recOf.get(d.id)?.person || "", api.isDirty(d.id) ? "Bản nháp" : recOf.has(d.id) ? "Đã lưu" : "Chưa đo", true)
            : dailyRowFromRecord(d, recOf.get(d.id), true)
        )
        .filter((r): r is DailyRow => !!r);
      if (rows.length) out.push({ area: a, labels: DAILY_LABELS, extras: [], rows });
    }
    if (!out.length) throw new Error("Chưa có thiết bị nào được nhập thông số hoặc có nhận xét trong ngày / kỳ đo đã chọn.");
    return out;
  }
  const fileArea = scope === "all" ? "Tất cả cương vị" : area;

  return {
    caption: (
      <EntryCaption
        className="weekly-caption"
        messageId="dailyExportMessage"
        title={api.summary}
        hint={api.hint}
        scopes={[{ value: "current", label: "Cương vị đang chọn" }, { value: "all", label: "Tất cả cương vị" }]}
        scope={scope}
        onScope={onScope}
        actions={[
          {
            key: "excel",
            label: "Excel",
            run: () => {
              const s = sheets();
              downloadBlob(dailyWorkbook(s, date), dailyFilename(fileArea, date));
              return `Đã xuất Excel: ${s.length} cương vị, ${s.reduce((n, x) => n + x.rows.length, 0)} thiết bị.`;
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
