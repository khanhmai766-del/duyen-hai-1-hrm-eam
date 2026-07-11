"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import type { ErpMaterial } from "@prisma/client";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleDot,
  Cpu,
  Database,
  Download,
  Droplet,
  Filter,
  FlaskConical,
  Loader2,
  Package,
  Pencil,
  Plus,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ExportButton } from "@/components/shared/export-button";
import { SearchBar } from "@/components/shared/search-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { PeakProtectedRoute } from "@/components/shared/peak-protected-route";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDeleteErpMaterial, useDeleteErpMaterials, useErpMaterials, useImportErpMaterials, useUpsertErpMaterial } from "@/hooks/useErpMaterials";
import { canManageMaterialCatalog, MATERIAL_CATEGORIES } from "@/lib/constants";
import { canonicalMaterialCategory, downloadErpImportTemplate, readErpImportFile } from "@/lib/erp-import";
import { normalizeText } from "@/lib/nav";
import { cn } from "@/lib/utils";

type ErpMaterialEdit = Partial<ErpMaterial> & { id?: string };

// Đổi thành false sau khi đã nhập xong danh mục ERP để ẩn nút File mẫu / Nhập Excel.
const SHOW_ERP_IMPORT_TOOLS = true;

const MATERIAL_CATEGORY_TABS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "Dầu bôi trơn", label: "Dầu bôi trơn", icon: Droplet },
  { key: "Lõi lọc dầu", label: "Lõi lọc dầu", icon: Filter },
  { key: "Thiết bị C&I", label: "Thiết bị C&I", icon: Cpu },
  { key: "Hóa Chất", label: "Hóa Chất", icon: FlaskConical },
  { key: "Bi Nghiền Than", label: "Bi Nghiền Than", icon: CircleDot },
];

export default function ErpMaterialsPage() {
  return (
    <PeakProtectedRoute>
      <ErpMaterialsPageContent />
    </PeakProtectedRoute>
  );
}

