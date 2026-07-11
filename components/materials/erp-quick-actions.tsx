"use client";
// Cụm nút thao tác ERP dùng chung: Xuất / File mẫu / Nhập Excel / Thêm vật tư ERP.
// Dùng ở header trang "Danh mục vật tư ERP" và "Tồn kho vật tư theo nhóm".
// Chỉ hiển thị với người được quản lý danh mục vật tư.
import * as React from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Download, Loader2, Plus, Upload } from "lucide-react";
import { ExportButton } from "@/components/shared/export-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useImportErpMaterials, useUpsertErpMaterial } from "@/hooks/useErpMaterials";
import { canManageMaterialCatalog, MATERIAL_CATEGORIES } from "@/lib/constants";
import { downloadErpImportTemplate, readErpImportFile } from "@/lib/erp-import";

export function ErpQuickActions({
  exportRows,
  exportFilename,
  exportTitle,
  defaultCategory = MATERIAL_CATEGORIES[0],
  showImportTools = true,
}: {
  /** Dữ liệu cho nút Xuất — trang nào truyền dữ liệu trang đó. */
  exportRows: Record<string, unknown>[];
  exportFilename: string;
  exportTitle?: string;
  /** Loại vật tư mặc định cho file mẫu và form thêm mới. */
  defaultCategory?: string;
  showImportTools?: boolean;
}) {
  const { data: session } = useSession();
  const canManage = canManageMaterialCatalog({ role: session?.user?.role, position: session?.user?.position });
  const importErp = useImportErpMaterials();
  const upsert = useUpsertErpMaterial();
  const importInputRef = React.useRef<HTMLInputElement>(null);

  const emptyForm = React.useMemo(
    () => ({ code: "", name: "", unit: "Cái", category: defaultCategory, erpStock: 0 }),
    [defaultCategory]
  );
  const [form, setForm] = React.useState<typeof emptyForm | null>(null);
  const [formError, setFormError] = React.useState("");

  if (!canManage) return null;

  async function importExcel(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast.error("Chỉ chấp nhận file Excel .xlsx, .xls hoặc .csv");
      return;
    }

    try {
      const parsed = await readErpImportFile(file);
      if (!parsed.length) {
        toast.error("File import chưa có dòng hợp lệ. Cần đủ cột Mã, Tên, ĐVT, Loại vật tư, Số liệu ERP.");
        return;
      }
      const result = await importErp.mutateAsync(parsed);
      const detail = result.skipped ? `, bỏ qua ${result.skipped}` : "";
      toast.success(`Đã nhập ${parsed.length - result.skipped} dòng ERP: tạo mới ${result.created}, cập nhật ${result.updated}${detail}`);
      if (result.errors.length) {
        toast.warning(result.errors.slice(0, 3).join("; "));
      }
    } catch (error) {
      toast.error((error as Error).message || "Không nhập được file Excel");
    }
  }

  async function saveNew() {
    if (!form) return;
    setFormError("");
    const code = form.code.trim();
    const name = form.name.trim();
    const unit = form.unit.trim();
    if (!code) return setFormError("Vui lòng nhập Mã vật tư.");
    if (!name) return setFormError("Vui lòng nhập Tên vật tư.");
    if (!unit) return setFormError("Vui lòng nhập ĐVT.");

    try {
      await upsert.mutateAsync({
        code,
        name,
        unit,
        category: form.category,
        erpStock: Math.max(0, Math.round(Number(form.erpStock) || 0)),
      });
      toast.success("Đã thêm vật tư ERP");
      setForm(null);
    } catch (e) {
      const message = (e as Error).message;
      setFormError(message);
      toast.error(message);
    }
  }

  return (
    <>
      <ExportButton rows={exportRows} filename={exportFilename} title={exportTitle} />
      {showImportTools && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              downloadErpImportTemplate(defaultCategory);
              toast.success("Đã tạo file mẫu import");
            }}
          >
            <Download className="h-4 w-4" /> File mẫu
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => importInputRef.current?.click()} disabled={importErp.isPending}>
            {importErp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Nhập Excel
          </Button>
          <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importExcel} />
        </>
      )}
      <Button onClick={() => { setFormError(""); setForm(emptyForm); }}>
        <Plus className="h-4 w-4" /> Thêm vật tư ERP
      </Button>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) { setForm(null); setFormError(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Thêm vật tư ERP</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <Label className="mb-1.5 block">Mã vật tư *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label className="mb-1.5 block">ĐVT *</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Cái / Lít / Bộ..." />
              </div>
              <div className="col-span-2">
                <Label className="mb-1.5 block">Tên vật tư *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="mb-1.5 block">Loại vật tư</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger aria-label="Chọn loại vật tư"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATERIAL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="mb-1.5 block">Số liệu ERP</Label>
                <Input type="number" min={0} value={form.erpStock} onChange={(e) => setForm({ ...form, erpStock: Number(e.target.value) })} />
              </div>
              {formError && (
                <div className="col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {formError}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setForm(null); setFormError(""); }}>Huỷ</Button>
            <Button onClick={saveNew} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
