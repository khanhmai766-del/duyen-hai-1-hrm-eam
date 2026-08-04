"use client";

import * as React from "react";
import { AlertTriangle, Check, Clock3, Copy, Flame, Printer, Search, Wind, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  CHIP_LABELS,
  deriveDisplay,
  entryTimestamp,
  formatSpan,
  parseSeparationLog,
  parseTimelineJson,
  reviewNote,
  sortEntries,
  TIMELINE_SECTIONS,
  TIMELINE_SECTION_ORDER,
  valueMatcher,
  type TimelineChip,
  type TimelineDisplay,
  type TimelineSection,
} from "@/lib/separation-timeline";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Tông màu — bám đúng bảng màu của bản mẫu:                           *
 * lò hơi #C0392B · tuabin #0E6E8C · điện #B87400 · nền EVN #00558F    *
 * ------------------------------------------------------------------ */
const TONE: Record<TimelineSection, { node: string; tab: string; icon: typeof Flame }> = {
  boiler: { node: "border-[#C0392B]", tab: "text-[#C0392B]", icon: Flame },
  turbine: { node: "border-[#0E6E8C]", tab: "text-[#0E6E8C]", icon: Wind },
  elec: { node: "border-[#B87400]", tab: "text-[#B87400]", icon: Zap },
};

const CHIP_TONE: Record<TimelineChip, string> = {
  trip: "bg-[#FCEDEB] text-[#C0392B]",
  pct: "bg-[#FDF4E3] text-[#B87400]",
  cmd: "bg-[#EAF3FA] text-[#00558F]",
  ok: "bg-[#E6F5EE] text-[#0E8A5F]",
};

/** Cột "chưa rõ phần" chỉ hiện khi thật sự có mốc chưa phân loại. */
const UNKNOWN = "unknown" as const;
type Tab = TimelineSection | typeof UNKNOWN;

type Item = {
  key: string;
  section: Tab;
  date: string;
  time: string;
  actor: string | null;
  isKey: boolean;
  needsReview: boolean;
  note?: string;
  display: TimelineDisplay;
  haystack: string;
};

/**
 * Khối mở đầu của panel chi tiết: tên thư mục · tổ máy, dòng chỉ số thời gian,
 * và nút mở popup dòng thời gian ở góc phải — đúng bố cục bản mẫu.
 */
