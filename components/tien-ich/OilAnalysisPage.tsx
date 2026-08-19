"use client";
// =====================================================================
// TRANG "KẾT QUẢ PHÂN TÍCH DẦU" (Tiện ích) — đọc MỘT CHIỀU từ LIMS
// (portal.tpcduyenhai.com.vn/lims.xhtml) qua tiện ích Chrome, cùng cơ chế
// cầu nối với đồng bộ tồn kho QLVT. App chỉ HIỂN THỊ; mọi ý kiến/xử lý vẫn
// nhập trực tiếp trên LIMS.
//
// Trục tổ chức của trang là TRẠNG THÁI TRẢ LỜI CỦA QLVH, không phải mẫu dầu:
// với PX Vận hành 1, việc cần làm là những phiếu Không Đạt mà QLVH chưa cho ý
// kiến. Vì vậy 3 thẻ đầu trang vừa là số liệu vừa là bộ lọc.
// Dữ liệu qua hooks/useOilAnalysis (TanStack Query).
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, ChevronDown, CloudDownload, ExternalLink,
  FlaskConical, Search, SlidersHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { normalizeText } from "@/lib/nav";
import { cn } from "@/lib/utils";
import {
  useImportOilAnalysisFromLims,
  useOilAnalysisFailures,
  useOilAnalysisSyncStatus,
  type LimsFailureRow,
  type OilAnalysisFailureItem,
  type OilAnalysisMeta,
} from "@/hooks/useOilAnalysis";

const LIMS_URL = "https://portal.tpcduyenhai.com.vn/lims.xhtml";
const TARGET_DON_VI = "PX Vận hành 1";
const TARGET_KHU_VUC = "Duyên Hải 1";
const DISCLOSURE_KEY = "lims-sync-disclosure-v1";
const DAY_OPTIONS = [7, 14, 30] as const;
const NEW_BADGE_WINDOW_MS = 72 * 60 * 60 * 1_000;
/** Giới hạn độ trễ hiệu ứng để danh sách dài không bị "chảy" quá lâu. */
const MAX_STAGGER_STEPS = 12;

const dayFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

type SyncStage = "idle" | "connecting" | "reading" | "saving";
type StatusFilter = "ALL" | "PENDING" | "ANSWERED";

type ExtensionResult = {
  ok: boolean;
  code?: string;
  message?: string;
  sourceUrl?: string;
  qlvtUrl?: string;
  sourceCount?: number;
  rows?: LimsFailureRow[];
};

const FILTERS: Array<{
  key: StatusFilter;
  label: string;
  hint: string;
  icon: typeof AlertTriangle;
  card: string;
  iconWrap: string;
  value: string;
}> = [
  {
    key: "ALL",
    label: "Mẫu Không Đạt",
    hint: "Tổng số phiếu trong kỳ",
    icon: FlaskConical,
    card: "border-slate-200 bg-[linear-gradient(135deg,#fff_15%,#f8fafc)]",
    iconWrap: "bg-slate-100 text-slate-600",
    value: "text-ink",
  },
  {
    key: "PENDING",
    label: "Chưa có ý kiến QLVH",
    hint: "Cần xử lý",
    icon: AlertTriangle,
    card: "border-rose-200 bg-[linear-gradient(135deg,#fff_15%,#fff1f2)]",
    iconWrap: "bg-rose-100 text-rose-600",
    value: "text-rose-700",
  },
  {
    key: "ANSWERED",
    label: "Đã có ý kiến QLVH",
    hint: "Đã phản hồi trên LIMS",
    icon: CheckCircle2,
    card: "border-emerald-200 bg-[linear-gradient(135deg,#fff_15%,#ecfdf5)]",
    iconWrap: "bg-emerald-100 text-emerald-600",
    value: "text-emerald-700",
  },
];

function isPending(item: OilAnalysisFailureItem) {
  return !item.ykienQlvh;
}

