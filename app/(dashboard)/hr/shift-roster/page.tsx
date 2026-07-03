"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Upload, FileText, FileSpreadsheet, Download, Trash2, Loader2, Eye, PencilLine, RotateCcw } from "lucide-react";
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
  const canEditTimesheet = Boolean(timesheet.data?.data?.canEdit || canEditTimesheetPermission);
  const [editCell, setEditCell] = React.useState<{
    userId: string;
    userName: string;
    date: string;
    day: number;
    value: string;
    calculated: string;
    override?: TimesheetOverride;
  } | null>(null);
  const [editValue, setEditValue] = React.useState("");

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
  // Map "userId:day" → manual timesheet override set by an authorized user.
  const overrideMap = React.useMemo(() => {
    const m = new Map<string, TimesheetOverride>();
    (timesheet.data?.data?.overrides ?? []).forEach((override) => {
      m.set(`${override.userId}:${override.day}`, override);
    });
    return m;
  }, [timesheet.data]);
  // Map "userId:day" → approved administrative (HC) attendance for that day.
  // Same-period entries keep the highest hours; different periods are summed.
  const hcMap = React.useMemo(() => {
    const grouped = new Map<string, Array<{ hours: number; content: string; note: string | null; period: string | null }>>();
    (timesheet.data?.data?.hcEntries ?? []).forEach((e) => {
      const k = `${e.userId}:${e.day}`;
      const entries = grouped.get(k) ?? [];
      entries.push({ hours: e.hours, content: e.content, note: e.note, period: e.period });
      grouped.set(k, entries);
    });
    const m = new Map<string, { hours: number; content: string; note: string | null }>();
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
  }, [timesheet.data, tsMap]);

  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthName = new Date(month.year, month.month).toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
  // Distinct chức vụ / cương vị (positions) for the filter dropdown.
  const positions = (Array.from(new Set(users.map((u) => u.position).filter(Boolean))) as string[]).sort(
    comparePositionPriority
  );
  // Bảng công scope: người được quyền chỉnh xem toàn bộ, người khác xem dòng của mình.
  const rows = users
    .filter((u) => canEditTimesheet || u.id === session?.user?.id)
    .filter((u) => posFilter === "ALL" || u.position === posFilter)
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
  }, [monthStr, posFilter, view]);

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
    entries: TimesheetEntry[];
    hc?: { hours: number; content: string; note: string | null };
    override?: TimesheetOverride;
  }) {
    if (!canEditTimesheet) return;
    const calculated = calculatedCellValue(params.entries, params.hc);
    const next = {
      userId: params.user.id,
      userName: params.user.name,
      date: monthCellDate(month.year, month.month, params.day),
      day: params.day,
      value: params.override?.value ?? "",
      calculated,
      override: params.override,
    };
    setEditCell(next);
    setEditValue(next.value || calculated);
  }

  async function saveOverride(value = editValue) {
    if (!editCell) return;
    try {
      await updateOverride.mutateAsync({
        userId: editCell.userId,
        date: editCell.date,
        value: value.trim(),
      });
      toast.success(value.trim() ? "Đã cập nhật ô bảng công" : "Đã xoá giá trị chỉnh tay");
      setEditCell(null);
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

  function timesheetCellText(userId: string, day: number, includePending = true) {
    const override = overrideMap.get(`${userId}:${day}`);
    if (override) return override.value;
    const entries = tsMap.get(`${userId}:${day}`) ?? [];
    const hc = hcMap.get(`${userId}:${day}`);
    return [
      ...entries.map((entry) => `${shiftEntryLabel(entry)}${includePending && !entry.isApproved ? " (chưa duyệt)" : ""}`),
      ...(hc ? [formatHours(hc.hours)] : []),
    ].join(", ");
  }

  function hcCommentText(user: { id: string; name: string; employeeId: string }, day: number) {
    const hc = hcMap.get(`${user.id}:${day}`);
    const note = hcWorkNote(hc ?? {});
    if (!note) return "";
    return `${user.employeeId} - ${user.name.toLocaleUpperCase("vi-VN")}:\n${note}`;
  }

  // ---- Bảng công exports (người có quyền → all staff, others → self) ----
  function exportCsv() {
    if (!rows.length) return toast.error("Không có dữ liệu để xuất");
    const headers = ["Mã NV", "Nhân viên", "Chức vụ", ...days.map(String)];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.map(esc).join(",")];
    rows.forEach((u) => {
      const cells = days.map((d) => timesheetCellText(u.id, d));
      lines.push([u.employeeId, u.name, u.position ?? "", ...cells].map(esc).join(","));
    });
    const csv = "﻿" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bang-cong-${month.month + 1}-${month.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Đã xuất ${rows.length} dòng CSV`);
  }

  async function exportExcel() {
    if (!rows.length) return toast.error("Không có dữ liệu để xuất");
    const XLSX = await import("xlsx");
    const headers = ["Mã NV", "Nhân viên", "Chức vụ", ...days.map(String)];
    const table = [
      [`Bảng công trực ca - Phân xưởng Vận hành 1`],
      [`Tháng ${month.month + 1}/${month.year}`],
      [],
      headers,
      ...rows.map((u) => [
        u.employeeId,
        u.name,
        u.position ?? "",
        ...days.map((d) => timesheetCellText(u.id, d)),
      ]),
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
    const firstDataRow = 4; // zero-based row index: title, month, blank, header, data...
    const firstDayCol = 3;
    rows.forEach((u, rowIndex) => {
      days.forEach((day, dayIndex) => {
        const comment = hcCommentText(u, day);
        if (!comment) return;
        const ref = XLSX.utils.encode_cell({ r: firstDataRow + rowIndex, c: firstDayCol + dayIndex });
        const cell = sheet[ref] ?? { t: "s", v: "" };
        cell.c = [{ a: "PowerPlant EAM", t: comment }];
        sheet[ref] = cell;
      });
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Bảng công");
    XLSX.writeFile(workbook, `bang-cong-${month.month + 1}-${month.year}.xlsx`, { compression: true });
    toast.success(`Đã xuất ${rows.length} dòng Excel`);
  }

  function exportPdf() {
    if (!rows.length) return toast.error("Không có dữ liệu để xuất");
    const scope = canEditTimesheet ? "Toàn bộ nhân sự" : "Cá nhân";
    const dayTh = days.map((d) => `<th>${d}</th>`).join("");
    const bodyRows = rows
      .map((u, i) => {
        const tds = days
          .map((d) => {
            const override = overrideMap.get(`${u.id}:${d}`);
            if (override) return `<td><span class="shift-chip manual">${override.value.replace(/</g, "&lt;")}</span></td>`;
            const entries = tsMap.get(`${u.id}:${d}`) ?? [];
            const hc = hcMap.get(`${u.id}:${d}`);
            if (!entries.length && !hc) return "<td></td>";
            const inner = entries
              .map((entry) => {
                const m = entry.isApproved
                  ? cellMeta(entry.shiftType as Code)
                  : { color: "#DC2626", text: "#ffffff" };
                return `<span class="shift-chip" style="background:${m.color};color:${m.text}">${shiftEntryLabel(entry)}</span>`;
              })
              .join("") + (hc ? `<span class="shift-chip" style="background:${hcMeta(hc.content).bg};color:${hcMeta(hc.content).text}">${formatHours(hc.hours)}</span>` : "");
            return `<td>${inner}</td>`;
          })
          .join("");
        const name = (u.name ?? "").replace(/</g, "&lt;");
        const pos = (u.position ?? "").replace(/</g, "&lt;");
        return `<tr><td>${i + 1}</td><td>${u.employeeId}</td><td class="l">${name}</td><td class="l">${pos}</td>${tds}</tr>`;
      })
      .join("");
    // Page margins (mm) — kept small so more room for content on a single sheet.
    const MARGIN_MM = 6;
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bảng công ${month.month + 1}-${month.year}</title>
<style>
  @page { size: A4 landscape; margin: ${MARGIN_MM}mm; }
  html, body { margin:0; padding:0; }
  body { font-family: Arial, Helvetica, sans-serif; color:#0f172a; }
  /* #sheet is scaled by script so everything fits exactly one page. */
  #sheet { transform-origin: top left; width: max-content; }
  h1 { font-size:15px; margin:0 0 2px; text-transform:uppercase; }
  .sub { font-size:11px; color:#475569; margin:0 0 8px; }
  table { border-collapse:collapse; font-size:9px; }
  th,td { border:1px solid #cbd5e1; padding:2px 3px; text-align:center; }
  th { background:#f1f5f9; }
  td.l, th.l { text-align:left; white-space:nowrap; }
  .shift-chip { display:inline-block; min-width:18px; margin:1px; border-radius:3px; padding:1px 3px; font-weight:700; }
  .shift-chip.manual { background:#0f172a; color:#ffffff; border:1px solid #38bdf8; }
  .legend { margin-top:8px; font-size:10px; }
  .legend span { display:inline-block; margin-right:14px; }
  .chip { display:inline-block; width:18px; height:14px; border-radius:3px; line-height:14px; font-weight:700; margin-right:4px; text-align:center; }
</style></head><body>
  <div id="sheet">
    <h1>Bảng công trực ca — Phân xưởng Vận hành 1</h1>
    <p class="sub">Tháng ${month.month + 1}/${month.year} · ${scope} · Ca chưa duyệt được tô đỏ</p>
    <table>
      <thead><tr><th>STT</th><th>Mã NV</th><th class="l">Họ tên</th><th class="l">Chức vụ</th>${dayTh}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p class="legend">
      <span><i class="chip" style="background:#FDE68A;color:#92400E">V1</i>Sáng</span>
      <span><i class="chip" style="background:#BFDBFE;color:#1E40AF">V2</i>Chiều</span>
      <span><i class="chip" style="background:#C7D2FE;color:#3730A3">V3</i>Đêm</span>
      <span><i class="chip" style="background:#DC2626;color:#ffffff">V</i>Chưa duyệt</span>
      <span>4V3: 4 giờ ca đêm · Ô trống: chưa có công</span>
    </p>
  </div>
  <script>
    (function () {
      var MM = 96 / 25.4;                       // px per mm at 96dpi
      var pageW = (297 - ${MARGIN_MM} * 2) * MM; // A4 landscape printable width
      var pageH = (210 - ${MARGIN_MM} * 2) * MM; // ... printable height
      var sheet = document.getElementById('sheet');
      var w = sheet.scrollWidth, h = sheet.scrollHeight;
      var scale = Math.min(pageW / w, pageH / h, 1); // never upscale
      sheet.style.transform = 'scale(' + scale + ')';
      // Size the body to the scaled content so nothing spills to a 2nd page.
      document.body.style.width = Math.ceil(w * scale) + 'px';
      document.body.style.height = Math.ceil(h * scale) + 'px';
      setTimeout(function () { window.focus(); window.print(); }, 250);
    })();
  </script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Trình duyệt chặn cửa sổ in — hãy cho phép pop-up rồi thử lại.");
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="LỊCH TRỰC CA" description="Lịch trực ca & bảng công của phân xưởng Vận hành 1">
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
        {view === "timesheet" && canEditTimesheet && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4" /> Xuất
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportPdf}>
                <FileText className="h-4 w-4 text-red-600" /> PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportExcel}>
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportCsv}>
                <FileSpreadsheet className="h-4 w-4 text-slate-600" /> CSV (.csv)
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
                {canEditTimesheet && (
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
                  <span className="mx-1 hidden h-4 w-px bg-border md:inline-block" />
                  <span className="font-medium text-muted-foreground">HC (giờ):</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3.5 w-3.5 rounded" style={{ background: "#DC2626" }} />Sự cố
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3.5 w-3.5 rounded" style={{ background: "#2563EB" }} />PCCC
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3.5 w-3.5 rounded" style={{ background: "#6B7280" }} />Khác
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              {canEditTimesheet
                ? "Bảng công của toàn bộ nhân sự — "
                : "Bảng công của bạn — "}
              chỉ lưu trữ 2 tháng gần nhất;{" "}
              hiển thị ca đã điểm danh trên sơ đồ tổ chức ca; ca <span className="font-medium text-red-600">chưa duyệt được tô đỏ</span>.
              Nếu số giờ khác 8 thì mã ca có tiền tố giờ, ví dụ <span className="font-medium text-ink">4V3</span>;
              kèm <span className="font-medium text-ink">số giờ chấm công hành chính (HC) đã duyệt</span>; nếu HC có nội dung công việc thì rê chuột lên ô để xem.
              {canEditTimesheet ? " Người được phân quyền có thể bấm vào từng ô để chỉnh giá trị hiển thị." : " Dữ liệu chỉ xem, không chỉnh tay."}
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
                    <th className="sticky left-[110px] z-20 w-[220px] min-w-[220px] border-r border-border bg-white px-4 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Nhân viên</th>
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
                    <tr key={u.id} className="border-b border-border hover:bg-muted/30">
                      <td className="sticky left-0 z-10 w-[110px] min-w-[110px] border-r border-slate-200 bg-white px-3 py-2 text-center">
                        <span className="font-mono text-xs font-medium text-ink">{u.employeeId}</span>
                      </td>
                      <td className="sticky left-[110px] z-10 w-[220px] min-w-[220px] border-r border-border bg-white px-4 py-2">
                        <div className="font-medium text-ink">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.position}</div>
                      </td>
                      {days.map((d) => {
                        const entries = tsMap.get(`${u.id}:${d}`) ?? [];
                        const hc = hcMap.get(`${u.id}:${d}`);
                        const override = overrideMap.get(`${u.id}:${d}`);
                        const open = () => openEditCell({ user: u, day: d, entries, hc, override });
                        return (
                          <td
                            key={d}
                            className={cn(
                              "group relative border-l border-slate-200 p-0.5 text-center",
                              canEditTimesheet && "cursor-pointer hover:bg-sky-50/60"
                            )}
                            onClick={open}
                            title={canEditTimesheet ? "Bấm để chỉnh ô bảng công" : undefined}
                          >
                            <div className="mx-auto flex min-h-8 min-w-10 flex-col items-center justify-center gap-0.5">
                              {override ? (
                                <span
                                  className="flex min-h-7 min-w-8 items-center justify-center rounded border border-sky-300 bg-slate-800 px-1 text-[11px] font-bold text-white shadow-sm"
                                  title={`${u.name} · Ngày ${d}: giá trị chỉnh tay${override.updatedBy ? ` bởi ${override.updatedBy.name}` : ""}`}
                                >
                                  {override.value}
                                </span>
                              ) : entries.length || hc != null ? (
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
                                        title={workNote ? `${u.name} · Ngày ${d}: ${workNote}` : undefined}
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
                            {canEditTimesheet && (
                              <span className="pointer-events-none absolute right-0.5 top-0.5 hidden rounded bg-white/90 p-0.5 text-sky-700 shadow-sm ring-1 ring-sky-100 group-hover:block">
                                <PencilLine className="h-3 w-3" />
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <div>
                  Hiển thị {timesheetFirstShown}-{timesheetLastShown} trong tổng số {rows.length} dòng
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
                <div className="text-xs text-muted-foreground">Ngày {String(editCell.day).padStart(2, "0")}/{String(month.month + 1).padStart(2, "0")}/{month.year}</div>
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
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => saveOverride("")}
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