export function SeparationTimelineView({
  progress,
  timelineJson,
  defaultDate,
  label = "Tiến trình tách lưới",
  title,
  unit,
  recordedAt,
  updatedBy,
}: {
  progress?: string | null;
  timelineJson?: string | null;
  defaultDate?: string | Date | null;
  /** "Tiến trình tách lưới" hoặc "Tiến trình khởi động". */
  label?: string;
  /** Tên thư mục, hiện trên đầu popup. */
  title?: string | null;
  /** Tổ máy. */
  unit?: string | null;
  /** Ngày ghi nhận (giá trị thô); trống thì lấy mốc đầu của tiến trình. */
  recordedAt?: string | Date | null;
  updatedBy?: string | null;
}) {
  const [open, setOpen] = React.useState(false);

  const { items, fromRaw, reviewCount } = React.useMemo(() => {
    const build = (
      key: string,
      section: Tab,
      date: string,
      time: string,
      actor: string | null,
      content: string,
      isKey: boolean,
      needsReview: boolean,
      note?: string
    ): Item => {
      const display = deriveDisplay(content);
      return {
        key,
        section,
        date,
        time,
        actor,
        isKey,
        needsReview,
        note,
        display,
        haystack: [content, actor ?? ""].join(" ").toLowerCase(),
      };
    };

    const saved = parseTimelineJson(timelineJson);
    if (saved.length) {
      return {
        fromRaw: false,
        reviewCount: 0,
        items: sortEntries(saved).map((e, i) =>
          build(`s${i}`, e.section, e.date, e.time, e.actor || null, e.content, e.key, false)
        ),
      };
    }

    if (!progress?.trim()) return { items: [] as Item[], fromRaw: false, reviewCount: 0 };

    const parsed = parseSeparationLog(progress, {
      defaultDate: defaultDate ?? null,
      defaultYear: defaultDate ? new Date(defaultDate).getFullYear() : undefined,
    });
    return {
      fromRaw: true,
      reviewCount: parsed.stats.needsReview,
      items: parsed.events.map((e) =>
        build(
          `p${e.seq}`,
          e.section ?? UNKNOWN,
          e.dateText,
          e.timeText,
          e.actor,
          e.content + (e.subItems.length ? "\n" + e.subItems.join("\n") : ""),
          e.isKey,
          e.needsReview,
          e.needsReview ? reviewNote(e) : undefined
        )
      ),
    };
  }, [progress, timelineJson, defaultDate]);

  const heading = [title || label, unit ? `Tổ máy ${unit}` : null].filter(Boolean).join(" · ");

  // Không bóc được mốc nào — vẫn hiện tiêu đề và nguyên văn bản gốc, tuyệt đối không giấu.
  if (!items.length) {
    return (
      <div>
        <Heading text={heading} />
        {progress?.trim() ? (
          <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{progress}</p>
        ) : (
          <p className="mt-1 text-[12.5px] text-muted-foreground">Chưa nhập {label.toLowerCase()}.</p>
        )}
      </div>
    );
  }

  const stamps = items.map((i) => entryTimestamp(i)).filter((t): t is number => t != null);
  const first = stamps.length ? Math.min(...stamps) : null;
  const last = stamps.length ? Math.max(...stamps) : null;

  // "Tổng" phải tính từ đúng mốc đang hiển thị bên trái, nếu không thì ba con số
  // trên cùng một dòng cộng không khớp nhau và người đọc mất tin ngay.
  const recorded = recordedAt ? new Date(recordedAt) : null;
  const recordedMs = recorded && !Number.isNaN(recorded.getTime()) ? recorded.getTime() : null;
  const start = recordedMs ?? first;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <Heading text={heading} />
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12.5px] text-muted-foreground">
          {recordedMs != null ? (
            <span>Ghi nhận {fmtStamp(recordedMs, true)}</span>
          ) : (
            first != null && <span>Bắt đầu {fmtStamp(first, true)}</span>
          )}
          {last != null && <span>· Kết thúc theo dõi {fmtStamp(last, true)}</span>}
          {start != null && last != null && last > start && <span>· Tổng {formatSpanLong(last - start)}</span>}
          {fromRaw && reviewCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FDF4E3] px-2 py-0.5 font-sans text-[11.5px] font-semibold text-[#B87400]">
              <AlertTriangle className="h-3 w-3" /> {reviewCount} mốc cần soát
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-2.5 rounded-[9px] bg-gradient-to-b from-[#00558F] to-[#00426F] px-[15px] py-2.5 text-[13.5px] font-semibold text-white shadow-[0_1px_2px_rgba(0,60,100,.3),0_10px_22px_-12px_rgba(0,60,100,.8)] transition hover:-translate-y-px hover:shadow-[0_2px_4px_rgba(0,60,100,.3),0_16px_28px_-14px_rgba(0,60,100,.9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#00558F]"
      >
        <Clock3 className="h-4 w-4" />
        Xem {label.toLowerCase()}
        <span className="rounded-full bg-white/20 px-[7px] py-0.5 font-mono text-[11.5px] font-medium">
          {items.length} mốc
        </span>
      </button>

      <TimelineDialog
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        label={label}
        title={title}
        unit={unit}
        updatedBy={updatedBy}
        fromRaw={fromRaw}
        first={first}
        last={last}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Popup tiến trình                                                    *
 * ------------------------------------------------------------------ */

function TimelineDialog({
  open,
  onClose,
  items,
  label,
  title,
  unit,
  updatedBy,
  fromRaw,
  first,
  last,
}: {
  open: boolean;
  onClose: () => void;
  items: Item[];
  label: string;
  title?: string | null;
  unit?: string | null;
  updatedBy?: string | null;
  fromRaw: boolean;
  first: number | null;
  last: number | null;
}) {
  const tabs = React.useMemo(() => {
    const list: Tab[] = TIMELINE_SECTION_ORDER.filter((s) => items.some((i) => i.section === s));
    // Mốc chưa phân loại vẫn phải xem được — thêm cột phụ thay vì bỏ đi.
    if (items.some((i) => i.section === UNKNOWN)) list.push(UNKNOWN);
    return list.length ? list : [TIMELINE_SECTION_ORDER[0]];
  }, [items]);

  const [tab, setTab] = React.useState<Tab>(tabs[0]);
  const [find, setFind] = React.useState("");
  const bodyRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) {
      setTab(tabs[0]);
      setFind("");
    }
  }, [open, tabs]);

  const needle = find.trim().toLowerCase();
  const inTab = items.filter((i) => i.section === tab);
  const shown = needle ? inTab.filter((i) => i.haystack.includes(needle)) : inTab;

  React.useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [tab]);

  const days = groupByDay(shown);
  const keyItem = items.find((i) => i.isKey);
  const [copied, setCopied] = React.useState(false);

  function copySection() {
    const text = inTab
      .map((i) => {
        const head = `${i.date} ${i.time}  ${i.actor ? i.actor + ": " : ""}${i.display.main}`;
        return [head, ...i.display.subItems.map((s) => "   - " + s)].join("\n");
      })
      .join("\n");
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  // In: ẩn toàn bộ trang, chỉ chừa popup (quy tắc @media print nằm trong globals.css).
  function print() {
    document.body.classList.add("printing-timeline");
    const clean = () => document.body.classList.remove("printing-timeline");
    window.addEventListener("afterprint", clean, { once: true });
    window.print();
    window.setTimeout(clean, 1000);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "timeline-print flex h-[min(88vh,880px)] w-[min(1000px,100%)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-[14px]",
          "[&>button]:right-5 [&>button]:top-[18px] [&>button]:z-10 [&>button]:rounded-lg [&>button]:border [&>button]:border-white/20 [&>button]:bg-white/10 [&>button]:p-2 [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100"
        )}
      >
        {/* ----- Đầu popup ----- */}
        <div className="flex-none bg-gradient-to-b from-[#00426F] to-[#00558F] px-5 pt-4 text-white">
          <div className="pr-10">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[#8FC0DE]">
              {label}
              {unit ? ` · Tổ máy ${unit}` : ""}
            </div>
            <DialogTitle className="mt-0.5 text-[22px] font-bold uppercase leading-[1.1] text-white">
              {title || label}
            </DialogTitle>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[#BFDCEE]">
              {first != null && (
                <span>
                  Bắt đầu <b className="font-mono font-medium text-white">{fmtStamp(first)}</b>
                </span>
              )}
              {keyItem && (
                <span>
                  Mốc chính <b className="font-mono font-medium text-white">{keyItem.time}</b>
                </span>
              )}
              {last != null && (
                <span>
                  Kết thúc <b className="font-mono font-medium text-white">{fmtStamp(last)}</b>
                </span>
              )}
              {first != null && last != null && last > first && (
                <span>
                  Tổng <b className="font-mono font-medium text-white">{formatSpan(last - first)}</b>
                </span>
              )}
            </div>
          </div>

          {/* ----- Thanh chuyển 3 phần ----- */}
          <div className="mt-3.5 flex gap-0.5" role="tablist">
            {tabs.map((t) => {
              const active = t === tab;
              const tone = t === UNKNOWN ? null : TONE[t];
              const Icon = tone?.icon ?? AlertTriangle;
              const n = items.filter((i) => i.section === t).length;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex-1 rounded-t-[9px] px-3 pb-3 pt-2.5 text-left transition-colors",
                    active ? "bg-white" : "bg-white/[0.07] text-[#BFDCEE] hover:bg-white/[0.14] hover:text-white",
                    active && (tone ? tone.tab : "text-slate-600")
                  )}
                >
                  <span className="flex items-center gap-2 text-[14px] font-bold uppercase tracking-[0.06em]">
                    <Icon className="h-4 w-4 shrink-0" />
                    {t === UNKNOWN ? "Chưa rõ phần" : `Phần ${TIMELINE_SECTIONS[t].toLowerCase()}`}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] opacity-80">{n} mốc</span>
                  <span className={cn("mt-1.5 block h-[3px] rounded-sm bg-current", active ? "opacity-100" : "opacity-40")} />
                </button>
              );
            })}
          </div>
        </div>

        {/* ----- Thanh công cụ ----- */}
        <div className="no-print flex flex-none flex-wrap items-center justify-between gap-3 border-b border-border bg-slate-50 px-5 py-2.5">
          <span className="text-[12.5px] text-muted-foreground">
            {needle ? (
              <>
                <b className="font-mono text-ink">{shown.length}</b>/{inTab.length} mốc khớp từ khoá
              </>
            ) : (
              <>
                <b className="font-mono text-ink">{inTab.length}</b> mốc · {days.length} ngày
              </>
            )}
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Tìm trong tiến trình..."
              className="w-[230px] rounded-[7px] border border-input bg-white py-1.5 pl-8 pr-2.5 text-[13px] text-ink outline-none focus:border-[#00558F] focus:ring-1 focus:ring-[#00558F]"
            />
          </div>
        </div>

        {/* ----- Dòng thời gian ----- */}
        <div ref={bodyRef} className="timeline-scroll flex-1 overflow-y-auto px-5 pb-6 pt-1.5">
          {!shown.length ? (
            <p className="py-11 text-center text-[13.5px] text-muted-foreground">
              {needle ? `Không có mốc nào khớp với từ khoá “${find}”.` : "Phần này chưa có mốc nào."}
            </p>
          ) : (
            days.map(([day, list]) => (
              <div key={day}>
                {/* Nền dùng token `background` chứ không phải trắng cứng — popup này
                    cũng chạy ở chế độ tối. */}
                <div className="sticky top-0 z-[3] bg-gradient-to-b from-background via-background/95 to-transparent pb-2 pt-3.5">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-slate-100 px-2.5 py-0.5 text-[13px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    {day || "Chưa có ngày"}
                    <em className="font-mono text-[11px] not-italic opacity-80">{list.length} mốc</em>
                  </span>
                </div>
                <ol className="relative pl-7 sm:pl-[104px]">
                  <span
                    aria-hidden="true"
                    className="absolute left-[10px] top-1 bottom-1 w-0.5 bg-border sm:left-[88px]"
                  />
                  {list.map((it) => (
                    <Event key={it.key} item={it} find={needle} />
                  ))}
                </ol>
              </div>
            ))
          )}
        </div>

        {/* ----- Chân popup ----- */}
        <div className="no-print flex flex-none flex-wrap items-center justify-between gap-3 border-t border-border bg-slate-50 px-5 py-2.5">
          <span className="text-[12px] text-muted-foreground">
            {fromRaw ? "Nguồn: bản bóc tách tự động từ văn bản gốc" : "Nguồn: nhật ký vận hành ca"}
            {updatedBy ? ` · Cập nhật bởi ${updatedBy}` : ""}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copySection}
              className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-white px-3 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-ink"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[#0E8A5F]" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Đã sao chép" : "Sao chép nội dung"}
            </button>
            <button
              type="button"
              onClick={print}
              className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-white px-3 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-ink"
            >
              <Printer className="h-3.5 w-3.5" /> In tiến trình
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Một mốc trên dòng thời gian                                         *
 * ------------------------------------------------------------------ */

