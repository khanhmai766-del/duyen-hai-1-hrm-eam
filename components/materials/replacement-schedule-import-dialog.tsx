"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Stepper, { Step } from "@/components/react-bits/Stepper";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addMonths, replacementDueStatus, REPL_DUE } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { cn, formatDate } from "@/lib/utils";

type ImportParsedRow = {
  rowNumber: number;
  materialName?: string;
  erpCode?: string;
  machine?: string;
  system?: string;
  deviceSeq?: string;
  deviceName?: string;
  managingPosition?: string;
  deviceCount?: number;
  quantity?: number;
  intervalNote?: string;
  intervalMonths?: number;
  lastReplacedAt?: string;
};

type ImportResult = {
  validCount: number;
  willSchedule: number;
  errors: Array<{ rowNumber: number; message: string }>;
  preview: Array<{
    rowNumber: number;
    materialName: string;
    deviceLabel: string;
    system: string | null;
    deviceCount: number;
    quantity: number;
    unit: string;
    intervalMonths: number;
    lastReplacedAt: string | null;
  }>;
  created: number;
  updated: number;
  scheduled: number;
};

type ReplacementScheduleImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMachine?: string;
};

function detectImportColumn(header: unknown): keyof ImportParsedRow | null {
  const value = normalizeText(String(header ?? "")).replace(/\s+/g, " ");
  if (!value || value.includes("tham chieu")) return null;
  if (value.includes("erp")) return "erpCode";
  if (value.includes("ten vat tu") || value === "vat tu") return "materialName";
  if (value.includes("to may")) return "machine";
  if (value.includes("cay thu muc") || value.includes("he thong")) return "system";
  if (value.includes("seq") || value.includes("ma thiet bi")) return "deviceSeq";
  if (value.includes("ten thiet bi")) return "deviceName";
  if (value.includes("cuong vi")) return "managingPosition";
  if (value.includes("so luong thiet bi")) return "deviceCount";
  if (value.includes("lan thay") || value.includes("gan nhat") || value.includes("ngay thay")) {
    return "lastReplacedAt";
  }
  if (value.includes("can thay")) return "quantity";
  if (value.includes("chu ky thay the")) return "intervalMonths";
  if (value.includes("chu ky")) return "intervalNote";
  return null;
}

function dateToIso(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function strictDateToIso(year: number, month: number, day: number, original: string): string {
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return original;
  }
  return dateToIso(date);
}

function parseDateCell(value: unknown): string {
  if (value instanceof Date) return dateToIso(value);
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return dateToIso(new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000));
  }

  const text = String(value ?? "").trim();
  if (!text) return "";

  const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    return strictDateToIso(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]), text);
  }

  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    return strictDateToIso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]), text);
  }

  return text;
}

function parseMonths(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : undefined;
  const text = normalizeText(String(value ?? ""));
  if (!text) return undefined;
  if (text.includes("khong theo doi") || text === "0") return 0;
  const digits = text.match(/-?\d+/);
  return digits ? Number.parseInt(digits[0], 10) : undefined;
}

function parseIntegerCell(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : undefined;
  const text = String(value ?? "").replace(/[^\d.-]/g, "").trim();
  if (!text) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? Math.round(number) : undefined;
}

