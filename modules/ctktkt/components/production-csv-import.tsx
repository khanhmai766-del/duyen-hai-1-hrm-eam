"use client";

import { useState } from "react";
import { usePreviewProductionCsv, useSaveCtktktReport } from "@/hooks/useKtktReport";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import type { ProductionCsvPreview } from "../lib/production-csv";

const manualIndicators = [
  { cell: "S181", label: "Hệ số đáp ứng", inputMode: "decimal" },
  { cell: "T181", label: "Độ phát thải", inputMode: "text" },
] as const;
type ManualIndicatorCell = typeof manualIndicators[number]["cell"];

type Props = {
  date: string;
  current: Record<string, string | undefined>;
  editableIndicators: readonly ManualIndicatorCell[];
  canSaveGridReceived: boolean;
  disabled: boolean;
  onSaved: () => void;
};
const number = (value: string | number | undefined) => value === undefined || value === "" ? "—" : Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 8 });

export function ProductionCsvImport({ date, current, editableIndicators, canSaveGridReceived, disabled, onSaved }: Props) {
  const { mutateAsync: previewCsv } = usePreviewProductionCsv();
  const { mutateAsync: saveReport } = useSaveCtktktReport();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ProductionCsvPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [indicatorValues, setIndicatorValues] = useState<Partial<Record<ManualIndicatorCell, string>>>({});
  const allowedIndicators = manualIndicators.filter(({ cell }) => editableIndicators.includes(cell));

  async function read(files: FileList | null) {
    setPreview(null); setError(""); setMessage("");
    if (!files?.length) return;
    setBusy(true);
    try {
      if (files.length > 16 || [...files].reduce((sum, f) => sum + f.size, 0) > 5 * 1024 * 1024) throw new Error("Chọn tối đa 16 tệp, tổng dung lượng 5 MB.");
      const body = new FormData();
      for (const file of files) body.append("files", file);
      const result = await previewCsv(body);
      if (result.operatingDate !== date) throw new Error(`CSV là ngày ${result.operatingDate.split("-").reverse().join("/")}. Hãy chọn đúng ngày trên báo cáo rồi nhập lại.`);
      setPreview(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không đọc được CSV."); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!preview || disabled || preview.operatingDate !== date) return;
    setBusy(true); setError("");
    try {
      const entries = preview.entries.map(({ cell, value }) => ({ cell, value }));
      if (canSaveGridReceived) {
        entries.push(...preview.gridReceived.map(({ cell, value }) => ({ cell, value })));
      }
      for (const { cell } of allowedIndicators) {
        const value = indicatorValues[cell]?.trim();
        if (value) entries.push({ cell, value });
      }
      await saveReport({ operatingDate: date, entries });
      setPreview(null); onSaved();
      setMessage("Đã lưu sản lượng từ CSV. Các bảng chỉ tiêu và BCSX sẽ lấy dữ liệu từ nguồn sản lượng này.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa lưu được sản lượng."); }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" disabled={disabled} onClick={() => { setOpen(true); setPreview(null); setIndicatorValues({}); setError(""); setMessage(""); }} className="min-h-10 rounded-xl border border-[#4057b5] bg-white px-3.5 py-2 text-xs font-bold text-[#4057b5] disabled:opacity-50">Nhập sản lượng từ CSV / ZIP / RAR</button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto bg-white font-sans text-slate-900">
        <DialogHeader><DialogTitle>Nhập sản lượng từ CSV</DialogTitle><DialogDescription>Ngày {date.split("-").reverse().join("/")}. Dùng khi không lấy được sản lượng từ QLKT.</DialogDescription></DialogHeader>
        <p className="text-sm text-slate-600">Chọn các CSV công tơ đang có hoặc tệp ZIP, RAR chứa chúng. Công tơ 6001 (đầu cực S1), 6303 (điểm bán S1), 6002 (đầu cực S2), 6301 (điểm bán S2) thiếu CSV sẽ được điền 0 MWh. Tối đa 5 MB.</p>
        <p className="text-xs text-slate-600">Sản lượng ngày = tổng 48 chu kỳ kWh. Chia 1.000 để ghi MWh vào J157, K157, J158, K158. Không dùng hệ số nhân bổ sung.</p>
        <input aria-label="Chọn CSV, ZIP hoặc RAR công tơ" type="file" accept=".csv,.zip,.rar" multiple disabled={busy || disabled} className="w-full min-w-0 text-sm file:mr-2 file:min-h-10 file:rounded-lg file:border file:border-slate-300 file:bg-slate-50 file:px-3" onChange={event => { void read(event.target.files); event.target.value = ""; }} />
        {busy && <p role="status" className="text-sm">Đang xử lý…</p>}
        {error && <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {preview && <>
          <div className="space-y-2">{preview.entries.map(entry => <div key={entry.cell} className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-semibold">{entry.label} · {entry.meter}</p>
            <div className="mt-1 flex flex-wrap justify-between gap-2 text-slate-600">
              <span>Đang có: {number(current[entry.cell])} MWh</span>
              {entry.defaulted
                ? <span className="font-semibold text-amber-800">Thiếu CSV · mặc định 0 MWh</span>
                : <span className="font-bold text-[#173b64]">CSV: {number(entry.value)} MWh</span>}
            </div>
          </div>)}</div>
          {preview.gridReceived.length > 0 && <div className="space-y-1 rounded-lg border border-slate-200 p-3 text-sm">
            {preview.gridReceived.map(({ cell, label, value }) => <p key={cell} className="flex flex-wrap justify-between gap-2">
              <span>{label}</span><strong>{number(value)} MWh</strong>
            </p>)}
            <p className="text-xs text-slate-600">Điện nhận lưới được theo dõi riêng. Tỷ lệ điện tự dùng tính trên sản lượng phát.</p>
            {!canSaveGridReceived && <p className="text-xs text-amber-800">Tài khoản chỉ có quyền xem điện nhận lưới trong lần nhập này.</p>}
          </div>}
          <p className="break-words text-xs text-slate-500">Nguồn: {preview.sourceFiles.join(", ")}</p>
          {allowedIndicators.length > 0 && <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2" disabled={busy || disabled}>
            <legend className="px-1 text-sm font-semibold text-[#173b64]">Nhập tay cho báo cáo 02-PĐ</legend>
            {allowedIndicators.map(({ cell, label, inputMode }) => <label key={cell} className="grid gap-1 text-sm">
              {label}
              <input
                type="text"
                inputMode={inputMode}
                maxLength={80}
                className="min-h-10 w-full rounded-lg border border-slate-300 px-3"
                value={indicatorValues[cell] ?? ""}
                placeholder={current[cell] || undefined}
                onChange={event => setIndicatorValues(values => ({ ...values, [cell]: event.target.value }))}
              />
            </label>)}
            <p className="text-xs text-slate-600 sm:col-span-2">Có thể để trống để giữ giá trị đang có.</p>
          </fieldset>}
          <p className="text-xs text-amber-800">Lưu sẽ thay thế 4 ô sản lượng đang có. CSV công tơ không đủ để tính toàn bộ báo cáo 02-PD hoặc các chỉ tiêu nhiên liệu, thời gian vận hành.</p>
          <button type="button" disabled={busy || disabled} onClick={() => void save()} className="min-h-10 rounded-lg bg-[#4057b5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Xác nhận lưu sản lượng</button>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
