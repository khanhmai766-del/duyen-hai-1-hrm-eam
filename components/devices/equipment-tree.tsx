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
  Pencil,
  Plus,
  FolderInput,
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
  type TreeNode,
  useMoveEquipmentNode,
  useUpdateEquipmentProfile,
} from "@/hooks/useEquipment";
import {
  branchOf,
  defaultScopeOf,
  parseScope,
  seqInScope,
  TREE_SCOPES,
  type TreeScope,
} from "@/lib/equipment-units";
import { useDeleteDevice, useUpdateDevice } from "@/hooks/useDevices";
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
import { EquipmentTreePicker, type PickerEquipmentNode } from "@/components/devices/equipment-tree-picker";

// Cấu trúc cây là DÙNG CHUNG cho 2 tổ máy (S2 là hình chiếu của cùng bộ node), nên mọi
// thao tác thêm/sửa/xoá thiết bị đều ảnh hưởng cả hai — phải nói rõ trước khi người dùng bấm.
const BOTH_UNITS_NOTE = "Cấu trúc cây dùng chung cho 2 tổ máy: thay đổi này áp dụng cho CẢ Tổ máy S1 và Tổ máy S2.";

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Chuỗi tổ tiên (seq) của một seq — cắt dần đuôi. Dùng để bung nhánh khi deep-link.
 * Bỏ các cấp KHÔNG còn là nút trên cây sau khi tách phạm vi (gốc nhà máy "DH1.S1" và
 * "DH1") để không bắn request bung nhánh vô ích.
 */
