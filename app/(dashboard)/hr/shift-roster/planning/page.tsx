"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarClock, GitCompare, Loader2, Printer, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { printHtmlReport } from "@/lib/print-report";
import {
  ScheduleEntry,
  ScheduleComparison,
  ScheduleVersion,
  useCompareShiftSchedules,
  useGenerateShiftSchedule,
  useShiftScheduleVersion,
  useShiftScheduleVersions,
} from "@/hooks/useShiftScheduleVersions";

const STATUS_LABEL = { DRAFT: "Bản nháp", REVIEW: "Đang xem xét", APPROVED: "Đã duyệt", PUBLISHED: "Đã công bố", SUPERSEDED: "Đã thay thế" } as const;
const SHIFT_LABEL = { MORNING: "Sáng", AFTERNOON: "Chiều", NIGHT: "Đêm" } as const;
const CHANGE_LABEL: Record<string, string> = {
  ASSIGN_POSITION: "Thêm vào cương vị", REMOVE_POSITION: "Tách khỏi cương vị",
  TRANSFER_POSITION: "Điều chuyển cương vị", MOVE_TO_OFFICE: "Chuyển hành chính",
  CHANGE_CREW: "Đổi kíp", CHANGE_STATION: "Đổi S1/S2/FLEX",
};
const currentMonth = () => new Date().toISOString().slice(0, 7);
const viDate = (value: string) => new Date(value).toLocaleDateString("vi-VN", { timeZone: "UTC" });

