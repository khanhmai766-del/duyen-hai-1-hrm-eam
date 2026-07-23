"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Cpu,
  Search,
  X,
  Loader2,
  Layers,
  ChevronsDownUp,
  ChevronsUpDown,
  Trash2,
  ListChecks,
  Pencil,
  Plus,
  UserRoundCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useEquipmentNode,
  useTreeRoots,
  useTreeSearch,
  fetchTreeChildren,
  treeChildrenKey,
  useNodeProfiles,
  useCreateS2Profile,
  type TreeNode,
} from "@/hooks/useEquipment";
import { machinesOf, type EquipmentMachine } from "@/lib/equipment-units";
import { useDeleteDevice, useDeleteDevices, useUpdateDevice } from "@/hooks/useDevices";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAssignPositionToEquipmentBranch,
  useEquipmentClassifications,
} from "@/hooks/usePositionSystemScopes";
import { usePositions } from "@/hooks/useUsers";
import { selectableManagingPositionOptions } from "@/lib/positions";
import { EQUIPMENT_BLOCKS } from "@/lib/constants";
import { normalizePositionScopeKey, positionScopeOptions } from "@/lib/position-system-scopes";
import type { EquipmentBranchClassification } from "@/lib/equipment-classification";

const MAX_BULK_DELETE = 500;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** Chuỗi tổ tiên (seq) của một seq — cắt dần đuôi. Dùng để bung nhánh khi deep-link. */
function ancestorSeqs(seq: string) {
  const chain: string[] = [];
  const parts = seq.split(".");
  parts.pop();
  while (parts.length) {
    chain.unshift(parts.join("."));
    parts.pop();
  }
  return chain;
}

type FlatRow = { node: TreeNode; depth: number; open: boolean; loading: boolean };

/**
 * Một dòng trong cây thiết bị. Memo hóa để khi chọn/mở một node, chỉ dòng đổi trạng
 * thái mới vẽ lại — không kéo theo cả cây.
 */
