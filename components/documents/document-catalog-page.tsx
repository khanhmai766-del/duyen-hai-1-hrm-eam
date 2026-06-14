"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { ExternalLink, FileText, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDevices } from "@/hooks/useDevices";
import {
  type DigitalDocument,
  type DocumentCategory,
  useDeleteDocument,
  useDocuments,
  useUpsertDocument,
} from "@/hooks/useDocuments";
import { blockForPosition } from "@/lib/constants";
import { cn } from "@/lib/utils";

type DocumentForm = {
  title: string;
  decisionNumber: string;
  documentUrl: string;
  managingPosition: string;
};

const EMPTY_FORM: DocumentForm = {
  title: "",
  decisionNumber: "",
  documentUrl: "",
  managingPosition: "",
};

const NO_POSITION = "__NONE__";
const ALL_FILTER = "__ALL__";

interface DocumentCatalogPageProps {
  category: DocumentCategory;
  title: string;
  description: string;
  nameLabel: string;
  codeLabel: string;
  linkLabel?: string;
  addLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  showEquipmentScope?: boolean;
  showCodeField?: boolean;
}

export function DocumentCatalogPage({
  category,
  title,
  description,
  nameLabel,
  codeLabel,
  linkLabel = "Link tài liệu liên kết",
  addLabel,
  emptyTitle,
  emptyDescription,
  showEquipmentScope = false,
  showCodeField = true,
}: DocumentCatalogPageProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const docs = useDocuments(category);
  const devices = useDevices({});
  const upsert = useUpsertDocument();
  const remove = useDeleteDocument();
  const [q, setQ] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DigitalDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DigitalDocument | null>(null);
  const [form, setForm] = React.useState<DocumentForm>(EMPTY_FORM);
  const [positionFilter, setPositionFilter] = React.useState(ALL_FILTER);
  const [blockFilter, setBlockFilter] = React.useState(ALL_FILTER);
  const managementBlock = showEquipmentScope ? blockForPosition(form.managingPosition) : "";

  const positionOptions = React.useMemo(
    () =>
      Array.from(
        new Set((devices.data?.data ?? []).map((device) => device.managingPosition).filter((value): value is string => !!value))
      ).sort((a, b) => a.localeCompare(b, "vi")),
    [devices.data?.data]
  );
  const blockOptions = React.useMemo(
    () => Array.from(new Set(positionOptions.map((position) => blockForPosition(position)))).sort((a, b) => a.localeCompare(b, "vi")),
    [positionOptions]
  );

  const rows = React.useMemo(() => {
    const source = docs.data?.data ?? [];
    const needle = q.trim().toLowerCase();
    return source.filter((item) => {
      if (showEquipmentScope && positionFilter !== ALL_FILTER && item.managingPosition !== positionFilter) return false;
      const itemBlock = item.managementBlock || blockForPosition(item.managingPosition);
      if (showEquipmentScope && blockFilter !== ALL_FILTER && itemBlock !== blockFilter) return false;
      if (!needle) return true;
      return [item.title, item.decisionNumber, item.documentUrl, item.managingPosition, itemBlock]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [docs.data?.data, q, showEquipmentScope, positionFilter, blockFilter]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(item: DigitalDocument) {
    setEditing(item);
    setForm({
      title: item.title,
      decisionNumber: item.decisionNumber ?? "",
      documentUrl: item.documentUrl,
      managingPosition: item.managingPosition ?? "",
    });
    setFormOpen(true);
  }

  async function submit() {
    try {
      await upsert.mutateAsync({
        id: editing?.id,
        category,
        title: form.title,
        decisionNumber: form.decisionNumber,
        documentUrl: form.documentUrl,
        managingPosition: showEquipmentScope ? form.managingPosition : null,
        managementBlock: showEquipmentScope ? managementBlock : null,
      });
      setFormOpen(false);
      toast.success(editing ? "Đã cập nhật tài liệu" : "Đã thêm tài liệu");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description}>
        {isAdmin && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {addLabel}
          </Button>
        )}
      </PageHeader>

      <Card className="p-4">
        <div className="grid gap-3 xl:grid-cols-[1fr_220px_190px]">
          <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="pl-9"
            placeholder={`Tìm theo ${nameLabel.toLowerCase()}, số hiệu, link tài liệu...`}
          />
          </div>
          {showEquipmentScope && (
            <>
              <Select value={positionFilter} onValueChange={setPositionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Lọc cương vị" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>Tất cả cương vị</SelectItem>
                  {positionOptions.map((position) => (
                    <SelectItem key={position} value={position}>
                      {position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Lọc khối quản lý" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>Tất cả khối</SelectItem>
                  {blockOptions.map((block) => (
                    <SelectItem key={block} value={block}>
                      {block}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40 [&_th]:whitespace-nowrap [&_th]:text-center">
              <TableHead className="w-16 whitespace-nowrap text-center">STT</TableHead>
              <TableHead className="whitespace-nowrap text-center">{nameLabel}</TableHead>
              {showEquipmentScope && <TableHead className="w-[170px] text-center">Cương vị</TableHead>}
              {showEquipmentScope && <TableHead className="w-[160px] text-center">Khối quản lý</TableHead>}
              {showCodeField && <TableHead className="w-[180px] text-center">{codeLabel}</TableHead>}
              <TableHead>{linkLabel}</TableHead>
              {isAdmin && <TableHead className="w-[120px] text-center">Thao tác</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.isLoading ? (
              <TableRow>
                <TableCell colSpan={(isAdmin ? 5 : 4) + (showEquipmentScope ? 2 : 0) - (showCodeField ? 0 : 1)} className="h-32 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length ? (
              rows.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="text-center font-semibold text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-accent">
                        <FileText className="h-4 w-4" />
                      </div>
                      <span className="font-semibold text-ink">{item.title}</span>
                    </div>
                  </TableCell>
                  {showEquipmentScope && (
                    <TableCell className="text-center text-muted-foreground">{item.managingPosition || "—"}</TableCell>
                  )}
                  {showEquipmentScope && (
                    <TableCell className="text-center text-muted-foreground">{item.managementBlock || blockForPosition(item.managingPosition)}</TableCell>
                  )}
                  {showCodeField && <TableCell className="text-center text-muted-foreground">{item.decisionNumber || "—"}</TableCell>}
                  <TableCell>
                    <a
                      href={item.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-[360px] items-center gap-2 truncate text-sm font-medium text-accent hover:underline"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.documentUrl}</span>
                    </a>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)} title="Sửa tài liệu">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(item)}
                          title="Xóa tài liệu"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={(isAdmin ? 5 : 4) + (showEquipmentScope ? 2 : 0) - (showCodeField ? 0 : 1)} className="p-0">
                  <EmptyState title={emptyTitle} description={emptyDescription} icon={FileText} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Chỉnh sửa tài liệu" : addLabel}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>{nameLabel} *</Label>
              <Input
                value={form.title}
                onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))}
                placeholder={`Nhập ${nameLabel.toLowerCase()}...`}
              />
            </div>
            {showEquipmentScope && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Cương vị</Label>
                  <Select
                    value={form.managingPosition || NO_POSITION}
                    onValueChange={(value) =>
                      setForm((state) => ({ ...state, managingPosition: value === NO_POSITION ? "" : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn cương vị" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_POSITION}>— Không chọn —</SelectItem>
                      {positionOptions.map((position) => (
                        <SelectItem key={position} value={position}>
                          {position}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Khối quản lý</Label>
                  <Input value={managementBlock} readOnly className="bg-muted/60" />
                </div>
              </div>
            )}
            <div className={cn("grid gap-1.5", !showCodeField && "hidden")}>
              <Label>{codeLabel}</Label>
              <Input
                value={form.decisionNumber}
                onChange={(event) => setForm((state) => ({ ...state, decisionNumber: event.target.value }))}
                placeholder={`Nhập ${codeLabel.toLowerCase()}...`}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{linkLabel} *</Label>
              <Input
                value={form.documentUrl}
                onChange={(event) => setForm((state) => ({ ...state, documentUrl: event.target.value }))}
                placeholder="https://... hoặc link Google Drive / PDF"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Hủy
            </Button>
            <Button onClick={submit} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Lưu thay đổi" : "Thêm mới"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Xóa tài liệu?"
        description={deleteTarget ? `Xóa "${deleteTarget.title}" khỏi danh mục?` : undefined}
        confirmLabel="Xóa"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await remove.mutateAsync({ id: deleteTarget.id, category });
            setDeleteTarget(null);
            toast.success("Đã xóa tài liệu");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}
