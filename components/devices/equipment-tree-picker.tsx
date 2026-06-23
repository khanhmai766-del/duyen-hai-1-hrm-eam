"use client";

import * as React from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Cpu, Search, X, Loader2 } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/nav";
import { useEquipmentTree, type EquipmentNode } from "@/hooks/useEquipment";

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
  placeholder = "Chọn thư mục hệ thống",
}: {
  value: string; // seq đang chọn ("" nếu chưa chọn)
  onChange: (node: EquipmentNode | null) => void;
  placeholder?: string;
}) {
  const { data, isLoading } = useEquipmentTree();
  const nodes = React.useMemo(() => data?.data ?? [], [data]);

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
  }, [q, nodes, bySeq, effParentOf]);

  const isOpenNode = (seq: string) => (q ? searchExpanded!.has(seq) : expanded.has(seq));
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

  function renderNodes(list: EquipmentNode[], depth: number): React.ReactNode {
    return list
      .filter((n) => !visible || visible.has(n.seq))
      .map((n) => {
        const kids = childrenOf.get(n.seq) ?? [];
        const hasKids = kids.length > 0;
        const isOpen = isOpenNode(n.seq);
        return (
          <React.Fragment key={n.seq}>
            <button
              type="button"
              // Thư mục (có con): click để mở/thu + chọn, GIỮ popup mở để xem mục con.
              // Thiết bị lá: click để chọn rồi đóng.
              onClick={() => {
                if (hasKids) {
                  onChange(n);
                  toggle(n.seq);
                } else {
                  pick(n);
                }
              }}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors",
                value === n.seq ? "bg-accent/10 font-semibold text-accent" : "text-ink hover:bg-muted"
              )}
              style={{ paddingLeft: depth * 16 + 4 }}
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
              <span className="min-w-0 flex-1 truncate" title={n.name}>
                {n.name}
              </span>
              {hasKids && <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">{kids.length}</span>}
              <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{n.seq}</span>
            </button>
            {hasKids && isOpen && renderNodes(kids, depth + 1)}
          </React.Fragment>
        );
      });
  }

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
        <div className="max-h-[320px] overflow-y-auto p-1.5">
          <button
            type="button"
            onClick={() => pick(null)}
            className={cn(
              "mb-1 flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted",
              !selectedNode ? "font-semibold text-accent" : "text-muted-foreground"
            )}
          >
            — Không chọn —
          </button>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Chưa có dữ liệu cây thiết bị.</div>
          ) : q && matchCount === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Không tìm thấy thiết bị phù hợp.</div>
          ) : (
            renderNodes(roots, 0)
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
