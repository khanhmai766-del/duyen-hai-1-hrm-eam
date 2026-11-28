"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { normalizeText } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { LubricantMaterialOption } from "@/hooks/useReplacements";

/**
 * Chọn dầu mỡ trong Danh mục vật tư, có ô tìm theo tên/mã. `multiple` dùng cho dầu thay thế lẫn nhau
 * (hiện chip đã chọn, bấm lại để bỏ); ngược lại chỉ chọn một.
 */
export function LubricantMaterialPicker({
  materials, value, onChange, multiple = false, excludeIds = [], machine, loading = false, disabled = false, placeholder = "Tìm theo tên hoặc mã dầu mỡ",
}: {
  materials: LubricantMaterialOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  excludeIds?: string[];
  /** Chỉ cho chọn dầu của tổ máy này (phiếu vật tư lọc theo tổ máy). */
  machine?: string;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [search, setSearch] = React.useState("");
  const byId = React.useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
  const needle = normalizeText(search);
  const options = React.useMemo(() => materials
    .filter((material) => (!machine || material.machine === machine) && !excludeIds.includes(material.id))
    .filter((material) => !needle || normalizeText(`${material.name} ${material.code}`).includes(needle))
    .slice(0, 60), [materials, machine, excludeIds, needle]);

  function toggle(id: string) {
    if (!multiple) return onChange([id]);
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs">
              <span className="truncate">{byId.get(id)?.name ?? id}</span>
              {multiple && (
                <button type="button" className="rounded-full p-0.5 hover:bg-background" aria-label={`Bỏ ${byId.get(id)?.name ?? id}`}
                  onClick={() => toggle(id)}><X className="size-3" /></button>
              )}
            </span>
          ))}
        </div>
      )}
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={placeholder} disabled={disabled}
        aria-label={placeholder} />
      <ul className="max-h-40 overflow-auto rounded-lg border border-border" role="listbox" aria-multiselectable={multiple}>
        {options.length === 0 && loading && <li className="px-3 py-2 text-xs text-muted-foreground">Đang tải danh mục dầu mỡ…</li>}
        {options.length === 0 && !loading && <li className="px-3 py-2 text-xs text-muted-foreground">Không có dầu mỡ phù hợp{machine ? ` ở tổ máy ${machine}` : ""}.</li>}
        {options.map((material) => {
          const selected = value.includes(material.id);
          return (
            <li key={material.id} role="option" aria-selected={selected}>
              <button type="button" disabled={disabled} onClick={() => toggle(material.id)}
                className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/60", selected && "bg-sky-50")}>
                <Check className={cn("size-3.5 shrink-0 text-navy", !selected && "opacity-0")} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{material.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{material.code}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
