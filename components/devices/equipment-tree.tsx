"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/nav";
import { useEquipmentNode, useEquipmentTree, type EquipmentNode } from "@/hooks/useEquipment";

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

export function EquipmentTreeView() {
  const params = useSearchParams();
  const focusSeq = params.get("focusSeq");
  const { data, isLoading } = useEquipmentTree();
  const allNodes = React.useMemo(() => data?.data ?? [], [data]);

  // Lọc theo quyền Xem của cương vị người dùng: chỉ hiện hệ thống được cấp (Xem trở lên)
  // cùng tổ tiên của chúng. Quản trị viên / chưa cấu hình riêng → thấy toàn bộ.
  const nodes = allNodes;

  // Chỉ mục: seq -> node, parentSeq -> các con (đã sắp xếp), danh sách gốc.
  const { bySeq, childrenOf, roots, effParentOf } = React.useMemo(() => {
    const bySeq = new Map<string, EquipmentNode>();
    nodes.forEach((n) => bySeq.set(n.seq, n));
    // Cha hiệu lực = tổ tiên GẦN NHẤT có thật trong dữ liệu — file nguồn có thể
    // thiếu node trung gian (vd có "1.6.4.4.1" nhưng thiếu "1.6.4.4"/"1.6.4").
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

  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const q = normalizeText(search.trim());

  // Tìm kiếm: hiện các node khớp + tổ tiên (để thấy đường dẫn), tự bung tổ tiên.
  const { visible, searchExpanded, matchCount } = React.useMemo(() => {
    if (!q) return { visible: null as Set<string> | null, searchExpanded: null as Set<string> | null, matchCount: 0 };
    const visible = new Set<string>();
    const searchExpanded = new Set<string>();
    let matchCount = 0;
    for (const n of nodes) {
      const hay = normalizeText([n.seq, n.name].filter(Boolean).join(" "));
      if (hay.includes(q)) {
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

  const isOpen = (seq: string) => (q ? searchExpanded!.has(seq) : expanded.has(seq));
  function toggle(seq: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  }

  const selectedNode = selected ? bySeq.get(selected) ?? null : null;
  React.useEffect(() => {
    if (!focusSeq || !bySeq.has(focusSeq)) return;
    setSelected(focusSeq);
    setExpanded((prev) => {
      const next = new Set(prev);
      let parent = effParentOf.get(focusSeq) ?? null;
      while (parent && bySeq.has(parent)) {
        next.add(parent);
        parent = effParentOf.get(parent) ?? null;
      }
      return next;
    });
  }, [focusSeq, bySeq, effParentOf]);

  const ancestors = React.useMemo(() => {
    if (!selectedNode) return [];
    const path: EquipmentNode[] = [];
    let p = effParentOf.get(selectedNode.seq) ?? null;
    while (p && bySeq.has(p)) {
      path.unshift(bySeq.get(p)!);
      p = effParentOf.get(p) ?? null;
    }
    return path;
  }, [selectedNode, bySeq, effParentOf]);

  function renderNodes(list: EquipmentNode[], depth: number): React.ReactNode {
    return list
      .filter((n) => !visible || visible.has(n.seq))
      .map((n) => {
        const kids = childrenOf.get(n.seq) ?? [];
        const hasKids = kids.length > 0;
        const open = isOpen(n.seq);
        return (
          <React.Fragment key={n.seq}>
            <button
              type="button"
              onClick={() => setSelected(n.seq)}
              className={cn(
                "group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors",
                selected === n.seq ? "bg-accent/10 font-semibold text-accent" : "text-ink hover:bg-muted"
              )}
              style={{ paddingLeft: depth * 16 + 4 }}
            >
              {hasKids ? (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(n.seq);
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/10"
                  title={open ? "Thu gọn" : "Mở rộng"}
                >
                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
                </span>
              ) : (
                <span className="h-5 w-5 shrink-0" />
              )}
              {hasKids ? (
                open ? (
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
            {hasKids && open && renderNodes(kids, depth + 1)}
          </React.Fragment>
        );
      });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, số thứ tự…"
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
          {!q && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setExpanded(new Set(roots.map((r) => r.seq)))}
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
        </div>

        <div className="max-h-[68vh] min-h-[340px] overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="py-20 text-center text-sm text-muted-foreground">Chưa có dữ liệu cây thiết bị.</div>
          ) : q && matchCount === 0 ? (
            <div className="py-20 text-center text-sm text-muted-foreground">Không tìm thấy thiết bị phù hợp.</div>
          ) : (
            renderNodes(roots, 0)
          )}
        </div>

        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {q
            ? `${matchCount.toLocaleString("vi-VN")} kết quả`
            : `${nodes.length.toLocaleString("vi-VN")} thiết bị · ${roots.length} nhóm gốc`}
        </div>
      </Card>

      <Card className="p-4">
        {selectedNode ? (
          <DetailPanel
            node={selectedNode}
            ancestors={ancestors}
            childCount={(childrenOf.get(selectedNode.seq) ?? []).length}
            onSelect={setSelected}
          />
        ) : (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Layers className="h-9 w-9 text-muted-foreground/40" />
            Chọn thiết bị trong thư mục để xem chi tiết.
          </div>
        )}
      </Card>
    </div>
  );
}

function DetailPanel({
  node,
  ancestors,
  childCount,
  onSelect,
}: {
  node: EquipmentNode;
  ancestors: EquipmentNode[];
  childCount: number;
  onSelect: (seq: string) => void;
}) {
  const router = useRouter();
  const isGroup = childCount > 0;
  const detailQuery = useEquipmentNode(isGroup ? null : node.seq);
  const detail = detailQuery.data?.data ?? null;

  // Mở lý lịch của node lá trực tiếp theo số thứ tự cây thiết bị.
  async function openRecord() {
    router.push(`/devices/${encodeURIComponent(node.seq)}`);
  }

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
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">Số thứ tự: {node.seq}</div>
        </div>
      </div>

      <div className="space-y-2">
        <DetailRow label="Bản vẽ liên quan" value={node.drawing || "—"} />
        <DetailRow label="Phân loại" value={isGroup ? `Nhóm — ${childCount} thiết bị con` : "Thiết bị"} />
      </div>

      {!isGroup && detailQuery.isLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Äang táº£i thÃ´ng tin chi tiáº¿t...
        </div>
      )}

      {!isGroup && detail && (
        <div className="space-y-3">
          {detail.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={detail.imageUrl} alt={detail.name} className="aspect-[4/3] w-full rounded-lg border border-border object-cover" />
          )}
          {detail.attachedInfo && <DetailRow label="ThÃ´ng tin thÃªm" value={detail.attachedInfo} />}
          {detail.documentUrl && (
            <a href={detail.documentUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-accent hover:underline">
              Má»Ÿ tÃ i liá»‡u Ä‘Ã­nh kÃ¨m
            </a>
          )}
        </div>
      )}

      {!isGroup && (
        <Button className="w-full" onClick={openRecord}>
          Xem lý lịch thiết bị
        </Button>
      )}
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