export default function OilAnalysisPage() {
  const [days, setDays] = useState<number>(14);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<SyncStage>("idle");
  const [syncIssue, setSyncIssue] = useState<{ code?: string; message: string; url?: string } | null>(null);
  const [showDisclosure, setShowDisclosure] = useState(false);

  const failuresQuery = useOilAnalysisFailures(days);
  const importFromLims = useImportOilAnalysisFromLims();

  // useMemo để mảng rỗng mặc định không tạo tham chiếu mới mỗi lần render.
  const items = useMemo(() => failuresQuery.data?.data ?? [], [failuresQuery.data]);
  // canSync lấy từ server (qua RBAC động) để phản ánh đúng phân quyền đã cấu hình.
  const canSync = (failuresQuery.data?.meta as OilAnalysisMeta | undefined)?.canSync ?? false;
  const syncing = stage !== "idle";

  const counts = useMemo(() => {
    const pending = items.filter(isPending).length;
    return { ALL: items.length, PENDING: pending, ANSWERED: items.length - pending };
  }, [items]);

  const visibleItems = useMemo(() => {
    const needle = normalizeText(search.trim());
    return items.filter((item) => {
      if (filter === "PENDING" && !isPending(item)) return false;
      if (filter === "ANSWERED" && isPending(item)) return false;
      if (!needle) return true;
      return [item.soPhieu, item.tenMau, item.danhGia, item.ykienPkt, item.ykienQlvh]
        .some((field) => normalizeText(field ?? "").includes(needle));
    });
  }, [items, filter, search]);

  function requestSync() {
    if (window.localStorage.getItem(DISCLOSURE_KEY) === "accepted") {
      void syncFromLims();
      return;
    }
    setShowDisclosure(true);
  }

  function acceptDisclosure() {
    window.localStorage.setItem(DISCLOSURE_KEY, "accepted");
    setShowDisclosure(false);
    void syncFromLims();
  }

  /** Tiện ích thông báo sẵn sàng bằng cùng một message với luồng QLVT. */
  function waitForExtension() {
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onReady);
        reject(new Error("Không tìm thấy tiện ích Đồng bộ. Hãy kiểm tra tiện ích đã được bật rồi tải lại trang này."));
      }, 2_000);
      function onReady(event: MessageEvent) {
        if (event.source !== window || event.data?.source !== "DUYENHAI1_EXTENSION" || event.data?.type !== "QLVT_EXTENSION_READY") return;
        window.clearTimeout(timeout);
        window.removeEventListener("message", onReady);
        resolve();
      }
      window.addEventListener("message", onReady);
      window.postMessage({ source: "DUYENHAI1_WEB", type: "QLVT_EXTENSION_PING" }, window.location.origin);
    });
  }

  async function syncFromLims() {
    if (syncing) return;
    setSyncIssue(null);
    setStage("connecting");
    const requestId = crypto.randomUUID();
    try {
      await waitForExtension();
      setStage("reading");
      const result = await new Promise<ExtensionResult>((resolve, reject) => {
        // Đặt lớp ngoài dài hơn thời gian chờ bridge và thao tác PrimeFaces để
        // nhận được mã lỗi cụ thể từ tiện ích thay vì cắt ngang.
        const timeout = window.setTimeout(() => {
          window.removeEventListener("message", onMessage);
          reject(new Error("LIMS phản hồi quá thời gian (trên 300 giây). Hãy tải lại trang LIMS, kiểm tra mạng công ty rồi thử lại."));
        }, 300_000);
        function onMessage(event: MessageEvent) {
          if (
            event.source !== window ||
            event.data?.source !== "DUYENHAI1_EXTENSION" ||
            event.data?.type !== "LIMS_SYNC_RESPONSE" ||
            event.data?.requestId !== requestId
          ) return;
          window.clearTimeout(timeout);
          window.removeEventListener("message", onMessage);
          resolve(event.data.result);
        }
        window.addEventListener("message", onMessage);
        window.postMessage(
          { source: "DUYENHAI1_WEB", type: "LIMS_SYNC_REQUEST", requestId, days, donVi: TARGET_DON_VI, khuVuc: TARGET_KHU_VUC },
          window.location.origin
        );
      });

      if (!result?.ok) {
        const message = result?.message || "Không lấy được dữ liệu từ LIMS";
        setSyncIssue({ code: result?.code, message, url: result?.sourceUrl ?? result?.qlvtUrl });
        // "Không có mẫu Không Đạt" là tin tốt, không phải lỗi.
        if (result?.code === "LIMS_NO_FAILURE") {
          toast.success(message);
          return;
        }
        throw new Error(message);
      }

      const rows = result.rows ?? [];
      if (!rows.length) throw new Error("LIMS không trả về mẫu Không Đạt nào");

      setStage("saving");
      const saved = await importFromLims.mutateAsync({ rows, sourceCount: result.sourceCount });
      toast.success(
        `Đã đọc ${result.sourceCount ?? rows.length} phiếu LIMS, ghi nhận ${saved.total} mẫu Không Đạt của ${TARGET_DON_VI}: ${saved.created} phiếu mới, ${saved.opinionChanged} phiếu đổi đánh giá/ý kiến.`
      );
      if (saved.errors.length) toast.warning(saved.errors.slice(0, 3).join("; "));
    } catch (error) {
      toast.error((error as Error).message || "Không đồng bộ được kết quả phân tích dầu");
    } finally {
      setStage("idle");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kết quả phân tích dầu"
        description={`Mẫu dầu Không Đạt của ${TARGET_DON_VI}, đọc một chiều từ LIMS. Ý kiến QLVH vẫn nhập trực tiếp trên LIMS.`}
      >
        <LimsSyncChip stage={stage} syncing={syncing || importFromLims.isPending} canSync={canSync} onSync={requestSync} />
        <Button variant="soft" size="toolbar" asChild>
          <a href={LIMS_URL} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" /> Mở LIMS
          </a>
        </Button>
      </PageHeader>

      {syncIssue && syncIssue.code !== "LIMS_NO_FAILURE" && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 font-medium leading-6">{syncIssue.message}</p>
          {syncIssue.url && (
            <Button variant="outline" size="sm" asChild>
              <a href={syncIssue.url} target="_blank" rel="noreferrer">Mở LIMS</a>
            </Button>
          )}
          <Button size="sm" disabled={syncing} onClick={() => void syncFromLims()}>Tiếp tục đồng bộ</Button>
        </div>
      )}

      {/* Thẻ số liệu kiêm bộ lọc: bấm vào thẻ là lọc theo đúng trạng thái đó. */}
      <div className="grid gap-4 sm:grid-cols-3">
        {FILTERS.map((meta) => {
          const Icon = meta.icon;
          const active = filter === meta.key;
          return (
            <button
              key={meta.key}
              type="button"
              onClick={() => setFilter(meta.key)}
              aria-pressed={active}
              className={cn(
                "group rounded-xl border p-4 text-left shadow-sm transition-all duration-200",
                meta.card,
                active
                  ? "border-accent/40 ring-2 ring-accent/25 shadow-md"
                  : "hover:-translate-y-0.5 hover:shadow-md"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className={cn("rounded-lg p-2 transition-transform duration-200 group-hover:scale-110", meta.iconWrap)}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className={cn("text-3xl font-black leading-none tabular-nums", meta.value)}>
                  {counts[meta.key]}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold text-ink">{meta.label}</p>
              <p className="text-xs font-medium text-muted-foreground">{meta.hint}</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-white p-1 shadow-sm">
          <SlidersHorizontal className="ml-2 mr-1 h-3.5 w-3.5 text-muted-foreground" />
          {DAY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                days === option ? "bg-accent text-white shadow-sm" : "text-muted-foreground hover:text-ink"
              )}
            >
              {option} ngày
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm số phiếu, tên mẫu, đánh giá, ý kiến…"
            className="pl-9"
          />
        </div>

        <p className="text-sm font-semibold text-muted-foreground">
          Hiển thị <span className="tabular-nums text-ink">{visibleItems.length}</span> phiếu
        </p>
      </div>

      {failuresQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-[132px] animate-pulse rounded-xl border border-border bg-white" />
          ))}
        </div>
      ) : !visibleItems.length ? (
        <EmptyState hasItems={items.length > 0} filter={filter} days={days} />
      ) : (
        <div className="space-y-3">
          {visibleItems.map((item, index) => (
            <FailureCard key={item.id} item={item} index={index} />
          ))}
        </div>
      )}

      <Dialog open={showDisclosure} onOpenChange={(open) => { if (!open) setShowDisclosure(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Đồng bộ kết quả phân tích dầu từ LIMS</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Tiện ích sẽ mở (hoặc dùng lại) tab LIMS đã đăng nhập của bạn, đặt khoảng thời gian
              {" "}<b className="text-ink">{days} ngày</b> gần nhất tại mục <b className="text-ink">Kết quả phân tích Dầu</b>,
              rồi đọc các mẫu <b className="text-ink">Không Đạt</b> của <b className="text-ink">{TARGET_DON_VI}</b>.
            </p>
            <p>
              Tiện ích <b className="text-ink">không</b> đọc hoặc chuyển cookie, mật khẩu, token sang PXVH1, và
              <b className="text-ink"> không ghi bất kỳ dữ liệu nào lên LIMS</b>. Chỉ các trường hiển thị trên bảng
              danh sách được lưu về: số phiếu, tên mẫu, ngày lấy mẫu, đánh giá, ý kiến PKT/QLVH, ngày trả kết quả.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisclosure(false)}>Huỷ</Button>
            <Button onClick={acceptDisclosure}>Tôi đồng ý, đồng bộ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ hasItems, filter, days }: { hasItems: boolean; filter: StatusFilter; days: number }) {
  const allAnswered = hasItems && filter === "PENDING";
  const message = !hasItems
    ? `Chưa có mẫu Không Đạt nào trong ${days} ngày gần nhất. Bấm “Đồng bộ từ LIMS” để cập nhật.`
    : allAnswered
      ? "Tất cả phiếu trong kỳ đều đã có ý kiến QLVH."
      : filter === "ANSWERED"
        ? "Chưa phiếu nào trong kỳ có ý kiến QLVH."
        : "Không có phiếu nào khớp từ khoá tìm kiếm.";

  return (
    <div className="rounded-xl border border-dashed border-border bg-white/60 px-6 py-14 text-center">
      <div className={cn(
        "mx-auto mb-4 w-fit rounded-full p-3",
        allAnswered ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
      )}>
        {allAnswered ? <CheckCircle2 className="h-6 w-6" /> : <FlaskConical className="h-6 w-6" />}
      </div>
      <p className="text-sm font-semibold text-ink">{message}</p>
    </div>
  );
}

/** Mỗi phiếu là một thẻ có thanh màu bên trái: hồng = QLVH chưa cho ý kiến,
 *  xanh = đã có. Ba ô đọc bên dưới giữ đúng các cột của LIMS. */
function FailureCard({ item, index }: { item: OilAnalysisFailureItem; index: number }) {
  const pending = isPending(item);
  const isNew = Date.now() - new Date(item.firstSeenAt).getTime() < NEW_BADGE_WINDOW_MS;

  return (
    <article
      className={cn(
        // fill-mode backwards là BẮT BUỘC khi có animation-delay: keyframe fade-in
        // bắt đầu từ opacity 0, không có nó thẻ sẽ hiện đầy rồi mới nhảy về 0 để
        // fade — thấy rõ một nhịp giật. motion-reduce tắt hẳn hiệu ứng.
        "animate-fade-in [animation-fill-mode:backwards] motion-reduce:animate-none",
        "overflow-hidden rounded-xl border border-l-4 border-border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        pending ? "border-l-rose-500" : "border-l-emerald-500"
      )}
      style={{ animationDelay: `${Math.min(index, MAX_STAGGER_STEPS) * 35}ms` }}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 bg-slate-50/60 px-4 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Phiếu</span>
        <span className="font-bold tabular-nums text-ink">{item.soPhieu}</span>
        {isNew && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
            Mới
          </span>
        )}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            pending ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
          )}
        >
          {pending ? "Chờ ý kiến QLVH" : "Đã có ý kiến QLVH"}
        </span>

        <span className="ml-auto flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span>Lấy mẫu {item.ngayLayMau ? dayFmt.format(new Date(item.ngayLayMau)) : "—"}</span>
          <span aria-hidden className="text-border">→</span>
          <span>Trả KQ {item.ngayTraKq ? dateTimeFmt.format(new Date(item.ngayTraKq)) : "—"}</span>
        </span>
      </header>

      <div className="px-4 py-3">
        <h3 className="text-base font-bold leading-6 text-ink">{item.tenMau}</h3>

        <dl className="mt-3 grid gap-x-6 gap-y-3 lg:grid-cols-3">
          <Readout label="Đánh giá" value={item.danhGia} />
          <Readout label="Ý kiến PKT" value={item.ykienPkt} />
          <Readout label="Ý kiến QLVH" value={item.ykienQlvh} emptyText="Chưa có ý kiến" emphasizeEmpty />
        </dl>
      </div>
    </article>
  );
}

