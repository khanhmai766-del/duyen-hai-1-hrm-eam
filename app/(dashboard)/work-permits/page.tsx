"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowRight, Building2, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardList, Download, ExternalLink, FileText, Filter, HardHat, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Trash2, UsersRound, Wrench, Zap, Clock } from "lucide-react";
import { toast } from "sonner";
import { ContractorSessions, PermitCompanyDirectory, PermitMembersEditor, PermitPeopleDirectory } from "@/components/work-permits/contractor-work";
import { PermitSafetyCatalog, PermitSafetySelection, PermitSafetyReadOnly } from "@/components/work-permits/safety";
import { MechanicalPaperInfo } from "@/components/work-permits/mechanical-paper-info";
import { PermitGuideButton } from "@/components/work-permits/permit-guide";
import { useExportPermitTemplate } from "@/hooks/useWorkPermitSafety";
import { PermitExecutionDialog } from "@/components/work-permits/execution";
import { PermitHistoryPanel } from "@/components/work-permits/history";
import { PermitDocumentPreview } from "@/components/work-permits/document-preview";
import { apiDownload, apiDownloadPost } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useCancelDraftWorkPermit, useDeleteWorkPermit, usePermitNameSuggestions, useWorkPermits, useWorkPermit, useSaveWorkPermit, useExportWorkPermits, usePermitNumberSuggestion, usePermitNumberReservations, useTakePermitNumber, useCancelPermitNumberReservation, usePermitNumberBaselines, useSetPermitNumberBaseline, type PermitNumberReservation } from "@/hooks/useWorkPermits";
import { useUsers } from "@/hooks/useUsers";
import { useDefects, type DefectItem } from "@/hooks/useDefects";
import { announcementPositionsMatch, OPERATION_POSITION_TITLES } from "@/lib/positions";
import { NkvhPermitLink } from "@/components/work-permits/nkvh-link";
import { NkvhLinkEditor } from "@/components/work-permits/nkvh-link-editor";
import { NkvhLinkPanel } from "@/components/work-permits/nkvh-link-panel";
import { nkvhPctUrl, parseNkvhPctLink } from "@/lib/nkvh-pct";
import { effectiveWorkType, formatPermitNumber, PERMIT_DISCIPLINES, type PermitDiscipline, PERMIT_PAGE_SIZE, defaultPermitFormat, effectivePermitFormat, PERMIT_KINDS, PERMIT_WORK_TYPES, PERMIT_WORK_TYPE_CODES, PERMIT_STATUSES, PERMIT_UNITS, PERMIT_TRANSITIONS, CONTRACTOR_PERMIT_TRANSITIONS, PERMIT_FIELD_LABELS, permitValue, type PermitWorkType, type PermitInput, type PermitKind, type PermitRow, type PermitListRow, type PermitStatus } from "@/lib/work-permits";
import { DEFAULT_INTERNAL_TEAM_NAME, DEFAULT_PERMIT_MANAGING_UNIT, DEFAULT_PERMIT_PLANT } from "@/lib/work-permit-source-fields";
import { SAFETY_MAX_ROWS } from "@/lib/work-permit-safety";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlainHeader, ROW_HOVER, rowBackground, TABLE_SCROLLER, TD_ROW, TH_NAVY, TR_HEAD } from "@/components/pccc/pccc-table-card";
import { cn } from "@/lib/utils";

const control = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground shadow-sm transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60";
const filterControl = "min-h-9 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs text-foreground shadow-sm transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60";
const DUPLICATE_PERMIT_NUMBER_ERROR = "Số PCT đang được sử dụng trong loại và năm này.";
const statusColors: Record<PermitStatus, string> = { DRAFT: "bg-muted text-muted-foreground", ISSUED: "bg-sky-100 text-sky-800", ACTIVE: "bg-emerald-100 text-emerald-800", PAUSED: "bg-amber-100 text-amber-900", WAITING: "bg-amber-100 text-amber-900", CLOSED: "bg-slate-200 text-slate-700", CANCELLED: "bg-red-100 text-red-800" };
/**
 * PCT nội bộ lấy số từ tiện ích NKVH vào sổ ngay khi bấm, nên có thể còn thiếu những mục NKVH chưa có
 * lúc đó (CHTT ở PCT T-C-N-H khai bước sau) hoặc sổ tự khai (SYC). Nhãn nhắc khai bổ sung trên sổ.
 */