export default function ShiftSchedulePlanningPage() {
  const searchParams = useSearchParams();
  const requestedFrom = searchParams.get("from");
  const [monthValue, setMonthValue] = React.useState(requestedFrom?.slice(0, 7) ?? currentMonth());
  const [year, month] = monthValue.split("-").map(Number);
  const query = useShiftScheduleVersions(year, month);
  const mutation = useGenerateShiftSchedule();
  const data = query.data?.data;
  const versions = data?.versions ?? [];
  const [selectedVersionId, setSelectedVersionId] = React.useState("");
  const [leftId, setLeftId] = React.useState(""), [rightId, setRightId] = React.useState("");
  const [positionId, setPositionId] = React.useState(searchParams.get("positionId") ?? "ALL");
  const [fromDate, setFromDate] = React.useState(requestedFrom ?? `${monthValue}-01`);
  const [reason, setReason] = React.useState("Phát sinh lịch dự kiến để kiểm tra");
  React.useEffect(() => {
    setFromDate(`${monthValue}-01`);
    setSelectedVersionId(""); setLeftId(""); setRightId("");
  }, [monthValue]);
  React.useEffect(() => {
    if (!selectedVersionId && versions[0]) setSelectedVersionId(versions[0].id);
  }, [selectedVersionId, versions]);
  const detail = useShiftScheduleVersion(selectedVersionId);
  const comparison = useCompareShiftSchedules(leftId, rightId);

  async function generate(action: "GENERATE" | "GENERATE_NEXT_MONTH", extra: Record<string, unknown> = {}) {
    try {
      await mutation.mutateAsync(action === "GENERATE_NEXT_MONTH" ? {
        action, generationReason: "Khởi tạo thủ công lịch dự kiến tháng sau",
      } : {
        action, year, month,
        positionIds: positionId === "ALL" ? undefined : [positionId],
        generatedFromDate: fromDate,
        basedOnVersionId: versions[0]?.id ?? null,
        generationReason: reason,
        ...extra,
      });
      toast.success("Đã tạo phiên bản lịch dự kiến mới");
    } catch (error) { toast.error((error as Error).message); }
  }
  async function regenerateEvent(eventId: string) {
    try {
      await mutation.mutateAsync({ action: "REGENERATE_FROM_EVENT", eventId, basedOnVersionId: versions[0]?.id ?? null });
      toast.success("Đã tạo lại lịch từ ngày hiệu lực");
    } catch (error) { toast.error((error as Error).message); }
  }
  if (query.isLoading) return <TableSkeleton />;
  if (query.isError) return <Card className="p-8 text-center text-destructive">{(query.error as Error).message}</Card>;
  return (
    <div className="space-y-6">
      <PageHeader title="LỊCH TRỰC CA DỰ KIẾN" description="Sinh lịch theo biên chế và vòng xoay · tạo phiên bản mới · không thay thế PDF chính thức">
        <Link href="/hr/shift-roster"><Button variant="outline"><ArrowLeft className="h-4 w-4" /> Lịch trực ca</Button></Link>
        <Button variant="outline" onClick={() => generate("GENERATE_NEXT_MONTH")} disabled={mutation.isPending}>
          <CalendarClock className="h-4 w-4" /> Khởi tạo tháng sau
        </Button>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="border-b bg-slate-900 px-4 py-3 text-white">
              <div className="font-semibold">Phát sinh lịch dự kiến</div>
              <div className="text-xs text-slate-300">Bản mới luôn được lưu ở trạng thái nháp</div>
            </div>
            <div className="space-y-4 p-4">
              <Field label="Tháng cần tạo"><Input type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} /></Field>
              <Field label="Phạm vi cương vị">
                <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3">
                  <option value="ALL">Toàn bộ phân xưởng</option>
                  {data?.positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
                </select>
              </Field>
              <Field label="Bắt đầu tính từ ngày"><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></Field>
              <Field label="Lý do"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <Button className="w-full" onClick={() => generate("GENERATE")} disabled={mutation.isPending || reason.trim().length < 3}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Phát sinh lịch dự kiến
              </Button>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="border-b px-4 py-3 font-semibold">Thay đổi biên chế trong tháng</div>
            <div className="max-h-80 space-y-2 overflow-y-auto p-3">
              {data?.events.map((event) => (
                <div key={event.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2"><b>{event.employeeId}</b><Badge variant="outline">{viDate(event.effectiveDate)}</Badge></div>
                  <div className="mt-1 text-xs font-medium text-blue-800">{CHANGE_LABEL[event.changeType] ?? event.changeType}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{event.reason}</div>
                  <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => regenerateEvent(event.id)} disabled={mutation.isPending}>
                    <RefreshCw className="h-3.5 w-3.5" /> Tạo lại từ ngày hiệu lực
                  </Button>
                </div>
              ))}
              {!data?.events.length && <div className="py-8 text-center text-sm text-muted-foreground">Chưa có thay đổi biên chế</div>}
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div><div className="font-semibold">Các phiên bản tháng {month}/{year}</div><div className="text-xs text-muted-foreground">Chọn một phiên bản để xem chi tiết</div></div>
              <select value={selectedVersionId} onChange={(e) => setSelectedVersionId(e.target.value)} className="h-10 rounded-md border bg-white px-3">
                {versions.map((version) => <option key={version.id} value={version.id}>Phiên bản {version.versionNumber} · {STATUS_LABEL[version.status]}</option>)}
              </select>
            </div>
            {detail.isLoading ? <div className="p-6"><TableSkeleton /></div> : detail.data?.data ? <VersionDetail version={detail.data.data} /> : <div className="p-12 text-center text-muted-foreground">Chưa có phiên bản lịch</div>}
          </Card>

          {versions.length >= 2 && (
            <Card className="overflow-hidden">
              <div className="border-b px-4 py-3"><div className="flex items-center gap-2 font-semibold"><GitCompare className="h-4 w-4" /> So sánh phiên bản</div></div>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {[{ value: leftId, set: setLeftId, label: "Phiên bản cũ" }, { value: rightId, set: setRightId, label: "Phiên bản mới" }].map((select) => (
                  <Field key={select.label} label={select.label}><select value={select.value} onChange={(e) => select.set(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3"><option value="">Chọn phiên bản</option>{versions.map((v) => <option key={v.id} value={v.id}>Phiên bản {v.versionNumber}</option>)}</select></Field>
                ))}
              </div>
              {comparison.data?.data && <Comparison data={comparison.data.data} />}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function VersionDetail({ version }: { version: ScheduleVersion }) {
  const entries = version.entries ?? [], warnings = version.generationWarnings ?? [];
  const positionOptions = React.useMemo(() => Array.from(
    new Map(entries.map((entry) => [entry.positionConfigId, entry.positionConfig?.name ?? entry.positionConfigId])).entries(),
  ).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "vi")), [entries]);
  const [matrixPositionId, setMatrixPositionId] = React.useState("");
  React.useEffect(() => {
    if (!positionOptions.some((item) => item.id === matrixPositionId)) setMatrixPositionId(positionOptions[0]?.id ?? "");
  }, [matrixPositionId, positionOptions]);
  return <div>
    <div className="grid grid-cols-2 gap-3 border-b bg-slate-50 p-4 sm:grid-cols-4">
      <Stat label="Trạng thái" value={STATUS_LABEL[version.status]} /><Stat label="Ô phân công" value={entries.length} />
      <Stat label="Cảnh báo" value={warnings.length} warning={warnings.length > 0} /><Stat label="Tính lại từ" value={viDate(version.generatedFromDate)} />
    </div>
    {warnings.length > 0 && <div className="border-b bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />{warnings.length} ca cần quản trị viên kiểm tra vì thiếu người hoặc xung đột.</div>}
    {matrixPositionId && <ScheduleCrewMatrix
      version={version}
      entries={entries.filter((entry) => entry.positionConfigId === matrixPositionId)}
      positionName={positionOptions.find((item) => item.id === matrixPositionId)?.name ?? "Cương vị"}
      positionOptions={positionOptions}
      selectedPositionId={matrixPositionId}
      onSelectPosition={setMatrixPositionId}
    />}
    <div className="max-h-[520px] overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-white text-left text-xs uppercase text-muted-foreground"><tr>{["Ngày", "Ca", "Cương vị", "S1/S2", "Mã NV", "Nguồn", "Khóa"].map((x) => <th key={x} className="border-b px-3 py-2">{x}</th>)}</tr></thead><tbody>{entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)}</tbody></table></div>
  </div>;
}

const MATRIX_SHIFTS = [
  { key: "MORNING", label: "CA SÁNG" },
  { key: "AFTERNOON", label: "CA CHIỀU" },
  { key: "NIGHT", label: "CA ĐÊM" },
] as const;

function matrixCrew(entries: ScheduleEntry[], day: number, shiftType: ScheduleEntry["shiftType"]) {
  return Array.from(new Set(entries
    .filter((entry) => Number(entry.date.slice(8, 10)) === day && entry.shiftType === shiftType)
    .map((entry) => entry.crewCode)
    .filter((code): code is string => !!code)))
    .sort((a, b) => a.localeCompare(b, "vi"))
    .join("/");
}

function escapePrintHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function ScheduleCrewMatrix({ version, entries, positionName, positionOptions, selectedPositionId, onSelectPosition }: {
  version: ScheduleVersion;
  entries: ScheduleEntry[];
  positionName: string;
  positionOptions: Array<{ id: string; name: string }>;
  selectedPositionId: string;
  onSelectPosition: (id: string) => void;
}) {
  const days = Array.from({ length: new Date(Date.UTC(version.year, version.month, 0)).getUTCDate() }, (_, index) => index + 1);
  const weekend = (day: number) => [0, 6].includes(new Date(Date.UTC(version.year, version.month - 1, day)).getUTCDay());
  const print = () => {
    const cells = (values: string[]) => values.map((value, index) => `<td class="${weekend(index + 1) ? "weekend" : ""}">${value ? escapePrintHtml(value) : "&nbsp;"}</td>`).join("");
    const rows = MATRIX_SHIFTS.map((shift) => `<tr><th>${shift.label}</th>${cells(days.map((day) => matrixCrew(entries, day, shift.key)))}</tr>`).join("");
    const safePositionName = escapePrintHtml(positionName);
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Lịch kíp ${safePositionName}</title><style>
      @page{size:A3 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:"Times New Roman",serif;margin:0;color:#000}h1,h2{text-align:center;margin:0}h1{font-size:18px}h2{font-size:15px;margin:3px 0 8px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}th,td{border:1.2px solid #000;text-align:center;height:27px;padding:2px;font-weight:700}th:first-child{width:92px}.month{background:#fff600;font-size:16px}.weekend{background:#ffc400}.note{text-align:center;font-weight:600;line-height:1.35;padding:7px}.note-label{font-size:14px}
    </style></head><body><h1>LỊCH ĐI CA VẬN HÀNH - ${safePositionName.toUpperCase()}</h1><h2>THÁNG ${version.month}/${version.year}</h2><table><thead><tr><th class="month">NGÀY</th>${days.map((day) => `<th class="${weekend(day) ? "weekend" : ""}">${day}</th>`).join("")}</tr></thead><tbody>${rows}<tr><th>HC</th>${cells(days.map(() => ""))}</tr><tr><th class="note-label">GHI CHÚ</th><td class="note" colspan="${days.length}">Lịch được phát sinh từ biên chế và mẫu xoay ca đang có hiệu lực. Các ngày HC hoặc điều chỉnh đặc biệt được quản trị viên bổ sung khi duyệt lịch.</td></tr></tbody></table></body></html>`;
    if (!printHtmlReport(html)) toast.error("Không mở được trình in lịch");
  };
  return <div className="border-b bg-[linear-gradient(180deg,#fffdf2_0%,#ffffff_100%)] p-4">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div><div className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Bảng kíp theo tháng</div><div className="mt-1 text-sm text-muted-foreground">Hiển thị mã kíp theo mẫu lịch vận hành</div></div>
      <div className="flex flex-wrap gap-2">
        <select value={selectedPositionId} onChange={(event) => onSelectPosition(event.target.value)} className="h-9 max-w-[320px] rounded-md border bg-white px-3 text-sm font-medium">
          {positionOptions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={print}><Printer className="h-4 w-4" /> In bảng kíp</Button>
      </div>
    </div>
    <div className="overflow-x-auto rounded-md border-2 border-slate-900 bg-white shadow-sm">
      <table className="w-full min-w-[1180px] table-fixed border-collapse font-serif text-xs text-slate-950">
        <thead><tr className="bg-yellow-300"><th className="w-24 border border-slate-900 px-2 py-1.5 text-sm">NGÀY</th>{days.map((day) => <th key={day} className={weekend(day) ? "border border-slate-900 bg-amber-400 py-1.5" : "border border-slate-900 py-1.5"}>{day}</th>)}</tr></thead>
        <tbody>{MATRIX_SHIFTS.map((shift) => <tr key={shift.key}><th className="border border-slate-900 px-1 py-1.5 text-sm">{shift.label}</th>{days.map((day) => <td key={day} className={weekend(day) ? "border border-slate-900 bg-amber-50 py-1.5 text-center font-bold" : "border border-slate-900 py-1.5 text-center font-bold"}>{matrixCrew(entries, day, shift.key) || ""}</td>)}</tr>)}<tr><th className="border border-slate-900 py-1.5 text-sm">HC</th>{days.map((day) => <td key={day} className="border border-slate-900 py-1.5" />)}</tr></tbody>
      </table>
    </div>
  </div>;
}
function EntryRow({ entry, tone }: { entry: ScheduleEntry; tone?: "added" | "removed" }) {
  return <tr className={tone === "added" ? "bg-emerald-50" : tone === "removed" ? "bg-rose-50" : "border-t hover:bg-slate-50"}>
    <td className="px-3 py-2">{viDate(entry.date)}</td><td className="px-3 py-2 font-medium">{SHIFT_LABEL[entry.shiftType]}</td>
    <td className="px-3 py-2">{entry.positionConfig?.name ?? entry.positionConfigId}</td><td className="px-3 py-2">{entry.stationCode ?? "—"}</td>
    <td className="px-3 py-2 font-mono">{entry.employeeId}</td><td className="px-3 py-2">{entry.source === "GENERATED" ? "Tự sinh" : "Thủ công"}</td><td className="px-3 py-2">{entry.isLocked ? "Đã khóa" : "—"}</td>
  </tr>;
}
function Comparison({ data }: { data: ScheduleComparison }) {
  return <div className="border-t p-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Stat label="Tổng ô" value={data.summary.totalEntries} /><Stat label="Thay đổi" value={data.summary.changed} /><Stat label="Được thêm" value={data.summary.added} /><Stat label="Bị bỏ" value={data.summary.removed} /><Stat label="Nhân sự ảnh hưởng" value={data.summary.affectedEmployees} /></div><div className="mt-4 max-h-72 overflow-auto"><table className="w-full min-w-[760px] text-sm"><tbody>{data.added.map((x) => <EntryRow key={`a-${x.id}`} entry={x} tone="added" />)}{data.removed.map((x) => <EntryRow key={`r-${x.id}`} entry={x} tone="removed" />)}</tbody></table></div></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function Stat({ label, value, warning }: { label: string; value: React.ReactNode; warning?: boolean }) { return <div className={`rounded-lg border px-3 py-2 ${warning ? "border-amber-300 bg-amber-50" : "bg-white"}`}><div className="text-xs text-muted-foreground">{label}</div><div className="mt-0.5 font-bold">{value}</div></div>; }
