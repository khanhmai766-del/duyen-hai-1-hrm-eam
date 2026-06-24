"use client";

import * as React from "react";
import { toast } from "sonner";
import { FolderCog, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEquipmentTree, type EquipmentNode } from "@/hooks/useEquipment";
import { usePositionSystemScopes, useUpdatePositionSystemScope } from "@/hooks/usePositionSystemScopes";
import { usePositions } from "@/hooks/useUsers";
import { buildEquipmentTreeIndex, compareEquipmentSeq } from "@/lib/equipment-tree";
import { selectableManagingPositionOptions } from "@/lib/positions";
import { rootAllowedForPosition, scopesForPosition, type PositionSystemScope } from "@/lib/position-system-scopes";
import { cn } from "@/lib/utils";

const EMPTY_EQUIPMENT_NODES: EquipmentNode[] = [];
const EMPTY_SCOPES: PositionSystemScope[] = [];

function sameSeqSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function PositionSystemScopeCard({ isAdmin }: { isAdmin: boolean }) {
  const allPositions = usePositions();
  const positions = React.useMemo(
    () => selectableManagingPositionOptions(allPositions),
    [allPositions]
  );
  const treeQuery = useEquipmentTree();
  const scopesQuery = usePositionSystemScopes();
  const updateScopes = useUpdatePositionSystemScope();
  const equipmentNodes = treeQuery.data?.data ?? EMPTY_EQUIPMENT_NODES;
  const scopes = scopesQuery.data?.data ?? EMPTY_SCOPES;
  const [position, setPosition] = React.useState("");
  const [selectedSeqs, setSelectedSeqs] = React.useState<Set<string>>(new Set());

  const roots = React.useMemo(() => {
    const index = buildEquipmentTreeIndex(equipmentNodes);
    return [...index.roots].sort((a, b) => compareEquipmentSeq(a.seq, b.seq));
  }, [equipmentNodes]);

  React.useEffect(() => {
    if (!positions.length) return;
    if (!position || !positions.includes(position)) {
      setPosition(positions[0]);
    }
  }, [position, positions]);

  React.useEffect(() => {
    if (!position) return;
    const saved = scopesForPosition(scopes, position).map((scope) => scope.systemSeq);
    const fallback = roots
      .filter((root) => rootAllowedForPosition(root, position, []))
      .map((root) => root.seq);
    const next = new Set(saved.length ? saved : fallback);
    setSelectedSeqs((current) => (sameSeqSet(current, next) ? current : next));
  }, [position, roots, scopes]);

  const savedCount = React.useMemo(() => scopesForPosition(scopes, position).length, [scopes, position]);

  function toggle(seq: string, checked: boolean) {
    setSelectedSeqs((current) => {
      const next = new Set(current);
      if (checked) next.add(seq);
      else next.delete(seq);
      return next;
    });
  }

  async function save() {
    if (!position) return toast.error("Vui lòng chọn cương vị");
    try {
      await updateScopes.mutateAsync({ position, systemSeqs: Array.from(selectedSeqs) });
      toast.success("Đã lưu phân quyền hệ thống thiết bị");
    } catch (error) {
      toast.error((error as Error).message);
    }
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
              Chọn cương vị rồi tick các hệ thống thiết bị được phép thao tác khi thêm lịch sử sửa chữa, khiếm khuyết và vật tư.
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
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {roots.map((root) => {
              const checked = selectedSeqs.has(root.seq);
              return (
                <label
                  key={root.seq}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-3 py-3 transition-colors",
                    checked ? "border-cyan-300 bg-cyan-50" : "border-border hover:border-cyan-200"
                  )}
                >
                  <Checkbox checked={checked} onCheckedChange={(value) => toggle(root.seq, value === true)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{root.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{root.seq}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <div className="mt-3 text-xs text-muted-foreground">
          {savedCount > 0
            ? `Cương vị này đang có ${savedCount} hệ thống được lưu cấu hình riêng.`
            : "Chưa có cấu hình riêng: hệ thống đang dùng rule mặc định hiện có để không làm gián đoạn dữ liệu."}
        </div>
      </CardContent>
    </Card>
  );
}