function statusTone(status: ReturnType<typeof replacementDueStatus>) {
  if (status === "OVERDUE") return "border-red-200 bg-red-50 text-red-700";
  if (status === "DUE_SOON") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function ReplacementScheduleImportDialog({
  open,
  onOpenChange,
  defaultMachine = "S1",
}: ReplacementScheduleImportDialogProps) {
  const queryClient = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState("");
  const [rows, setRows] = React.useState<ImportParsedRow[]>([]);
  const [sourceRowCount, setSourceRowCount] = React.useState(0);
  const [skippedWithoutDate, setSkippedWithoutDate] = React.useState(0);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [completedResult, setCompletedResult] = React.useState<ImportResult | null>(null);

  function reset() {
    setFileName("");
    setRows([]);
    setSourceRowCount(0);
    setSkippedWithoutDate(0);
    setResult(null);
    setBusy(false);
    setCompletedResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function runImport(parsedRows: ImportParsedRow[], dryRun: boolean): Promise<ImportResult> {
    const response = await fetch("/api/materials/import-replacements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: parsedRows, dryRun }),
    });
    const json = await response.json();
    if (!response.ok || json.error) {
      throw new Error(json.error || "Nhập lịch theo dõi thất bại");
    }
    return json.data as ImportResult;
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setCompletedResult(null);
    setBusy(true);
    setResult(null);
    setRows([]);
    setSourceRowCount(0);
    setSkippedWithoutDate(0);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName =
        workbook.SheetNames.find((name) => normalizeText(name).includes("nhap diem")) ??
        workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const cells = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: false,
        defval: "",
      });

      if (cells.length < 2) {
        throw new Error("File chưa có dữ liệu ở sheet “Nhập điểm thay thế”");
      }

      const columnMap: Partial<Record<keyof ImportParsedRow, number>> = {};
      (cells[0] as unknown[]).forEach((header, index) => {
        const key = detectImportColumn(header);
        if (key && columnMap[key] === undefined) columnMap[key] = index;
      });

      if (columnMap.materialName === undefined && columnMap.erpCode === undefined) {
        throw new Error("Không tìm thấy cột “Tên vật tư” hoặc “Mã ERP”");
      }
      if (columnMap.lastReplacedAt === undefined) {
        throw new Error("Không tìm thấy cột “Lần thay gần nhất (dd/mm/yyyy)”");
      }

      const stringCell = (row: unknown[], key: keyof ImportParsedRow) =>
        columnMap[key] === undefined ? "" : String(row[columnMap[key]!] ?? "").trim();
      const rawCell = (row: unknown[], key: keyof ImportParsedRow) =>
        columnMap[key] === undefined ? undefined : row[columnMap[key]!];

      const parsedRows: ImportParsedRow[] = [];
      let nonEmptyRows = 0;
      let noDateRows = 0;

      for (let index = 1; index < cells.length; index += 1) {
        const row = cells[index] as unknown[];
        const materialName = stringCell(row, "materialName");
        const erpCode = stringCell(row, "erpCode");
        const system = stringCell(row, "system");
        const deviceSeq = stringCell(row, "deviceSeq");
        const deviceName = stringCell(row, "deviceName");

        if (!materialName && !erpCode && !system && !deviceSeq && !deviceName) continue;
        nonEmptyRows += 1;

        const lastReplacedAt = parseDateCell(rawCell(row, "lastReplacedAt"));
        if (!lastReplacedAt) {
          noDateRows += 1;
          continue;
        }

        parsedRows.push({
          rowNumber: index + 1,
          materialName,
          erpCode,
          machine:
            stringCell(row, "machine") ||
            (defaultMachine !== "ALL" ? defaultMachine : ""),
          system,
          deviceSeq,
          deviceName,
          managingPosition: stringCell(row, "managingPosition"),
          deviceCount: parseIntegerCell(rawCell(row, "deviceCount")),
          quantity: parseIntegerCell(rawCell(row, "quantity")),
          intervalNote: stringCell(row, "intervalNote"),
          intervalMonths: parseMonths(rawCell(row, "intervalMonths")),
          lastReplacedAt,
        });
      }

      setSourceRowCount(nonEmptyRows);
      setSkippedWithoutDate(noDateRows);

      if (!parsedRows.length) {
        throw new Error(
          "Chưa có dòng nào điền “Lần thay gần nhất”. Các dòng để trống ngày sẽ không được nhập."
        );
      }

      setRows(parsedRows);
      setResult(await runImport(parsedRows, true));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không đọc được file Excel");
      setFileName("");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (busy || completedResult || !rows.length || !result || result.errors.length > 0 || result.willSchedule === 0) return;
    setBusy(true);
    try {
      const imported = await runImport(rows, false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["replacements"] }),
        queryClient.invalidateQueries({ queryKey: ["replacement-history"] }),
        queryClient.invalidateQueries({ queryKey: ["materials"] }),
      ]);
      toast.success(
        `Đã tạo/cập nhật lịch theo dõi cho ${imported.scheduled} điểm thay thế`
      );
      setCompletedResult(imported);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nhập lịch theo dõi thất bại");
    } finally {
      setBusy(false);
    }
  }

  const hasErrors = Boolean(result?.errors.length);
  const canConfirm =
    Boolean(result) &&
    !hasErrors &&
    (result?.willSchedule ?? 0) > 0 &&
    !completedResult &&
    !busy;
  const importStep = completedResult ? 4 : result ? (hasErrors ? 2 : 3) : busy ? 2 : 1;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-slate-50/80 px-4 py-4 pr-10 sm:px-6 sm:py-5">
          <DialogTitle className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy text-white shadow-sm">
              <CalendarClock className="h-5 w-5" />
            </span>
            Nhập lịch theo dõi từ Excel
          </DialogTitle>
          <DialogDescription className="pl-[46px]">
            Hệ thống kiểm tra dữ liệu trước khi tạo hoặc cập nhật các điểm theo dõi.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 max-h-[72vh] space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <Stepper step={importStep} showFooter={false} disableStepIndicators theme="light" accentColor="#0c4a6e" frame={false} width="100%" radius={12} transition="fade">
            <Step title="Chọn tệp">
              <p className="text-sm text-muted-foreground">Chọn tệp Excel và điền ngày thay gần nhất theo định dạng dd/mm/yyyy.</p>
            </Step>
            <Step title="Kiểm tra">
              <p role="status" className="text-sm text-muted-foreground">{busy ? "Đang kiểm tra thiết bị, vật tư và tổ máy…" : "Sửa các dòng lỗi trong tệp rồi chọn lại để kiểm tra."}</p>
            </Step>
            <Step title="Xác nhận">
              <p className="text-sm text-muted-foreground">{busy ? "Đang nhập lịch theo dõi…" : "Kiểm tra hạn kế tiếp trong bảng bên dưới rồi xác nhận nhập."}</p>
            </Step>
            <Step title="Kết quả">
              <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Đã nhập lịch theo dõi</p>
                  <p className="mt-1 text-sm">{completedResult?.scheduled ?? 0} điểm đã lên lịch · {completedResult?.created ?? 0} điểm mới · {completedResult?.updated ?? 0} điểm cập nhật.</p>
                </div>
              </div>
            </Step>
          </Stepper>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />

          {!completedResult && <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className={cn(
              "group flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed px-5 py-7 text-left transition-colors",
              busy
                ? "cursor-wait border-border bg-muted/40"
                : "border-sky-200 bg-white hover:border-accent hover:bg-sky-50/40"
            )}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-accent transition-transform group-hover:-translate-y-0.5">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            </span>
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">
              <span className="block font-semibold text-ink">
                {fileName || "Chọn file Excel để kiểm tra"}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Chỉ các dòng có “Lần thay gần nhất” mới được xử lý
              </span>
            </span>
          </button>}

          {result && !completedResult && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <SummaryCard label="Dòng dữ liệu" value={sourceRowCount} />
                <SummaryCard label="Có ngày thay" value={rows.length} tone="blue" />
                <SummaryCard
                  label="Sẽ lên lịch"
                  value={result.willSchedule}
                  tone={hasErrors ? "neutral" : "green"}
                />
                <SummaryCard
                  label="Lỗi cần sửa"
                  value={result.errors.length}
                  tone={hasErrors ? "red" : "green"}
                />
              </div>

              {skippedWithoutDate > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Đã bỏ qua <span className="font-semibold text-ink">{skippedWithoutDate}</span> dòng
                  không có “Lần thay gần nhất”; các dòng này không bị thay đổi dữ liệu.
                </div>
              )}

              {hasErrors ? (
                <div className="overflow-hidden rounded-xl border border-red-200">
                  <div className="flex items-center gap-2 bg-red-50 px-4 py-3 font-semibold text-red-800">
                    <AlertTriangle className="h-4 w-4" />
                    Cần sửa file trước khi nhập
                  </div>
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white text-muted-foreground">
                        <tr>
                          <th className="w-20 px-4 py-2 text-left font-medium">Dòng</th>
                          <th className="px-4 py-2 text-left font-medium">Nội dung lỗi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((error, index) => (
                          <tr key={`${error.rowNumber}-${index}`} className="border-t border-red-100">
                            <td className="px-4 py-2 font-semibold text-red-700">{error.rowNumber}</td>
                            <td className="px-4 py-2 text-ink">{error.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="flex items-center gap-2 border-b border-border bg-emerald-50/60 px-4 py-3 text-sm font-semibold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Dữ liệu hợp lệ — kiểm tra hạn kế tiếp trước khi xác nhận
                  </div>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full min-w-[800px] text-sm">
                      <thead className="sticky top-0 bg-white text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Vật tư</th>
                          <th className="px-4 py-2 text-left font-medium">Thiết bị / hệ thống</th>
                          <th className="px-4 py-2 text-center font-medium">Lần thay gần nhất</th>
                          <th className="px-4 py-2 text-center font-medium">Chu kỳ</th>
                          <th className="px-4 py-2 text-center font-medium">Hạn kế tiếp</th>
                          <th className="px-4 py-2 text-center font-medium">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.preview.map((point) => {
                          const nextDueAt = point.lastReplacedAt
                            ? addMonths(new Date(point.lastReplacedAt), point.intervalMonths)
                            : null;
                          const status = nextDueAt ? replacementDueStatus(nextDueAt) : null;
                          return (
                            <tr key={point.rowNumber} className="border-t border-border">
                              <td className="max-w-[220px] px-4 py-2">
                                <p className="truncate font-medium text-ink">{point.materialName}</p>
                                <p className="text-xs text-muted-foreground">Dòng {point.rowNumber}</p>
                              </td>
                              <td className="max-w-[250px] px-4 py-2 text-ink">
                                <p className="truncate">{point.deviceLabel || point.system || "—"}</p>
                              </td>
                              <td className="px-4 py-2 text-center tabular-nums text-ink">
                                {point.lastReplacedAt ? formatDate(point.lastReplacedAt) : "—"}
                              </td>
                              <td className="px-4 py-2 text-center tabular-nums text-ink">
                                {point.intervalMonths} tháng
                              </td>
                              <td className="px-4 py-2 text-center font-semibold tabular-nums text-ink">
                                {nextDueAt ? formatDate(nextDueAt) : "—"}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {status && (
                                  <span
                                    className={cn(
                                      "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
                                      statusTone(status)
                                    )}
                                  >
                                    {REPL_DUE[status].label}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {result.validCount > result.preview.length && (
                    <div className="border-t border-border bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
                      Đang hiển thị {result.preview.length}/{result.validCount} dòng hợp lệ
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border bg-slate-50/70 px-4 py-4 sm:gap-0 sm:px-6">
          <Button type="button" className="h-10" variant="outline" onClick={close} disabled={busy}>
            Đóng
          </Button>
          {!completedResult && <Button type="button" className="h-10" onClick={confirmImport} disabled={!canConfirm}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Xác nhận nhập {result?.willSchedule ? `${result.willSchedule} điểm` : ""}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "blue" | "green" | "red";
}) {
  const tones = {
    neutral: "border-border bg-white text-ink",
    blue: "border-sky-200 bg-sky-50 text-sky-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <div className={cn("rounded-xl border px-4 py-3", tones[tone])}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