function ErpMaterialsPageContent() {
  const { data: session } = useSession();
  const canManage = canManageMaterialCatalog({ role: session?.user?.role, position: session?.user?.position });
  const { data, isLoading } = useErpMaterials();
  const upsert = useUpsertErpMaterial();
  const importErp = useImportErpMaterials();
  const del = useDeleteErpMaterial();
  const delMany = useDeleteErpMaterials();
  const totalErp = typeof data?.meta?.total === "number" ? data.meta.total : data?.data?.length ?? 0;

  const [q, setQ] = React.useState("");
  const [edit, setEdit] = React.useState<ErpMaterialEdit | null>(null);
  const [formError, setFormError] = React.useState("");
  const [isNew, setIsNew] = React.useState(false);
  const [deleting, setDeleting] = React.useState<ErpMaterial | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [categoryFilter, setCategoryFilter] = React.useState<string>(MATERIAL_CATEGORIES[0]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const categoryCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of data?.data ?? []) {
      const category = canonicalMaterialCategory(item.category);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  const materials = (data?.data ?? []).filter((m) => {
    const haystack = normalizeText(`${m.code} ${m.name} ${m.unit}`);
    return (
      canonicalMaterialCategory(m.category) === categoryFilter &&
      (!q.trim() || haystack.includes(normalizeText(q)))
    );
  });
  const visibleKey = materials.map((m) => m.id).join(",");

  React.useEffect(() => {
    const visible = new Set(visibleKey ? visibleKey.split(",") : []);
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleKey]);

  const totalPages = Math.max(1, Math.ceil(materials.length / pageSize));
  const firstShown = materials.length ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, materials.length);
  const pagedMaterials = materials.slice((page - 1) * pageSize, page * pageSize);
  const allChecked = materials.length > 0 && materials.every((m) => selected.has(m.id));
  const someChecked = selected.size > 0 && !allChecked;

  React.useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);
  React.useEffect(() => {
    setPage(1);
  }, [visibleKey, pageSize]);

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(materials.map((m) => m.id)) : new Set());
  }

  async function save() {
    if (!edit) return;
    setFormError("");
    const code = String(edit.code ?? "").trim();
    const name = String(edit.name ?? "").trim();
    const unit = String(edit.unit ?? "").trim();
    if (isNew && !code) {
      setFormError("Vui lòng nhập Mã vật tư.");
      return;
    }
    if (!name) {
      setFormError("Vui lòng nhập Tên vật tư.");
      return;
    }
    if (!unit) {
      setFormError("Vui lòng nhập ĐVT.");
      return;
    }

    try {
      const payload = {
        ...edit,
        ...(isNew ? { id: undefined, code } : {}),
        name,
        unit,
        category: edit.category || categoryFilter,
        erpStock: Math.max(0, Math.round(Number(edit.erpStock) || 0)),
      };
      await upsert.mutateAsync(payload);
      toast.success(isNew ? "Đã thêm vật tư ERP" : "Đã cập nhật vật tư ERP");
      setEdit(null);
    } catch (e) {
      const message = (e as Error).message;
      setFormError(message);
      toast.error(message);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success("Đã xoá vật tư ERP");
      setDeleting(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function confirmBulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      const res = await delMany.mutateAsync(ids);
      toast.success(`Đã xoá ${res.count} vật tư ERP`);
      setSelected(new Set());
      setBulkOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function exportRows() {
    return materials.map((m) => ({ code: m.code, name: m.name, dvt: m.unit, loaiVatTu: m.category ?? "", soLieuERP: m.erpStock }));
  }

  function downloadImportTemplate() {
    downloadErpImportTemplate(categoryFilter);
    toast.success("Đã tạo file mẫu import");
  }

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

  return (
    <div className="space-y-6">
      <PageHeader title="DANH MỤC VẬT TƯ ERP" description="Dữ liệu vật tư theo ERP: mã vật tư, tên vật tư, đơn vị tính và số liệu ERP">
        {canManage && (
          <>
            <ExportButton
              rows={exportRows()}
              filename="danh-muc-vat-tu-erp"
            />
            {SHOW_ERP_IMPORT_TOOLS && (
              <>
                <Button type="button" variant="outline" size="sm" onClick={downloadImportTemplate}>
                  <Download className="h-4 w-4" /> File mẫu
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => importInputRef.current?.click()} disabled={importErp.isPending}>
                  {importErp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Nhập Excel
                </Button>
                <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importExcel} />
              </>
            )}
            <Button onClick={() => { setIsNew(true); setFormError(""); setEdit({ unit: "Cái", erpStock: 0, category: categoryFilter }); }}>
              <Plus className="h-4 w-4" /> Thêm vật tư ERP
            </Button>
          </>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {MATERIAL_CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={categoryFilter === tab.key}
            onClick={() => setCategoryFilter(tab.key)}
            className={cn(
              "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              categoryFilter === tab.key ? "border-navy text-navy" : "border-transparent text-muted-foreground hover:text-ink"
            )}
          >
            <tab.icon className="h-4 w-4" />
            <span>{tab.label}</span>
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
              categoryFilter === tab.key ? "bg-navy/10 text-navy" : "bg-muted text-muted-foreground"
            )}>
              {categoryCounts.get(tab.key) ?? 0}
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 pb-2">
          <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <Database className="h-4 w-4 text-accent" />
            <span>{totalErp} mã vật tư ERP</span>
          </div>
          <SearchBar value={q} onChange={setQ} placeholder="Tìm theo mã, tên, ĐVT..." className="sm:w-80" />
        </div>
      </div>

      {canManage && selected.size > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-red-50 px-3 py-2">
            <span className="text-sm font-medium text-ink">Đã chọn {selected.size} vật tư ERP</span>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>Bỏ chọn</Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkOpen(true)}>
              <Trash2 className="h-4 w-4" /> Xoá đã chọn
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : materials.length === 0 ? (
        <EmptyState
          icon={Package}
          title={q.trim() ? "Không tìm thấy vật tư ERP" : "Không có vật tư ERP"}
          description={
            q.trim()
              ? `Không có vật tư ERP nào khớp từ khoá trong loại "${categoryFilter}".`
              : `Chưa có vật tư ERP nào thuộc loại "${categoryFilter}".`
          }
          action={q.trim() ? { label: "Xoá bộ lọc", onClick: () => setQ("") } : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  {canManage && (
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Chọn tất cả"
                        checked={allChecked ? true : someChecked ? "indeterminate" : false}
                        onCheckedChange={(v) => toggleAll(v === true)}
                      />
                    </TableHead>
                  )}
                  <TableHead className="text-center">Mã vật tư</TableHead>
                  <TableHead className="text-center">Tên vật tư</TableHead>
                  <TableHead className="text-center">ĐVT</TableHead>
                  <TableHead className="text-center">Số liệu ERP</TableHead>
                  {canManage && <TableHead className="text-center">Thao tác</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedMaterials.map((m) => {
                  const checked = selected.has(m.id);
                  return (
                    <TableRow key={m.id} data-state={checked ? "selected" : undefined} className={cn(checked && "bg-accent/5")}>
                      {canManage && (
                        <TableCell className="w-10">
                          <Checkbox aria-label={`Chọn ${m.code}`} checked={checked} onCheckedChange={(v) => toggleOne(m.id, v === true)} />
                        </TableCell>
                      )}
                      <TableCell className="text-center">
                        <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs font-medium text-navy">{m.code}</span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-ink">{m.name}</div>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">{m.unit}</TableCell>
                      <TableCell className="text-center">
                        <InlineNumberCell
                          value={m.erpStock}
                          canEdit={canManage}
                          ariaLabel={`Sửa Số liệu ERP của ${m.code}`}
                          onSave={async (v) => {
                            await upsert.mutateAsync({ id: m.id, erpStock: v });
                            toast.success(`Đã cập nhật Số liệu ERP: ${m.code} → ${v}`);
                          }}
                        />
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" title="Sửa" onClick={() => { setIsNew(false); setFormError(""); setEdit(m); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Xoá" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => setDeleting(m)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 border-t border-border p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div>
              Hiển thị {firstShown}-{lastShown} trong tổng số {materials.length} vật tư ERP
              {q.trim() && <span> sau lọc</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:ml-auto">
              <div className="flex items-center gap-2">
                <span>Hiển thị</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-8 rounded-md border border-input bg-white px-2 text-sm font-medium text-ink"
                  aria-label="Số dòng mỗi trang"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>dòng</span>
              </div>
              <PageButton icon={ChevronsLeft} label="Trang đầu" disabled={page <= 1} onClick={() => setPage(1)} />
              <PageButton icon={ChevronLeft} label="Trang trước" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} />
              <span className="mx-2 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-ink">{page}/{totalPages}</span>
              <PageButton icon={ChevronRight} label="Trang sau" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} />
              <PageButton icon={ChevronsRight} label="Trang cuối" disabled={page >= totalPages} onClick={() => setPage(totalPages)} />
            </div>
          </div>
        </Card>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) { setEdit(null); setFormError(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{isNew ? "Thêm vật tư ERP" : `Cập nhật: ${edit?.name}`}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid grid-cols-2 gap-3">
              {isNew && (
                <Field label="Mã vật tư *" className="col-span-2 sm:col-span-1">
                  <Input value={edit.code ?? ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />
                </Field>
              )}
              <Field label="ĐVT *" className={cn("col-span-2", isNew && "sm:col-span-1")}>
                <Input value={edit.unit ?? ""} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} placeholder="Cái / Lít / Bộ..." />
              </Field>
              <Field label="Tên vật tư *" className="col-span-2">
                <Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label="Loại vật tư" className="col-span-2">
                <Select value={edit.category ?? categoryFilter} onValueChange={(v) => setEdit({ ...edit, category: v })}>
                  <SelectTrigger aria-label="Chọn loại vật tư"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATERIAL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Số liệu ERP" className="col-span-2">
                <Input type="number" min={0} value={edit.erpStock ?? 0} onChange={(e) => setEdit({ ...edit, erpStock: Number(e.target.value) })} />
              </Field>
              {formError && (
                <div className="col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {formError}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEdit(null); setFormError(""); }}>Huỷ</Button>
            <Button onClick={save} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Xoá vật tư ERP"
        description={deleting ? `Bạn chắc chắn muốn xoá “${deleting.code} · ${deleting.name}”? Hành động này không thể hoàn tác.` : undefined}
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={(o) => !o && setBulkOpen(false)}
        title={`Xoá ${selected.size} vật tư ERP đã chọn?`}
        description="Toàn bộ vật tư ERP đã chọn sẽ bị xoá. Hành động này không thể hoàn tác."
        confirmLabel={`Xoá ${selected.size} vật tư`}
        loading={delMany.isPending}
        onConfirm={confirmBulkDelete}
      />
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><Label className="mb-1.5 block">{label}</Label>{children}</div>;
}

function InlineNumberCell({
  value,
  canEdit,
  ariaLabel,
  onSave,
}: {
  value: number;
  canEdit: boolean;
  ariaLabel: string;
  onSave: (v: number) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(String(value));
  const [saving, setSaving] = React.useState(false);

  if (!editing) {
    return (
      <span
        className={cn(
          "inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums text-ink",
          canEdit && "cursor-text transition-colors hover:bg-sky-50 hover:ring-1 hover:ring-sky-200"
        )}
        title={canEdit ? "Nhấn đúp để sửa nhanh" : undefined}
        onDoubleClick={(e) => {
          if (!canEdit) return;
          e.stopPropagation();
          setDraft(String(value));
          setEditing(true);
        }}
      >
        {value}
      </span>
    );
  }

  return (
    <input
      autoFocus
      type="number"
      min={0}
      aria-label={ariaLabel}
      value={draft}
      disabled={saving}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={async (e) => {
        if (e.key === "Escape") return setEditing(false);
        if (e.key !== "Enter") return;
        const next = Math.max(0, Math.round(Number(draft)));
        if (!Number.isFinite(next)) return void toast.error("Giá trị không hợp lệ");
        if (next === value) return setEditing(false);
        setSaving(true);
        try {
          await onSave(next);
          setEditing(false);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setSaving(false);
        }
      }}
      onBlur={() => !saving && setEditing(false)}
      className="h-8 w-20 rounded-md border border-accent bg-white px-2 text-center text-sm font-semibold tabular-nums outline-none ring-2 ring-accent/25"
    />
  );
}

function PageButton({ icon: Icon, label, disabled, onClick }: { icon: LucideIcon; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-8 w-8 rounded-lg disabled:cursor-not-allowed disabled:opacity-45"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

