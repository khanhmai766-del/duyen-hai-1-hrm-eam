import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronDown, Droplets, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { useLubricantSourceDates, useLubricantSupplements, useReplacements, useUpdateLubricantSourceDate, type ReplacementItem } from "@/hooks/useReplacements";
import { useCurrentPosition } from "@/hooks/useCurrentPosition";
import { lubricantNextDue, materialCategoryMatches, replacementIntervalLabel } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { positionsMatch } from "@/lib/position-catalog";
import { lubricantChainConveyors, lubricantCoalFeeders, lubricantHvacPumps } from "@/lib/lubricant-source-splits";
import { excelIntervalMonths, hasOilSupplement, parseExcelLastDate } from "@/lib/lubricant-excel-dates";
import { supplementDeviceKey, supplementIdKey, type SupplementInfo } from "@/lib/lubricant-supplements";
import { formatVNDate, parseVNDate } from "@/lib/tbycnn";
import { cn, formatDate, formatDateInput } from "@/lib/utils";
import groups from "./lubricant-statistics.json";
import { aphBearings, isExcelOnly, targetAcceptsCode, verifiedTarget, type VerifiedTarget } from "@/lib/lubricant-link-targets";

const normalize = (value: string) => normalizeText(value).replace(/\s+/g, " ").trim();
const PAGE_SIZE = 50;

type SourceRow = {
  key: string;
  originalKey?: string;
  originalName?: string;
  group: string;
  headers: string[];
  cells: string[];
  points: ReplacementItem[];
};

function bearingCells(cells: string[], bearing: ReturnType<typeof aphBearings>[number]) {
  const result = [...cells];
  result[2] = bearing.name;
  const volume = cells[5].split("\n").find((line) => normalize(line).includes(bearing.label));
  result[5] = volume?.match(/^\s*[\d.,]+\s*\S+/)?.[0].trim() ?? "";
  const dates = [...normalize(cells[6]).matchAll(
    new RegExp(`goi (?:do )?${bearing.label}\\s*:?\\s*(\\d{1,2}/\\d{1,2}/(?:\\d{4}|\\d{2}))\\b`, "g"),
  )].flatMap((match) => {
    const [day, month, year] = match[1].split("/");
    const date = parseVNDate(`${day}/${month}/${year.length === 2 ? `20${year}` : year}`);
    return date ? [date] : [];
  });
  const latest = dates.sort((a, b) => b.getTime() - a.getTime())[0];
  result[6] = latest ? formatVNDate(latest) : "";
  result[8] = "";
  return result;
}

function reconcile(points: ReplacementItem[]): SourceRow[] {
  const getMatches = (predicate: (point: ReplacementItem) => boolean) => {
    const matches = points.filter(predicate);
    return matches.length === 1 ? matches : [];
  };
  const matchTarget = (target: VerifiedTarget) => getMatches((point) =>
    point.machine === target.machine &&
    ("deviceSeq" in target ? point.deviceSeq === target.deviceSeq : normalize(point.location ?? "") === normalize(target.location)) &&
    targetAcceptsCode(target, point.material.code)
  );
  return groups.flatMap(({ name, headers, rows }) => {
    const machine = name.match(/S[12]$/)?.[0];
    const feederGroup = rows.find((cells) => cells[2] === `HGT Máy cấp ${machine}`);
    const feeders = feederGroup ? lubricantCoalFeeders(name, feederGroup[2]) : [];
    return rows.flatMap((cells, index) => {
      const key = `${name}:${index}`;
      if (feeders.some((feeder) => feeder.sourceAlias === cells[2])) return [];
      if (cells === feederGroup) return feeders.map((feeder) => {
        const individualIndex = rows.findIndex((row) => row[2] === feeder.sourceAlias);
        const feederCells = [...(rows[individualIndex] ?? cells)];
        feederCells[2] = feeder.name;
        return {
          key: `${key}:${feeder.suffix}`, originalKey: individualIndex >= 0 ? `${name}:${individualIndex}` : key,
          originalName: cells[2],
          group: name, headers, cells: feederCells, points: matchTarget(feeder.target),
        };
      });
      const [device, material, code] = cells.slice(2, 5).map(normalize);
      const bearings = aphBearings(name, device);
      if (bearings.length) return bearings.map((bearing) => ({
        key: `${key}:${bearing.label}`, group: name, headers, cells: bearingCells(cells, bearing), points: matchTarget(bearing.target),
      }));
      const chains = lubricantChainConveyors(name, cells[2]);
      if (chains.length) return chains.map((chain) => {
        const chainCells = [...cells];
        chainCells[2] = chain.name;
        return {
          key: `${key}:${chain.suffix}`, originalKey: key, group: name, headers, cells: chainCells,
          points: matchTarget(chain.target),
        };
      });
      const pumps = lubricantHvacPumps(name, cells[2]);
      if (pumps.length) return pumps.map((pump) => {
        const pumpCells = [...cells];
        pumpCells[2] = pump.name;
        return {
          key: `${key}:${pump.suffix}`, originalKey: key, group: name, headers, cells: pumpCells,
          points: matchTarget(pump.target),
        };
      });
      const target = verifiedTarget(name, cells[2], key);
      const matches = target ? matchTarget(target) : device && (material || code) ? getMatches((point) =>
        (!machine || point.machine === machine) &&
        point.device != null && normalize(point.device.name) === device &&
        (code ? normalize(point.material.code) === code : normalize(point.material.name) === material)
      ) : [];
      return [{ key, group: name, headers, cells, points: matches }];
    });
  });
}