function ancestorSeqs(seq: string) {
  const chain: string[] = [];
  const parts = seq.split(".");
  parts.pop();
  while (parts.length) {
    chain.unshift(parts.join("."));
    parts.pop();
  }
  return chain.filter((s) => branchOf(s) !== null);
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
  canEdit,
  onEdit,
  canMove,
  onMove,
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
  canEdit: boolean;
  onEdit: (node: TreeNode) => void;
  canMove: boolean;
  onMove: (node: TreeNode) => void;
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
      {hasKids ? (
        isOpen ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-amber-500" />
        )
      ) : (
        <Cpu className="h-4 w-4 shrink-0 text-sky-500" />
      )}
      {node.machine !== "COMMON" && (
        <span
          className={cn(
            "inline-flex h-5 min-w-7 shrink-0 items-center justify-center rounded-md px-1.5 text-[9px] font-extrabold leading-none tracking-wide ring-1",
            node.machine === "S1" ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-orange-50 text-orange-700 ring-orange-200"
          )}
          title={`Thiết bị Tổ máy ${node.machine}`}
        >
          {node.machine}
        </span>
      )}
      <span className={cn("min-w-0 flex-1 truncate", hasKids && "uppercase")} title={node.name}>
        {node.name}
      </span>
      {hasKids && <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">{node.childCount}</span>}
      <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground" title={node.fullCode}>{node.code}</span>
      {canEdit && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(node);
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-blue-50 hover:text-accent focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent/40 group-hover:opacity-100"
          title={`Chỉnh sửa tên và KKS ${node.name}`}
          aria-label={`Chỉnh sửa tên và KKS ${node.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {canMove && node.parentSeq !== null && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onMove(node);
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-amber-50 hover:text-amber-700 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-amber-400/40 group-hover:opacity-100"
          title={`Di chuyển ${node.name}`}
          aria-label={`Di chuyển ${node.name}`}
        >
          <FolderInput className="h-3.5 w-3.5" />
        </button>
      )}
      {canDelete && !hasKids && node.parentSeq !== null && (
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

type TreeViewProps = {
  canDelete?: boolean;
  canEdit?: boolean;
  canCreate?: boolean;
  canMove?: boolean;
  onCreateChild?: (node: TreeNode) => void;
};

/**
 * Ba cây riêng biệt (Tổ máy S1 · Tổ máy S2 · Dùng chung) trên cùng MỘT bộ node vật lý.
 * Phạm vi nằm ở URL (?scope=) và được truyền xuống thân cây qua `key` → đổi phạm vi thì
 * state bung/chọn dựng lại sạch và chỉ một cây nằm trong RAM, còn dữ liệu vẫn nằm trong
 * cache TanStack Query (khoá theo phạm vi) nên hiện lại tức thì, không gọi lại API.
 */
export function EquipmentTreeView(props: TreeViewProps) {
  const router = useRouter();
  const params = useSearchParams();
  const focusSeq = params.get("focusSeq");
  const requested = parseScope(params.get("scope"));
  // Deep-link tới thiết bị không thuộc phạm vi được yêu cầu (vd nhánh dùng chung mà
  // ?scope=S1) → mở đúng cây của thiết bị đó thay vì hiện cây rỗng.
  const scope = focusSeq && !seqInScope(focusSeq, requested) ? defaultScopeOf(focusSeq) : requested;

  const setScope = React.useCallback(
    (next: TreeScope) => {
      const sp = new URLSearchParams(params.toString());
      sp.set("scope", next);
      sp.delete("focusSeq"); // thiết bị đang trỏ tới thuộc cây cũ
      router.replace(`/devices?${sp.toString()}`, { scroll: false });
    },
    [params, router]
  );

  return <TreeScopeBody key={scope} scope={scope} onScopeChange={setScope} {...props} />;
}

function TreeScopeBody({
  scope,
  onScopeChange,
  canDelete = false,
  canEdit = false,
  canCreate = false,
  canMove = false,
  onCreateChild,
}: TreeViewProps & { scope: TreeScope; onScopeChange: (scope: TreeScope) => void }) {
  const params = useSearchParams();
  const focusSeq = params.get("focusSeq");
  const qc = useQueryClient();

  const rootsQuery = useTreeRoots(scope);
  const roots = React.useMemo(() => rootsQuery.data?.data ?? [], [rootsQuery.data]);

  // Cây LAZY: con của từng nhánh chỉ tải khi bung. childrenBySeq tích lũy nhánh đã tải.
  const [childrenBySeq, setChildrenBySeq] = React.useState<Map<string, TreeNode[]>>(new Map());
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [loadingSeqs, setLoadingSeqs] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<TreeNode | null>(null);
  const [editTarget, setEditTarget] = React.useState<TreeNode | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editKks, setEditKks] = React.useState("");
  const [moveTarget, setMoveTarget] = React.useState<TreeNode | null>(null);
  const [moveDestination, setMoveDestination] = React.useState<PickerEquipmentNode | null>(null);
  const deleteDevice = useDeleteDevice();
  const updateDevice = useUpdateDevice();
  const moveNode = useMoveEquipmentNode();
  const updateProfile = useUpdateEquipmentProfile();
  const editDetailQuery = useEquipmentNode(editTarget?.seq, scope);
  const editDetail = editDetailQuery.data?.data ?? null;
  const editPending = updateDevice.isPending || updateProfile.isPending;

  const debouncedSearch = useDebouncedValue(search, 350);
  const q = debouncedSearch.trim();
  const searchActive = q.length >= 2;
  const searchQuery = useTreeSearch(q, scope);
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
        const res = await fetchTreeChildren(qc, scope, seq);
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
    [qc, scope, childrenBySeq]
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
      // Cấu trúc dùng chung: sửa/xóa ở một phạm vi làm cả 3 cây đổi theo → bỏ cache cả 3.
      qc.invalidateQueries({ queryKey: ["equipment-tree", "roots"] });
      qc.invalidateQueries({ queryKey: ["equipment-tree", "search"] });
      if (!parentSeq) return;
      for (const s of TREE_SCOPES) qc.removeQueries({ queryKey: treeChildrenKey(s.key, parentSeq) });
      if (childrenBySeq.has(parentSeq)) {
        try {
          const res = await fetchTreeChildren(qc, scope, parentSeq);
          setChildrenBySeq((prev) => new Map(prev).set(parentSeq, res.data));
        } catch {
          /* bỏ qua */
        }
      }
    },
    [qc, scope, childrenBySeq]
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
        <div
          className="flex items-center gap-1 border-b border-border bg-muted/40 p-1.5"
          role="tablist"
          aria-label="Phạm vi cây thiết bị"
        >
          {TREE_SCOPES.map((s) => {
            const selected = scope === s.key;
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onScopeChange(s.key)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors",
                  selected
                    ? "bg-white text-accent shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-ink"
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, số thứ tự, KKS…"
              className="h-9 rounded-xl pl-9 pr-8"
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
                className="flex h-9 items-center gap-1.5 rounded-xl border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent hover:text-accent"
              >
                <ChevronsUpDown className="h-4 w-4" /> Mở gốc
              </button>
              <button
                type="button"
                onClick={() => setExpanded(new Set())}
                title="Thu gọn tất cả"
                className="flex h-9 items-center gap-1.5 rounded-xl border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent hover:text-accent"
              >
                <ChevronsDownUp className="h-4 w-4" /> Thu gọn
              </button>
            </div>
          )}
        </div>

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
                      canEdit={canEdit}
                      onEdit={(node) => {
                        setEditTarget(node);
                        setEditName(node.name);
                        setEditKks(node.kks ?? "");
                      }}
                      canMove={canMove}
                      onMove={(node) => {
                        setMoveTarget(node);
                        setMoveDestination(null);
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
            scope={scope}
            ancestors={ancestors}
            onSelect={setSelected}
            canCreate={canCreate}
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
        description={deleteTarget ? `Bạn chắc chắn muốn xóa “${deleteTarget.fullCode} — ${deleteTarget.name}”? Dữ liệu liên quan của thiết bị cũng có thể bị xóa và thao tác này không thể hoàn tác. ${BOTH_UNITS_NOTE}` : undefined}
        confirmLabel="Xóa thiết bị"
        loading={deleteDevice.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            const parentSeq = deleteTarget.parentSeq;
            await deleteDevice.mutateAsync(deleteTarget.seq);
            if (selected === deleteTarget.seq) setSelected(null);
            toast.success(`Đã xóa thiết bị ${deleteTarget.fullCode} — ${deleteTarget.name}`);
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
          if (!open && !editPending) {
            setEditTarget(null);
            setEditName("");
            setEditKks("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {scope === "COMMON" ? "Chỉnh sửa tên thiết bị" : `Tên và KKS riêng cho Tổ máy ${scope}`}
            </DialogTitle>
            <DialogDescription>
              {scope === "COMMON" ? (
                <>Số thứ tự <span className="font-mono font-semibold text-ink">{editTarget?.fullCode}</span> được giữ nguyên.</>
              ) : (
                <>
                  Thông tin này chỉ hiển thị tại cây <span className="font-semibold text-ink">Tổ máy {scope}</span>; tổ máy còn lại không thay đổi.
                </>
              )}
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
              const kks = editKks.trim();
              if (scope === "COMMON" && name === editTarget.name) {
                setEditTarget(null);
                setEditName("");
                setEditKks("");
                return;
              }
              try {
                const parentSeq = editTarget.parentSeq;
                if (scope === "COMMON") {
                  await updateDevice.mutateAsync({ id: editTarget.seq, name });
                } else {
                  await updateProfile.mutateAsync({ seq: editTarget.seq, machine: scope, name, kks: kks || null });
                }
                toast.success(scope === "COMMON" ? `Đã cập nhật tên thiết bị ${editTarget.fullCode}` : `Đã lưu tên và KKS riêng cho Tổ máy ${scope}`);
                setEditTarget(null);
                setEditName("");
                setEditKks("");
                await refreshBranch(parentSeq);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Không thể cập nhật tên thiết bị");
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="equipment-name">{scope === "COMMON" ? "Tên thiết bị" : `Tên hiển thị tại ${scope}`}</Label>
              <Input
                id="equipment-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                maxLength={200}
                autoFocus
                disabled={editPending}
                placeholder="Nhập tên thiết bị"
              />
              <div className="text-right text-xs text-muted-foreground">{editName.length}/200 ký tự</div>
              {scope !== "COMMON" && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-800">
                  Tên dùng chung hiện tại: <span className="font-semibold">{editDetail?.baseName ?? "Đang tải…"}</span>
                </div>
              )}
            </div>
            {scope !== "COMMON" && (
              <div className="space-y-2 border-t border-border pt-4">
                <Label htmlFor="equipment-kks">Mã KKS hiển thị tại {scope}</Label>
                <Input
                  id="equipment-kks"
                  value={editKks}
                  onChange={(event) => setEditKks(event.target.value)}
                  maxLength={100}
                  disabled={editPending}
                  placeholder="Nhập mã KKS riêng, ví dụ A0…"
                  className="font-mono"
                />
                <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    KKS mặc định: <span className="font-mono font-semibold text-ink">{editDetailQuery.isLoading ? "Đang tải…" : editDetail?.baseKks ?? "Chưa có"}</span>
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto shrink-0 p-0 text-xs"
                    disabled={editPending || editDetailQuery.isLoading || !editDetail?.hasKksOverride}
                    onClick={async () => {
                      if (!editTarget) return;
                      try {
                        const parentSeq = editTarget.parentSeq;
                        await updateProfile.mutateAsync({ seq: editTarget.seq, machine: scope, kks: null });
                        toast.success(`Đã dùng lại KKS mặc định cho Tổ máy ${scope}`);
                        setEditTarget(null);
                        setEditName("");
                        setEditKks("");
                        await refreshBranch(parentSeq);
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Không thể xóa KKS riêng");
                      }
                    }}
                  >
                    Dùng lại KKS mặc định
                  </Button>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              {scope !== "COMMON" && (
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:mr-auto"
                  disabled={editPending || editDetailQuery.isLoading || !editDetail?.hasNameOverride}
                  onClick={async () => {
                    if (!editTarget) return;
                    try {
                      const parentSeq = editTarget.parentSeq;
                      await updateProfile.mutateAsync({ seq: editTarget.seq, machine: scope, name: null });
                      toast.success(`Đã dùng lại tên chung cho Tổ máy ${scope}`);
                      setEditTarget(null);
                      setEditName("");
                      setEditKks("");
                      await refreshBranch(parentSeq);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Không thể xóa tên riêng");
                    }
                  }}
                >
                  Dùng lại tên chung
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={editPending}
                onClick={() => {
                  setEditTarget(null);
                  setEditName("");
                  setEditKks("");
                }}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={editPending || !editName.trim()}>
                {editPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {scope === "COMMON" ? "Lưu tên" : `Lưu tên và KKS cho ${scope}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!moveTarget}
        onOpenChange={(open) => {
          if (!open && !moveNode.isPending) {
            setMoveTarget(null);
            setMoveDestination(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Di chuyển thiết bị hoặc thư mục</DialogTitle>
            <DialogDescription>
              Chọn vị trí cha mới cho “{moveTarget?.name}”. Toàn bộ thiết bị con và dữ liệu liên quan sẽ được chuyển theo. {BOTH_UNITS_NOTE}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Thư mục đích</Label>
            <EquipmentTreePicker
              value={moveDestination?.seq ?? ""}
              onChange={setMoveDestination}
              scope={scope}
              includeLeaves
              maxSelectableDepth={15}
              placeholder="Chọn thư mục hoặc thiết bị cha mới"
              disabled={moveNode.isPending}
            />
            {moveDestination && (
              <p className="text-xs text-muted-foreground">
                Vị trí mới: <span className="font-semibold text-ink">{moveDestination.name}</span> · {moveDestination.fullCode}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={moveNode.isPending} onClick={() => setMoveTarget(null)}>
              Hủy
            </Button>
            <Button
              type="button"
              disabled={!moveDestination || moveNode.isPending}
              onClick={async () => {
                if (!moveTarget || !moveDestination) return;
                try {
                  const oldParent = moveTarget.parentSeq;
                  const result = await moveNode.mutateAsync({ sourceSeq: moveTarget.seq, targetParentSeq: moveDestination.seq });
                  toast.success(`Đã di chuyển ${result.movedCount.toLocaleString("vi-VN")} mục sang ${moveDestination.name}`);
                  setMoveTarget(null);
                  setMoveDestination(null);
                  setSelected(result.seq);
                  setChildrenBySeq(new Map());
                  setExpanded(new Set());
                  await Promise.all([refreshBranch(oldParent), refreshBranch(result.targetParentSeq)]);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Không thể di chuyển thiết bị");
                }
              }}
            >
              {moveNode.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderInput className="h-4 w-4" />}
              Di chuyển
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailPanel({
  node,
  scope,
  ancestors,
  onSelect,
  canCreate,
  onCreateChild,
}: {
  node: TreeNode;
  scope: TreeScope;
  ancestors: TreeNode[];
  onSelect: (seq: string) => void;
  canCreate: boolean;
  onCreateChild?: (node: TreeNode) => void;
}) {
  const router = useRouter();
  const isGroup = node.hasChildren;
  // Tổ máy đã được chọn ở cây (phạm vi) — không hỏi lại ở đây.
  const detailQuery = useEquipmentNode(node.seq, scope);
  const detail = detailQuery.data?.data ?? null;
  const scopeLabel = TREE_SCOPES.find((s) => s.key === scope)?.label ?? scope;

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

      <span
        className={cn(
          "inline-flex w-fit items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ring-1",
          scope === "COMMON"
            ? "bg-teal-50 text-teal-700 ring-teal-200"
            : "bg-blue-50 text-accent ring-blue-200"
        )}
      >
        {scope === "COMMON" ? `${scopeLabel} — dùng chung 2 tổ máy` : scopeLabel}
      </span>

      <div className="space-y-2">
        <DetailRow label="Mã thiết bị" value={node.fullCode} mono />
        {node.kks && <DetailRow label="Mã KKS" value={node.kks} />}
        <DetailRow label="Bản vẽ liên quan" value={detail?.drawing || "—"} />
        <DetailRow label="Phân loại" value={isGroup ? `Nhóm — ${node.childCount} thiết bị con` : "Thiết bị"} />
      </div>

      {canCreate && node.depth < 16 && onCreateChild && (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="outline"
            className="w-full border-accent/40 text-accent hover:border-accent hover:bg-accent/5 hover:text-accent"
            onClick={() => onCreateChild(node)}
          >
            <Plus className="h-4 w-4" />
            Thêm mới trong hệ thống này
          </Button>
          <p className="text-[11px] leading-snug text-muted-foreground">{BOTH_UNITS_NOTE}</p>
        </div>
      )}

      {detailQuery.isLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải thông tin chi tiết...
        </div>
      )}

      {detail && (
        <div className="space-y-3">
          {detail.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={detail.imageUrl} alt={detail.name} className="aspect-[4/3] w-full rounded-lg border border-border object-cover" />
          )}
          {detail.attachedInfo && <DetailRow label="Thông tin thêm" value={detail.attachedInfo} />}
          {detail.documentUrl && (
            <a href={detail.documentUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-accent hover:underline">
              Mở tài liệu đính kèm
            </a>
          )}
        </div>
      )}

      <Button
        className="w-full"
        onClick={() => router.push(`/devices/${encodeURIComponent(node.seq)}?machine=${scope}`)}
      >
        Xem lý lịch thiết bị
      </Button>
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
