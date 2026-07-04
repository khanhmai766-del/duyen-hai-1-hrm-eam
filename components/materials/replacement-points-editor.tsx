"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EquipmentTreePicker } from "@/components/devices/equipment-tree-picker";
import type { MaterialReplacementInput } from "@/hooks/useMaterials";

/**
 * Bảng "điểm dùng / thay thế" cho một vật tư: mỗi dòng = 1 hệ thống/thiết bị +
 * chu kỳ thay thế + số lượng cần thay. Cho phép thêm/xoá nhiều dòng.
 */
export function ReplacementPointsEditor({
  value,
  unit,
  onChange,
}: {
  value: MaterialReplacementInput[];
  unit?: string;
  onChange: (rows: MaterialReplacementInput[]) => void;
}) {
  const rows = value ?? [];
  const update = (index: number, patch: Partial<MaterialReplacementInput>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const add = () => onChange([...rows, { deviceSeq: null, system: null, intervalMonths: 6, quantity: 1 }]);
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Chưa gán hệ thống/thiết bị nào. Bấm “Thêm điểm dùng” để khai báo nơi dùng, chu kỳ và số lượng cần thay.
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border bg-muted/20 p-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Hệ thống / thiết bị</label>
              <EquipmentTreePicker
                value={row.deviceSeq ?? ""}
                onChange={(node) => update(i, { deviceSeq: node?.seq ?? null, system: node?.name ?? null })}
                includeLeaves
                placeholder="Chọn hệ thống / thiết bị"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Thiết bị (nhập tay)</label>
              <Input
                value={row.location ?? ""}
                onChange={(e) => update(i, { location: e.target.value })}
                placeholder="VD: Bơm dầu bôi trơn máy nghiền A"
              />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr_36px] items-end gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Chu kỳ (tháng)</label>
              <Input
                type="number"
                min={1}
                value={row.intervalMonths ?? 6}
                onChange={(e) => update(i, { intervalMonths: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Dung tích thiết bị{unit ? ` (${unit})` : ""}</label>
              <Input
                type="number"
                min={0}
                value={row.quantity ?? 1}
                onChange={(e) => update(i, { quantity: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Số lượng thiết bị</label>
              <Input
                type="number"
                min={1}
                value={row.deviceCount ?? 1}
                onChange={(e) => update(i, { deviceCount: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
            <Button type="button" variant="ghost" size="icon" className="mb-0.5 text-muted-foreground hover:text-destructive" title="Xoá điểm" onClick={() => remove(i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" /> Thêm điểm dùng
      </Button>
    </div>
  );
}
