"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Cpu, Search, X, Loader2 } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/nav";
import { createPositionAccessResolver, rootAllowedForPosition } from "@/lib/position-system-scopes";
import { useEquipmentTree, type EquipmentNode } from "@/hooks/useEquipment";
import { usePositionSystemScopes } from "@/hooks/usePositionSystemScopes";

/** So sánh "số thứ tự" theo từng đoạn số (1.1.10 sau 1.1.2). */
function compareSeq(a: string, b: string) {
  const pa = a.split(".");
  const pb = b.split(".");
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = i < pa.length ? Number(pa[i]) : -1;
    const y = i < pb.length ? Number(pb[i]) : -1;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * Ô chọn "Hệ thống thiết bị" dạng cây trong popup: bấm thư mục để bung/thu các
 * mục con, click một mục để chọn. Trực quan hơn dropdown phẳng hàng nghìn dòng.
 */
export function EquipmentTreePicker({
  value,
  onChange,
  position,
  rootSeq,
  accessFilter,
  includeLeaves = false,
  placeholder = "Chọn thư mục hệ thống",
  disabled = false,
}: {
  value: string; // seq đang chọn ("" nếu chưa chọn)
  onChange: (node: EquipmentNode | null) => void;
  position?: string | null; // cương vị quản lý đang chọn — lọc nhóm hệ thống theo cương vị
  rootSeq?: string | null; // chỉ duyệt trong nhánh con của node này (vd lọc thiết bị theo hệ thống)
  accessFilter?: "edit"; // chỉ hiện hệ thống cương vị có quyền Sửa (mọi cấp); chưa cấu hình → hiện tất cả
  includeLeaves?: boolean; // hiện cả thiết bị cấp cuối (node lá) và cho chọn — mặc định chỉ hiện thư mục
  placeholder?: string;
  disabled?: boolean;
}) {
  const { data, isLoading } = useEquipmentTree();
  const scopesQuery = usePositionSystemScopes();
  const nodes = React.useMemo(() => data?.data ?? [], [data]);
  const scopes = React.useMemo(() => scopesQuery.data?.data ?? [], [scopesQuery.data]);

  // Chỉ mục: seq -> node, parentSeq hiệu lực -> con (đã sắp), danh sách gốc.
  const { bySeq, childrenOf, roots, effParentOf } = React.useMemo(() => {
    const bySeq = new Map<string, EquipmentNode>();
    nodes.forEach((n) => bySeq.set(n.seq, n));
    const effParentOf = new Map<string, string | null>();
    const childrenOf = new Map<string, EquipmentNode[]>();
    const roots: EquipmentNode[] = [];
    for (const n of nodes) {
      let parent: string | null = n.parentSeq && bySeq.has(n.parentSeq) ? n.parentSeq : null;
      if (!parent) {
        const parts = n.seq.split(".");
        parts.pop();
        while (parts.length) {
          const p = parts.join(".");
          if (bySeq.has(p)) {
            parent = p;
            break;
          }
          parts.pop();
        }
      }
      effParentOf.set(n.seq, parent);
      if (parent) {
        const arr = childrenOf.get(parent) ?? [];
        arr.push(n);
        childrenOf.set(parent, arr);
      } else {
        roots.push(n);
      }
    }
    for (const arr of childrenOf.values()) arr.sort((a, b) => compareSeq(a.seq, b.seq));
    roots.sort((a, b) => compareSeq(a.seq, b.seq));
    return { bySeq, childrenOf, roots, effParentOf };
  }, [nodes]);

  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const q = normalizeText(search.trim());

  const selectedNode = value ? bySeq.get(value) ?? null : null;
  const folderSeqs = React.useMemo(() => new Set(Array.from(childrenOf.entries()).filter(([, kids]) => kids.length > 0).map(([seq]) => seq)), [childrenOf]);
  const accessResolver = React.useMemo(
    () => createPositionAccessResolver(position, nodes, scopes),
    [position, nodes, scopes]
  );

  // accessFilter="edit": chỉ hiện các hệ thống cương vị có quyền Sửa (kế thừa theo nhánh) + tổ tiên để duyệt.
  // null = không lọc theo quyền (chưa cấu hình riêng, hoặc không bật accessFilter) → dùng rule gốc.
  const editVisibleSeqs = React.useMemo(() => {
    if (!position) return null;
    if (!accessResolver.hasExplicitScopes) return null;
    const set = new Set<string>();
    for (const n of nodes) {
      const access = accessResolver.accessForSeq(n.seq);
      const allowed = accessFilter === "edit" ? access === "edit" : access !== "none";
      if (allowed) {
        let cur: string | null | undefined = n.seq;
        while (cur && !set.has(cur)) { set.add(cur); cur = effParentOf.get(cur) ?? null; }
      }
    }
    return set;
  }, [accessFilter, accessResolver, nodes, position, effParentOf]);

  // Lọc nhóm gốc: nếu lọc theo quyền Sửa thì dùng editVisibleSeqs; ngược lại theo rule cương vị.
  const filteredRoots = React.useMemo(() => {
    return roots.filter((node) => {
      if (!includeLeaves && !folderSeqs.has(node.seq)) return false;
      if (editVisibleSeqs) return editVisibleSeqs.has(node.seq);
      return rootAllowedForPosition(node, position, scopes);
    });
  }, [roots, position, folderSeqs, scopes, editVisibleSeqs, includeLeaves]);

  // Khi mở popup, tự bung đường dẫn tới mục đang chọn để thấy ngay.
  React.useEffect(() => {
    if (!open || !selectedNode) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let p = effParentOf.get(selectedNode.seq) ?? null;
      while (p && bySeq.has(p)) {
        next.add(p);
        p = effParentOf.get(p) ?? null;
      }
      return next;
    });
  }, [open, selectedNode, effParentOf, bySeq]);

  // Tìm kiếm: hiện node khớp + tổ tiên, tự bung.
  const { visible, searchExpanded, matchCount } = React.useMemo(() => {
    if (!q) return { visible: null as Set<string> | null, searchExpanded: null as Set<string> | null, matchCount: 0 };
    const visible = new Set<string>();
    const searchExpanded = new Set<string>();
    let matchCount = 0;
    for (const n of nodes) {
      if (!includeLeaves && !folderSeqs.has(n.seq)) continue;
      if (editVisibleSeqs && !editVisibleSeqs.has(n.seq)) continue;
      if (normalizeText([n.seq, n.name].filter(Boolean).join(" ")).includes(q)) {
        matchCount++;
        visible.add(n.seq);
        let p = effParentOf.get(n.seq) ?? null;
        while (p && bySeq.has(p)) {
          visible.add(p);
          searchExpanded.add(p);
          p = effParentOf.get(p) ?? null;
        }
      }
    }
    return { visible, searchExpanded, matchCount };
  }, [q, nodes, bySeq, effParentOf, folderSeqs, editVisibleSeqs, includeLeaves]);

  function toggle(seq: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  }

  function pick(n: EquipmentNode | null) {
    onChange(n);
    setSearch("");
    setOpen(false);
  }

  // Làm phẳng cây thư mục đang mở (đã lọc theo tìm kiếm + quyền) để virtualize.
  const flatRows = React.useMemo(() => {
    const rows: { node: EquipmentNode; depth: number; kidsCount: number; open: boolean }[] = [];
    const walk = (list: EquipmentNode[], depth: number) => {
      for (const n of list) {
        if (visible && !visible.has(n.seq)) continue;
        if (!includeLeaves && !folderSeqs.has(n.seq)) continue;
        if (editVisibleSeqs && !editVisibleSeqs.has(n.seq)) continue;
        const kids = childrenOf.get(n.seq) ?? [];
        const open = q ? !!searchExpanded?.has(n.seq) : expanded.has(n.seq);
        rows.push({ node: n, depth, kidsCount: kids.length, open });
        if (kids.length > 0 && open) walk(kids, depth + 1);
      }
    };
    walk(filteredRoots, 0);
    return rows;
  }, [filteredRoots, visible, folderSeqs, editVisibleSeqs, childrenOf, expanded, searchExpanded, q, includeLeaves]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const handleTreeWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const element = scrollRef.current;
    if (!element || element.scrollHeight <= element.clientHeight) return;
    // Popover được portal ra ngoài Dialog nên lớp khóa cuộn của Dialog có thể
    // chặn thao tác wheel. Cuộn trực tiếp vùng cây để không làm Dialog phía sau
    // di chuyển và vẫn phát sự kiện scroll cho virtualizer.
    event.preventDefault();
    event.stopPropagation();
    element.scrollTop += event.deltaY;
  }, []);
  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 10,
    getItemKey: (index) => flatRows[index]?.node.seq ?? index,
  });

  // Popover mount trễ: đo lại SAU khi khung cuộn đã layout (rAF), và mỗi khi số
  // dòng đổi — đo ngay lúc mở popup khung còn cao 0px sẽ không vẽ được dòng nào.
  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => rowVirtualizer.measure());
    return () => cancelAnimationFrame(id);
  }, [open, flatRows.length, rowVirtualizer]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <span className={cn("truncate", !selectedNode && "text-muted-foreground")}>
            {selectedNode ? selectedNode.name : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(520px,90vw)] p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, số thứ tự…"
              className="h-9 pl-8 pr-8"
              autoFocus
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
        </div>
        <div className="px-1.5 pt-1.5">
          <button
            type="button"
            onClick={() => pick(null)}
            className={cn(
              "flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted",
              !selectedNode ? "font-semibold text-accent" : "text-muted-foreground"
            )}
          >
            — Không chọn —
          </button>
        </div>
        <div
          ref={scrollRef}
          onWheel={handleTreeWheel}
          className="max-h-[300px] touch-pan-y overscroll-contain overflow-y-auto px-1.5 pb-1.5"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Chưa có dữ liệu cây thiết bị.</div>
          ) : q && matchCount === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Không tìm thấy thiết bị phù hợp.</div>
          ) : (
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
              {rowVirtualizer.getVirtualItems().map((vi) => {
                const row = flatRows[vi.index];
                if (!row) return null;
                const n = row.node;
                const hasKids = row.kidsCount > 0;
                const isOpen = row.open;
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={rowVirtualizer.measureElement}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onChange(n);
                        if (hasKids) toggle(n.seq);
                        else pick(n); // node lá: chọn xong đóng popup luôn
                      }}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors",
                        value === n.seq ? "bg-accent/10 font-semibold text-accent" : "text-ink hover:bg-muted"
                      )}
                      style={{ paddingLeft: row.depth * 16 + 4 }}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
                        {hasKids && <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />}
                      </span>
                      {hasKids ? (
                        isOpen ? (
                          <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                        ) : (
                          <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                        )
                      ) : (
                        <Cpu className="h-4 w-4 shrink-0 text-sky-500" />
                      )}
                      <span className={cn("min-w-0 flex-1 truncate", hasKids && "uppercase")} title={n.name}>
                        {n.name}
                      </span>
                      {hasKids && <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">{row.kidsCount}</span>}
                      <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{n.seq}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
