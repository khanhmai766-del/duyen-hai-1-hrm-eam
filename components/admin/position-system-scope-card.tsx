"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, BarChart3, ChevronRight, Eye, FolderCog, Lock, Pencil, Save, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEquipmentTree, type EquipmentNode } from "@/hooks/useEquipment";
import { usePositionSystemScopes, useUpdatePositionSystemScope } from "@/hooks/usePositionSystemScopes";
import { usePositions } from "@/hooks/useUsers";
import { compareEquipmentSeq } from "@/lib/equipment-tree";
import { branchOf, scopeCode, type TreeScope } from "@/lib/equipment-units";
import { selectableManagingPositionOptions } from "@/lib/positions";
import { isUnrestrictedEquipmentPosition, normalizeScopeAccess, positionScopeOptions, scopesForPosition, type NodeAccess } from "@/lib/position-system-scopes";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/fetcher";

const REQUIRED_SCOPE_POSITIONS = ["Quản đốc", "Phó Quản đốc", "Kỹ thuật viên"] as const;
const PERMISSION_TREE_SCOPES: Array<{ key: Extract<TreeScope, "S1" | "COMMON">; label: string }> = [
  { key: "S1", label: "Tổ máy S1/S2" },
  { key: "COMMON", label: "Dùng chung" },
];

type ScopeConflictReport = {
  hasExplicitScope: boolean;
  hasEditScope: boolean;
  fixedUnrestricted: boolean;
  explicitScopeCount: number;
  users: Array<{
    role: string;
    adminBypassesScope: boolean;
    allowed: Array<{ id: string; label: string; level: string }>;
    blocked: Array<{ id: string; label: string; level: string }>;
  }>;
};

const ACCESS_OPTIONS: { value: NodeAccess; label: string; icon: typeof Eye; className: string }[] = [
  { value: "none", label: "Không", icon: Lock, className: "data-[active=true]:bg-rose-100 data-[active=true]:text-rose-700" },
  { value: "view", label: "Xem", icon: Eye, className: "data-[active=true]:bg-sky-100 data-[active=true]:text-sky-700" },
  { value: "edit", label: "Sửa", icon: Pencil, className: "data-[active=true]:bg-emerald-100 data-[active=true]:text-emerald-700" },
];