function excelLastDateLabel(value?: string) {
  const date = parseExcelLastDate(value);
  return date ? formatVNDate(date) : !value || hasOilSupplement(value) ? "—" : value;
}

function excelCycleDue(cells: string[] | undefined, editedDate?: string) {
  const lastDate = parseExcelLastDate(editedDate ?? cells?.[6]);
  if (!lastDate) return null;

  const months = excelIntervalMonths(cells?.[7]);
  return months ? lubricantNextDue(lastDate.toISOString().slice(0, 10), months) : null;
}

type Line = {
  id: string;
  point?: ReplacementItem;
  source?: SourceRow;
  showSource: boolean;
  owner: string;
  device: string;
  area: string;
  material: string;
  code?: string;
  need: string;
  lastDate: string;
  nextDate: Date | null;
  status: "overdue" | "soon" | "ok" | "none";
  supplement?: SupplementInfo;
  editable: boolean;
  excelOnly: boolean;
};

const SOON_DAYS = 30;
const quantityLabel = (value: number | null | undefined) =>
  value == null ? "" : Number(value.toFixed(2)).toLocaleString("vi-VN");

function findSupplement(point: ReplacementItem | undefined, data?: Record<string, SupplementInfo>) {
  if (!point || !data) return undefined;
  return data[supplementIdKey(point.id)] ??
    (point.deviceSeq ? data[supplementDeviceKey(point.deviceSeq, point.machine, point.materialId)] : undefined);
}

function dueStatus(nextDate: Date | null): Line["status"] {
  if (!nextDate) return "none";
  const day = formatDateInput(nextDate);
  if (day < formatDateInput()) return "overdue";
  const soon = new Date();
  soon.setDate(soon.getDate() + SOON_DAYS);
  return day <= formatDateInput(soon) ? "soon" : "ok";
}

const statusStyle: Record<Line["status"], string> = {
  overdue: "text-red-700", soon: "text-amber-700", ok: "text-emerald-700", none: "text-muted-foreground",
};
const statusText: Record<Line["status"], string> = {
  overdue: "Quá hạn", soon: "Sắp đến hạn", ok: "Còn hạn", none: "",
};

