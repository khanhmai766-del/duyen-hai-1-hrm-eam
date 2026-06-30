"use client";

import * as React from "react";
import { toast } from "sonner";
import { BarChart3, ChevronRight, Eye, FolderCog, Lock, Pencil, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEquipmentTree, type EquipmentNode } from "@/hooks/useEquipment";
import { usePositionSystemScopes, useUpdatePositionSystemScope } from "@/hooks/usePositionSystemScopes";
import { usePositions } from "@/hooks/useUsers";
import { isSelectableManagingPosition } from "@/lib/constants";
import { buildEquipmentTreeIndex, compareEquipmentSeq } from "@/lib/equipment-tree";
import { normalizeScopeAccess, positionScopeOptions, scopesForPosition, type NodeAccess } from "@/lib/position-system-scopes";
import { cn } from "@/lib/utils";

const ACCESS_OPTIONS: { value: NodeAccess; label: string; icon: typeof Eye; className: string }[] = [
  { value: "none", label: "Không", icon: Lock, className: "data-[active=true]:bg-rose-100 data-[active=true]:text-rose-700" },
  { value: "view", label: "Xem", icon: Eye, className: "data-[active=true]:bg-sky-100 data-[active=true]:text-sky-700" },
  { value: "edit", label: "Sửa", icon: Pencil, className: "data-[active=true]:bg-emerald-100 data-[active=true]:text-emerald-700" },
];

