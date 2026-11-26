import type { VibrationDeviceDto, VibrationRecordDto } from "@/lib/vibration/types";
import { parseRow, rowFromRecord, type RowDraft } from "./entry-grid-model";
import { makeDailyRow, type DailyRow } from "./export-daily";

/** Dòng xuất của một thiết bị từ dòng nhập (kể cả nháp). null = chưa có số/nhận xét. Ném lỗi tiếng Việt khi ô sai. */
export function dailyRowOf(d: VibrationDeviceDto, row: RowDraft, person: string, origin: string, withPower: boolean): DailyRow | null {
  const p = parseRow(d, row, withPower);
  if (p.error) throw new Error(`${d.name}: ${p.error}`);
  if (p.empty || !p.item) return null;
  const values = (p.item.values ?? []).map((v) => (typeof v === "number" ? v : null));
  return makeDailyRow(d, { power: p.item.power ?? "", time: p.item.measureTime ?? "", note: p.item.note ?? "", values, person, origin });
}

/** Dòng xuất từ bản ghi đã lưu (thiết bị không nằm trong bảng đang mở). */
export function dailyRowFromRecord(d: VibrationDeviceDto, rec: VibrationRecordDto | undefined, withPower: boolean): DailyRow | null {
  return rec ? dailyRowOf(d, rowFromRecord(rec), rec.person, "Đã lưu", withPower) : null;
}
