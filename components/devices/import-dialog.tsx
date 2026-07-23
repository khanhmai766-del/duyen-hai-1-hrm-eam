"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Loader2, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useImportEquipmentTree, type ImportResult } from "@/hooks/useEquipment";
import { parseDanhmucRows, filterCanonicalDept, filterSystem, S1_PREFIX, type RawImportRow, type ImportMode, type ImportPreview } from "@/lib/equipment-import";

const MODES: { value: ImportMode; label: string; desc: string }[] = [
  { value: "SYNC", label: "Đồng bộ (khuyến nghị)", desc: "Thêm thiết bị mới + cập nhật tên/mã/KKS thiết bị đã có. KHÔNG tự xóa." },
  { value: "ADD", label: "Thêm mới", desc: "Chỉ thêm thiết bị chưa tồn tại (theo Assetid); bỏ qua cái đã có." },
  { value: "REPLACE", label: "Thay thế hệ thống", desc: "Xóa toàn bộ nhánh rồi nhập lại. Chỉ khi nhánh CHƯA có dữ liệu nghiệp vụ." },
];

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const importer = useImportEquipmentTree();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState("");
  const [allRows, setAllRows] = React.useState<RawImportRow[]>([]);
  const [system, setSystem] = React.useState<string>("ALL");
  const [mode, setMode] = React.useState<ImportMode>("SYNC");
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);

  React.useEffect(() => {
    if (!open) { setFileName(""); setAllRows([]); setSystem("ALL"); setMode("SYNC"); setPreview(null); }
  }, [open]);

  const systems = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      const m = r.fullCode.match(/^DH1\.S1\.(\d+)/);
      if (m) set.add(m[1]);
    }
    return [...set].sort((a, b) => Number(a) - Number(b));
  }, [allRows]);

  const scoped = React.useMemo(() => (system === "ALL" ? allRows : filterSystem(allRows, system)), [allRows, system]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const parsed = parseDanhmucRows(raw);
      if (!parsed.length) {
        toast.error("Không nhận diện được cột. Cần: Assetid, AssetidParent, Mã thiết bị, Tên thiết bị, Mã KKS.");
        return;
      }
      // Bộ lọc chuẩn đã chốt: chỉ giữ bộ phận VH + VH3 + ô trống.
      const canonical = filterCanonicalDept(parsed);
      if (canonical.length < parsed.length) {
        toast.info(`Đã loại ${(parsed.length - canonical.length).toLocaleString("vi-VN")} dòng ngoài bộ phận vận hành (NL/PXH/…)`);
      }
      setAllRows(canonical);
      setFileName(file.name);
      setPreview(null);
    } catch (err) {
      toast.error("Không đọc được file: " + (err as Error).message);
    }
  }

  async function runPreview() {
    if (!scoped.length) return toast.error("Không có dòng nào cho hệ thống đã chọn");
    try {
      const res = (await importer.mutateAsync({ rows: scoped, system: system === "ALL" ? "" : system, mode, dryRun: true })) as ImportResult;
      setPreview(res.preview ?? null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function runCommit() {
    if (!preview || preview.errors.length) return;
    try {
      const res = (await importer.mutateAsync({ rows: scoped, system: system === "ALL" ? "" : system, mode, dryRun: false })) as ImportResult;
      const r = res.result;
      toast.success(`Đã nhập: ${r?.created ?? 0} tạo · ${r?.updated ?? 0} cập nhật · ${r?.skipped ?? 0} bỏ qua${r?.deleted ? ` · ${r.deleted} xóa` : ""}`);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const busy = importer.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-accent" /> Nhập cây thiết bị từ Excel danh mục
          </DialogTitle>
        </DialogHeader>

        {!preview ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              File cần cột <b>Assetid</b>, <b>AssetidParent</b>, <b>Mã thiết bị</b>, <b>Tên thiết bị</b>, <b>Mã KKS</b>. Chọn hệ thống để nhập từng nhánh, hoặc nhập cả file.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> Chọn file (.xlsx)
              </Button>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFile} />
              {fileName && <span className="text-sm text-ink">{fileName} · <b>{allRows.length.toLocaleString("vi-VN")}</b> dòng</span>}
            </div>

            {allRows.length > 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Hệ thống</label>
                    <Select value={system} onValueChange={setSystem}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Tất cả ({allRows.length.toLocaleString("vi-VN")} dòng)</SelectItem>
                        {systems.map((s) => (
                          <SelectItem key={s} value={s}>Hệ thống {s} ({S1_PREFIX}.{s})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="mt-1 text-xs text-muted-foreground">{scoped.length.toLocaleString("vi-VN")} dòng sẽ xử lý</div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Chế độ nhập</label>
                    <Select value={mode} onValueChange={(v) => setMode(v as ImportMode)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="mt-1 text-xs text-muted-foreground">{MODES.find((m) => m.value === mode)?.desc}</div>
                  </div>
                </div>
                {mode === "REPLACE" && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Thay thế sẽ XÓA toàn bộ nhánh rồi nhập lại. Chỉ chạy được nếu nhánh chưa phát sinh sửa chữa/khiếm khuyết/vật tư/QR.
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              <Stat label="Hợp lệ" value={preview.valid} />
              <Stat label="Nút cha" value={preview.parents} />
              <Stat label="Nút lá" value={preview.leaves} />
              <Stat label="Thêm mới" value={preview.toCreate} tone="emerald" />
              <Stat label="Cập nhật" value={preview.toUpdate} tone="blue" />
              <Stat label="Không đổi" value={preview.unchanged} />
              <Stat label="Cảnh báo" value={preview.warnings.length} tone={preview.warnings.length ? "amber" : undefined} />
              <Stat label="Lỗi" value={preview.errors.length} tone={preview.errors.length ? "red" : "emerald"} />
            </div>

            {preview.errors.length > 0 ? (
              <IssueList title={`${preview.errors.length} lỗi chặn — sửa file rồi thử lại`} issues={preview.errors} tone="red" />
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4" /> Không có lỗi quan hệ cây — sẵn sàng nhập ({MODES.find((m) => m.value === mode)?.label}).
              </div>
            )}
            {preview.warnings.length > 0 && <IssueList title={`${preview.warnings.length} cảnh báo`} issues={preview.warnings} tone="amber" />}
          </div>
        )}

        <DialogFooter>
          {preview ? (
            <>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={busy}>
                <ArrowLeft className="h-4 w-4" /> Quay lại
              </Button>
              <Button onClick={runCommit} disabled={busy || preview.errors.length > 0}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận nhập
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
              <Button onClick={runPreview} disabled={busy || !scoped.length}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xem trước
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "blue" | "amber" | "red" }) {
  const toneCls =
    tone === "emerald" ? "text-emerald-600" : tone === "blue" ? "text-blue-600" : tone === "amber" ? "text-amber-600" : tone === "red" ? "text-red-600" : "text-ink";
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className={cn("text-lg font-black leading-none", toneCls)}>{value.toLocaleString("vi-VN")}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: { line: number; code: string; reason: string }[]; tone: "red" | "amber" }) {
  const cls = tone === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-xs", cls)}>
      <div className="mb-1 font-semibold">{title}</div>
      <div className="max-h-40 space-y-0.5 overflow-y-auto">
        {issues.slice(0, 100).map((it, i) => (
          <div key={i} className="font-mono">
            <span className="opacity-70">dòng {it.line}</span> · {it.code || "—"} — {it.reason}
          </div>
        ))}
        {issues.length > 100 && <div className="opacity-70">… và {issues.length - 100} dòng khác</div>}
      </div>
    </div>
  );
}