function Readout({
  label,
  value,
  emptyText = "—",
  emphasizeEmpty = false,
}: {
  label: string;
  value: string | null;
  emptyText?: string;
  emphasizeEmpty?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-sm leading-6",
          value ? "text-ink" : emphasizeEmpty ? "font-semibold text-rose-600" : "text-muted-foreground"
        )}
      >
        {value ?? emptyText}
      </dd>
    </div>
  );
}

function LimsSyncChip({
  stage,
  syncing,
  canSync,
  onSync,
}: {
  stage: SyncStage;
  syncing: boolean;
  canSync: boolean;
  onSync: () => void;
}) {
  const statusQuery = useOilAnalysisSyncStatus();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const runs = statusQuery.data?.data ?? [];
  const run = runs[0];
  // Kết quả phân tích dầu về theo ngày, nên "cũ" tính theo mốc 24 giờ.
  const stale = run ? now - new Date(run.syncedAt).getTime() >= 24 * 60 * 60 * 1_000 : false;
  const label = syncing
    ? stage === "connecting" ? "Đang kết nối…" : stage === "reading" ? "Đang đọc LIMS…" : "Đang lưu…"
    : !run ? "Chưa đồng bộ" : stale ? "Cần đồng bộ" : "Đã đồng bộ";
  const dotTone = syncing ? "bg-sky-500" : !run ? "bg-slate-300" : stale ? "bg-amber-500" : "bg-emerald-500";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold text-ink shadow-sm transition-colors",
            open ? "border-accent ring-2 ring-accent/15" : "border-border hover:border-muted-foreground/30"
          )}
          title="Xem trạng thái đồng bộ kết quả phân tích dầu từ LIMS"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            {syncing && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-70" />}
            <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotTone)} />
          </span>
          {label}
          {run && <span className="font-medium text-muted-foreground">{dateFmt.format(new Date(run.syncedAt))}</span>}
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[380px] p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-ink">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", dotTone)} />
          {!run ? "Chưa có lần đồng bộ nào" : stale ? "Dữ liệu đã quá 24 giờ" : "Đồng bộ thành công"}
        </div>
        {run && (
          <div className="mt-1.5 text-xs leading-5 text-muted-foreground">
            LIMS → DH1 · {dateTimeFmt.format(new Date(run.syncedAt))}
            <br />
            {run.syncedBy}{run.position ? ` · ${run.position}` : ""}
            {run.detail && <><br />{run.detail}</>}
          </div>
        )}
        <Button
          className="mt-3 w-full"
          disabled={syncing || statusQuery.isLoading || !canSync}
          onClick={() => { setOpen(false); onSync(); }}
        >
          <CloudDownload className="h-4 w-4" /> Đồng bộ từ LIMS
        </Button>
        {!canSync && (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Bạn chưa được cấp quyền đồng bộ kết quả phân tích dầu. Quản trị cấp quyền này ở trang Phân quyền, mục
            Tiện ích. Bạn vẫn xem được danh sách.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