export function PositionSystemScopeCard({ isAdmin }: { isAdmin: boolean }) {
  const allPositions = usePositions();
  const positions = React.useMemo(
    () => positionScopeOptions([
      ...REQUIRED_SCOPE_POSITIONS,
      ...selectableManagingPositionOptions(allPositions),
    ]),
    [allPositions]
  );
  const [treeScope, setTreeScope] = React.useState<TreeScope>("S1");
  // Màn cấu hình RBAC phải đọc toàn bộ cây, độc lập với cương vị hiện tại của admin.
  // Chỉ tải node THƯ MỤC: quyền chỉ gán được ở thư mục, thiết bị lá chỉ vào phần đếm và
  // đã có `leafCount` kèm theo. Payload S1 giảm 2.789 KB → 244 KB.
  const treeQuery = useEquipmentTree({ adminTree: true, scope: treeScope, foldersOnly: true });
  const scopesQuery = usePositionSystemScopes();
  const updateScopes = useUpdatePositionSystemScope();
  const equipmentNodes = React.useMemo(() => treeQuery.data?.data ?? [], [treeQuery.data]);
  const scopes = React.useMemo(() => scopesQuery.data?.data ?? [], [scopesQuery.data]);
  const [position, setPosition] = React.useState("");
  // Map seq -> access đã gán tường minh ("view"|"edit"). Không có trong map = kế thừa cha.
  const [grants, setGrants] = React.useState<Map<string, NodeAccess>>(new Map());
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const fixedUnrestricted = isUnrestrictedEquipmentPosition(position);
  const conflictsQuery = useQuery({
    queryKey: ["position-system-scope-conflicts", position],
    queryFn: () => apiGet<ScopeConflictReport>(
      `/api/position-system-scopes/conflicts?position=${encodeURIComponent(position)}`
    ),
    enabled: isAdmin && Boolean(position),
    staleTime: 30_000,
  });
  const conflictReport = conflictsQuery.data?.data;

  const { roots, childrenOf, parentOf } = React.useMemo(() => {
    // Dựng đúng theo parentSeq như cây thiết bị lazy. Không đoán cha bằng tiền tố mã,
    // vì fallback đó từng làm màn phân quyền khác cấu trúc cây chính.
    const bySeq = new Map(equipmentNodes.map((node) => [node.seq, node]));
    const directChildren = new Map<string, EquipmentNode[]>();
    const strictParentOf = new Map<string, string | null>();
    const rawRoots: EquipmentNode[] = [];
    for (const node of equipmentNodes) {
      const parent = node.parentSeq && bySeq.has(node.parentSeq) ? node.parentSeq : null;
      strictParentOf.set(node.seq, parent);
      if (!parent) rawRoots.push(node);
      else directChildren.set(parent, [...(directChildren.get(parent) ?? []), node]);
    }
    for (const children of directChildren.values()) children.sort((a, b) => compareEquipmentSeq(a.seq, b.seq));

    // Chỉ phân quyền ở node thư mục (hệ thống). API `foldersOnly` đã lọc sẵn nên mọi node
    // nhận về đều là thư mục — không cần suy lại "có con hay không" từ chính danh sách.
    const folderChildren = directChildren;
    // Giống API roots: ẩn gốc nhà máy DH1.S1 và đưa các nhánh 1..7 lên cấp đầu.
    // Node mồ côi nằm sâu không được tự nâng thành root.
    const scopeRoots = rawRoots.flatMap((root) =>
      branchOf(root.seq) === null
        ? directChildren.get(root.seq) ?? []
        : root.seq.split(".").length === 3
          ? [root]
          : []
    );
    const folderRoots = scopeRoots.sort((a, b) => compareEquipmentSeq(a.seq, b.seq));
    return { roots: folderRoots, childrenOf: folderChildren, parentOf: strictParentOf };
  }, [equipmentNodes]);

  React.useEffect(() => setExpanded(new Set()), [treeScope]);

  React.useEffect(() => {
    if (!positions.length) return;
    if (!position || !positions.includes(position)) {
      setPosition(positions[0]);
    }
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
    (seq: string): NodeAccess => fixedUnrestricted ? "edit" : grants.get(seq) ?? inheritedAccess(seq),
    [fixedUnrestricted, grants, inheritedAccess]
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
    if (fixedUnrestricted) return toast.info("Cương vị này mặc định được sửa toàn bộ thiết bị, không cần lưu cấu hình");
    const entries = Array.from(grants.entries()).map(([systemSeq, access]) => ({ systemSeq, access }));
    try {
      await updateScopes.mutateAsync({ position, entries });
      toast.success("Đã lưu phân quyền hệ thống thiết bị");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  const savedCount = React.useMemo(() => scopesForPosition(scopes, position).length, [scopes, position]);
  const scopeConfigurationActive = React.useMemo(
    () => scopes.some((scope) => normalizeScopeAccess(scope.access) === "edit"),
    [scopes]
  );
  const conflictItems = React.useMemo(() => {
    if (!conflictReport) return [];
    const grouped = new Map<string, { count: number; title: string; detail: string }>();
    for (const user of conflictReport.users) {
      let type = "";
      let title = "";
      let detail = "";
      if (user.adminBypassesScope) {
        type = "admin";
        title = "Tài khoản ADMIN bỏ qua phạm vi cây";
        detail = "ADMIN luôn xem và thao tác toàn bộ thiết bị; cấu hình Không/Xem/Sửa của cương vị không có hiệu lực.";
      } else if (conflictReport.hasEditScope && user.blocked.length > 0) {
        type = `rbac-blocks:${user.blocked.map((item) => `${item.id}:${item.level}`).join("|")}`;
        title = `Cây cho Sửa nhưng RBAC vai trò ${user.role} còn chặn ${user.blocked.length} thao tác`;
        detail = user.blocked.map((item) => `${item.label} (${item.level})`).join(" · ");
      } else if (!conflictReport.hasEditScope && user.allowed.length > 0) {
        type = `scope-blocks:${user.allowed.map((item) => `${item.id}:${item.level}`).join("|")}`;
        title = `RBAC vai trò ${user.role} cho thao tác nhưng cây chưa có nhánh Sửa`;
        detail = user.allowed.map((item) => `${item.label} (${item.level})`).join(" · ");
      }
      if (!type) continue;
      const key = `${user.role}:${type}`;
      const current = grouped.get(key);
      if (current) current.count += 1;
      else grouped.set(key, { count: 1, title, detail });
    }
    return Array.from(grouped.entries()).map(([key, item]) => ({
      key,
      title: `${item.count} tài khoản · ${item.title}`,
      detail: item.detail,
    }));
  }, [conflictReport]);

  const summary = React.useMemo(() => {
    const result = {
      systems: { none: 0, view: 0, edit: 0 },
      devices: { none: 0, view: 0, edit: 0 },
      explicit: { none: 0, view: 0, edit: 0 },
    };
    for (const access of grants.values()) result.explicit[access] += 1;
    const folderSeqs = new Set(equipmentNodes.map((node) => node.seq));
    for (const node of equipmentNodes) {
      const access = effectiveAccess(node.seq);
      result.systems[access] += 1;
      // Thiết bị lá không nằm trong payload nữa: chúng luôn kế thừa quyền của thư mục cha,
      // nên cộng theo `leafCount` cho ra đúng con số cũ mà không phải tải 16k node.
      result.devices[access] += node.leafCount ?? 0;
    }
    // Trường hợp hiếm: quyền được gán thẳng vào MỘT thiết bị lá (dữ liệu cũ). Lá đó không
    // có trong payload nên phải đếm riêng, nếu không tổng sẽ hụt đúng bằng số bản ghi đó.
    for (const [seq, access] of grants) {
      if (!folderSeqs.has(seq)) result.devices[access] += 1;
    }
    return result;
  }, [effectiveAccess, equipmentNodes, grants]);

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
              <span className="font-mono text-[11px] text-muted-foreground">{scopeCode(node.seq, treeScope).replace(/^DH1\.S\d+\.?/, "")}</span>
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
              <span className="font-mono text-[11px] text-muted-foreground">{scopeCode(node.seq, treeScope).replace(/^DH1\.S\d+\.?/, "")}</span>
            </span>
            <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-white p-0.5">
              {ACCESS_OPTIONS.map((opt) => {
                const active = fixedUnrestricted ? opt.value === "edit" : (own ?? "none") === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    data-active={active}
                    disabled={!isAdmin || fixedUnrestricted}
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
            <Button type="button" onClick={save} disabled={!isAdmin || updateScopes.isPending || !position || fixedUnrestricted}>
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
        ) : treeQuery.isLoading ? (
          <div className="rounded-lg border border-dashed border-cyan-200 bg-white px-4 py-6 text-center text-sm text-muted-foreground">
            Đang tải cây thiết bị để phân quyền…
          </div>
        ) : roots.length === 0 ? (
          <div className="rounded-lg border border-dashed border-cyan-200 bg-white px-4 py-6 text-center text-sm text-muted-foreground">
            Chưa có dữ liệu cây thiết bị để phân quyền.
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1.5" role="tablist" aria-label="Phạm vi cây thiết bị phân quyền">
              {PERMISSION_TREE_SCOPES.map((item) => {
                const active = treeScope === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTreeScope(item.key)}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors",
                      active ? "bg-white text-accent shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-ink"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <p className="mb-3 text-xs leading-5 text-muted-foreground">
              Cây Tổ máy S1/S2 dùng chung cấu trúc và quyền theo thư mục; Dùng chung được cấu hình ở nhóm riêng.
            </p>
            {fixedUnrestricted && (
              <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <b>Quyền mặc định cố định:</b> {position} được xem và thao tác toàn bộ hệ thống, thiết bị.
                Không cần cấu hình hoặc lưu từng nhánh trên cây.
              </div>
            )}
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
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/70">
              <div className="flex items-center gap-2 border-b border-amber-200 px-3 py-2 text-sm font-semibold text-amber-900">
                <ShieldAlert className="h-4 w-4" />
                Xung đột giữa phạm vi cây và RBAC
                {conflictItems.length > 0 && (
                  <span className="ml-auto rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">
                    {conflictItems.length}
                  </span>
                )}
              </div>
              <div className="space-y-2 px-3 py-3">
                {conflictsQuery.isLoading ? (
                  <div className="text-sm text-amber-800">Đang đối chiếu quyền hiệu lực của các tài khoản…</div>
                ) : conflictItems.length > 0 ? (
                  conflictItems.map((item) => (
                    <div key={item.key} className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                      <div className="flex items-start gap-2 text-sm font-semibold text-amber-950">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        {item.title}
                      </div>
                      <div className="mt-1 pl-6 text-xs leading-5 text-muted-foreground">{item.detail}</div>
                    </div>
                  ))
                ) : conflictReport?.users.length === 0 ? (
                  <div className="text-sm text-amber-800">Chưa có tài khoản nào mang cương vị này để đối chiếu RBAC.</div>
                ) : (
                  <div className="text-sm text-emerald-700">Không phát hiện xung đột quyền hiệu lực trên các tài khoản của cương vị này.</div>
                )}
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
          {fixedUnrestricted
            ? `${position} mặc định được xem và thao tác toàn bộ cây thiết bị; cấu hình từng nhánh không áp dụng.`
            : savedCount > 0
            ? `Cương vị này đang có ${savedCount} hệ thống được cấu hình riêng. Hệ thống không đặt quyền và ngoài nhánh được cấp sẽ bị ẩn (trừ nhánh COMMON luôn xem được).`
            : scopeConfigurationActive
              ? "Cương vị này chưa có nhánh được cấp. Do phân quyền cây đang hoạt động, toàn bộ hệ thống/thiết bị hiện bị ẩn cho cương vị này."
              : "Chưa có cấu hình phân quyền cây: cương vị này đang được xem & thao tác toàn bộ theo hành vi tương thích cũ."}
        </div>
      </CardContent>
    </Card>
  );
}