function missingPermitItems(r: Pick<PermitListRow, "nkvhPctId" | "teamType" | "status" | "commanderName" | "workerCount" | "repairRequestNumber">) {
  if (!r.nkvhPctId || r.teamType !== "INTERNAL" || ["DRAFT", "CLOSED", "CANCELLED"].includes(r.status)) return [];
  return [!r.commanderName.trim() && "CHTT", !r.workerCount && "số nhân viên", !r.repairRequestNumber.trim() && "SYC"].filter(Boolean) as string[];
}
function NeedsSupplement({ row }: { row: Parameters<typeof missingPermitItems>[0] }) {
  const missing = missingPermitItems(row);
  if (!missing.length) return null;
  return <span title={`Còn thiếu: ${missing.join(", ")}`} className="mt-1 inline-flex whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200">Cần bổ sung</span>;
}
function Status({ value }: { value: PermitStatus }) { return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[value]}`}>{PERMIT_STATUSES[value]}</span>; }
function WorkTypeBadge({ value }: { value: PermitWorkType | null }) {
  return <span title={value ? PERMIT_WORK_TYPES[value] : "Chưa phân loại"} className={`inline-flex min-w-9 justify-center rounded-md px-2 py-1 text-xs font-bold ${value === "INCIDENT" ? "bg-red-100 text-red-800" : value === "UNPLANNED" ? "bg-amber-100 text-amber-900" : value === "PLANNED" ? "bg-blue-50 text-blue-800" : "bg-muted text-muted-foreground"}`}>{value ? PERMIT_WORK_TYPE_CODES[value] : "—"}</span>;
}
function PermitProgress({ value }: { value: number | null | undefined }) { return value == null ? null : <p className="mt-1 whitespace-nowrap text-xs font-semibold tabular-nums text-blue-700">Tiến độ {value}%</p>; }
function PermitFormat({ permit }: { permit: Pick<PermitInput, "format" | "teamType"> }) {
  const paper = effectivePermitFormat(permit) === "PAPER";
  return <span title={paper ? "Cấp theo hình thức phiếu giấy" : "Cấp theo hình thức phiếu điện tử"} className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${paper ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200"}`}>{paper ? "PCT giấy" : "PCT điện tử"}</span>;
}
function PermitNumberCell({ permit, onOpenPaper }: { permit: Pick<PermitRow, "id" | "number" | "year" | "kind" | "format" | "teamType" | "workDate" | "nkvhPctId">; onOpenPaper: () => void }) {
  const electronic = effectivePermitFormat(permit) === "ELECTRONIC";
  const number = formatPermitNumber(permit);
  const content = <><span className="whitespace-nowrap text-[13px] font-bold text-blue-700 underline-offset-4 group-hover:underline">{number}</span>{electronic && <ExternalLink className="ml-1 inline h-3.5 w-3.5 text-blue-600" />}<div className="mt-1 text-xs text-muted-foreground">{permitValue("workDate", permit.workDate)}</div></>;
  if (electronic) {
    return <NkvhPermitLink className="group block rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" kind={permit.kind} id={permit.nkvhPctId} number={number}>{content}<div className="mt-1 text-[10px] text-sky-700">{permit.nkvhPctId ? "Mở đúng phiếu NKVH" : "Sao chép số & mở NKVH"}</div></NkvhPermitLink>;
  }
  return <button type="button" className="group block rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={onOpenPaper} title={`Mở chi tiết PCT giấy ${number}`}>{content}</button>;
}
function vietnamNow() { return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16); }
function localTime(value: string | null) { return value ? new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 16) : ""; }
function defaultForm(kind: PermitKind, teamType: PermitInput["teamType"] = "CONTRACTOR"): PermitInput {
  return { managingUnit: DEFAULT_PERMIT_MANAGING_UNIT, plantName: DEFAULT_PERMIT_PLANT, registrationNumber: "", workScope: "", plannedStartAt: `${vietnamNow()}:00+07:00`, plannedEndAt: `${vietnamNow()}:00+07:00`, disciplines: [], safetyItems: [], kind, format: defaultPermitFormat(teamType), workType: null, sourceClassification: null, members: [], year: Number(vietnamNow().slice(0, 4)), number: "", position: "", unit: "S1", content: "", location: "", workDate: vietnamNow().slice(0, 10), issuerName: "", electricalSafetySupervisorName: "", leaderName: "", commanderName: "", teamName: teamType === "INTERNAL" ? DEFAULT_INTERNAL_TEAM_NAME[kind] : "", teamType, workerCount: null, authorizerName: "", issuedAt: `${vietnamNow()}:00+07:00`, authorizedAt: null, closedAt: null, result: "", note: "", statusReason: "", defectId: null, repairRequestNumber: "" };
}
export default function WorkPermitsPage() {
  const searchParams = useSearchParams();
  const { data: pageSession } = useSession();
  const [safetyTab, setSafetyTab] = useState(false);
  const [peopleTab, setPeopleTab] = useState(false);
  const [kind, setKind] = useState<PermitKind>(() => searchParams.get("kind") === "ELECTRICAL" ? "ELECTRICAL" : "MECHANICAL");
  const [q, setQ] = useState(""); const [search, setSearch] = useState("");
  const [workType, setWorkType] = useState("");
  const [teamType, setTeamType] = useState(""); const [status, setStatus] = useState(""); const [unit, setUnit] = useState(""); const [position, setPosition] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editor, setEditor] = useState<PermitRow | null>(null);
  const [newPermit, setNewPermit] = useState<{ kind: PermitKind; teamType: PermitInput["teamType"]; reservation?: PermitNumberReservation } | null>(null);
  const [cancelReservationTarget, setCancelReservationTarget] = useState<PermitNumberReservation | null>(null);
  const [cancelReservationReason, setCancelReservationReason] = useState("");
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"year" | "filters">("year");
  const [exportYear, setExportYear] = useState(Number(vietnamNow().slice(0, 4)));
  const [detail, setDetail] = useState<string | undefined>(() => searchParams.get("permitId") || undefined);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const timer = setTimeout(() => { setSearch(q); setPage(1); }, 300); return () => clearTimeout(timer); }, [q]);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !target?.closest("input, textarea, select, [contenteditable='true']")) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);
  const filters = new URLSearchParams({ kind, q: search, status, unit, position, teamType, workType, from, to, page: String(page) }).toString();
  /** Bấm vào bất kỳ chỗ nào trên dòng là mở chi tiết phiếu (đã bỏ nút "Xem"). Bỏ qua cú bấm
   *  trúng link/nút bên trong dòng — số PCT điện tử là link mở NKVH — kẻo một cú bấm làm hai việc. */
  const openRow = (event: React.MouseEvent, id: string) => {
    if ((event.target as HTMLElement).closest("a, button, input, select, textarea, label")) return;
    setDetail(id);
  };
  /** Không còn nút "Xem" nên chính dòng phải nhận Tab + Enter/Space, kẻo người dùng bàn phím mất lối vào. */
  const openRowByKey = (event: React.KeyboardEvent, id: string) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    setDetail(id);
  };
  const bookTab = !safetyTab && !peopleTab; // đang xem sổ PCT, không phải tab danh mục
  const query = useWorkPermits(filters, bookTab); const exporting = useExportWorkPermits();
  const rows = query.data?.data ?? []; const meta = query.data?.meta;
  const reservations = usePermitNumberReservations(Boolean(meta?.canIssue));
  // Sổ Cơ và sổ Điện là hai dãy số riêng: lượt giữ số của sổ này không được hiện ở tab kia.
  const kindReservations = (reservations.data?.data ?? []).filter(item => item.kind === kind);
  const cancelReservation = useCancelPermitNumberReservation();
  const counts = meta?.counts ?? {};
  const openCount = (counts.DRAFT ?? 0) + (counts.ISSUED ?? 0) + (counts.ACTIVE ?? 0) + (counts.PAUSED ?? 0) + (counts.WAITING ?? 0);
  const activeFilterCount = [search, status, unit, position, teamType, workType, from, to].filter(Boolean).length;
  const totalPages = Math.max(1, Math.ceil((meta?.total ?? 0) / (meta?.pageSize ?? PERMIT_PAGE_SIZE)));
  const resetFilters = () => {
    setQ(""); setSearch(""); setStatus(""); setUnit(""); setPosition(""); setTeamType(""); setWorkType(""); setFrom(""); setTo(""); setPage(1);
  };
  async function exportBook() {
    try {
      if (exportMode === "year" && (!Number.isInteger(exportYear) || exportYear < 2000 || exportYear > 2100)) { toast.error("Nhập năm cấp số từ 2000 đến 2100"); return; }
      const exportFilters = exportMode === "year" ? new URLSearchParams({ kind, year: String(exportYear) }).toString() : filters;
      const file = await exporting.mutateAsync(exportFilters); const url = URL.createObjectURL(file.blob); const a = document.createElement("a"); a.href = url; a.download = file.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Không thể xuất sổ"); }
  }
  const statusCards = [
    { title: "Phiếu chưa đóng", count: openCount, value: "OPEN", note: "Nháp, đã cấp, đang làm và tạm dừng", tone: "bg-blue-600" },
    { title: "Đang thực hiện", count: counts.ACTIVE ?? 0, value: "ACTIVE", note: "Đã cho phép làm việc", tone: "bg-emerald-500" },
    { title: "Chờ làm tiếp", count: counts.WAITING ?? 0, value: "WAITING", note: "Nhà thầu đã kết thúc lần làm việc", tone: "bg-amber-500" },
    { title: "Đã đóng", count: counts.CLOSED ?? 0, value: "CLOSED", note: "Đã ghi kết quả công việc", tone: "bg-slate-500" },
  ];
  const secondaryFilterCount = [teamType, from, to].filter(Boolean).length;
  const [moreFilters, setMoreFilters] = useState(false);
  const showMoreFilters = moreFilters || secondaryFilterCount > 0;
  const tabs = [
    { key: "MECHANICAL", safety: false, people: false, label: `PCT ${PERMIT_KINDS.MECHANICAL}`, icon: Wrench },
    { key: "ELECTRICAL", safety: false, people: false, label: `PCT ${PERMIT_KINDS.ELECTRICAL}`, icon: Zap },
    { key: "MECHANICAL", safety: true, people: false, label: "Biện pháp an toàn Cơ", icon: ShieldCheck },
    { key: "MECHANICAL", safety: false, people: true, label: "Nhân sự nhà thầu", icon: UsersRound },
  ] as const;
  const filterLabel = "block text-[11px] font-medium text-muted-foreground";
  function startNewPermit(selectedTeamType: PermitInput["teamType"]) {
    setSafetyTab(false);
    setPeopleTab(false);
    setPage(1);
    setEditor(null);
    setNewPermit({ kind, teamType: selectedTeamType });
  }
  return <div className="mx-auto max-w-[1600px] space-y-4 font-sans text-[13px]">
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {/* Cùng cỡ/đậm/màu với tiêu đề của mọi trang khác (components/shared/page-header.tsx), chỉ thêm in hoa. */}
        <h1 className="text-xl font-bold uppercase tracking-tight text-ink min-[380px]:text-2xl">Sổ cấp phiếu công tác</h1>
      </div>
      <div className="flex flex-wrap gap-2"><PermitGuideButton />{pageSession?.user?.role === "ADMIN" &&<Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setBaselineOpen(true)}>Mốc sổ giấy</Button>}<Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setExportOpen(true)} disabled={!bookTab || !meta || exporting.isPending || query.isError}><Download />{exporting.isPending ? "Đang xuất…" : "Xuất Excel"}</Button>{bookTab && meta?.canIssue && <><Button size="sm" className="h-9 bg-blue-800 text-xs hover:bg-blue-900" onClick={() => startNewPermit("INTERNAL")}><Building2 />Cấp phiếu nội bộ</Button><Button size="sm" className="h-9 bg-cyan-700 text-xs hover:bg-cyan-800" onClick={() => startNewPermit("CONTRACTOR")}><HardHat />Cấp phiếu nhà thầu</Button></>}</div>
    </header>
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Sổ PCT, biện pháp an toàn Cơ và nhân sự nhà thầu">{tabs.map(tab => { const active = tab.people ? peopleTab : !peopleTab && kind === tab.key && safetyTab === tab.safety; const Icon = tab.icon; return <button key={tab.label} type="button" aria-pressed={active} onClick={() => { if (!tab.people) setKind(tab.key); setSafetyTab(tab.safety); setPeopleTab(tab.people); setPage(1); }} className={`-mb-px inline-flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active ? "border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-300" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4" />{tab.label}</button>; })}</nav>
    {bookTab && meta?.canIssue && Boolean(kindReservations.length) && <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 sm:p-4"><h2 className="flex items-center gap-2 text-sm font-bold text-amber-950"><Clock size={16} />Số đã lấy, chưa lưu phiếu · {PERMIT_KINDS[kind]}</h2><p className="mt-1 text-xs text-amber-800">Số vẫn được giữ khi đóng biểu mẫu. Bấm Tiếp tục để hoàn tất; chọn nhầm loại phiếu (nội bộ/nhà thầu) thì đổi ngay trong biểu mẫu, vẫn giữ nguyên số. Chỉ hiển thị lượt giữ số của sổ đang xem.</p>{/* Thẻ CO THEO NỘI DUNG (không kéo giãn cho đầy cột) và nút luôn nằm cùng hàng với thông tin,
    nên không còn khoảng trắng trong thẻ; các thẻ nối tiếp nhau rồi tự xuống dòng khi hết chỗ. */}<div className="mt-3 flex flex-wrap gap-2">{kindReservations.map(item => <div key={item.id} className="flex w-full items-center gap-4 rounded-lg border border-amber-200 bg-white px-3 py-2 sm:w-auto"><div className="min-w-0 flex-1 sm:flex-none"><p className="flex items-center gap-2 whitespace-nowrap font-semibold text-slate-900">{formatPermitNumber(item)}<span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${item.teamType === "INTERNAL" ? "bg-sky-50 text-sky-800" : "bg-amber-100 text-amber-900"}`}>{item.teamType === "INTERNAL" ? "Nội bộ" : "Nhà thầu"}</span></p><p className="mt-0.5 truncate whitespace-nowrap text-xs text-slate-600">{item.teamType === "INTERNAL" ? "PCT điện tử" : "PCT giấy"} · {item.ownerName || "Người cấp"}</p></div><div className="flex shrink-0 gap-2"><Button size="sm" className="h-7 px-2.5 text-xs" title="Tiếp tục cấp phiếu với số này" onClick={() => { setKind(item.kind as PermitKind); setEditor(null); setNewPermit({ kind: item.kind as PermitKind, teamType: item.teamType, reservation: item }); }}>Tiếp tục</Button>{pageSession?.user?.role === "ADMIN" && <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" title="Hủy lượt lấy số — chỉ quản trị, dùng khi lấy nhầm sổ Cơ/Điện" onClick={() => { setCancelReservationTarget(item); setCancelReservationReason(""); }}>Hủy lượt</Button>}</div></div>)}</div></section>}
    {peopleTab ? <PermitCompanyDirectory /> : safetyTab ? <PermitSafetyCatalog key={kind} kind={kind} /> : <>
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4 sm:divide-x sm:divide-border">{statusCards.map(card => { const active = status === card.value; return <button key={card.value} type="button" title={card.note} onClick={() => { setStatus(active ? "" : card.value); setPage(1); }} aria-pressed={active} className={`relative flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${active ? "bg-blue-50/70 dark:bg-blue-950/30" : "hover:bg-muted/40"}`}><span className="flex min-w-0 items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${card.tone}`} /><span className={`truncate text-xs font-medium ${active ? "text-blue-800 dark:text-blue-200" : "text-muted-foreground"}`}>{card.title}</span></span><strong className="text-lg font-bold leading-none tabular-nums text-foreground">{meta ? card.count : "—"}</strong>{active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-700" />}</button>; })}</div>
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 lg:hidden"><div className="relative flex-1"><Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-muted-foreground" /><input aria-label="Tìm kiếm phiếu công tác" className={`${filterControl} pl-8`} value={q} onChange={e => setQ(e.target.value)} placeholder="Số phiếu, ĐKCT, SYC, công việc, người…" maxLength={200} /></div><Button size="sm" variant="outline" className="h-9 shrink-0" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><Filter size={14} />{activeFilterCount > 0 ? `Lọc (${activeFilterCount})` : "Lọc"}</Button></div>
        <div className={`${filtersOpen ? "mt-3 grid" : "hidden"} gap-2.5 sm:grid-cols-2 lg:mt-0 lg:grid lg:grid-cols-[minmax(240px,1fr)_repeat(4,minmax(140px,170px))_auto] lg:items-end`}>
          <label className="hidden lg:block"><span className={filterLabel}>Tìm kiếm</span><div className="relative mt-1"><Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-muted-foreground" /><input ref={searchRef} aria-label="Tìm kiếm phiếu công tác" className={`${filterControl} pl-8 pr-9`} value={q} onChange={e => setQ(e.target.value)} placeholder="Số phiếu, ĐKCT, SYC, công việc, người…" maxLength={200} /><kbd className="pointer-events-none absolute right-2 top-2 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">/</kbd></div></label>
          <label><span className={filterLabel}>Trạng thái</span><select className={`${filterControl} mt-1`} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Đang theo dõi</option><option value="OPEN">Phiếu chưa đóng</option>{Object.entries(PERMIT_STATUSES).filter(([key]) => teamType !== "INTERNAL" || ["DRAFT", "ISSUED", "CLOSED", "CANCELLED", status].includes(key)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label><span className={filterLabel}>Tổ máy</span><select className={`${filterControl} mt-1`} value={unit} onChange={e => { setUnit(e.target.value); setPage(1); }}><option value="">Tất cả tổ máy</option>{Object.entries(PERMIT_UNITS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label><span className={filterLabel}>Cương vị</span><select className={`${filterControl} mt-1`} value={position} onChange={e => { setPosition(e.target.value); setPage(1); }}><option value="">Tất cả cương vị</option>{OPERATION_POSITION_TITLES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span className={filterLabel}>KH / ĐX / SC</span><select className={`${filterControl} mt-1`} value={workType} onChange={e => { setWorkType(e.target.value); setPage(1); }}><option value="">Tất cả phân loại</option>{Object.entries(PERMIT_WORK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="UNCLASSIFIED">Chưa phân loại</option></select></label>
          <div className="flex items-end gap-1 sm:col-span-2 lg:col-span-1"><Button size="sm" variant="ghost" className="h-9 px-2.5 text-xs" aria-expanded={showMoreFilters} onClick={() => setMoreFilters(value => !value)}><SlidersHorizontal size={14} />Lọc thêm{secondaryFilterCount > 0 ? ` (${secondaryFilterCount})` : ""}</Button>{activeFilterCount > 0 && <Button size="sm" variant="ghost" className="h-9 px-2.5 text-xs text-muted-foreground" onClick={resetFilters}><RotateCcw size={14} />Xóa lọc</Button>}</div>
          {showMoreFilters && <div className="grid gap-2.5 sm:col-span-2 sm:grid-cols-3 lg:col-span-6 lg:grid-cols-[minmax(160px,220px)_repeat(2,minmax(140px,170px))]">
            <label><span className={filterLabel}>Loại đơn vị</span><select className={`${filterControl} mt-1`} value={teamType} onChange={e => { setTeamType(e.target.value); setPage(1); }}><option value="">Tất cả đơn vị</option><option value="INTERNAL">Nội bộ</option><option value="CONTRACTOR">Nhà thầu</option></select></label>
            <label><span className={filterLabel}>Từ ngày</span><input type="date" className={`${filterControl} mt-1`} value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label>
            <label><span className={filterLabel}>Đến ngày</span><input type="date" className={`${filterControl} mt-1`} value={to} min={from} onChange={e => { setTo(e.target.value); setPage(1); }} /></label>
          </div>}
        </div>
      </div>
      {query.isError ? <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700"><CircleAlert className="mx-auto mb-2" /><p className="font-semibold">Không thể tải sổ cấp phiếu</p><p className="mt-1 text-sm">{query.error.message}</p></div> : query.isPending ? <div className="space-y-2 p-4" role="status" aria-label="Đang tải sổ cấp phiếu">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />)}</div> : !rows.length ? <div className="px-6 py-12 text-center"><ClipboardList className="mx-auto text-muted-foreground" size={28} /><h2 className="mt-3 font-semibold">Chưa có phiếu phù hợp</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Thay đổi bộ lọc hoặc ghi cấp phiếu mới để bắt đầu theo dõi.</p>{activeFilterCount > 0 && <Button className="mt-4" size="sm" variant="outline" onClick={resetFilters}><RotateCcw />Xóa bộ lọc</Button>}</div> : <>
        <div className="divide-y divide-border md:hidden">{rows.map(r => <article key={r.id} tabIndex={0} aria-label={`Xem phiếu ${formatPermitNumber(r)}`} onClick={e => openRow(e, r.id)} onKeyDown={e => openRowByKey(e, r.id)} className="cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none space-y-2 px-4 py-3 transition-colors active:bg-muted/40"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-2"><div className="flex flex-col items-start gap-1.5"><WorkTypeBadge value={effectiveWorkType(r)} /><PermitFormat permit={r} /></div><PermitNumberCell permit={r} onOpenPaper={() => setDetail(r.id)} /></div><Status value={r.status} /><NeedsSupplement row={r} /></div><div><p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{r.content}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{PERMIT_UNITS[r.unit]}{r.position ? ` · ${r.position}` : ""}{r.location ? ` · ${r.location}` : ""}</p></div><div className="flex items-center justify-between gap-3 text-xs"><p className="min-w-0 truncate text-muted-foreground">Chỉ huy <span className="font-medium text-foreground">{r.sessions?.[0]?.commanderName || r.commanderName || "—"}</span> · {r.sessions?.[0]?.company || r.teamName || "—"}</p></div></article>)}</div>
        {/* Cùng khuôn bảng với sổ TBYCNN/PCCC và các tab khác của trang (đầu bảng xanh EVN, vạch xen
            kẽ, hover xanh). Bề rộng cột CỐ ĐỊNH + căn giữa theo chiều dọc: trước đây cột tự co theo
            chữ và căn trên, dòng nào có chữ phụ dài là cả hàng lệch nhau, nhìn rất rối. */}
        <Table className="min-w-[1080px] table-fixed" wrapperClassName={cn("hidden md:block", TABLE_SCROLLER)}>
          <colgroup><col className="w-[104px]" /><col className="w-[176px]" /><col /><col className="w-[160px]" /><col className="w-[190px]" /><col className="w-[150px]" /><col className="w-[124px]" /></colgroup>
          <TableHeader><TableRow className={TR_HEAD}>
            <TableHead className={TH_NAVY}><PlainHeader label="Loại" /></TableHead>
            <TableHead className={TH_NAVY}><PlainHeader label="Số PCT / ngày" align="left" /></TableHead>
            <TableHead className={TH_NAVY}><PlainHeader label="Nội dung công việc" align="left" /></TableHead>
            <TableHead className={TH_NAVY}><PlainHeader label="Người cấp" align="left" /></TableHead>
            <TableHead className={TH_NAVY}><PlainHeader label="Chỉ huy / đơn vị" align="left" /></TableHead>
            <TableHead className={TH_NAVY}><PlainHeader label="Người cho phép" align="left" /></TableHead>
            <TableHead className={TH_NAVY}><PlainHeader label="Trạng thái" /></TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((r, index) => {
            const commander = r.sessions?.[0]?.commanderName || r.commanderName;
            const authorizer = r.sessions?.[0]?.authorizerName || r.authorizerName;
            const company = r.sessions?.[0]?.company || r.teamName;
            return <TableRow key={r.id} tabIndex={0} aria-label={`Xem phiếu ${formatPermitNumber(r)}`} onClick={e => openRow(e, r.id)} onKeyDown={e => openRowByKey(e, r.id)} className={cn(rowBackground({ index }), ROW_HOVER, "cursor-pointer focus-visible:bg-sky-50 focus-visible:outline-none")}>
              <TableCell className={cn(TD_ROW, "py-3 text-center")}><div className="flex flex-col items-center gap-1"><WorkTypeBadge value={effectiveWorkType(r)} /><PermitFormat permit={r} /></div></TableCell>
              <TableCell className={cn(TD_ROW, "py-3")}><PermitNumberCell permit={r} onOpenPaper={() => setDetail(r.id)} /></TableCell>
              <TableCell className={cn(TD_ROW, "py-3")}>
                <p className="truncate text-[13px] font-semibold text-ink" title={r.content}>{r.content || "—"}</p>
                <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{PERMIT_UNITS[r.unit]}{r.position ? ` · ${r.position}` : ""}{r.location ? ` · ${r.location}` : ""}{r.repairRequestNumber ? <span className="font-medium text-blue-700"> · SYC {r.repairRequestNumber}</span> : null}</p>
              </TableCell>
              <TableCell className={cn(TD_ROW, "py-3")}><span className="block truncate text-[13px] text-ink" title={r.issuerName || undefined}>{r.issuerName || <span className="text-slate-400">—</span>}</span></TableCell>
              <TableCell className={cn(TD_ROW, "py-3")}>
                <p className="truncate text-[13px] font-medium text-ink">{commander || <span className="font-normal text-slate-400">Chưa có CHTT</span>}</p>
                <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{company || "Chưa ghi đơn vị"}{r.workerCount ? ` · ${r.workerCount} người` : ""}{r.teamType === "CONTRACTOR" ? " · Nhà thầu" : ""}</p>
              </TableCell>
              <TableCell className={cn(TD_ROW, "py-3")}><span className="block truncate text-[13px] text-ink">{authorizer || <span className="text-slate-400">—</span>}</span></TableCell>
              <TableCell className={cn(TD_ROW, "py-3 text-center")}><div className="flex flex-col items-center"><Status value={r.status} /><NeedsSupplement row={r} />{r.teamType === "CONTRACTOR" && <PermitProgress value={r.progress} />}</div></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
      </>}
      <footer className="flex flex-col gap-2 border-t border-border px-4 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"><span className="text-muted-foreground" title="Số phiếu nhập theo thực tế, không trùng trong cùng loại và năm; phiếu hủy vẫn giữ số."><strong className="font-semibold text-foreground">{meta?.total ?? 0}</strong> phiếu · Trang <span className="tabular-nums">{page}/{totalPages}</span></span><div className="flex items-center gap-1"><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Làm mới danh sách" title="Làm mới danh sách" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw size={14} className={query.isFetching ? "animate-spin" : ""} /></Button><Button variant="outline" size="sm" className="h-8" disabled={page <= 1 || query.isFetching} onClick={() => setPage(page - 1)}><ChevronLeft />Trước</Button><Button variant="outline" size="sm" className="h-8" disabled={!meta || page * meta.pageSize >= meta.total || query.isFetching} onClick={() => setPage(page + 1)}>Sau<ChevronRight /></Button></div></footer>
    </section>
    </>}
    {exportOpen && <Dialog open onOpenChange={value => { if (!exporting.isPending) setExportOpen(value); }}><DialogContent><DialogTitle>Xuất Excel sổ cấp PCT</DialogTitle><DialogDescription>Sổ {PERMIT_KINDS[kind]}. File chỉ có một sheet Sổ cấp PCT.</DialogDescription>
      <label className="space-y-1 text-sm"><span>Phạm vi xuất</span><select className={control} value={exportMode} disabled={exporting.isPending} onChange={e => setExportMode(e.target.value as "year" | "filters")}><option value="year">Toàn bộ sổ theo năm cấp số</option><option value="filters">Theo bộ lọc đang xem</option></select></label>
      {exportMode === "year" ? <label className="space-y-1 text-sm"><span>Năm cấp số *</span><input className={control} type="number" min={2000} max={2100} disabled={exporting.isPending} value={exportYear || ""} onChange={e => setExportYear(Number(e.target.value))} /><p className="text-xs text-muted-foreground">Xuất tất cả phiếu của sổ đã chọn trong năm này, gồm giấy và điện tử. Không áp dụng bộ lọc ngày, trạng thái hoặc từ khóa bên ngoài.</p></label> : <p className="text-sm text-muted-foreground">Áp dụng các bộ lọc hiện tại, lấy toàn bộ trang kết quả.</p>}
      <Button disabled={exporting.isPending} onClick={exportBook}><Download />{exporting.isPending ? "Đang xuất…" : "Tải Excel"}</Button>
    </DialogContent></Dialog>}
    {cancelReservationTarget && <Dialog open onOpenChange={open => { if (!open) setCancelReservationTarget(null); }}><DialogContent><DialogTitle>Hủy lượt lấy số {formatPermitNumber(cancelReservationTarget)}</DialogTitle><DialogDescription>Số sẽ không tự xuất hiện lại ở nút lấy số tiếp theo. Lịch sử lượt lấy vẫn được giữ.</DialogDescription><label className="block space-y-1.5 text-sm"><span className="font-medium">Lý do hủy *</span><textarea className={control} rows={3} maxLength={2000} value={cancelReservationReason} onChange={e => setCancelReservationReason(e.target.value)} /></label><Button variant="destructive" disabled={!cancelReservationReason.trim() || cancelReservation.isPending} onClick={async () => { try { await cancelReservation.mutateAsync({ id: cancelReservationTarget.id, reason: cancelReservationReason }); toast.success("Đã hủy lượt lấy số"); setCancelReservationTarget(null); } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể hủy lượt lấy số"); } }}>Xác nhận hủy</Button></DialogContent></Dialog>}
    {baselineOpen && <PermitNumberBaselineDialog onClose={() => setBaselineOpen(false)} />}
    {(editor || newPermit) && <PermitEditor initial={editor ?? undefined} kind={newPermit?.kind ?? editor?.kind ?? kind} presetTeamType={newPermit?.teamType} initialReservation={newPermit?.reservation} onClose={() => { setEditor(null); setNewPermit(null); }} onSaved={row => { setEditor(null); setNewPermit(null); if (row.teamType === "CONTRACTOR" && row.status === "ISSUED") setDetail(row.id); }} />}
    {detail && <PermitDetail key={detail} id={detail} canIssue={meta?.canIssue ?? false} canExecute={meta?.canExecute ?? false} onClose={() => setDetail(undefined)} onEdit={row => { setDetail(undefined); setNewPermit(null); setEditor(row); }} />}
  </div>;
}

function PermitNumberBaselineDialog({ onClose }: { onClose: () => void }) {
  const [year, setYear] = useState(Number(vietnamNow().slice(0, 4)));
  const [kind, setKind] = useState<PermitKind>("MECHANICAL");
  const [numberEdit, setNumberEdit] = useState<{ scope: string; value: string } | null>(null);
  const [reason, setReason] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const query = usePermitNumberBaselines(year, Number.isInteger(year) && year >= 2000 && year <= 2100);
  const save = useSetPermitNumberBaseline();
  const row = query.data?.data.find(item => item.kind === kind);
  const scope = `${kind}:${year}`;
  const number = numberEdit?.scope === scope ? numberEdit.value : row?.baseline?.number ?? "";
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="sm:max-w-xl"><DialogTitle>Mốc số PCT theo sổ giấy</DialogTitle><DialogDescription>Mỗi loại PCT có dãy riêng theo năm. Nhập 0 khi mở sổ năm mới; mọi điều chỉnh đều lưu lý do và lịch sử.</DialogDescription>
    <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span className="font-medium">Loại PCT</span><select className={control} value={kind} onChange={e => { setKind(e.target.value as PermitKind); setReason(""); }}>{Object.entries(PERMIT_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="space-y-1.5 text-sm"><span className="font-medium">Năm</span><input className={control} type="number" min={2000} max={2100} value={year} onChange={e => { setYear(Number(e.target.value)); setReason(""); }} /></label></div>
    {query.isPending ? <p className="text-sm text-muted-foreground">Đang tải mốc sổ giấy…</p> : query.isError ? <p className="text-sm text-red-700">Không thể tải mốc sổ giấy.</p> : <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-950">Số cao nhất đã lấy/cấp: <strong>{row?.highest ?? "0"}</strong> · Số tiếp theo dự kiến: <strong>{row?.suggested ?? "Chưa cấu hình"}</strong></p>}
    {Boolean(row?.legacyDuplicates.length) && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><p className="font-semibold">Có số trùng trong hồ sơ cũ cần rà soát:</p>{row?.legacyDuplicates.map(item => <p key={item.number} className="mt-1">Số {item.number}: {item.permitIds.map((id, index) => <span key={id}>{index > 0 ? ", " : ""}<a className="underline" href={`/work-permits?permitId=${id}`} target="_blank" rel="noopener noreferrer">Phiếu {index + 1}</a></span>)}</p>)}</div>}
    <label className="space-y-1.5 text-sm"><span className="font-medium">Mốc sổ giấy *</span><input className={control} inputMode="numeric" pattern="[0-9]*" value={number} maxLength={80} onChange={e => setNumberEdit({ scope, value: e.target.value })} placeholder="Ví dụ: 896 hoặc 0" /></label>
    <label className="space-y-1.5 text-sm"><span className="font-medium">Lý do thiết lập / điều chỉnh *</span><textarea className={control} rows={2} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <Button disabled={save.isPending || !/^[0-9]+$/.test(number) || !reason.trim()} onClick={async () => { try { await save.mutateAsync({ kind, year, number, reason, version: row?.baseline?.version }); toast.success("Đã lưu mốc sổ giấy"); setReason(""); setNumberEdit(null); } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể lưu mốc sổ giấy"); } }}>{save.isPending ? "Đang lưu…" : "Lưu mốc sổ giấy"}</Button>
    {Boolean(row?.history.length) && <PermitBaselineHistory items={row!.history} open={historyOpen} onToggle={() => setHistoryOpen(value => !value)} />}
  </DialogContent></Dialog>;
}

/** Lịch sử mốc sổ giấy: server trả tối đa 10 lần gần nhất; thu gọn chỉ hiện 3 lần mới nhất. */
function PermitBaselineHistory({ items, open, onToggle }: { items: Array<{ id: string; before: string | null; after: string; reason: string; actorName: string; createdAt: string }>; open: boolean; onToggle: () => void }) {
  const shown = open ? items.slice(0, 10) : items.slice(0, 3);
  const more = Math.min(items.length, 10) - 3;
  return <div className="border-t pt-3">
    <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Lịch sử gần đây</p>
    <ul className={open ? "max-h-56 overflow-y-auto" : undefined}>{shown.map(item => <li key={item.id} className="flex gap-2 py-1 text-xs text-muted-foreground"><span className="shrink-0 tabular-nums">{new Date(item.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span><span className="min-w-0"><strong className="font-semibold text-foreground">{item.before ?? "Chưa có"} → {item.after}</strong> · {item.actorName} · {item.reason}</span></li>)}</ul>
    {more > 0 && <button type="button" onClick={onToggle} aria-expanded={open} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">{open ? "Thu gọn" : `Xem thêm ${more} lần`}<ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} /></button>}
  </div>;
}

type PermitEditorStepKey = "info" | "paper" | "people" | "status";
type PermitEditorIssue = { step: PermitEditorStepKey; label: string };
const permitEditorStepMeta: Record<PermitEditorStepKey, { label: string; shortLabel: string; icon: typeof FileText }> = {
  info: { label: "Thông tin phiếu", shortLabel: "Thông tin", icon: FileText },
  paper: { label: "Mẫu giấy & an toàn", shortLabel: "Mẫu giấy", icon: ShieldCheck },
  people: { label: "Nhân sự & đơn vị", shortLabel: "Nhân sự", icon: UsersRound },
  status: { label: "Trạng thái & kết quả", shortLabel: "Trạng thái", icon: CheckCircle2 },
};

function PermitEditor({ initial, kind, presetTeamType, initialReservation, onClose, onSaved }: { initial?: PermitRow; kind: PermitKind; presetTeamType?: PermitInput["teamType"]; initialReservation?: PermitNumberReservation; onClose: () => void; onSaved: (row: PermitRow) => void }) {
  const [form, setForm] = useState<PermitInput>(initial ? { ...initial, managingUnit: initial.managingUnit || DEFAULT_PERMIT_MANAGING_UNIT, plantName: initial.plantName || DEFAULT_PERMIT_PLANT, ...(effectivePermitFormat(initial) === "PAPER" ? { plannedStartAt: initial.plannedStartAt ?? `${vietnamNow()}:00+07:00`, plannedEndAt: initial.plannedEndAt ?? (initial.plannedStartAt && new Date(initial.plannedStartAt) > new Date() ? initial.plannedStartAt : `${vietnamNow()}:00+07:00`) } : {}), issuedAt: initial.issuedAt ?? (initial.status !== "DRAFT" ? `${vietnamNow()}:00+07:00` : null), format: effectivePermitFormat(initial), safetyItems: initial.kind === "ELECTRICAL" ? [] : initial.safetyItems } : { ...defaultForm(kind, presetTeamType), ...(initialReservation ? { number: initialReservation.number, year: initialReservation.year } : {}) });
  const [nkvhLink, setNkvhLink] = useState(() => initial?.nkvhPctId ? nkvhPctUrl(initial.kind, initial.nkvhPctId) : "");
  let nkvhId: string | null = null;
  let nkvhError = "";
  try { nkvhId = parseNkvhPctLink(nkvhLink, form.kind); } catch (error) { nkvhError = error instanceof Error ? error.message : "Link NKVH không hợp lệ"; }
  const [status, setStatus] = useState<PermitStatus>(initial?.status ?? "ISSUED");
  const [reservation, setReservation] = useState<PermitNumberReservation | null>(initialReservation ?? null);
  const takeNumber = useTakePermitNumber();
  const [pickSyc, setPickSyc] = useState(false); const [pickSafety, setPickSafety] = useState(false); const [previewing, setPreviewing] = useState(false); const save = useSaveWorkPermit();
  const cancelDraft = useCancelDraftWorkPermit();
  const [pickCommander, setPickCommander] = useState(false);
  const { data: session } = useSession();
  const [issuerNameOverride, setIssuerNameOverride] = useState(initial?.status !== "DRAFT" ? initial?.issuerName ?? "" : "");
  // null = chưa sửa: điền sẵn chức vụ của tài khoản đăng nhập (xem issuerPositionDisplay); đã lưu chức vụ thì giữ.
  const [issuerPositionOverride, setIssuerPositionOverride] = useState<string | null>(initial?.issuerPosition || null);
  const numberEditable = (!initial || initial.status === "DRAFT") && !reservation;
  /*
   * Đổi loại phiếu (nội bộ · điện tử ⇄ nhà thầu · giấy) GIỮ NGUYÊN SỐ: số thuộc về sổ Cơ/Điện,
   * không thuộc loại đơn vị. Phiếu mới luôn đổi được; phiếu đã cấp chỉ đổi khi còn ở "Đã cấp",
   * chưa cho phép làm việc và chưa có lần làm việc nào — server kiểm lại đúng các điều kiện này.
   */
  const canSwitchType = !initial || initial.status === "DRAFT" || (initial.status === "ISSUED" && !initial.authorizedAt && ((initial as { _count?: { sessions?: number } })._count?.sessions ?? 0) === 0);
  function switchTeamType(next: PermitInput["teamType"]) {
    if (next === form.teamType) return;
    setForm(prev => ({
      ...prev, teamType: next, format: defaultPermitFormat(next),
      // Bộ ô riêng của từng loại không mang sang được: CHTT nhà thầu phải chọn trong danh bạ nhà
      // thầu, còn danh sách người/biện pháp an toàn của loại cũ không còn ý nghĩa.
      commanderPersonId: null, members: [],
      ...(next === "CONTRACTOR" ? { commanderName: "", teamName: "" } : { safetyItems: [], teamName: DEFAULT_INTERNAL_TEAM_NAME[prev.kind] }),
    }));
    if (next === "CONTRACTOR") setNkvhLink("");
    setActiveStep("info");
    toast.info(`Đã chuyển sang ${next === "CONTRACTOR" ? "phiếu nhà thầu · PCT giấy" : "phiếu nội bộ · PCT điện tử"} — số PCT giữ nguyên. Kiểm tra lại bước Nhân sự trước khi lưu.`);
  }
  const numberSuggestion = usePermitNumberSuggestion(form.kind, form.year, numberEditable);
  const issuerDisplay = issuerNameOverride || session?.user?.name || "";
  // Phiếu đã cấp bởi người khác (hoặc tên người cấp gõ tay) thì không điền chức vụ của người đang sửa.
  const ownIssuer = !initial || initial.status === "DRAFT" || (Boolean(initial.issuerUserId) && initial.issuerUserId === session?.user?.id);
  const issuerPositionDisplay = issuerPositionOverride ?? (ownIssuer ? session?.user?.position ?? "" : "");
  const users = useUsers({ enabled: form.teamType === "INTERNAL" }); const namesId = useId();
  // PCT nội bộ: CHTT và lãnh đạo công việc là người bên phân xưởng sửa chữa, không phải tài khoản
  // web — gợi ý theo tên đã ghi trên các phiếu nội bộ trước của cùng sổ.
  const internal = form.teamType === "INTERNAL";
  const nameSuggestions = usePermitNameSuggestions(form.kind, internal);
  const commandersId = useId(); const leadersId = useId();
  const nameListFor = (key: keyof PermitInput) => internal && key === "commanderName" ? commandersId : internal && key === "leaderName" ? leadersId : key.endsWith("Name") && key !== "teamName" ? namesId : undefined;
  const formRef = useRef<HTMLFormElement>(null);
  const [activeStep, setActiveStep] = useState<PermitEditorStepKey>("info");
  const paper = effectivePermitFormat(form) === "PAPER";
  const steps = useMemo<PermitEditorStepKey[]>(() => ["info", ...(paper ? ["paper" as const] : []), "people", "status"], [paper]);
  const activeStepIndex = Math.max(0, steps.indexOf(activeStep));
  const set = <K extends keyof PermitInput>(key: K, value: PermitInput[K]) => setForm(prev => ({ ...prev, [key]: value }));
  const textField = (key: keyof PermitInput, required = false, wide = false) => <label key={key} className={`space-y-1.5 text-[13px] ${wide ? "md:col-span-2" : ""}`}><span className="font-medium">{PERMIT_FIELD_LABELS[key]}{required ? " *" : ""}</span><input disabled={key === "authorizerName"} className={control} value={String(form[key] ?? "")} required={required} maxLength={key === "location" ? 500 : 200} list={nameListFor(key)} autoComplete="off" onChange={e => key === "repairRequestNumber" ? setForm(prev => ({ ...prev, repairRequestNumber: e.target.value, defectId: null })) : set(key, e.target.value as never)} />{key === "repairRequestNumber" && <span className={`block text-xs ${form.defectId ? "font-medium text-emerald-700" : "text-muted-foreground"}`}>{form.defectId ? "Đã gắn với SYC; PCT sẽ hiện trong Theo dõi Vận hành của phiếu này." : "Số nhập tay chỉ để đối chiếu."}</span>}</label>;
  const dateField = (key: "issuedAt" | "authorizedAt" | "closedAt", required: boolean) => <label className="space-y-1.5 text-[13px]"><span className="font-medium">{PERMIT_FIELD_LABELS[key]} (giờ Việt Nam){required ? " *" : ""}</span><input disabled={form.teamType === "CONTRACTOR" && key !== "issuedAt"} className={control} type="datetime-local" required={required} value={localTime(form[key])} onChange={e => {
    const value = e.target.value ? `${e.target.value}:00+07:00` : null;
    if (key === "issuedAt" && numberEditable && value) {
      const year = Number(e.target.value.slice(0, 4));
      setForm(prev => ({ ...prev, issuedAt: value, year, number: year === prev.year ? prev.number : "" }));
    } else set(key, value);
  }} /></label>;
  const issued = ["ISSUED", "ACTIVE", "PAUSED", "WAITING", "CLOSED"].includes(status);
  const options = initial ? [initial.status, ...(initial.teamType === "CONTRACTOR" ? CONTRACTOR_PERMIT_TRANSITIONS : PERMIT_TRANSITIONS)[initial.status].filter(s => (initial.teamType === "INTERNAL" ? ["ISSUED", "CLOSED", "CANCELLED"] : ["ISSUED", "CANCELLED"]).includes(s) && !(initial.status === "DRAFT" && s === "CANCELLED"))] : ["ISSUED"] as PermitStatus[];
  const requiredIssues: PermitEditorIssue[] = [];
  const requireValue = (condition: boolean, step: PermitEditorStepKey, label: string) => { if (!condition) requiredIssues.push({ step, label }); };
  requireValue(Boolean(form.number.trim()), "info", "Số PCT");
  if ((!initial || initial.status === "DRAFT") && status === "ISSUED") requireValue(Boolean(reservation), "info", "Lấy số PCT");
  requireValue(Number.isInteger(form.year) && form.year >= 2000 && form.year <= 2100, "info", "Năm cấp số");
  requireValue(Boolean(form.unit), "info", "Tổ máy");
  requireValue(Boolean(form.workDate), "info", "Ngày thực hiện");
  requireValue(Boolean(form.content.trim()), "info", "Nội dung công việc");
  if (paper && form.kind === "MECHANICAL") {
    requireValue(Boolean(form.managingUnit?.trim()), "info", "Đơn vị QLVH");
  }
  if (!paper && nkvhError) requiredIssues.push({ step: "info", label: "Liên kết phiếu NKVH hợp lệ" });
  if (paper && issued && form.safetyItems?.some(row => !row.forAuthorization && !row.forExecution)) requiredIssues.push({ step: "paper", label: "Phân công đơn vị cho từng biện pháp" });
  if (issued) {
    requireValue(Boolean(issuerDisplay.trim()), "people", "Người cấp PCT");
    requireValue(form.teamType === "CONTRACTOR" ? Boolean(form.commanderPersonId) : Boolean(form.commanderName.trim()), "people", "Chỉ huy trực tiếp");
    requireValue(Boolean(form.teamName.trim()), paper && form.kind === "MECHANICAL" ? "info" : "people", "Đơn vị công tác");
    if (form.teamType === "INTERNAL") requireValue(Boolean(form.members.length || form.workerCount), "people", "Số nhân viên");
    requireValue(Boolean(form.issuedAt), "status", "Ngày giờ cấp phiếu");
    if (form.issuedAt && Number(localTime(form.issuedAt).slice(0, 4)) !== form.year) requiredIssues.push({ step: "status", label: "Năm cấp phiếu phải trùng năm của Số PCT" });
  }
  if (status === "CLOSED") {
    requireValue(Boolean(form.closedAt), "status", "Ngày giờ đóng phiếu");
    if (form.teamType === "CONTRACTOR") requireValue(Boolean(form.result.trim()), "status", "Kết quả công việc");
  }
  if (["PAUSED", "CANCELLED"].includes(status)) requireValue(Boolean(form.statusReason.trim()), "status", `Lý do ${status === "PAUSED" ? "tạm dừng" : "hủy phiếu"}`);
  const issueCountByStep = (key: PermitEditorStepKey) => requiredIssues.filter(issue => issue.step === key).length;
  const selectStep = (key: PermitEditorStepKey) => {
    setActiveStep(key);
    requestAnimationFrame(() => document.getElementById(`permit-step-${key}`)?.focus({ preventScroll: true }));
  };
  const validateStep = (key: PermitEditorStepKey) => {
    const issue = requiredIssues.find(item => item.step === key);
    if (!issue) return true;
    toast.error(`Vui lòng bổ sung: ${issue.label}`);
    selectStep(key);
    return false;
  };
  const goNext = () => {
    if (!validateStep(activeStep)) return;
    const next = steps[activeStepIndex + 1];
    if (next) selectStep(next);
  };
  const goBack = () => {
    const previous = steps[activeStepIndex - 1];
    if (previous) selectStep(previous);
  };
  async function cancelDraftNow() {
    if (!initial || initial.status !== "DRAFT" || !window.confirm("Hủy PCT nháp này? Thao tác không yêu cầu điền CHTT hay các thông tin còn thiếu và phiếu sẽ bị khóa chỉnh sửa.")) return;
    try { const row = await cancelDraft.mutateAsync({ id: initial.id, version: initial.version }); toast.success("Đã hủy PCT nháp"); onSaved(row); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không thể hủy PCT nháp"); }
  }
  async function confirmNumber() {
    if (reservation) return;
    try {
      // Luôn lấy số tiếp theo của sổ; số đã hủy bị bỏ, không cấp lại.
      const result = await takeNumber.mutateAsync({ kind: form.kind, year: form.year, teamType: form.teamType });
      setReservation(result);
      set("number", result.number);
      toast.success(`Đã lấy số PCT ${formatPermitNumber(result)}. Số được giữ đến khi lưu; chọn nhầm loại phiếu thì đổi ngay ở đầu biểu mẫu.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể lấy số PCT"); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const firstIssue = requiredIssues[0];
    if (firstIssue) { toast.error(`Vui lòng bổ sung: ${firstIssue.label}`); selectStep(firstIssue.step); return; }
    try {
      const body = { ...form, nkvhPctId: effectivePermitFormat(form) === "ELECTRONIC" ? nkvhId : null, issuerName: issuerDisplay, issuerPosition: issuerPositionDisplay, status,
        ...((!initial || initial.status === "DRAFT") && status === "ISSUED" ? { reservationId: reservation?.id } : {}) };
      const row = await save.mutateAsync({ id: initial?.id, body: { ...body, version: initial?.version } });
      toast.success(initial ? "Đã cập nhật sổ PCT" : "Đã cấp phiếu và ghi số vào sổ");
      onSaved(row);
    }
    catch (error) {
      const message = error instanceof Error ? error.message : "Không thể lưu phiếu";
      if (message.includes(DUPLICATE_PERMIT_NUMBER_ERROR)) {
        selectStep("info");
        if (reservation) {
          toast.error("Số đã lấy bị xung đột với hồ sơ khác. Hãy báo quản trị kiểm tra và hủy lượt lấy số này.");
          return;
        }
        void numberSuggestion.refetch();
        toast.error(`${DUPLICATE_PERMIT_NUMBER_ERROR} Bấm Lấy số PCT để lấy số tiếp theo.`);
        return;
      }
      toast.error(message);
    }
  }
  const busy = save.isPending || takeNumber.isPending || cancelDraft.isPending;
  const completedSteps = steps.filter(key => issueCountByStep(key) === 0).length;
  const completionPercent = Math.round((completedSteps / steps.length) * 100);
  const summaryPanel = <div className="space-y-4">
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mức độ hoàn tất</span><strong className="text-sm tabular-nums text-foreground">{completionPercent}%</strong></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-[width] duration-300 ${requiredIssues.length ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${completionPercent}%` }} /></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{requiredIssues.length ? `Còn ${requiredIssues.length} mục cần bổ sung trước khi lưu.` : "Các trường bắt buộc đã đầy đủ."}</p></div>
    <dl className="space-y-3 rounded-xl border border-border bg-background p-4 text-sm shadow-sm"><div><dt className="text-xs text-muted-foreground">Số phiếu</dt><dd className="mt-0.5 break-words font-semibold text-foreground">{form.number.trim() ? formatPermitNumber(form) : "Chưa nhập"}</dd></div><div className="grid grid-cols-2 gap-3"><div><dt className="text-xs text-muted-foreground">Loại phiếu</dt><dd className="mt-0.5 font-medium">{PERMIT_KINDS[form.kind]}</dd></div><div><dt className="text-xs text-muted-foreground">Hình thức</dt><dd className="mt-0.5"><PermitFormat permit={form} /></dd></div></div><div className="grid grid-cols-2 gap-3"><div><dt className="text-xs text-muted-foreground">Tổ máy</dt><dd className="mt-0.5 font-medium">{PERMIT_UNITS[form.unit]}</dd></div><div><dt className="text-xs text-muted-foreground">Trạng thái</dt><dd className="mt-0.5"><Status value={status} /></dd></div></div><div><dt className="text-xs text-muted-foreground">Đơn vị công tác</dt><dd className="mt-0.5 line-clamp-2 font-medium">{form.teamName || "Chưa nhập"}</dd></div>{paper && form.kind === "MECHANICAL" && <div><dt className="text-xs text-muted-foreground">Biện pháp đã chọn</dt><dd className="mt-0.5 font-medium tabular-nums">{form.safetyItems?.length ?? 0}</dd></div>}</dl>
    {requiredIssues.length > 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="flex items-center gap-2 text-sm font-semibold text-amber-950"><CircleAlert size={16} />Cần bổ sung</h3><ul className="mt-2 space-y-1.5">{requiredIssues.map((issue, index) => <li key={`${issue.step}-${issue.label}-${index}`}><button type="button" onClick={() => selectStep(issue.step)} className="flex w-full items-start gap-2 rounded-md px-1 py-1 text-left text-xs leading-5 text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />{issue.label}</button></li>)}</ul></div> : <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 shrink-0" size={18} /><span>Phiếu đã đủ dữ liệu bắt buộc để lưu.</span></div>}
  </div>;
  const numberAction = reservation ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium leading-4 text-emerald-800 lg:whitespace-nowrap" aria-live="polite">Đã giữ số {formatPermitNumber(reservation)}. Số được giữ nếu đóng biểu mẫu.</p> : numberEditable ? <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-2.5 py-2 text-[11px] text-sky-950 lg:flex-nowrap" aria-live="polite">
    {numberSuggestion.isPending ? <span className="min-w-0 flex-1">Đang tải số dự kiến…</span> : numberSuggestion.isError ? <span className="min-w-0 flex-1">Chưa lấy được số dự kiến.</span> : !numberSuggestion.data?.data.configured ? <span className="min-w-0 flex-1 lg:whitespace-nowrap">Chưa thiết lập mốc sổ giấy năm {form.year}.</span> : <span className="min-w-0 flex-1 lg:whitespace-nowrap">Số dự kiến: <strong className="tabular-nums">{numberSuggestion.data.data.suggested}</strong> · Chốt khi bấm lấy số.</span>}
    <Button type="button" size="sm" className="h-8 shrink-0 bg-blue-700 hover:bg-blue-800" disabled={takeNumber.isPending || !numberSuggestion.data?.data.configured} onClick={() => void confirmNumber()}>{takeNumber.isPending ? "Đang lấy số…" : "Lấy số PCT"}</Button>
  </div> : null;
  const numberField = <div className="min-w-0 space-y-1.5 text-sm">
    <label className="block font-medium" htmlFor="permit-number">Số PCT *</label>
    <div className="flex min-h-10 w-full items-center rounded-lg border border-input bg-background shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
      <input id="permit-number" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[13px] outline-none disabled:cursor-not-allowed" aria-invalid={!form.number.trim()} aria-label="Số thứ tự PCT" inputMode="numeric" maxLength={80} value={form.number} readOnly disabled={!numberEditable} placeholder={numberEditable ? "Bấm Lấy số PCT" : undefined} />
      {(!form.number.trim() || /^\d+$/.test(form.number.trim())) && <span className="shrink-0 border-l border-input px-2 text-xs font-semibold tabular-nums text-muted-foreground sm:px-3">/{form.year}/VH1-NĐDH</span>}
    </div>
  </div>;
  return <Dialog open onOpenChange={v => { if (!v && !busy) onClose(); }}><DialogContent className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-0 p-0 font-sans text-[13px] sm:left-[50%] sm:top-[50%] sm:h-[min(92dvh,900px)] sm:max-h-[900px] sm:w-[min(96vw,1180px)] sm:max-w-[1180px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:border">
    <div className="shrink-0 border-b border-border bg-background px-4 py-4 pr-14 sm:px-6 sm:py-5 sm:pr-14"><div className="flex flex-wrap items-start justify-between gap-3"><div><DialogTitle className="text-lg tracking-[-0.01em] sm:text-xl">{initial ? `Cập nhật PCT ${formatPermitNumber(initial)}` : `Cấp phiếu ${form.teamType === "INTERNAL" ? "nội bộ" : "nhà thầu"} · ${PERMIT_KINDS[form.kind]}`}</DialogTitle><DialogDescription className="mt-1 max-w-2xl text-[13px] leading-5">Nhập theo phiếu thực tế. Người cấp phiếu được điền sẵn theo tài khoản thao tác và có thể sửa lại khi cần.</DialogDescription>{canSwitchType && <div className="mt-3 inline-flex rounded-lg border border-border bg-muted/30 p-0.5" role="radiogroup" aria-label="Loại phiếu">{(["INTERNAL", "CONTRACTOR"] as const).map(type => <button key={type} type="button" role="radio" aria-checked={form.teamType === type} disabled={busy} onClick={() => switchTeamType(type)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${form.teamType === type ? "bg-white text-blue-800 shadow-sm dark:bg-background dark:text-blue-200" : "text-muted-foreground hover:text-foreground"}`}>{type === "INTERNAL" ? "Nội bộ · PCT điện tử" : "Nhà thầu · PCT giấy"}</button>)}</div>}</div><div className="flex items-center gap-2"><PermitFormat permit={form} /><Status value={status} /></div></div></div>
    <form ref={formRef} noValidate onSubmit={submit} onKeyDown={event => { if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); goBack(); } else if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); goNext(); } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); formRef.current?.requestSubmit(); } }} className="flex min-h-0 min-w-0 flex-1 flex-col [&_.text-sm]:text-[13px]">
      <fieldset disabled={busy} className="flex min-h-0 min-w-0 flex-1 flex-col"><datalist id={namesId}>{users.data?.data.map(u => <option key={u.id} value={u.name} />)}</datalist><datalist id={commandersId}>{nameSuggestions.data?.data.commanders.map(name => <option key={name} value={name} />)}</datalist><datalist id={leadersId}>{nameSuggestions.data?.data.leaders.map(name => <option key={name} value={name} />)}</datalist>
        <nav className="w-full max-w-full shrink-0 overflow-x-auto border-b border-border bg-muted/20 px-3 py-3 sm:px-6" aria-label="Các bước ghi cấp phiếu"><ol className="flex w-max min-w-full items-center gap-1" role="list">{steps.map((key, index) => { const meta = permitEditorStepMeta[key]; const Icon = meta.icon; const active = key === activeStep; const issueCount = issueCountByStep(key); return <li key={key} className="flex items-center"><button type="button" aria-current={active ? "step" : undefined} aria-controls={`permit-step-${key}`} onClick={() => selectStep(key)} className={`group flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 sm:px-3 ${active ? "bg-slate-900 text-white shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] ${active ? "bg-white/15" : issueCount ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{issueCount ? index + 1 : <Check size={14} />}</span><Icon size={15} className="hidden sm:block" /><span className="whitespace-nowrap">{meta.shortLabel}</span>{issueCount > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-amber-300 text-amber-950" : "bg-amber-100 text-amber-800"}`}>{issueCount}</span>}</button>{index < steps.length - 1 && <ChevronRight className="mx-0.5 text-muted-foreground/50" size={16} />}</li>; })}</ol></nav>
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_290px]">
          <main className="min-h-0 min-w-0 overflow-y-auto bg-background px-4 py-5 sm:px-6 sm:py-6">
            <details className="mb-5 rounded-xl border border-border bg-muted/20 lg:hidden"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Tóm tắt và kiểm tra dữ liệu ({requiredIssues.length})</summary><div className="border-t border-border p-3">{summaryPanel}</div></details>
            {activeStep === "info" && <section id="permit-step-info" tabIndex={-1} aria-labelledby="permit-step-info-title" className="mx-auto max-w-3xl space-y-5 outline-none">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0"><h2 id="permit-step-info-title" className="text-lg font-bold tracking-tight text-foreground">Thông tin phiếu</h2><p className="mt-1 text-[13px] text-muted-foreground">Nhập số phiếu, thiết bị và nội dung công việc.</p></div>
                <div className="min-w-0 sm:w-[320px] sm:shrink-0 lg:w-[380px]">
                  <p className="mb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Bước {activeStepIndex + 1}/{steps.length}</p>
                  {/* Ô "Lấy số PCT" đứng ở đầu bước cho MỌI loại phiếu — cùng vị trí với mẫu giấy nhà thầu. */}
                  {numberAction}
                </div>
              </div>
              {!paper && <NkvhLinkEditor kind={form.kind} value={nkvhLink} onChange={setNkvhLink} disabled={save.isPending} />}
              {/* Cương vị và Số PCT đứng chung một hàng (hai cột, căn theo mép trên) — mẫu giấy Cơ tự bố trí riêng trong MechanicalPaperInfo. */}
              {paper && form.kind === "MECHANICAL" ? <MechanicalPaperInfo form={form} issued={issued} numberField={numberField} onChange={set} onPickSyc={() => setPickSyc(true)} /> : <div className="grid items-start gap-4 md:grid-cols-2">
                <label className="block space-y-1.5 text-sm"><span className="block font-medium">Cương vị</span><select className={control} value={form.position} onChange={e => set("position", e.target.value)}><option value="">Tất cả cương vị</option>{OPERATION_POSITION_TITLES.map(value => <option key={value} value={value}>{value}</option>)}</select><span className="block text-xs text-muted-foreground">Không bắt buộc; dùng để ghi cương vị trên phiếu.</span></label>
                {numberField}
              </div>}
              {/* Ba ô ngắn Tổ máy · Ngày thực hiện · Số SYC đứng chung một hàng; thiết bị/vị trí và nội dung chiếm trọn hàng. */}
              {!(paper && form.kind === "MECHANICAL") && <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.4fr)]"><label className="space-y-1.5 text-sm"><span className="font-medium">Tổ máy *</span><select className={control} value={form.unit} onChange={e => set("unit", e.target.value as PermitInput["unit"])}>{Object.entries(PERMIT_UNITS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="space-y-1.5 text-sm"><span className="font-medium">Ngày thực hiện *</span><input className={control} aria-invalid={!form.workDate} type="date" value={form.workDate} onChange={e => set("workDate", e.target.value)} /></label><div className="space-y-1.5 text-sm"><span className="block font-medium">{PERMIT_FIELD_LABELS.repairRequestNumber}</span><div className="flex gap-2"><input className={control} maxLength={100} value={form.repairRequestNumber} onChange={e => setForm(prev => ({ ...prev, repairRequestNumber: e.target.value, defectId: null }))} /><Button type="button" variant="outline" className="shrink-0" onClick={() => setPickSyc(true)}>Chọn SYC</Button></div><p className="truncate text-xs text-muted-foreground" title="Chọn SYC để tạo liên kết; số nhập tay chỉ để đối chiếu.">Chọn SYC để tạo liên kết; số nhập tay chỉ để đối chiếu.</p></div>{/* Thiết bị / vị trí đi theo SYC: chỉ hiện khi đã chọn SYC (SYC điền sẵn thiết bị) — phiếu cũ đã có vị trí thì vẫn hiện để không giấu dữ liệu. */}{(form.defectId || form.location.trim()) && textField("location", false, true)}<label className="space-y-1.5 text-sm md:col-span-3"><span className="font-medium">Nội dung công việc *</span><textarea className={control} aria-invalid={!form.content.trim()} rows={3} maxLength={5000} value={form.content} onChange={e => set("content", e.target.value)} /></label></div>}
            </section>}
            {activeStep === "paper" && paper && <section id="permit-step-paper" tabIndex={-1} aria-labelledby="permit-step-paper-title" className="mx-auto max-w-3xl space-y-5 outline-none"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0"><h2 id="permit-step-paper-title" className="text-lg font-bold tracking-tight text-foreground">Mẫu giấy và an toàn</h2><p className="mt-1 text-[13px] text-muted-foreground">Các thông tin tại đây được dùng để điền vào mẫu PCT giấy.</p></div>
                <div className="sm:shrink-0 sm:text-right">
                  <p className="mb-2 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-blue-700 sm:text-right dark:text-blue-300">Bước {activeStepIndex + 1}/{steps.length}</p>
                  {form.kind === "MECHANICAL" && <Button type="button" variant="outline" disabled={(form.safetyItems ?? []).length >= SAFETY_MAX_ROWS} onClick={() => setPickSafety(true)}><Plus />Chọn từ danh mục</Button>}
                </div>
              </div>{Boolean(form.kind !== "MECHANICAL") && <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-border dark:bg-background sm:p-5"><label className="block space-y-1.5 text-sm"><span className="font-medium">Địa điểm công tác (mục 1.4)</span><input className={control} value={form.location} maxLength={500} onChange={e => set("location", e.target.value)} placeholder="Địa điểm thực hiện công việc ghi tại mục 1.4 của PCT Điện" /></label><label className="block space-y-1.5 text-sm"><span className="font-medium">Số ĐKCT</span><input className={control} maxLength={200} value={form.registrationNumber ?? ""} onChange={e => set("registrationNumber", e.target.value)} placeholder="Ví dụ: 2609/2026/ĐK-SCCN hoặc điện trực tiếp" /><p className="text-xs leading-5 text-muted-foreground">Không bắt buộc; để trống thì không ghi trên mẫu in.</p></label>{form.kind === "MECHANICAL" && <label className="block space-y-1.5 text-sm"><span className="font-medium">Phạm vi công tác</span><textarea className={control} rows={2} maxLength={5000} value={form.workScope ?? ""} onChange={e => set("workScope", e.target.value)} placeholder="Giới hạn thiết bị, khu vực được phép thực hiện công việc" /></label>}<div className="grid gap-4 md:grid-cols-2">{(["plannedStartAt", "plannedEndAt"] as const).map(key => <label key={key} className="space-y-1.5 text-sm"><span className="font-medium">{PERMIT_FIELD_LABELS[key]} (giờ Việt Nam)</span><input className={control} type="datetime-local" value={localTime(form[key] ?? null)} min={key === "plannedEndAt" ? localTime(form.plannedStartAt ?? null) || undefined : undefined} onChange={e => set(key, e.target.value ? `${e.target.value}:00+07:00` : null)} /></label>)}</div>{form.kind === "MECHANICAL" && <fieldset className="rounded-lg border border-border p-3"><legend className="px-1 text-sm font-medium">Chuyên môn</legend><div className="flex flex-wrap gap-5">{Object.entries(PERMIT_DISCIPLINES).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-blue-700" checked={(form.disciplines ?? []).includes(key as PermitDiscipline)} onChange={e => set("disciplines", e.target.checked ? [...(form.disciplines ?? []), key as PermitDiscipline] : (form.disciplines ?? []).filter(v => v !== key))} />{label}</label>)}</div></fieldset>}</div>}{form.kind === "MECHANICAL" && <PermitSafetySelection key={form.kind} kind={form.kind} value={form.safetyItems ?? []} onChange={value => set("safetyItems", value)} pickOpen={pickSafety} onPickOpenChange={setPickSafety} />}</section>}
            {activeStep === "people" && <section id="permit-step-people" tabIndex={-1} aria-labelledby="permit-step-people-title" className="mx-auto max-w-3xl space-y-5 outline-none"><div className="relative pr-24"><p className="absolute right-0 top-0 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-blue-700">Bước {activeStepIndex + 1}/{steps.length}</p><h2 id="permit-step-people-title" className="mt-1 text-lg font-bold tracking-tight text-foreground">Nhân sự và đơn vị công tác</h2><p className="mt-1 text-[13px] text-muted-foreground">Xác nhận người cấp, chỉ huy và lực lượng thực hiện.</p></div><div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-border dark:bg-background md:grid-cols-2 sm:p-5"><label className="space-y-1.5 text-sm"><span className="font-medium">Người cấp PCT{issued ? " *" : ""}</span><input className={control} value={issuerDisplay} onChange={e => setIssuerNameOverride(e.target.value)} placeholder="Đang lấy tài khoản…" maxLength={200} /><p className="text-xs text-muted-foreground">Điền sẵn theo tài khoản đăng nhập; có thể sửa lại theo người cấp thực tế. Tài khoản thao tác vẫn được lưu trong lịch sử.</p></label>{paper && form.kind === "ELECTRICAL" && <label className="space-y-1.5 text-sm"><span className="font-medium">Chức vụ người cấp PCT</span><input className={control} value={issuerPositionDisplay} onChange={e => setIssuerPositionOverride(e.target.value)} maxLength={200} placeholder="Ví dụ: Trưởng ca" /><p className="text-xs text-muted-foreground">Điền sẵn theo tài khoản đăng nhập; in vào dòng &ldquo;Chức vụ&rdquo; dưới Người cấp phiếu.</p></label>}{form.teamType !== "CONTRACTOR" && textField("leaderName")}{form.teamType === "CONTRACTOR" ? <div className="space-y-1.5 text-sm"><span className="font-medium">Chỉ huy trực tiếp{issued ? " *" : ""}</span><div className={`rounded-lg border p-3 ${issued && !form.commanderPersonId ? "border-amber-400 bg-amber-50" : "border-input"}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 truncate font-medium">{form.commanderName || "Chưa chọn CHTT"}</p><Button type="button" variant="outline" size="sm" className="shrink-0 bg-white" onClick={() => setPickCommander(true)}>{form.commanderPersonId ? "Đổi CHTT" : "Chọn CHTT nhà thầu"}</Button></div></div><p className="text-xs text-muted-foreground">CHTT chỉ được giữ khi mở lần làm việc.</p></div> : textField("commanderName", issued)}{paper && form.kind === "MECHANICAL" ? <p className="self-center text-sm text-muted-foreground">Đơn vị công tác: <strong className="text-foreground">{form.teamName || "Chưa nhập"}</strong></p> : textField("teamName", issued)}{form.teamType !== "CONTRACTOR" && <label className="space-y-1.5 text-sm"><span className="font-medium">Số nhân viên{issued ? " *" : ""}</span><input className={control} type="number" min={1} max={10000} step={1} readOnly={form.members.length > 0} value={form.members.length || form.workerCount || ""} onChange={e => set("workerCount", e.target.value ? Number(e.target.value) : null)} /></label>}{form.kind === "ELECTRICAL" && paper && textField("electricalSafetySupervisorName")}{form.teamType !== "CONTRACTOR" && form.authorizerName && <div className="space-y-1.5 text-sm"><span className="font-medium">Người cho phép (dữ liệu cũ)</span><p className="rounded-lg border border-border p-3 text-muted-foreground">{form.authorizerName}</p></div>}</div>{form.teamType === "CONTRACTOR" && <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-border dark:bg-background"><summary className="cursor-pointer text-sm font-medium">Thông tin bổ sung: lãnh đạo và nhân viên công tác</summary><div className="mt-4 space-y-4">{textField("leaderName")}<PermitMembersEditor members={form.members} onChange={value => set("members", value)} commander={form.commanderPersonId ? { personId: form.commanderPersonId, name: form.commanderName, code: "", company: form.teamName } : undefined} /></div></details>}{form.teamType === "CONTRACTOR" && <p className="rounded-lg bg-sky-50 p-3 text-sm leading-6 text-sky-950">Sau khi cấp phiếu, mở chi tiết để ghi từng lần làm việc và tiến độ thực tế.</p>}</section>}
            {activeStep === "status" && <section id="permit-step-status" tabIndex={-1} aria-labelledby="permit-step-status-title" className="mx-auto max-w-3xl space-y-5 outline-none">
              <div className="relative pr-24"><p className="absolute right-0 top-0 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-blue-700">Bước {activeStepIndex + 1}/{steps.length}</p><h2 id="permit-step-status-title" className="mt-1 text-lg font-bold tracking-tight text-foreground">{initial ? "Trạng thái và kết quả" : "Xác nhận cấp phiếu"}</h2><p className="mt-1 text-[13px] text-muted-foreground">{initial ? "Ghi trạng thái đúng với phiếu thực tế trước khi lưu." : "Số PCT đã lấy sẽ được gắn vào phiếu khi lưu cấp phiếu."}</p></div>
              <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-border dark:bg-background md:grid-cols-2 sm:p-5">
                {initial ? <label className="space-y-1.5 text-sm"><span className="font-medium">Trạng thái ghi nhận *</span><select className={control} value={status} onChange={e => { const next = e.target.value as PermitStatus; setStatus(next); setForm(prev => ({ ...prev, issuedAt: next === "DRAFT" ? null : prev.issuedAt ?? (next === "ISSUED" ? `${vietnamNow()}:00+07:00` : null), authorizedAt: ["DRAFT", "ISSUED"].includes(next) ? null : prev.authorizedAt, closedAt: next === "CLOSED" ? prev.closedAt ?? `${vietnamNow()}:00+07:00` : null })); }}>{options.map(v => <option key={v} value={v}>{PERMIT_STATUSES[v]}</option>)}</select><p className="text-xs leading-5 text-muted-foreground">{status === "DRAFT" ? "Phiếu nháp cũ chưa ghi nhận cấp phiếu." : status === "ISSUED" ? "Phiếu đã được cấp thực tế." : "Ghi theo tình trạng thực tế của phiếu."}</p></label> : <div className="space-y-1.5 text-sm"><span className="font-medium">Trạng thái</span><p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 font-semibold text-sky-800">Đã cấp</p></div>}
                {status !== "DRAFT" && dateField("issuedAt", issued)}
                {status === "CLOSED" && dateField("closedAt", true)}
                {["PAUSED", "CANCELLED"].includes(status) && <label className="space-y-1.5 text-sm md:col-span-2"><span className="font-medium">Lý do {status === "PAUSED" ? "tạm dừng" : "hủy phiếu"} *</span><textarea className={control} rows={2} disabled={status === "PAUSED"} maxLength={2000} value={form.statusReason} onChange={e => set("statusReason", e.target.value)} /></label>}
                <label className="space-y-1.5 text-sm md:col-span-2"><span className="font-medium">Kết quả công việc{status === "CLOSED" && form.teamType === "CONTRACTOR" ? " *" : ""}</span><textarea className={control} rows={2} maxLength={5000} disabled={form.teamType === "CONTRACTOR"} value={form.result} onChange={e => set("result", e.target.value)} /></label>
                <label className="space-y-1.5 text-sm md:col-span-2"><span className="font-medium">Ghi chú</span><textarea className={control} rows={2} maxLength={5000} value={form.note} onChange={e => set("note", e.target.value)} /></label>
              </div>
              {["CLOSED", "CANCELLED"].includes(status) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Lưu phiếu ở trạng thái {PERMIT_STATUSES[status].toLowerCase()} sẽ khóa chỉnh sửa và giữ số phiếu trong sổ.</p>}
            </section>}
          </main>
          <aside className="hidden min-h-0 overflow-y-auto border-l border-border bg-slate-50/70 p-4 lg:block" aria-label="Tóm tắt phiếu">{summaryPanel}</aside>
        </div>
        <footer className="shrink-0 border-t border-border bg-background px-4 py-3 shadow-[0_-12px_30px_-28px_rgba(15,23,42,0.8)] sm:px-6"><div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><div className={`${initial?.status === "DRAFT" ? "flex" : "hidden sm:flex"} items-center justify-between gap-2 sm:justify-start`}>{initial?.status === "DRAFT" ? <Button type="button" variant="destructive" size="sm" onClick={() => void cancelDraftNow()}>{cancelDraft.isPending ? "Đang hủy…" : "Hủy PCT nháp"}</Button> : <span className="hidden text-xs text-muted-foreground xl:inline">Alt + ←/→ để chuyển bước · Ctrl + Enter để lưu</span>}<Button type="button" variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={onClose}>Để sau</Button></div><div className="grid grid-cols-2 gap-2 sm:flex">{paper && <Button type="button" variant="outline" className="col-span-2 sm:col-auto" title="Xem thông tin đang nhập trên mẫu PCT giấy trước khi cấp" onClick={() => setPreviewing(true)}><FileText />Xem mẫu in</Button>}<Button type="button" variant="outline" disabled={activeStepIndex === 0 || busy} onClick={goBack}><ChevronLeft />Quay lại</Button>{activeStepIndex < steps.length - 1 ? <Button type="button" onClick={goNext}>Tiếp tục<ChevronRight /></Button> : <Button type="submit" disabled={busy}>{save.isPending ? "Đang lưu…" : `Lưu · ${PERMIT_STATUSES[status]}`}</Button>}</div></div></footer>
      </fieldset>
    </form>
    {pickCommander && <PermitPeopleDirectory commandersOnly onClose={() => setPickCommander(false)} onPick={person => { setForm(prev => ({ ...prev, commanderPersonId: person.id, commanderName: person.name, teamName: person.company, members: prev.members.filter(member => member.personId ? member.personId !== person.id : member.code !== person.code) })); setPickCommander(false); }} />}
    {pickSyc && <SycPicker kind={form.kind} position={form.position} onClose={() => setPickSyc(false)} onPick={d => { setForm(prev => ({ ...prev, defectId: d.id, repairRequestNumber: d.requestNumber ?? "", content: d.content ?? prev.content, location: [d.deviceSeq, d.node?.name || d.sourceDeviceRaw || d.device].filter(Boolean).join(" · "), unit: Object.hasOwn(PERMIT_UNITS, d.unit) ? d.unit as PermitInput["unit"] : prev.unit })); setPickSyc(false); }} />}
    {previewing && <PermitDocumentPreview title={`Xem trước ${PERMIT_KINDS[form.kind]}${form.number.trim() ? ` · ${formatPermitNumber(form)}` : ""}`} load={() => apiDownloadPost("/api/work-permits/document-preview", { ...form, issuerName: issuerDisplay, issuerPosition: issuerPositionDisplay, status })} onClose={() => setPreviewing(false)} />}
  </DialogContent></Dialog>;
}
function SycPicker({ kind, position, onClose, onPick }: { kind: PermitKind; position: string; onClose: () => void; onPick: (d: DefectItem) => void }) {
  const [q, setQ] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  /* Đã chọn cương vị trên phiếu thì MẶC ĐỊNH chỉ bày SYC của cương vị đó — gần như luôn là cái
     cần chọn. Bỏ tick để tìm cả cương vị khác (SYC của cương vị khác vẫn cấp phiếu được). */
  const [onlyPosition, setOnlyPosition] = useState(Boolean(position));
  const filterByPosition = Boolean(position) && onlyPosition;
  const list = useDefects({ section: kind === "MECHANICAL" ? "co" : "dien", q: search, priorityPosition: position, ...(filterByPosition ? { position } : {}), page, limit: 10 });
  return <Dialog open onOpenChange={v => { if (!v) onClose(); }}><DialogContent className="max-w-2xl"><DialogTitle>Chọn SYC sửa chữa</DialogTitle><DialogDescription>{filterByPosition ? `Đang lọc SYC của cương vị ${position}.` : position ? `Đang hiển thị SYC của mọi cương vị, ưu tiên ${position} lên đầu.` : "Đang hiển thị SYC của tất cả cương vị. Chọn cương vị trên phiếu để lọc sẵn."} Thông tin được sao chép vào sổ PCT để đối chiếu.</DialogDescription>{position && <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-sm font-medium text-blue-900"><input type="checkbox" className="h-4 w-4 accent-blue-700" checked={onlyPosition} onChange={e => { setOnlyPosition(e.target.checked); setPage(1); }} />Chỉ hiện SYC của cương vị {position}</label>}<input aria-label="Tìm SYC" className={control} placeholder="Tìm số SYC, nội dung, thiết bị, cương vị…" value={q} onChange={e => setQ(e.target.value)} />{list.isError ? <p role="alert">{list.error.message}</p> : list.isPending ? <p>Đang tải SYC…</p> : <div className="space-y-2">{list.data?.data.map(d => { const preferred = Boolean(position && announcementPositionsMatch(d.system, position)); return <button disabled={!d.requestNumber || list.isFetching} className={`w-full rounded-lg border p-3 text-left hover:bg-muted disabled:opacity-50 ${preferred ? "border-blue-300 bg-blue-50/60" : "border-border"}`} key={d.id} onClick={() => onPick(d)}><div className="flex flex-wrap items-center justify-between gap-2"><b>{d.requestNumber || "Chưa cấp số"} · {d.unit}</b>{preferred && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">Đúng cương vị ưu tiên</span>}</div><p className="line-clamp-2 text-sm">{d.content || "Chưa có nội dung"}</p><p className="text-xs text-muted-foreground">{d.system || "Chưa ghi cương vị"} · {d.deviceSeq} · {d.node?.name || d.sourceDeviceRaw || d.device}</p></button>; })}{!list.data?.data.length && <p className="p-4 text-center">{filterByPosition ? `Cương vị ${position} chưa có SYC phù hợp — bỏ tick ở trên để tìm ở cương vị khác.` : "Không tìm thấy SYC phù hợp."}</p>}</div>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={page <= 1 || list.isFetching} onClick={() => setPage(page - 1)}>Trước</Button><Button variant="outline" disabled={!list.data || page >= list.data.meta.totalPages || list.isFetching} onClick={() => setPage(page + 1)}>Sau</Button></div></DialogContent></Dialog>;
}
/**
 * Chi tiết phiếu gom trường theo NHÓM thay vì đổ phẳng toàn bộ PERMIT_FIELD_LABELS: một phiếu có
 * hơn 20 trường, liệt kê phẳng thì người tra phải đọc hết mới thấy ô mình cần. `content` không nằm
 * trong nhóm nào vì được in ngay đầu hộp; `number`/`year`/`status`/`format` đã nằm ở tiêu đề và chip.
 */
const PERMIT_DETAIL_GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: "Công việc", keys: ["managingUnit", "plantName", "sourceClassification", "location", "workScope", "unit", "position", "workDate", "workType", "kind", "disciplines", "repairRequestNumber", "registrationNumber"] },
  { title: "Nhân sự", keys: ["issuerName", "commanderName", "teamName", "teamType", "workerCount", "leaderName", "electricalSafetySupervisorName", "authorizerName", "members"] },
  { title: "Mốc thời gian và kết quả", keys: ["plannedStartAt", "plannedEndAt", "issuedAt", "authorizedAt", "closedAt", "result", "statusReason", "note"] },
];
const PERMIT_DETAIL_WIDE = new Set(["workScope", "result", "note", "statusReason", "members"]);

function PermitDetailFields({ row }: { row: PermitRow }) {
  const [showEmpty, setShowEmpty] = useState(false);
  const shown = (key: string) => {
    if (row.teamType !== "CONTRACTOR" && ["authorizerName", "authorizedAt", "workerCount", "members"].includes(key) && !row[key as keyof PermitRow]) return false;
    return key in PERMIT_FIELD_LABELS;
  };
  const filled = (key: string) => permitValue(key, key === "format" ? effectivePermitFormat(row) : row[key as keyof PermitRow]) !== "—";
  const groups = PERMIT_DETAIL_GROUPS.map(group => ({ ...group, keys: group.keys.filter(key => shown(key) && (showEmpty || filled(key))) })).filter(group => group.keys.length);
  const emptyCount = PERMIT_DETAIL_GROUPS.flatMap(group => group.keys).filter(key => shown(key) && !filled(key)).length;
  /* Nhãn đứng trong CỘT RỘNG CỐ ĐỊNH (lối trình bày của khối chi tiết PCCC/TBYCNN): để nhãn tự
     co thì mỗi dòng có một điểm bắt đầu giá trị khác nhau, cả khối nhìn răng cưa. Bỏ luôn vạch
     kẻ từng dòng — khoảng trắng đủ tách dòng, ít nét hơn thì dễ dò hơn. */
  return <div className="space-y-4">
    {groups.map(group => <section key={group.title} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <h4 className="border-b border-border bg-muted/25 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</h4>
      <dl className="grid grid-cols-1 gap-x-10 gap-y-3 px-4 py-3.5 sm:grid-cols-2">{group.keys.map(key => <div key={key} className={`grid min-w-0 grid-cols-[104px_minmax(0,1fr)] items-baseline gap-x-3 sm:grid-cols-[136px_minmax(0,1fr)] ${PERMIT_DETAIL_WIDE.has(key) ? "sm:col-span-2" : ""}`}>
        <dt className="text-[10.5px] font-semibold uppercase leading-tight tracking-[0.03em] text-slate-500 dark:text-muted-foreground">{PERMIT_FIELD_LABELS[key]}</dt>
        <dd className={`min-w-0 whitespace-pre-wrap break-words text-[13px] leading-[1.5] ${filled(key) ? "font-medium text-foreground" : "text-muted-foreground"}`}>{permitValue(key, row[key as keyof PermitRow])}</dd>
      </div>)}</dl>
    </section>)}
    {emptyCount > 0 && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setShowEmpty(value => !value)}>{showEmpty ? "Ẩn ô chưa ghi" : `Hiện ${emptyCount} ô chưa ghi`}</Button>}
  </div>;
}

function PermitDetail({ id, canIssue: listCanIssue, canExecute: listCanExecute, onClose, onEdit }: { id: string; canIssue: boolean; canExecute: boolean; onClose: () => void; onEdit: (r: PermitRow) => void }) {
  const query = useWorkPermit(id);
  const [executing, setExecuting] = useState(false); const [previewing, setPreviewing] = useState(false); const row = query.data?.data;
  const canIssue = query.data?.meta?.canIssue ?? listCanIssue;
  const canExecute = query.data?.meta?.canExecute ?? listCanExecute;
  const documentExport = useExportPermitTemplate();
  const cancelDraft = useCancelDraftWorkPermit();
  // Xoá hẳn phiếu là lối can thiệp của QUẢN TRỊ; server kiểm lại vai trò (requireRole ADMIN).
  const { data: detailSession } = useSession();
  const isAdmin = detailSession?.user?.role === "ADMIN";
  const deletePermit = useDeleteWorkPermit();
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  async function deleteNow(row: PermitRow) {
    try {
      await deletePermit.mutateAsync({ id: row.id, version: row.version, reason: deleteReason.trim() });
      toast.success(`Đã xoá PCT ${formatPermitNumber(row)}`);
      setDeleting(false);
      onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể xoá PCT"); }
  }
  async function cancelDraftNow(row: PermitRow) {
    if (!window.confirm("Hủy PCT nháp này? Phiếu sẽ được hủy ngay cả khi chưa có CHTT hoặc còn thiếu thông tin.")) return;
    try { await cancelDraft.mutateAsync({ id: row.id, version: row.version }); toast.success("Đã hủy PCT nháp"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không thể hủy PCT nháp"); }
  }
  async function downloadTemplate() {
    try {
      const file = await documentExport.mutateAsync(id), url = URL.createObjectURL(file.blob);
      const a = document.createElement("a"); a.href = url; a.download = file.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Không thể tải mẫu phiếu"); }
  }
  const paper = row ? effectivePermitFormat(row) === "PAPER" : false;
  const summary = "flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-[13px] font-semibold marker:hidden hover:bg-muted/40";
  /* Hộp chi tiết chia ba tầng như biểu mẫu cấp phiếu: đầu hộp cố định (số phiếu · trạng thái ·
     hành động), thân cuộn riêng, nên cuộn xuống lịch sử vẫn thấy số phiếu và nút thao tác. */
  return <Dialog open onOpenChange={v => { if (!v && !cancelDraft.isPending) onClose(); }}><DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
    <div className="shrink-0 border-b border-border bg-muted/25 px-5 py-4 pr-12">
      <DialogTitle className="text-base tracking-[-0.01em] sm:text-lg">{row ? `Phiếu công tác ${formatPermitNumber(row)}` : "Chi tiết phiếu công tác"}</DialogTitle>
      <DialogDescription className="sr-only">Thông tin ghi sổ và lịch sử thay đổi của phiếu.</DialogDescription>
      {row && <>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <Status value={row.status} /><PermitFormat permit={row} />
          <span className="text-xs text-muted-foreground">{PERMIT_KINDS[row.kind]} · {PERMIT_UNITS[row.unit]}{row.position ? ` · ${row.position}` : ""} · {permitValue("workDate", row.workDate)}</span>
          {row.teamType === "CONTRACTOR" && <PermitProgress value={row.progress} />}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {paper && !["DRAFT", "CANCELLED"].includes(row.status) && <Button size="sm" className="h-8 text-xs" onClick={() => setPreviewing(true)}><FileText />Xem và in</Button>}
          {paper && <Button size="sm" variant="outline" className="h-8 text-xs" disabled={documentExport.isPending || ["DRAFT", "CANCELLED"].includes(row.status)} title={["DRAFT", "CANCELLED"].includes(row.status) ? "Cấp phiếu trước khi tải mẫu Word" : "Mẫu điền theo thông tin đã lưu; ô kiểm tra và chữ ký để trống"} onClick={downloadTemplate}><Download />{documentExport.isPending ? "Đang điền mẫu…" : "Xuất Word"}</Button>}
          {canExecute && !["DRAFT", "CLOSED", "CANCELLED"].includes(row.status) && !(row.teamType === "CONTRACTOR" && row.status === "ISSUED") && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setExecuting(true)}>{row.teamType === "INTERNAL" ? "Ghi nhận đóng phiếu" : "Cập nhật tiến độ"}</Button>}
          {canIssue && row.status === "DRAFT" && <Button size="sm" variant="destructive" className="h-8 text-xs" disabled={cancelDraft.isPending} onClick={() => void cancelDraftNow(row)}>{cancelDraft.isPending ? "Đang hủy…" : "Hủy nháp"}</Button>}
          {canIssue && !["CLOSED", "CANCELLED"].includes(row.status) && !(row.teamType === "CONTRACTOR" && row.status === "ACTIVE") && <Button size="sm" className="h-8 text-xs" onClick={() => onEdit(row)}>Chỉnh sửa / cấp phiếu<ArrowRight /></Button>}
          {isAdmin && <Button size="sm" variant="outline" className="h-8 border-red-200 text-xs text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => { setDeleteReason(""); setDeleting(true); }}><Trash2 />Xóa PCT</Button>}
        </div>
      </>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
    {query.isError ? <p role="alert" className="text-red-700">{query.error.message}</p> : !row ? <p role="status">Đang tải phiếu…</p> : <div className="space-y-4">
      {/* Nội dung công việc là thứ người tra đọc đầu tiên: cho nó một khối riêng, chữ to hơn phần còn lại. */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.03em] text-slate-500 dark:text-muted-foreground">{PERMIT_FIELD_LABELS.content}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-[15px] font-semibold leading-6 text-foreground">{row.content || "—"}</p>
        {row.location && <p className="mt-1.5 text-xs text-muted-foreground">{PERMIT_FIELD_LABELS.location}: <span className="font-medium text-foreground">{row.location}</span></p>}
      </div>
      {!paper && <NkvhLinkPanel key={`${row.id}-${row.version}-nkvh`} permit={row} canEdit={canIssue || canExecute} />}
      <ContractorSessions key={`${row.id}-${row.version}-sessions`} permit={row} canExecute={canExecute} />
      {previewing && <PermitDocumentPreview title={`Phiếu công tác ${formatPermitNumber(row)}`} load={() => apiDownload(`/api/work-permits/${encodeURIComponent(row.id)}/document`)} onClose={() => setPreviewing(false)} />}
      {executing && canExecute && <PermitExecutionDialog key={row.version} permit={row} onClose={() => setExecuting(false)} />}
      <PermitDetailFields row={row} />
      {paper && <details className="group"><summary className={summary}><span>Mối nguy và biện pháp an toàn ({row.safetyItems?.length ?? 0})</span><ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" /></summary><div className="mt-2 [&>section]:rounded-none [&>section]:border-0 [&>section]:p-0 [&>section>h3]:hidden"><PermitSafetyReadOnly value={row.safetyItems ?? []} /></div></details>}
      <details className="group"><summary className={summary}><span>Lịch sử cập nhật ({row._count.history})</span><ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" /></summary><div className="mt-2 [&>section>h3]:hidden"><PermitHistoryPanel key={`${row.id}-${row.version}-history`} permit={row} /></div></details>
    </div>}
    </div>
    {deleting && row && <Dialog open onOpenChange={v => { if (!v && !deletePermit.isPending) setDeleting(false); }}><DialogContent className="max-w-md">
      <DialogTitle>Xóa PCT {formatPermitNumber(row)}?</DialogTitle>
      <DialogDescription>Phiếu, các lần làm việc và lịch sử cập nhật sẽ bị xoá khỏi sổ. Nhật ký hệ thống vẫn lưu bản chụp đầy đủ kèm lý do; số phiếu được trả về để cấp lại theo luồng “cấp lại số đã hủy”. Nếu chỉ cần ghi nhận phiếu không thực hiện, hãy chuyển trạng thái “Đã hủy” thay vì xoá.</DialogDescription>
      <label className="block space-y-1.5 text-sm"><span className="font-medium">Lý do xoá *</span><textarea className={control} rows={3} maxLength={2000} value={deleteReason} autoFocus onChange={e => setDeleteReason(e.target.value)} placeholder="Ví dụ: nhập trùng với PCT 895/2026, ghi nhầm sổ Điện…" /></label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={deletePermit.isPending} onClick={() => setDeleting(false)}>Để sau</Button><Button type="button" variant="destructive" disabled={deletePermit.isPending || deleteReason.trim().length < 5} onClick={() => void deleteNow(row)}>{deletePermit.isPending ? "Đang xoá…" : "Xóa hẳn PCT"}</Button></div>
    </DialogContent></Dialog>}
  </DialogContent></Dialog>;
}