export function PositionSystemScopeCard({ isAdmin }: { isAdmin: boolean }) {
  const rawPositions = usePositions().filter(isSelectableManagingPosition);
  const positions = React.useMemo(() => positionScopeOptions(rawPositions), [rawPositions]);
  const treeQuery = useEquipmentTree();
  const scopesQuery = usePositionSystemScopes();
  const updateScopes = useUpdatePositionSystemScope();
  const equipmentNodes = React.useMemo(() => treeQuery.data?.data ?? [], [treeQuery.data]);
  const scopes = React.useMemo(() => scopesQuery.data?.data ?? [], [scopesQuery.data]);
  const [position, setPosition] = React.useState("");
  // Map seq -> access đã gán tường minh ("view"|"edit"). Không có trong map = kế thừa cha.
  const [grants, setGrants] = React.useState<Map<string, NodeAccess>>(new Map());
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const { roots, childrenOf, parentOf, allChildrenOf } = React.useMemo(() => {
    const index = buildEquipmentTreeIndex(equipmentNodes);
    // Chỉ phân quyền ở node thư mục (hệ thống) — node có con.
    const folderChildren = new Map<string, EquipmentNode[]>();
    for (const [seq, children] of index.childrenOf) {
      const folders = children.filter((child) => (index.childrenOf.get(child.seq) ?? []).length > 0);
      if (folders.length) folderChildren.set(seq, folders.sort((a, b) => compareEquipmentSeq(a.seq, b.seq)));
    }
    const folderRoots = index.roots
      .filter((root) => (index.childrenOf.get(root.seq) ?? []).length > 0)
      .sort((a, b) => compareEquipmentSeq(a.seq, b.seq));
    return { roots: folderRoots, childrenOf: folderChildren, parentOf: index.parentOf, allChildrenOf: index.childrenOf };
  }, [equipmentNodes]);

  React.useEffect(() => {
    if (!positions.length) return;
    if (!position || !positions.includes(position)) setPosition(positions[0]);
  }, [position, positions]);

  React.useEffect(() => {
    if (!position) return;
    const next = new Map<string, NodeAccess>();
    for (const scope of scopesForPosition(scopes, position)) {
      next.set(scope.systemSeq, normalizeScopeAccess(scope.access));
    }
    setGrants(next);
  }, [position, scopes]);

  // Quyền kế thừa từ tổ tiên gần nhất có gán tường minh.
  const inheritedAccess = React.useCallback(
    (seq: string): NodeAccess => {
      let current: string | null | undefined = parentOf.get(seq) ?? null;
      while (current) {
        const own = grants.get(current);
        if (own) return own;
        current = parentOf.get(current) ?? null;
      }
      return "none";
    },
    [grants, parentOf]
  );

  const effectiveAccess = React.useCallback(
    (seq: string): NodeAccess => grants.get(seq) ?? inheritedAccess(seq),
    [grants, inheritedAccess]
  );

  function setAccess(seq: string, value: NodeAccess) {
    setGrants((current) => {
      const next = new Map(current);
      next.set(seq, value);
      return next;
    });
  }

  function toggleExpand(seq: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  }

  async function save() {
    if (!position) return toast.error("Vui lòng chọn cương vị");
    const entries = Array.from(grants.entries()).map(([systemSeq, access]) => ({ systemSeq, access }));
    try {
      await updateScopes.mutateAsync({ position, entries });
      toast.success("Đã lưu phân quyền hệ thống thiết bị");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  const savedCount = React.useMemo(() => scopesForPosition(scopes, position).length, [scopes, position]);

  const summary = React.useMemo(() => {
    const result = {
      systems: { none: 0, view: 0, edit: 0 },
      devices: { none: 0, view: 0, edit: 0 },
      explicit: { none: 0, view: 0, edit: 0 },
    };
    for (const access of grants.values()) result.explicit[access] += 1;
    for (const node of equipmentNodes) {
      const bucket = (allChildrenOf.get(node.seq) ?? []).length > 0 ? result.systems : result.devices;
      bucket[effectiveAccess(node.seq)] += 1;
    }
    return result;
  }, [allChildrenOf, effectiveAccess, equipmentNodes, grants]);

  function hasPreviewVisible(node: EquipmentNode): boolean {
    if (effectiveAccess(node.seq) !== "none") return true;
    return (childrenOf.get(node.seq) ?? []).some(hasPreviewVisible);
  }

  function renderPreviewNodes(list: EquipmentNode[], depth: number): React.ReactNode {
    return list.filter(hasPreviewVisible).map((node) => {
      const kids = (childrenOf.get(node.seq) ?? []).filter(hasPreviewVisible);
      const access = effectiveAccess(node.seq);
      const isPathOnly = access === "none" && kids.length > 0;
      return (
        <React.Fragment key={`preview-${node.seq}`}>
          <div
            className="flex items-center gap-2 border-b border-border/60 py-1.5 pr-2 last:border-b-0"
            style={{ paddingLeft: depth * 18 + 8 }}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-500/70" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink" title={node.name}>{node.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{node.seq}</span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                access === "edit" && "bg-emerald-100 text-emerald-700",
                access === "view" && "bg-sky-100 text-sky-700",
                isPathOnly && "bg-slate-100 text-slate-600"
              )}
            >
              {access === "edit" ? "Sửa" : access === "view" ? "Xem" : "Đường dẫn"}
            </span>
          </div>
          {kids.length > 0 && renderPreviewNodes(kids, depth + 1)}
        </React.Fragment>
      );
    });
  }

  function renderNodes(list: EquipmentNode[], depth: number): React.ReactNode {
    return list.map((node) => {
      const kids = childrenOf.get(node.seq) ?? [];
      const hasKids = kids.length > 0;
      const open = expanded.has(node.seq);
      const own = grants.get(node.seq);
      const inherited = inheritedAccess(node.seq);
      const effective: NodeAccess = own ?? inherited;
      return (
        <React.Fragment key={node.seq}>
          <div
            className="flex items-center gap-2 border-b border-border/60 py-1.5 pr-2"
            style={{ paddingLeft: depth * 18 + 4 }}
          >
            {hasKids ? (
              <button
                type="button"
                onClick={() => toggleExpand(node.seq)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                title={open ? "Thu gọn" : "Mở rộng"}
              >
                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
              </button>
            ) : (
              <span className="h-5 w-5 shrink-0" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink" title={node.name}>{node.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{node.seq}</span>
            </span>
            <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-white p-0.5">
              {ACCESS_OPTIONS.map((opt) => {
                const active = (own ?? "none") === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    data-active={active}
                    disabled={!isAdmin}
                    onClick={() => setAccess(node.seq, opt.value)}
                    title={opt.label}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed",
                      opt.className
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{opt.label}</span>
                  </button>
                );
              })}
            </div>
            {!own && effective !== "none" && (
              <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground md:inline">
                Kế thừa: {effective === "edit" ? "Sửa" : "Xem"}
              </span>
            )}
          </div>
          {hasKids && open && renderNodes(kids, depth + 1)}
        </React.Fragment>
      );
    });
  }

  return (
    <Card className="overflow-hidden border-cyan-200/80 bg-cyan-50/30">
      <CardHeader className="border-b border-cyan-100">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderCog className="h-5 w-5 text-cyan-700" />
              Phân quyền hệ thống thiết bị theo cương vị
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Chọn cương vị rồi đặt mức quyền cho từng hệ thống trong cây thiết bị: <b>Xem</b> (chỉ đọc) hoặc <b>Sửa</b> (xem &amp; thao tác).
              Hệ thống con kế thừa quyền của hệ thống cha nếu không đặt riêng.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={position} onValueChange={setPosition} disabled={!isAdmin}>
              <SelectTrigger className="h-10 w-[260px] bg-white">
                <SelectValue placeholder="Chọn cương vị" />
              </SelectTrigger>
              <SelectContent>
                {positions.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen((value) => !value)} disabled={!position}>
              <Eye className="h-4 w-4" />
              Xem trước
            </Button>
            <Button type="button" onClick={save} disabled={!isAdmin || updateScopes.isPending || !position}>
              <Save className="h-4 w-4" />
              Lưu cấu hình
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {!isAdmin ? (
          <div className="rounded-lg border border-dashed border-cyan-200 bg-white px-4 py-6 text-center text-sm text-muted-foreground">
            Chỉ Quản trị viên được thay đổi phạm vi hệ thống thiết bị theo cương vị.
          </div>
        ) : roots.length === 0 ? (
          <div className="rounded-lg border border-dashed border-cyan-200 bg-white px-4 py-6 text-center text-sm text-muted-foreground">
            Chưa có dữ liệu cây thiết bị để phân quyền.
          </div>
        ) : (
          <>
            <div className="mb-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-rose-100 bg-white px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-700">
                  <Lock className="h-3.5 w-3.5" />
                  Không hiển thị
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {summary.systems.none} hệ thống · {summary.devices.none} thiết bị
                </div>
              </div>
              <div className="rounded-lg border border-sky-100 bg-white px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-700">
                  <Eye className="h-3.5 w-3.5" />
                  Chỉ xem
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {summary.systems.view} hệ thống · {summary.devices.view} thiết bị
                </div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <Pencil className="h-3.5 w-3.5" />
                  Được sửa
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {summary.systems.edit} hệ thống · {summary.devices.edit} thiết bị
                </div>
              </div>
            </div>
            {previewOpen && (
              <div className="mb-3 overflow-hidden rounded-xl border border-cyan-200 bg-white">
                <div className="flex items-center justify-between border-b border-cyan-100 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-cyan-800">
                    <BarChart3 className="h-4 w-4" />
                    Xem trước phạm vi của {position}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {summary.explicit.none + summary.explicit.view + summary.explicit.edit} dòng cấu hình tường minh
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {summary.systems.view + summary.systems.edit + summary.devices.view + summary.devices.edit > 0 ? (
                    renderPreviewNodes(roots, 0)
                  ) : (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Cương vị này sẽ không thấy hệ thống/thiết bị nào.
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-white">
              {renderNodes(roots, 0)}
            </div>
          </>
        )}
        <div className="mt-3 text-xs text-muted-foreground">
          {savedCount > 0
            ? `Cương vị này đang có ${savedCount} hệ thống được cấu hình riêng. Hệ thống không đặt quyền và ngoài nhánh được cấp sẽ bị ẩn (trừ nhánh COMMON luôn xem được).`
            : "Chưa có cấu hình riêng: cương vị này đang được xem & thao tác toàn bộ (giữ nguyên hành vi cũ). Đặt quyền cho ít nhất một hệ thống để bắt đầu giới hạn."}
        </div>
      </CardContent>
    </Card>
  );
}