function Event({ item, find }: { item: Item; find: string }) {
  const tone = item.section === UNKNOWN ? null : TONE[item.section];
  const { main, subItems, measurements, chip } = item.display;

  return (
    <li className={cn("relative list-none py-2.5", item.needsReview && "-mx-2 rounded-lg bg-[#FDF4E3]/70 px-2")}>
      <span
        className={cn(
          "mb-0.5 block font-mono text-[12.5px] font-medium text-[#00558F] sm:absolute sm:-left-[104px] sm:top-2.5 sm:mb-0 sm:w-[78px] sm:text-right sm:text-muted-foreground"
        )}
      >
        {item.time}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "absolute -left-[23px] top-3 h-[11px] w-[11px] rounded-full border-[2.5px] bg-white sm:-left-[21px] sm:top-3.5",
          tone ? tone.node : "border-slate-400",
          item.isKey && "h-[15px] w-[15px] border-[3px] shadow-[0_0_0_5px_rgba(192,57,43,.14)] sm:-left-[23px] sm:top-3"
        )}
      />

      <div className={cn("text-[14px] leading-relaxed text-ink", item.isKey && "font-semibold")}>
        {chip && (
          <span
            className={cn(
              "mr-[7px] inline-block rounded px-[7px] align-[2px] text-[12px] font-bold uppercase tracking-[0.08em]",
              CHIP_TONE[chip]
            )}
          >
            {CHIP_LABELS[chip]}
          </span>
        )}
        {item.actor && (
          <span className="mr-[7px] inline-block text-[11.5px] font-semibold uppercase tracking-[0.03em] text-muted-foreground">
            {item.actor}
          </span>
        )}
        <Rich text={main} find={find} />
      </div>

      {subItems.length > 0 && (
        <ul className="mt-1.5 space-y-1.5">
          {subItems.map((s, i) => (
            <li key={i} className="relative pl-4 text-[13.5px] leading-[1.55] text-muted-foreground">
              <span aria-hidden="true" className="absolute left-0.5 top-[9px] h-[5px] w-[5px] rounded-[1px] bg-slate-400" />
              <Rich text={s} find={find} />
            </li>
          ))}
        </ul>
      )}

      {measurements.map((m, i) => (
        <MeasurementTable key={i} caption={m.caption} rows={m.rows} />
      ))}

      {item.needsReview && item.note && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] font-semibold text-[#B87400]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {item.note}
        </p>
      )}
    </li>
  );
}

