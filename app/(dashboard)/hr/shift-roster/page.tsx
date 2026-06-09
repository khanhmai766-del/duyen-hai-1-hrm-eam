"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, Upload, FileText, FileSpreadsheet, Download, Trash2, Loader2, Eye } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUsers } from "@/hooks/useUsers";
import {
  useTimesheet,
  useRosterSchedule,
  useUploadRoster,
  useDeleteRoster,
  type RosterSchedule,
} from "@/hooks/useShifts";
import { SHIFT_TYPE, SHIFT_TYPE_ORDER } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type View = "roster" | "timesheet";

type Code = "MORNING" | "AFTERNOON" | "NIGHT" | "OFF";

function cellMeta(code: Code) {
  if (code === "OFF") return { short: "N", color: "#F1F5F9", text: "#64748B", label: "Nghỉ" };
  const m = SHIFT_TYPE[code];
  return { short: m.short, color: m.color, text: m.text, label: m.label };
}

// HC (chấm công hành chính) cell colour by content type:
// diễn tập sự cố → đỏ, diễn tập PCCC → xanh, còn lại → xám.
function hcMeta(content: string) {
  const c = content.toLowerCase();
  if (c.includes("pccc")) return { bg: "#2563EB", text: "#ffffff", label: "Diễn tập PCCC" };
  if (c.includes("sự cố") || c.includes("su co")) return { bg: "#DC2626", text: "#ffffff", label: "Diễn tập sự cố" };
  return { bg: "#6B7280", text: "#ffffff", label: "Khác" };
}

