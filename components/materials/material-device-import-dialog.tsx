"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiMutate } from "@/lib/fetcher";
import { normalizeText } from "@/lib/nav";
import { useEquipmentTree } from "@/hooks/useEquipment";
import { usePositions } from "@/hooks/useUsers";
import { isSelectableManagingPosition } from "@/lib/constants";
import type { ErpMaterialGroupFromGroupedStock } from "@/hooks/useErpMaterials";

type ParsedRow = {
  rowNumber: number;
  machine: string;
  deviceSeq: string;
  deviceName: string;
  manualDeviceName: string;
  materialName: string;
  managingPosition: string;
  intervalNote: string;
  intervalMonths: number;
  quantity: number;
  deviceCount: number;
};

type ImportResult = {
  validCount: number;
  errors: Array<{ rowNumber: number; message: string }>;
  preview: Array<{ rowNumber: number; machine: string; materialName: string; materialStatus: string; deviceSeq: string; deviceName: string; manualDeviceName: string | null; quantity: number; intervalMonths: number }>;
  materialsCreated: number;
  created: number;
  updated: number;
};

function findKey(keys: string[], names: string[]) {
  return keys.find((key) => names.includes(normalizeText(key)));
}

function parseRows(sheet: XLSX.WorkSheet): ParsedRow[] {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  if (!raw.length) return [];
  const keys = Object.keys(raw[0]);
  const machineKey = findKey(keys, ["to may", "machine"]);
  const seqKey = findKey(keys, ["so thu tu", "device seq", "ma thiet bi"]);
  const deviceNameKey = findKey(keys, ["ten thiet bi", "ten thiet bi (tham chieu)"]);
  const manualDeviceNameKey = findKey(keys, ["thiet bi (nhap tay)", "thiet bi nhap tay"]);
  const materialNameKey = findKey(keys, ["ten vat tu", "ten nhom vat tu"]);
  if (!machineKey || !seqKey || !deviceNameKey || !materialNameKey) throw new Error("File phải có các cột Tổ máy, Số thứ tự, Tên thiết bị và Tên vật tư");
  const positionKey = findKey(keys, ["cuong vi quan ly", "cuong vi"]);
  const omKey = findKey(keys, ["chu ky o&m", "chu ky om"]);
  const intervalKey = findKey(keys, ["chu ky thay the (thang)", "chu ky thay the", "chu ky (thang)"]);
  const quantityKey = findKey(keys, ["so luong can thay", "dung tich thiet bi", "so luong"]);
  const countKey = findKey(keys, ["sl thiet bi", "so luong thiet bi"]);
  return raw.flatMap((row, index) => {
    const deviceSeq = String(row[seqKey] ?? "").trim();
    const materialName = String(row[materialNameKey] ?? "").trim();
    if (!materialName) return [];
    return [{
      rowNumber: index + 2,
      machine: String(row[machineKey] ?? "").trim().toUpperCase(),
      deviceSeq,
      deviceName: String(row[deviceNameKey] ?? "").trim(),
      manualDeviceName: manualDeviceNameKey ? String(row[manualDeviceNameKey] ?? "").trim() : "",
      materialName,
      managingPosition: positionKey ? String(row[positionKey] ?? "").trim() : "",
      intervalNote: omKey ? String(row[omKey] ?? "").trim() : "",
      intervalMonths: Number(intervalKey ? row[intervalKey] : 6),
      quantity: Number(quantityKey ? row[quantityKey] : 1),
      deviceCount: Number(countKey ? row[countKey] : 1),
    }];
  });
}

