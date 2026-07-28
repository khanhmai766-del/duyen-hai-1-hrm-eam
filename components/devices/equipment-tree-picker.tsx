"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Cpu, Folder, FolderOpen, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  fetchTreeChildren,
  useEquipmentNode,
  useTreeRoots,
  useTreeSearch,
  type TreeNode,
} from "@/hooks/useEquipment";
import { usePositionSystemScopes } from "@/hooks/usePositionSystemScopes";
import {
  normalizeScopeAccess,
  scopesForPosition,
  type PositionSystemScope,
} from "@/lib/position-system-scopes";

export type PickerEquipmentNode = TreeNode;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

function seqIsSameOrDescendant(seq: string, ancestor: string) {
  return seq === ancestor || seq.startsWith(`${ancestor}.`);
}

/**
 * Bộ lọc quyền chạy trên materialized path (seq), không cần tải toàn bộ cây.
 * Tổ tiên của một scope được phép hiện để người dùng có thể mở tới nhánh được cấp quyền,
 * nhưng chỉ node thực sự có quyền "edit" mới được chọn.
 */
function lazyPositionAccess(
  seq: string,
  position: string | null | undefined,
  scopes: PositionSystemScope[],
  accessFilter?: "edit"
) {
  if (!accessFilter || !position) return { visible: true, selectable: true };

  const explicit = scopesForPosition(scopes, position);
  const scopeConfigurationActive = scopes.some((scope) => normalizeScopeAccess(scope.access) === "edit");
  if (!scopeConfigurationActive && explicit.length === 0) return { visible: true, selectable: true };

  let inherited: "none" | "view" | "edit" = "none";
  let inheritedDepth = -1;
  for (const scope of explicit) {
    if (!seqIsSameOrDescendant(seq, scope.systemSeq)) continue;
    const depth = scope.systemSeq.split(".").length;
    if (depth > inheritedDepth) {
      inherited = normalizeScopeAccess(scope.access);
      inheritedDepth = depth;
    }
  }

  const selectable = inherited === "edit";
  const leadsToEditableBranch = explicit.some(
    (scope) =>
      normalizeScopeAccess(scope.access) === "edit" &&
      seqIsSameOrDescendant(scope.systemSeq, seq)
  );
  return { visible: selectable || leadsToEditableBranch, selectable };
}

/**
 * Ô chọn cây thiết bị tải lười:
 * - mở popup chỉ lấy các gốc;
 * - bung node mới lấy con trực tiếp;
 * - tìm kiếm chạy ở server, 50 kết quả/trang.
 *
 * Nhờ vậy việc bấm S1/S2/COMMON không còn tải và dựng toàn bộ hàng chục nghìn node.
 */
