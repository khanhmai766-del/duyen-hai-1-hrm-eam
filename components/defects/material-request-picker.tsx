"use client";

import * as React from "react";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReplacementPointOptions, type ReplacementPointOption } from "@/hooks/useReplacements";
import { MATERIAL_CATEGORIES, REPL_DUE } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import type { DefectMaterialRequestSeed } from "@/components/defects/defect-form";

const ALL_CATEGORIES = "__all__";

function pointLabel(point: ReplacementPointOption) {
  const parts = [point.systemName, point.deviceName].filter(Boolean);
  return parts.filter((part, index) => parts.indexOf(part) === index).join(" · ") || "Chưa xác định vị trí";
}

/**
 * Nội dung gợi ý — giữ cùng khuôn với bản dựng ở server
 * (`buildMaterialRequestContent`) để phiếu ra từ hai cửa đọc giống nhau.
 */
function buildContent(points: ReplacementPointOption[]) {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const point = points[0];
    const detail = [
      point.intervalMonths > 0 ? `chu kỳ ${point.intervalMonths} tháng` : null,
      point.intervalNote ? `O&M ${point.intervalNote}` : null,
      point.lastReplacedAt ? `lần thay gần nhất ${formatDate(point.lastReplacedAt)}` : null,
    ].filter(Boolean).join(", ");
    return `Thay thế ${point.materialName} — ${point.quantity.toLocaleString("vi-VN")} ${point.materialUnit} tại ${pointLabel(point)}${detail ? ` (${detail})` : ""}.`;
  }
  const groups = new Map<string, ReplacementPointOption[]>();
  for (const point of points) groups.set(point.materialId, [...(groups.get(point.materialId) ?? []), point]);
  const lines = groups.size === 1
    ? []
    : [`Thay thế ${groups.size} loại vật tư tại ${points.length} vị trí:`];
  for (const group of groups.values()) {
    const first = group[0];
    const total = group.reduce((sum, point) => sum + point.quantity, 0);
    lines.push(`${groups.size === 1 ? "" : "- "}Thay thế ${first.materialName} cho ${group.length} vị trí — tổng ${total.toLocaleString("vi-VN")} ${first.materialUnit}:`);
    lines.push(...group.map((point) => `${groups.size === 1 ? "-" : "  +"} ${pointLabel(point)}: ${point.quantity.toLocaleString("vi-VN")} ${point.materialUnit}`));
  }
  return lines.join("\n");
}

export function buildSeedFromPoints(points: ReplacementPointOption[]): DefectMaterialRequestSeed | null {
  if (points.length === 0) return null;
  const primary = points[0];
  return {
    replacementIds: points.map((point) => point.id),
    materialName: primary.materialName,
    materialUnit: primary.materialUnit,
    materialCategory: primary.category,
    primaryIsFolder: primary.deviceIsFolder,
    primarySystemName: primary.deviceIsFolder ? primary.deviceName : primary.systemName,
    primaryDeviceName: primary.deviceName,
    points: points.map((point) => ({
      id: point.id,
      label: pointLabel(point),
      quantity: point.quantity,
      materialName: point.materialName,
      materialUnit: point.materialUnit,
    })),
    suggestedContent: buildContent(points),
  };
}

/**
 * Chọn điểm thay thế ngay trong form Nhập khiếm khuyết ("cửa phụ").
 * Danh sách đã được server lọc theo tổ máy + cương vị đang chọn, nên mọi điểm hiện
 * ra đều gộp được vào một phiếu, kể cả khi thuộc nhiều loại vật tư khác nhau.
 */
export function MaterialRequestPicker({
  machine,
  position,
  selectedIds,
  onChange,
}: {
  machine: string;
  position: string;
  selectedIds: string[];
  onChange: (points: ReplacementPointOption[]) => void;
}) {
  const [category, setCategory] = React.useState<string>(ALL_CATEGORIES);
  const query = useReplacementPointOptions({
    machine,
    position,
  });
  const points = React.useMemo(() => query.data?.data ?? [], [query.data]);
  const visiblePoints = React.useMemo(
    () => category === ALL_CATEGORIES ? points : points.filter((point) => point.category === category),
    [category, points]
  );
  const selected = React.useMemo(
    () => points.filter((point) => selectedIds.includes(point.id)),
    [points, selectedIds]
  );
  function toggle(point: ReplacementPointOption) {
    const next = selectedIds.includes(point.id)
      ? selected.filter((item) => item.id !== point.id)
      : [...selected, point];
    onChange(next);
  }

  if (!machine || !position) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground">
        Chọn Tổ máy và Cương vị trước để lọc ra các điểm thay thế đã khai báo.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="h-10"><SelectValue placeholder="Loại vật tư" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_CATEGORIES}>Tất cả loại vật tư</SelectItem>
          {MATERIAL_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
        </SelectContent>
      </Select>

      {query.isLoading ? (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải điểm thay thế…
        </div>
      ) : visiblePoints.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/25 px-3 py-3 text-xs text-muted-foreground">
          Cương vị <b>{position}</b> chưa có điểm thay thế nào được khai báo{category !== ALL_CATEGORIES ? ` cho loại “${category}”` : ""}.
          Khai báo tại Danh mục vật tư → Chi tiết điểm thay thế.
        </p>
      ) : (
        <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-muted/15 p-1.5">
          {visiblePoints.map((point) => {
            const checked = selectedIds.includes(point.id);
            const due = point.dueStatus ? REPL_DUE[point.dueStatus] : null;
            return (
              <button
                key={point.id}
                type="button"
                onClick={() => toggle(point)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                  checked
                    ? "border-emerald-300 bg-white shadow-sm"
                    : "border-transparent bg-white/70 hover:border-emerald-200 hover:bg-white"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border",
                    checked ? "border-navy bg-navy text-white" : "border-input bg-white text-transparent"
                  )}
                  aria-hidden="true"
                >
                  <Check className="h-3 w-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-semibold text-ink">{point.materialName}</span>
                    <span className="text-[11px] font-semibold tabular-nums text-emerald-700">
                      {point.quantity.toLocaleString("vi-VN")} {point.materialUnit}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground" title={pointLabel(point)}>
                    {pointLabel(point)}
                    {point.deviceIsFolder && <span className="ml-1 text-amber-700">· thư mục</span>}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {due && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: `${due.dot}1f`, color: due.dot }}
                      >
                        {due.label} · {formatDate(point.nextDueAt)}
                      </span>
                    )}
                    {point.openRequestNumber && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
                        <AlertTriangle className="h-2.5 w-2.5" /> Đang có SYC {point.openRequestNumber}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