const TreeNodeRow = React.memo(function TreeNodeRow({
  node,
  depth,
  isOpen,
  isLoading,
  isSelected,
  onSelect,
  onToggle,
  canDelete,
  onDelete,
  bulkMode,
  isChecked,
  onToggleChecked,
  canEdit,
  onEdit,
}: {
  node: TreeNode;
  depth: number;
  isOpen: boolean;
  isLoading: boolean;
  isSelected: boolean;
  onSelect: (seq: string) => void;
  onToggle: (seq: string) => void;
  canDelete: boolean;
  onDelete: (node: TreeNode) => void;
  bulkMode: boolean;
  isChecked: boolean;
  onToggleChecked: (seq: string) => void;
  canEdit: boolean;
  onEdit: (node: TreeNode) => void;
}) {
  const hasKids = node.hasChildren;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(node.seq)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(node.seq);
        }
      }}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        isSelected ? "bg-accent/10 font-semibold text-accent" : "text-ink hover:bg-muted"
      )}
      style={{ paddingLeft: depth * 16 + 4 }}
    >
      {hasKids ? (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.seq);
          }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/10"
          title={isOpen ? "Thu gọn" : "Mở rộng"}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />
          )}
        </span>
      ) : (
        <span className="h-5 w-5 shrink-0" />
      )}
      {bulkMode && !hasKids && (
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => onToggleChecked(node.seq)}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 shrink-0 cursor-pointer rounded border-border text-accent focus:ring-2 focus:ring-accent/40"
          aria-label={`Chọn thiết bị ${node.name}`}
        />
      )}
      {hasKids ? (
        isOpen ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-amber-500" />
        )
      ) : (
        <Cpu className="h-4 w-4 shrink-0 text-sky-500" />
      )}
      <span className={cn("min-w-0 flex-1 truncate", hasKids && "uppercase")} title={node.name}>
        {node.name}
      </span>
      {machinesOf(node.seq)[0] === "COMMON" && (
        <span className="shrink-0 rounded bg-teal-50 px-1.5 text-[9px] font-bold uppercase tracking-wide text-teal-700 ring-1 ring-teal-200">Common</span>
      )}
      {hasKids && <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">{node.childCount}</span>}
      <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground" title={node.seq}>{node.code}</span>
      {canEdit && !bulkMode && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(node);
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-blue-50 hover:text-accent focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent/40 group-hover:opacity-100"
          title={`Chỉnh sửa tên ${node.name}`}
          aria-label={`Chỉnh sửa tên ${node.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {canDelete && !bulkMode && !hasKids && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(node);
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-red-50 hover:text-destructive focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-destructive/40 group-hover:opacity-100"
          title={`Xóa thiết bị ${node.name}`}
          aria-label={`Xóa thiết bị ${node.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});

export function EquipmentTreeView({
  canDelete = false,
  canEdit = false,
  canCreate = false,
  canAssignPosition = false,
  onCreateChild,
}: {
  canDelete?: boolean;
  canEdit?: boolean;
  canCreate?: boolean;
  canAssignPosition?: boolean;
  onCreateChild?: (node: TreeNode) => void;
}) {
  const params = useSearchParams();
  const focusSeq = params.get("focusSeq");
  const qc = useQueryClient();

  const rootsQuery = useTreeRoots();
  const roots = React.useMemo(() => rootsQuery.data?.data ?? [], [rootsQuery.data]);

  // Cây LAZY: con của từng nhánh chỉ tải khi bung. childrenBySeq tích lũy nhánh đã tải.
  const [childrenBySeq, setChildrenBySeq] = React.useState<Map<string, TreeNode[]>>(new Map());
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [loadingSeqs, setLoadingSeqs] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<TreeNode | null>(null);
  const [bulkMode, setBulkMode] = React.useState(false);
  const [checkedSeqs, setCheckedSeqs] = React.useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<TreeNode | null>(null);
  const [editName, setEditName] = React.useState("");
  const deleteDevice = useDeleteDevice();
  const deleteDevices = useDeleteDevices();
  const updateDevice = useUpdateDevice();

  const debouncedSearch = useDebouncedValue(search, 350);
  const q = debouncedSearch.trim();
  const searchActive = q.length >= 2;
  const searchQuery = useTreeSearch(q);
  const searchResults = React.useMemo(
    () => (searchQuery.data?.pages ?? []).flatMap((p) => p.data),
    [searchQuery.data]
  );

  // Tải con của 1 nút nếu chưa có (cache lại ở query + state cục bộ).
  const ensureChildren = React.useCallback(
    async (seq: string) => {
      if (childrenBySeq.has(seq)) return;
      setLoadingSeqs((s) => new Set(s).add(seq));
      try {
        const res = await fetchTreeChildren(qc, seq);
        setChildrenBySeq((prev) => new Map(prev).set(seq, res.data));
      } catch {
        toast.error("Không tải được danh mục con");
      } finally {
        setLoadingSeqs((s) => {
          const n = new Set(s);
          n.delete(seq);
          return n;
        });
      }
    },
    [qc, childrenBySeq]
  );

  const onToggle = React.useCallback(
    (seq: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(seq)) next.delete(seq);
        else {
          next.add(seq);
          void ensureChildren(seq);
        }
        return next;
      });
    },
    [ensureChildren]
  );
  const onSelect = React.useCallback((seq: string) => setSelected(seq), []);
  const onToggleChecked = React.useCallback((seq: string) => {
    setCheckedSeqs((current) => {
      const next = new Set(current);
      if (next.has(seq)) next.delete(seq);
      else if (next.size < MAX_BULK_DELETE) next.add(seq);
      else toast.error(`Chỉ được chọn tối đa ${MAX_BULK_DELETE} thiết bị mỗi lần`);
      return next;
    });
  }, []);

  // Toàn bộ node đã tải (roots + con đã bung + kết quả tìm) — để tra selected/tổ tiên.
  const nodesBySeq = React.useMemo(() => {
    const m = new Map<string, TreeNode>();
    for (const r of roots) m.set(r.seq, r);
    for (const arr of childrenBySeq.values()) for (const n of arr) m.set(n.seq, n);
    for (const n of searchResults) if (!m.has(n.seq)) m.set(n.seq, n);
    return m;
  }, [roots, childrenBySeq, searchResults]);

  const selectedNode = selected ? nodesBySeq.get(selected) ?? null : null;
  const ancestors = React.useMemo(() => {
    if (!selectedNode) return [];
    const path: TreeNode[] = [];
    let p = selectedNode.parentSeq;
    while (p && nodesBySeq.has(p)) {
      const n = nodesBySeq.get(p)!;
      path.unshift(n);
      p = n.parentSeq;
    }
    return path;
  }, [selectedNode, nodesBySeq]);

  // Deep-link (?focusSeq=…): bung tất cả tổ tiên rồi chọn + cuộn tới.
  React.useEffect(() => {
    if (!focusSeq) return;
    let cancelled = false;
    (async () => {
      for (const anc of ancestorSeqs(focusSeq)) {
        if (cancelled) return;
        setExpanded((e) => new Set(e).add(anc));
        await ensureChildren(anc);
      }
      if (!cancelled) setSelected(focusSeq);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq]);

  // Sau khi bung 1 nhánh gốc → tải con của nó.
  const expandAllRoots = React.useCallback(() => {
    setExpanded(new Set(roots.map((r) => r.seq)));
    for (const r of roots) if (r.hasChildren) void ensureChildren(r.seq);
  }, [roots, ensureChildren]);

  // Làm mới 1 nhánh sau khi sửa/xóa (con của parentSeq đổi).
  const refreshBranch = React.useCallback(
    async (parentSeq: string | null) => {
      qc.invalidateQueries({ queryKey: ["equipment-tree", "roots"] });
      qc.invalidateQueries({ queryKey: ["equipment-tree", "search"] });
      if (!parentSeq) return;
      qc.removeQueries({ queryKey: treeChildrenKey(parentSeq) });
      if (childrenBySeq.has(parentSeq)) {
        try {
          const res = await fetchTreeChildren(qc, parentSeq);
          setChildrenBySeq((prev) => new Map(prev).set(parentSeq, res.data));
        } catch {
          /* bỏ qua */
        }
      }
    },
    [qc, childrenBySeq]
  );

  // Danh sách dòng hiển thị: chế độ tìm kiếm = kết quả phẳng; ngược lại = cây đang bung.
  const flatRows = React.useMemo<FlatRow[]>(() => {
    if (searchActive) {
      return searchResults.map((node) => ({ node, depth: 0, open: false, loading: false }));
    }
    const rows: FlatRow[] = [];
    const walk = (list: TreeNode[], depth: number) => {
      for (const n of list) {
        const open = expanded.has(n.seq);
        rows.push({ node: n, depth, open, loading: loadingSeqs.has(n.seq) });
        if (n.hasChildren && open) {
          const kids = childrenBySeq.get(n.seq);
          if (kids) walk(kids, depth + 1);
        }
      }
    };
    walk(roots, 0);
    return rows;
  }, [searchActive, searchResults, roots, expanded, childrenBySeq, loadingSeqs]);

  const selectableSeqs = React.useMemo(
    () => flatRows.filter((row) => !row.node.hasChildren).map((row) => row.node.seq),
    [flatRows]
  );
  const selectableBatch = React.useMemo(() => selectableSeqs.slice(0, MAX_BULK_DELETE), [selectableSeqs]);
  const allVisibleChecked = selectableBatch.length > 0 && selectableBatch.every((seq) => checkedSeqs.has(seq));

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 12,
    getItemKey: (index) => flatRows[index]?.node.seq ?? index,
  });

  React.useEffect(() => {
    if (!focusSeq || searchActive) return;
    const idx = flatRows.findIndex((r) => r.node.seq === focusSeq);
    if (idx >= 0) rowVirtualizer.scrollToIndex(idx, { align: "center" });
  }, [focusSeq, flatRows, rowVirtualizer, searchActive]);

  const isLoading = rootsQuery.isLoading;
  const showSearchLoading = searchActive && searchQuery.isLoading;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, số thứ tự, KKS…"
              className="h-9 pl-9 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-ink"
                aria-label="Xoá tìm kiếm"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {!searchActive && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={expandAllRoots}
                title="Mở nhóm gốc"
                className="flex h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent hover:text-accent"
              >
                <ChevronsUpDown className="h-4 w-4" /> Mở gốc
              </button>
              <button
                type="button"
                onClick={() => setExpanded(new Set())}
                title="Thu gọn tất cả"
                className="flex h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent hover:text-accent"
              >
                <ChevronsDownUp className="h-4 w-4" /> Thu gọn
              </button>
            </div>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => {
                setBulkMode((active) => !active);
                setCheckedSeqs(new Set());
              }}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                bulkMode ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:border-accent hover:text-accent"
              )}
              aria-pressed={bulkMode}
            >
              <ListChecks className="h-4 w-4" /> {bulkMode ? "Hủy chọn" : "Chọn nhiều"}
            </button>
          )}
        </div>

        {bulkMode && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-slate-50 px-3 py-2 text-xs">
            <button
              type="button"
              disabled={selectableSeqs.length === 0}
              onClick={() => setCheckedSeqs((current) => {
                const next = new Set(current);
                if (allVisibleChecked) selectableBatch.forEach((seq) => next.delete(seq));
                else selectableBatch.forEach((seq) => {
                  if (next.size < MAX_BULK_DELETE) next.add(seq);
                });
                return next;
              })}
              className="rounded-md border border-border bg-white px-2.5 py-1.5 font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allVisibleChecked
                ? "Bỏ chọn mục đang hiển thị"
                : `Chọn ${Math.min(selectableSeqs.length, MAX_BULK_DELETE).toLocaleString("vi-VN")} mục đang hiển thị`}
            </button>
            <span className="font-semibold text-ink">Đã chọn {checkedSeqs.size.toLocaleString("vi-VN")} thiết bị</span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="ml-auto h-8"
              disabled={checkedSeqs.size === 0 || deleteDevices.isPending}
              onClick={() => setBulkConfirmOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Xóa mục đã chọn
            </Button>
          </div>
        )}

        <div ref={scrollRef} className="max-h-[68vh] min-h-[340px] overflow-y-auto p-2">
          {isLoading || showSearchLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : searchActive && flatRows.length === 0 ? (
            <div className="py-20 text-center text-sm text-muted-foreground">Không tìm thấy thiết bị phù hợp.</div>
          ) : !searchActive && roots.length === 0 ? (
            <div className="py-20 text-center text-sm text-muted-foreground">Chưa có dữ liệu cây thiết bị.</div>
          ) : (
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
              {rowVirtualizer.getVirtualItems().map((vi) => {
                const row = flatRows[vi.index];
                if (!row) return null;
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={rowVirtualizer.measureElement}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
                  >
                    <TreeNodeRow
                      node={row.node}
                      depth={row.depth}
                      isOpen={row.open}
                      isLoading={row.loading}
                      isSelected={selected === row.node.seq}
                      onSelect={onSelect}
                      onToggle={onToggle}
                      canDelete={canDelete}
                      onDelete={setDeleteTarget}
                      bulkMode={bulkMode}
                      isChecked={checkedSeqs.has(row.node.seq)}
                      onToggleChecked={onToggleChecked}
                      canEdit={canEdit}
                      onEdit={(node) => {
                        setEditTarget(node);
                        setEditName(node.name);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {searchActive && searchQuery.hasNextPage && (
            <div className="flex justify-center py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={searchQuery.isFetchingNextPage}
                onClick={() => searchQuery.fetchNextPage()}
              >
                {searchQuery.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
                Tải thêm kết quả
              </Button>
            </div>
          )}
        </div>

        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {searchActive
            ? `${searchResults.length.toLocaleString("vi-VN")} kết quả${searchQuery.hasNextPage ? "+" : ""}`
            : `${roots.length.toLocaleString("vi-VN")} nhóm gốc · tải theo nhánh`}
        </div>
      </Card>

      <Card className="p-4">
        {selectedNode ? (
          <DetailPanel
            node={selectedNode}
            ancestors={ancestors}
            onSelect={setSelected}
            canCreate={canCreate}
            canAssignPosition={canAssignPosition}
            onCreateChild={onCreateChild}
          />
        ) : (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Layers className="h-9 w-9 text-muted-foreground/40" />
            Chọn thiết bị trong thư mục để xem chi tiết.
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Xóa thiết bị khỏi cây?"
        description={deleteTarget ? `Bạn chắc chắn muốn xóa “${deleteTarget.seq} — ${deleteTarget.name}”? Dữ liệu liên quan của thiết bị cũng có thể bị xóa và thao tác này không thể hoàn tác.` : undefined}
        confirmLabel="Xóa thiết bị"
        loading={deleteDevice.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            const parentSeq = deleteTarget.parentSeq;
            await deleteDevice.mutateAsync(deleteTarget.seq);
            if (selected === deleteTarget.seq) setSelected(null);
            toast.success(`Đã xóa thiết bị ${deleteTarget.seq} — ${deleteTarget.name}`);
            setDeleteTarget(null);
            await refreshBranch(parentSeq);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Không thể xóa thiết bị");
          }
        }}
      />
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open && !updateDevice.isPending) {
            setEditTarget(null);
            setEditName("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa tên thiết bị</DialogTitle>
            <DialogDescription>
              Số thứ tự <span className="font-mono font-semibold text-ink">{editTarget?.seq}</span> được giữ nguyên.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!editTarget) return;
              const name = editName.trim();
              if (!name) return toast.error("Tên thiết bị không được để trống");
              if (name.length > 200) return toast.error("Tên thiết bị không được vượt quá 200 ký tự");
              if (name === editTarget.name) {
                setEditTarget(null);
                setEditName("");
                return;
              }
              try {
                const parentSeq = editTarget.parentSeq;
                await updateDevice.mutateAsync({ id: editTarget.seq, name });
                toast.success(`Đã cập nhật tên thiết bị ${editTarget.seq}`);
                setEditTarget(null);
                setEditName("");
                await refreshBranch(parentSeq);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Không thể cập nhật tên thiết bị");
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="equipment-name">Tên thiết bị</Label>
              <Input
                id="equipment-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                maxLength={200}
                autoFocus
                disabled={updateDevice.isPending}
                placeholder="Nhập tên thiết bị"
              />
              <div className="text-right text-xs text-muted-foreground">{editName.length}/200 ký tự</div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={updateDevice.isPending}
                onClick={() => {
                  setEditTarget(null);
                  setEditName("");
                }}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={updateDevice.isPending || !editName.trim()}>
                {updateDevice.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Lưu tên
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={bulkConfirmOpen}
        onOpenChange={setBulkConfirmOpen}
        title={`Xóa ${checkedSeqs.size.toLocaleString("vi-VN")} thiết bị đã chọn?`}
        description="Các thiết bị và dữ liệu liên quan sẽ bị xóa khỏi cây. Thao tác này không thể hoàn tác."
        confirmLabel={`Xóa ${checkedSeqs.size.toLocaleString("vi-VN")} thiết bị`}
        loading={deleteDevices.isPending}
        onConfirm={async () => {
          const ids = [...checkedSeqs];
          if (ids.length === 0) return;
          try {
            const parentSeqs = new Set(ids.map((seq) => nodesBySeq.get(seq)?.parentSeq ?? null));
            const result = await deleteDevices.mutateAsync(ids);
            if (selected && checkedSeqs.has(selected)) setSelected(null);
            setCheckedSeqs(new Set());
            setBulkConfirmOpen(false);
            setBulkMode(false);
            toast.success(`Đã xóa ${result.count.toLocaleString("vi-VN")} thiết bị`);
            for (const p of parentSeqs) await refreshBranch(p);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Không thể xóa các thiết bị đã chọn");
          }
        }}
      />
    </div>
  );
}

function DetailPanel({
  node,
  ancestors,
  onSelect,
  canCreate,
  canAssignPosition,
  onCreateChild,
}: {
  node: TreeNode;
  ancestors: TreeNode[];
  onSelect: (seq: string) => void;
  canCreate: boolean;
  canAssignPosition: boolean;
  onCreateChild?: (node: TreeNode) => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const isGroup = node.hasChildren;
  const detailQuery = useEquipmentNode(node.seq);
  const detail = detailQuery.data?.data ?? null;
  // Hồ sơ theo tổ máy trên cây dùng chung: COMMON (nhánh 5,6) hoặc S1/S2 (nhánh còn lại).
  const machines = machinesOf(node.seq);
  const profilesQuery = useNodeProfiles(node.seq);
  const profiles = React.useMemo(() => profilesQuery.data?.data ?? [], [profilesQuery.data]);
  const createS2 = useCreateS2Profile();
  const requestedMachine = params.get("machine")?.toUpperCase() as EquipmentMachine | undefined;
  const [activeMachine, setActiveMachine] = React.useState<EquipmentMachine>(() =>
    requestedMachine && machines.includes(requestedMachine) ? requestedMachine : machines[0]
  );
  React.useEffect(() => {
    const nextMachines = machinesOf(node.seq);
    setActiveMachine((current) => nextMachines.includes(current) ? current : nextMachines[0]);
  }, [node.seq]);
  const active = profiles.find((p) => p.machine === activeMachine) ?? null;
  const s2Missing = activeMachine === "S2" && active !== null && !active.exists;

  return (
    <div className="space-y-4">
      {ancestors.length > 0 && (
        <div className="flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground">
          {ancestors.map((a) => (
            <React.Fragment key={a.seq}>
              <button
                type="button"
                onClick={() => onSelect(a.seq)}
                className="max-w-[150px] truncate rounded px-1 py-0.5 hover:bg-muted hover:text-ink"
                title={a.name}
              >
                {a.name}
              </button>
              <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            isGroup ? "bg-amber-50 text-amber-600" : "bg-sky-50 text-sky-600"
          )}
        >
          {isGroup ? <Folder className="h-5 w-5" /> : <Cpu className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <div className="text-lg font-bold leading-tight text-ink">{node.name}</div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">Mã: {node.code}</div>
        </div>
      </div>

      {machines.length > 1 ? (
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1" role="tablist" aria-label="Hồ sơ theo tổ máy">
          {machines.map((m) => {
            const p = profiles.find((x) => x.machine === m);
            const selected = activeMachine === m;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveMachine(m)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors",
                  selected ? "bg-white text-accent shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-ink"
                )}
              >
                {m}
                {m === "S2" && p && !p.exists && <span className="ml-1 font-medium text-muted-foreground">· chưa có</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <span className="inline-flex w-fit items-center rounded-md bg-teal-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-700 ring-1 ring-teal-200">
          Common — dùng chung 2 tổ máy
        </span>
      )}

      {s2Missing && (
        <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
          <div>Chưa có hồ sơ S2 cho vị trí này. Tạo hồ sơ S2 sẽ dùng mã <span className="font-mono font-semibold text-ink">{active?.code}</span>{active?.kks ? <> · KKS <span className="font-mono font-semibold text-ink">{active.kks}</span></> : null} (dẫn xuất từ S1) và KHÔNG sao chép lịch sử/QR/khiếm khuyết/vật tư của S1.</div>
          {canCreate && (
            <Button
              type="button"
              size="sm"
              disabled={createS2.isPending}
              onClick={async () => {
                try {
                  await createS2.mutateAsync(node.seq);
                  toast.success(`Đã tạo hồ sơ S2 — ${active?.code}`);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Không thể tạo hồ sơ S2");
                }
              }}
            >
              {createS2.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Tạo hồ sơ S2 từ S1
            </Button>
          )}
        </div>
      )}

      <div className="space-y-2">
        <DetailRow label="Mã thiết bị" value={active?.code ?? node.seq} mono />
        {(active?.kks ?? node.kks) && <DetailRow label="Mã KKS" value={(active?.kks ?? node.kks)!} />}
        <DetailRow label="Bản vẽ liên quan" value={detail?.drawing || "—"} />
        <DetailRow label="Phân loại" value={isGroup ? `Nhóm — ${node.childCount} thiết bị con` : "Thiết bị"} />
      </div>

      {canAssignPosition && <BranchPositionAssignment node={node} />}

      {canCreate && node.depth < 16 && onCreateChild && (
        <Button
          type="button"
          variant="outline"
          className="w-full border-accent/40 text-accent hover:border-accent hover:bg-accent/5 hover:text-accent"
          onClick={() => onCreateChild(node)}
        >
          <Plus className="h-4 w-4" />
          Thêm mới trong hệ thống này
        </Button>
      )}

      {detailQuery.isLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải thông tin chi tiết...
        </div>
      )}

      {active && !s2Missing && (
        <div className="space-y-3">
          {active.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={active.imageUrl} alt={active.name} className="aspect-[4/3] w-full rounded-lg border border-border object-cover" />
          )}
          {active.attachedInfo && <DetailRow label="Thông tin thêm" value={active.attachedInfo} />}
          {active.documentUrl && (
            <a href={active.documentUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-accent hover:underline">
              Mở tài liệu đính kèm
            </a>
          )}
        </div>
      )}

      <Button
        className="w-full"
        onClick={() => router.push(`/devices/${encodeURIComponent(node.seq)}?machine=${activeMachine}`)}
      >
        Xem lý lịch thiết bị
      </Button>
    </div>
  );
}

function nearestBranchAssignment(seq: string, classifications: EquipmentBranchClassification[]) {
  let current = seq;
  while (current) {
    const row = classifications.find((item) => item.systemSeq === current);
    if (row?.block || row?.managingPosition) {
      return { block: row.block, manager: row.managingPosition, sourceSeq: current };
    }
    const parts = current.split(".");
    parts.pop();
    current = parts.join(".");
  }
  return { block: null, manager: null, sourceSeq: null };
}

function BranchPositionAssignment({ node }: { node: TreeNode }) {
  const allPositions = usePositions();
  const positions = React.useMemo(
    () => positionScopeOptions(selectableManagingPositionOptions(allPositions)),
    [allPositions]
  );
  const classificationsQuery = useEquipmentClassifications();
  const classifications = React.useMemo(
    () => classificationsQuery.data?.data ?? [],
    [classificationsQuery.data]
  );
  const inherited = React.useMemo(
    () => nearestBranchAssignment(node.seq, classifications),
    [node.seq, classifications]
  );
  const direct = React.useMemo(
    () => nearestBranchAssignment(node.seq, classifications.filter((item) => item.systemSeq === node.seq)),
    [node.seq, classifications]
  );
  const [assignmentType, setAssignmentType] = React.useState<"block" | "position">("block");
  const [value, setValue] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const assign = useAssignPositionToEquipmentBranch();

  React.useEffect(() => {
    if (direct.block) {
      setAssignmentType("block");
      setValue(direct.block);
    } else if (direct.manager) {
      setAssignmentType("position");
      setValue(positions.find((item) => normalizePositionScopeKey(item) === normalizePositionScopeKey(direct.manager)) ?? direct.manager);
    } else {
      setAssignmentType("block");
      setValue("");
    }
  }, [direct.block, direct.manager, node.seq, positions]);

  const effectiveBlock = inherited.block ?? "";
  const isInherited = Boolean(inherited.sourceSeq && inherited.sourceSeq !== node.seq);

  return (
    <div className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700">
          <UserRoundCog className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink">Phân loại thiết bị</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Chọn khối hoặc cương vị phụ trách để tra cứu. Thông tin này không cấp quyền xem hay chỉnh sửa.
          </p>
        </div>
      </div>
      {(effectiveBlock || inherited.manager) && (
        <div className="space-y-1 rounded-lg bg-white px-3 py-2 text-xs text-muted-foreground ring-1 ring-cyan-100">
          {effectiveBlock && <div>Khối thiết bị: <span className="font-semibold text-cyan-800">{effectiveBlock}</span>{isInherited ? " · kế thừa" : ""}</div>}
          {inherited.manager && <div>Cương vị quản lý: <span className="font-semibold text-cyan-800">{inherited.manager}</span>{isInherited ? " · kế thừa" : ""}</div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-cyan-100/70 p-1">
        <button
          type="button"
          onClick={() => { setAssignmentType("block"); setValue(""); }}
          className={cn("rounded-md px-2 py-1.5 text-xs font-semibold transition-colors", assignmentType === "block" ? "bg-white text-cyan-800 shadow-sm" : "text-muted-foreground")}
        >
          Khối thiết bị
        </button>
        <button
          type="button"
          onClick={() => { setAssignmentType("position"); setValue(""); }}
          className={cn("rounded-md px-2 py-1.5 text-xs font-semibold transition-colors", assignmentType === "position" ? "bg-white text-cyan-800 shadow-sm" : "text-muted-foreground")}
        >
          Cương vị quản lý
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className="h-9 flex-1 bg-white">
            <SelectValue placeholder={assignmentType === "block" ? "Chọn khối" : "Chọn một cương vị"} />
          </SelectTrigger>
          <SelectContent>
            {(assignmentType === "block" ? [...EQUIPMENT_BLOCKS] : positions).map((item) => (
              <SelectItem key={item} value={item}>{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          className="h-9 shrink-0"
          disabled={!value || assign.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {assign.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Áp dụng cho toàn nhánh
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Phân loại “${value}” cho toàn nhánh?`}
        description={assignmentType === "block"
          ? `Nút “${node.name}” và các thiết bị con sẽ được phân loại thuộc ${value}. Thao tác này không thay đổi quyền truy cập.`
          : `“${value}” sẽ là cương vị phụ trách của nút “${node.name}” và được kế thừa khi hiển thị cho các thiết bị con. Thao tác này không thay đổi quyền truy cập.`}
        confirmLabel="Xác nhận phân loại"
        loading={assign.isPending}
        onConfirm={async () => {
          try {
            const result = await assign.mutateAsync({ seq: node.seq, assignmentType, value });
            setConfirmOpen(false);
            toast.success(
              `Đã phân loại ${result.value} cho ${result.affectedNodes.toLocaleString("vi-VN")} thiết bị/nhóm`
            );
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Không thể lưu phân loại thiết bị");
          }
        }}
      />
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 text-sm">
      <div className="font-semibold text-muted-foreground">{label}</div>
      <div className={cn("min-w-0 break-words text-ink", mono && "font-mono text-[13px]")}>{value}</div>
    </div>
  );
}
