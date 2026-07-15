"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, Upload, FileText, FileSpreadsheet, Download, Trash2, Loader2, Eye, PencilLine, RotateCcw, Search, X, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUsers } from "@/hooks/useUsers";
import {
  useTimesheet,
  useUpdateTimesheetOverride,
  useRosterSchedule,
  useUploadRoster,
  useDeleteRoster,
  type RosterSchedule,
  type TimesheetEntry,
  type TimesheetOverride,
} from "@/hooks/useShifts";
import { SHIFT_TYPE, SHIFT_TYPE_ORDER } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/nav";
import { aggregateHcHoursByPeriod } from "@/lib/hc-period";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { toast } from "sonner";

type View = "roster" | "timesheet";

type Code = "MORNING" | "AFTERNOON" | "NIGHT" | "OFF";
type TimesheetLine = "shift1" | "shift2" | "hc";
type HcCell = { hours: number; content: string; note: string | null };
const TIMESHEET_LINES: TimesheetLine[] = ["shift1", "shift2", "hc"];

function timesheetLineLabel(line: TimesheetLine) {
  if (line === "shift1") return "Dòng 1 - Công ca";
  if (line === "shift2") return "Dòng 2 - Công ca bổ sung";
  return "Dòng 3 - Hành chính";
}

function cellMeta(code: Code) {
  if (code === "OFF") return { short: "N", color: "#F1F5F9", text: "#64748B", label: "Nghỉ" };
  const m = SHIFT_TYPE[code];
  return { short: m.short, color: m.color, text: m.text, label: m.label };
}

function shiftEntryLabel(entry: TimesheetEntry) {
  const code = entry.shiftType as Code;
  const short = cellMeta(code).short;
  return entry.hours === 8 ? short : `${formatHours(entry.hours)}${short}`;
}

function formatHours(hours: number) {
  return Number.isInteger(hours) ? String(hours) : String(hours).replace(".", ",");
}

function sortShiftEntries(entries: TimesheetEntry[]) {
  const order = new Map(SHIFT_TYPE_ORDER.map((shiftType, index) => [shiftType, index]));
  return [...entries].sort((a, b) => {
    const byShift = (order.get(a.shiftType as keyof typeof SHIFT_TYPE) ?? 99) - (order.get(b.shiftType as keyof typeof SHIFT_TYPE) ?? 99);
    if (byShift !== 0) return byShift;
    return a.hours - b.hours;
  });
}

