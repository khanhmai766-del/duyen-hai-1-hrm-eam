"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, BarChart3, CheckCircle2, Clock3, Eye, FileCode2, History, Loader2, RefreshCw, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiMutate, apiUpload } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

type HistoryRecord = {
  id: string;
  fileNames: string[];
  month: number | null;
  year: number | null;
  dayFrom: number | null;
  dayTo: number | null;
  syncStatus: "SUCCESS" | "PARTIAL" | "FAILED" | "SAVED" | "UNKNOWN";
  syncMessage: string | null;
  resultCount: number;
  createdAt: string;
  expiresAt: string;
  createdBy: { name: string; position?: string | null };
  canDelete?: boolean;
  snapshot?: {
    days?: SyncDay[];
    result?: { results?: SyncRowResult[]; ok?: boolean; error?: string };
    comparisonRows?: ComparisonRow[];
    warnings?: string[];
    inferredYear?: number | null;
    filterFrom?: string;
    filterTo?: string;
  };
};

type SyncRowResult = { date?: string; row?: number; status?: string };
type SyncUnit = Record<string, string | number | null>;
type SyncDay = { date?: string; row?: number; S1?: SyncUnit; S2?: SyncUnit; NMND?: SyncUnit };
type ComparisonValues = { s1: number | null; s2: number | null; total: number | null; causeS1?: string; causeS2?: string };
type ComparisonRow = {
  day: number; month: number; year: number | null;
  a: ComparisonValues | null; p: ComparisonValues | null;
  diffS1: number | null; diffS1Pct: number | null;
  diffS2: number | null; diffS2Pct: number | null;
  diffTot: number | null; diffTotPct: number | null;
};
type ToolVersion = { id: string; fileName: string; contentHash: string; isActive: boolean; createdAt: string; uploadedBy: { name: string } };

type BridgeMessage = {
  type: "SHN_PPA_HEIGHT" | "SHN_PPA_SYNC_RESULT" | "SHN_PPA_SNAPSHOT" | "SHN_PPA_RESTORE_SUCCESS" | "SHN_PPA_RESTORE_ERROR";
  height?: number;
  days?: SyncDay[];
  result?: { results?: SyncRowResult[]; ok?: boolean; error?: string } | null;
  error?: string | null;
  fileNames?: string[];
  month?: number | null;
  year?: number | null;
  dayFrom?: number | null;
  dayTo?: number | null;
  comparisonRows?: ComparisonRow[];
  warnings?: string[];
  inferredYear?: number | null;
  filterFrom?: string;
  filterTo?: string;
  offsetTop?: number;
};

const STATUS = {
  SUCCESS: { label: "Đã đồng bộ", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" },
  PARTIAL: { label: "Một phần", className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  FAILED: { label: "Thất bại", className: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300" },
  SAVED: { label: "Chỉ lưu website", className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300" },
  UNKNOWN: { label: "Chưa rõ", className: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" },
} as const;

const formatNumber = (value: unknown): string => typeof value === "number"
  ? value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })
  : value == null || value === "" ? "—" : String(value);

const finiteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
};

function comparisonRowsFromLegacy(record: HistoryRecord): ComparisonRow[] {
  const cause = (unit?: SyncUnit) => {
    const text = typeof unit?.danhGia === "string" ? unit.danhGia.trim() : "";
    const separator = text.indexOf(" - ");
    return separator >= 0 ? text.slice(separator + 3).trim() : "";
  };
  const difference = (actual: number | null, ppa: number | null) => actual !== null && actual > 0 && ppa !== null && ppa > 0 ? actual - ppa : null;
  return (record.snapshot?.days ?? []).flatMap((item) => {
    const date = String(item.date ?? "");
    const iso = date.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    const short = date.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    let year = record.year, month = record.month, day: number | null = null;
    if (iso) { year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]); }
    else if (short) {
      year = Number(short[3]);
      if (record.month === Number(short[1])) { month = Number(short[1]); day = Number(short[2]); }
      else if (record.month === Number(short[2])) { month = Number(short[2]); day = Number(short[1]); }
      else { month = Number(short[1]); day = Number(short[2]); }
    }
    if (!day || !month) return [];
    const a: ComparisonValues = { s1: finiteNumber(item.S1?.shnThucTe), s2: finiteNumber(item.S2?.shnThucTe), total: finiteNumber(item.NMND?.shnThucTe) };
    const p: ComparisonValues = { s1: finiteNumber(item.S1?.shnPPA), s2: finiteNumber(item.S2?.shnPPA), total: finiteNumber(item.NMND?.shnPPA), causeS1: cause(item.S1), causeS2: cause(item.S2) };
    const diffS1 = difference(a.s1, p.s1), diffS2 = difference(a.s2, p.s2), diffTot = difference(a.total, p.total);
    return [{ day, month, year, a, p, diffS1, diffS1Pct: diffS1 !== null && p.s1 ? diffS1 / p.s1 : null, diffS2, diffS2Pct: diffS2 !== null && p.s2 ? diffS2 / p.s2 : null, diffTot, diffTotPct: diffTot !== null && p.total ? diffTot / p.total : null }];
  });
}

