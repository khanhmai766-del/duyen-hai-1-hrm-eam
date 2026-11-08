"use client";
import { useSavePpaDay } from "@/hooks/useKtktPpa";
import { useInvalidateKtkt } from "@/hooks/useKtktDailyInputs";

import { useRef, useState } from "react";
import { calculatePpaHeatRate, mergeMeterReadings, parseMeterCsv, selectPpaSource } from "@/modules/ctktkt/lib/ppa-heat-rate";
import { loadSheetJs } from "@/modules/ctktkt/lib/sheetjs-loader";
import { useSessionUser } from "@/modules/ctktkt/components/session-context";
import { hasPermission } from "@/modules/ctktkt/lib/auth/session";

type RowResult = { sheet: string; status: "saved" | "skipped" | "error"; detail: string; operatingDate?: string };

export function PpaHeatRateBulkImport() {
  // Lưu từng sheet (ngày) một; làm mới dữ liệu KTKT một lần sau khi xong cả file.
  const savePpaDay = useSavePpaDay({ invalidate: false });
  const invalidateKtkt = useInvalidateKtkt();

  const isViewer = !hasPermission(useSessionUser(), "edit_ppa");
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function importFile(file: File) {
    setImporting(true); setError(""); setResults([]);
    const collected: RowResult[] = [];
    try {
      const XLSX = await loadSheetJs();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      if (!workbook.SheetNames.length) throw new Error("File không có sheet nào để đọc.");

      for (const sheetName of workbook.SheetNames) {
        try {
          const csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
          const readings = parseMeterCsv(csvText, sheetName);
          const dates = [...new Set(readings.map(item => item.operatingDate).filter(Boolean))];
          if (dates.length !== 1) {
            collected.push({ sheet: sheetName, status: "skipped", detail: dates.length === 0 ? "Không xác định được ngày." : "Sheet chứa nhiều ngày khác nhau, bỏ qua." });
            continue;
          }
          const operatingDate = dates[0];
          const merged = mergeMeterReadings([readings]);
          const selected = selectPpaSource(merged);
          if (!selected.source) {
            const missing = selected.found.filter(item => !item.found).map(item => item.label).join(", ");
            collected.push({ sheet: sheetName, status: "skipped", operatingDate, detail: `Thiếu điểm đo: ${missing}.` });
            continue;
          }
          const calculation = calculatePpaHeatRate(selected.source, Number(operatingDate.slice(0, 4)));
          await savePpaDay.mutateAsync({ operatingDate, source: selected.source, sourceFiles: [`Excel · ${sheetName}`] });
          collected.push({ sheet: sheetName, status: "saved", operatingDate, detail: calculation.netS1Kwh + calculation.netS2Kwh === 0 ? "Đã lưu — cả hai tổ ngừng, không đánh giá SHN." : `Đã lưu — SHN PPA chung ${calculation.ppaPlant.toFixed(2)} kJ/kWh.` });
        } catch (caught) {
          collected.push({ sheet: sheetName, status: caught instanceof Error && /không phải|chưa đủ|dòng KwhGiao|cấu trúc CSV|CSV rút gọn/.test(caught.message) ? "skipped" : "error", detail: caught instanceof Error ? caught.message : "Không đọc được sheet này." });
        }
      }
      setResults(collected);
      if (collected.some(item => item.status === "saved")) void invalidateKtkt();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không đọc được file Excel.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const saved = results.filter(item => item.status === "saved");
  const skipped = results.filter(item => item.status === "skipped");
  const failed = results.filter(item => item.status === "error");

  return <section className="space-y-4">
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#557187]">Nạp dữ liệu hàng loạt</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#18233d]">Nhập nhiều ngày từ file Excel</h1>
      <p className="mt-1 text-sm text-slate-500">Dùng cho file Excel theo dõi PPA có nhiều sheet, mỗi sheet là số liệu đo đếm công tơ một ngày (như file đầu tháng vẫn dùng). Mỗi sheet có đúng 4 điểm đo bắt buộc (đầu cực S1/S2 và điểm bán S1/S2) sẽ được tính SHN PPA và lưu tự động theo ngày ghi trong sheet đó. Các sheet khác (bảng tổng hợp, S1, S2…) sẽ tự động được bỏ qua.</p>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label title={isViewer ? "Tài khoản Chỉ xem không có quyền lưu dữ liệu." : undefined} className={`rounded-xl bg-gradient-to-r from-[#4057b5] to-[#438ec1] px-4 py-2.5 text-sm font-bold text-white shadow-sm ${isViewer ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
          {importing ? "Đang nhập…" : "Chọn file Excel (.xlsx/.xlsm)"}
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" disabled={importing || isViewer} className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); }}/>
        </label>
        <p className="text-xs text-slate-500">Có thể chọn lại nhiều lần; các ngày đã lưu trước đó sẽ được ghi đè bằng số liệu mới nhất trong file.</p>
      </div>
    </div>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800">{error}</p>}

    {results.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-[#f8fafc] px-4 py-3">
        <h2 className="font-extrabold text-[#20345f]">Kết quả nhập</h2>
        <p className="text-xs font-semibold text-slate-500">Đã lưu {saved.length} ngày · Bỏ qua {skipped.length} sheet · Lỗi {failed.length}</p>
      </div>
      <div className="max-h-[420px] overflow-y-auto divide-y">
        {results.map((item, index) => <div key={`${item.sheet}-${index}`} className="flex items-start gap-3 px-4 py-2.5 text-xs">
          <span className={`mt-0.5 rounded-full px-2 py-0.5 font-extrabold ${item.status === "saved" ? "bg-emerald-100 text-emerald-800" : item.status === "skipped" ? "bg-slate-100 text-slate-500" : "bg-red-100 text-red-800"}`}>{item.status === "saved" ? "Đã lưu" : item.status === "skipped" ? "Bỏ qua" : "Lỗi"}</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-800">{item.sheet}{item.operatingDate ? ` · ${item.operatingDate.split("-").reverse().join("/")}` : ""}</p>
            <p className="mt-0.5 text-slate-500">{item.detail}</p>
          </div>
        </div>)}
      </div>
      {saved.length > 0 && <p className="border-t px-4 py-2.5 text-xs font-semibold text-emerald-700">Xong. Mở tab &quot;So sánh trực quan&quot; để xem kết quả các ngày vừa nạp.</p>}
    </div>}
  </section>;
}