function monthCellDate(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthKey(year: number, monthIndex: number) {
  return year * 12 + monthIndex;
}

function retentionMonthRange(now = new Date()) {
  const current = { year: now.getFullYear(), month: now.getMonth() };
  const start = new Date(current.year, current.month - 1, 1);
  return {
    min: { year: start.getFullYear(), month: start.getMonth() },
    max: current,
  };
}

function positionRank(position?: string | null) {
  const normalized = normalizeText(position ?? "");
  if (!normalized) return 999;
  if (normalized.includes("pho quan doc")) return 1;
  if (normalized.includes("quan doc")) return 0;
  if (normalized.includes("ky thuat vien")) return 2;
  if (normalized.includes("thong ke") || normalized.includes("nhan vien van phong")) return 3;
  if (normalized.includes("truong ca")) return 4;
  return 100;
}

function comparePositionPriority(a?: string | null, b?: string | null) {
  const byRank = positionRank(a) - positionRank(b);
  if (byRank !== 0) return byRank;
  return normalizeText(a ?? "").localeCompare(normalizeText(b ?? ""), "vi");
}

// HC (chấm công hành chính) cell colour by content type:
// diễn tập sự cố → đỏ, diễn tập PCCC → xanh, còn lại → xám.
function hcMeta(content: string) {
  const c = content.toLowerCase();
  if (c.includes("pccc")) return { bg: "#2563EB", text: "#ffffff", label: "Diễn tập PCCC" };
  if (c.includes("sự cố") || c.includes("su co")) return { bg: "#DC2626", text: "#ffffff", label: "Diễn tập sự cố" };
  return { bg: "#6B7280", text: "#ffffff", label: "Khác" };
}

function hcWorkNote(hc: { note?: string | null }) {
  return hc.note?.trim() || "";
}

export default function ShiftRosterPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rbac = useRbacAccess();
  const canManageRosterPdf = rbac.can("shift-operation-approve", ["approve", "manage", "full"]);
  const canEditTimesheetPermission = rbac.can("timesheet-edit", ["approve", "manage", "full"]);

  const [month, setMonth] = React.useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [posFilter, setPosFilter] = React.useState("ALL");
  const [employeeFilter, setEmployeeFilter] = React.useState("");
  const [view, setView] = React.useState<View>(() => (searchParams.get("view") === "timesheet" ? "timesheet" : "roster"));
  const shouldLoadTimesheet = view === "timesheet";
  const { data, isLoading } = useUsers({ enabled: shouldLoadTimesheet });
  const users = shouldLoadTimesheet ? (data?.data ?? []).filter((u) => u.isActive) : [];
  const [timesheetPage, setTimesheetPage] = React.useState(1);
  const retentionRange = React.useMemo(() => retentionMonthRange(), []);
  const currentMonthKey = monthKey(month.year, month.month);
  const minMonthKey = monthKey(retentionRange.min.year, retentionRange.min.month);
  const maxMonthKey = monthKey(retentionRange.max.year, retentionRange.max.month);

  const monthStr = `${month.year}-${String(month.month + 1).padStart(2, "0")}`;
  const timesheet = useTimesheet(monthStr, { enabled: shouldLoadTimesheet });
  const updateOverride = useUpdateTimesheetOverride(monthStr);
  const canEditAllTimesheet = Boolean(timesheet.data?.data?.canEdit || canEditTimesheetPermission);
  const canEditOwnTimesheet = Boolean(
    canEditAllTimesheet ||
      timesheet.data?.data?.canEditOwn ||
      rbac.can("timesheet-edit", ["own", "approve", "manage", "full"])
  );
  const myUserId = session?.user?.id;
  const [editCell, setEditCell] = React.useState<{
    userId: string;
    userName: string;
    date: string;
    day: number;
    line: TimesheetLine;
    value: string;
    calculated: string;
    override?: TimesheetOverride;
  } | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const [editNote, setEditNote] = React.useState("");

  React.useEffect(() => {
    setView(searchParams.get("view") === "timesheet" ? "timesheet" : "roster");
  }, [searchParams]);

  function changeView(nextView: View) {
    setView(nextView);
    router.replace(nextView === "timesheet" ? "/hr/shift-roster?view=timesheet" : "/hr/shift-roster", { scroll: false });
  }
  // Map "userId:day" → shift attendance entries. A day can contain multiple
  // shift records, e.g. V2 plus 4V3 for a 12-hour work stretch.
  const tsMap = React.useMemo(() => {
    const m = new Map<string, TimesheetEntry[]>();
    (timesheet.data?.data?.entries ?? []).forEach((e) => {
      const key = `${e.userId}:${e.day}`;
      const entries = m.get(key) ?? [];
      entries.push(e);
      m.set(key, sortShiftEntries(entries));
    });
    return m;
  }, [timesheet.data]);
  // Map "userId:day:line" → manual timesheet override set by an authorized user.
  const overrideMap = React.useMemo(() => {
    const m = new Map<string, TimesheetOverride>();
    (timesheet.data?.data?.overrides ?? []).forEach((override) => {
      m.set(`${override.userId}:${override.day}:${override.line}`, override);
    });
    return m;
  }, [timesheet.data]);
  function buildHcMap() {
    const grouped = new Map<string, Array<{ hours: number; content: string; note: string | null; period: string | null }>>();
    (timesheet.data?.data?.hcEntries ?? []).forEach((e) => {
      const k = `${e.userId}:${e.day}`;
      const entries = grouped.get(k) ?? [];
      entries.push({ hours: e.hours, content: e.content, note: e.note, period: e.period });
      grouped.set(k, entries);
    });
    const m = new Map<string, HcCell>();
    grouped.forEach((entries, key) => {
      const shiftEntries = tsMap.get(key) ?? [];
      const hasMorningShift = shiftEntries.some((entry) => entry.shiftType === "MORNING");
      const note = entries.map((entry) => hcWorkNote(entry)).filter(Boolean).join("\n");
      m.set(key, {
        hours: aggregateHcHoursByPeriod(entries, { hasMorningShift }),
        content: entries.map((entry) => entry.content).join(" / "),
        note: note || null,
      });
    });
    return m;
  }

  // Dòng 3: toàn bộ công hành chính đã duyệt, kể cả tự chấm và theo nhóm.
  const hcMap = React.useMemo(() => buildHcMap(), [timesheet.data, tsMap]);

  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthName = new Date(month.year, month.month).toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
  // Distinct chức vụ / cương vị (positions) for the filter dropdown.
  const positions = (Array.from(new Set(users.map((u) => u.position).filter(Boolean))) as string[]).sort(
    comparePositionPriority
  );
  // Bảng công scope: người được quyền chỉnh toàn bộ xem tất cả, người khác xem dòng của mình.
  const employeeQuery = normalizeText(employeeFilter.trim());
  const rows = users
    .filter((u) => canEditAllTimesheet || u.id === myUserId)
    .filter((u) => posFilter === "ALL" || u.position === posFilter)
    .filter((u) => !canEditAllTimesheet || !employeeQuery || normalizeText(`${u.name} ${u.employeeId ?? ""}`).includes(employeeQuery))
    .sort((a, b) => {
      const byPosition = comparePositionPriority(a.position, b.position);
      if (byPosition !== 0) return byPosition;
      const byEmployeeId = String(a.employeeId ?? "").localeCompare(String(b.employeeId ?? ""), "vi", { numeric: true });
      if (byEmployeeId !== 0) return byEmployeeId;
      return a.name.localeCompare(b.name, "vi");
    });
  const timesheetPageSize = 20;
  const timesheetTotalPages = Math.max(1, Math.ceil(rows.length / timesheetPageSize));
  const timesheetFirstShown = rows.length ? (timesheetPage - 1) * timesheetPageSize + 1 : 0;
  const timesheetLastShown = Math.min(timesheetPage * timesheetPageSize, rows.length);
  const pagedRows = rows.slice((timesheetPage - 1) * timesheetPageSize, timesheetPage * timesheetPageSize);

  React.useEffect(() => {
    setTimesheetPage(1);
  }, [monthStr, posFilter, employeeFilter, view]);

  React.useEffect(() => {
    setTimesheetPage((current) => Math.min(Math.max(1, current), timesheetTotalPages));
  }, [timesheetTotalPages]);

  function calculatedCellValue(entries: TimesheetEntry[], hc?: { hours: number; content: string; note?: string | null }) {
    return [
      ...entries.map(shiftEntryLabel),
      ...(hc ? [formatHours(hc.hours)] : []),
    ].join(", ");
  }

  function openEditCell(params: {
    user: { id: string; name: string };
    day: number;
    line: TimesheetLine;
    entries: TimesheetEntry[];
    hc?: { hours: number; content: string; note: string | null };
    override?: TimesheetOverride;
  }) {
    if (!canEditAllTimesheet && (!canEditOwnTimesheet || params.user.id !== myUserId)) return;
    const calculated = calculatedCellValue(params.entries, params.hc);
    const next = {
      userId: params.user.id,
      userName: params.user.name,
      date: monthCellDate(month.year, month.month, params.day),
      day: params.day,
      line: params.line,
      value: params.override?.value ?? "",
      calculated,
      override: params.override,
    };
    setEditCell(next);
    setEditValue(params.override ? next.value : calculated);
    setEditNote(params.override?.note ?? "");
  }

  function shiftEntriesForLine(entries: TimesheetEntry[], line: TimesheetLine) {
    if (line === "shift1") return entries.slice(0, 1);
    if (line === "shift2") return entries.slice(1);
    return [];
  }

  async function saveOverride(value: string | null = editValue) {
    if (!editCell) return;
    const trimmedValue = value === null ? null : value.trim();
    try {
      await updateOverride.mutateAsync({
        userId: editCell.userId,
        date: editCell.date,
        line: editCell.line,
        value: trimmedValue,
        note: trimmedValue ? editNote.trim() : undefined,
      });
      toast.success(trimmedValue === null ? "Đã khôi phục công mặc định" : trimmedValue ? "Đã cập nhật ô bảng công" : "Đã để trống ô bảng công");
      setEditCell(null);
      setEditNote("");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  function shift(delta: number) {
    setMonth((m) => {
      const d = new Date(m.year, m.month + delta);
      const next = { year: d.getFullYear(), month: d.getMonth() };
      const nextKey = monthKey(next.year, next.month);
      if (nextKey < minMonthKey || nextKey > maxMonthKey) return m;
      return next;
    });
  }

  function timesheetLineCellText(userId: string, day: number, line: TimesheetLine, includePending = true) {
    const override = overrideMap.get(`${userId}:${day}:${line}`);
    if (override) return override.value;
    const entries = tsMap.get(`${userId}:${day}`) ?? [];
    if (line === "hc") {
      const hc = hcMap.get(`${userId}:${day}`);
      return hc ? formatHours(hc.hours) : "";
    }
    return shiftEntriesForLine(entries, line)
      .map((entry) => `${shiftEntryLabel(entry)}${includePending && !entry.isApproved ? " (chưa duyệt)" : ""}`)
      .join(", ");
  }

  function timesheetCommentText(user: { id: string; name: string; employeeId: string }, day: number, line: TimesheetLine = "shift1") {
    const override = overrideMap.get(`${user.id}:${day}:${line}`);
    const hc = line === "hc" ? hcMap.get(`${user.id}:${day}`) : undefined;
    const notes = [override?.note?.trim(), hcWorkNote(hc ?? {})].filter(Boolean);
    if (!notes.length) return "";
    return `${user.employeeId} - ${user.name.toLocaleUpperCase("vi-VN")}:\n${notes.join("\n\n")}`;
  }

  // ---- Bảng công exports (người có quyền → all staff, others → self) ----
  async function exportExcel() {
    if (!rows.length) return toast.error("Không có dữ liệu để xuất");
    const XLSX = await import("xlsx");
    const headers = ["Mã NV", "Nhân viên", "Chức vụ", ...days.map(String)];
    const table = [
      [`Bảng công trực ca - Phân xưởng Vận hành 1`],
      [`Tháng ${month.month + 1}/${month.year}`],
      [],
      headers,
      ...rows.flatMap((u) =>
        TIMESHEET_LINES.map((line, index) => [
          index === 0 ? u.employeeId : "",
          index === 0 ? u.name : "",
          index === 0 ? (u.position ?? "") : "",
          ...days.map((d) => timesheetLineCellText(u.id, d, line)),
        ])
      ),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(table);
    sheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
    ];
    sheet["!cols"] = [
      { wch: 12 },
      { wch: 28 },
      { wch: 24 },
      ...days.map(() => ({ wch: 9 })),
    ];
    const firstDataRow = 4; // zero-based row index: title, month, empty spacer, header, data...
    const firstDayCol = 3;
    rows.forEach((u, rowIndex) => {
      TIMESHEET_LINES.forEach((line, lineIndex) => {
        days.forEach((day, dayIndex) => {
          const comment = timesheetCommentText(u, day, line);
          if (!comment) return;
          const ref = XLSX.utils.encode_cell({ r: firstDataRow + rowIndex * 3 + lineIndex, c: firstDayCol + dayIndex });
          const cell = sheet[ref] ?? { t: "s", v: "" };
          const comments = [{ a: "PowerPlant EAM", t: comment }] as any;
          comments.hidden = true;
          cell.c = comments;
          sheet[ref] = cell;
        });
      });
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Bảng công");
    XLSX.writeFile(workbook, `bang-cong-${month.month + 1}-${month.year}.xlsx`, { compression: true });
    toast.success(`Đã xuất ${rows.length} dòng Excel`);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="LỊCH TRỰC CA" description="Lịch trực ca & bảng công của phân xưởng Vận hành 1">
        {rbac.can("shift-schedule-view", ["read", "manage", "full"]) && (
          <Button variant="outline" size="sm" onClick={() => router.push("/hr/shift-roster/planning")}>
            <CalendarClock className="h-4 w-4" /> Lịch dự kiến
          </Button>
        )}
        {rbac.can("shift-staffing-manage", ["read", "manage", "full"]) && (
          <Button variant="outline" size="sm" onClick={() => router.push("/hr/shift-roster/staffing")}>
            <UsersRound className="h-4 w-4" /> Quản lý biên chế
          </Button>
        )}
        {/* View toggle: official roster PDF vs approved timesheet */}
        <div className="flex rounded-lg border border-border p-1">
          <button
            onClick={() => changeView("roster")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              view === "roster" ? "bg-navy text-white" : "text-muted-foreground hover:bg-muted"
            )}
          >
            Lịch trực ca
          </button>
          <button
            onClick={() => changeView("timesheet")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              view === "timesheet" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted"
            )}
          >
            Bảng công
          </button>
        </div>
        {view === "timesheet" && canEditAllTimesheet && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4" /> Xuất
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportExcel}>
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      {view === "roster" ? (
        <RosterPdfView canManage={canManageRosterPdf} />
      ) : (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => shift(-1)} disabled={currentMonthKey <= minMonthKey}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="min-w-[160px] text-center font-semibold capitalize text-ink">{monthName}</span>
                <Button variant="outline" size="icon" onClick={() => shift(1)} disabled={currentMonthKey >= maxMonthKey}><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <div className="flex items-center gap-3">
                {canEditAllTimesheet && (
                  <select
                    value={posFilter}
                    onChange={(e) => setPosFilter(e.target.value)}
                    className="h-10 max-w-[220px] rounded-md border border-input bg-white px-3 text-sm"
                    title="Lọc theo chức vụ / cương vị"
                  >
                    <option value="ALL">Tất cả bộ phận</option>
                    <optgroup label="Theo chức vụ / cương vị">
                      {positions.map((p) => <option key={p} value={p}>{p}</option>)}
                    </optgroup>
                  </select>
                )}
                <div className="hidden flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:flex">
                  {SHIFT_TYPE_ORDER.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1">
                      <span className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold" style={{ background: SHIFT_TYPE[s].color, color: SHIFT_TYPE[s].text }}>{SHIFT_TYPE[s].short}</span>
                      {SHIFT_TYPE[s].label}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-500">N</span>Nghỉ
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="flex h-5 w-8 items-center justify-center rounded bg-red-600 text-[10px] font-bold text-white">V</span>Chưa duyệt
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <span className="font-semibold text-ink">4V3</span> = 4 giờ ca đêm
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              {canEditAllTimesheet
                ? "Bảng công của toàn bộ nhân sự — "
                : "Bảng công của bạn — "}
              tháng trước lưu đến hết ngày 15 của tháng hiện tại;{" "}
              hiển thị ca đã điểm danh trên sơ đồ tổ chức ca; ca <span className="font-medium text-red-600">chưa duyệt được tô đỏ</span>.
              Nếu số giờ khác 8 thì mã ca có tiền tố giờ, ví dụ <span className="font-medium text-ink">4V3</span>;
              kèm <span className="font-medium text-ink">số giờ chấm công hành chính (HC) đã duyệt</span>; nếu HC có nội dung công việc thì rê chuột lên ô để xem.
              <span className="mt-2 inline-block rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-900 ring-1 ring-amber-200">
                Mỗi nhân sự hiển thị 3 dòng: dòng 1 và dòng 2 ưu tiên công trực ca; dòng 3 là công hành chính đã duyệt.
                {canEditAllTimesheet
                  ? " Người được phân quyền có thể bấm vào từng ô để chỉnh giá trị hiển thị."
                  : canEditOwnTimesheet
                    ? " Bạn có thể bấm vào ô của mình để chỉnh giá trị hiển thị."
                    : " Dữ liệu chỉ xem, không chỉnh tay."}
              </span>
            </p>
          </Card>

          {isLoading ? (
            <TableSkeleton />
          ) : (
            <Card className="overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-20 w-[110px] min-w-[110px] border-r border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold uppercase text-muted-foreground">Mã NV</th>
                    <th className="sticky left-[110px] z-20 w-[280px] min-w-[280px] border-r border-border bg-white px-4 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">
                      <div className="flex items-center justify-between gap-3">
                        <span className="shrink-0">Nhân viên</span>
                        {canEditAllTimesheet && (
                          <div className="relative w-[148px]">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <input
                              value={employeeFilter}
                              onChange={(event) => setEmployeeFilter(event.target.value)}
                              placeholder="Tìm tên"
                              className="h-7 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-7 text-xs font-medium normal-case text-ink outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100"
                              aria-label="Tìm tên nhân viên trong bảng công"
                            />
                            {employeeFilter && (
                              <button
                                type="button"
                                onClick={() => setEmployeeFilter("")}
                                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                                aria-label="Xóa bộ lọc tên nhân viên"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </th>
                    {days.map((d) => {
                      const dow = new Date(month.year, month.month, d).getDay();
                      const weekend = dow === 0 || dow === 6;
                      return (
                        <th key={d} className={cn("w-9 border-l border-slate-200 px-0 py-2 text-center text-xs font-medium", weekend ? "bg-amber-50 text-amber-700" : "text-muted-foreground")}>{d}</th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((u) => (
                    <React.Fragment key={u.id}>
                      {TIMESHEET_LINES.map((line, lineIndex) => (
                        <tr
                          key={`${u.id}-${line}`}
                          className={cn(
                            lineIndex === 2 ? "border-b-2 border-slate-300" : "border-b border-slate-100",
                            "hover:bg-muted/20"
                          )}
                        >
                          {lineIndex === 0 && (
                            <>
                              <td rowSpan={3} className="sticky left-0 z-10 w-[110px] min-w-[110px] border-r border-slate-200 bg-white px-3 py-2 text-center align-middle">
                                <span className="font-mono text-xs font-medium text-ink">{u.employeeId}</span>
                              </td>
                              <td rowSpan={3} className="sticky left-[110px] z-10 w-[280px] min-w-[280px] border-r border-border bg-white px-4 py-2 align-middle">
                                <div className="font-medium text-ink">{u.name}</div>
                                <div className="text-xs text-muted-foreground">{u.position}</div>
                              </td>
                            </>
                          )}
                          {days.map((d) => {
                            const override = overrideMap.get(`${u.id}:${d}:${line}`);
                            const allEntries = tsMap.get(`${u.id}:${d}`) ?? [];
                            const entries = shiftEntriesForLine(allEntries, line);
                            const hc = line === "hc" ? hcMap.get(`${u.id}:${d}`) : undefined;
                            const showOverride = !!override;
                            const editableCell = canEditAllTimesheet || (canEditOwnTimesheet && u.id === myUserId);
                            const open = () => openEditCell({ user: u, day: d, line, entries, hc, override });
                            return (
                              <td
                                key={`${line}-${d}`}
                                className={cn(
                                  "group relative h-10 border-l border-slate-200 p-0.5 text-center",
                                  line === "shift2" && "bg-slate-50/40",
                                  line === "hc" && "bg-slate-50/70",
                                  editableCell && "cursor-pointer hover:bg-sky-50/70"
                                )}
                                onClick={editableCell ? open : undefined}
                                title={editableCell ? "Bấm để chỉnh ô bảng công" : undefined}
                              >
                                <div className="mx-auto flex min-h-8 min-w-10 items-center justify-center gap-0.5">
                                  {showOverride ? (
                                    override.value ? (
                                      <span
                                        className="flex min-h-7 min-w-8 items-center justify-center rounded border border-sky-300 bg-slate-800 px-1 text-[11px] font-bold text-white shadow-sm"
                                        title={[
                                          `${u.name} · Ngày ${d}: giá trị chỉnh tay${override.updatedBy ? ` bởi ${override.updatedBy.name}` : ""}`,
                                          override.note?.trim() ? override.note.trim() : "",
                                        ].filter(Boolean).join("\n")}
                                      >
                                        {override.value}
                                      </span>
                                    ) : (
                                      <span
                                        className="mx-auto flex h-8 w-8 items-center justify-center text-[11px] text-slate-200"
                                        title={`${u.name} · Ngày ${d}: ô đã được để trống thủ công${override.updatedBy ? ` bởi ${override.updatedBy.name}` : ""}`}
                                      />
                                    )
                                  ) : !override && (entries.length || hc != null) ? (
                                    <>
                                      {entries.map((entry) => {
                                        const meta = entry.isApproved
                                          ? cellMeta(entry.shiftType as Code)
                                          : { color: "#DC2626", text: "#ffffff", label: "Chưa duyệt" };
                                        return (
                                          <span
                                            key={`${entry.shiftType}-${entry.hours}-${entry.isApproved ? "ok" : "pending"}`}
                                            className="flex min-h-7 min-w-8 items-center justify-center rounded px-1 text-[11px] font-bold"
                                            style={{ background: meta.color, color: meta.text }}
                                            title={`${u.name} · Ngày ${d}: ${SHIFT_TYPE[entry.shiftType as keyof typeof SHIFT_TYPE]?.label ?? entry.shiftType} — ${entry.hours} giờ${entry.isApproved ? " (đã duyệt)" : " (chưa duyệt)"}`}
                                          >
                                            {shiftEntryLabel(entry)}
                                          </span>
                                        );
                                      })}
                                      {hc != null && (() => {
                                        const hm = hcMeta(hc.content);
                                        const workNote = hcWorkNote(hc);
                                        return (
                                          <span
                                            className="flex h-7 w-8 items-center justify-center rounded text-[10px] font-bold"
                                            style={{ background: hm.bg, color: hm.text }}
                                            title={workNote ? `${u.name} · Ngày ${d}: ${workNote}` : `${u.name} · Ngày ${d}: ${hc.content}`}
                                          >
                                            {formatHours(hc.hours)}
                                          </span>
                                        );
                                      })()}
                                    </>
                                  ) : (
                                    <span className="mx-auto flex h-8 w-8 items-center justify-center text-[11px] text-slate-300">·</span>
                                  )}
                                </div>
                                {editableCell && (
                                  <span className="pointer-events-none absolute right-0.5 top-0.5 hidden rounded bg-white/90 p-0.5 text-sky-700 shadow-sm ring-1 ring-sky-100 group-hover:block">
                                    <PencilLine className="h-3 w-3" />
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <div>
                  Hiển thị {timesheetFirstShown}-{timesheetLastShown} trong tổng số {rows.length} nhân sự
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTimesheetPage((current) => Math.max(1, current - 1))}
                    disabled={timesheetPage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" /> Trước
                  </Button>
                  <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-ink">
                    {timesheetPage}/{timesheetTotalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTimesheetPage((current) => Math.min(timesheetTotalPages, current + 1))}
                    disabled={timesheetPage >= timesheetTotalPages}
                  >
                    Sau <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
      <Dialog open={!!editCell} onOpenChange={(open) => !open && setEditCell(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Chỉnh ô bảng công</DialogTitle>
          </DialogHeader>
          {editCell && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-slate-50 px-3 py-2 text-sm">
                <div className="font-semibold text-ink">{editCell.userName}</div>
                <div className="text-xs text-muted-foreground">
                  {timesheetLineLabel(editCell.line)} · Ngày {String(editCell.day).padStart(2, "0")}/{String(month.month + 1).padStart(2, "0")}/{month.year}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Giá trị hiển thị</Label>
                <Input
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                  placeholder={editCell.calculated || "Ví dụ: ĐC, V2, 4V3, 8"}
                  maxLength={40}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Mặc định hiện tại: <span className="font-medium text-ink">{editCell.calculated || "trống"}</span>
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Nội dung (nếu có)</Label>
                <Textarea
                  value={editNote}
                  onChange={(event) => setEditNote(event.target.value)}
                  placeholder="Nhập nội dung để hiển thị dạng comment khi xuất Excel"
                  maxLength={500}
                  className="min-h-[96px]"
                />
                <p className="text-xs text-muted-foreground">
                  Nội dung này sẽ nằm trong comment ẩn của ô khi xuất Excel.
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => saveOverride(null)}
              disabled={updateOverride.isPending || !editCell?.override}
            >
              <RotateCcw className="h-4 w-4" /> Khôi phục mặc định
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setEditCell(null)}>
                Hủy
              </Button>
              <Button type="button" onClick={() => saveOverride()} disabled={updateOverride.isPending}>
                {updateOverride.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Lưu
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
/* ---- Lịch trực ca: an admin-uploaded PDF (Vận hành 1) ---- */
function RosterPdfView({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = useRosterSchedule();
  const upload = useUploadRoster();
  const remove = useDeleteRoster();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const roster = data?.data as RosterSchedule | undefined;
  const hasPdf = !!roster?.url;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return toast.error("Chỉ chấp nhận tệp PDF");
    }
    try {
      await upload.mutateAsync(file);
      toast.success("Đã tải lên lịch trực ca");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onRemove() {
    try {
      await remove.mutateAsync();
      toast.success("Đã xoá lịch trực ca");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString("vi-VN") : "");
  const pdfUrl = React.useMemo(() => {
    if (!roster?.url) return "";
    const separator = roster.url.includes("?") ? "&" : "?";
    return `${roster.url}${separator}v=${encodeURIComponent(roster.uploadedAt ?? "")}`;
  }, [roster?.uploadedAt, roster?.url]);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-sky-200 bg-sky-50 px-4 py-2.5 text-center text-sm font-semibold text-sky-900">
        Lịch PDF đã phê duyệt là lịch trực chính thức.
      </div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy/10 text-navy">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <div className="font-semibold text-ink">Lịch trực ca — Phân xưởng Vận hành 1</div>
            <div className="text-xs text-muted-foreground">
              {hasPdf
                ? `${roster?.name ?? "lich-truc-ca.pdf"} · cập nhật ${fmt(roster?.uploadedAt)}${roster?.uploadedBy ? ` bởi ${roster.uploadedBy}` : ""}`
                : "Chưa có lịch trực ca được tải lên"}
            </div>
          </div>
        </div>

        {/* Actions are ADMIN-only — everyone else has view-only access. */}
        {canManage ? (
          <div className="flex items-center gap-2">
            {hasPdf && (
              <a href={roster!.url!} download target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm"><Download className="h-4 w-4" /> Tải xuống</Button>
              </a>
            )}
            <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={onPick} />
            <Button size="sm" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {hasPdf ? "Thay lịch mới" : "Tải lên lịch (PDF)"}
            </Button>
            {hasPdf && (
              <Button variant="outline" size="sm" onClick={onRemove} disabled={remove.isPending} title="Xoá lịch">
                {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
              </Button>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            <Eye className="h-3.5 w-3.5" /> Chỉ xem
          </span>
        )}
      </div>

      {/* Viewer / empty state */}
      {isLoading ? (
        <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : hasPdf ? (
        <iframe
          src={pdfUrl}
          title="Lịch trực ca Vận hành 1"
          className="h-[78vh] w-full border-0"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <FileText className="h-8 w-8" />
          </span>
          <div>
            <div className="font-semibold text-ink">Chưa có lịch trực ca</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {canManage
                ? "Tải lên tệp PDF lịch trực ca của phân xưởng Vận hành 1."
                : "Lịch trực ca sẽ được Quản trị cập nhật. Vui lòng quay lại sau."}
            </div>
          </div>
          {canManage && (
            <Button onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Tải lên lịch (PDF)
            </Button>
          )}
          <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={onPick} />
        </div>
      )}
    </Card>
  );
}