export function EquipmentTreePicker({
  value,
  onChange,
  position,
  rootSeq,
  accessFilter,
  includeLeaves = false,
  maxSelectableDepth,
  placeholder = "Chọn thư mục hệ thống",
  disabled = false,
}: {
  value: string;
  onChange: (node: PickerEquipmentNode | null) => void;
  position?: string | null;
  rootSeq?: string | null;
  accessFilter?: "edit";
  includeLeaves?: boolean;
  maxSelectableDepth?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const rootsQuery = useTreeRoots();
  const selectedQuery = useEquipmentNode(value || null);
  const scopesQuery = usePositionSystemScopes();
  const scopes = React.useMemo(() => scopesQuery.data?.data ?? [], [scopesQuery.data]);

  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [childrenBySeq, setChildrenBySeq] = React.useState<Map<string, TreeNode[]>>(new Map());
  const [loadingSeqs, setLoadingSeqs] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300).trim();
  const searchActive = debouncedSearch.length >= 2;
  const searchQuery = useTreeSearch(debouncedSearch);

  const roots = React.useMemo(() => rootsQuery.data?.data ?? [], [rootsQuery.data]);
  const searchResults = React.useMemo(
    () => (searchQuery.data?.pages ?? []).flatMap((page) => page.data),
    [searchQuery.data]
  );

  const accessFor = React.useCallback(
    (seq: string) => lazyPositionAccess(seq, position, scopes, accessFilter),
    [accessFilter, position, scopes]
  );

  const ensureChildren = React.useCallback(
    async (seq: string) => {
      if (childrenBySeq.has(seq)) return childrenBySeq.get(seq) ?? [];
      setLoadingSeqs((current) => new Set(current).add(seq));
      try {
        const response = await fetchTreeChildren(queryClient, undefined, seq);
        setChildrenBySeq((current) => new Map(current).set(seq, response.data));
        return response.data;
      } catch {
        toast.error("Không tải được danh mục thiết bị con");
        return [];
      } finally {
        setLoadingSeqs((current) => {
          const next = new Set(current);
          next.delete(seq);
          return next;
        });
      }
    },
    [childrenBySeq, queryClient]
  );

  // rootSeq hiện ít dùng nhưng vẫn được hỗ trợ mà không quay lại tải toàn bộ cây.
  React.useEffect(() => {
    if (!open || !rootSeq || childrenBySeq.has(rootSeq)) return;
    void ensureChildren(rootSeq);
  }, [childrenBySeq, ensureChildren, open, rootSeq]);

  const toggle = React.useCallback(
    (node: TreeNode) => {
      if (!node.hasChildren) return;
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(node.seq)) next.delete(node.seq);
        else {
          next.add(node.seq);
          void ensureChildren(node.seq);
        }
        return next;
      });
    },
    [ensureChildren]
  );

  const pick = React.useCallback(
    (node: TreeNode | null) => {
      onChange(node);
      setSearch("");
      setOpen(false);
    },
    [onChange]
  );

  const initialRows = rootSeq ? childrenBySeq.get(rootSeq) ?? [] : roots;
  const flatRows = React.useMemo(() => {
    const rows: Array<{ node: TreeNode; depth: number }> = [];
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const node of nodes) {
        if (!accessFor(node.seq).visible) continue;
        if (!includeLeaves && !node.hasChildren) continue;
        rows.push({ node, depth });
        if (node.hasChildren && expanded.has(node.seq)) {
          walk(childrenBySeq.get(node.seq) ?? [], depth + 1);
        }
      }
    };
    walk(initialRows, 0);
    return rows;
  }, [accessFor, childrenBySeq, expanded, includeLeaves, initialRows]);

  const visibleSearchResults = React.useMemo(
    () =>
      searchResults.filter((node) => {
        if (!accessFor(node.seq).visible) return false;
        return includeLeaves || node.hasChildren;
      }),
    [accessFor, includeLeaves, searchResults]
  );

  const selectedName = selectedQuery.data?.data.name;
  const loading = rootsQuery.isLoading || (rootSeq ? loadingSeqs.has(rootSeq) : false);

  function canSelect(node: TreeNode) {
    if (!includeLeaves && !node.hasChildren) return false;
    if (maxSelectableDepth !== undefined && node.depth > maxSelectableDepth) return false;
    return accessFor(node.seq).selectable;
  }

  function row(node: TreeNode, depth: number, searchMode = false) {
    const isExpanded = expanded.has(node.seq);
    const isLoading = loadingSeqs.has(node.seq);
    const selectable = canSelect(node);
    return (
      <button
        key={node.seq}
        type="button"
        onClick={() => {
          if (node.hasChildren && !searchMode) {
            if (selectable) onChange(node);
            toggle(node);
            return;
          }
          if (selectable) pick(node);
        }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors",
          value === node.seq ? "bg-accent/10 font-semibold text-accent" : "text-ink hover:bg-muted",
          !selectable && !node.hasChildren && "cursor-not-allowed opacity-50"
        )}
        style={{ paddingLeft: depth * 16 + 4 }}
        title={!selectable && !node.hasChildren ? "Không có quyền chọn thiết bị này" : undefined}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
          {node.hasChildren && (
            isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-90")} />
            )
          )}
        </span>
        {node.hasChildren ? (
          isExpanded && !searchMode ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-amber-500" />
          )
        ) : (
          <Cpu className="h-4 w-4 shrink-0 text-sky-500" />
        )}
        <span className={cn("min-w-0 flex-1 truncate", node.hasChildren && "uppercase")} title={node.name}>
          {node.name}
        </span>
        {node.hasChildren && (
          <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            {node.childCount}
          </span>
        )}
        <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{node.code}</span>
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? selectedName ?? value : placeholder}
          </span>
          {value && selectedQuery.isLoading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(540px,90vw)] p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo tên, mã KKS, số thứ tự…"
              className="h-9 pl-8 pr-8"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-ink"
                aria-label="Xóa tìm kiếm"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {search.trim().length === 1 && (
            <p className="px-1 pt-1.5 text-xs text-muted-foreground">Nhập ít nhất 2 ký tự để tìm kiếm.</p>
          )}
        </div>

        <div className="px-1.5 pt-1.5">
          <button
            type="button"
            onClick={() => pick(null)}
            className={cn(
              "flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted",
              !value ? "font-semibold text-accent" : "text-muted-foreground"
            )}
          >
            — Không chọn —
          </button>
        </div>

        <div className="max-h-[320px] touch-pan-y overscroll-contain overflow-y-auto px-1.5 pb-1.5">
          {searchActive ? (
            searchQuery.isLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : visibleSearchResults.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Không tìm thấy thiết bị phù hợp.</div>
            ) : (
              <>
                {visibleSearchResults.map((node) => row(node, 0, true))}
                {searchQuery.hasNextPage && (
                  <button
                    type="button"
                    disabled={searchQuery.isFetchingNextPage}
                    onClick={() => void searchQuery.fetchNextPage()}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2 text-xs font-medium text-accent hover:bg-accent/5"
                  >
                    {searchQuery.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Xem thêm kết quả
                  </button>
                )}
              </>
            )
          ) : loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : flatRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Chưa có dữ liệu cây thiết bị.</div>
          ) : (
            flatRows.map(({ node, depth }) => row(node, depth))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