export function MaterialDeviceImportDialog({
  open,
  onOpenChange,
  machine,
  category,
  erpGroups,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machine: string;
  category: string;
  erpGroups: ErpMaterialGroupFromGroupedStock[];
  onImported: () => void;
}) {
  const tree = useEquipmentTree();
  const positions = usePositions().filter(isSelectableManagingPosition);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [rows, setRows] = React.useState<ParsedRow[]>([]);
  const [fileName, setFileName] = React.useState("");
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => {
    if (!open) { setRows([]); setFileName(""); setResult(null); }
  }, [open]);

  function downloadTemplate() {
    const nodes = tree.data?.data ?? [];
    if (!nodes.length) return toast.error("Chưa tải được cây thiết bị");
    const parentSeqs = new Set(nodes.map((node) => node.parentSeq).filter(Boolean));
    const nodeBySeq = new Map(nodes.map((node) => [node.seq, node]));
    function equipmentPath(seq: string) {
      const names: string[] = [];
      const visited = new Set<string>();
      let current = nodeBySeq.get(seq);
      while (current && !visited.has(current.seq)) {
        visited.add(current.seq);
        names.unshift(current.name);
        current = current.parentSeq ? nodeBySeq.get(current.parentSeq) : undefined;
      }
      return names.join(" > ");
    }
    const linkRows = [{
        "Tổ máy": machine,
        "Số thứ tự": "",
        "Tên thiết bị": "",
        "Thiết bị (nhập tay)": "",
        "Tên vật tư": "",
        "Cương vị quản lý": "",
        "Chu kỳ O&M": "",
        "Chu kỳ thay thế (tháng)": 6,
        "Số lượng cần thay": 1,
        "SL thiết bị": 1,
      }];
    const treeRows = [...nodes]
      .sort((a, b) => a.seq.localeCompare(b.seq, undefined, { numeric: true }))
      .map((node) => {
        const isLeaf = !parentSeqs.has(node.seq);
        const parent = node.parentSeq ? nodeBySeq.get(node.parentSeq) : undefined;
        return {
          "Số thứ tự": node.seq,
          "Tên thiết bị / thư mục": node.name,
          "Loại": isLeaf ? "Thiết bị đầu cuối" : "Thư mục / hệ thống",
          "Thuộc thiết bị / thư mục": parent?.name ?? "—",
          "Đường dẫn đầy đủ": equipmentPath(node.seq),
          "Dùng để import": isLeaf ? "Có" : "Không",
        };
      });
    const materialRows = erpGroups.map((group) => ({
        "Tên vật tư": group.name,
        "ĐVT": group.unit,
        "Loại vật tư": group.category,
        "Số mã ERP trong nhóm": group.materialCount,
      }));
    const positionRows = positions.map((position) => ({ "Cương vị quản lý": position }));
    const workbook = XLSX.utils.book_new();
    const links = XLSX.utils.json_to_sheet(linkRows);
    links["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 42 }, { wch: 34 }, { wch: 38 }, { wch: 24 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 14 }];
    const treeSheet = XLSX.utils.json_to_sheet(treeRows);
    treeSheet["!cols"] = [{ wch: 18 }, { wch: 42 }, { wch: 22 }, { wch: 42 }, { wch: 90 }, { wch: 18 }];
    const catalog = XLSX.utils.json_to_sheet(materialRows);
    catalog["!cols"] = [{ wch: 42 }, { wch: 12 }, { wch: 22 }, { wch: 22 }];
    const positionSheet = positionRows.length
      ? XLSX.utils.json_to_sheet(positionRows)
      : XLSX.utils.aoa_to_sheet([["Cương vị quản lý"]]);
    positionSheet["!cols"] = [{ wch: 36 }];
    XLSX.utils.book_append_sheet(workbook, links, "Liên kết vật tư - thiết bị");
    XLSX.utils.book_append_sheet(workbook, treeSheet, "Cây thiết bị tham chiếu");
    XLSX.utils.book_append_sheet(workbook, catalog, "Danh mục vật tư");
    XLSX.utils.book_append_sheet(workbook, positionSheet, "Cương vị");
    XLSX.writeFile(workbook, `mau-link-vat-tu-thiet-bi-${machine.toLowerCase()}.xlsx`, { compression: true });
    toast.success("Đã tạo file mẫu kèm cây thiết bị, vật tư ERP và cương vị");
  }

  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setChecking(true);
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const parsed = parseRows(workbook.Sheets[workbook.SheetNames[0]]);
      if (!parsed.length) throw new Error("File chưa có dòng nào được điền Tên vật tư");
      const checked = await apiMutate<ImportResult>("/api/materials/import-device-links", "POST", { machine, category, rows: parsed, dryRun: true });
      setRows(parsed);
      setFileName(file.name);
      setResult(checked);
    } catch (error) {
      setRows([]); setResult(null);
      toast.error(error instanceof Error ? error.message : "Không đọc được file Excel");
    } finally {
      setChecking(false);
    }
  }

  async function submit() {
    if (!rows.length || result?.errors.length) return;
    try {
      setImporting(true);
      const imported = await apiMutate<ImportResult>("/api/materials/import-device-links", "POST", { machine, category, rows });
      toast.success(`Đã tạo ${imported.materialsCreated} vật tư PXVH1 · ${imported.created} link mới · ${imported.updated} cập nhật`);
      onImported();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không nhập được liên kết vật tư");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Link vật tư vào cây thiết bị</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-slate-700">
            Tải file mẫu, điền <b>Tổ máy</b>, <b>Số thứ tự</b>, <b>Tên thiết bị</b>, chọn <b>Tên vật tư</b> và <b>Cương vị quản lý</b> từ các sheet tham chiếu. Trong sheet cây thiết bị, chỉ dùng dòng có cột <b>Dùng để import = Có</b>. S2 có thể dùng lại Số thứ tự của cây S1.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={downloadTemplate} disabled={tree.isLoading}>Tải file import mẫu</Button>
            <Button type="button" onClick={() => inputRef.current?.click()} disabled={checking}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Chọn file đã điền
            </Button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={chooseFile} />
          </div>
          {fileName && result && (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between bg-muted/40 px-4 py-3 text-sm">
                <span className="font-semibold text-ink">{fileName}</span>
                <span className={result.errors.length ? "font-semibold text-red-600" : "font-semibold text-emerald-700"}>
                  {result.errors.length ? `${result.errors.length} lỗi` : `${result.validCount} dòng hợp lệ`}
                </span>
              </div>
              {result.errors.length > 0 ? (
                <div className="max-h-56 overflow-y-auto p-3 text-sm text-red-700">
                  {result.errors.slice(0, 100).map((error, index) => <div key={`${error.rowNumber}-${index}`}>Dòng {error.rowNumber}: {error.message}</div>)}
                </div>
              ) : (
                <div className="max-h-64 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-muted-foreground"><tr><th className="px-3 py-2 text-left">Dòng</th><th className="px-3 py-2 text-left">Tổ máy</th><th className="px-3 py-2 text-left">Vật tư</th><th className="px-3 py-2 text-left">Số thứ tự</th><th className="px-3 py-2 text-left">Thiết bị cây</th><th className="px-3 py-2 text-left">Thiết bị nhập tay</th><th className="px-3 py-2 text-right">SL</th><th className="px-3 py-2 text-right">Chu kỳ</th></tr></thead>
                    <tbody>{result.preview.map((row) => <tr key={row.rowNumber} className="border-t"><td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2 font-semibold">{row.machine}</td><td className="px-3 py-2"><div className="font-medium">{row.materialName}</div><div className="text-[10px] text-muted-foreground">{row.materialStatus}</div></td><td className="px-3 py-2 font-mono">{row.deviceSeq}</td><td className="px-3 py-2">{row.deviceName}</td><td className="px-3 py-2 font-medium">{row.manualDeviceName || "—"}</td><td className="px-3 py-2 text-right">{row.quantity}</td><td className="px-3 py-2 text-right">{row.intervalMonths} tháng</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={submit} disabled={!result || result.errors.length > 0 || importing}>
            {importing && <Loader2 className="h-4 w-4 animate-spin" />} Nhập {result?.validCount || ""} liên kết
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