export default function ShiftRosterPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const { data, isLoading } = useUsers();
  const users = (data?.data ?? []).filter((u) => u.isActive);
  const [month, setMonth] = React.useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [posFilter, setPosFilter] = React.useState("ALL");
  const [view, setView] = React.useState<View>("roster");

  const monthStr = `${month.year}-${String(month.month + 1).padStart(2, "0")}`;
  const timesheet = useTimesheet(monthStr);
  // Map "userId:day" → approved shiftType, for the bảng-công view.
  const tsMap = React.useMemo(() => {
    const m = new Map<string, string>();
    (timesheet.data?.data?.entries ?? []).forEach((e) => m.set(`${e.userId}:${e.day}`, e.shiftType));
    return m;
  }, [timesheet.data]);
  // Map "userId:day" → approved administrative (HC) attendance for that day
  // (hours + the group's content, which drives the cell colour). When a person
  // has several HC entries the same day, keep the one with the most hours.
  const hcMap = React.useMemo(() => {
    const m = new Map<string, { hours: number; content: string }>();
    (timesheet.data?.data?.hcEntries ?? []).forEach((e) => {
      const k = `${e.userId}:${e.day}`;
      const cur = m.get(k);
      if (!cur || e.hours > cur.hours) m.set(k, { hours: e.hours, content: e.content });
    });
    return m;
  }, [timesheet.data]);

  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthName = new Date(month.year, month.month).toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
  // Distinct chức vụ / cương vị (positions) for the filter dropdown.
  const positions = (Array.from(new Set(users.map((u) => u.position).filter(Boolean))) as string[]).sort(
    (a, b) => a.localeCompare(b, "vi")
  );
  // Bảng công scope: ADMIN sees everyone; everyone else sees only their own row.
  const rows = users
    .filter((u) => isAdmin || u.id === session?.user?.id)
    .filter((u) => posFilter === "ALL" || u.position === posFilter);

  function shift(delta: number) {
    setMonth((m) => {
      const d = new Date(m.year, m.month + delta);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  // ---- Bảng công exports (admin → all staff, others → self) ----
  function exportCsv() {
    if (!rows.length) return toast.error("Không có dữ liệu để xuất");
    const headers = ["Nhân viên", "Mã NV", "Chức vụ", "Bộ phận", ...days.map(String)];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.map(esc).join(",")];
    rows.forEach((u) => {
      const cells = days.map((d) => {
        const c = tsMap.get(`${u.id}:${d}`) as Code | undefined;
        return c ? cellMeta(c).short : "";
      });
      lines.push([u.name, u.employeeId, u.position ?? "", u.department ?? "", ...cells].map(esc).join(","));
    });
    const csv = "﻿" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bang-cong-${month.month + 1}-${month.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Đã xuất ${rows.length} dòng (Excel/CSV)`);
  }

  function exportPdf() {
    if (!rows.length) return toast.error("Không có dữ liệu để xuất");
    const scope = isAdmin ? "Toàn bộ nhân sự" : "Cá nhân";
    const dayTh = days.map((d) => `<th>${d}</th>`).join("");
    const bodyRows = rows
      .map((u, i) => {
        const tds = days
          .map((d) => {
            const c = tsMap.get(`${u.id}:${d}`) as Code | undefined;
            if (!c) return "<td></td>";
            const m = cellMeta(c);
            return `<td style="background:${m.color};color:${m.text};font-weight:700">${m.short}</td>`;
          })
          .join("");
        const name = (u.name ?? "").replace(/</g, "&lt;");
        const pos = (u.position ?? "").replace(/</g, "&lt;");
        return `<tr><td>${i + 1}</td><td class="l">${name}</td><td>${u.employeeId}</td><td class="l">${pos}</td>${tds}</tr>`;
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
  .legend { margin-top:8px; font-size:10px; }
  .legend span { display:inline-block; margin-right:14px; }
  .chip { display:inline-block; width:18px; height:14px; border-radius:3px; line-height:14px; font-weight:700; margin-right:4px; text-align:center; }
</style></head><body>
  <div id="sheet">
    <h1>Bảng công trực ca — Phân xưởng Vận hành 1</h1>
    <p class="sub">Tháng ${month.month + 1}/${month.year} · ${scope} · Chỉ gồm các ca đã được duyệt chấm công</p>
    <table>
      <thead><tr><th>STT</th><th class="l">Họ tên</th><th>Mã NV</th><th class="l">Chức vụ</th>${dayTh}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p class="legend">
      <span><i class="chip" style="background:#FDE68A;color:#92400E">V1</i>Sáng</span>
      <span><i class="chip" style="background:#BFDBFE;color:#1E40AF">V2</i>Chiều</span>
      <span><i class="chip" style="background:#C7D2FE;color:#3730A3">V3</i>Đêm</span>
      <span>Ô trống: chưa có công duyệt</span>
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
            onClick={() => setView("roster")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              view === "roster" ? "bg-navy text-white" : "text-muted-foreground hover:bg-muted"
            )}
          >
            Lịch trực ca
          </button>
          <button
            onClick={() => setView("timesheet")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              view === "timesheet" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted"
            )}
          >
            Bảng công
          </button>
        </div>
        {view === "timesheet" && isAdmin && (
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
              <DropdownMenuItem onClick={exportCsv}>
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel (.csv)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      {view === "roster" ? (
        <RosterPdfView isAdmin={isAdmin} />
      ) : (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="min-w-[160px] text-center font-semibold capitalize text-ink">{monthName}</span>
                <Button variant="outline" size="icon" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <div className="flex items-center gap-3">
                {isAdmin && (
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
              {isAdmin
                ? "Bảng công của toàn bộ nhân sự — "
                : "Bảng công của bạn — "}
              chỉ hiển thị các ca <span className="font-medium text-ink">đã được Quản trị / Trưởng ca duyệt chấm công</span>,
              kèm <span className="font-medium text-ink">số giờ chấm công hành chính (HC) đã duyệt</span>;
              ô trống (·) là ngày chưa có công được duyệt. Dữ liệu chỉ xem, không chỉnh tay.
            </p>
          </Card>

          {isLoading ? (
            <TableSkeleton />
          ) : (
            <Card className="overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-20 w-[190px] min-w-[190px] border-r border-slate-200 bg-white px-4 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Nhân viên</th>
                    <th className="sticky left-[190px] z-20 w-[110px] min-w-[110px] border-r border-border bg-white px-3 py-2 text-center text-xs font-semibold uppercase text-muted-foreground">Mã NV</th>
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
                  {rows.map((u) => (
                    <tr key={u.id} className="border-b border-border hover:bg-muted/30">
                      <td className="sticky left-0 z-10 w-[190px] min-w-[190px] border-r border-slate-200 bg-white px-4 py-2">
                        <div className="font-medium text-ink">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.position}</div>
                      </td>
                      <td className="sticky left-[190px] z-10 w-[110px] min-w-[110px] border-r border-border bg-white px-3 py-2 text-center">
                        <span className="font-mono text-xs font-medium text-ink">{u.employeeId}</span>
                      </td>
                      {days.map((d) => {
                        const code = tsMap.get(`${u.id}:${d}`) as Code | undefined;
                        const hc = hcMap.get(`${u.id}:${d}`);
                        if (!code && hc == null) {
                          return (
                            <td key={d} className="border-l border-slate-200 p-0.5 text-center">
                              <span className="mx-auto flex h-8 w-8 items-center justify-center text-[11px] text-slate-300">·</span>
                            </td>
                          );
                        }
                        const meta = code ? cellMeta(code) : null;
                        return (
                          <td key={d} className="border-l border-slate-200 p-0.5 text-center">
                            <div className="mx-auto flex w-8 flex-col items-center justify-center gap-0.5">
                              {meta && (
                                <span
                                  className="flex h-7 w-8 items-center justify-center rounded text-[11px] font-bold"
                                  style={{ background: meta.color, color: meta.text }}
                                  title={`${u.name} · Ngày ${d}: ${meta.label}`}
                                >
                                  {meta.short}
                                </span>
                              )}
                              {hc != null && (() => {
                                const hm = hcMeta(hc.content);
                                return (
                                  <span
                                    className="flex h-7 w-8 items-center justify-center rounded text-[10px] font-bold"
                                    style={{ background: hm.bg, color: hm.text }}
                                    title={`${u.name} · Ngày ${d}: ${hc.content} — ${hc.hours} giờ (HC, đã duyệt)`}
                                  >
                                    {hc.hours}h
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ---- Lịch trực ca: an admin-uploaded PDF (Vận hành 1) ---- */
function RosterPdfView({ isAdmin }: { isAdmin: boolean }) {
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
        {isAdmin ? (
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
          src={`${roster!.url}?v=${encodeURIComponent(roster?.uploadedAt ?? "")}`}
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
              {isAdmin
                ? "Tải lên tệp PDF lịch trực ca của phân xưởng Vận hành 1."
                : "Lịch trực ca sẽ được Quản trị cập nhật. Vui lòng quay lại sau."}
            </div>
          </div>
          {isAdmin && (
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
