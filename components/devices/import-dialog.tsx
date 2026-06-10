"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Loader2, Upload, FileSpreadsheet, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useImportDevices } from "@/hooks/useDevices";
import { normalizeText } from "@/lib/nav";

type Row = { code: string; name?: string; system?: string };

// Khớp cột không phân biệt hoa/thường & dấu: code / name / system.
function pickColumns(raw: Record<string, unknown>[]): Row[] {
  if (!raw.length) return [];
  const keys = Object.keys(raw[0]);
  const find = (cands: string[]) =>
    keys.find((k) => cands.includes(normalizeText(k)));
  const codeKey = find(["ma", "ma thiet bi", "code", "device code"]);
  const nameKey = find(["ten", "ten thiet bi", "name", "device name"]);
  const sysKey = find(["he thong", "system", "loai", "loai thiet bi"]);
  if (!codeKey) return [];
  return raw
    .map((r) => ({
      code: String(r[codeKey] ?? "").trim(),
      name: nameKey ? String(r[nameKey] ?? "").trim() : "",
      system: sysKey ? String(r[sysKey] ?? "").trim() : "",
    }))
    .filter((r) => r.code);
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const importDevices = useImportDevices();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [fileName, setFileName] = React.useState("");

  React.useEffect(() => {
    if (!open) { setRows([]); setFileName(""); }
  }, [open]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const parsed = pickColumns(raw);
      if (!parsed.length) {
        toast.error("Không tìm thấy cột 'Mã thiết bị'. Cần các cột: Mã, Tên, Hệ thống.");
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    } catch (err) {
      toast.error("Không đọc được file: " + (err as Error).message);
    }
  }

  async function submit() {
    if (!rows.length) return;
    try {
      const res = await importDevices.mutateAsync(rows);
      toast.success(`Đã nhập: ${res.created} tạo mới · ${res.updated} cập nhật`);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([["Mã thiết bị", "Tên thiết bị", "Hệ thống"], ["ESP-S1-001", "Bộ lọc bụi tĩnh điện S1", "ESP"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Thiết bị");
    XLSX.writeFile(wb, "mau-nhap-thiet-bi.xlsx");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-accent" /> Nhập thiết bị từ CSV/Excel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            File cần có cột <b>Mã thiết bị</b>, <b>Tên thiết bị</b>, <b>Hệ thống</b>. Khớp theo Mã: đã có thì cập nhật, chưa có thì tạo mới.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Chọn file (.csv/.xlsx)
            </Button>
            <Button type="button" variant="ghost" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> Tải file mẫu
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFile} />
          </div>

          {fileName && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="font-medium text-ink">{fileName}</div>
              <div className="text-muted-foreground">{rows.length} dòng hợp lệ (có Mã thiết bị)</div>
              {rows.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr><th className="px-2 py-1 text-left">Mã</th><th className="px-2 py-1 text-left">Tên</th><th className="px-2 py-1 text-left">Hệ thống</th></tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 50).map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-1 font-mono">{r.code}</td>
                          <td className="px-2 py-1">{r.name || "—"}</td>
                          <td className="px-2 py-1">{r.system || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={submit} disabled={!rows.length || importDevices.isPending}>
            {importDevices.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Nhập {rows.length || ""} dòng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