export default function ShnPpaToolPage({ isAdmin }: { isAdmin: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [frameHeight, setFrameHeight] = useState(900);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [detail, setDetail] = useState<HistoryRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [versions, setVersions] = useState<ToolVersion[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoryRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try { setHistory((await apiGet<HistoryRecord[]>("/api/shn-ppa-history")).data); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không tải được lịch sử"); }
    finally { setHistoryLoading(false); }
  }, []);

  const loadVersions = useCallback(async () => {
    if (!isAdmin) return;
    try { setVersions((await apiGet<ToolVersion[]>("/api/shn-ppa-tool")).data); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không tải được phiên bản HTML"); }
  }, [isAdmin]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  useEffect(() => {
    const receive = async (event: MessageEvent<BridgeMessage>) => {
      if (event.source !== iframeRef.current?.contentWindow || !event.data) return;
      if (event.data.type === "SHN_PPA_HEIGHT" && typeof event.data.height === "number") {
        setFrameHeight(Math.min(12000, Math.max(700, event.data.height)));
        return;
      }
      if (event.data.type === "SHN_PPA_RESTORE_SUCCESS") {
        setRestoringId(null);
        toast.success("Đã mở lại biểu đồ từ kết quả đã lưu");
        const iframe = iframeRef.current;
        if (iframe) window.scrollTo({ top: window.scrollY + iframe.getBoundingClientRect().top + (event.data.offsetTop ?? 0) - 88, behavior: "smooth" });
        return;
      }
      if (event.data.type === "SHN_PPA_RESTORE_ERROR") {
        setRestoringId(null);
        toast.error(event.data.error || "Không khôi phục được biểu đồ");
        return;
      }
      if (event.data.type === "SHN_PPA_SNAPSHOT") {
        if (!Array.isArray(event.data.days) || event.data.days.length === 0) {
          setSavingWebsite(false);
          toast.error(event.data.error || "Chưa có dữ liệu xem trước để lưu");
          return;
        }
        try {
          await apiMutate("/api/shn-ppa-history", "POST", {
            fileNames: event.data.fileNames ?? [], month: event.data.month, year: event.data.year,
            dayFrom: event.data.dayFrom, dayTo: event.data.dayTo, syncStatus: "SAVED",
            syncMessage: "Chỉ lưu kết quả trên website", resultCount: event.data.days.length,
            snapshot: { days: event.data.days, result: null, comparisonRows: event.data.comparisonRows ?? [], warnings: event.data.warnings ?? [], inferredYear: event.data.inferredYear, filterFrom: event.data.filterFrom, filterTo: event.data.filterTo, savedAt: new Date().toISOString() },
          });
          toast.success("Đã lưu kết quả trên website trong 30 ngày");
          await loadHistory();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Không lưu được kết quả trên website");
        } finally { setSavingWebsite(false); }
        return;
      }
      if (event.data.type !== "SHN_PPA_SYNC_RESULT" || !Array.isArray(event.data.days)) return;
      const results = event.data.result?.results ?? [];
      const okCount = results.filter((item) => item.status === "ok").length;
      const status: HistoryRecord["syncStatus"] = event.data.result?.ok === false || okCount === 0
        ? "FAILED" : okCount >= event.data.days.length ? "SUCCESS" : "PARTIAL";
      const message = event.data.result?.error || event.data.error ||
        (status === "SUCCESS" ? "Đồng bộ Google Sheet thành công" : "Có ngày đồng bộ chưa thành công");
      try {
        await apiMutate("/api/shn-ppa-history", "POST", {
          fileNames: event.data.fileNames ?? [], month: event.data.month, year: event.data.year,
          dayFrom: event.data.dayFrom, dayTo: event.data.dayTo, syncStatus: status,
          syncMessage: message, resultCount: event.data.days.length,
          snapshot: { days: event.data.days, result: event.data.result ?? { error: event.data.error }, comparisonRows: event.data.comparisonRows ?? [], warnings: event.data.warnings ?? [], inferredYear: event.data.inferredYear, filterFrom: event.data.filterFrom, filterTo: event.data.filterTo, savedAt: new Date().toISOString() },
        });
        toast.success("Đã lưu kết quả trên website trong 30 ngày");
        await loadHistory();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Không lưu được kết quả trên website");
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [loadHistory]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    try { setDetail((await apiGet<HistoryRecord>(`/api/shn-ppa-history?id=${encodeURIComponent(id)}`)).data); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không mở được kết quả"); }
    finally { setDetailLoading(false); }
  }

  async function restoreCharts(id: string) {
    setRestoringId(id);
    try {
      const record = (await apiGet<HistoryRecord>(`/api/shn-ppa-history?id=${encodeURIComponent(id)}`)).data;
      const storedRows = record.snapshot?.comparisonRows ?? [];
      const comparisonRows = storedRows.length ? storedRows : comparisonRowsFromLegacy(record);
      if (!comparisonRows.length) throw new Error("Bản lưu này không có dữ liệu để dựng lại biểu đồ");
      const toolWindow = iframeRef.current?.contentWindow;
      if (!toolWindow) throw new Error("Tiện ích chưa tải xong, vui lòng thử lại");
      toolWindow.postMessage({
        type: "SHN_PPA_RESTORE_RESULT",
        comparisonRows,
        warnings: storedRows.length ? record.snapshot?.warnings ?? [] : ["Bản lưu cũ được dựng lại từ dữ liệu xem trước; biểu đồ chỉ gồm các ngày đã lưu."],
        inferredYear: record.snapshot?.inferredYear ?? record.year,
        filterFrom: record.snapshot?.filterFrom ?? "",
        filterTo: record.snapshot?.filterTo ?? "",
      }, "*");
      window.setTimeout(() => setRestoringId((current) => {
        if (current === id) toast.error("Tiện ích không phản hồi yêu cầu mở biểu đồ");
        return current === id ? null : current;
      }), 8000);
    } catch (error) {
      setRestoringId(null);
      toast.error(error instanceof Error ? error.message : "Không mở lại được biểu đồ");
    }
  }

  async function deleteSavedResult() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await apiMutate(`/api/shn-ppa-history?id=${encodeURIComponent(deleteTarget.id)}`, "DELETE");
      setHistory((current) => current.filter((record) => record.id !== deleteTarget.id));
      setDeleteTarget(null);
      if (detail?.id === deleteTarget.id) setDetail(null);
      toast.success("Đã xóa kết quả đã lưu");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không xóa được kết quả");
    } finally { setDeletingId(null); }
  }

  async function uploadHtml(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData(); form.append("file", file);
      await apiUpload("/api/shn-ppa-tool", form);
      toast.success("Đã tải lên và kích hoạt phiên bản HTML mới");
      await loadVersions(); setFrameKey((value) => value + 1);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Cập nhật HTML thất bại"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function activateVersion(id: string) {
    setActivating(id);
    try {
      await apiMutate("/api/shn-ppa-tool", "PUT", { id });
      toast.success("Đã khôi phục phiên bản HTML");
      await loadVersions(); setFrameKey((value) => value + 1);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể kích hoạt phiên bản"); }
    finally { setActivating(null); }
  }

  function requestWebsiteSave() {
    setSavingWebsite(true);
    iframeRef.current?.contentWindow?.postMessage({ type: "SHN_PPA_REQUEST_SNAPSHOT" }, "*");
    window.setTimeout(() => setSavingWebsite((current) => {
      if (current) toast.error("Tiện ích không phản hồi yêu cầu lưu kết quả");
      return false;
    }), 8000);
  }

  return <div className="space-y-6 pb-10">
    <PageHeader title="So sánh SHN theo PPA" description="Nạp dữ liệu, đồng bộ Google Sheet và lưu kết quả trên website trong 30 ngày.">
      <Button variant="soft" size="toolbar" onClick={requestWebsiteSave} disabled={savingWebsite}>{savingWebsite ? <Loader2 className="animate-spin" /> : <Save />}Lưu kết quả trên website</Button>
      {isAdmin && <Button variant="soft" size="toolbar" onClick={() => { setVersionsOpen(true); void loadVersions(); }}><FileCode2 />Cập nhật tiện ích</Button>}
    </PageHeader>

    <Card className="overflow-hidden shadow-sm">
      <CardContent className="p-0">
        <iframe
          key={frameKey}
          ref={iframeRef}
          title="Công cụ so sánh SHN theo PPA"
          src="/api/shn-ppa-tool/content"
          sandbox="allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals"
          className="block w-full border-0 bg-[#f5f7fa] transition-[height] duration-200"
          style={{ height: frameHeight }}
        />
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div><CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-accent" />Lịch sử kết quả 30 ngày</CardTitle><CardDescription className="mt-1">Kết quả đồng bộ hoặc lưu thủ công có thể mở lại thành biểu đồ và xóa khi không còn cần.</CardDescription></div>
        <Button variant="outline" size="toolbar-icon" aria-label="Tải lại lịch sử" onClick={() => void loadHistory()} disabled={historyLoading}><RefreshCw className={cn(historyLoading && "animate-spin")} /></Button>
      </CardHeader>
      <CardContent>
        {historyLoading && !history.length ? <div className="flex h-24 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Đang tải lịch sử...</div>
        : !history.length ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground"><Archive className="mx-auto mb-3 h-8 w-8 opacity-60" />Chưa có kết quả nào trong 30 ngày gần đây.</div>
        : <div className="space-y-2">{history.map((record) => {
          const state = STATUS[record.syncStatus] ?? STATUS.UNKNOWN;
          const range = record.dayFrom && record.dayTo && record.month && record.year ? `${record.dayFrom}–${record.dayTo}/${record.month}/${record.year}` : "Khoảng ngày chưa xác định";
          return <div key={record.id} className="grid gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-sky-300 dark:hover:border-sky-700 sm:grid-cols-[1fr_1.25fr_auto] sm:items-center">
            <div><p className="font-semibold text-ink">{range}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{new Date(record.createdAt).toLocaleString("vi-VN")} · {record.createdBy.name}</p></div>
            <div className="min-w-0"><p className="truncate text-sm text-muted-foreground">{record.fileNames.join(" · ") || "Không có tên file nguồn"}</p><Badge variant="outline" className={cn("mt-2", state.className)}>{state.label} · {record.resultCount} ngày</Badge></div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button size="sm" onClick={() => void restoreCharts(record.id)} disabled={Boolean(restoringId)}>{restoringId === record.id ? <Loader2 className="animate-spin" /> : <BarChart3 />}Xem biểu đồ</Button>
              <Button variant="outline" size="sm" onClick={() => void openDetail(record.id)} disabled={detailLoading}><Eye />Chi tiết</Button>
              {record.canDelete && <Button variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40" onClick={() => setDeleteTarget(record)}><Trash2 />Xóa</Button>}
            </div>
          </div>;
        })}</div>}
      </CardContent>
    </Card>

    <Dialog open={Boolean(detail) || detailLoading} onOpenChange={(open) => { if (!open) setDetail(null); }}>
      <DialogContent className="max-h-[88vh] max-w-6xl overflow-y-auto">
        <DialogHeader><DialogTitle>Chi tiết kết quả SHN/PPA</DialogTitle><DialogDescription>{detail ? `${new Date(detail.createdAt).toLocaleString("vi-VN")} · ${detail.createdBy.name} · lưu đến ${new Date(detail.expiresAt).toLocaleDateString("vi-VN")}` : "Đang tải dữ liệu..."}</DialogDescription></DialogHeader>
        {detailLoading && !detail ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : detail && <HistoryDetail record={detail} />}
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deletingId) setDeleteTarget(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Xóa kết quả đã lưu?</DialogTitle><DialogDescription>Kết quả {deleteTarget?.dayFrom}–{deleteTarget?.dayTo}/{deleteTarget?.month}/{deleteTarget?.year} sẽ bị xóa khỏi lịch sử website và không thể khôi phục. Dữ liệu đã ghi trên Google Sheet không bị ảnh hưởng.</DialogDescription></DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={Boolean(deletingId)}>Hủy</Button>
          <Button variant="destructive" onClick={() => void deleteSavedResult()} disabled={Boolean(deletingId)}>{deletingId ? <Loader2 className="animate-spin" /> : <Trash2 />}Xóa kết quả</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Cập nhật file HTML tiện ích</DialogTitle><DialogDescription>Chỉ ADMIN có thể tải bản mới hoặc khôi phục phiên bản cũ. Bản mới được kích hoạt ngay mà không cần deploy website.</DialogDescription></DialogHeader>
        <div className="rounded-xl border border-dashed border-sky-300 bg-sky-50/60 p-5 text-center dark:border-sky-700 dark:bg-sky-950/20">
          <input ref={fileRef} type="file" accept=".html,text/html" className="hidden" onChange={(event) => void uploadHtml(event.target.files?.[0])} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="animate-spin" /> : <Upload />}Tải file HTML mới</Button>
          <p className="mt-2 text-xs text-muted-foreground">Tối đa 2 MB. Website lưu tối đa 30 phiên bản gần nhất trong danh sách.</p>
        </div>
        <div className="space-y-2">{versions.map((version) => <div key={version.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
          <FileCode2 className="h-5 w-5 text-accent" /><div className="min-w-0 flex-1"><p className="truncate font-medium text-ink">{version.fileName}</p><p className="text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleString("vi-VN")} · {version.uploadedBy.name} · {version.contentHash.slice(0, 10)}</p></div>
          {version.isActive ? <Badge className="bg-emerald-600"><CheckCircle2 />Đang dùng</Badge> : <Button variant="outline" size="sm" onClick={() => void activateVersion(version.id)} disabled={Boolean(activating)}>{activating === version.id ? <Loader2 className="animate-spin" /> : <RotateCcw />}Khôi phục</Button>}
        </div>)}</div>
      </DialogContent>
    </Dialog>
  </div>;
}

function HistoryDetail({ record }: { record: HistoryRecord }) {
  const days = record.snapshot?.days ?? [];
  const results = record.snapshot?.result?.results ?? [];
  const statusFor = (date?: string) => results.find((item) => item.date === date);
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900"><p className="text-xs font-semibold uppercase text-muted-foreground">Khoảng dữ liệu</p><p className="mt-1 font-bold text-ink">{record.dayFrom}–{record.dayTo}/{record.month}/{record.year}</p></div>
      <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900"><p className="text-xs font-semibold uppercase text-muted-foreground">Số ngày</p><p className="mt-1 font-bold text-ink">{record.resultCount}</p></div>
      <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900"><p className="text-xs font-semibold uppercase text-muted-foreground">Trạng thái</p><p className="mt-1 font-bold text-ink">{STATUS[record.syncStatus]?.label}</p></div>
    </div>
    <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-[#153b65] text-white"><tr><th className="p-3 text-left">Ngày</th><th className="p-3 text-right">SHN TT S1</th><th className="p-3 text-right">PPA S1</th><th className="p-3 text-right">SHN TT S2</th><th className="p-3 text-right">PPA S2</th><th className="p-3 text-right">SHN TT chung</th><th className="p-3 text-right">PPA chung</th><th className="p-3 text-left">Kết quả ghi Sheet</th></tr></thead><tbody>{days.map((day, index) => { const result=statusFor(day.date); return <tr key={`${day.date}-${index}`} className="border-t"><td className="p-3 font-medium">{day.date || "—"}</td><td className="p-3 text-right">{formatNumber(day.S1?.shnThucTe)}</td><td className="p-3 text-right">{formatNumber(day.S1?.shnPPA)}</td><td className="p-3 text-right">{formatNumber(day.S2?.shnThucTe)}</td><td className="p-3 text-right">{formatNumber(day.S2?.shnPPA)}</td><td className="p-3 text-right">{formatNumber(day.NMND?.shnThucTe)}</td><td className="p-3 text-right">{formatNumber(day.NMND?.shnPPA)}</td><td className="p-3">{record.syncStatus === "SAVED" ? "Chỉ lưu website" : result?.status === "ok" ? `Đã ghi hàng ${result.row}` : result?.status || "Không có phản hồi"}</td></tr>; })}</tbody></table></div>
    {record.syncStatus === "SAVED" && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">Bản kết quả này chỉ được lưu trên website, không gửi tới Google Sheet.</div>}
    <p className="text-xs text-muted-foreground">File nguồn: {record.fileNames.join(" · ") || "Không xác định"}</p>
  </div>;
}