export function LubricantStatistics({ search, onEdit, editAll = false }: {
  search: string;
  onEdit?: (point: ReplacementItem) => void;
  /** Chức danh giám sát: sửa mọi dòng, không giới hạn cương vị phụ trách. */
  editAll?: boolean;
}) {
  const query = useReplacements();
  const { position } = useCurrentPosition();
  const sourceDates = useLubricantSourceDates();
  const supplements = useLubricantSupplements();
  const updateSourceDate = useUpdateLubricantSourceDate();
  const [sourceEdit, setSourceEdit] = useState<{ sourceKey: string; name: string; date: string } | null>(null);
  const [group, setGroup] = useState("");
  const [positionChoice, setPositionChoice] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [lastSearch, setLastSearch] = useState(search);
  if (lastSearch !== search) {
    setLastSearch(search);
    setPage(1);
  }
  const points = useMemo(() => (query.data?.data ?? []).filter((point) =>
    materialCategoryMatches(point.material.category, "Dầu bôi trơn")), [query.data?.data]);
  const source = useMemo(() => reconcile(points), [points]);
  const allRows = useMemo(() => {
    const linkedIds = new Set(source.flatMap((row) => row.points.map((point) => point.id)));
    return [
      ...source.map((row): { points: ReplacementItem[]; source?: SourceRow } => ({ points: row.points, source: row })),
      ...points.filter((point) => !linkedIds.has(point.id)).map((point) => ({ points: [point], source: undefined })),
    ];
  }, [points, source]);

  const lines = useMemo(() => allRows.flatMap((row): Line[] => {
    const sourceRow = row.source;
    const rowPoints = row.points.length ? row.points : [undefined];
    return rowPoints.map((point, pointIndex) => {
      const cells = sourceRow?.cells;
      const saved = sourceRow && (sourceDates.data?.[sourceRow.key] ??
        (sourceRow.originalKey && sourceDates.data?.[sourceRow.originalKey]));
      const editedDate = saved ? formatVNDate(`${saved}T00:00:00Z`) : undefined;
      const webDevice = point?.device?.name ?? point?.location;
      const nextDate = point ? lubricantNextDue(point.lastReplacedAt, point.intervalMonths) : excelCycleDue(cells, editedDate);
      const owner = (point ? point.managingPositionCode ?? point.managingPosition : cells?.[1]) ?? "";
      return {
        id: [sourceRow?.key, point?.id].filter(Boolean).join(":") || `p${pointIndex}`,
        point, source: sourceRow, showSource: pointIndex === rowPoints.length - 1, owner,
        device: ((webDevice === "Bồn dầu" && cells?.[2] ? cells[2] : webDevice) ?? cells?.[2]) || "Chưa gắn thiết bị",
        area: [sourceRow?.group ?? point?.machine, point?.managingPosition ?? cells?.[1]].filter(Boolean).join(" · "),
        material: (point?.material.name ?? cells?.[3]) || "Chưa ghi loại dầu mỡ",
        code: point?.material.code ?? cells?.[4],
        need: point ? `${point.quantity} ${point.material.unit}` : cells?.[5]?.split("\n")[0] ?? "",
        lastDate: (point ? formatDate(point.lastReplacedAt) : editedDate || excelLastDateLabel(cells?.[6])).split("\n")[0],
        nextDate, status: dueStatus(nextDate),
        supplement: findSupplement(point, supplements.data),
        editable: !!onEdit && (editAll || positionsMatch(position, owner)),
        excelOnly: !point && !!sourceRow && isExcelOnly(sourceRow.key),
      };
    });
  }), [allRows, sourceDates.data, supplements.data, onEdit, position, editAll]);

  const positionOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const line of lines) {
      const label = line.point?.managingPosition ?? line.source?.cells[1];
      if (label && !seen.has(normalize(label))) seen.set(normalize(label), label);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, "vi"));
  }, [lines]);
  // Mặc định lọc theo cương vị đang làm việc nếu cương vị đó có trong danh sách.
  const defaultPosition = positionOptions.find((option) => positionsMatch(position, option)) ?? "";
  const positionFilter = positionChoice ?? defaultPosition;

  const needle = normalize(search);
  const rows = lines.filter((line) =>
    (!group || (group === "other" ? !line.source : line.source?.group === group)) &&
    (!positionFilter || positionsMatch(positionFilter, line.owner) || normalize(line.owner) === normalize(positionFilter)) &&
    (!statusFilter || (statusFilter === "unlinked" ? !line.point && !line.excelOnly : statusFilter === "excel" ? line.excelOnly : line.status === statusFilter)) &&
    normalize([line.source?.group, line.source?.originalName, ...(line.source?.cells ?? []), line.device, line.material,
      line.code, line.point?.system, line.point?.managingPosition, line.point?.machine].join(" ")).includes(needle));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const activePage = Math.min(page, pages);
  const linked = rows.filter((line) => line.point).length;
  const excelOnlyCount = rows.filter((line) => line.excelOnly).length;

  function editSource(row: SourceRow) {
    const initial = parseExcelLastDate(row.cells[6])?.toISOString().slice(0, 10) ?? "";
    const saved = sourceDates.data?.[row.key] ?? (row.originalKey && sourceDates.data?.[row.originalKey]);
    setSourceEdit({ sourceKey: row.key, name: row.cells[2], date: saved ?? initial });
  }
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const selectClass = "h-9 min-w-0 rounded-lg border border-border bg-background px-2 text-sm";

  return (
    <section aria-label="Thống kê thay dầu mỡ" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-navy">
          <Droplets className="h-5 w-5" aria-hidden="true" />Theo dõi dầu mỡ thiết bị
        </h2>
        <span className="text-xs text-muted-foreground">{rows.length} dòng · {linked} đã liên kết · {excelOnlyCount} theo Excel</span>
        <div className="ml-auto grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <select aria-label="Nhóm thiết bị" className={selectClass} value={group}
            onChange={(event) => { setGroup(event.target.value); setPage(1); }}>
            <option value="">Tất cả nhóm</option>
            {groups.map(({ name }) => <option key={name}>{name}</option>)}
            {(group === "other" || allRows.some((row) => !row.source)) && <option value="other">Nhóm khác</option>}
          </select>
          <select aria-label="Cương vị" className={selectClass} value={positionFilter}
            onChange={(event) => { setPositionChoice(event.target.value); setPage(1); }}>
            <option value="">Tất cả cương vị</option>
            {positionOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
          <select aria-label="Trạng thái" className={selectClass} value={statusFilter}
            onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
            <option value="">Mọi trạng thái</option>
            <option value="overdue">Quá hạn</option>
            <option value="soon">Sắp đến hạn (≤ {SOON_DAYS} ngày)</option>
            <option value="unlinked">Chưa liên kết</option>
            <option value="excel">Theo Excel</option>
          </select>
        </div>
      </div>

      {query.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Không tải được điểm theo dõi trên web.
          <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>Thử lại</Button>
        </div>
      )}
      {query.isLoading ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">Đang tải điểm theo dõi…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={BarChart3} title="Không tìm thấy dòng phù hợp" />
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="text-left text-muted-foreground [&>th]:sticky [&>th]:top-0 [&>th]:z-20 [&>th]:border-b [&>th]:border-border [&>th]:bg-muted [&>th]:px-2 [&>th]:py-2 [&>th]:font-semibold [&>th]:whitespace-nowrap">
                  <th className="left-0 z-30 min-w-[180px] max-w-[260px]">Thiết bị</th>
                  <th>Vật tư</th><th>KL cần thay</th><th>Thay gần nhất</th><th>Kế tiếp</th>
                  <th>Bổ sung gần nhất</th><th>KL bổ sung</th><th>Liên kết</th><th><span className="sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:border-b [&>tr>td]:border-border [&>tr>td]:px-2 [&>tr>td]:py-1.5 [&>tr>td]:align-top">
                {rows.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE).map((line) => {
                  const open = expanded.has(line.id);
                  return (
                    <Fragment key={line.id}>
                      <tr className="hover:bg-muted/30">
                        <td className="sticky left-0 z-10 min-w-[180px] max-w-[260px] bg-background">
                          <div className="font-semibold text-ink">{line.device}</div>
                          <div className="text-[11px] text-muted-foreground">{line.area}</div>
                        </td>
                        <td className="min-w-[160px] max-w-[240px]">
                          {line.point ? (
                            <Link className="font-medium text-navy hover:underline" href={`/materials?may=${encodeURIComponent(line.point.material.machine ?? line.point.machine)}&track=${encodeURIComponent(line.point.materialId)}`}>
                              {line.material}
                            </Link>
                          ) : <span className="whitespace-pre-line">{line.material}</span>}
                          {line.code && <div className="text-[11px] text-muted-foreground">{line.code}</div>}
                        </td>
                        <td className="whitespace-nowrap">{line.need || "—"}</td>
                        <td className="whitespace-nowrap">{line.lastDate}</td>
                        <td className={cn("whitespace-nowrap font-semibold", statusStyle[line.status])}>
                          {line.nextDate ? formatDate(line.nextDate) : "—"}
                          {line.status !== "none" && <span className="ml-1 text-[11px] font-normal">{statusText[line.status]}</span>}
                        </td>
                        <td className="whitespace-nowrap">{line.supplement ? formatDate(line.supplement.date) : "—"}</td>
                        <td className="whitespace-nowrap">
                          {line.supplement?.quantity != null
                            ? `${quantityLabel(line.supplement.quantity)} ${line.supplement.unit ?? line.point?.material.unit ?? ""}`.trim()
                            : "—"}
                        </td>
                        <td className="whitespace-nowrap">
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px]", line.point ? "bg-emerald-50 text-emerald-700" : line.excelOnly ? "bg-muted text-muted-foreground" : "bg-amber-50 text-amber-800")}>
                            {line.point ? "Đã liên kết" : line.excelOnly ? "Theo Excel" : "Chưa liên kết"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-right">
                          {line.editable && (
                            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-navy"
                              onClick={() => line.point ? onEdit?.(line.point) : line.source && editSource(line.source)}
                              aria-label={`Sửa lần thay gần nhất của ${line.device}`}>
                              <Pencil className="size-3" /> Sửa
                            </Button>
                          )}
                          {line.source && line.showSource && (
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground"
                              aria-expanded={open} aria-label={`Chi tiết dòng Excel của ${line.device}`} onClick={() => toggle(line.id)}>
                              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
                            </Button>
                          )}
                        </td>
                      </tr>
                      {open && line.source && (
                        <tr>
                          <td colSpan={9} className="bg-muted/30">
                            <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {line.point && <div className="min-w-0 break-words"><dt className="font-semibold text-muted-foreground">Chu kỳ web</dt>
                                <dd>{replacementIntervalLabel(line.point.intervalMonths, line.point.intervalNote)}</dd></div>}
                              {line.source.headers.map((label, index) => line.source?.cells[index] && (
                                <div key={index} className="min-w-0 break-words">
                                  <dt className="font-semibold text-muted-foreground">{label}</dt>
                                  <dd className="whitespace-pre-line">{index === 6 ? excelLastDateLabel(line.source.cells[index]) : line.source.cells[index]}</dd>
                                </div>
                              ))}
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm">
            <span aria-live="polite" className="text-muted-foreground">Trang {activePage}/{pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={activePage === 1} onClick={() => setPage(activePage - 1)}>Trước</Button>
              <Button size="sm" variant="outline" disabled={activePage === pages} onClick={() => setPage(activePage + 1)}>Sau</Button>
            </div>
          </div>
        </Card>
      )}
      <Dialog open={!!sourceEdit} onOpenChange={(open) => { if (!open && !updateSourceDate.isPending) setSourceEdit(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Sửa lần thay gần nhất</DialogTitle></DialogHeader>
          {sourceEdit && (
            <form className="space-y-4" onSubmit={async (event) => {
              event.preventDefault();
              try {
                await updateSourceDate.mutateAsync({ sourceKey: sourceEdit.sourceKey, date: sourceEdit.date });
                setSourceEdit(null);
                toast.success("Đã lưu lần thay gần nhất");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Không lưu được ngày thay");
              }
            }}>
              <p className="text-sm font-medium">{sourceEdit.name}</p>
              <label className="block text-sm">
                Ngày thay gần nhất
                <Input type="date" className="mt-1" value={sourceEdit.date} required
                  onChange={(event) => setSourceEdit({ ...sourceEdit, date: event.target.value })} />
              </label>
              <Button type="submit" disabled={updateSourceDate.isPending}>Lưu thay đổi</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
