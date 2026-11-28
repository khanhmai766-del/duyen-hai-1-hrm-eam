"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUpdateLubricantRowLink, type ReplacementItem } from "@/hooks/useReplacements";
import { normalizeText } from "@/lib/nav";
import type { RowLinkOverride } from "@/lib/lubricant-row-links";
import { cn } from "@/lib/utils";

const fold = (value: string) => normalizeText(value).replace(/\s+/g, " ").trim();
const tokens = (value: string) => new Set(fold(value).split(/[^a-z0-9]+/).filter((token) => token.length > 1));

/** Độ giống tên (0..1): tỉ lệ từ trùng giữa tên dòng Excel và tên điểm. */
export function nameSimilarity(a: string, b: string) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common / Math.max(left.size, right.size);
}

export const pointLabel = (point: ReplacementItem) => point.device?.name ?? point.location ?? point.system ?? "Điểm không tên";
const pointOils = (point: ReplacementItem) => [point.material.name, ...(point.alternateMaterials ?? []).map((m) => m.name)].join(" / ");

export type LinkPickerRow = {
  key: string;
  name: string;
  group: string;
  material: string;
  current?: ReplacementItem;
  manual?: RowLinkOverride;
};

/** Chọn điểm theo dõi cho một dòng Excel; ứng viên xếp theo độ giống tên trước. */
export function LubricantLinkPicker({ row, points, onClose }: { row: LinkPickerRow | null; points: ReplacementItem[]; onClose: () => void }) {
  const update = useUpdateLubricantRowLink();
  const [search, setSearch] = useState("");
  const needle = fold(search);
  const machine = row?.group.match(/S[12]$/)?.[0];

  const candidates = useMemo(() => {
    if (!row) return [];
    return points
      .filter((point) => !needle || fold([pointLabel(point), point.deviceSeq, pointOils(point), point.material.code, point.managingPosition,
        point.machine, point.lubricantGroup, point.system].join(" ")).includes(needle))
      .map((point) => ({
        point,
        score: nameSimilarity(row.name, pointLabel(point)) + (machine && point.machine === machine ? 0.15 : 0) +
          (nameSimilarity(row.material, pointOils(point)) * 0.2),
      }))
      .sort((a, b) => b.score - a.score || pointLabel(a.point).localeCompare(pointLabel(b.point), "vi"))
      .slice(0, 40);
  }, [row, points, needle, machine]);

  async function save(input: { mode: "point" | "excel" | "none" | "auto"; replacementId?: string }, message: string) {
    if (!row) return;
    try {
      await update.mutateAsync({ sourceKey: row.key, ...input });
      toast.success(message);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không lưu được liên kết");
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(open) => { if (!open && !update.isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>{row?.current ? "Sửa liên kết" : "Liên kết dòng Excel"}</DialogTitle></DialogHeader>
        {row && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-2 text-sm">
              <div className="font-semibold">{row.name}</div>
              <div className="text-xs text-muted-foreground">{row.group} · {row.material.replace(/\s+/g, " ")}</div>
              {row.current && <div className="mt-1 text-xs">Đang gắn với: <b>{pointLabel(row.current)}</b> ({pointOils(row.current)})</div>}
            </div>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Tìm điểm theo dõi"
              placeholder="Tìm theo thiết bị, mã, vật tư, cương vị, tổ máy, nhóm" />
            <ul className="max-h-72 space-y-1 overflow-auto" aria-label="Điểm theo dõi ứng viên">
              {candidates.length === 0 && <li className="p-2 text-sm text-muted-foreground">Không có điểm phù hợp.</li>}
              {candidates.map(({ point, score }) => (
                <li key={point.id}>
                  <button type="button" disabled={update.isPending}
                    onClick={() => void save({ mode: "point", replacementId: point.id }, "Đã liên kết dòng Excel với điểm theo dõi")}
                    className={cn("w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted/60", point.id === row.current?.id && "border-emerald-300 bg-emerald-50")}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{pointLabel(point)}</span>
                      {score >= 0.5 && <span className="shrink-0 text-[11px] text-emerald-700">Gần giống</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {point.system ? `${point.system} · ` : ""}{pointOils(point)} · {point.machine} · {point.managingPosition ?? "—"}{point.lubricantGroup ? ` · ${point.lubricantGroup}` : ""}
                    </div>
                    {point.deviceSeq && <div className="text-[11px] text-muted-foreground">{point.deviceSeq}</div>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
              {row.manual && (
                <Button type="button" variant="ghost" disabled={update.isPending}
                  onClick={() => void save({ mode: "auto" }, "Đã trả dòng về liên kết tự động")}>Về tự động</Button>
              )}
              <Button type="button" variant="outline" disabled={update.isPending}
                onClick={() => void save({ mode: "excel" }, "Đã đánh dấu theo Excel")}>Đánh dấu Theo Excel</Button>
              {(row.current || row.manual?.mode === "excel") && (
                <Button type="button" variant="outline" className="text-red-700" disabled={update.isPending}
                  onClick={() => void save({ mode: "none" }, "Đã bỏ liên kết")}>Bỏ liên kết</Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