function MeasurementTable({ caption, rows }: TimelineDisplay["measurements"][number]) {
  // Tiêu đề cột lấy theo hàng đầu ("R15", "R60", "Lần 1"…) — mỗi bảng đo một kiểu.
  const cols = rows[0]?.cells.map((c) => c.key) ?? [];
  return (
    <div className="mt-2.5 overflow-x-auto rounded-[9px] border border-border bg-white">
      <div className="border-b border-border bg-slate-50 px-3 py-2 text-[14px] font-bold uppercase tracking-[0.08em] text-ink">
        {caption}
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <th className="border-b border-border bg-slate-50/70 px-3 py-1.5 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Cặp đo
            </th>
            {cols.map((c) => (
              <th
                key={c}
                className="w-[110px] border-b border-border bg-slate-50/70 px-3 py-1.5 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              <td className="border-r border-border px-3 py-1.5 text-ink">{r.label}</td>
              {r.cells.map((c, j) => (
                <td key={j} className="whitespace-nowrap border-r border-border px-3 py-1.5 text-right font-mono text-[#003A63] last:border-0">
                  {c.value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tô nổi trị số kỹ thuật + từ khoá tìm kiếm                           *
 * ------------------------------------------------------------------ */

function Rich({ text, find }: { text: string; find: string }) {
  const parts: React.ReactNode[] = [];
  const re = valueMatcher();
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;

  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(<Marked key={k++} text={text.slice(last, m.index)} find={find} />);
    parts.push(
      <span
        key={k++}
        className="whitespace-nowrap rounded border border-border bg-slate-100 px-1 font-mono text-[13px] text-[#003A63]"
      >
        {m[0].trim()}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<Marked key={k++} text={text.slice(last)} find={find} />);
  return <>{parts}</>;
}

function Marked({ text, find }: { text: string; find: string }) {
  if (!find) return <>{text}</>;
  const out: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  let k = 0;
  for (;;) {
    const at = lower.indexOf(find, from);
    if (at < 0) break;
    if (at > from) out.push(text.slice(from, at));
    out.push(
      <mark key={k++} className="rounded-sm bg-[#FFE9A8] px-0.5 text-inherit">
        {text.slice(at, at + find.length)}
      </mark>
    );
    from = at + find.length;
  }
  out.push(text.slice(from));
  return <>{out}</>;
}

/* ------------------------------------------------------------------ *
 * Tiện ích                                                            *
 * ------------------------------------------------------------------ */

function groupByDay(items: Item[]): Array<[string, Item[]]> {
  const days: Array<[string, Item[]]> = [];
  for (const it of items) {
    const bucket = days[days.length - 1];
    if (bucket && bucket[0] === it.date) bucket[1].push(it);
    else days.push([it.date, [it]]);
  }
  return days;
}

function Heading({ text }: { text: string }) {
  return <h3 className="text-[20px] font-bold uppercase leading-tight tracking-[0.02em] text-ink">{text}</h3>;
}

/** "51 giờ 10 phút" — dạng dài, dùng ở panel chi tiết cho dễ đọc. */
function formatSpanLong(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} phút`;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

/** "07/07 09:04" — trong popup đã có tiêu đề ngày nên bỏ năm; panel chi tiết ghi đủ. */
function fmtStamp(ms: number, withYear = false): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  const day = `${p(d.getDate())}/${p(d.getMonth() + 1)}${withYear ? "/" + d.getFullYear() : ""}`;
  return `${day} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
