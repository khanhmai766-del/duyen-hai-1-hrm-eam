"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarClock, FileSpreadsheet, GitCompare, Loader2, Printer, RefreshCw, Sparkles } from "lucide-react";
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
import { apiDownload, apiGet } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import {
  ScheduleEntry,
  ScheduleComparison,
  ScheduleListData,
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
  const [monthCount, setMonthCount] = React.useState(1);
  const rbac = useRbacAccess();
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
      } : monthCount > 1 ? {
        action: "GENERATE_RANGE", year, month, monthCount,
        positionIds: positionId === "ALL" ? undefined : [positionId],
        generatedFromDate: fromDate,
        generationReason: reason,
      } : {
        action, year, month,
        positionIds: positionId === "ALL" ? undefined : [positionId],
        generatedFromDate: fromDate,
        basedOnVersionId: versions[0]?.id ?? null,
        generationReason: reason,
        ...extra,
      });
      toast.success(monthCount > 1 ? `Đã tạo lịch dự kiến cho ${monthCount} tháng` : "Đã tạo phiên bản lịch dự kiến mới");
    } catch (error) { toast.error((error as Error).message); }
  }
  async function changeStatus(action: "SUBMIT_REVIEW" | "APPROVE" | "PUBLISH", versionId: string) {
    try {
      await mutation.mutateAsync({ action, versionId });
      toast.success(action === "SUBMIT_REVIEW" ? "Đã gửi lịch để duyệt" : action === "APPROVE" ? "Đã duyệt lịch" : "Đã công bố lịch chính thức");
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
      <PageHeader title="LỊCH TRỰC CA THÁNG / QUÝ" description="Phát sinh dự kiến · kiểm tra · duyệt và công bố thành lịch chính thức">
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
              <Field label="Thời hạn phát hành">
                <select value={monthCount} onChange={(e) => setMonthCount(Number(e.target.value))} className="h-10 w-full rounded-md border bg-white px-3">
                  <option value={1}>1 tháng</option>
                  <option value={2}>2 tháng</option>
                  <option value={3}>3 tháng — theo quý</option>
                </select>
              </Field>
              <Field label="Phạm vi cương vị">
                <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3">
                  <option value="ALL">Toàn bộ phân xưởng</option>
                  {data?.positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
                </select>
              </Field>
              <Field label="Bắt đầu tính từ ngày"><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></Field>
              <Field label="Lý do"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <Button className="w-full" onClick={() => generate("GENERATE")} disabled={mutation.isPending || reason.trim().length < 3}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {monthCount === 1 ? "Phát sinh lịch dự kiến" : `Phát sinh ${monthCount} tháng`}
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
            {detail.isLoading ? <div className="p-6"><TableSkeleton /></div> : detail.data?.data ? <VersionDetail
              version={detail.data.data}
              onChangeStatus={changeStatus}
              isPending={mutation.isPending}
              canSubmit={rbac.can("shift-schedule-generate", ["manage", "full"])}
              canApprove={rbac.can("shift-schedule-approve", ["approve", "full"])}
              canPublish={rbac.can("shift-schedule-publish", ["approve", "full"])}
            /> : <div className="p-12 text-center text-muted-foreground">Chưa có phiên bản lịch</div>}
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

function VersionDetail({ version, onChangeStatus, isPending, canSubmit, canApprove, canPublish }: {
  version: ScheduleVersion;
  onChangeStatus: (action: "SUBMIT_REVIEW" | "APPROVE" | "PUBLISH", versionId: string) => void;
  isPending: boolean; canSubmit: boolean; canApprove: boolean; canPublish: boolean;
}) {
  const entries = version.entries ?? [], warnings = version.generationWarnings ?? [];
  const positionOptions = React.useMemo(() => Array.from(
    new Map(entries.map((entry) => [entry.positionConfigId, entry.positionConfig?.name ?? entry.positionConfigId])).entries(),
  ).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "vi")), [entries]);
  const [matrixPositionId, setMatrixPositionId] = React.useState("");
  React.useEffect(() => {
    if (!positionOptions.some((item) => item.id === matrixPositionId)) setMatrixPositionId(positionOptions[0]?.id ?? "");
  }, [matrixPositionId, positionOptions]);
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-900 px-4 py-3 text-white">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.12em] text-amber-300">Quy trình phát hành</div>
        <div className="mt-0.5 text-sm">Bản nháp → Đang xem xét → Đã duyệt → Chính thức</div>
      </div>
      <div className="flex gap-2">
        {version.status === "DRAFT" && canSubmit && <Button size="sm" variant="secondary" disabled={isPending} onClick={() => onChangeStatus("SUBMIT_REVIEW", version.id)}>Gửi duyệt</Button>}
        {version.status === "REVIEW" && canApprove && <Button size="sm" className="bg-amber-500 text-slate-950 hover:bg-amber-400" disabled={isPending} onClick={() => onChangeStatus("APPROVE", version.id)}>Duyệt lịch</Button>}
        {version.status === "APPROVED" && canPublish && <Button size="sm" className="bg-emerald-500 hover:bg-emerald-400" disabled={isPending} onClick={() => onChangeStatus("PUBLISH", version.id)}>Công bố chính thức</Button>}
        {version.status === "PUBLISHED" && <Badge className="border-emerald-300 bg-emerald-500 text-white">Lịch chính thức</Badge>}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 border-b bg-slate-50 p-4 sm:grid-cols-4">
      <Stat label="Trạng thái" value={STATUS_LABEL[version.status]} /><Stat label="Ô phân công" value={entries.length} />
      <Stat label="Cảnh báo" value={warnings.length} warning={warnings.length > 0} /><Stat label="Tính lại từ" value={viDate(version.generatedFromDate)} />
    </div>
    {warnings.length > 0 && <div className="border-b border-amber-200 bg-amber-50/70 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-950">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-slate-950"><AlertTriangle className="h-4 w-4" /></span>
        Chi tiết {warnings.length} cảnh báo cần kiểm tra
      </div>
      <div className="max-h-64 overflow-auto rounded-lg border border-amber-200 bg-white">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="sticky top-0 bg-amber-100 text-left text-xs uppercase tracking-wide text-amber-950">
            <tr><th className="px-3 py-2">Ngày</th><th className="px-3 py-2">Ca</th><th className="px-3 py-2">Cương vị</th><th className="px-3 py-2">Nội dung</th></tr>
          </thead>
          <tbody>{warnings.map((warning, index) => <tr key={`${warning.date}-${warning.positionId}-${warning.shiftType}-${index}`} className="border-t border-amber-100">
            <td className="whitespace-nowrap px-3 py-2 font-medium">{viDate(warning.date)}</td>
            <td className="px-3 py-2">{SHIFT_LABEL[warning.shiftType as keyof typeof SHIFT_LABEL] ?? warning.shiftType}</td>
            <td className="px-3 py-2 font-semibold">{warning.positionName ?? warning.positionId}</td>
            <td className="px-3 py-2 text-amber-900">{warning.message}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}
    {matrixPositionId && <ScheduleCrewMatrix
      version={version}
      entries={entries.filter((entry) => entry.positionConfigId === matrixPositionId)}
      positionName={positionOptions.find((item) => item.id === matrixPositionId)?.name ?? "Cương vị"}
      positionOptions={positionOptions}
      selectedPositionId={matrixPositionId}
      onSelectPosition={setMatrixPositionId}
    />}
  </div>;
}

const MATRIX_SHIFTS = [
  { key: "MORNING", label: "CA SÁNG" },
  { key: "AFTERNOON", label: "CA CHIỀU" },
  { key: "NIGHT", label: "CA ĐÊM" },
] as const;

function matrixCrew(
  entries: ScheduleEntry[],
  day: number,
  shiftType: ScheduleEntry["shiftType"],
  stationCode?: "S1" | "S2",
) {
  return Array.from(new Set(entries
    .filter((entry) =>
      Number(entry.date.slice(8, 10)) === day &&
      entry.shiftType === shiftType &&
      (!stationCode || entry.stationCode === stationCode),
    )
    .map((entry) => entry.crewCode)
    .filter((code): code is string => !!code)))
    .sort((a, b) => a.localeCompare(b, "vi"))
    .join("/");
}

function escapePrintHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function monthsInRange(from: string, to: string) {
  const [fromYear, fromMonth] = from.split("-").map(Number), [toYear, toMonth] = to.split("-").map(Number);
  const count = (toYear - fromYear) * 12 + toMonth - fromMonth + 1;
  if (count < 1 || count > 3) return [];
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(fromYear, fromMonth - 1 + index, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  });
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
  const hasTwoStations = entries[0]?.positionConfig?.positionType === "S1_S2" ||
    (entries.some((entry) => entry.stationCode === "S1") && entries.some((entry) => entry.stationCode === "S2"));
  const stationsHaveSameSchedule = hasTwoStations && days.every((day) =>
    MATRIX_SHIFTS.every((shift) =>
      matrixCrew(entries, day, shift.key, "S1") === matrixCrew(entries, day, shift.key, "S2"),
    ),
  );
  const showSeparateStations = hasTwoStations && !stationsHaveSameSchedule;
  const changeDate = new Date(`${version.generatedFromDate.slice(0, 10)}T00:00:00.000Z`);
  const contextStart = new Date(changeDate);
  contextStart.setUTCDate(contextStart.getUTCDate() - 2);
  const dayTone = (day: number) => {
    const value = new Date(Date.UTC(version.year, version.month - 1, day));
    if (value < contextStart) return "history" as const;
    if (value >= changeDate) return "changed" as const;
    return "context" as const;
  };
  const dayCellClass = (day: number, header = false) => cn(
    "border border-slate-900 py-1.5 text-center font-bold",
    dayTone(day) === "history" && "bg-slate-100 text-slate-400",
    dayTone(day) === "changed" && (header ? "bg-amber-300" : "bg-amber-50"),
    weekend(day) && (header ? "bg-amber-400 text-slate-950" : "bg-amber-50 text-slate-950"),
    dayTone(day) === "changed" && day === changeDate.getUTCDate() && "border-l-4 border-l-blue-600",
  );
  const currentMonthKey = `${version.year}-${String(version.month).padStart(2, "0")}`;
  const [printFrom, setPrintFrom] = React.useState(currentMonthKey);
  const [printTo, setPrintTo] = React.useState(currentMonthKey);
  const [printMode, setPrintMode] = React.useState<"POSITION" | "ROTATION">("ROTATION");
  const [isExporting, setIsExporting] = React.useState(false);
  const [isExportingMatrix, setIsExportingMatrix] = React.useState(false);
  React.useEffect(() => { setPrintFrom(currentMonthKey); setPrintTo(currentMonthKey); }, [currentMonthKey]);
  const exportExcel = async () => {
    const range = monthsInRange(printFrom, printTo);
    if (!range.length) return toast.error("Khoảng xuất phải từ 1 đến tối đa 3 tháng liên tiếp");
    setIsExporting(true);
    try {
      const { blob, filename } = await apiDownload(`/api/shift-schedule-versions/export-quarter?from=${printFrom}&count=${range.length}`);
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = filename; anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Đã xuất Excel lịch đã công bố");
    } catch (error) { toast.error((error as Error).message); }
    finally { setIsExporting(false); }
  };
  const exportCrewMatrix = async () => {
    const range = monthsInRange(printFrom, printTo);
    if (!range.length) return toast.error("Khoảng xuất phải từ 1 đến tối đa 3 tháng liên tiếp");
    setIsExportingMatrix(true);
    try {
      const query = new URLSearchParams({
        from: printFrom,
        count: String(range.length),
        versionId: version.id,
        positionId: selectedPositionId,
        mode: printMode,
        matrixOnly: "1",
      });
      const { blob, filename } = await apiDownload(`/api/shift-schedule-versions/export-quarter?${query}`);
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Đã xuất Excel bảng kíp để chỉnh sửa");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsExportingMatrix(false);
    }
  };
  const print = async () => {
    const range = monthsInRange(printFrom, printTo);
    if (!range.length) return toast.error("Khoảng in phải từ 1 đến tối đa 3 tháng liên tiếp");
    const selectedMonths: Array<{ version: ScheduleVersion; entries: ScheduleEntry[]; label: string; templateLabel?: string }> = [];
    const resolvePrintSelection = (detailVersion: ScheduleVersion, fallbackEntries: ScheduleEntry[]) => {
      const group = detailVersion.rotationGroups?.find((item) => item.positions.some((position) => position.id === selectedPositionId));
      const grouped = printMode === "ROTATION" && group;
      const allEntries = detailVersion.entries ?? fallbackEntries;
      return {
        // Các cương vị cùng mẫu dùng chung một vòng xoay; lấy cương vị đang
        // chọn làm lịch đại diện để mỗi ô luôn chỉ có đúng một mã kíp.
        entries: allEntries.filter((entry) => entry.positionConfigId === selectedPositionId),
        label: grouped ? group.positions.map((position) => position.name).join(" · ") : positionName,
        templateLabel: grouped ? `${group.templateCode} — ${group.templateName}` : undefined,
      };
    };
    try {
      for (const target of range) {
        if (target.year === version.year && target.month === version.month) {
          selectedMonths.push({ version, ...resolvePrintSelection(version, entries) });
          continue;
        }
        const list = await apiGet<ScheduleListData>(`/api/shift-schedule-versions?year=${target.year}&month=${target.month}`);
        const preferred = list.data?.versions.find((item) => item.status === "PUBLISHED") ?? list.data?.versions[0];
        if (!preferred) throw new Error(`Chưa có lịch tháng ${target.month}/${target.year}`);
        const detail = await apiGet<ScheduleVersion>(`/api/shift-schedule-versions?id=${preferred.id}`);
        if (!detail.data) throw new Error(`Không đọc được lịch tháng ${target.month}/${target.year}`);
        selectedMonths.push({ version: detail.data, ...resolvePrintSelection(detail.data, detail.data.entries ?? []) });
      }
    } catch (error) { return toast.error((error as Error).message); }
    const safePositionName = escapePrintHtml(positionName);
    const sections = selectedMonths.map(({ version: printVersion, entries: printEntries, label, templateLabel }) => {
      const printDays = Array.from({ length: new Date(Date.UTC(printVersion.year, printVersion.month, 0)).getUTCDate() }, (_, index) => index + 1);
      const isWeekend = (day: number) => [0, 6].includes(new Date(Date.UTC(printVersion.year, printVersion.month - 1, day)).getUTCDay());
      const printHasTwoStations = printEntries[0]?.positionConfig?.positionType === "S1_S2" ||
        (printEntries.some((entry) => entry.stationCode === "S1") && printEntries.some((entry) => entry.stationCode === "S2"));
      const printSameStations = printHasTwoStations && printDays.every((day) => MATRIX_SHIFTS.every((shift) => matrixCrew(printEntries, day, shift.key, "S1") === matrixCrew(printEntries, day, shift.key, "S2")));
      const separateStations = printHasTwoStations && !printSameStations;
      const cells = (values: string[]) => values.map((value, index) => `<td class="${isWeekend(index + 1) ? "weekend" : ""}">${value ? escapePrintHtml(value) : "&nbsp;"}</td>`).join("");
      const stationRows = (station: "S1" | "S2") => MATRIX_SHIFTS.map((shift, index) => `<tr>${index === 0 ? `<th rowspan="4" class="station">${station}</th>` : ""}<th>${shift.label}</th>${cells(printDays.map((day) => matrixCrew(printEntries, day, shift.key, station)))}</tr>`).join("") + `<tr><th>HC</th>${cells(printDays.map(() => ""))}</tr>`;
      const rows = separateStations ? stationRows("S1") + stationRows("S2") : MATRIX_SHIFTS.map((shift) => `<tr><th>${shift.label}</th>${cells(printDays.map((day) => matrixCrew(printEntries, day, shift.key)))}</tr>`).join("") + `<tr><th>HC</th>${cells(printDays.map(() => ""))}</tr>`;
      return `<section><h1>LỊCH ĐI CA VẬN HÀNH${templateLabel ? ` — ${escapePrintHtml(templateLabel).toUpperCase()}` : ""}</h1><h3>ÁP DỤNG CHO: ${escapePrintHtml(label).toUpperCase()}</h3><h2>THÁNG ${printVersion.month}/${printVersion.year}</h2><table><thead><tr>${separateStations ? '<th class="station">MÁY</th>' : ''}<th class="month shift">NGÀY</th>${printDays.map((day) => `<th class="${isWeekend(day) ? "weekend" : ""}">${day}</th>`).join("")}</tr></thead><tbody>${rows}<tr><th class="note-label" colspan="${separateStations ? 2 : 1}">GHI CHÚ</th><td class="note" colspan="${printDays.length}">Lịch được phát sinh từ biên chế và mẫu xoay ca đang có hiệu lực.</td></tr></tbody></table></section>`;
    }).join("");
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Lịch kíp ${safePositionName}</title><style>
      @page{size:A3 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:"Times New Roman",serif;margin:0;color:#000}section{break-after:page;page-break-after:always}section:last-child{break-after:auto;page-break-after:auto}h1,h2,h3{text-align:center;margin:0}h1{font-size:18px}h3{font-size:13px;margin-top:3px}h2{font-size:15px;margin:3px 0 8px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}th,td{border:1.2px solid #000;text-align:center;height:27px;padding:2px;font-weight:700}.station{width:48px;font-size:14px}.shift{width:92px}.month{background:#fff600;font-size:16px}.weekend{background:#ffc400}.note{text-align:center;font-weight:600;line-height:1.35;padding:7px}.note-label{font-size:14px}
    </style></head><body>${sections}</body></html>`;
    if (!printHtmlReport(html)) toast.error("Không mở được trình in lịch");
  };
  return <div className="border-b bg-[linear-gradient(180deg,#fffdf2_0%,#ffffff_100%)] p-4">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div><div className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Bảng kíp theo tháng</div><div className="mt-1 text-sm text-muted-foreground">Hiển thị mã kíp theo mẫu lịch vận hành</div></div>
      <div className="flex flex-wrap gap-2">
        <select value={selectedPositionId} onChange={(event) => onSelectPosition(event.target.value)} className="h-9 max-w-[320px] rounded-md border bg-white px-3 text-sm font-medium">
          {positionOptions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
        </select>
        <select value={printMode} onChange={(event) => setPrintMode(event.target.value as "POSITION" | "ROTATION")} aria-label="Phạm vi in" className="h-9 rounded-md border bg-white px-3 text-sm font-medium">
          <option value="ROTATION">In chung theo mẫu xoay</option>
          <option value="POSITION">In riêng cương vị này</option>
        </select>
        <Input type="month" value={printFrom} onChange={(event) => setPrintFrom(event.target.value)} aria-label="In từ tháng" className="h-9 w-[150px]" />
        <Input type="month" value={printTo} onChange={(event) => setPrintTo(event.target.value)} aria-label="In đến tháng" className="h-9 w-[150px]" />
        <Button size="sm" variant="outline" onClick={exportCrewMatrix} disabled={isExportingMatrix}>
          {isExportingMatrix ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Xuất Excel bảng kíp
        </Button>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-600" onClick={exportExcel} disabled={isExporting}>
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Xuất Excel lịch công bố
        </Button>
      </div>
    </div>
    <div className="overflow-x-auto rounded-md border-2 border-slate-900 bg-white shadow-sm">
      <table className="w-full min-w-[1180px] table-fixed border-collapse font-serif text-xs text-slate-950">
        <thead><tr className="bg-yellow-300">{showSeparateStations && <th className="w-12 border border-slate-900 px-1 py-1.5 text-sm">MÁY</th>}<th className="w-24 border border-slate-900 px-2 py-1.5 text-sm">NGÀY</th>{days.map((day) => <th key={day} className={dayCellClass(day, true)} title={dayTone(day) === "history" ? "Lịch cũ trước vùng đối chiếu" : dayTone(day) === "changed" ? "Lịch từ ngày thay đổi" : "Hai ngày đối chiếu trước thay đổi"}>{day}</th>)}</tr></thead>
        <tbody>{showSeparateStations ? (["S1", "S2"] as const).flatMap((station) => [
          ...MATRIX_SHIFTS.map((shift, index) => <tr key={`${station}-${shift.key}`}>{index === 0 && <th rowSpan={4} className="border border-slate-900 text-sm">{station}</th>}<th className="border border-slate-900 px-1 py-1.5 text-sm">{shift.label}</th>{days.map((day) => <td key={day} className={dayCellClass(day)}>{matrixCrew(entries, day, shift.key, station) || ""}</td>)}</tr>),
          <tr key={`${station}-HC`}><th className="border border-slate-900 py-1.5 text-sm">HC</th>{days.map((day) => <td key={day} className={dayCellClass(day)} />)}</tr>,
        ]) : <>{MATRIX_SHIFTS.map((shift) => <tr key={shift.key}><th className="border border-slate-900 px-1 py-1.5 text-sm">{shift.label}</th>{days.map((day) => <td key={day} className={dayCellClass(day)}>{matrixCrew(entries, day, shift.key) || ""}</td>)}</tr>)}<tr><th className="border border-slate-900 py-1.5 text-sm">HC</th>{days.map((day) => <td key={day} className={dayCellClass(day)} />)}</tr></>}</tbody>
      </table>
    </div>
    <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span><i className="mr-1 inline-block h-3 w-3 rounded-sm border bg-slate-100 align-[-2px]" />Lịch cũ trước vùng đối chiếu</span>
      <span><i className="mr-1 inline-block h-3 w-3 rounded-sm border bg-white align-[-2px]" />2 ngày đối chiếu trước thay đổi</span>
      <span><i className="mr-1 inline-block h-3 w-3 rounded-sm border bg-amber-100 align-[-2px]" />Lịch từ ngày thay đổi</span>
    </div>
  </div>;
}
function EntryRow({ entry, tone }: { entry: ScheduleEntry; tone?: "added" | "removed" }) {
  return <tr className={tone === "added" ? "bg-emerald-50" : tone === "removed" ? "bg-rose-50" : "border-t hover:bg-slate-50"}>
    <td className="px-3 py-2">{viDate(entry.date)}</td><td className="px-3 py-2 font-medium">{SHIFT_LABEL[entry.shiftType]}</td>
    <td className="px-3 py-2">{entry.positionConfig?.name ?? entry.positionConfigId}</td><td className="px-3 py-2">{entry.stationCode ?? "—"}</td>
    <td className="px-3 py-2 font-medium">{entry.userName ?? entry.employeeId}</td><td className="px-3 py-2">{entry.source === "GENERATED" ? "Tự sinh" : "Thủ công"}</td><td className="px-3 py-2">{entry.isLocked ? "Đã khóa" : "—"}</td>
  </tr>;
}
function Comparison({ data }: { data: ScheduleComparison }) {
  return <div className="border-t p-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Stat label="Tổng ô" value={data.summary.totalEntries} /><Stat label="Thay đổi" value={data.summary.changed} /><Stat label="Được thêm" value={data.summary.added} /><Stat label="Bị bỏ" value={data.summary.removed} /><Stat label="Nhân sự ảnh hưởng" value={data.summary.affectedEmployees} /></div><div className="mt-4 max-h-72 overflow-auto"><table className="w-full min-w-[760px] text-sm"><tbody>{data.added.map((x) => <EntryRow key={`a-${x.id}`} entry={x} tone="added" />)}{data.removed.map((x) => <EntryRow key={`r-${x.id}`} entry={x} tone="removed" />)}</tbody></table></div></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function Stat({ label, value, warning }: { label: string; value: React.ReactNode; warning?: boolean }) { return <div className={`rounded-lg border px-3 py-2 ${warning ? "border-amber-300 bg-amber-50" : "bg-white"}`}><div className="text-xs text-muted-foreground">{label}</div><div className="mt-0.5 font-bold">{value}</div></div>; }
